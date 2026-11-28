import inquirer from 'inquirer'
import { z } from 'zod'
import { 校验发布参数, 网站发布错误 } from '../../public/web-config'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

export async function 准备网站发布参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 参数 = 校验发布参数(上下文.参数)
  let 任务名称 = z.enum(['public:web:oss', 'public:web:github-pages']).parse(上下文.任务名称)
  let 平台: string
  switch (任务名称) {
    case 'public:web:oss':
      平台 = '阿里云 OSS'
      break
    case 'public:web:github-pages':
      平台 = 'GitHub Pages'
      if (参数.仅上传 === true || 参数.删除 === true)
        throw new 网站发布错误('Pages 由 CI 构建和部署，仅支持 --build-only、--yes')
      break
  }
  if (上下文.参数.length > 0 || process.stdin.isTTY !== true || process.stdout.isTTY !== true)
    return { 参数: [...上下文.参数] }
  let 回答 = await inquirer.prompt<{ 确认发布: boolean }>([
    { type: 'confirm', name: '确认发布', message: `是否发布纯前端网站到 ${平台}？`, default: false },
  ])
  if (回答.确认发布 === false) throw new 网站发布错误('已取消网站发布')
  return { 参数: ['--yes'] }
}
