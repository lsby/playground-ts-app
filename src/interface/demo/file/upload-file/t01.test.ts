import { 接口测试 } from '@lsby/net-core'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import streamToBlob from 'stream-to-blob'
import { z } from 'zod'
import { cleanDB } from '../../../../../scripts/db/clean-db'
import { 环境变量 } from '../../../../global/env'
import { kysely管理器, 系统配置ID } from '../../../../global/global'
import 接口 from './index'

let name = 'admin'
let pwd = '123456'

let 登录响应Schema = z.object({ data: z.record(z.string()) })

export default new 接口测试(
  接口,
  '成功',
  async () => {
    let db = kysely管理器.获得句柄()
    await cleanDB(db)
    await db
      .insertInto('system_config')
      .values({ id: 系统配置ID, is_initialized: 1, enable_register: 0, version: '', jwt_secret: '123' })
      .execute()
    await db
      .insertInto('user')
      .values({ id: randomUUID(), name: name, pwd: await bcrypt.hash(pwd, 环境变量.BCRYPT_ROUNDS), is_admin: 0 })
      .execute()
  },
  async () => {
    let base64Image = 'data:image/png;base64,iVBORw0KGgo...'
    let base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '')
    let buffer = Buffer.from(base64Data, 'base64')
    let readableStream = Readable.from([buffer])
    let blob = await streamToBlob(readableStream)

    let formData = new FormData()
    formData.append('file', blob, 'image.png')

    let urlPath = 接口.获得路径()
    let url = `http://127.0.0.1:${环境变量.APP_PORT}${urlPath}`

    let loginResponse = await fetch(`http://127.0.0.1:${环境变量.APP_PORT}${'/api/project/login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: name, userPassword: pwd }),
    })
    let parseResult = 登录响应Schema.safeParse(await loginResponse.json())
    if (parseResult.success === false) {
      throw new Error(`登录响应验证失败: ${parseResult.error.message}`)
    }
    let token = parseResult.data.data['token'] ?? ''

    let headers: Record<string, string> = { authorization: token }
    return (await fetch(url, { method: 'POST', headers, body: formData })).json()
  },
  async (_解析结果) => {},
)
