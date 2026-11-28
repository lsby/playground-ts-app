import { NodeSSH } from 'node-ssh'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { 发布信息模式, type 发布信息 } from '../release-info'
import { 日志类 } from './model'
import { Docker发布环境, 压缩包哈希模式 } from './remote-release-options'
import { 上传文件, 执行远程命令, 转义PosixShell参数 } from './tools'

let 上传说明模式 = z
  .object({
    schemaVersion: z.literal(1),
    项目名称: z.string().min(1),
    环境: Docker发布环境,
    sha256: 压缩包哈希模式,
    发布信息: 发布信息模式,
    复用本地构建: z.boolean(),
    上传时间: z.string().datetime(),
  })
  .strict()

export function 获得上传包路径(
  上传目录: string,
  项目名称: string,
  环境: z.infer<typeof Docker发布环境>,
  压缩包哈希: string | undefined,
): string {
  return path.posix.join(上传目录, 环境, 压缩包哈希模式.parse(压缩包哈希), `${项目名称}.tar.gz`)
}

async function 计算文件哈希(文件路径: string): Promise<string> {
  let 哈希 = createHash('sha256')
  for await (let 数据 of createReadStream(文件路径)) 哈希.update(数据)
  return 哈希.digest('hex')
}

async function 校验远程包哈希(sshClient: NodeSSH, 压缩包路径: string, 预期哈希: string): Promise<void> {
  let 结果 = await 执行远程命令(sshClient, `sha256sum -- ${转义PosixShell参数(压缩包路径)}`, { 打印输出: false })
  let 实际哈希 = 压缩包哈希模式.parse(结果.stdout.trim().split(/\s+/u)[0])
  if (实际哈希 !== 预期哈希) throw new Error('服务器压缩包 SHA-256 与预期不符，已终止部署')
}

export async function 记录已上传包(参数: {
  sshClient: NodeSSH
  日志: 日志类
  本地压缩包路径: string
  远程上传目录: string
  项目名称: string
  环境: z.infer<typeof Docker发布环境>
  发布信息: 发布信息
  复用本地构建: boolean
}): Promise<string> {
  let { sshClient, 日志, 项目名称, 环境 } = 参数
  let sha256 = await 计算文件哈希(参数.本地压缩包路径)
  let 压缩包路径 = 获得上传包路径(参数.远程上传目录, 项目名称, 环境, sha256)
  let 包目录 = path.posix.dirname(压缩包路径)
  await 执行远程命令(
    sshClient,
    `mkdir -p -- ${转义PosixShell参数(path.posix.dirname(包目录))} && mkdir -- ${转义PosixShell参数(包目录)}`,
  )
  let 临时包路径 = `${压缩包路径}.partial`
  await 上传文件(sshClient, 参数.本地压缩包路径, 临时包路径)
  await 校验远程包哈希(sshClient, 临时包路径, sha256)
  let 说明 = 上传说明模式.parse({
    schemaVersion: 1,
    项目名称,
    环境,
    sha256,
    发布信息: 参数.发布信息,
    复用本地构建: 参数.复用本地构建,
    上传时间: new Date().toISOString(),
  })
  let 说明路径 = path.posix.join(包目录, 'upload-info.json')
  await 执行远程命令(
    sshClient,
    [
      `mv -- ${转义PosixShell参数(临时包路径)} ${转义PosixShell参数(压缩包路径)}`,
      `printf %s ${转义PosixShell参数(JSON.stringify(说明))} > ${转义PosixShell参数(`${说明路径}.partial`)}`,
      `mv -- ${转义PosixShell参数(`${说明路径}.partial`)} ${转义PosixShell参数(说明路径)}`,
    ].join(' && '),
  )
  日志.打印(`包已上传并验证，尚未部署。SHA-256: ${sha256}`)
  日志.打印(`部署参数: --mode=run-uploaded --environment=${环境} --package-sha256=${sha256} --yes`)
  return 压缩包路径
}

export async function 准备部署已上传包(
  sshClient: NodeSSH,
  日志: 日志类,
  压缩包路径: string,
  环境: string,
  项目名称: string,
  预期哈希: string | undefined,
): Promise<boolean> {
  let sha256 = 压缩包哈希模式.parse(预期哈希)
  let 结果 = await 执行远程命令(
    sshClient,
    `cat -- ${转义PosixShell参数(path.posix.join(path.posix.dirname(压缩包路径), 'upload-info.json'))}`,
    { 打印输出: false },
  )
  let 说明 = 上传说明模式.parse(JSON.parse(结果.stdout))
  if (说明.环境 !== 环境 || 说明.项目名称 !== 项目名称 || 说明.sha256 !== sha256)
    throw new Error('上传说明与指定的项目、环境或 SHA-256 不符，已终止部署')
  await 校验远程包哈希(sshClient, 压缩包路径, sha256)
  let 包内信息 = await 执行远程命令(sshClient, `tar -xOf ${转义PosixShell参数(压缩包路径)} release-info.json`, {
    打印输出: false,
  })
  let 发布信息 = 发布信息模式.parse(JSON.parse(包内信息.stdout))
  if (发布信息.gitCommit !== 说明.发布信息.gitCommit || 发布信息.gitDirty !== 说明.发布信息.gitDirty)
    throw new Error('压缩包内的发布信息与上传说明不符，已终止部署')
  日志.打印(`使用已校验上传包: ${sha256}，Git ${发布信息.gitCommit}，上传于 ${说明.上传时间}`)
  return 说明.复用本地构建
}
