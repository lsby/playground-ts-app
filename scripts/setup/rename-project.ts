import 询问器 from 'inquirer'
import 路径 from 'node:path'
import { 执行项目重命名, 解析当前包名 } from './rename-project-core.mjs'

async function 主函数(): Promise<void> {
  console.log('项目重命名工具')
  console.log('====================\n')
  let 项目根目录 = 路径.resolve(import.meta.dirname, '../..')
  let 当前名称 = 解析当前包名(项目根目录)
  let 回答 = await 询问器.prompt<{ 作者名: string; 项目名: string }>([
    { type: 'input', name: '作者名', message: '请输入新的作者名 (例如: mycompany):', default: 当前名称.作者名 },
    {
      type: 'input',
      name: '项目名',
      message: '请输入新的项目名 (例如: my-awesome-project):',
      default: 当前名称.项目名,
    },
  ])
  let 新作者名 = 回答.作者名.trim()
  let 新项目名 = 回答.项目名.trim()
  if (/^[a-z0-9-]+$/u.test(新作者名) === false || /^[a-z0-9-]+$/u.test(新项目名) === false) {
    throw new Error('作者名和项目名只能包含小写字母、数字和短横线')
  }
  if (新作者名 === 当前名称.作者名 && 新项目名 === 当前名称.项目名) {
    console.log('项目名称没有变化')
    return
  }
  let { 确认 } = await 询问器.prompt<{ 确认: boolean }>([
    {
      type: 'confirm',
      name: '确认',
      message: `确认将项目从 "@${当前名称.作者名}/${当前名称.项目名}" 重命名为 "@${新作者名}/${新项目名}"?`,
      default: false,
    },
  ])
  if (确认 === false) {
    console.log('已取消重命名操作')
    return
  }
  执行项目重命名({ 项目根目录, 新作者名, 新项目名 })
}

主函数().catch((错误) => {
  console.error('项目重命名失败:', 错误)
  process.exit(1)
})
