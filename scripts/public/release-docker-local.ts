// 读取 package.json 文件并解析
import { spawn } from 'child_process'
import fs from 'fs'
import inquirer from 'inquirer'
import path from 'path'
import { exit } from 'process'
import { z } from 'zod'

// ============= 配置区 =============
let 推送目标列表 = [
  { name: '默认', value: '' },
  { name: '我的仓库', value: '0.0.0.0:0' },
]
// ============= 配置区 =============

// 读取 package.json 文件并解析
let 包信息路径 = path.resolve(import.meta.dirname, '../../package.json')
let 包信息模式 = z.object({ name: z.string(), version: z.string() })
let 包信息 = 包信息模式.parse(JSON.parse(fs.readFileSync(包信息路径, 'utf-8')))

// 默认项目名称，如果项目名称以 @ 开头，去掉它
let 项目名称 = 包信息.name.startsWith('@') === true ? 包信息.name.slice(1) : 包信息.name

console.log('项目名称: %O, 项目版本: %O', 项目名称, 包信息.version)

// 命令行执行函数
function 执行命令行(命令: string, 参数: string[], 工作目录?: string): Promise<number> {
  return new Promise<number>((解决, 拒绝) => {
    let 进程 = spawn(命令, 参数, { cwd: 工作目录, stdio: 'inherit' })

    进程.on('close', (退出码) => {
      if (退出码 === null) {
        解决(-1)
      } else {
        解决(退出码)
      }
    })

    进程.on('error', (错误) => {
      拒绝(错误)
    })
  })
}

// 打包流程
async function 执行打包(): Promise<void> {
  // 用户选择镜像名称
  let { 用户输入镜像名 } = (await inquirer.prompt([
    { type: 'input', name: '用户输入镜像名', message: '请输入镜像名称（默认: ' + 项目名称 + '）:', default: 项目名称 },
  ])) as { 用户输入镜像名: string }

  // 二次确认用户输入的镜像名称
  let { 是否确认镜像名 } = (await inquirer.prompt([
    {
      type: 'confirm',
      name: '是否确认镜像名',
      message: `最终的镜像名称是 "${用户输入镜像名}:${包信息.version}"，确认无误吗？`,
      default: true,
    },
  ])) as { 是否确认镜像名: boolean }

  if (是否确认镜像名 === false) {
    console.log('用户取消了镜像名称确认。')
    exit(1)
  }

  console.log(`镜像名称已确认: ${用户输入镜像名}:${包信息.version}`)

  // 用户选择打包环境
  let { 选择环境 } = (await inquirer.prompt([
    {
      type: 'list',
      name: '选择环境',
      message: '请选择打包环境:',
      choices: ['development', 'production'],
      default: 'development',
    },
  ])) as { 选择环境: 'development' | 'production' }

  // 根据用户输入生成 Docker 构建命令
  let docker文件路径 = path.join('deploy', 选择环境, 'dockerfile')
  let 项目根目录 = path.resolve(import.meta.dirname, '../..')
  console.log('执行命令: %O %O', 'docker', [
    'build',
    '-t',
    `${用户输入镜像名}:${包信息.version}`,
    '-f',
    docker文件路径,
    '.',
  ])

  try {
    let 退出码 = await 执行命令行(
      'docker',
      ['build', '-t', `${用户输入镜像名}:${包信息.version}`, '-f', docker文件路径, '.'],
      项目根目录,
    )
    console.log(`docker build 进程退出，退出码: ${退出码}`)

    if (退出码 === 0) {
      // 打包成功，询问是否执行 push
      let { 是否推送 } = (await inquirer.prompt([
        { type: 'confirm', name: '是否推送', message: `打包完成！是否要执行 docker push ?`, default: false },
      ])) as { 是否推送: boolean }

      if (是否推送 === true) {
        let { 目标仓库 } = (await inquirer.prompt([
          {
            type: 'list',
            name: '目标仓库',
            message: '请选择推送目标仓库:',
            choices: [...推送目标列表, { name: '自定义仓库前缀', value: '__custom__' }],
          },
        ])) as { 目标仓库: string }

        let 仓库前缀 = 目标仓库
        if (目标仓库 === '__custom__') {
          let { 自定义前缀 } = (await inquirer.prompt([
            {
              type: 'input',
              name: '自定义前缀',
              message: '请输入仓库前缀 (例如 registry.cn-hangzhou.aliyuncs.com/my-namespace):',
            },
          ])) as { 自定义前缀: string }
          仓库前缀 = 自定义前缀.trim()
        }

        let 本地镜像名 = `${用户输入镜像名}:${包信息.version}`
        let 最终推送镜像名 =
          仓库前缀 !== '' ? `${仓库前缀.replace(/\/+$/, '')}/${用户输入镜像名}:${包信息.version}` : 本地镜像名

        if (最终推送镜像名 !== 本地镜像名) {
          console.log('执行命令: %O %O', 'docker', ['tag', 本地镜像名, 最终推送镜像名])
          let tag退出码 = await 执行命令行('docker', ['tag', 本地镜像名, 最终推送镜像名])
          if (tag退出码 !== 0) {
            console.error(`docker tag 失败，退出码: ${tag退出码}`)
            return
          }
        }

        // 执行 docker push
        console.log('执行命令: %O %O', 'docker', ['push', 最终推送镜像名])
        let 推送退出码 = await 执行命令行('docker', ['push', 最终推送镜像名])
        console.log(`docker push 进程退出，退出码: ${推送退出码}`)
      }
    }
  } catch (错误) {
    console.error('构建出错: ', 错误)
    exit(1)
  }
}

// 导出流程
async function 执行导出(): Promise<void> {
  // 用户选择镜像名称
  let { 用户输入镜像名 } = (await inquirer.prompt([
    {
      type: 'input',
      name: '用户输入镜像名',
      message: '请输入要导出的镜像名称（默认: ' + 项目名称 + '）:',
      default: 项目名称,
    },
  ])) as { 用户输入镜像名: string }

  // 二次确认要导出的镜像
  let { 是否确认镜像名 } = (await inquirer.prompt([
    {
      type: 'confirm',
      name: '是否确认镜像名',
      message: `要导出的镜像名称是 "${用户输入镜像名}:${包信息.version}"，确认无误吗？`,
      default: true,
    },
  ])) as { 是否确认镜像名: boolean }

  if (是否确认镜像名 === false) {
    console.log('用户取消了镜像名称确认。')
    exit(1)
  }

  // 默认文件名将斜杠替换为短横线
  let 默认文件名 = `${用户输入镜像名.replace(/\//g, '-')}-${包信息.version}.tar`
  let { 导出文件名 } = (await inquirer.prompt([
    {
      type: 'input',
      name: '导出文件名',
      message: '请输入导出的 tar 文件名（保存在项目根目录下）:',
      default: 默认文件名,
    },
  ])) as { 导出文件名: string }

  let 项目根目录 = path.resolve(import.meta.dirname, '../..')
  let 导出绝对路径 = path.resolve(项目根目录, 导出文件名)

  console.log(`镜像将导出为: ${导出绝对路径}`)
  console.log('执行命令: %O %O', 'docker', ['save', '-o', 导出绝对路径, `${用户输入镜像名}:${包信息.version}`])

  try {
    let 退出码 = await 执行命令行('docker', ['save', '-o', 导出绝对路径, `${用户输入镜像名}:${包信息.version}`])
    console.log(`docker save 进程退出，退出码: ${退出码}`)
    if (退出码 === 0) {
      console.log(`导出成功！文件已保存至: ${导出绝对路径}`)
    } else {
      console.error(`导出失败，退出码: ${退出码}`)
      exit(1)
    }
  } catch (toggle) {
    console.error('导出出错: ', toggle)
    exit(1)
  }
}

// 主流程入口
let { 操作模式 } = (await inquirer.prompt([
  {
    type: 'list',
    name: '操作模式',
    message: '请选择操作:',
    choices: [
      { name: '1. 打包 (构建镜像并可选推送)', value: '打包' },
      { name: '2. 导出 (将已有镜像导出为 tar 包)', value: '导出' },
    ],
    default: '打包',
  },
])) as { 操作模式: '打包' | '导出' }

switch (操作模式) {
  case '打包': {
    await 执行打包()
    break
  }
  case '导出': {
    await 执行导出()
    break
  }
}
