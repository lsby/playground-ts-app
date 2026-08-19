import { execFileSync, execSync } from 'child_process'
import fs from 'fs'
import open from 'open'
import path from 'path'
import readline from 'readline/promises'
import { fileURLToPath } from 'url'
import { 写入AppPackageJson, 生成Electron便携资源, 获得Prisma迁移名称组 } from './electron-update-release'

let __当前文件名 = fileURLToPath(import.meta.url)
let __当前目录名 = path.dirname(__当前文件名)
let 项目根目录 = path.resolve(__当前目录名, '../../')
let 相对发布目录 = 'release/electron'

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

async function 移动目录并等待文件句柄释放(源目录: string, 目标目录: string): Promise<void> {
  for (let 次数 = 1; 次数 <= 20; 次数 += 1) {
    try {
      fs.renameSync(源目录, 目标目录)
      return
    } catch (错误) {
      if (次数 === 20) throw 错误
      await new Promise<void>((resolve) => setTimeout(resolve, 500))
    }
  }
}

async function 询问是否打包Zip(): Promise<boolean> {
  if (process.argv.includes('--zip') === true) {
    console.log('📦 检测到 --zip 参数，自动生成 Electron 完整便携压缩包。')
    return true
  }
  if (process.argv.includes('--nozip') === true || process.argv.includes('--no-zip') === true) {
    console.log('💡 检测到 --nozip 参数，跳过 ZIP 压缩包打包。')
    return false
  }
  if (
    process.argv.includes('--yes') === true ||
    process.argv.includes('-y') === true ||
    process.argv.includes('--silent') === true
  ) {
    console.log('💡 静默模式且未指定 --zip，默认跳过 ZIP 压缩包打包。')
    return false
  }

  let 终端 = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    let 回答 = await 终端.question('📦 是否打包 Electron 完整便携压缩包 (.zip)？(y/N): ')
    终端.close()
    let 确认输入 = 回答.trim().toLowerCase()
    return 确认输入 === 'y' || 确认输入 === 'yes'
  } catch (_交互错误) {
    终端.close()
    return false
  }
}

async function 执行构建(): Promise<void> {
  try {
    let 是否生成Zip = await 询问是否打包Zip()

    console.log('正在执行前置准备工作 (db:push, check, build)...')
    execSync('npm run db:push:prod:electron', { stdio: 'inherit', cwd: 项目根目录 })
    execSync('dotenv -e ./.env/.env.production.electron -- npm run _check:all', { stdio: 'inherit', cwd: 项目根目录 })
    execSync('dotenv -e ./.env/.env.production.electron -- npm run _build:all', { stdio: 'inherit', cwd: 项目根目录 })

    let 环境源文件 = path.resolve(项目根目录, '.env/.env.production.electron')
    let 数据库源文件 = path.resolve(项目根目录, 'db/prod-electron.db')

    // 1. 提前检查
    if (fs.existsSync(环境源文件) === false) {
      throw new Error(`❌ 未找到 ${环境源文件} 文件，无法继续。`)
    }
    if (fs.existsSync(数据库源文件) === false) {
      throw new Error(`❌ 未找到 ${数据库源文件} 文件，无法继续。`)
    }

    // 2. 清理
    console.log('正在清理生成目录...')
    let 待清理路径 = path.join(项目根目录, 相对发布目录)
    if (fs.existsSync(待清理路径) === true) {
      fs.rmSync(待清理路径, { recursive: true, force: true })
      console.log('已清理:', 待清理路径)
    }

    // 3. 运行 electron-builder
    console.log('正在启动 electron-builder...')
    execSync(`npx electron-builder -c.directories.output=${相对发布目录}`, { stdio: 'inherit', cwd: 项目根目录 })

    // 4. 定位生成的目录
    let 生成目录 = ''
    if (process.platform === 'win32') {
      let 构建程序目录 = path.join(待清理路径, 'win-unpacked')
      生成目录 = path.join(待清理路径, 'windows-portable')
      确保目录存在(生成目录)
      await 移动目录并等待文件句柄释放(构建程序目录, path.join(生成目录, 'app'))
    } else {
      let 子项组 = fs.existsSync(待清理路径) === true ? fs.readdirSync(待清理路径) : []
      let 构建程序目录名 =
        子项组.find((项) => fs.existsSync(path.join(待清理路径, 项, 'lsby-playground-ts-app.app')) === true) ??
        子项组.find((项) => 项.startsWith('mac'))
      if (构建程序目录名 === undefined) {
        throw new Error('❌ 未找到 electron-builder 生成的 macOS .app 目录')
      }
      let 源App路径 = path.join(待清理路径, 构建程序目录名, 'lsby-playground-ts-app.app')
      生成目录 = path.join(待清理路径, 'mac-portable')
      确保目录存在(生成目录)
      let 目标App路径 = path.join(生成目录, 'lsby-playground-ts-app.app')
      if (fs.existsSync(目标App路径) === true) {
        fs.rmSync(目标App路径, { recursive: true, force: true })
      }
      await 移动目录并等待文件句柄释放(源App路径, 目标App路径)
      let 原始目录 = path.join(待清理路径, 构建程序目录名)
      if (原始目录 !== 生成目录 && fs.existsSync(原始目录) === true) {
        fs.rmSync(原始目录, { recursive: true, force: true })
      }
    }

    console.log('正在进行后处理...')
    if (fs.existsSync(生成目录) === false) {
      throw new Error(`❌ 生成目录不存在: ${生成目录}`)
    }

    // 复制环境变量
    let 环境目标路径组: string[] = [
      path.join(process.platform === 'win32' ? path.join(生成目录, 'app') : 生成目录, '.env'),
    ]
    let appResourcesEnv = path.join(生成目录, 'lsby-playground-ts-app.app/Contents/Resources/app/.env')
    if (fs.existsSync(path.dirname(appResourcesEnv)) === true) {
      环境目标路径组.push(appResourcesEnv)
    }
    let 环境内容 = fs
      .readFileSync(环境源文件, 'utf8')
      .replace(/^DB_PATH\s*=.*$/m, 'DB_PATH = "./data/db/prod-electron.db"')
      .replace(/^DB_BACKUP_PATH\s*=.*$/m, 'DB_BACKUP_PATH = "./data/backups"')
    for (let 目标目录 of 环境目标路径组) {
      确保目录存在(目标目录)
      let 环境目标文件 = path.join(目标目录, '.env.production.electron')
      fs.writeFileSync(环境目标文件, 环境内容, 'utf8')
      console.log(`✅ 已写入环境变量到 ${环境目标文件}`)
    }

    // 复制数据库
    let 数据库目标路径组: string[] = [path.join(生成目录, 'data/db')]
    let appResourcesDb = path.join(生成目录, 'lsby-playground-ts-app.app/Contents/Resources/app/db')
    if (fs.existsSync(path.dirname(appResourcesDb)) === true) {
      数据库目标路径组.push(appResourcesDb)
    }
    for (let 目标目录 of 数据库目标路径组) {
      确保目录存在(目标目录)
      let 数据库目标文件 = path.join(目标目录, 'prod-electron.db')
      fs.copyFileSync(数据库源文件, 数据库目标文件)
      console.log(`✅ 已复制 ${数据库源文件} 到 ${数据库目标文件}`)
    }
    确保目录存在(path.join(生成目录, 'data/backups'))

    // 复制 Prisma 与 migrations
    let appPrisma目标目录 =
      process.platform === 'win32'
        ? path.join(生成目录, 'app')
        : path.join(生成目录, 'lsby-playground-ts-app.app/Contents/Resources/app')
    fs.cpSync(path.join(项目根目录, 'prisma'), path.join(appPrisma目标目录, 'prisma'), { recursive: true })
    fs.copyFileSync(path.join(项目根目录, 'prisma.config.ts'), path.join(appPrisma目标目录, 'prisma.config.ts'))
    console.log('✅ 已复制 Prisma Schema 与 migrations')

    // 复制更新脚本与写入 package.json
    let 更新脚本源目录 = path.join(__当前目录名, 'updater')
    if (process.platform === 'win32') {
      for (let 文件名 of ['lsby-playground-ts-app-debug.cmd', 'update.cmd']) {
        let 源路径 = path.join(更新脚本源目录, 文件名)
        let 目标路径 = path.join(生成目录, 文件名)
        fs.copyFileSync(源路径, 目标路径)
      }
      确保目录存在(path.join(生成目录, 'scripts'))
      let 更新脚本内容 = fs.readFileSync(path.join(更新脚本源目录, 'update.ps1'), 'utf8').replace(/^\uFEFF/, '')
      fs.writeFileSync(path.join(生成目录, 'scripts/update.ps1'), '\uFEFF' + 更新脚本内容, 'utf8')
    } else {
      let 目标UpdateCommand = path.join(生成目录, 'update.command')
      fs.copyFileSync(path.join(更新脚本源目录, 'update.command'), 目标UpdateCommand)
      fs.chmodSync(目标UpdateCommand, 0o755)

      确保目录存在(path.join(生成目录, 'scripts'))
      let 目标UpdateSh = path.join(生成目录, 'scripts/update.sh')
      fs.copyFileSync(path.join(更新脚本源目录, 'update.sh'), 目标UpdateSh)
      fs.chmodSync(目标UpdateSh, 0o755)
    }
    await 写入AppPackageJson(项目根目录, 生成目录)
    console.log(`✅ 已生成 package.json 与更新脚本`)

    // 在 macOS 下为 .app 包挂载内置启动引导器，解决 Finder 直接双击时 launchd 不传 ENV_FILE_PATH 与 cwd=/ 的问题
    if (process.platform === 'darwin') {
      let macOsBinDir = path.join(生成目录, 'lsby-playground-ts-app.app/Contents/MacOS')
      let 原生可执行文件 = path.join(macOsBinDir, 'lsby-playground-ts-app')
      let 真实二进制文件 = path.join(macOsBinDir, 'lsby-playground-ts-app-bin')

      if (fs.existsSync(原生可执行文件) === true) {
        if (fs.existsSync(真实二进制文件) === true) {
          fs.rmSync(真实二进制文件)
        }
        fs.renameSync(原生可执行文件, 真实二进制文件)

        let appLauncher脚本 = [
          '#!/usr/bin/env bash',
          'DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"',
          'APP_RESOURCES_DIR="$( cd "$DIR/../Resources/app" >/dev/null 2>&1 && pwd )"',
          'PORTABLE_ROOT="$( cd "$DIR/../../.." >/dev/null 2>&1 && pwd )"',
          'if [ -f "$PORTABLE_ROOT/.env/.env.production.electron" ]; then',
          '  export ENV_FILE_PATH="$PORTABLE_ROOT/.env/.env.production.electron"',
          '  cd "$PORTABLE_ROOT"',
          'elif [ -f "$APP_RESOURCES_DIR/.env/.env.production.electron" ]; then',
          '  export ENV_FILE_PATH="$APP_RESOURCES_DIR/.env/.env.production.electron"',
          '  if [ -d "$PORTABLE_ROOT/data" ]; then',
          '    cd "$PORTABLE_ROOT"',
          '  else',
          '    cd "$APP_RESOURCES_DIR"',
          '  fi',
          'fi',
          'export DEBUG="@lsby:*,@lsby:playground-ts-app:*"',
          'exec "$DIR/lsby-playground-ts-app-bin" "$@"',
        ].join('\n')
        fs.writeFileSync(原生可执行文件, appLauncher脚本, { encoding: 'utf8', mode: 0o755 })
        console.log(`✅ 已为 .app 成功注入内置启动引导器`)
      }
    }

    // 验证默认数据库的 Prisma migrations
    let Prisma迁移名称组 = 获得Prisma迁移名称组(path.join(appPrisma目标目录, 'prisma/migrations'))
    if (Prisma迁移名称组.length > 0) {
      let Electron程序路径 =
        process.platform === 'win32'
          ? path.join(生成目录, 'app/lsby-playground-ts-app.exe')
          : path.join(生成目录, 'lsby-playground-ts-app.app/Contents/MacOS/lsby-playground-ts-app-bin')
      let PrismaCli路径 =
        process.platform === 'win32'
          ? path.join(生成目录, 'app/resources/app/node_modules/prisma/build/index.js')
          : path.join(生成目录, 'lsby-playground-ts-app.app/Contents/Resources/app/node_modules/prisma/build/index.js')
      let Prisma配置路径 = path.join(appPrisma目标目录, 'prisma.config.ts')
      let Prisma环境 = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DB_PATH_PRISMA: `file:${path.join(生成目录, 'data/db/prod-electron.db').replaceAll('\\', '/')}`,
        NODE_PATH:
          process.platform === 'win32'
            ? path.join(生成目录, 'app/resources/app/node_modules')
            : path.join(生成目录, 'lsby-playground-ts-app.app/Contents/Resources/app/node_modules'),
      }
      console.log('正在验证默认数据库的 Prisma migrations...')
      execFileSync(Electron程序路径, [PrismaCli路径, 'migrate', 'deploy', '--config', Prisma配置路径], {
        cwd: process.platform === 'win32' ? path.join(生成目录, 'app') : appPrisma目标目录,
        env: Prisma环境,
        stdio: 'inherit',
      })
    }

    if (process.platform === 'win32') {
      // 生成 start.exe (C# 引导器)
      let cscPath = 寻找内置Csc编译器()
      let launcher源文件 = path.join(__当前目录名, 'launcher', 'launcher.cs')
      let runExe路径 = path.join(生成目录, 'lsby-playground-ts-app-start.exe')

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
    }

    if (是否生成Zip === true) {
      console.log('正在生成 Electron 完整便携压缩包...')
      await 生成Electron便携资源(项目根目录, 生成目录, 待清理路径)
    } else {
      console.log('💡 已跳过 ZIP 压缩包打包。')
    }

    // 5. 构建完成后打开文件夹
    console.log('✅ 构建成功！')
    console.log(`✨ 成果物位置: ${生成目录}`)

    try {
      await open(生成目录, { wait: false })
    } catch (_错误) {
      // console.error('打开目录错误: %o', 错误)
    }
  } catch (错误) {
    console.error('❌ 构建过程中发生错误:', 错误)
    process.exit(1)
  }
}

执行构建().catch(console.error)
