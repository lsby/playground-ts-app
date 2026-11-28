import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { 纯前端生产环境文件 } from '../task/model/task-common'
import { 创建发布信息 } from './release-info'
import { 构建网站, 验证网站产物 } from './web-build'
import { 报告网站发布错误, 校验发布参数, 网站发布错误, 网站项目根目录, 获取平台配置, 读取网站配置 } from './web-config'

async function 发布Pages(): Promise<void> {
  let 参数 = 校验发布参数()
  if (参数.删除 === true) throw new 网站发布错误('Pages 不使用 --delete 参数')
  let 目标 = 获取平台配置('github-pages', 读取网站配置())
  if (目标.启用 === false) throw new 网站发布错误('GitHub Pages 发布未启用')
  if (参数.仅构建 === true) {
    await 构建网站(目标.公共路径, 目标.产物目录)
    return
  }
  let 发布信息 = 创建发布信息(网站项目根目录, 纯前端生产环境文件)
  if (发布信息.gitDirty === true) throw new 网站发布错误('Pages 发布要求干净工作区')
  if (参数.仅上传 === true) 验证网站产物(目标.公共路径, 目标.产物目录)
  let 包 = z
    .object({ version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u) })
    .passthrough()
    .parse(JSON.parse(fs.readFileSync(path.join(网站项目根目录, 'package.json'), 'utf8')))
  let 标签 = `v${包.version}`
  let 标签提交 = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${标签}^{commit}`], {
    cwd: 网站项目根目录,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
  if (标签提交 !== 发布信息.gitCommit) throw new 网站发布错误('当前版本标签必须指向当前 HEAD')
  console.log(`GitHub Pages 将通过版本标签 ${标签} 的网站工作流发布。`)
  if (参数.确认 === false) {
    console.log('确认后添加 --yes 触发发布。')
    return
  }
  execFileSync('gh', ['workflow', 'run', 'deploy-pages.yml', '--ref', 标签, '--field', 'target=github-pages'], {
    cwd: 网站项目根目录,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  console.log('已触发 GitHub Pages 发布，可在仓库 Actions 页面查看结果。')
}

void 发布Pages().catch(报告网站发布错误)
