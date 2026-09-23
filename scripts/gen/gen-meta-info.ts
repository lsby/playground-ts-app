import fs from 'fs'
import path from 'path'
import { z } from 'zod'

let 包信息模式 = z.object({
  name: z.string().regex(/^@[a-z0-9-]+\/[a-z0-9-]+$/u),
  version: z.string().regex(/^[0-9A-Za-z.+-]+$/u),
})

let 包信息 = 包信息模式.parse(JSON.parse(fs.readFileSync('package.json', 'utf-8')))
let 版本号 = 包信息.version
let 项目标识 = 包信息.name.slice(1).replace('/', '-')

let 输出路径 = path.resolve(import.meta.dirname, '../../src/app/meta-info.ts')
fs.writeFileSync(输出路径, `export let version: string = '${版本号}'\nexport let 项目标识: string = '${项目标识}'\n`)
