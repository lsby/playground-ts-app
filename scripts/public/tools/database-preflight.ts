import { NodeSSH } from 'node-ssh'
import * as path from 'path'
import { 日志类 } from './model'
import {
  Compose服务镜像快照,
  恢复Compose服务镜像,
  执行远程命令,
  检查Compose服务是否运行中,
  等待Compose应用就绪,
  转义PosixShell参数,
} from './tools'

export type 执行数据库预演与准备参数 = {
  sshClient: NodeSSH
  日志: 日志类
  环境: string
  远程运行目录: string
  docker文件目录: string
  项目名称: string
  compose命令: string
  相对环境文件: string
}

export type 数据库预演与准备结果 = {
  数据库备份: { 备份路径: string; 数据库路径: string } | null
  旧服务运行中: boolean
}

export async function 执行数据库预演与准备(参数: 执行数据库预演与准备参数): Promise<数据库预演与准备结果> {
  let { sshClient, 日志, 环境, 远程运行目录, docker文件目录, 项目名称, compose命令, 相对环境文件 } = 参数
  let 数据库文件名 = 环境 === 'production' ? 'prod-web.db' : 'dev-web.db'
  let 远程数据库路径 = path.posix.join(远程运行目录, 'db', 数据库文件名)
  let 远程数据库检查结果 = await 执行远程命令(
    sshClient,
    `if [ -f ${转义PosixShell参数(远程数据库路径)} ]; then printf 'exists'; elif [ ! -e ${转义PosixShell参数(远程数据库路径)} ]; then printf 'missing'; else exit 2; fi`,
    { 打印输出: false },
  )
  let 远程数据库状态 = 远程数据库检查结果.stdout.trim()
  if (远程数据库状态 !== 'exists' && 远程数据库状态 !== 'missing') {
    throw new Error(`无法确定远程数据库状态: ${远程数据库状态}`)
  }

  // 1. 检查旧服务当前是否在运行
  let 旧服务运行中 = await 检查Compose服务是否运行中(
    sshClient,
    docker文件目录,
    项目名称,
    环境,
    compose命令,
    相对环境文件,
  )

  if (远程数据库状态 === 'missing') {
    if (旧服务运行中 === true) {
      throw new Error(`app 服务正在运行，但未找到预期数据库文件: ${远程数据库路径}`)
    }
    日志.打印(`ℹ️ 远程未检测到现有数据库文件，将在服务首次启动时自动初始化。`)
    return { 数据库备份: null, 旧服务运行中: false }
  }

  日志.打印(`🔍 检测到远程存在现有数据库: ${数据库文件名}，进入安全部署与迁移预演流程...`)

  let 预演数据库文件名 = `${数据库文件名}.preflight.db`
  let 预演数据库路径 = path.posix.join(远程运行目录, 'db', 预演数据库文件名)
  let 时间戳 = new Date().toISOString().replace(/[:.]/g, '-')
  let 备份路径 = 远程数据库路径.replace(/\.db$/, `.${时间戳}.bak.db`)
  let 已发起停机 = false
  let 备份已完成 = false
  try {
    // 2. 优雅停止旧服务，防止预演与正式迁移期间产生并发写入
    if (旧服务运行中 === true) {
      已发起停机 = true
      日志.打印(`🛑 正在优雅停止旧服务，防止迁移期间产生并发写入...`)
      await 执行远程命令(
        sshClient,
        `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} stop`,
        { 工作目录: docker文件目录 },
      )
    }

    // 3. 自动创建带时间戳的完整基线备份
    日志.打印(`📦 正在自动创建数据库基线备份: ${path.posix.basename(备份路径)}`)
    let 备份命令 = [
      `cp -- ${转义PosixShell参数(远程数据库路径)} ${转义PosixShell参数(备份路径)}`,
      `if [ -f ${转义PosixShell参数(`${远程数据库路径}-wal`)} ]; then cp -- ${转义PosixShell参数(`${远程数据库路径}-wal`)} ${转义PosixShell参数(`${备份路径}-wal`)}; fi`,
      `if [ -f ${转义PosixShell参数(`${远程数据库路径}-shm`)} ]; then cp -- ${转义PosixShell参数(`${远程数据库路径}-shm`)} ${转义PosixShell参数(`${备份路径}-shm`)}; fi`,
    ].join(' && ')
    await 执行远程命令(sshClient, 备份命令)
    备份已完成 = true

    // 4. 创建沙箱预演临时副本
    let 预演副本命令 = [
      `cp -- ${转义PosixShell参数(远程数据库路径)} ${转义PosixShell参数(预演数据库路径)}`,
      `if [ -f ${转义PosixShell参数(`${远程数据库路径}-wal`)} ]; then cp -- ${转义PosixShell参数(`${远程数据库路径}-wal`)} ${转义PosixShell参数(`${预演数据库路径}-wal`)}; fi`,
      `if [ -f ${转义PosixShell参数(`${远程数据库路径}-shm`)} ]; then cp -- ${转义PosixShell参数(`${远程数据库路径}-shm`)} ${转义PosixShell参数(`${预演数据库路径}-shm`)}; fi`,
    ].join(' && ')
    await 执行远程命令(sshClient, 预演副本命令)

    // 5. 启动一次性沙箱容器执行预演
    日志.打印(`🧪 正在沙箱容器中对现有真实数据执行数据库迁移预演...`)
    let 预演命令 = `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} run --rm --no-deps -e ENV_FILE_PATH=./.env/.env.${环境}.web -e DB_PATH=./db/${预演数据库文件名} -e DB_PATH_PRISMA=file:./db/${预演数据库文件名} app sh -c "node ./dist/scripts/db/push-prod.js"`
    let 预演结果 = await 执行远程命令(sshClient, 预演命令, {
      工作目录: docker文件目录,
      打印输出: true,
      抛出错误: false,
    })
    if (预演结果.code !== 0) {
      throw new Error(`数据库迁移预演失败，退出码: ${String(预演结果.code)}`)
    }

    日志.打印(`✅ 数据库迁移预演通过！新迁移与现有真实数据完全兼容。`)
    return { 数据库备份: { 备份路径, 数据库路径: 远程数据库路径 }, 旧服务运行中 }
  } catch (预演错误) {
    日志.打印(`💥 数据库安全预演或准备失败，发布已终止。`)
    if (备份已完成 === false) {
      await 执行远程命令(
        sshClient,
        `rm -f -- ${转义PosixShell参数(备份路径)} ${转义PosixShell参数(`${备份路径}-wal`)} ${转义PosixShell参数(`${备份路径}-shm`)}`,
        { 打印输出: false, 抛出错误: false },
      )
    }
    if (旧服务运行中 === true && 已发起停机 === true) {
      try {
        日志.打印(`🔄 正在恢复并验证旧服务...`)
        await 执行远程命令(
          sshClient,
          `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} start`,
          { 工作目录: docker文件目录 },
        )
        await 等待Compose应用就绪(sshClient, docker文件目录, 项目名称, 环境, compose命令, 相对环境文件)
        日志.打印(`✅ 旧服务已恢复运行。`)
      } catch (恢复错误) {
        throw new AggregateError([预演错误, 恢复错误], '数据库准备失败，且旧服务自动恢复失败')
      }
    }
    throw 预演错误
  } finally {
    await 执行远程命令(
      sshClient,
      `rm -f -- ${转义PosixShell参数(预演数据库路径)} ${转义PosixShell参数(`${预演数据库路径}-wal`)} ${转义PosixShell参数(`${预演数据库路径}-shm`)}`,
      { 打印输出: false, 抛出错误: false },
    )
  }
}

export async function 恢复数据库基线备份(
  sshClient: NodeSSH,
  数据库备份: Exclude<数据库预演与准备结果['数据库备份'], null>,
): Promise<void> {
  let { 备份路径, 数据库路径 } = 数据库备份
  let 临时恢复路径 = `${数据库路径}.rollback`
  let 恢复命令 = [
    `cp -- ${转义PosixShell参数(备份路径)} ${转义PosixShell参数(临时恢复路径)}`,
    `rm -f -- ${转义PosixShell参数(`${数据库路径}-wal`)} ${转义PosixShell参数(`${数据库路径}-shm`)}`,
    `mv -f -- ${转义PosixShell参数(临时恢复路径)} ${转义PosixShell参数(数据库路径)}`,
    `if [ -f ${转义PosixShell参数(`${备份路径}-wal`)} ]; then cp -- ${转义PosixShell参数(`${备份路径}-wal`)} ${转义PosixShell参数(`${数据库路径}-wal`)}; fi`,
    `if [ -f ${转义PosixShell参数(`${备份路径}-shm`)} ]; then cp -- ${转义PosixShell参数(`${备份路径}-shm`)} ${转义PosixShell参数(`${数据库路径}-shm`)}; fi`,
  ].join(' && ')
  await 执行远程命令(sshClient, 恢复命令)
}

export async function 执行新服务失败回滚(参数: {
  sshClient: NodeSSH
  日志: 日志类
  数据库准备结果: 数据库预演与准备结果
  旧服务镜像快照: Compose服务镜像快照 | null
  docker文件目录: string
  项目名称: string
  环境: string
  compose命令: string
  相对环境文件: string
}): Promise<void> {
  let { sshClient, 日志, 数据库准备结果, 旧服务镜像快照, docker文件目录, 项目名称, 环境, compose命令, 相对环境文件 } =
    参数
  let 基础命令 = `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)}`
  await 执行远程命令(sshClient, `${基础命令} stop`, { 工作目录: docker文件目录 })
  if (数据库准备结果.数据库备份 !== null) {
    日志.打印(`🔄 正在从部署前基线备份恢复数据库...`)
    await 恢复数据库基线备份(sshClient, 数据库准备结果.数据库备份)
  }
  if (数据库准备结果.旧服务运行中 === false) {
    return
  }
  if (旧服务镜像快照 === null) {
    throw new Error('缺少旧服务镜像快照，无法自动回滚')
  }
  日志.打印(`🔄 新服务启动失败，正在恢复旧镜像并重新创建服务...`)
  await 恢复Compose服务镜像(sshClient, 旧服务镜像快照, docker文件目录, 项目名称, 环境, compose命令, 相对环境文件)
  日志.打印(`✅ 旧镜像服务已恢复并通过健康检查。`)
}
