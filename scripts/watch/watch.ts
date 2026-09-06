import crossSpawn from 'cross-spawn'
import nodeWatch from 'node-watch'
import * as path from 'path'

let 参数 = process.argv.slice(2)
let 分隔符索引 = 参数.indexOf('--')
if (分隔符索引 <= 0 || 分隔符索引 === 参数.length - 1)
  throw new Error('参数不足。用法: tsx watch.ts <路径1> [路径2...] -- <程序> [参数...]')
let 监控路径列表 = 参数.slice(0, 分隔符索引)
let 程序参数值 = 参数[分隔符索引 + 1]
if (程序参数值 === undefined) throw new Error('缺少需要重复执行的程序')
let 程序: string = 程序参数值
let 程序参数 = 参数.slice(分隔符索引 + 2)

function 任务(): void {
  console.clear()
  console.log('========生成开始========')
  try {
    console.log('执行', 程序, ...程序参数)
    let 结果 = crossSpawn.sync(程序, 程序参数, { env: process.env, stdio: 'inherit' })
    if (结果.error instanceof Error) throw 结果.error
    if (结果.status !== 0) throw new Error(`程序退出码: ${String(结果.status)}`)
  } catch (e: unknown) {
    console.error(`错误: ${String(e)}`)
  }
  console.log('========生成结束========')
}
任务()

let 定时器句柄: NodeJS.Timeout | undefined
let 状态: '执行中' | '空闲中' | '等待稍后执行' = '空闲中'
let 延时 = 1000
let 执行堆积 = false
nodeWatch(
  监控路径列表.map((项) => path.resolve(项)),
  {
    recursive: true,
    filter: (name) => {
      console.log('文件变化: ' + name)

      return true
    },
  },
  function () {
    switch (状态) {
      case '执行中':
        console.log('正在执行中, 本次事件将会在稍后执行')
        执行堆积 = true
        return
      case '等待稍后执行':
        console.log('正在等待稍后执行, 本次事件将会在稍后与当前事件一并执行')
        if (定时器句柄 !== undefined) clearTimeout(定时器句柄)
        break
      case '空闲中':
        console.log('正在空闲中, 本次事件将会在稍后执行')
        状态 = '等待稍后执行'
        break
    }

    定时器句柄 = setTimeout(function f() {
      状态 = '执行中'
      任务()
      状态 = '空闲中'
      if (执行堆积 === true) {
        执行堆积 = false
        setTimeout(() => f(), 0)
      }
    }, 延时)
  },
)
