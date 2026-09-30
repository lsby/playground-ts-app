import { 项目标识 } from '../../../app/meta-info'

function 删除数据库(名称: string): Promise<void> {
  return new Promise((resolve, reject): void => {
    let 请求 = indexedDB.deleteDatabase(名称)
    请求.onsuccess = (): void => resolve()
    请求.onerror = (): void => reject(请求.error ?? new Error(`删除本地数据库失败: ${名称}`))
    请求.onblocked = (): void => reject(new Error(`本地数据库仍被其他页面占用，请关闭其他页面后重试: ${名称}`))
  })
}

export async function 清理旧本地优先数据库(
  用户id: string,
  新数据库文件名: string[],
  旧状态?: { currentFileName: string; baselineFileName: string },
): Promise<void> {
  let 摘要 = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${项目标识}\0${用户id}`))
  let 用户标识 = [...new Uint8Array(摘要).slice(0, 12)].map((字节) => 字节.toString(16).padStart(2, '0')).join('')
  let 前缀 = `lf-${用户标识}-`
  let 保留 = new Set(新数据库文件名)
  let 待删除 = new Set<string>()
  if (旧状态 !== undefined) {
    for (let 名称 of [旧状态.currentFileName, 旧状态.baselineFileName]) {
      let 匹配 = /^(.*)-(current|baseline)-[ab]\.db$/u.exec(名称)
      let 文件名前缀 = 匹配?.[1]
      if (文件名前缀 === undefined || 文件名前缀.startsWith(前缀) === false) continue
      for (let 槽位 of ['a', 'b']) {
        待删除.add(`${文件名前缀}-current-${槽位}.db`)
        待删除.add(`${文件名前缀}-baseline-${槽位}.db`)
      }
    }
  }
  if (typeof indexedDB.databases === 'function') {
    for (let 数据库 of await indexedDB.databases()) {
      if (数据库.name !== undefined) 待删除.add(数据库.name)
    }
  }
  for (let 名称 of 待删除) {
    if (名称.startsWith(前缀) === false || 保留.has(名称) === true) continue
    await 删除数据库(名称)
  }
}
