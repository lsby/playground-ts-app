import fs from 'node:fs'
import path from 'node:path'

let 排除目录组 = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'package',
  'release',
  'db',
  'android',
  '.parcel-cache',
])
let 文本扩展名组 = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
  '.md',
  '.html',
  '.css',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.svg',
  '.env',
  '.cs',
  '.java',
  '.kt',
  '.kts',
  '.gradle',
  '.properties',
  '.ps1',
  '.sh',
  '.command',
  '.cmd',
  '.bat',
])
let 文本文件名组 = new Set([
  'dockerfile',
  'containerfile',
  '.gitignore',
  '.dockerignore',
  '.prettierignore',
  '.prettierrc',
  '.npmrc',
])

function 递归读取文本文件(目录路径) {
  let 文件组 = []
  for (let 目录项 of fs.readdirSync(目录路径, { withFileTypes: true })) {
    if (目录项.isDirectory() === true && 排除目录组.has(目录项.name) === true) continue
    let 完整路径 = path.join(目录路径, 目录项.name)
    if (目录项.isDirectory() === true) {
      文件组.push(...递归读取文本文件(完整路径))
      continue
    }
    if (目录项.isFile() === false) continue
    let 文件名 = 目录项.name.toLowerCase()
    let 扩展名 = path.extname(文件名)
    if (文本扩展名组.has(扩展名) === true || 文本文件名组.has(文件名) === true || 文件名.startsWith('.env') === true) {
      文件组.push(完整路径)
    }
  }
  return 文件组
}

export function 解析当前包名(项目根目录) {
  let 包信息 = JSON.parse(fs.readFileSync(path.resolve(项目根目录, 'package.json'), 'utf8'))
  if (typeof 包信息.name !== 'string') throw new Error('package.json 缺少 name')
  let 匹配结果 = /^@([^/]+)\/(.+)$/u.exec(包信息.name)
  let 作者名 = 匹配结果?.[1]
  let 项目名 = 匹配结果?.[2]
  if (作者名 === undefined || 项目名 === undefined) throw new Error('项目重命名要求 package.name 使用 @作者/项目 格式')
  return { 作者名, 项目名 }
}

export function 执行项目重命名({ 项目根目录, 新作者名, 新项目名 }) {
  let 当前名称 = 解析当前包名(项目根目录)
  if (当前名称.作者名 === 新作者名 && 当前名称.项目名 === 新项目名) {
    console.log('[跳过] 项目名称没有变化')
    return 0
  }
  let 替换表 = [
    [`@${当前名称.作者名}/${当前名称.项目名}`, `@${新作者名}/${新项目名}`],
    [`@${当前名称.作者名}:${当前名称.项目名}`, `@${新作者名}:${新项目名}`],
    [`${当前名称.作者名}.${当前名称.项目名.replaceAll('-', '.')}`, `${新作者名}.${新项目名.replaceAll('-', '.')}`],
    [`${当前名称.作者名}-${当前名称.项目名}`, `${新作者名}-${新项目名}`],
  ]
  let 修改数量 = 0
  for (let 文件路径 of 递归读取文本文件(项目根目录)) {
    try {
      let 原内容 = fs.readFileSync(文件路径, 'utf8')
      let 新内容 = 原内容
      for (let [旧名称, 新名称] of 替换表) 新内容 = 新内容.replaceAll(旧名称, 新名称)
      if (新内容 === 原内容) continue
      fs.writeFileSync(文件路径, 新内容)
      修改数量 += 1
      console.log(`[完成] 已重命名：${path.relative(项目根目录, 文件路径)}`)
    } catch (错误) {
      console.log(`[跳过] 无法处理 ${path.relative(项目根目录, 文件路径)}：${String(错误)}`)
    }
  }
  console.log(`项目重命名完成，共修改 ${修改数量} 个文件`)
  return 修改数量
}
