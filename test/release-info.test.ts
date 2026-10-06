import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { 写入发布信息, 创建发布信息 } from '../scripts/public/release-info'

function 执行Git(仓库目录: string, 参数组: string[]): string {
  return execFileSync('git', 参数组, { cwd: 仓库目录, encoding: 'utf8', windowsHide: true }).trim()
}

function 创建测试仓库(允许Dirty: boolean): string {
  let 仓库目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'release-info-test-'))
  执行Git(仓库目录, ['init'])
  执行Git(仓库目录, ['config', 'user.email', 'release-info-test@example.com'])
  执行Git(仓库目录, ['config', 'user.name', 'Release Info Test'])
  fs.writeFileSync(path.join(仓库目录, 'source.txt'), 'initial\n', 'utf8')
  fs.writeFileSync(
    path.join(仓库目录, '.env.test'),
    `CONFIG_ENCRYPTION = false\nDEPLOY_ALLOW_DIRTY_GIT = ${String(允许Dirty)}\n`,
    'utf8',
  )
  执行Git(仓库目录, ['add', '.'])
  执行Git(仓库目录, ['commit', '-m', 'initial'])
  return 仓库目录
}

describe('发布信息', (): void => {
  it('从干净 Git 仓库读取当前提交并写入独立文件', (): void => {
    let 仓库目录 = 创建测试仓库(false)
    try {
      let 发布信息 = 创建发布信息(仓库目录, '.env.test')
      expect(发布信息).toEqual({
        schemaVersion: 1,
        gitCommit: 执行Git(仓库目录, ['rev-parse', 'HEAD']),
        gitDirty: false,
      })

      let 输出目录 = path.join(仓库目录, 'result')
      let 文件路径 = 写入发布信息(输出目录, 发布信息)
      expect(JSON.parse(fs.readFileSync(文件路径, 'utf8'))).toEqual(发布信息)
    } finally {
      fs.rmSync(仓库目录, { recursive: true, force: true })
    }
  })

  it('按环境配置拒绝或标记 dirty 仓库', (): void => {
    let 仓库目录 = 创建测试仓库(false)
    try {
      fs.writeFileSync(path.join(仓库目录, 'source.txt'), 'changed\n', 'utf8')
      expect(() => 创建发布信息(仓库目录, '.env.test')).toThrow('当前环境禁止部署 dirty 产物')

      fs.writeFileSync(
        path.join(仓库目录, '.env.test'),
        'CONFIG_ENCRYPTION = false\nDEPLOY_ALLOW_DIRTY_GIT = true\n',
        'utf8',
      )
      expect(创建发布信息(仓库目录, '.env.test').gitDirty).toBe(true)
    } finally {
      fs.rmSync(仓库目录, { recursive: true, force: true })
    }
  })
})
