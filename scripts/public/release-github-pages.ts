import { execFileSync } from 'child_process'
import { 发布信息模式 } from './release-info'
import { 构建网站 } from './web-build'
import { 报告网站发布错误, 校验发布参数, 网站发布错误, 网站项目根目录, 获取平台配置, 读取网站配置 } from './web-config'

async function 发布Pages(): Promise<void> {
  let 参数 = 校验发布参数()
  if (参数.仅上传 === true || 参数.删除 === true)
    throw new 网站发布错误('Pages 由 CI 构建和部署，仅支持 --build-only、--yes')
  let 目标 = 获取平台配置('github-pages', 读取网站配置())
  if (目标.启用 === false) throw new 网站发布错误('GitHub Pages 发布未启用')
  if (参数.仅构建 === true) {
    await 构建网站(目标.公共路径, 目标.产物目录)
    return
  }
  if (执行Git(['status', '--porcelain=v1', '--untracked-files=all']) !== '')
    throw new 网站发布错误('Pages 发布要求干净工作区，请先正常提交当前修改')
  let 当前提交 = 发布信息模式.shape.gitCommit.parse(执行Git(['rev-parse', '--verify', 'HEAD']))
  let 分支引用: string
  try {
    分支引用 = 执行Git(['symbolic-ref', '--quiet', 'HEAD'])
  } catch {
    throw new 网站发布错误('Pages 手动发布需要当前位于分支；detached HEAD 请先切换到已推送的分支')
  }
  if (分支引用.startsWith('refs/heads/') === false) throw new 网站发布错误('当前引用不是本地分支')
  let 远端引用: string
  try {
    远端引用 = 执行Git(['ls-remote', '--exit-code', '--heads', 'origin', 分支引用])
  } catch {
    throw new 网站发布错误('当前分支尚未推送至 origin，或无法读取远端分支，请先正常推送分支')
  }
  let [远端提交, 远端分支] = 远端引用.split('\t')
  if (远端分支 !== 分支引用 || 发布信息模式.shape.gitCommit.parse(远端提交) !== 当前提交)
    throw new 网站发布错误('origin 同名分支与当前 HEAD 不一致，请先正常提交并推送当前分支')
  console.log(`GitHub Pages 将通过分支 ${分支引用} 的网站工作流发布。`)
  if (参数.确认 === false) {
    console.log('确认后添加 --yes 触发发布。')
    return
  }
  execFileSync('gh', ['workflow', 'run', 'deploy-pages.yml', '--ref', 分支引用, '--field', 'target=github-pages'], {
    cwd: 网站项目根目录,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  console.log('已触发 GitHub Pages 发布，可在仓库 Actions 页面查看结果。')
}

function 执行Git(参数: string[]): string {
  return execFileSync('git', 参数, {
    cwd: 网站项目根目录,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
}

void 发布Pages().catch(报告网站发布错误)
