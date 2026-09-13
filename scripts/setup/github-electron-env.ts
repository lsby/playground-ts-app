import crossSpawn from 'cross-spawn'
import fs from 'fs'
import inquirer from 'inquirer'
import path from 'path'
import { z } from 'zod'

let 项目根目录 = path.resolve(import.meta.dirname, '../..')
let 环境文件相对路径 = '.env/.env.production.electron'
let 环境文件路径 = path.resolve(项目根目录, 环境文件相对路径)
let Secret名称 = 'ELECTRON_ENV_FILE'
let 仓库信息模式 = z.object({ nameWithOwner: z.string().min(1), url: z.string().url() })
type 仓库信息 = z.infer<typeof 仓库信息模式>

function 执行gh并读取输出(参数组: string[]): string {
  let 结果 = crossSpawn.sync('gh', 参数组, { cwd: 项目根目录, encoding: 'utf8' })
  if (结果.error instanceof Error) throw 结果.error
  if (结果.status !== 0) throw new Error(结果.stderr.trim() === '' ? 'gh 执行失败' : 结果.stderr.trim())
  return 结果.stdout
}

function 打印手动配置说明(仓库: 仓库信息 | null): void {
  let 仓库名称 = 仓库?.nameWithOwner ?? '<owner>/<repo>'
  let 设置地址 =
    仓库 === null
      ? 'GitHub 仓库 Settings > Secrets and variables > Actions'
      : `${仓库.url}/settings/secrets/actions/new`
  console.error('\n自动配置失败，请手动添加 GitHub Actions Secret：')
  console.error(`- 仓库: ${仓库名称}`)
  console.error(`- Secret 名称: ${Secret名称}`)
  console.error(`- Secret 内容来源: ${环境文件相对路径} 的完整原始内容`)
  console.error(`- 页面: ${设置地址}`)
  console.error('\nPowerShell:')
  console.error(`Get-Content -Raw ${环境文件相对路径} | gh secret set ${Secret名称} --repo ${仓库名称}`)
  console.error('\nBash:')
  console.error(`gh secret set ${Secret名称} --repo ${仓库名称} < ${环境文件相对路径}`)
}

async function 主函数(): Promise<void> {
  let 仓库: 仓库信息 | null = null
  try {
    if (fs.existsSync(环境文件路径) === false || fs.statSync(环境文件路径).isFile() === false) {
      throw new Error(`找不到环境文件: ${环境文件相对路径}`)
    }
    执行gh并读取输出(['--version'])
    执行gh并读取输出(['auth', 'status'])
    仓库 = 仓库信息模式.parse(JSON.parse(执行gh并读取输出(['repo', 'view', '--json', 'nameWithOwner,url'])))
    console.log(`目标仓库: ${仓库.nameWithOwner}`)
    console.log(`Secret 名称: ${Secret名称}`)
    console.log(`内容来源: ${环境文件相对路径}`)

    if (process.argv.slice(2).includes('--yes') === false) {
      if (process.stdin.isTTY !== true) {
        console.error('非交互环境必须传入 --yes 才能写入 GitHub Secret')
        process.exitCode = 1
        return
      }
      let 回答 = await inquirer.prompt<{ 确认: boolean }>([
        {
          type: 'confirm',
          name: '确认',
          message: '是否将该环境文件完整写入目标仓库的 Actions Secret?',
          default: false,
        },
      ])
      if (回答.确认 === false) {
        console.log('已取消 GitHub Secret 配置')
        return
      }
    }

    let 写入结果 = crossSpawn.sync('gh', ['secret', 'set', Secret名称, '--repo', 仓库.nameWithOwner], {
      cwd: 项目根目录,
      encoding: 'utf8',
      input: fs.readFileSync(环境文件路径, 'utf8'),
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    if (写入结果.error instanceof Error) throw 写入结果.error
    if (写入结果.status !== 0) throw new Error(`gh secret set 执行失败，退出码: ${String(写入结果.status)}`)
    console.log(`已更新 ${仓库.nameWithOwner} 的 Actions Secret: ${Secret名称}`)
  } catch (错误) {
    console.error(`\n自动配置 GitHub Secret 失败: ${错误 instanceof Error ? 错误.message : String(错误)}`)
    打印手动配置说明(仓库)
    process.exitCode = 1
  }
}

await 主函数()
