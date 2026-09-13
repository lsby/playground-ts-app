import inquirer from 'inquirer'
import path from 'path'
import { 发现环境文件 } from './env-files-core.mjs'
import { 写入端口状态, 应用端口表, 生成随机端口表 } from './init-ports-core.mjs'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 环境文件组 = 发现环境文件(项目根目录).map((环境文件) => 环境文件.本地文件)

async function 主函数(): Promise<void> {
  let 是否跳过确认 = process.argv.slice(2).includes('--yes')
  if (是否跳过确认 === false) {
    if (process.stdin.isTTY !== true) throw new Error('非交互环境不会自动改写端口；确认需要重新分配时请传入 --yes')
    let 回答 = await inquirer.prompt<{ 确认: boolean }>([
      {
        type: 'confirm',
        name: '确认',
        message: '即将重新分配端口并改写全部本地环境文件及 Docker 配置，是否继续?',
        default: false,
      },
    ])
    if (回答.确认 === false) {
      console.log('已取消端口重新分配')
      return
    }
  }

  let 端口表 = await 生成随机端口表()
  console.log('分配结果: %O', 端口表)
  应用端口表(项目根目录, 环境文件组, 端口表)
  写入端口状态(项目根目录, 端口表)
  console.log('端口初始化完成')
}

主函数().catch((错误) => {
  console.error('端口初始化失败:', 错误)
  process.exit(1)
})
