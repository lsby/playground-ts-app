import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 报告网站发布错误, 网站发布错误, 网站项目根目录, 读取发布选择, 读取网站配置 } from './web-config'

function 准备网站CI(): void {
  let 配置 = 读取网站配置()
  let 标签 = z.string().min(1).parse(process.env['GITHUB_REF_NAME'])
  let 包 = z
    .object({ version: z.string() })
    .passthrough()
    .parse(JSON.parse(fs.readFileSync(path.join(网站项目根目录, 'package.json'), 'utf8')))
  if (标签 !== `v${包.version}`) throw new 网站发布错误('发布标签必须与 package.json 版本一致')
  let 选择平台 = 读取发布选择()
  let 发布OSS = 配置.ENABLE_OSS === true && 选择平台 !== 'github-pages'
  let 发布Pages = 配置.ENABLE_GITHUB_PAGES === true && 选择平台 !== 'oss'
  let 输出文件 = z.string().min(1).parse(process.env['GITHUB_OUTPUT'])
  fs.appendFileSync(输出文件, `oss=${发布OSS}\npages=${发布Pages}\n`)
}

try {
  准备网站CI()
} catch (错误: unknown) {
  报告网站发布错误(错误)
}
