import archiver from 'archiver'
import * as fs from 'fs'
import { NodeSSH } from 'node-ssh'
import * as path from 'path'
import { 日志类 } from './model'

export function 获取Git忽略名单(项目根目录: string): string[] {
  let 忽略文件路径 = path.join(项目根目录, '.gitignore')

  if (fs.existsSync(忽略文件路径) === false) {
    return []
  }

  let 内容 = fs.readFileSync(忽略文件路径, 'utf-8')
  return 内容
    .split(/\r?\n/)
    .map((行: string) => 行.trim())
    .filter((行: string) => 行.length > 0 && 行.startsWith('#') === false && 行.startsWith('!') === false)
    .flatMap((行: string) => {
      let 模式 = 行
      if (模式.startsWith('/') === true) {
        模式 = 模式.substring(1)
      }
      if (模式.endsWith('/**') === true || 模式.endsWith('**') === true) {
        return [模式]
      }
      if (模式.endsWith('/') === true) {
        return [模式, `${模式}**`]
      }
      return [模式, `${模式}/**`]
    })
}

export function 获取完整忽略名单(项目根目录: string): string[] {
  return [...获取Git忽略名单(项目根目录), '.git/**']
}

export async function 压缩项目(输出路径: string, 源码目录: string, 忽略名单: string[], 日志?: 日志类): Promise<void> {
  return new Promise((resolve, reject) => {
    let 输出 = fs.createWriteStream(输出路径)
    let 归档器 = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })
    let 已打包文件数 = 0

    if (日志 !== undefined) {
      归档器.on('entry', (数据) => {
        已打包文件数 += 1
        日志.打印(`➕ [${已打包文件数}] 添加文件: ${数据.name}`)
      })
    }

    输出.on('close', () => {
      if (日志 !== undefined) {
        日志.打印(`✅ 打包完成，共 ${已打包文件数} 个文件，最终大小: ${(归档器.pointer() / 1024 / 1024).toFixed(2)} MB`)
      }
      resolve()
    })

    归档器.on('error', (错误) => {
      reject(错误)
    })

    归档器.pipe(输出)

    // 确保不包含输出文件本身，防止循环打包导致 Size mismatch
    let 最终忽略名单 = [...忽略名单]
    let 相对输出路径 = path.relative(源码目录, 输出路径)
    if (相对输出路径.startsWith('..') === false && path.isAbsolute(相对输出路径) === false) {
      最终忽略名单.push(相对输出路径)
    }

    归档器.glob('**/*', { cwd: 源码目录, ignore: 最终忽略名单, dot: true })

    归档器.finalize().catch(reject)
  })
}

export async function 远程路径是否存在(ssh: NodeSSH, 路径: string): Promise<boolean> {
  let 结果 = await 执行远程命令(ssh, `[ -d "${路径}" ]`, { 打印输出: false, 抛出错误: false })
  return 结果.code === 0
}

export async function 获取Compose命令(ssh: NodeSSH): Promise<string> {
  let 插件版检测结果 = await 执行远程命令(ssh, 'docker compose version', { 打印输出: false, 抛出错误: false })
  if (插件版检测结果.code === 0) {
    return 'docker compose'
  }
  let 独立版检测结果 = await 执行远程命令(ssh, 'docker-compose version', { 打印输出: false, 抛出错误: false })
  if (独立版检测结果.code === 0) {
    return 'docker-compose'
  }
  return 'docker compose'
}

export async function 获取Compose镜像列表(
  ssh: NodeSSH,
  工作目录: string,
  项目名称?: string,
  compose命令?: string,
): Promise<string[]> {
  if ((await 远程路径是否存在(ssh, 工作目录)) === false) {
    return []
  }

  let 最终compose命令 = compose命令 ?? (await 获取Compose命令(ssh))

  let 命令 = 最终compose命令
  if (项目名称 !== undefined) {
    命令 += ` -p ${项目名称}`
  }
  命令 += ' images -q'

  let 结果 = await 执行远程命令(ssh, 命令, { 工作目录: 工作目录, 打印输出: false })
  return 结果.stdout.split(/\s+/).filter((id: string) => id.length > 0)
}

export async function 清理旧镜像(
  ssh: NodeSSH,
  旧镜像列表: string[],
  新镜像列表: string[],
  日志: 日志类,
): Promise<void> {
  for (let 镜像ID of 旧镜像列表) {
    if (新镜像列表.includes(镜像ID) === false) {
      日志.打印(`检测到旧镜像 ID: ${镜像ID} 已不再用于本项目，尝试执行删除 (docker image rm)...`)
      await 执行远程命令(ssh, `docker image rm ${镜像ID} || true`)
    }
  }
}

export async function 执行远程命令(
  ssh: NodeSSH,
  命令: string,
  选项?: { 工作目录?: string; 打印输出?: boolean; 抛出错误?: boolean },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  let 打印输出 = 选项?.打印输出 ?? true
  let 抛出错误 = 选项?.抛出错误 ?? true

  let 结果 = await ssh.execCommand(命令, {
    cwd: 选项?.工作目录 ?? '/',
    onStdout: (数据: Buffer) => {
      if (打印输出 === true) {
        process.stdout.write(数据.toString())
      }
    },
    onStderr: (数据: Buffer) => {
      if (打印输出 === true) {
        process.stderr.write(数据.toString())
      }
    },
  })

  if (抛出错误 === true && 结果.code !== 0 && 结果.code !== null) {
    throw new Error(`远程命令执行失败 [${命令}]: ${结果.stderr}`)
  }

  return 结果
}

export async function 上传文件(ssh: NodeSSH, 本地路径: string, 远程路径: string): Promise<void> {
  // 弃用 SFTP，改用 SSH 数据流直传。
  // 通过 SSH 终端直传能保证路径上下文与后续 Shell 脚本绝对一致，同时省去 SFTP 的协议开销，速度更快。
  return new Promise((resolve, reject) => {
    ssh.connection.exec(`cat > "${远程路径}"`, (err: Error | undefined | null, stream: any) => {
      if (err !== undefined && err !== null) return reject(new Error(`文件上传启动失败: ${err.message}`))

      let readStream = fs.createReadStream(本地路径)
      readStream.pipe(stream)

      stream.on('exit', (code: number | null) => {
        stream.close()
        if (code !== 0 && code !== null) reject(new Error(`文件上传失败，远程退出码: ${code}`))
        else resolve()
      })
      stream.on('error', reject)
      readStream.on('error', reject)
    })
  })
}

export async function 下载文件(ssh: NodeSSH, 远程路径: string, 本地路径: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ssh.connection.exec(`cat "${远程路径}"`, (err: Error | undefined | null, stream: any) => {
      if (err !== undefined && err !== null) return reject(new Error(`文件下载启动失败: ${err.message}`))

      let writeStream = fs.createWriteStream(本地路径)
      stream.pipe(writeStream)

      stream.on('exit', (code: number | null) => {
        stream.close()
        if (code !== 0 && code !== null) reject(new Error(`文件下载失败，远程退出码: ${code}`))
        else resolve()
      })
      stream.on('error', reject)
      writeStream.on('error', reject)
    })
  })
}
