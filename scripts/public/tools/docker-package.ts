import fs from 'node:fs'
import path from 'node:path'
import { 获取完整忽略名单 } from './archive'

export function 获取Docker打包选项(
  项目根目录: string,
  环境: 'development' | 'production',
  复用本地构建: boolean,
): { 包含名单: string[]; 忽略名单: string[]; Docker忽略内容: string } {
  // 任务表在执行数据库任务时也会加载其他任务及准备器，保留全部工程脚本。
  let 包含名单 = [
    'package.json',
    'pnpm-lock.yaml',
    'patches/**/*',
    'public/**/*',
    'prisma/**/*',
    'prisma.config.ts',
    'tsconfig*.json',
    'scripts/**/*',
    `deploy/${环境}/**/*`,
  ]
  if (复用本地构建 === false || 环境 === 'development') 包含名单.push('src/**/*')
  if (复用本地构建 === false)
    包含名单.push(
      '.parcelrc',
      '.prettierrc',
      '.prettierignore',
      'eslint.config.mjs',
      'vitest.config.ts',
      'vite.config/**/*',
    )
  let 忽略名单 = 获取完整忽略名单(项目根目录)
  let Docker忽略内容 = fs.readFileSync(path.join(项目根目录, '.dockerignore'), 'utf8').replaceAll('\r\n', '\n')
  if (复用本地构建 === true) {
    包含名单.push('dist/**/*')
    忽略名单 = 忽略名单.filter((项) => ['dist', 'dist/**', '/dist', '/dist/**'].includes(项) === false)
    Docker忽略内容 = `${Docker忽略内容.trimEnd()}\n\n# 远程部署复用本地构建产物\n!dist\n!dist/**\n`
  }
  忽略名单.push('.dockerignore')
  return { 包含名单, 忽略名单, Docker忽略内容 }
}
