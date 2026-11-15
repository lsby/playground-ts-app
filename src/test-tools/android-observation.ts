import type { 安卓测试引擎 } from '../model/android-test'
import type { 画面观察适配器, 观察截图 } from './screen-observation'

export function 创建安卓观察适配器(引擎: 安卓测试引擎): 画面观察适配器 {
  let 当前密度: number | undefined
  return {
    截图: async (信号): Promise<观察截图> => {
      let 图片 = await 引擎.截图(信号)
      当前密度 ??= await 引擎.读取屏幕密度(信号)
      let 宽 = 图片.readUInt32BE(16)
      let 高 = 图片.readUInt32BE(20)
      return { 图片, 宽, 高, 逻辑宽: (宽 * 160) / 当前密度, 逻辑高: (高 * 160) / 当前密度, 手机: true }
    },
  }
}
