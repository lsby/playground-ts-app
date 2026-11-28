import { 登记快照标记 } from './registry-snapshot-format'
import { 读取需求描述文件 } from './requirement-file'
import { 需求测试运行器 } from './run-requirement'

// 在临时子进程里加载全部需求流程，只把可序列化的名称信息写到标准输出，避免流程模块留在常驻进程里。
let 项目根目录 = process.argv[2]
let 需求描述文件 = process.argv[3]
if (项目根目录 === undefined || 需求描述文件 === undefined) throw new Error('缺少项目根目录或需求描述文件参数')
let 登记 = await new 需求测试运行器(项目根目录).发现登记()
let { 业务需求, 验收点们 } = await 读取需求描述文件(需求描述文件)
let 快照 = {
  本需求: { 名称: 业务需求.获得名称(), 验收点键们: Object.keys(验收点们), 验收点数: 业务需求.获得验收点们().length },
  流程们: 登记.流程们.map(({ 流程, 文件 }) => ({ 名称: 流程.获得名称(), 文件 })),
  需求们: 登记.需求们.map((需求) => ({ 名称: 需求.获得名称(), 描述文件: 登记.需求描述路径们.get(需求) ?? null })),
}
process.stdout.write(`\n${登记快照标记}${JSON.stringify(快照)}\n`)
