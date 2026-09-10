import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

import { 检查非空文本 } from './model'

export type 快照运行位置 = {
  流程名称: string
  状态名称: string
  状态行为描述们: readonly string[]
  下一个步骤下标: number
  已完成步骤描述们: readonly string[]
}

export type 快照清单 = {
  版本: 1
  uuid: string
  创建时间: string
  说明: string
  运行位置: 快照运行位置
  选择们: Readonly<Record<string, string | number | boolean>>
  已满足依赖们: readonly string[]
}

export type 快照回调参数<上下文> = { 上下文: 上下文; 快照目录: string; 清单: 快照清单 }

export type 快照配置<上下文> = {
  根目录: string
  创建: (参数: 快照回调参数<上下文>) => Promise<void>
  恢复: (参数: 快照回调参数<上下文>) => Promise<void>
}

export class 快照管理器<上下文> {
  public static readonly 清单文件名 = 'snapshot.json'

  private readonly 配置: 快照配置<上下文>
  private readonly 上下文: 上下文

  public constructor(配置: 快照配置<上下文>, 上下文: 上下文) {
    if (!isAbsolute(配置.根目录)) throw new Error(`快照根目录必须是绝对路径：${配置.根目录}`)
    this.配置 = 配置
    this.上下文 = 上下文
  }

  public async 创建(参数: {
    说明: string
    运行位置: 快照运行位置
    选择们: Readonly<Record<string, string | number | boolean>>
    已满足依赖们: readonly string[]
  }): Promise<快照清单> {
    let uuid = randomUUID()
    let 根目录 = resolve(this.配置.根目录)
    let 临时目录 = this.解析子目录(`.creating-${uuid}`)
    let 最终目录 = this.解析子目录(uuid)
    let 清单: 快照清单 = {
      版本: 1,
      uuid,
      创建时间: new Date().toISOString(),
      说明: 检查非空文本('快照说明', 参数.说明),
      运行位置: {
        流程名称: 检查非空文本('快照流程名称', 参数.运行位置.流程名称),
        状态名称: 检查非空文本('快照状态名称', 参数.运行位置.状态名称),
        状态行为描述们: [...参数.运行位置.状态行为描述们],
        下一个步骤下标: 参数.运行位置.下一个步骤下标,
        已完成步骤描述们: [...参数.运行位置.已完成步骤描述们],
      },
      选择们: { ...参数.选择们 },
      已满足依赖们: [...参数.已满足依赖们],
    }
    if (!Number.isSafeInteger(清单.运行位置.下一个步骤下标) || 清单.运行位置.下一个步骤下标 < 0)
      throw new Error('快照的下一个步骤下标必须是非负安全整数')
    await mkdir(根目录, { recursive: true })
    await mkdir(临时目录)
    try {
      await this.配置.创建({ 上下文: this.上下文, 快照目录: 临时目录, 清单 })
      await writeFile(resolve(临时目录, 快照管理器.清单文件名), `${JSON.stringify(清单, undefined, 2)}\n`, 'utf8')
      await rename(临时目录, 最终目录)
      return 清单
    } catch (错误) {
      await rm(临时目录, { recursive: true, force: true })
      throw 错误
    }
  }

  public async 读取(uuid: string): Promise<{ 清单: 快照清单; 快照目录: string }> {
    this.检查Uuid(uuid)
    let 快照目录 = this.解析子目录(uuid)
    let 信息 = await stat(快照目录).catch(() => undefined)
    if (信息?.isDirectory() !== true) throw new Error(`快照不存在：${uuid}`)
    let 内容 = await readFile(resolve(快照目录, 快照管理器.清单文件名), 'utf8')
    let 清单 = this.解析清单(JSON.parse(内容) as unknown)
    if (清单.uuid !== uuid) throw new Error(`快照目录与清单 UUID 不一致：${uuid}`)
    return { 清单, 快照目录 }
  }

  public async 恢复(uuid: string): Promise<快照清单> {
    let { 清单, 快照目录 } = await this.读取(uuid)
    await this.配置.恢复({ 上下文: this.上下文, 快照目录, 清单 })
    return 清单
  }

  private 解析子目录(名称: string): string {
    let 根目录 = resolve(this.配置.根目录)
    let 结果 = resolve(根目录, 名称)
    let 相对路径 = relative(根目录, 结果)
    if (相对路径 === '' || 相对路径.startsWith('..') || isAbsolute(相对路径)) throw new Error(`非法快照目录：${名称}`)
    return 结果
  }

  private 检查Uuid(uuid: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid))
      throw new Error(`快照 UUID 格式无效：${uuid}`)
  }

  private 解析清单(值: unknown): 快照清单 {
    if (typeof 值 !== 'object' || 值 === null) throw new Error('快照清单不是对象')
    let 清单 = 值 as Record<string, unknown>
    if (
      清单['版本'] !== 1 ||
      typeof 清单['uuid'] !== 'string' ||
      typeof 清单['创建时间'] !== 'string' ||
      typeof 清单['说明'] !== 'string'
    )
      throw new Error('快照清单头部无效或版本不受支持')
    let 运行位置值 = 清单['运行位置']
    if (typeof 运行位置值 !== 'object' || 运行位置值 === null) throw new Error('快照清单缺少运行位置')
    let 运行位置 = 运行位置值 as Record<string, unknown>
    if (
      typeof 运行位置['流程名称'] !== 'string' ||
      typeof 运行位置['状态名称'] !== 'string' ||
      !Array.isArray(运行位置['状态行为描述们']) ||
      !运行位置['状态行为描述们'].every((描述) => typeof 描述 === 'string') ||
      !Number.isSafeInteger(运行位置['下一个步骤下标']) ||
      !Array.isArray(运行位置['已完成步骤描述们']) ||
      !运行位置['已完成步骤描述们'].every((描述) => typeof 描述 === 'string')
    )
      throw new Error('快照清单的运行位置无效')
    let 选择们值 = 清单['选择们']
    if (typeof 选择们值 !== 'object' || 选择们值 === null || Array.isArray(选择们值))
      throw new Error('快照清单的选择数据无效')
    let 选择们 = 选择们值 as Record<string, unknown>
    if (!Object.values(选择们).every((选择值) => ['string', 'number', 'boolean'].includes(typeof 选择值)))
      throw new Error('快照清单包含无法识别的选择值')
    let 已满足依赖们 = 清单['已满足依赖们']
    if (!Array.isArray(已满足依赖们) || !已满足依赖们.every((依赖) => typeof 依赖 === 'string'))
      throw new Error('快照清单的依赖数据无效')
    return {
      版本: 1,
      uuid: 清单['uuid'],
      创建时间: 清单['创建时间'],
      说明: 清单['说明'],
      运行位置: {
        流程名称: 运行位置['流程名称'],
        状态名称: 运行位置['状态名称'],
        状态行为描述们: 运行位置['状态行为描述们'],
        下一个步骤下标: 运行位置['下一个步骤下标'] as number,
        已完成步骤描述们: 运行位置['已完成步骤描述们'],
      },
      选择们: 选择们 as Record<string, string | number | boolean>,
      已满足依赖们,
    }
  }
}
