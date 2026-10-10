import crypto from 'node:crypto'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { 读取项目密钥 } from '../setup/env-crypto-core.mjs'
import { 项目根目录 } from './config'

let 魔数 = Buffer.from('NUGGET-EXTERNAL-LFS\0', 'utf8')
let 头Schema = z
  .object({
    version: z.literal(1),
    keyId: z.string().regex(/^[a-f0-9]{16}$/u),
    purpose: z.enum(['manifest', 'object']),
    identity: z.string().min(1),
    salt: z.string().min(1),
    iv: z.string().min(1),
  })
  .strict()
type 文件头 = z.infer<typeof 头Schema>
type 密钥信息 = { 密钥标识: string; 密钥: Buffer }

function 读取密钥(): 密钥信息 {
  return 读取项目密钥(项目根目录) as 密钥信息
}

function 派生密钥(主密钥: Buffer, 盐: Buffer): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', 主密钥, 盐, Buffer.from('nugget-external-lfs:v1'), 32))
}

function 编码头(头: 文件头): Buffer {
  let 内容 = Buffer.from(JSON.stringify(头), 'utf8')
  let 长度 = Buffer.alloc(4)
  长度.writeUInt32BE(内容.length)
  return Buffer.concat([魔数, 长度, 内容])
}

function 读取头(文件路径: string): { 头: 文件头; 前缀长度: number; 文件大小: number } {
  let 文件大小 = fs.statSync(文件路径).size
  let 句柄 = fs.openSync(文件路径, 'r')
  try {
    let 固定部分 = Buffer.alloc(魔数.length + 4)
    if (fs.readSync(句柄, 固定部分, 0, 固定部分.length, 0) !== 固定部分.length) throw new Error('加密文件头不完整')
    if (固定部分.subarray(0, 魔数.length).equals(魔数) === false) throw new Error('加密文件魔数无效')
    let 头长度 = 固定部分.readUInt32BE(魔数.length)
    if (头长度 <= 0 || 头长度 > 16_384) throw new Error('加密文件头长度无效')
    let 内容 = Buffer.alloc(头长度)
    if (fs.readSync(句柄, 内容, 0, 头长度, 固定部分.length) !== 头长度) throw new Error('加密文件头不完整')
    let 头 = 头Schema.parse(JSON.parse(内容.toString('utf8')))
    return { 头, 前缀长度: 固定部分.length + 头长度, 文件大小 }
  } finally {
    fs.closeSync(句柄)
  }
}

export async function 加密文件(源路径: string, 目标路径: string, 用途: 文件头['purpose'], 标识: string): Promise<void> {
  let 密钥信息 = 读取密钥()
  let 盐 = crypto.randomBytes(32)
  let 初始化向量 = crypto.randomBytes(12)
  let 头: 文件头 = {
    version: 1,
    keyId: 密钥信息.密钥标识,
    purpose: 用途,
    identity: 标识,
    salt: 盐.toString('base64url'),
    iv: 初始化向量.toString('base64url'),
  }
  let 编码内容 = 编码头(头)
  fs.writeFileSync(目标路径, 编码内容, { flag: 'wx' })
  let 加密器 = crypto.createCipheriv('aes-256-gcm', 派生密钥(密钥信息.密钥, 盐), 初始化向量)
  加密器.setAAD(编码内容)
  await pipeline(fs.createReadStream(源路径), 加密器, fs.createWriteStream(目标路径, { flags: 'a' }))
  fs.appendFileSync(目标路径, 加密器.getAuthTag())
}

export async function 解密文件(
  源路径: string,
  目标路径: string,
  用途: 文件头['purpose'],
  标识?: string,
): Promise<void> {
  let { 头, 前缀长度, 文件大小 } = 读取头(源路径)
  if (头.purpose !== 用途 || (标识 !== undefined && 头.identity !== 标识))
    throw new Error(`加密文件身份不匹配: ${源路径}`)
  let 密钥信息 = 读取密钥()
  if (头.keyId !== 密钥信息.密钥标识) throw new Error(`加密文件与当前项目密钥不匹配: ${源路径}`)
  if (文件大小 < 前缀长度 + 16) throw new Error(`加密文件内容不完整: ${源路径}`)
  let 标签 = Buffer.alloc(16)
  let 句柄 = fs.openSync(源路径, 'r')
  try {
    fs.readSync(句柄, 标签, 0, 16, 文件大小 - 16)
  } finally {
    fs.closeSync(句柄)
  }
  let 解密器 = crypto.createDecipheriv(
    'aes-256-gcm',
    派生密钥(密钥信息.密钥, Buffer.from(头.salt, 'base64url')),
    Buffer.from(头.iv, 'base64url'),
  )
  解密器.setAAD(编码头(头))
  解密器.setAuthTag(标签)
  if (文件大小 === 前缀长度 + 16) {
    fs.writeFileSync(目标路径, Buffer.concat([解密器.final()]), { flag: 'wx' })
    return
  }
  await pipeline(
    fs.createReadStream(源路径, { start: 前缀长度, end: 文件大小 - 17 }),
    解密器,
    fs.createWriteStream(目标路径, { flags: 'wx' }),
  )
}
