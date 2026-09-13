import fs from 'node:fs'
import path from 'node:path'

export let Node环境组 = ['development', 'production', 'test']

function 读取字段(内容, 字段名, 文件路径) {
  let 匹配结果 = new RegExp(`^\\s*${字段名}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s#]+))\\s*(?:#.*)?$`, 'mu').exec(内容)
  let 值 = 匹配结果?.[1] ?? 匹配结果?.[2] ?? 匹配结果?.[3]
  if (值 === undefined || 值 === '') throw new Error(`环境文件 ${文件路径} 缺少 ${字段名}`)
  return 值
}

export function 读取Node环境(文件路径) {
  let 内容 = fs.readFileSync(文件路径, 'utf8')
  let NODE_ENV = 读取字段(内容, 'NODE_ENV', 文件路径)
  if (Node环境组.includes(NODE_ENV) === false) throw new Error(`环境文件 ${文件路径} 的 NODE_ENV 无效: ${NODE_ENV}`)
  return NODE_ENV
}

export function 发现环境文件(项目根目录) {
  let 环境目录 = path.resolve(项目根目录, '.env')
  if (fs.existsSync(环境目录) === false) throw new Error(`缺少环境文件目录: ${环境目录}`)
  return fs
    .readdirSync(环境目录, { withFileTypes: true })
    .filter((目录项) => 目录项.isFile() === true && 目录项.name.endsWith('.example') === true)
    .sort((左, 右) => 左.name.localeCompare(右.name))
    .map((目录项) => {
      let 示例文件 = `.env/${目录项.name}`
      let 本地文件 = 示例文件.slice(0, -'.example'.length)
      return { 示例文件, 本地文件 }
    })
}
