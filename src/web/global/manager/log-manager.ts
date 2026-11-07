import { Log } from '@lsby/ts-log'
import { 获得环境变量 } from '../../../global/env'

let 网页日志: Log | null = null
export function 获得网页日志(): Log {
  if (网页日志 === null) 网页日志 = new Log(获得环境变量().DEBUG_NAME).extend('web')
  return 网页日志
}
