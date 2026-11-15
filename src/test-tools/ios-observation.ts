import type { 苹果测试引擎 } from '../model/ios-test'
import type { 画面观察适配器, 观察截图 } from './screen-observation'

export function 创建苹果观察适配器(引擎: 苹果测试引擎): 画面观察适配器 {
  return {
    截图: async (信号): Promise<观察截图> => {
      let 图片 = await 引擎.截图(信号)
      信号.throwIfAborted()
      let { width, height } = await 引擎.读取窗口()
      信号.throwIfAborted()
      return { 图片, 宽: width, 高: height, 逻辑宽: width, 逻辑高: height, 手机: true }
    },
  }
}
