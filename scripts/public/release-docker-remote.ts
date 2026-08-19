import { spawn } from 'child_process'
import * as fs from 'fs'
import inquirer from 'inquirer'
import { NodeSSH } from 'node-ssh'
import * as path from 'path'
import { z } from 'zod'
import { 日志类 } from './tools/model'
import {
  上传文件,
  下载文件,
  压缩项目,
  执行远程命令,
  清理旧镜像,
  获取Compose命令,
  获取Compose镜像列表,
  获取完整忽略名单,
  远程路径是否存在,
} from './tools/tools'

// ============= 配置区 =============
let 服务器列表 = [{ name: '默认服务器', value: { host: '0.0.0.0', username: 'xxx', password: 'xxx', useMirror: true } }]
// ============= 配置区 =============

// 读取项目名称
let 包信息模式 = z.object({ name: z.string() })

let { name: 原始项目名称 } = 包信息模式.parse(
  JSON.parse(fs.readFileSync(path.join(path.resolve(import.meta.dirname, '../', '../'), 'package.json'), 'utf8')),
)
let 项目名称 = 原始项目名称.replace('@', '').replace(/\//g, '-')

// 本地
let 本地根目录 = path.resolve(import.meta.dirname, '../', '../')
let 本地压缩包路径: string = path.join(本地根目录, `${项目名称}.tar.gz`)

async function 执行本地命令(命令: string, 选项?: { 工作目录?: string; 打印输出?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    let 终端 = process.platform === 'win32' ? 'cmd' : 'sh'
    let 终端参数 = process.platform === 'win32' ? '/c' : '-c'
    let 进程 = spawn(终端, [终端参数, 命令], { cwd: 选项?.工作目录 ?? process.cwd() })

    if (选项?.打印输出 !== false) {
      进程.stdout.on('data', (数据) => process.stdout.write(数据))
      进程.stderr.on('data', (数据) => process.stderr.write(数据))
    }

    进程.on('close', (退出码) => {
      if (退出码 === 0) resolve()
      else reject(new Error(`本地命令执行失败，退出码: ${退出码}`))
    })
  })
}

async function 主函数(): Promise<void> {
  let { 目标服务器, 模式, 环境, 使用缓存, 复用本地构建, 确认 } = (await inquirer.prompt([
    { type: 'list', name: '目标服务器', message: '请选择目标服务器:', choices: 服务器列表 },
    {
      type: 'list',
      name: '模式',
      message: '请选择操作模式:',
      choices: [
        { name: '打包镜像 (build)', value: 'build' },
        { name: '运行项目 (run)', value: 'run' },
        { name: '查看日志 (logs)', value: 'logs' },
        { name: '重启项目 (restart)', value: 'restart' },
        { name: '重新部署 (redeploy)', value: 'redeploy' },
        { name: '停止运行 (stop)', value: 'stop' },
        { name: '删除项目 (delete)', value: 'delete' },
        { name: '同步数据到本地 (sync-to-local)', value: 'sync-to-local' },
        { name: '同步数据到服务器 (sync-to-server)', value: 'sync-to-server' },
      ],
      default: 'run',
    },
    {
      type: 'list',
      name: '环境',
      message: '请选择环境:',
      choices: [
        { name: '开发环境 (development)', value: 'development' },
        { name: '生产环境 (production)', value: 'production' },
      ],
      default: 'production',
      when: (待回答: any): boolean => 待回答.模式 !== 'delete',
    },
    {
      type: 'confirm',
      name: '使用缓存',
      message: '是否使用镜像缓存?',
      default: true,
      when: (待回答: any): boolean => ['build', 'run', 'redeploy'].includes(待回答.模式),
    },
    {
      type: 'confirm',
      name: '复用本地构建',
      message: '是否复用本地构建产物 (dist) 以免去服务器编译?',
      default: true,
      when: (待回答: any): boolean => ['build', 'run', 'redeploy'].includes(待回答.模式),
    },
    {
      type: 'confirm',
      name: '确认',
      message: (待回答: any): string => {
        if (待回答.模式 === 'run' || 待回答.模式 === 'redeploy') {
          let 提示消息 = [
            `运行模式将使用项目打包内容覆盖远程运行目录 (~/${项目名称}/run/${待回答.环境}) 中的同名文件`,
            '这通常是预期的, 但请确保您了解后果:',
            '- 打包内容会覆盖运行目录中的同名文件',
            '- 远程新生成的文件及外部持久化数据不受影响',
            '⚠️ 风险提示: 若打包内容中包含会在运行时修改的文件(如 SQLite 数据库), 部署后这些文件将被打包中的初始版本重置, 导致远程积累的数据丢失',
          ]

          if (待回答.模式 === 'redeploy') {
            提示消息 = [
              `彻底重部署模式将完全删除该环境的远程运行目录 (~/${项目名称}/run/${待回答.环境})`,
              '这将导致:',
              '- 强制停止并移除当前容器和关联镜像',
              '- 删除运行目录下的所有文件 (包括不在项目仓库中的数据/持久化文件等)',
              '- 之后从零开始重新部署',
              '🚨 警告: 这是一个不可逆的操作, 远程未备份的数据将永久丢失!',
            ]
          }
          return 提示消息.join('\n') + '\n您确定要继续吗?'
        }

        if (待回答.模式 === 'delete') {
          return (
            [
              `🚨 警告: 此操作将从服务器彻底删除该项目的所有痕迹!`,
              `项目根目录: ~/${项目名称}`,
              '操作包含:',
              '- 停止所有运行中的容器 (跨环境)',
              '- 清理所有关联镜像',
              '- 彻底删除远程目录 (build, run, upload)',
              '这是一个极其危险的操作, 不可撤销!',
            ].join('\n') + '\n您确认要这么做吗?'
          )
        }
        if (待回答.模式 === 'sync-to-server') {
          return `🚨 警告: 此操作将使用本地数据库覆盖服务器上的数据库!\n服务器文件将先备份, 但这仍是一个敏感操作。\n您确认要继续吗?`
        }
        return ''
      },
      when: (待回答: any): boolean => ['run', 'redeploy', 'delete', 'sync-to-server'].includes(待回答.模式),
      default: true,
    },
  ] as any)) as {
    目标服务器: (typeof 服务器列表)[number]['value']
    模式: string
    环境: string
    使用缓存?: boolean
    复用本地构建?: boolean
    确认?: boolean
  }

  if (确认 === false) {
    return
  }

  let { host: 服务器地址, username: 用户名, password: 密码, useMirror: 是否使用镜像 } = 目标服务器

  let 镜像参数 = 是否使用镜像
    ? '--build-arg NPM_REGISTRY=https://registry.npmmirror.com --build-arg PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma --build-arg ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ --build-arg DEBIAN_MIRROR=mirrors.ustc.edu.cn'
    : ''
  if (复用本地构建 === true) {
    镜像参数 += ' --build-arg SKIP_BUILD=true'
  } else {
    镜像参数 += ' --build-arg SKIP_BUILD=false'
  }

  let 日志 = new 日志类()
  let sshClient = new NodeSSH()

  try {
    日志.打印(`🚀 [${模式}] [${(环境 as string | undefined) ?? 'all'}] 开始连接服务器 [${服务器地址}]...`)
    await sshClient.connect({ host: 服务器地址, username: 用户名, password: 密码 })
    日志.打印(`✅ 已连接到 服务器 [${服务器地址}]`)

    let compose命令 = await 获取Compose命令(sshClient)
    日志.打印(`🐳 检测到 Compose 命令: ${compose命令}`)

    // 获取远程家目录并初始化路径
    let 远程家目录 = (await 执行远程命令(sshClient, 'echo $HOME', { 打印输出: false })).stdout.trim()
    let 远程根目录 = path.posix.join(远程家目录, 项目名称)
    let 远程上传目录 = path.posix.resolve(远程根目录, 'upload')
    let 远程压缩包路径: string = path.posix.resolve(远程上传目录, `${项目名称}.tar.gz`)
    let 远程构建目录 =
      typeof 环境 === 'string' ? path.posix.resolve(远程根目录, 'build', 环境) : path.posix.resolve(远程根目录, 'build')
    let 远程构建docker目录: string = path.posix.resolve(远程构建目录, 'deploy')
    let 远程运行目录 =
      typeof 环境 === 'string' ? path.posix.resolve(远程根目录, 'run', 环境) : path.posix.resolve(远程根目录, 'run')
    let 远程运行部署目录: string = path.posix.resolve(远程运行目录, 'deploy')

    日志.打印(`📂 远程路径初始化完成:`)
    日志.打印(`- 远程家目录: ${远程家目录}`)
    日志.打印(`- 远程根目录: ${远程根目录}`)
    日志.打印(`- 远程上传目录: ${远程上传目录}`)
    日志.打印(`- 远程构建目录: ${远程构建目录}`)
    日志.打印(`- 远程运行目录: ${远程运行目录}`)

    // ====================
    // 特殊流程: 彻底重部署的前置清理
    // ====================
    let 重部署前镜像列表: string[] = []
    if (模式 === 'redeploy') {
      let 某个docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      if ((await 远程路径是否存在(sshClient, 某个docker文件目录)) === true) {
        // 在 redeploy 模式下，为了最小化停机时间，我们不再提前停止容器
        // 我们只需记录旧项目使用的镜像 ID，以便在部署完成后进行清理
        重部署前镜像列表 = await 获取Compose镜像列表(sshClient, 某个docker文件目录, `${项目名称}-${环境}`, compose命令)
      }

      日志.打印(`🧹 [redeploy] 彻底删除远程目录: ${远程运行目录}`)
      await 执行远程命令(sshClient, `rm -rf ${远程运行目录}`)
    }

    // ====================
    // 步骤: 打包并上传 (仅 build, run, rededeploy 模式需要)
    // ====================
    if (模式 === 'build' || 模式 === 'run' || 模式 === 'redeploy') {
      if (复用本地构建 === true) {
        日志.打印(`📦 正在本地生成代码 (gen)...`)
        await 执行本地命令('npm run _gen:all', { 工作目录: 本地根目录 })
        日志.打印(`🔍 正在本地检查代码 (check)...`)
        await 执行本地命令('npm run _check:all', { 工作目录: 本地根目录 })
        日志.打印(`📦 正在本地预构建项目 (用于远程复用 dist，避免服务器内存溢出假死)...`)
        await 执行本地命令('npm run _build:all', { 工作目录: 本地根目录 })
      }

      日志.打印(`🧹 清理旧的本地压缩包`)
      if (fs.existsSync(本地压缩包路径) === true) {
        fs.unlinkSync(本地压缩包路径)
      }

      日志.打印(`📦 正在打包项目 (根目录: ${本地根目录})...`)
      let 忽略名单 = 获取完整忽略名单(本地根目录)
      if (复用本地构建 === true) {
        忽略名单 = 忽略名单.filter((项) => {
          return 项 !== 'dist' && 项 !== 'dist/**' && 项 !== '/dist' && 项 !== '/dist/**'
        })
        // 复用本地构建时，不打包 .dockerignore 到远程，使得远程构建时无忽略规则从而能够 COPY dist 目录
        忽略名单.push('.dockerignore')
      }
      await 压缩项目(本地压缩包路径, 本地根目录, 忽略名单, 日志)

      日志.打印(`🧹 清理并创建远程上传目录...`)
      await 执行远程命令(sshClient, `rm -rf ${远程上传目录} && mkdir -p ${远程上传目录}`)

      日志.打印(`⬆️ 正在上传压缩包...`)
      await 上传文件(sshClient, 本地压缩包路径, 远程压缩包路径)

      日志.打印(`🧹 清理本地压缩包`)
      if (fs.existsSync(本地压缩包路径) === true) {
        fs.unlinkSync(本地压缩包路径)
      }
    }

    // ====================
    // 模式: 构建镜像
    // ====================
    if (模式 === 'build') {
      日志.打印(`🧹 清理并创建远程构建目录: ${远程构建目录}`)
      await 执行远程命令(sshClient, `rm -rf ${远程构建目录} && mkdir -p ${远程构建目录}`)

      日志.打印(`📦 解压到构建目录...`)
      await 执行远程命令(sshClient, `tar -xzf ${远程压缩包路径} -C ${远程构建目录}`)

      日志.打印(`🔨 正在使用 ${compose命令} 构建镜像...`)
      let 构建目录 = path.posix.resolve(远程构建docker目录, 环境)
      let 构建命令 = `${compose命令} -p ${项目名称}-${环境} build ${镜像参数}`
      if (使用缓存 === false) {
        构建命令 += ' --no-cache'
      }
      await 执行远程命令(sshClient, 构建命令, { 工作目录: 构建目录 })
    }

    // ====================
    // 模式: 运行项目 (run/redeploy)
    // ====================
    if (模式 === 'run' || 模式 === 'redeploy') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      日志.打印(`📂 确保远程运行目录存在: ${远程运行目录}`)
      await 执行远程命令(sshClient, `mkdir -p ${远程运行目录}`)

      日志.打印(`🔍 记录部署前的镜像 ID...`)
      let 旧镜像列表 = await 获取Compose镜像列表(sshClient, docker文件目录, `${项目名称}-${环境}`, compose命令)
      日志.打印(`📊 当前项目使用的镜像 ID 列表: [${旧镜像列表.join(', ') === '' ? '无' : 旧镜像列表.join(', ')}]`)

      日志.打印(`📦 解压到运行目录...`)
      await 执行远程命令(sshClient, `tar -xzf ${远程压缩包路径} -C ${远程运行目录}`)

      日志.打印(`🔨 正在构建项目镜像 (此时旧服务仍在运行)...`)
      let 构建命令 = `${compose命令} -p ${项目名称}-${环境} build ${镜像参数}`
      if (使用缓存 === false) {
        构建命令 += ' --no-cache'
      }
      await 执行远程命令(sshClient, 构建命令, { 工作目录: docker文件目录 })

      日志.打印(`🚀 正在启动新服务 (实现极短停机更新)...`)
      await 执行远程命令(sshClient, `${compose命令} -p ${项目名称}-${环境} up -d --remove-orphans`, {
        工作目录: docker文件目录,
      })

      日志.打印(`✅ 确认部署后的新镜像状态...`)
      let 新镜像列表 = await 获取Compose镜像列表(sshClient, docker文件目录, `${项目名称}-${环境}`, compose命令)
      日志.打印(`📊 部署后项目使用的镜像 ID 列表: [${新镜像列表.join(', ') === '' ? '无' : 新镜像列表.join(', ')}]`)

      日志.打印(`🧹 正在对比并清理不再使用的旧镜像...`)
      await 清理旧镜像(sshClient, Array.from(new Set([...旧镜像列表, ...重部署前镜像列表])), 新镜像列表, 日志)

      日志.打印(`✨ 所有操作均已完成`)
    }

    // ====================
    // 模式: 停止运行
    // ====================
    if (模式 === 'stop') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      if ((await 远程路径是否存在(sshClient, docker文件目录)) === false) {
        日志.打印(`⚠️ 远程部署目录不存在: ${docker文件目录}, 无需停止`)
        return
      }

      日志.打印(`🔍 停止前的镜像 ID...`)
      let 待清理镜像列表 = await 获取Compose镜像列表(sshClient, docker文件目录, `${项目名称}-${环境}`, compose命令)
      日志.打印(`📊 待清理的镜像 ID 列表: [${待清理镜像列表.join(', ') === '' ? '无' : 待清理镜像列表.join(', ')}]`)

      日志.打印(`🛑 正在停止并移除容器...`)
      await 执行远程命令(sshClient, `${compose命令} -p ${项目名称}-${环境} down --remove-orphans`, {
        工作目录: docker文件目录,
      })

      日志.打印(`🧹 正在清理相关镜像...`)
      await 清理旧镜像(sshClient, 待清理镜像列表, [], 日志)

      日志.打印(`✨ 停止并清理完成`)
    }

    // ====================
    // 模式: 重启项目
    // ====================
    if (模式 === 'restart') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)

      if ((await 远程路径是否存在(sshClient, docker文件目录)) === false) {
        日志.打印(`⚠️ 远程部署目录不存在: ${docker文件目录}, 无法重启`)
        return
      }

      日志.打印(`🔄 正在重启容器...`)
      await 执行远程命令(sshClient, `${compose命令} -p ${项目名称}-${环境} restart`, { 工作目录: docker文件目录 })

      日志.打印(`✨ 重启指令已发送`)
    }

    // ====================
    // 模式: 删除项目
    // ====================
    if (模式 === 'delete') {
      let 运行根目录 = path.posix.resolve(远程根目录, 'run')
      if ((await 远程路径是否存在(sshClient, 运行根目录)) === true) {
        日志.打印(`🔍 探测到运行根目录，尝试清理运行中的容器和镜像...`)
        let 环境列表内容 = (await 执行远程命令(sshClient, `ls -1 ${运行根目录}`, { 打印输出: false })).stdout
        let 环境列表 = 环境列表内容
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        for (let 某个环境 of 环境列表) {
          let 某个环境目录 = path.posix.resolve(运行根目录, 某个环境, 'deploy', 某个环境)
          if ((await 远程路径是否存在(sshClient, 某个环境目录)) === true) {
            日志.打印(`🛑 正在停止并清理环境: ${某个环境} ...`)
            let 镜像ID列表 = await 获取Compose镜像列表(sshClient, 某个环境目录, `${项目名称}-${某个环境}`, compose命令)
            await 执行远程命令(sshClient, `${compose命令} -p ${项目名称}-${某个环境} down --remove-orphans`, {
              工作目录: 某个环境目录,
              抛出错误: false,
            })
            await 清理旧镜像(sshClient, 镜像ID列表, [], 日志)
          }
        }
      }

      日志.打印(`🧹 正在从远程物理删除整个项目根目录: ${远程根目录}`)
      await 执行远程命令(sshClient, `rm -rf ${远程根目录}`)
      日志.打印(`✨ 项目已彻底从服务器删除`)
      return
    }

    // ====================
    // 模式: 数据同步
    // ====================
    if (模式 === 'sync-to-local' || 模式 === 'sync-to-server') {
      let 数据库文件名 = 环境 === 'production' ? 'prod-web.db' : 'dev-web.db'
      let 本地数据库路径 = path.join(本地根目录, 'db', 数据库文件名)
      let 远程数据库路径 = path.posix.join(远程运行目录, 'db', 数据库文件名)

      if (模式 === 'sync-to-local') {
        日志.打印(`🔄 模式: 同步服务器数据到本地 [${数据库文件名}]`)

        // 1. 检查远程文件是否存在
        let 结果 = await 执行远程命令(sshClient, `[ -f "${远程数据库路径}" ]`, { 打印输出: false, 抛出错误: false })
        if (结果.code !== 0) {
          throw new Error(`远程数据库文件不存在: ${远程数据库路径}`)
        }

        // 2. 备份本地文件
        if (fs.existsSync(本地数据库路径) === true) {
          let 时间戳 = new Date().toISOString().replace(/[:.]/g, '-')
          let 备份路径 = 本地数据库路径.replace(/\.db$/, `.${时间戳}.bak.db`)
          日志.打印(`📦 正在备份本地数据库到: ${备份路径}`)
          fs.copyFileSync(本地数据库路径, 备份路径)
        }

        // 3. 下载文件
        日志.打印(`⬇️ 正在从服务器下载数据库...`)
        await 下载文件(sshClient, 远程数据库路径, 本地数据库路径)
        日志.打印(`✨ 同步完成: 服务器 -> 本地`)
      }

      if (模式 === 'sync-to-server') {
        日志.打印(`🔄 模式: 同步本地数据到服务器 [${数据库文件名}]`)

        // 1. 检查本地文件是否存在
        if (fs.existsSync(本地数据库路径) === false) {
          throw new Error(`本地数据库文件不存在: ${本地数据库路径}`)
        }

        // 2. 备份远程文件
        let 远程是否存在 = await 执行远程命令(sshClient, `[ -f "${远程数据库路径}" ]`, {
          打印输出: false,
          抛出错误: false,
        })
        if (远程是否存在.code === 0) {
          let 时间戳 = new Date().toISOString().replace(/[:.]/g, '-')
          let 备份路径 = 远程数据库路径.replace(/\.db$/, `.${时间戳}.bak.db`)
          日志.打印(`📦 正在备份服务器数据库到: ${备份路径}`)
          await 执行远程命令(sshClient, `cp ${远程数据库路径} ${备份路径}`)
        } else {
          // 确保远程目录存在
          await 执行远程命令(sshClient, `mkdir -p ${path.posix.dirname(远程数据库路径)}`)
        }

        // 3. 上传文件
        日志.打印(`⬆️ 正在上传数据库到服务器...`)
        await 上传文件(sshClient, 本地数据库路径, 远程数据库路径)
        日志.打印(`✨ 同步完成: 本地 -> 服务器`)
      }
    }

    // ====================
    // 模式: 查看日志
    // ====================
    if (模式 === 'logs' || 模式 === 'run' || 模式 === 'restart' || 模式 === 'redeploy') {
      let docker文件目录 = path.posix.resolve(远程运行部署目录, 环境)
      日志.打印('--- 正在同步服务器实时日志 (按 Ctrl+C 退出) ---')
      await 执行远程命令(sshClient, `${compose命令} -p ${项目名称}-${环境} logs -f --tail 500`, {
        工作目录: docker文件目录,
      })
    }
  } catch (_错误) {
    console.error(`❌ 错误:`, _错误)
  } finally {
    sshClient.dispose()
    if (fs.existsSync(本地压缩包路径) === true) {
      日志.打印(`🧹 运行结束清理本地文件...`)
      fs.unlinkSync(本地压缩包路径)
    }
  }
}

主函数().catch((_错误) => {
  console.error(`\n💥 发生未处理的错误:`, _错误)
  process.exit(1)
})
