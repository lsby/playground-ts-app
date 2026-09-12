import { expect } from '@playwright/test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'

import { 演示_点击, 演示_输入 } from '../../../src/model/test-interactive'
import type { 快照配置 } from '../../../src/model/test-requirement'
import type { 演示需求流程上下文 } from './demo-model'

let 快照数据文件名 = 'checkpoint-data.json'

let 系统配置Schema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  is_initialized: z.number().int(),
  enable_register: z.number().int(),
  enable_get_interface_type: z.number().int(),
  version: z.string(),
  jwt_secret: z.string(),
})

let 用户Schema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  name: z.string(),
  pwd: z.string(),
  is_admin: z.number().int(),
})

let 用户配置Schema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  user_id: z.string(),
  theme: z.string(),
})

let 快照数据Schema = z.object({
  记录时间: z.string(),
  数据库: z.object({
    系统配置列表: z.array(系统配置Schema),
    用户列表: z.array(用户Schema),
    用户配置列表: z.array(用户配置Schema),
  }),
})

export function 创建演示快照配置(快照根目录: string): 快照配置<演示需求流程上下文> {
  return {
    根目录: 快照根目录,
    创建: async ({ 快照目录 }): Promise<void> => {
      let { kysely管理器 } = await import('../../../src/global/global')
      let 数据库 = kysely管理器.获得句柄()
      let 快照数据 = {
        记录时间: new Date().toISOString(),
        数据库: {
          系统配置列表: await 数据库.selectFrom('system_config').selectAll().execute(),
          用户列表: await 数据库.selectFrom('user').selectAll().execute(),
          用户配置列表: await 数据库.selectFrom('user_config').selectAll().execute(),
        },
      }
      await fs.writeFile(path.join(快照目录, 快照数据文件名), `${JSON.stringify(快照数据, undefined, 2)}\n`, 'utf8')
    },
    恢复: async ({ 上下文, 快照目录 }): Promise<void> => {
      let [{ cleanDB }, { kysely管理器 }] = await Promise.all([
        import('../../../scripts/db/clean-db'),
        import('../../../src/global/global'),
      ])
      let 快照数据 = 快照数据Schema.parse(JSON.parse(await fs.readFile(path.join(快照目录, 快照数据文件名), 'utf8')))
      let 数据库 = kysely管理器.获得句柄()
      await cleanDB(数据库)
      if (快照数据.数据库.系统配置列表.length > 0)
        await 数据库.insertInto('system_config').values(快照数据.数据库.系统配置列表).execute()
      if (快照数据.数据库.用户列表.length > 0)
        await 数据库.insertInto('user').values(快照数据.数据库.用户列表).execute()
      if (快照数据.数据库.用户配置列表.length > 0)
        await 数据库.insertInto('user_config').values(快照数据.数据库.用户配置列表).execute()

      let 新增用户 = 快照数据.数据库.用户列表.find(
        (用户) => 用户.is_admin === 1 && 用户.name.endsWith(上下文.系统.新用户名后缀),
      )
      if (新增用户 === undefined) throw new Error('快照中缺少待继续维护的新增管理员用户')
      await 上下文.系统.page.goto('/demo/login.html')
      await 演示_输入(上下文.系统.page.getByRole('textbox', { name: '用户名' }), 'admin')
      await 演示_输入(上下文.系统.page.getByRole('textbox', { name: '密码' }), '123456')
      await 演示_点击(上下文.系统.page.getByRole('button', { name: '登录演示系统' }))
      await 上下文.系统.page.waitForURL('**/demo/index.html')
      await 演示_点击(上下文.系统.page.getByRole('tab', { name: '业务示例', exact: true }))
      await expect(上下文.系统.page.getByRole('cell', { name: 新增用户.name, exact: true })).toBeVisible()
    },
  }
}
