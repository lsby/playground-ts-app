import * as fs from 'fs'
import { NodeSSH } from 'node-ssh'
import * as path from 'path'
import { 日志类 } from './model'
import { 上传文件, 下载文件, 执行远程命令, 转义PosixShell参数 } from './tools'

export type 执行数据库同步参数 = {
  sshClient: NodeSSH
  日志: 日志类
  模式: 'sync-to-local' | 'sync-to-server'
  环境: string
  本地根目录: string
  远程运行目录: string
}

export async function 执行数据库同步(参数: 执行数据库同步参数): Promise<void> {
  let { sshClient, 日志, 模式, 环境, 本地根目录, 远程运行目录 } = 参数
  let 数据库文件名 = 环境 === 'production' ? 'prod-web.db' : 'dev-web.db'
  let 本地数据库路径 = path.join(本地根目录, 'db', 数据库文件名)
  let 远程数据库路径 = path.posix.join(远程运行目录, 'db', 数据库文件名)

  if (模式 === 'sync-to-local') {
    日志.打印(`🔄 模式: 同步服务器数据到本地 [${数据库文件名}]`)

    // 1. 检查远程文件是否存在
    let 结果 = await 执行远程命令(sshClient, `[ -f ${转义PosixShell参数(远程数据库路径)} ]`, {
      打印输出: false,
      抛出错误: false,
    })
    if (结果.code !== 0) {
      throw new Error(`远程数据库文件不存在: ${远程数据库路径}`)
    }

    // 2. 备份本地文件
    if (fs.existsSync(本地数据库路径) === true) {
      let 时间戳 = new Date().toISOString().replace(/[:.]/g, '-')
      let 备份路径 = 本地数据库路径.replace(/\.db$/, `.${时间戳}.bak.db`)
      日志.打印(`📦 正在备份本地数据库到: ${备份路径}`)
      fs.copyFileSync(本地数据库路径, 备份路径)
    }

    // 3. 下载文件
    日志.打印(`⬇️ 正在从服务器下载数据库...`)
    await 下载文件(sshClient, 远程数据库路径, 本地数据库路径)
    日志.打印(`✨ 同步完成: 服务器 -> 本地`)
  }

  if (模式 === 'sync-to-server') {
    日志.打印(`🔄 模式: 同步本地数据到服务器 [${数据库文件名}]`)

    // 1. 检查本地文件是否存在
    if (fs.existsSync(本地数据库路径) === false) {
      throw new Error(`本地数据库文件不存在: ${本地数据库路径}`)
    }

    // 2. 备份远程文件
    let 远程是否存在 = await 执行远程命令(sshClient, `[ -f ${转义PosixShell参数(远程数据库路径)} ]`, {
      打印输出: false,
      抛出错误: false,
    })
    if (远程是否存在.code === 0) {
      let 时间戳 = new Date().toISOString().replace(/[:.]/g, '-')
      let 备份路径 = 远程数据库路径.replace(/\.db$/, `.${时间戳}.bak.db`)
      日志.打印(`📦 正在备份服务器数据库到: ${备份路径}`)
      await 执行远程命令(sshClient, `cp -- ${转义PosixShell参数(远程数据库路径)} ${转义PosixShell参数(备份路径)}`)
    } else {
      // 确保远程目录存在
      await 执行远程命令(sshClient, `mkdir -p -- ${转义PosixShell参数(path.posix.dirname(远程数据库路径))}`)
    }

    // 3. 上传文件
    日志.打印(`⬆️ 正在上传数据库到服务器...`)
    await 上传文件(sshClient, 本地数据库路径, 远程数据库路径)
    日志.打印(`✨ 同步完成: 本地 -> 服务器`)
  }
}
