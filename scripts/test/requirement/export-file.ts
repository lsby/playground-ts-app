import { randomUUID } from 'node:crypto'
import { link, lstat, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { format, resolveConfig } from 'prettier'

import { 生成需求测试代码 } from './export-operation-record'
import { 读取需求描述文件, 需求描述文件名, 需求流程文件名格式, 需求目录名格式 } from './requirement-file'
import { 需求测试运行器 } from './run-requirement'

type 导出参数 = Omit<Parameters<typeof 生成需求测试代码>[0], '需求模块路径' | '覆盖验收点键们'> & {
  文件名: string
  需求目录名: string
  覆盖验收点键们?: readonly string[] | undefined
}
let 导出队列 = Promise.resolve()

async function 获得前端目录首页(项目根目录: string): Promise<ReadonlyMap<string, string>> {
  let 页面目录 = path.join(项目根目录, 'src', 'web', 'page')
  let 首页们 = new Map<string, string>()
  for (let 项 of await readdir(页面目录, { recursive: true, withFileTypes: true })) {
    if (项.isFile() === false || 项.name !== 'index.html') continue
    let 相对目录 = path.relative(页面目录, 项.parentPath)
    if (相对目录 === '') continue
    let 路径 = `/${相对目录.split(path.sep).map(encodeURIComponent).join('/')}/`
    首页们.set(路径, `${路径}index.html`)
  }
  return 首页们
}

export function 写出需求测试(项目根目录: string, 参数: 导出参数): Promise<string> {
  let 导出 = 导出队列.then(async (): Promise<string> => {
    if (需求流程文件名格式.test(参数.文件名) === false) throw new Error('导出文件名必须是英文小写短横线命名的 .ts 文件')
    if (需求目录名格式.test(参数.需求目录名) === false) throw new Error('需求目录名必须使用英文小写短横线命名')
    let 需求目录 = path.join(项目根目录, 'test', 'requirement', 参数.需求目录名)
    if ((await lstat(需求目录)).isDirectory() === false) throw new Error(`需求目录必须是普通目录：${需求目录}`)
    let 文件 = path.join(需求目录, 参数.文件名)
    let { 业务需求, 验收点们 } = await 读取需求描述文件(path.join(需求目录, 需求描述文件名))
    let 字典键们 = Object.keys(验收点们)
    let 覆盖验收点键们 = 参数.覆盖验收点键们
    if (覆盖验收点键们 === undefined) {
      if (业务需求.获得验收点们().length !== 1) throw new Error('需求包含多个验收点，必须指定覆盖的验收点键名')
      覆盖验收点键们 = 字典键们
    }
    if (覆盖验收点键们.length === 0 || new Set(覆盖验收点键们).size !== 覆盖验收点键们.length)
      throw new Error('必须指定至少一个验收点键名，且不能重复')
    for (let 键 of 覆盖验收点键们) if (字典键们.includes(键) === false) throw new Error(`需求没有验收点键「${键}」`)
    let 流程名称 = 参数.流程名称.trim()
    let 目录首页 = await 获得前端目录首页(项目根目录)
    let 源码 = 生成需求测试代码({
      ...参数,
      流程名称,
      需求模块路径: `./${需求描述文件名.slice(0, -'.ts'.length)}`,
      覆盖验收点键们,
      测试地址: { ...参数.测试地址, 目录首页 },
    })
    let { 流程们: 已有流程们, 需求们: 已有需求们 } = await new 需求测试运行器(项目根目录).发现登记()
    if (已有流程们.some(({ 流程 }) => 流程.获得名称() === 流程名称)) throw new Error(`需求测试已有流程「${流程名称}」`)
    let 需求名称 = 业务需求.获得名称()
    if (已有需求们.some((需求) => 需求 !== 业务需求 && 需求.获得名称() === 需求名称))
      throw new Error(`需求测试已有不同定义的同名需求「${需求名称}」`)
    let 格式 = await resolveConfig(文件)
    let 内容 = await format(源码, { ...格式, filepath: 文件 })
    let 临时文件 = `${文件}.${randomUUID()}.tmp`
    try {
      await writeFile(临时文件, 内容, { encoding: 'utf8', flag: 'wx' })
      // 原子地发布完整文件，同名文件存在时由文件系统拒绝覆盖。
      await link(临时文件, 文件)
    } finally {
      await rm(临时文件, { force: true })
    }
    return 文件
  })
  导出队列 = 导出.then(
    (): void => {},
    (): void => {},
  )
  return 导出
}
