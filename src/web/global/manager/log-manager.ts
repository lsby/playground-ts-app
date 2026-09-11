import { Log } from '@lsby/ts-log'
import { 环境变量 } from '../../../global/env'

export let globalWebLog = new Log(环境变量.DEBUG_NAME).extend('web')
