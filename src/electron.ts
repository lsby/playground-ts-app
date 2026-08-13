import { app, BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { App } from './app/app'
import { 计算补偿后的窗口配置, 验证并修正窗口 } from './electron/multi-display'
import { 检查端口可用, 获取随机可用端口 } from './electron/port-utils'
import { 保存窗口状态, 检查窗口是否在可见区域内, 获取默认窗口位置, 读取窗口状态 } from './electron/window-state'
import { 环境变量 } from './global/env'
import { globalLog } from './global/global'
import { init } from './init/init'
import { 启动异常兜底 } from './tools/fallback'

async function main(): Promise<void> {
  启动异常兜底()
  try {
    await init()
    await new App().run()
  } catch (error) {
    console.error('启动过程中发生错误:', error)
    app.exit(1) // 必须直接 exit(1)，不能用 quit()，否则会触发正常退出的 0 码，并导致后续的 loadURL 继续执行
    throw error // 抛出错误以阻断后续执行
  }
}
let 已经启动服务器 = false
let 获得单实例锁 = app.requestSingleInstanceLock()
export let 主窗口: BrowserWindow | null = null

let 资源目录 = process.resourcesPath
let 预加载脚本路径 = path.join(资源目录, 'preload.js')
let 用户数据目录 =
  app.isPackaged === true ? path.resolve(path.dirname(process.execPath), '../data') : path.resolve('data')
fs.mkdirSync(用户数据目录, { recursive: true })
let 窗口状态路径 = path.join(用户数据目录, 'window-state.json')

/**
 * 创建主窗口
 *
 * 负责创建 Electron 主窗口，包括：
 * - 生成预加载脚本
 * - 恢复窗口状态（位置、大小、最大化/全屏状态）
 * - 处理多显示器环境下的窗口位置和尺寸
 * - 加载应用页面
 */
async function 创建主窗口(): Promise<void> {
  let log = globalLog.extend('electron')
  let 开发环境 = 环境变量.NODE_ENV === 'development'

  let 端口 = 环境变量.WEB_PORT

  if (开发环境 === false) {
    // 生产环境下：先处理端口冲突（先检查后启动）
    if ((await 检查端口可用(端口)) === false) {
      端口 = await 获取随机可用端口()
      // 覆盖环境变量，这样稍后启动的服务器就会使用新端口
      环境变量.APP_PORT = 端口
      环境变量.WEB_PORT = 端口
      await log.info(`默认端口被占用，已切换为随机端口: ${端口}`)
    }

    // 然后再启动后端服务器，确保使用的是最终确定的无冲突端口
    if (已经启动服务器 === false) {
      已经启动服务器 = true
      await main()
    }
  } else {
    // 开发环境下：直接启动后端服务器，不检查端口（由开发者自行保证端口可用）
    if (已经启动服务器 === false) {
      已经启动服务器 = true
      await main()
    }
  }

  let 预加载脚本 = [
    '// 该文件由脚本自动生成, 请勿修改.',
    "const { contextBridge, webUtils } = require('electron')",
    "contextBridge.exposeInMainWorld('electronAPI', {",
    '  获取文件路径: (file) => webUtils.getPathForFile(file)',
    '})',
    '',
  ].join('\n')
  fs.writeFileSync(预加载脚本路径, 预加载脚本)

  await log.info('=== 创建主窗口 ===')
  let 所有显示器 = screen.getAllDisplays()
  await log.info('所有显示器信息:')
  for (let 显示器 of 所有显示器) {
    await log.info(`  显示器 ID: ${显示器.id}, 缩放: ${显示器.scaleFactor}, 工作区:`, 显示器.workArea)
  }

  let 保存的状态 = await 读取窗口状态(窗口状态路径)
  await log.info('读取的保存状态:', 保存的状态)

  let 窗口配置: Electron.BrowserWindowConstructorOptions = {
    show: false,
    webPreferences: { preload: 预加载脚本路径, nodeIntegration: false, contextIsolation: true },
  }

  let 使用保存的位置 = false

  if (保存的状态 !== null) {
    let 位置有效 = 检查窗口是否在可见区域内({
      x: 保存的状态.x,
      y: 保存的状态.y,
      width: 保存的状态.width,
      height: 保存的状态.height,
    })
    await log.info('保存的位置是否有效:', 位置有效)

    if (位置有效 === true) {
      let 保存时的显示器 = 所有显示器.find((显示器) => 显示器.id === 保存的状态.displayId)
      await log.info('保存时的显示器:', 保存时的显示器 !== undefined ? `ID ${保存时的显示器.id}` : '未找到')

      if (保存时的显示器 !== undefined) {
        let 补偿后的配置 = 计算补偿后的窗口配置(保存的状态)

        await log.info('使用保存的位置和补偿后的大小:', {
          ...补偿后的配置,
          原始宽度: 保存的状态.width,
          原始高度: 保存的状态.height,
        })

        窗口配置.x = 补偿后的配置.x
        窗口配置.y = 补偿后的配置.y
        窗口配置.width = 补偿后的配置.width
        窗口配置.height = 补偿后的配置.height
        使用保存的位置 = true
      }
    }
  }

  if (使用保存的位置 === false) {
    let 默认位置 = 获取默认窗口位置()
    await log.info('使用默认位置和大小:', 默认位置)
    窗口配置.x = 默认位置.x
    窗口配置.y = 默认位置.y
    窗口配置.width = 默认位置.width
    窗口配置.height = 默认位置.height
  }

  await log.info('最终窗口配置:', { x: 窗口配置.x, y: 窗口配置.y, width: 窗口配置.width, height: 窗口配置.height })

  主窗口 = new BrowserWindow(窗口配置)

  if (使用保存的位置 === true && 保存的状态 !== null) {
    await 验证并修正窗口(主窗口, 保存的状态)
  }

  if (保存的状态 !== null && 使用保存的位置 === true) {
    if (保存的状态.isMaximized === true) {
      await log.info('恢复最大化状态')
      主窗口.maximize()
    }
    if (保存的状态.isFullScreen === true) {
      await log.info('恢复全屏状态')
      主窗口.setFullScreen(true)
    }
  }

  主窗口.once('ready-to-show', async () => {
    if (主窗口 !== null) {
      let 显示前的边界 = 主窗口.getBounds()
      await log.info('窗口显示前的边界:', 显示前的边界)
      主窗口.show()
    }
  })

  if (开发环境 === true) {
    主窗口.webContents.openDevTools({ mode: 'detach', activate: false })
  }

  try {
    await 主窗口.loadURL(`http://127.0.0.1:${端口}/`)
  } catch (error) {
    await log.error('主窗口加载失败:', error)
    app.exit(1)
  }

  主窗口.on('close', async () => {
    if (主窗口 !== null) {
      await 保存窗口状态(主窗口, 窗口状态路径)
    }
  })

  主窗口.on('closed', () => {
    主窗口 = null
  })
}

async function Electron就绪(): Promise<void> {
  await 创建主窗口()
}

if (获得单实例锁 === false) {
  app.quit()
} else {
  app.on('ready', Electron就绪)
  app.on('second-instance', () => {
    if (主窗口 !== null) {
      if (主窗口.isMinimized() === true) 主窗口.restore()
      主窗口.focus()
    }
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', async () => {
    if (主窗口 === null) await 创建主窗口()
  })
}
