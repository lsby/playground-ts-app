import { Kysely插件 } from '@lsby/net-core-kysely'
import { Task } from '@lsby/ts-fp-data'
import { 全局资源 } from './global'

export let kysely插件 = new Kysely插件('kysely', () => 全局资源.获得数据库())
export let jwt插件 = {
  解析器: new Task(async () => (await 全局资源.获得JWT插件()).异步解析器),
  签名器: new Task(async () => (await 全局资源.获得JWT插件()).异步签名器),
}
