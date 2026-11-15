import { execFile } from 'node:child_process'
import { chmod, lstat, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'

let 程序相对路径 = 'tools/windows-ocr/windows-ocr.exe'
let 执行程序 = promisify(execFile)
let 坐标模型 = z.object({ x: z.number().finite(), y: z.number().finite() })
let 识别结果模型 = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  lines: z.array(
    z.object({ text: z.string(), topLeft: 坐标模型, topRight: 坐标模型, bottomRight: 坐标模型, bottomLeft: 坐标模型 }),
  ),
})
export type 截图文字识别结果 = z.infer<typeof 识别结果模型>

export async function 确认WindowsOCR程序(项目根目录: string): Promise<string> {
  if (process.platform !== 'win32') throw new Error('当前的 Windows OCR 程序需要在 Windows 上运行')
  return await 确认OCR文件(项目根目录, 程序相对路径, 'Windows OCR')
}

/** 按当前平台确认 OCR 程序存在：Windows 用 windows-ocr.exe，苹果芯片 macOS 用 macos-ocr。 */
export async function 确认OCR程序(项目根目录: string): Promise<string> {
  if (process.platform === 'win32') return await 确认OCR文件(项目根目录, 程序相对路径, 'Windows OCR')
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    let 程序 = await 确认OCR文件(项目根目录, 'tools/macos-ocr/macos-ocr', 'macOS OCR')
    // 外挂 LFS 拉下来的文件可能没有执行权限
    await chmod(程序, 0o755)
    return 程序
  }
  throw new Error(`当前平台没有可用的 OCR 程序：${process.platform}/${process.arch}`)
}

export async function 确认OCR文件(项目根目录: string, 相对路径: string, 名称: string): Promise<string> {
  let 程序 = path.join(项目根目录, 相对路径)
  let 文件 = await lstat(程序).catch((错误: unknown): never => {
    if (错误 instanceof Error && 'code' in 错误 && 错误.code === 'ENOENT')
      throw new Error(`缺少 ${名称} 程序 ${程序}，请配置项目可用的 OCR 可执行文件`, { cause: 错误 })
    throw 错误
  })
  if (文件.isFile() === false || 文件.size === 0) throw new Error(`${名称} 程序不是有效的文件：${程序}`)
  return 程序
}

export async function 寻找截图文字(
  程序: string,
  图片: Buffer,
  文字: string,
  信号: AbortSignal,
): Promise<{ x: number; y: number }> {
  let 目标 = 文字.replace(/\s+/gu, '')
  if (目标 === '') throw new Error('OCR 目标文字不能为空')
  let 结果 = await 识别截图文字(程序, 图片, 信号)
  let 匹配们 = 结果.lines.filter((行) => {
    let 文本 = 行.text.replace(/\s+/gu, '')
    return 文本 === 目标 || 文本.replace(/[→➜➔>]$/u, '') === 目标
  })
  if (匹配们.length > 1) throw new Error(`OCR 找到多个匹配项：${文字}`)
  let 匹配 = 匹配们[0]
  if (匹配 === undefined) throw new Error(`OCR 未找到文字：${文字}`)
  let 角点们 = [匹配.topLeft, 匹配.topRight, 匹配.bottomRight, 匹配.bottomLeft]
  let x = Math.floor(角点们.reduce((和, 点) => 和 + 点.x, 0) / 角点们.length)
  let y = Math.floor(角点们.reduce((和, 点) => 和 + 点.y, 0) / 角点们.length)
  return { x, y }
}

export async function 识别截图文字(程序: string, 图片: Buffer, 信号: AbortSignal): Promise<截图文字识别结果> {
  信号.throwIfAborted()
  let 临时目录 = await mkdtemp(path.join(os.tmpdir(), 'mobile-test-ocr-'))
  try {
    let 截图路径 = path.join(临时目录, 'screen.png')
    await writeFile(截图路径, 图片, { signal: 信号 })
    let { stdout } = await 执行程序(程序, [截图路径], {
      encoding: 'utf8',
      timeout: 30_000,
      signal: 信号,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
    let 结果 = 识别结果模型.parse(JSON.parse(stdout))
    if (结果.width !== 图片.readUInt32BE(16) || 结果.height !== 图片.readUInt32BE(20))
      throw new Error('OCR 返回的尺寸与原始截图不一致')
    return 结果
  } finally {
    await rm(临时目录, { recursive: true, force: true })
  }
}
