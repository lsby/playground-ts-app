import { describe, expect, it } from 'vitest'

import { 检查浏览器已安装, 浏览器安装命令, 转换浏览器启动错误 } from '../../src/model/browser-test/browser-install'

describe('Playwright 浏览器安装检查', () => {
  it('可执行文件不存在的启动错误换成带安装命令的提示', () => {
    let 原错误 = new Error("browserType.launch: Executable doesn't exist at /x/chromium\nplease run playwright install")
    let 结果 = 转换浏览器启动错误(原错误)
    expect(结果).toBeInstanceOf(Error)
    expect((结果 as Error).message).toContain(浏览器安装命令)
    expect((结果 as Error).cause).toBe(原错误)
  })

  it('其他错误原样返回', () => {
    let 错误 = new Error('别的问题')
    expect(转换浏览器启动错误(错误)).toBe(错误)
  })

  it('启动前检查：路径不存在给提示，存在返回 undefined', () => {
    expect(检查浏览器已安装('/不存在/chromium')).toContain(浏览器安装命令)
    expect(检查浏览器已安装(process.execPath)).toBeUndefined()
  })
})
