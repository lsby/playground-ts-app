import { 执行测试开发套件 } from './dev-suite-runtime'

await 执行测试开发套件(async () => {
  let { 获得环境变量, 获得测试MCP配置 } = await import('../../src/global/env/env')
  return { 配置: 获得环境变量(), MCP配置: 获得测试MCP配置() }
})
