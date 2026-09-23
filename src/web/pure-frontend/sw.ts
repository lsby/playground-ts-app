/// <reference lib="webworker" />

import { z } from 'zod'
import { 项目标识 } from '../../app/meta-info'

let 离线资源清单模式 = z.object({ version: z.string().min(1), assets: z.array(z.string().min(1)) }).strict()
type 离线资源清单 = z.infer<typeof 离线资源清单模式>

let ServiceWorker全局 = globalThis as unknown as ServiceWorkerGlobalScope
let 缓存前缀 = `${项目标识}-offline-assets:`
let 当前缓存名: string | undefined
let 当前资源URL集 = new Set<string>()
let 准备Promise: Promise<void> | undefined
let 刷新Promise: Promise<void> | undefined

async function 从响应读取离线资源清单(响应: Response): Promise<离线资源清单> {
  if (响应.ok === false) throw new Error(`下载离线资源清单失败: ${响应.status}`)
  return 离线资源清单模式.parse(await 响应.json())
}

async function 恢复已有离线资源(): Promise<boolean> {
  let 清单URL = new URL('offline-assets.json', ServiceWorker全局.registration.scope)
  let 缓存名列表 = (await caches.keys())
    .filter((缓存名) => 缓存名.startsWith(缓存前缀))
    .sort((左, 右) => 右.localeCompare(左))
  for (let 缓存名 of 缓存名列表) {
    let 缓存 = await caches.open(缓存名)
    let 响应 = await 缓存.match(清单URL)
    if (响应 === undefined) continue
    let 清单 = await 从响应读取离线资源清单(响应)
    当前缓存名 = 缓存名
    当前资源URL集 = new Set(清单.assets.map((路径) => new URL(路径, ServiceWorker全局.registration.scope).href))
    return true
  }
  return false
}

async function 准备离线资源(): Promise<void> {
  let 清单URL = new URL('offline-assets.json', ServiceWorker全局.registration.scope)
  let 清单响应: Response
  try {
    清单响应 = await fetch(清单URL, { cache: 'no-store' })
  } catch (错误) {
    if ((await 恢复已有离线资源()) === true) return
    throw 错误
  }
  let 清单 = await 从响应读取离线资源清单(清单响应.clone())
  let 缓存名 = 缓存前缀 + 清单.version
  let 资源URL列表 = 清单.assets.map((路径) => new URL(路径, ServiceWorker全局.registration.scope).href)
  if (当前缓存名 === 缓存名) return
  let 缓存 = await caches.open(缓存名)
  await 缓存.addAll(资源URL列表)
  await 缓存.put(清单URL, 清单响应)
  当前缓存名 = 缓存名
  当前资源URL集 = new Set(资源URL列表)
  let 缓存名列表 = await caches.keys()
  await Promise.all(
    缓存名列表
      .filter((已有缓存名) => 已有缓存名.startsWith(缓存前缀) && 已有缓存名 !== 缓存名)
      .map(async (已有缓存名) => await caches.delete(已有缓存名)),
  )
}

function 确保离线资源已准备(): Promise<void> {
  if (准备Promise === undefined) {
    准备Promise = 准备离线资源().catch((错误: unknown) => {
      准备Promise = undefined
      throw 错误
    })
  }
  return 准备Promise
}

function 刷新离线资源(): Promise<void> {
  刷新Promise ??= 准备离线资源().finally(() => {
    刷新Promise = undefined
  })
  return 刷新Promise
}

ServiceWorker全局.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(确保离线资源已准备())
})

ServiceWorker全局.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async (): Promise<void> => {
      if (当前缓存名 === undefined) await 确保离线资源已准备()
      let 缓存名列表 = await caches.keys()
      await Promise.all(
        缓存名列表
          .filter((缓存名) => 缓存名.startsWith(缓存前缀) && 缓存名 !== 当前缓存名)
          .map(async (缓存名) => await caches.delete(缓存名)),
      )
      await ServiceWorker全局.clients.claim()
    })(),
  )
})

ServiceWorker全局.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== ServiceWorker全局.location.origin) return
  event.respondWith(
    (async (): Promise<Response> => {
      if (event.request.mode === 'navigate') {
        try {
          await 刷新离线资源()
        } catch (错误) {
          if (当前缓存名 === undefined) throw 错误
          console.error('刷新离线资源失败，继续使用已有缓存')
        }
      } else if (当前缓存名 === undefined) await 确保离线资源已准备()
      let 规范请求URL = new URL(event.request.url)
      规范请求URL.search = ''
      规范请求URL.hash = ''
      if (规范请求URL.pathname.endsWith('/')) 规范请求URL.pathname += 'index.html'
      if (当前缓存名 === undefined || 当前资源URL集.has(规范请求URL.href) === false) return await fetch(event.request)
      let 缓存 = await caches.open(当前缓存名)
      let 已缓存响应 = await 缓存.match(规范请求URL)
      if (已缓存响应 === undefined) throw new Error(`离线资源缺失: ${event.request.url}`)
      return 已缓存响应
    })(),
  )
})
