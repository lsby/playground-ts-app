import { 复制网站产物, 构建网站 } from './web-build'
import { 报告网站发布错误, 获取平台配置, 读取发布选择, 读取网站配置, type 网站平台 } from './web-config'

async function 构建全部网站(): Promise<void> {
  let 配置 = 读取网站配置()
  let 已构建路径 = new Map<string, string>()
  let 平台列表: 网站平台[] = ['oss', 'github-pages']
  let 选择 = 读取发布选择()
  for (let 平台 of 平台列表) {
    if (选择 !== 'all' && 平台 !== 选择) continue
    let 目标 = 获取平台配置(平台, 配置)
    if (目标.启用 === false) continue
    let 已有目录 = 已构建路径.get(目标.公共路径)
    if (已有目录 === undefined) {
      await 构建网站(目标.公共路径, 目标.产物目录)
      已构建路径.set(目标.公共路径, 目标.产物目录)
    } else 复制网站产物(已有目录, 目标.产物目录)
  }
}

void 构建全部网站().catch(报告网站发布错误)
