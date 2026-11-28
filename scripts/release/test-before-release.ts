import { 优雅终止全部任务进程, 定义任务, 强制终止全部任务进程, 执行任务 } from '../task/model/task-runner'
import { 数据库任务表 } from '../task/taskfile/taskfile-db'
import { 测试任务表 } from '../task/taskfile/taskfile-test'
import { 解析发布测试参数 } from './unit-test-options'

let { 运行单测, 过滤器 } = 解析发布测试参数(process.argv.slice(2))
if (运行单测 === undefined) throw new Error('发布单测步骤缺少 --unit-tests 参数，请通过发布任务准备选项')
if (运行单测 === false) console.log('本次发布跳过单元测试')
else {
  if (过滤器 === undefined) throw new Error('发布单测步骤缺少 --unit-test-filter 参数')
  let 取消控制器 = new AbortController()
  let 退出处理: Promise<void> | undefined
  let 请求退出 = (信号: 'SIGINT' | 'SIGTERM'): void => {
    if (退出处理 !== undefined) {
      强制终止全部任务进程()
      return
    }
    取消控制器.abort(new Error(`收到退出信号: ${信号}`))
    退出处理 = 优雅终止全部任务进程(信号)
  }
  let 处理中断 = (): void => 请求退出('SIGINT')
  let 处理终止 = (): void => 请求退出('SIGTERM')
  process.on('SIGINT', 处理中断)
  process.on('SIGTERM', 处理终止)
  try {
    await 执行任务(定义任务({ ...数据库任务表, ...测试任务表 }), 'test:unit', {
      传递参数: ['--filter', 过滤器],
      取消信号: 取消控制器.signal,
    })
  } finally {
    if (退出处理 !== undefined) await 退出处理
    process.off('SIGINT', 处理中断)
    process.off('SIGTERM', 处理终止)
  }
}
