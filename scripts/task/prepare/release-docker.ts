import inquirer from 'inquirer'
import { 读取部署服务器配置 } from '../../public/deploy-env'
import {
  Docker发布模式,
  Docker发布环境,
  压缩包哈希模式,
  序列化Docker发布参数,
  解析Docker发布参数,
  需要Docker发布确认,
  type Docker发布选项,
} from '../../public/tools/remote-release-options'
import type { 任务准备上下文, 任务准备结果 } from '../model/task-runner'

function 确认提示(模式: Docker发布选项['模式'], 环境: Docker发布选项['环境']): string {
  switch (模式) {
    case 'run':
    case 'run-uploaded':
      return `将覆盖远程 run/${环境} 下的同名文件并部署服务。打包内容中的运行时数据也会被覆盖，确认继续？`
    case 'redeploy':
      return `将停止服务并永久删除远程 run/${环境} 内的全部文件，包括数据库及持久化数据，然后重新部署。确认继续？`
    case 'delete':
      return '将停止全部环境服务、清理镜像并永久删除远程项目目录及其中全部数据。确认继续？'
    case 'sync-to-server':
      return '将用本地数据库覆盖服务器数据库，服务器文件会先备份。确认继续？'
    case 'build':
    case 'upload':
    case 'logs':
    case 'restart':
    case 'stop':
    case 'sync-to-local':
      return ''
  }
}

export async function 准备Docker发布参数(上下文: 任务准备上下文): Promise<任务准备结果> {
  let 服务器组 = 读取部署服务器配置(上下文.工作目录)
  if (上下文.参数.length > 0) {
    let 选项 = 解析Docker发布参数(上下文.参数)
    if (服务器组.some((服务器) => 服务器.name === 选项.服务器名称) === false)
      throw new Error(`找不到部署服务器: ${选项.服务器名称}`)
    return { 参数: 序列化Docker发布参数(选项) }
  }
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true)
    throw new Error('非交互发布请提供 --non-interactive、--server、--mode 和 --environment；危险操作还需 --yes')
  let { 服务器名称, 模式 } = await inquirer.prompt<Pick<Docker发布选项, '服务器名称' | '模式'>>([
    { type: 'list', name: '服务器名称', message: '请选择目标服务器:', choices: 服务器组.map((服务器) => 服务器.name) },
    {
      type: 'list',
      name: '模式',
      message: '请选择操作模式:',
      default: 'run',
      choices: [
        { name: '打包镜像 (build)', value: 'build' },
        { name: '运行项目 (run)', value: 'run' },
        { name: '只上传包 (upload)', value: 'upload' },
        { name: '部署已上传包 (run-uploaded)', value: 'run-uploaded' },
        { name: '查看日志 (logs)', value: 'logs' },
        { name: '重启项目 (restart)', value: 'restart' },
        { name: '重新部署 (redeploy)', value: 'redeploy' },
        { name: '停止运行 (stop)', value: 'stop' },
        { name: '删除项目 (delete)', value: 'delete' },
        { name: '同步数据到本地 (sync-to-local)', value: 'sync-to-local' },
        { name: '同步数据到服务器 (sync-to-server)', value: 'sync-to-server' },
      ],
    },
  ])
  模式 = Docker发布模式.parse(模式)
  let 环境: Docker发布选项['环境']
  if (模式 !== 'delete') {
    let 回答 = await inquirer.prompt<{ 环境: string }>([
      { type: 'list', name: '环境', message: '请选择环境:', choices: Docker发布环境.options, default: 'development' },
    ])
    环境 = Docker发布环境.parse(回答.环境)
  }
  let 使用缓存 = true
  let 复用本地构建 = true
  if (['build', 'run', 'redeploy', 'run-uploaded'].includes(模式) === true) {
    let 回答 = await inquirer.prompt<{ 使用缓存: boolean }>([
      { type: 'confirm', name: '使用缓存', message: '是否使用镜像缓存?', default: true },
    ])
    使用缓存 = 回答.使用缓存
  }
  if (['build', 'run', 'redeploy', 'upload'].includes(模式) === true) {
    let 回答 = await inquirer.prompt<{ 复用本地构建: boolean }>([
      { type: 'confirm', name: '复用本地构建', message: '是否本地构建并复用 dist，免去服务器编译?', default: true },
    ])
    复用本地构建 = 回答.复用本地构建
  }
  let 压缩包哈希: string | undefined
  if (模式 === 'run-uploaded') {
    let 回答 = await inquirer.prompt<{ 压缩包哈希: string }>([
      { type: 'input', name: '压缩包哈希', message: '请输入上传完成时显示的 SHA-256:' },
    ])
    压缩包哈希 = 压缩包哈希模式.parse(回答.压缩包哈希.trim())
  }
  if (需要Docker发布确认(模式) === true) {
    let 回答 = await inquirer.prompt<{ 确认: boolean }>([
      { type: 'confirm', name: '确认', message: 确认提示(模式, 环境), default: false },
    ])
    if (回答.确认 === false) throw new Error('已取消 Docker 发布')
  }
  return {
    参数: 序列化Docker发布参数({
      服务器名称,
      模式,
      环境,
      使用缓存,
      复用本地构建,
      压缩包哈希,
      跟随日志: ['logs', 'run', 'run-uploaded', 'restart', 'redeploy'].includes(模式),
    }),
  }
}
