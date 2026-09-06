import fs from 'node:fs'
import path from 'node:path'

export let Node环境组 = ['development', 'production', 'test']
export let 构建目标组 = ['web', 'electron', 'sea', 'pure-frontend']

function 读取字段(内容, 字段名, 文件路径) {
  let 匹配结果 = new RegExp(`^\\s*${字段名}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s#]+))\\s*(?:#.*)?$`, 'mu').exec(内容)
  let 值 = 匹配结果?.[1] ?? 匹配结果?.[2] ?? 匹配结果?.[3]
  if (值 === undefined || 值 === '') throw new Error(`环境文件 ${文件路径} 缺少 ${字段名}`)
  return 值
}

export function 读取环境文件标识(文件路径) {
  let 内容 = fs.readFileSync(文件路径, 'utf8')
  let NODE_ENV = 读取字段(内容, 'NODE_ENV', 文件路径)
  let BUILD_TARGET = 读取字段(内容, 'BUILD_TARGET', 文件路径)
  if (Node环境组.includes(NODE_ENV) === false) throw new Error(`环境文件 ${文件路径} 的 NODE_ENV 无效: ${NODE_ENV}`)
  if (构建目标组.includes(BUILD_TARGET) === false)
    throw new Error(`环境文件 ${文件路径} 的 BUILD_TARGET 无效: ${BUILD_TARGET}`)
  return { NODE_ENV, BUILD_TARGET }
}

export function 发现环境文件(项目根目录) {
  let 环境目录 = path.resolve(项目根目录, '.env')
  if (fs.existsSync(环境目录) === false) throw new Error(`缺少环境文件目录: ${环境目录}`)
  let 环境文件组 = fs
    .readdirSync(环境目录, { withFileTypes: true })
    .filter((目录项) => 目录项.isFile() === true && 目录项.name.endsWith('.example') === true)
    .sort((左, 右) => 左.name.localeCompare(右.name))
    .map((目录项) => {
      let 示例文件 = `.env/${目录项.name}`
      let 本地文件 = 示例文件.slice(0, -'.example'.length)
      return { 示例文件, 本地文件, ...读取环境文件标识(path.resolve(项目根目录, 示例文件)) }
    })
  let 已有标识 = new Map()
  for (let 环境文件 of 环境文件组) {
    let 标识 = `${环境文件.NODE_ENV}:${环境文件.BUILD_TARGET}`
    let 已有文件 = 已有标识.get(标识)
    if (已有文件 !== undefined) throw new Error(`环境文件语义重复: ${已有文件}、${环境文件.示例文件} 都声明了 ${标识}`)
    已有标识.set(标识, 环境文件.示例文件)
  }
  return 环境文件组
}

export function 发现本地环境文件(项目根目录) {
  let 环境目录 = path.resolve(项目根目录, '.env')
  if (fs.existsSync(环境目录) === false) return []
  let 环境文件组 = fs
    .readdirSync(环境目录, { withFileTypes: true })
    .filter((目录项) => 目录项.isFile() === true && 目录项.name.endsWith('.example') === false)
    .sort((左, 右) => 左.name.localeCompare(右.name))
    .map((目录项) => {
      let 本地文件 = `.env/${目录项.name}`
      return { 本地文件, ...读取环境文件标识(path.resolve(项目根目录, 本地文件)) }
    })
  let 已有标识 = new Map()
  for (let 环境文件 of 环境文件组) {
    let 标识 = `${环境文件.NODE_ENV}:${环境文件.BUILD_TARGET}`
    let 已有文件 = 已有标识.get(标识)
    if (已有文件 !== undefined)
      throw new Error(`本地环境文件语义重复: ${已有文件}、${环境文件.本地文件} 都声明了 ${标识}`)
    已有标识.set(标识, 环境文件.本地文件)
  }
  return 环境文件组
}

export function 获得环境文件(项目根目录, 标识) {
  let 本地环境文件 = 发现本地环境文件(项目根目录).find(
    (候选文件) => 候选文件.NODE_ENV === 标识.NODE_ENV && 候选文件.BUILD_TARGET === 标识.BUILD_TARGET,
  )
  if (本地环境文件 !== undefined) return 本地环境文件.本地文件
  let 环境示例文件 = 发现环境文件(项目根目录).find(
    (候选文件) => 候选文件.NODE_ENV === 标识.NODE_ENV && 候选文件.BUILD_TARGET === 标识.BUILD_TARGET,
  )
  if (环境示例文件 === undefined)
    throw new Error(`没有找到环境文件: NODE_ENV=${标识.NODE_ENV}, BUILD_TARGET=${标识.BUILD_TARGET}`)
  return 环境示例文件.本地文件
}
