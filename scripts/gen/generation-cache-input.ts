import fs from 'node:fs'
import path from 'node:path'
import { 收集目录文件, 计算文件指纹 } from './content-fingerprint'

/** 保留全部项目源码依赖，跨文件类型、全局声明和动态导入不会因收窄目录漏掉。 */
export function 计算生成输入指纹(根目录: string, 输出们: readonly string[], 命令: readonly string[]): string {
  let 源码后缀 = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'])
  let 输出集 = new Set(输出们.map((文件): string => path.resolve(文件)))
  let 文件们 = [
    ...收集目录文件(path.join(根目录, 'src')).filter((文件): boolean => 源码后缀.has(path.extname(文件))),
    ...收集目录文件(path.join(根目录, 'scripts/gen')),
    ...收集目录文件(path.join(根目录, 'node_modules/@lsby/net-core')),
    ...fs
      .readdirSync(根目录)
      .filter((文件): boolean => /^tsconfig.*\.json$/u.test(文件))
      .map((文件): string => path.join(根目录, 文件)),
    ...['package.json', 'pnpm-lock.yaml', 'prisma/schema.prisma'].map((文件): string => path.join(根目录, 文件)),
  ]
  return 计算文件指纹(
    根目录,
    文件们.filter((文件): boolean => fs.existsSync(文件) && 输出集.has(path.resolve(文件)) === false),
    JSON.stringify({
      版本: 3,
      命令,
      node: process.version,
      平台: process.platform,
      环境: Object.entries(process.env).sort(),
    }),
  )
}
