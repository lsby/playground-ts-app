import { access } from 'node:fs/promises'
import path from 'node:path'

export function 创建测试子进程环境(根目录: string): NodeJS.ProcessEnv {
  return { ...process.env, PATH: [path.join(根目录, 'node_modules', '.bin'), process.env['PATH']].join(path.delimiter) }
}

export async function 检查测试命令环境(根目录: string): Promise<void> {
  for (let 命令 of ['tsx', 'prisma']) {
    let 文件 = path.join(根目录, 'node_modules', '.bin', `${命令}${process.platform === 'win32' ? '.cmd' : ''}`)
    try {
      await access(文件)
    } catch (错误) {
      throw new Error(`测试所需本地命令不存在：${文件}。请在项目根目录运行 pnpm install。`, { cause: 错误 })
    }
  }
}
