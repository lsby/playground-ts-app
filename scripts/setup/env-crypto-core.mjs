import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export let 加密开关名称 = 'CONFIG_ENCRYPTION'
export let 项目密钥相对路径 = '.project-config.key'
let 密文前缀 = 'encrypted:v1:'

function 解析行(内容) {
  let 换行符 = 内容.includes('\r\n') === true ? '\r\n' : '\n'
  let 是否以换行结尾 = 内容.endsWith('\n')
  let 原始行组 = 内容.split(/\r?\n/u)
  if (是否以换行结尾 === true) 原始行组.pop()
  let 已出现名称 = new Set()
  let 行组 = 原始行组.map((原始行, 索引) => {
    let 匹配 = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/u.exec(原始行)
    if (匹配 === null) return { 类型: '原始', 原始行 }
    let 前缀 = 匹配[1]
    let 名称 = 匹配[2]
    let 赋值符 = 匹配[3]
    let 值 = 匹配[4]
    if (前缀 === undefined || 名称 === undefined || 赋值符 === undefined || 值 === undefined) {
      throw new Error(`环境文件第 ${String(索引 + 1)} 行解析失败`)
    }
    if (已出现名称.has(名称) === true) throw new Error(`环境文件存在重复字段: ${名称}`)
    已出现名称.add(名称)
    return { 类型: '赋值', 原始行, 前缀, 名称, 赋值符, 值 }
  })
  return { 行组, 换行符, 是否以换行结尾 }
}

function 输出行(文档, 处理函数) {
  let 内容 = 文档.行组
    .map((行) => {
      if (行.类型 === '原始') return 行.原始行
      return 处理函数(行)
    })
    .join(文档.换行符)
  return 文档.是否以换行结尾 === true ? `${内容}${文档.换行符}` : 内容
}

function 读取开关(文档, 文件路径) {
  let 开关行 = 文档.行组.find((行) => 行.类型 === '赋值' && 行.名称 === 加密开关名称)
  if (开关行 === undefined || 开关行.类型 !== '赋值') {
    throw new Error(`环境文件 ${文件路径} 缺少首部字段 ${加密开关名称}`)
  }
  let 值 = 开关行.值.trim()
  if (值 !== 'true' && 值 !== 'false') {
    throw new Error(`环境文件 ${文件路径} 的 ${加密开关名称} 必须是 true 或 false`)
  }
  return 值 === 'true'
}

function 解析密钥文件(内容, 文件路径) {
  let 值
  try {
    值 = JSON.parse(内容)
  } catch (错误) {
    throw new Error(`项目密钥文件无法解析: ${文件路径}`, { cause: 错误 })
  }
  if (
    typeof 值 !== 'object' ||
    值 === null ||
    Array.isArray(值) === true ||
    值.version !== 1 ||
    typeof 值.keyId !== 'string' ||
    /^[a-f0-9]{16}$/u.test(值.keyId) === false ||
    typeof 值.key !== 'string'
  ) {
    throw new Error(`项目密钥文件不符合契约: ${文件路径}`)
  }
  let 密钥 = Buffer.from(值.key, 'base64url')
  if (密钥.length !== 32) throw new Error(`项目密钥长度无效: ${文件路径}`)
  return { 版本: 1, 密钥标识: 值.keyId, 密钥 }
}

export function 读取项目密钥(项目根目录) {
  let 密钥路径 = path.resolve(项目根目录, 项目密钥相对路径)
  if (fs.existsSync(密钥路径) === false) {
    throw new Error(`当前环境文件已加密，但缺少项目密钥: ${密钥路径}`)
  }
  return 解析密钥文件(fs.readFileSync(密钥路径, 'utf8'), 密钥路径)
}

export function 生成项目密钥(项目根目录) {
  let 密钥路径 = path.resolve(项目根目录, 项目密钥相对路径)
  if (fs.existsSync(密钥路径) === true) return 读取项目密钥(项目根目录)
  let 密钥 = crypto.randomBytes(32)
  let 密钥标识 = crypto.createHash('sha256').update(密钥).digest('hex').slice(0, 16)
  let 内容 = `${JSON.stringify({ version: 1, keyId: 密钥标识, key: 密钥.toString('base64url') }, null, 2)}\n`
  fs.writeFileSync(密钥路径, 内容, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return { 版本: 1, 密钥标识, 密钥 }
}

function 获得附加认证数据(项目根目录, 文件路径, 字段名) {
  let 相对路径 = path.relative(项目根目录, path.resolve(文件路径)).replaceAll('\\', '/')
  if (相对路径 === '' || 相对路径.startsWith('../') === true || path.isAbsolute(相对路径) === true) {
    throw new Error(`环境文件必须位于项目目录内: ${文件路径}`)
  }
  return Buffer.from(`${相对路径}::${字段名}`, 'utf8')
}

function 加密值(原始值, 密钥信息, 附加认证数据) {
  let 初始化向量 = crypto.randomBytes(12)
  let 加密器 = crypto.createCipheriv('aes-256-gcm', 密钥信息.密钥, 初始化向量)
  加密器.setAAD(附加认证数据)
  let 密文 = Buffer.concat([加密器.update(原始值, 'utf8'), 加密器.final()])
  let 认证标签 = 加密器.getAuthTag()
  return `${密文前缀}${密钥信息.密钥标识}:${初始化向量.toString('base64url')}:${认证标签.toString('base64url')}:${密文.toString('base64url')}`
}

function 解密值(密文值, 密钥信息, 附加认证数据, 字段名) {
  let 部分 = 密文值.split(':')
  let [标识, 版本, 密钥标识, 初始化向量文本, 认证标签文本, 密文文本, 多余内容] = 部分
  if (
    标识 !== 'encrypted' ||
    版本 !== 'v1' ||
    密钥标识 === undefined ||
    初始化向量文本 === undefined ||
    认证标签文本 === undefined ||
    密文文本 === undefined ||
    多余内容 !== undefined
  ) {
    throw new Error(`字段 ${字段名} 的密文格式无效`)
  }
  if (密钥标识 !== 密钥信息.密钥标识) throw new Error(`字段 ${字段名} 与当前项目密钥不匹配`)
  try {
    let 初始化向量 = Buffer.from(初始化向量文本, 'base64url')
    let 认证标签 = Buffer.from(认证标签文本, 'base64url')
    let 密文 = Buffer.from(密文文本, 'base64url')
    if (初始化向量.length !== 12 || 认证标签.length !== 16) throw new Error('密文长度无效')
    let 解密器 = crypto.createDecipheriv('aes-256-gcm', 密钥信息.密钥, 初始化向量)
    解密器.setAAD(附加认证数据)
    解密器.setAuthTag(认证标签)
    return Buffer.concat([解密器.update(密文), 解密器.final()]).toString('utf8')
  } catch (错误) {
    throw new Error(`字段 ${字段名} 解密或完整性校验失败`, { cause: 错误 })
  }
}

export function 解密环境文本({ 项目根目录, 文件路径, 加密内容 }) {
  let 文档 = 解析行(加密内容)
  if (读取开关(文档, 文件路径) === false) return 加密内容
  let 密钥信息 = 读取项目密钥(项目根目录)
  return 输出行(文档, (行) => {
    if (行.名称 === 加密开关名称) return `${行.前缀}${行.名称}${行.赋值符}false`
    if (行.值.startsWith(密文前缀) === false) throw new Error(`加密环境文件中存在明文字段: ${行.名称}`)
    let 值 = 解密值(行.值, 密钥信息, 获得附加认证数据(项目根目录, 文件路径, 行.名称), 行.名称)
    return `${行.前缀}${行.名称}${行.赋值符}${值}`
  })
}

export function 加密环境文本({ 项目根目录, 文件路径, 明文内容, 现有加密内容 }) {
  let 明文文档 = 解析行(明文内容)
  if (读取开关(明文文档, 文件路径) === true) throw new Error(`待加密文件必须标记为明文: ${文件路径}`)
  let 密钥信息 = 生成项目密钥(项目根目录)
  let 可复用密文 = new Map()
  if (现有加密内容 !== undefined) {
    let 旧文档 = 解析行(现有加密内容)
    if (读取开关(旧文档, 文件路径) === true) {
      for (let 行 of 旧文档.行组) {
        if (行.类型 !== '赋值' || 行.名称 === 加密开关名称) continue
        let 附加认证数据 = 获得附加认证数据(项目根目录, 文件路径, 行.名称)
        let 旧明文 = 解密值(行.值, 密钥信息, 附加认证数据, 行.名称)
        可复用密文.set(行.名称, { 明文: 旧明文, 密文: 行.值 })
      }
    }
  }
  return 输出行(明文文档, (行) => {
    if (行.名称 === 加密开关名称) return `${行.前缀}${行.名称}${行.赋值符}true`
    let 已有 = 可复用密文.get(行.名称)
    let 值 =
      已有 !== undefined && 已有.明文 === 行.值
        ? 已有.密文
        : 加密值(行.值, 密钥信息, 获得附加认证数据(项目根目录, 文件路径, 行.名称))
    return `${行.前缀}${行.名称}${行.赋值符}${值}`
  })
}

export function 读取环境文件明文(项目根目录, 文件路径) {
  let 绝对路径 = path.resolve(项目根目录, 文件路径)
  if (fs.existsSync(绝对路径) === false) throw new Error(`找不到环境文件: ${文件路径}`)
  return 解密环境文本({ 项目根目录, 文件路径: 绝对路径, 加密内容: fs.readFileSync(绝对路径, 'utf8') })
}

export function 发现正式环境文件(项目根目录) {
  let 环境目录 = path.resolve(项目根目录, '.env')
  if (fs.existsSync(环境目录) === false) throw new Error(`缺少环境文件目录: ${环境目录}`)
  return fs
    .readdirSync(环境目录, { withFileTypes: true })
    .filter(
      (项) => 项.isFile() === true && 项.name.startsWith('.env.') === true && 项.name.endsWith('.decode') === false,
    )
    .map((项) => `.env/${项.name}`)
    .sort((左, 右) => 左.localeCompare(右))
}
