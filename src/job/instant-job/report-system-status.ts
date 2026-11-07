import { CompiledQuery } from 'kysely'
import { 获得环境变量 } from '../../global/env'
import { 全局资源 } from '../../global/global'
import { 即时任务抽象类 } from '../../model/job-instant/instant-job'

export function 创建报告系统情况任务(): 即时任务抽象类<{ 状态: string }> {
  return 即时任务抽象类.创建任务({
    任务名称: '报告系统情况',
    即时任务优先级: 1,
    最大重试次数: 0,
    任务逻辑: async (上下文) => {
      await 上下文.输出日志('开始报告系统情况...')

      // 报告环境信息
      await 上下文.输出日志(`环境: ${获得环境变量().NODE_ENV}`)
      await 上下文.输出日志(`调试名称: ${获得环境变量().DEBUG_NAME}`)
      await 上下文.输出日志(`数据库类型: ${获得环境变量().DB_TYPE}`)
      await 上下文.输出日志(`应用端口: ${获得环境变量().APP_PORT}`)
      await 上下文.输出日志(`Web端口: ${获得环境变量().WEB_PORT}`)

      // 报告数据库状态
      try {
        await 全局资源.获得数据库().获得句柄().executeQuery(CompiledQuery.raw('SELECT 1 as test', []))
        await 上下文.输出日志('数据库连接正常')
      } catch (错误) {
        await 上下文.输出日志(`数据库检查失败: ${String(错误)}`)
      }

      // 报告任务管理器状态
      await 上下文.输出日志(`即时任务管理器最大并发数: ${全局资源.获得即时任务管理器().获得最大并发数()}`)

      // 报告系统时间
      await 上下文.输出日志(`系统启动时间: ${new Date().toISOString()}`)

      await 上下文.输出日志('系统情况报告完成')

      return { 状态: '成功' }
    },
    执行失败钩子: async (错误) => {
      let log = 全局资源.获得日志().extend('系统报告')
      await log.error('系统情况报告任务执行失败', 错误)
    },
  })
}
