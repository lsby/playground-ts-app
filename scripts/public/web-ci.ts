import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 报告网站发布错误, 网站发布错误, 网站项目根目录, 读取发布选择, 读取网站配置 } from './web-config'

function 准备网站CI(): void {
  let 配置 = 读取网站配置()
  let 事件 = z.enum(['push', 'workflow_dispatch']).parse(process.env['GITHUB_EVENT_NAME'])
  let 引用 = z.string().min(1).parse(process.env['GITHUB_REF'])
  if (引用.startsWith('refs/tags/') === true) {
    let 包 = z
      .object({ version: z.string() })
      .passthrough()
      .parse(JSON.parse(fs.readFileSync(path.join(网站项目根目录, 'package.json'), 'utf8')))
    if (引用 !== `refs/tags/v${包.version}`) throw new 网站发布错误('发布标签必须与 package.json 版本一致')
  } else if (事件 !== 'workflow_dispatch' || /^refs\/heads\/.+$/u.test(引用) === false) {
    throw new 网站发布错误('网站部署仅支持版本标签发布或从分支手动启动工作流')
  }
  let 选择平台 = 读取发布选择()
  let 发布OSS = 配置.ENABLE_OSS === true && 选择平台 !== 'github-pages'
  let 发布Pages = 配置.ENABLE_GITHUB_PAGES === true && 选择平台 !== 'oss'
  if (发布OSS === false && 发布Pages === false)
    throw new 网站发布错误(`所选发布目标 ${选择平台} 未启用，请检查网站发布配置`)
  let 输出文件 = z.string().min(1).parse(process.env['GITHUB_OUTPUT'])
  fs.appendFileSync(输出文件, `oss=${发布OSS}\npages=${发布Pages}\n`)
}

try {
  准备网站CI()
} catch (错误: unknown) {
  报告网站发布错误(错误)
}
