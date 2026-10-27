import inquirer from 'inquirer'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备Electron发布参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 是否生成Zip: boolean | undefined
  let 保留参数: string[] = []
  for (let 参数 of 上下文.参数) {
    if (参数 === '--zip') {
      if (是否生成Zip === false) throw new Error('--zip 与 --no-zip 不能同时使用')
      是否生成Zip = true
      continue
    }
    if (参数 === '--nozip' || 参数 === '--no-zip') {
      if (是否生成Zip === true) throw new Error('--zip 与 --no-zip 不能同时使用')
      是否生成Zip = false
      continue
    }
    if (参数 === '--yes' || 参数 === '-y' || 参数 === '--silent') {
      是否生成Zip ??= false
      continue
    }
    保留参数.push(参数)
  }
  if (是否生成Zip === undefined) {
    if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) 是否生成Zip = false
    else {
      let 回答 = await inquirer.prompt<{ 是否生成Zip: boolean }>([
        { type: 'confirm', name: '是否生成Zip', message: '是否打包 Electron 完整便携压缩包 (.zip)？', default: false },
      ])
      是否生成Zip = 回答.是否生成Zip
    }
  }
  return { 参数: [...保留参数, 是否生成Zip === true ? '--zip' : '--no-zip'] }
}
