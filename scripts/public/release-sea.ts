import { execSync } from 'child_process'
import fs from 'fs'
import open from 'open'
import path from 'path'
import { fileURLToPath } from 'url'

let __当前文件名 = fileURLToPath(import.meta.url)
let __当前目录名 = path.dirname(__当前文件名)
let 项目根目录 = path.resolve(__当前目录名, '../../')
let 相对发布目录 = 'release/sea'
let 发布目录 = path.join(项目根目录, 相对发布目录)

function 寻找内置Csc编译器(): string | null {
  let 框架目录组 = ['C:\\Windows\\Microsoft.NET\\Framework64', 'C:\\Windows\\Microsoft.NET\\Framework']
  for (let 框架目录 of 框架目录组) {
    if (fs.existsSync(框架目录) === true) {
      let 版本目录组 = fs
        .readdirSync(框架目录)
        .filter((名字) => 名字.startsWith('v'))
        .sort()
        .reverse()
      for (let 目录名 of 版本目录组) {
        let csc路径 = path.join(框架目录, 目录名, 'csc.exe')
        if (fs.existsSync(csc路径) === true) {
          return csc路径
        }
      }
    }
  }
  return null
}

function 确保目录存在(目录路径: string): void {
  if (!fs.existsSync(目录路径)) {
    fs.mkdirSync(目录路径, { recursive: true })
  }
}

/**
 * 递归复制文件夹
 */
function 递归复制(源路径: string, 目标路径: string): void {
  if (!fs.existsSync(源路径)) return
  if (!fs.existsSync(目标路径)) fs.mkdirSync(目标路径, { recursive: true })
  let 所有项 = fs.readdirSync(源路径, { withFileTypes: true })
  for (let 项 of 所有项) {
    let 项源路径 = path.join(源路径, 项.name)
    let 项目标路径 = path.join(目标路径, 项.name)
    if (项.isDirectory()) {
      递归复制(项源路径, 项目标路径)
    } else {
      fs.copyFileSync(项源路径, 项目标路径)
    }
  }
}

async function 执行构建(): Promise<void> {
  try {
    console.log('正在执行前置准备工作 (db:push, check, build)...')
    execSync('npm run db:push:prod:sea', { stdio: 'inherit', cwd: 项目根目录 })
    execSync('dotenv -e ./.env/.env.production.sea -- npm run _check:all', { stdio: 'inherit', cwd: 项目根目录 })
    execSync('dotenv -e ./.env/.env.production.sea -- npm run _build:all', { stdio: 'inherit', cwd: 项目根目录 })

    let 环境源文件 = path.join(项目根目录, '.env/.env.production.sea')
    let 数据库源文件 = path.join(项目根目录, 'db/prod-sea.db')

    // 提前检查
    if (fs.existsSync(环境源文件) === false) {
      throw new Error(`❌ 未找到 ${环境源文件}，无法继续。`)
    }
    if (fs.existsSync(数据库源文件) === false) {
      throw new Error(`❌ 未找到 ${数据库源文件} 文件，无法继续。`)
    }

    console.log('[1/9] 正在准备目录...')
    if (fs.existsSync(发布目录) === true) {
      fs.rmSync(发布目录, { recursive: true, force: true })
    }
    确保目录存在(发布目录)

    console.log('[2/9] 正在使用 esbuild 合并代码...')
    execSync(
      `npx esbuild src/server.ts --bundle --platform=node --target=node22 --outfile=${相对发布目录}/server.bundle.cjs --format=cjs --packages=bundle --define:import.meta.dirname=__dirname --define:import.meta.url=__import_meta_url --banner:js="var __import_meta_url = typeof __filename !== 'undefined' && __filename ? require('url').pathToFileURL(__filename).href : 'file:///'; var __dirname = typeof __dirname !== 'undefined' ? __dirname : '/';"`,
      { stdio: 'inherit', cwd: 项目根目录 },
    )

    console.log('[3/9] 正在生成 SEA 配置...')
    let SEA配置 = {
      main: `${相对发布目录}/server.bundle.cjs`,
      output: `${相对发布目录}/sea-prep.blob`,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
    }
    fs.writeFileSync(path.join(项目根目录, `${相对发布目录}/sea-config.json`), JSON.stringify(SEA配置, null, 2))

    console.log('[4/9] 正在生成 SEA blob...')
    execSync(`node --experimental-sea-config ${相对发布目录}/sea-config.json`, { stdio: 'inherit', cwd: 项目根目录 })

    console.log('[5/9] 正在准备可执行文件...')
    let Node可执行文件 = process.execPath
    let 可执行文件名 = process.platform === 'win32' ? 'lsby-playground-ts-app.exe' : 'lsby-playground-ts-app'
    let 目标可执行文件 = path.join(发布目录, 可执行文件名)
    fs.copyFileSync(Node可执行文件, 目标可执行文件)

    if (process.platform === 'win32') {
      console.log('[6/9] 正在移除 Windows 代码签名...')
      // Windows 下 node.exe 是签名的, postject 无法注入已签名的二进制
      try {
        execSync(`signtool remove /s "${目标可执行文件}"`, { stdio: 'inherit', cwd: 项目根目录 })
      } catch (_) {
        console.log('  signtool 不可用, 将使用 --overwrite 标志')
      }
    } else if (process.platform === 'darwin') {
      console.log('[6/9] 正在移除 macOS 代码签名...')
      try {
        execSync(`codesign --remove-signature "${目标可执行文件}"`, { stdio: 'inherit', cwd: 项目根目录 })
      } catch (_) {
        console.log('  codesign 移除签名失败，将使用 --overwrite 标志')
      }
    }

    console.log('[7/9] 正在注入 blob...')
    let machoFlags = process.platform === 'darwin' ? '--macho-segment-name NODE_SEA' : ''
    execSync(
      `npx postject "${目标可执行文件}" NODE_SEA_BLOB "${相对发布目录}/sea-prep.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ${machoFlags} --overwrite`,
      { stdio: 'inherit', cwd: 项目根目录 },
    )

    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(目标可执行文件, 0o755)
      } catch (_) {}
      if (process.platform === 'darwin') {
        try {
          execSync(`codesign -s - "${目标可执行文件}"`, { stdio: 'inherit', cwd: 项目根目录 })
        } catch (_) {}
      }
    }

    console.log('[8/9] 正在整理资源文件夹...')
    递归复制(path.join(项目根目录, 'public'), path.join(发布目录, 'public'))
    递归复制(path.join(项目根目录, 'dist/src/web'), path.join(发布目录, 'dist/src/web'))

    // 仅复制指定的数据库文件
    let 数据库目标目录 = path.join(发布目录, 'db')
    确保目录存在(数据库目标目录)
    fs.copyFileSync(数据库源文件, path.join(数据库目标目录, 'prod-sea.db'))

    // 拷贝 sqlite wasm (node-sqlite3-wasm 库需要它在二进制运行目录下)
    let WASM路径 = path.join(项目根目录, 'node_modules/node-sqlite3-wasm/dist/node-sqlite3-wasm.wasm')
    if (fs.existsSync(WASM路径) === true) {
      fs.copyFileSync(WASM路径, path.join(发布目录, 'node-sqlite3-wasm.wasm'))
    }

    // 复制环境变量并修改为 sea 模式
    let 环境目标目录 = path.join(发布目录, '.env')
    确保目录存在(环境目标目录)
    let 环境变量内容 = fs.readFileSync(环境源文件, 'utf-8')
    fs.writeFileSync(path.join(环境目标目录, '.env.production.sea'), 环境变量内容)

    console.log('[9/9] 正在生成启动脚本...')
    if (process.platform === 'win32') {
      // 生成 run.cmd 启动脚本
      let 启动脚本内容 = [
        '@echo off',
        'chcp 65001 >nul',
        'echo Starting lsby-playground-ts-app ...',
        'echo.',
        'cd /d "%~dp0"',
        'set "ENV_FILE_PATH=./.env/.env.production.sea"',
        'set "DEBUG=@lsby:*,@lsby:playground-ts-app:*"',
        'lsby-playground-ts-app.exe',
        'if errorlevel 1 (',
        '  echo.',
        '  echo Application exited with error. Press any key to close...',
        '  pause >nul',
        ')',
        '',
      ].join('\r\n')
      fs.writeFileSync(path.join(发布目录, 'run.cmd'), 启动脚本内容)
      fs.writeFileSync(path.join(发布目录, 'lsby-playground-ts-app-debug.cmd'), 启动脚本内容)
      console.log(`✅ 已生成 ${path.join(发布目录, 'lsby-playground-ts-app-debug.cmd')}`)

      // 生成 start.exe (C# 引导器)
      let cscPath = 寻找内置Csc编译器()
      let launcher源文件 = path.join(__当前目录名, 'launcher', 'launcher.cs')
      let runExe路径 = path.join(发布目录, 'lsby-playground-ts-app-start.exe')

      if (cscPath === null || fs.existsSync(cscPath) === false) {
        console.warn(`⚠️ 未找到 C# 编译器，跳过 lsby-playground-ts-app-start.exe 的编译。`)
      } else if (fs.existsSync(launcher源文件) === false) {
        console.warn(`⚠️ 未找到引导器源码: ${launcher源文件}，跳过 lsby-playground-ts-app-start.exe 的编译。`)
      } else {
        console.log('✅ 正在编译引导器 lsby-playground-ts-app-start.exe ...')
        try {
          // 使用 /target:exe 避免控制台流异常
          execSync(
            `"${cscPath}" /nologo /target:exe /out:"${runExe路径}" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "${launcher源文件}"`,
            { stdio: 'inherit' },
          )
          console.log(`✅ 已生成 ${runExe路径}`)
        } catch (error) {
          console.error(`❌ 引导器 run.exe 编译失败:`, error)
        }
      }
    } else {
      let 启动脚本内容 = [
        '#!/usr/bin/env bash',
        'DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"',
        'cd "$DIR"',
        'export ENV_FILE_PATH="./.env/.env.production.sea"',
        'export DEBUG="@lsby:*,@lsby:playground-ts-app:*"',
        'echo "=================================================="',
        'echo "lsby-playground-ts-app (SEA单文件服务) 启动引导器"',
        'echo "=================================================="',
        'echo "正在启动后台服务..."',
        './lsby-playground-ts-app',
        'EXIT_CODE=$?',
        'if [ $EXIT_CODE -ne 0 ]; then',
        '  echo ""',
        '  echo "[引导器拦截] 程序异常退出 (ExitCode: $EXIT_CODE)"',
        '  read -p "按回车键关闭..."',
        'fi',
      ].join('\n')
      let sh路径 = path.join(发布目录, 'run.command')
      fs.writeFileSync(sh路径, 启动脚本内容, { encoding: 'utf8', mode: 0o755 })
      console.log(`✅ 已生成 ${sh路径}`)
    }

    // 清理中间文件
    let 中间文件 = ['server.bundle.cjs', 'sea-prep.blob', 'sea-config.json']
    for (let 文件 of 中间文件) {
      let 路径 = path.join(发布目录, 文件)
      if (fs.existsSync(路径)) fs.rmSync(路径)
    }

    console.log('✅ 构建成功！')
    console.log(`成果物位置: ${发布目录}`)

    // 构建完成后打开文件夹
    try {
      await open(发布目录, { wait: false })
    } catch (_错误) {
      // console.error('打开目录错误: %o', 错误)
    }
  } catch (错误) {
    console.error('❌ 构建过程中发生错误:', 错误)
    process.exit(1)
  }
}

执行构建().catch(console.error)
