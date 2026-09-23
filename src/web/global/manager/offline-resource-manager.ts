import { 环境变量 } from '../../../global/env'

export function 注册离线资源缓存(): Promise<void> | undefined {
  if ('serviceWorker' in navigator === false || 环境变量.NODE_ENV !== 'production') return undefined
  let 脚本URL = new URL('/sw.js', window.location.origin)
  let 作用域 = '/'
  return navigator.serviceWorker.register(脚本URL, { type: 'module', scope: 作用域 }).then(async (): Promise<void> => {
    await navigator.serviceWorker.ready
    console.log('离线资源已准备完成')
  })
}
