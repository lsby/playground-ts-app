import crossSpawn from 'cross-spawn'
import fs from 'node:fs'
import path from 'node:path'
import { 写入缓存, 计算文件指纹, 读取有效缓存 } from './content-fingerprint'
import { 计算生成输入指纹 } from './generation-cache-input'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 参数 = process.argv.slice(2)
let 分隔索引 = 参数.indexOf('--')
let 名称 = 参数[0]
let 输出参数 = 参数[1]
let 程序 = 参数[分隔索引 + 1]
if (
  名称 === undefined ||
  /^[a-z0-9-]+$/u.test(名称) === false ||
  输出参数 === undefined ||
  输出参数 === '' ||
  分隔索引 !== 2 ||
  程序 === undefined
)
  throw new Error('用法: tsx cached-run.ts <名称> <输出文件,逗号分隔> -- <程序> [参数...]')
let 输出文件们 = 输出参数.split(',').map((项): string => path.resolve(项目根目录, 项))
let 指纹文件 = path.join(项目根目录, 'test-outputs/gen-cache', `${名称}.json`)
let 命令 = 参数.slice(分隔索引 + 1)
let 输入指纹 = 计算生成输入指纹(项目根目录, 输出文件们, 命令)
let 输出指纹 = 输出文件们.every((文件): boolean => fs.existsSync(文件)) ? 计算文件指纹(项目根目录, 输出文件们) : null
let 记录 = 读取有效缓存(指纹文件)
if (输出指纹 !== null && 记录?.输入 === 输入指纹 && 记录.输出 === 输出指纹) {
  console.log(`[gen-cache] ${名称}：输入和输出都没变，跳过生成`)
} else {
  let 结果 = crossSpawn.sync(程序, 参数.slice(分隔索引 + 2), {
    cwd: 项目根目录,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  if (结果.error instanceof Error) throw 结果.error
  if (结果.status !== 0) process.exit(结果.status ?? 1)
  if (输出文件们.every((文件): boolean => fs.existsSync(文件)) === false)
    throw new Error(`生成命令 ${名称} 没有产生全部输出`)
  // 仅输出自己的生成文件可变化；若依赖在生成期间被改动，不把新输入错误配给旧输出。
  if (计算生成输入指纹(项目根目录, 输出文件们, 命令) !== 输入指纹)
    throw new Error(`生成命令 ${名称} 执行期间输入发生变化，未记录缓存`)
  写入缓存(指纹文件, 输入指纹, 计算文件指纹(项目根目录, 输出文件们))
}
