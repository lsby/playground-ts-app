import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { Parcel基础参数, 纯前端生产环境文件 } from '../task/model/task-common'
import { 命令, 执行任务 } from '../task/model/task-runner'
import { 构建任务表 } from '../task/taskfile/taskfile-build'
import { 生成任务表 } from '../task/taskfile/taskfile-generate'
import { 质量任务表 } from '../task/taskfile/taskfile-quality'
import { 写入发布信息, 创建发布信息, 发布信息文件名, 发布信息模式 } from './release-info'
import { 公共路径模式, 网站发布错误, 网站项目根目录 } from './web-config'

let 网站构建信息模式 = z
  .object({ schemaVersion: z.literal(1), publicPath: 公共路径模式, gitCommit: 发布信息模式.shape.gitCommit })
  .strict()

export async function 构建网站(公共路径: string, 产物目录: string): Promise<void> {
  公共路径模式.parse(公共路径)
  创建发布信息(网站项目根目录, 纯前端生产环境文件)
  await 执行任务(
    {
      ...生成任务表,
      ...质量任务表,
      ...构建任务表,
      'bundle:web-no-scope-hoist': {
        ...构建任务表['bundle:web-no-scope-hoist'],
        运行: 命令(
          'parcel',
          ...Parcel基础参数,
          '--no-scope-hoist',
          '--dist-dir',
          'dist/src/web',
          '--public-url',
          公共路径,
        ),
      },
    },
    'build:web:pure-frontend',
    { 环境文件: 纯前端生产环境文件 },
  )
  let 原目录 = path.join(网站项目根目录, 'dist/src/web')
  let 发布信息 = 创建发布信息(网站项目根目录, 纯前端生产环境文件)
  写入发布信息(原目录, 发布信息)
  fs.writeFileSync(
    path.join(原目录, 'website-build.json'),
    `${JSON.stringify(网站构建信息模式.parse({ schemaVersion: 1, publicPath: 公共路径, gitCommit: 发布信息.gitCommit }), null, 2)}\n`,
  )
  复制网站产物(原目录, 产物目录)
}

export function 复制网站产物(原目录: string, 目标目录: string): void {
  let 发布目录 = path.join(网站项目根目录, 'dist/web-publish')
  if (path.dirname(目标目录) !== 发布目录) throw new 网站发布错误('网站产物目录必须直接位于 dist/web-publish')
  fs.rmSync(目标目录, { recursive: true, force: true })
  fs.cpSync(原目录, 目标目录, { recursive: true })
}

export function 验证网站产物(公共路径: string, 产物目录: string): void {
  let 当前发布信息 = 创建发布信息(网站项目根目录, 纯前端生产环境文件)
  if (当前发布信息.gitDirty === true) throw new 网站发布错误('上传已有产物要求 Git 工作区和暂存区干净')
  if (fs.existsSync(path.join(产物目录, 'index.html')) === false) throw new 网站发布错误('缺少网站首页，请先构建')
  let 发布信息 = 发布信息模式.parse(JSON.parse(fs.readFileSync(path.join(产物目录, 发布信息文件名), 'utf8')))
  let 构建信息 = 网站构建信息模式.parse(JSON.parse(fs.readFileSync(path.join(产物目录, 'website-build.json'), 'utf8')))
  if (
    发布信息.gitDirty === true ||
    发布信息.gitCommit !== 当前发布信息.gitCommit ||
    构建信息.gitCommit !== 当前发布信息.gitCommit ||
    构建信息.publicPath !== 公共路径
  )
    throw new 网站发布错误('网站产物的 Git 提交或公共路径不一致，请重新构建')
}

export function 获取网站文件(目录: string): string[] {
  let 文件: string[] = []
  for (let 项 of fs.readdirSync(目录, { withFileTypes: true })) {
    let 绝对路径 = path.join(目录, 项.name)
    if (项.isSymbolicLink() === true || 项.name.startsWith('.') === true)
      throw new 网站发布错误('网站产物禁止包含符号链接或隐藏文件')
    if (项.isDirectory() === true) 文件.push(...获取网站文件(绝对路径))
    else if (项.isFile() === true) 文件.push(绝对路径)
    else throw new 网站发布错误('网站产物包含非普通文件')
  }
  return 文件
}
