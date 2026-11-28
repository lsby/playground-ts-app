import { spawn } from 'child_process'
import * as fs from 'fs'
import { NodeSSH } from 'node-ssh'
import * as path from 'path'
import { z } from 'zod'
import { 读取环境文件明文 } from '../setup/env-crypto-core.mjs'
import { 读取部署服务器配置 } from './deploy-env'
import { 写入发布信息, 创建发布信息, 删除发布信息, 发布信息文件名 } from './release-info'
import { 执行数据库预演与准备, 执行新服务失败回滚 } from './tools/database-preflight'
import { 执行数据库同步 } from './tools/database-sync'
import { 获得非回滚旧镜像列表 } from './tools/docker-image'
import { 获取Docker打包选项 } from './tools/docker-package'
import { 日志类 } from './tools/model'
import { 解析Docker发布参数 } from './tools/remote-release-options'
import { 准备部署已上传包, 获得上传包路径, 记录已上传包 } from './tools/remote-upload-info'
import {
  上传文件,
  保留Compose服务镜像,
  准备Docker构建空间,
  压缩项目,
  执行远程命令,
  检查远程删除目标,
  清理Compose服务回滚镜像,
  清理旧镜像,
  等待Compose应用就绪,
  获取Compose命令,
  获取Compose服务镜像快照,
  获取Compose镜像列表,
  获得安全远程项目根目录,
  获得相对环境文件路径,
  转义PosixShell参数,
  远程路径是否存在,
} from './tools/tools'

let 本地根目录 = path.resolve(import.meta.dirname, '../', '../')
let 服务器配置组 = 读取部署服务器配置(本地根目录)

// 读取项目名称
let 包信息模式 = z.object({ name: z.string() }).passthrough()

let { name: 原始项目名称 } = 包信息模式.parse(
  JSON.parse(fs.readFileSync(path.join(path.resolve(import.meta.dirname, '../', '../'), 'package.json'), 'utf8')),
)
let 项目名称 = 原始项目名称.replace('@', '').replace(/\//g, '-')
if (/^[a-z0-9][a-z0-9._-]*$/u.test(项目名称) === false)
  throw new Error(`package.json 中的项目名称无法安全用于部署路径: ${原始项目名称}`)

// 本地
let 本地压缩包路径: string = path.join(本地根目录, `${项目名称}.tar.gz`)

async function 执行本地命令(命令: string, 选项?: { 工作目录?: string; 打印输出?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    let 终端 = process.platform === 'win32' ? 'cmd' : 'sh'
    let 终端参数 = process.platform === 'win32' ? '/c' : '-c'
    let 进程 = spawn(终端, [终端参数, 命令], { cwd: 选项?.工作目录 ?? 本地根目录 })

    if (选项?.打印输出 !== false) {
      进程.stdout.on('data', (数据) => process.stdout.write(数据))
      进程.stderr.on('data', (数据) => process.stderr.write(数据))
    }

    进程.once('error', reject)
    进程.once('close', (退出码) => {
      if (退出码 === 0) resolve()
      else reject(new Error(`本地命令执行失败，退出码: ${退出码}`))
    })
  })
}

async function 主函数(): Promise<void> {
  let {
    服务器名称,
    模式,
    环境: 选定环境,
    使用缓存,
    复用本地构建,
    跟随日志,
    压缩包哈希,
  } = 解析Docker发布参数(process.argv.slice(2))
  let 目标服务器 = 服务器配置组.find((配置) => 配置.name === 服务器名称)
  if (目标服务器 === undefined) throw new Error(`找不到部署服务器: ${服务器名称}`)
  let 环境 = 选定环境 ?? 'all'
  let { host: 服务器地址, useMirror: 是否使用镜像 } = 目标服务器

  let 镜像参数 = 是否使用镜像
    ? '--build-arg NPM_REGISTRY=https://registry.npmmirror.com --build-arg PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma --build-arg ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ --build-arg DEBIAN_MIRROR=mirrors.ustc.edu.cn'
    : ''
  if (复用本地构建 === true) {
    镜像参数 += ' --build-arg SKIP_BUILD=true'
  } else {
    镜像参数 += ' --build-arg SKIP_BUILD=false'
  }

  let 日志 = new 日志类()
  let sshClient = new NodeSSH()

  try {
    日志.打印(`🚀 [${模式}] [${环境}] 开始连接服务器 [${服务器地址}]...`)
    await sshClient.connect({
      host: 目标服务器.host,
      username: 目标服务器.username,
      password: 目标服务器.password,
      keepaliveInterval: 10000,
      keepaliveCountMax: 6,
      readyTimeout: 30000,
    })
    日志.打印(`✅ 已连接到 服务器 [${服务器地址}]`)

    let compose命令 = await 获取Compose命令(sshClient)
    日志.打印(`🐳 检测到 Compose 命令: ${compose命令}`)

    // 获取远程部署根目录并初始化路径
    let 原始远程部署根目录 =
      目标服务器.deployRootDir ?? (await 执行远程命令(sshClient, 'echo $HOME', { 打印输出: false })).stdout.trim()
    let { 部署根目录: 远程部署根目录, 项目根目录: 远程项目根目录 } = 获得安全远程项目根目录(
      原始远程部署根目录,
      项目名称,
    )
    let 远程上传目录 = path.posix.resolve(远程项目根目录, 'upload')
    let 远程压缩包路径 = path.posix.resolve(远程上传目录, `${项目名称}.tar.gz`)
    if (模式 === 'run-uploaded') {
      远程压缩包路径 = 获得上传包路径(
        远程上传目录,
        项目名称,
        z.enum(['development', 'production']).parse(选定环境),
        压缩包哈希,
      )
      复用本地构建 = await 准备部署已上传包(sshClient, 日志, 远程压缩包路径, 环境, 项目名称, 压缩包哈希)
      镜像参数 = 镜像参数.replace(
        /--build-arg SKIP_BUILD=(true|false)/u,
        `--build-arg SKIP_BUILD=${String(复用本地构建)}`,
      )
    }
    let 远程构建目录 =
      typeof 环境 === 'string'
        ? path.posix.resolve(远程项目根目录, 'build', 环境)
        : path.posix.resolve(远程项目根目录, 'build')
    let 远程构建docker目录: string = path.posix.resolve(远程构建目录, 'deploy')
    let 远程运行目录 =
      typeof 环境 === 'string'
        ? path.posix.resolve(远程项目根目录, 'run', 环境)
        : path.posix.resolve(远程项目根目录, 'run')
    let 远程运行部署目录: string = path.posix.resolve(远程运行目录, 'deploy')

    if (['build', 'run', 'redeploy', 'upload', 'run-uploaded'].includes(模式)) {
      await 准备Docker构建空间(sshClient, 远程部署根目录, 日志)
    }

    日志.打印(`📂 远程路径初始化完成:`)
    日志.打印(`- 远程部署根目录: ${远程部署根目录}`)
    日志.打印(`- 远程项目根目录: ${远程项目根目录}`)
    日志.打印(`- 远程上传目录: ${远程上传目录}`)
    日志.打印(`- 远程构建目录: ${远程构建目录}`)
    日志.打印(`- 远程运行目录: ${远程运行目录}`)

    // ====================
    // 特殊流程: 彻底重部署的前置清理
    // ====================
    let 重部署前镜像列表: string[] = []
    if (模式 === 'redeploy') {
      let 某个docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      if ((await 远程路径是否存在(sshClient, 某个docker文件目录)) === true) {
        let 相对环境文件 = 获得相对环境文件路径(环境)
        重部署前镜像列表 = await 获取Compose镜像列表(
          sshClient,
          某个docker文件目录,
          `${项目名称}-${环境}`,
          compose命令,
          相对环境文件,
        )

        日志.打印(`🛑 [redeploy] 为了避免删目录时与 Docker Daemon 产生权限冲突，先停止旧容器...`)
        await 执行远程命令(
          sshClient,
          `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} down --remove-orphans`,
          { 工作目录: 某个docker文件目录, 抛出错误: false },
        )
      }

      日志.打印(`🧹 [redeploy] 彻底删除远程目录: ${远程运行目录}`)
      检查远程删除目标(远程项目根目录, 远程运行目录)
      await 执行远程命令(sshClient, `rm -rf -- ${转义PosixShell参数(远程运行目录)}`)
    }

    // ====================
    // 步骤: 打包并上传
    if (模式 === 'build' || 模式 === 'run' || 模式 === 'redeploy' || 模式 === 'upload') {
      let Docker环境 = z.enum(['development', 'production']).parse(环境)
      let 环境文件名表 = { development: '.env/.env.development.web', production: '.env/.env.production.web' }
      let envFile = 环境文件名表[Docker环境]
      if (fs.existsSync(path.join(本地根目录, envFile)) === false) {
        throw new Error(`找不到对应的环境变量文件: ${envFile}`)
      }
      let 打包环境文件 = envFile
      if (复用本地构建 === true) {
        日志.打印(`📦 正在本地生成、检查并预构建项目 (使用 ${envFile}，避免服务器内存溢出假死)...`)
        await 执行本地命令(`npm run task -- build:all --env ${envFile}`, { 工作目录: 本地根目录 })
      }
      let 本次发布信息 = 创建发布信息(本地根目录, envFile)
      let 发布信息路径 = 写入发布信息(本地根目录, 本次发布信息)
      日志.打印(`✅ 已生成 Docker 构建发布信息: ${发布信息路径}`)

      日志.打印(`🧹 清理旧的本地压缩包`)
      if (fs.existsSync(本地压缩包路径) === true) {
        fs.unlinkSync(本地压缩包路径)
      }

      日志.打印(`📦 正在打包项目 (根目录: ${本地根目录})...`)
      let { 包含名单, 忽略名单, Docker忽略内容 } = 获取Docker打包选项(本地根目录, Docker环境, 复用本地构建)
      await 压缩项目({
        输出路径: 本地压缩包路径,
        源码目录: 本地根目录,
        忽略名单,
        包含名单,
        日志,
        强制包含文件组: [发布信息文件名],
        覆盖文本文件组: [
          { 相对路径: 打包环境文件, 内容: 读取环境文件明文(本地根目录, envFile) },
          { 相对路径: '.dockerignore', 内容: Docker忽略内容 },
        ],
      })
      if (模式 === 'upload') {
        远程压缩包路径 = await 记录已上传包({
          sshClient,
          日志,
          本地压缩包路径,
          远程上传目录,
          项目名称,
          环境: Docker环境,
          发布信息: 本次发布信息,
          复用本地构建,
        })
      } else {
        日志.打印(`🧹 清理并创建远程上传目录...`)
        await 执行远程命令(sshClient, `mkdir -p -- ${转义PosixShell参数(远程上传目录)}`)

        日志.打印(`⬆️ 正在上传压缩包...`)
        await 上传文件(sshClient, 本地压缩包路径, 远程压缩包路径)
      }

      日志.打印(`🧹 清理本地压缩包`)
      if (fs.existsSync(本地压缩包路径) === true) {
        fs.unlinkSync(本地压缩包路径)
      }
    }

    // ====================
    // 模式: 构建镜像
    // ====================
    if (模式 === 'build') {
      日志.打印(`🧹 清理并创建远程构建目录: ${远程构建目录}`)
      await 执行远程命令(
        sshClient,
        `rm -rf -- ${转义PosixShell参数(远程构建目录)} && mkdir -p -- ${转义PosixShell参数(远程构建目录)}`,
      )

      日志.打印(`📦 解压到构建目录...`)
      await 执行远程命令(
        sshClient,
        `tar -xzf ${转义PosixShell参数(远程压缩包路径)} -C ${转义PosixShell参数(远程构建目录)}`,
      )

      日志.打印(`🔨 正在使用 ${compose命令} 构建镜像...`)
      let 构建目录 = path.posix.resolve(远程构建docker目录, 环境)
      let 相对环境文件 = 获得相对环境文件路径(环境)
      let 构建命令 = `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} build ${镜像参数}`
      if (使用缓存 === false) {
        构建命令 += ' --no-cache'
      }
      await 执行远程命令(sshClient, 构建命令, { 工作目录: 构建目录 })
    }

    // ====================
    // 模式: 运行项目 (run/redeploy)
    // ====================
    if (模式 === 'run' || 模式 === 'redeploy' || 模式 === 'run-uploaded') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      日志.打印(`📂 确保远程运行目录存在: ${远程运行目录}`)
      await 执行远程命令(sshClient, `mkdir -p -- ${转义PosixShell参数(远程运行目录)}`)

      let 相对环境文件 = 获得相对环境文件路径(环境)
      日志.打印(`🔍 记录部署前的镜像 ID...`)
      let 旧镜像列表 = await 获取Compose镜像列表(
        sshClient,
        docker文件目录,
        `${项目名称}-${环境}`,
        compose命令,
        相对环境文件,
      )
      let 原始旧服务镜像快照 = await 获取Compose服务镜像快照(
        sshClient,
        docker文件目录,
        项目名称,
        环境,
        compose命令,
        相对环境文件,
      )
      let 旧服务镜像快照 =
        原始旧服务镜像快照 === null
          ? null
          : await 保留Compose服务镜像(sshClient, 原始旧服务镜像快照, `${环境}-${Date.now().toString()}`)
      日志.打印(`📊 当前项目使用的镜像 ID 列表: [${旧镜像列表.join(', ') === '' ? '无' : 旧镜像列表.join(', ')}]`)
      let 部署后镜像列表: string[] | null = null
      try {
        日志.打印(`📦 解压到运行目录...`)
        await 执行远程命令(
          sshClient,
          `tar -xzf ${转义PosixShell参数(远程压缩包路径)} -C ${转义PosixShell参数(远程运行目录)}`,
        )

        日志.打印(`🔨 正在构建项目镜像 (此时旧服务仍在运行)...`)
        let 构建命令 = `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} build ${镜像参数}`
        if (使用缓存 === false) {
          构建命令 += ' --no-cache'
        }
        await 执行远程命令(sshClient, 构建命令, { 工作目录: docker文件目录 })

        let 数据库准备结果 = await 执行数据库预演与准备({
          sshClient,
          日志,
          环境,
          远程运行目录,
          docker文件目录,
          项目名称,
          compose命令,
          相对环境文件,
        })

        try {
          日志.打印(`🚀 正在启动新服务...`)
          await 执行远程命令(
            sshClient,
            `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} up -d --remove-orphans`,
            { 工作目录: docker文件目录 },
          )
          日志.打印(`🩺 正在验证新服务是否稳定就绪...`)
          await 等待Compose应用就绪(
            sshClient,
            docker文件目录,
            项目名称,
            环境,
            compose命令,
            相对环境文件,
            '/api/system/health',
          )
          日志.打印(`✅ 新服务已连续通过健康检查。`)
        } catch (启动错误) {
          try {
            await 执行新服务失败回滚({
              sshClient,
              日志,
              数据库准备结果,
              旧服务镜像快照,
              docker文件目录,
              项目名称,
              环境,
              compose命令,
              相对环境文件,
            })
          } catch (回滚错误) {
            throw new AggregateError([启动错误, 回滚错误], '新服务启动失败，且自动回滚失败')
          }
          throw 启动错误
        }

        日志.打印(`✅ 确认部署后的新镜像状态...`)
        部署后镜像列表 = await 获取Compose镜像列表(
          sshClient,
          docker文件目录,
          `${项目名称}-${环境}`,
          compose命令,
          相对环境文件,
        )
        日志.打印(
          `📊 部署后项目使用的镜像 ID 列表: [${部署后镜像列表.join(', ') === '' ? '无' : 部署后镜像列表.join(', ')}]`,
        )

        日志.打印(`🧹 正在对比并清理不再使用的旧镜像...`)
        let 待清理旧镜像 = 获得非回滚旧镜像列表(旧镜像列表, 重部署前镜像列表, 旧服务镜像快照?.镜像ID)
        await 清理旧镜像(sshClient, 待清理旧镜像, 部署后镜像列表, 日志)
      } finally {
        if (旧服务镜像快照 !== null) await 清理Compose服务回滚镜像(sshClient, 旧服务镜像快照)
      }
      if (旧服务镜像快照 !== null) {
        日志.打印(`🧹 新服务已稳定就绪，清理部署前的旧服务镜像...`)
        await 清理旧镜像(sshClient, [旧服务镜像快照.镜像ID], 部署后镜像列表, 日志)
      }

      日志.打印(`✨ 所有操作均已完成`)
    }

    // ====================
    // 模式: 停止运行
    // ====================
    if (模式 === 'stop') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      if ((await 远程路径是否存在(sshClient, docker文件目录)) === false) {
        日志.打印(`⚠️ 远程部署目录不存在: ${docker文件目录}, 无需停止`)
        return
      }

      let 相对环境文件 = 获得相对环境文件路径(环境)
      日志.打印(`🔍 停止前的镜像 ID...`)
      let 待清理镜像列表 = await 获取Compose镜像列表(
        sshClient,
        docker文件目录,
        `${项目名称}-${环境}`,
        compose命令,
        相对环境文件,
      )
      日志.打印(`📊 待清理的镜像 ID 列表: [${待清理镜像列表.join(', ') === '' ? '无' : 待清理镜像列表.join(', ')}]`)

      日志.打印(`🛑 正在停止并移除容器...`)
      await 执行远程命令(
        sshClient,
        `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} down --remove-orphans`,
        { 工作目录: docker文件目录 },
      )

      日志.打印(`🧹 正在清理相关镜像...`)
      await 清理旧镜像(sshClient, 待清理镜像列表, [], 日志)

      日志.打印(`✨ 停止并清理完成`)
    }

    // ====================
    // 模式: 重启项目
    // ====================
    if (模式 === 'restart') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      if ((await 远程路径是否存在(sshClient, docker文件目录)) === false) {
        日志.打印(`⚠️ 远程部署目录不存在: ${docker文件目录}, 无法重启`)
        return
      }

      let 相对环境文件 = 获得相对环境文件路径(环境)
      日志.打印(`🔄 正在重启容器...`)
      await 执行远程命令(
        sshClient,
        `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} restart`,
        { 工作目录: docker文件目录 },
      )

      日志.打印(`✨ 重启指令已发送`)
    }

    // ====================
    // 模式: 删除项目
    // ====================
    if (模式 === 'delete') {
      let 运行根目录 = path.posix.resolve(远程项目根目录, 'run')
      if ((await 远程路径是否存在(sshClient, 运行根目录)) === true) {
        日志.打印(`🔍 探测到运行根目录，尝试清理运行中的容器和镜像...`)
        let 环境列表内容 = (
          await 执行远程命令(sshClient, `ls -1 -- ${转义PosixShell参数(运行根目录)}`, { 打印输出: false })
        ).stdout
        let 环境列表 = 环境列表内容
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        for (let 某个环境 of 环境列表) {
          let 某个环境目录 = path.posix.resolve(运行根目录, 某个环境, 'deploy', 某个环境)
          if ((await 远程路径是否存在(sshClient, 某个环境目录)) === true) {
            let 相对环境文件 = 获得相对环境文件路径(某个环境)
            日志.打印(`🛑 正在停止并清理环境: ${某个环境} ...`)
            let 镜像ID列表 = await 获取Compose镜像列表(
              sshClient,
              某个环境目录,
              `${项目名称}-${某个环境}`,
              compose命令,
              相对环境文件,
            )
            await 执行远程命令(
              sshClient,
              `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${某个环境}`)} down --remove-orphans`,
              { 工作目录: 某个环境目录, 抛出错误: false },
            )
            await 清理旧镜像(sshClient, 镜像ID列表, [], 日志)
          }
        }
      }

      日志.打印(`🧹 正在从远程物理删除整个项目根目录: ${远程项目根目录}`)
      检查远程删除目标(远程项目根目录, 远程项目根目录, true)
      await 执行远程命令(sshClient, `rm -rf -- ${转义PosixShell参数(远程项目根目录)}`)
      日志.打印(`✨ 项目已彻底从服务器删除`)
      return
    }

    // ====================
    // 模式: 数据同步
    // ====================
    if (模式 === 'sync-to-local' || 模式 === 'sync-to-server') {
      await 执行数据库同步({ sshClient, 日志, 模式, 环境, 本地根目录, 远程运行目录 })
    }

    // ====================
    // 模式: 查看日志
    // ====================
    if (模式 === 'logs' || (跟随日志 === true && ['run', 'run-uploaded', 'restart', 'redeploy'].includes(模式))) {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)
      let 相对环境文件 = 获得相对环境文件路径(环境)
      日志.打印('--- 正在同步服务器实时日志 (按 Ctrl+C 退出) ---')
      await 执行远程命令(
        sshClient,
        `${compose命令} --env-file ${转义PosixShell参数(相对环境文件)} -p ${转义PosixShell参数(`${项目名称}-${环境}`)} logs -f --tail 500`,
        { 工作目录: docker文件目录 },
      )
    }
  } finally {
    sshClient.dispose()
    删除发布信息(本地根目录)
    if (fs.existsSync(本地压缩包路径) === true) {
      日志.打印(`🧹 运行结束清理本地文件...`)
      fs.unlinkSync(本地压缩包路径)
    }
  }
}

主函数().catch((_错误) => {
  console.error(`\n💥 发生未处理的错误:`, _错误)
  process.exit(1)
})
