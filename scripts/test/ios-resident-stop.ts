import path from 'node:path'
import { 创建Appium常驻管理器 } from '../../src/model/ios-test/resident'
import { 读取移动测试配置 } from '../../src/test-tools/mobile-config'

let 配置 = (await 读取移动测试配置(path.resolve(import.meta.dirname, '../..'))).iOS
if (配置 === undefined) throw new Error('项目未配置 iOS 测试能力')
let 结果 = await 创建Appium常驻管理器(配置.Appium).停止全部常驻服务()
console.log(结果.length === 0 ? '没有在运行的 iOS 常驻服务' : 结果.join('\n'))
