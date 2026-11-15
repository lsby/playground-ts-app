export type 苹果目标 = { 按: '文字' | '描述' | '标识' | '网页文字' | '网页选择器'; 值: string }

/** 原生无障碍树里的一个元素，位置和尺寸单位是「点」（不是像素）。 */
export type 苹果界面元素 = {
  类型: string
  文字: string
  名称: string
  标识: string
  位置: { x: number; y: number; 宽: number; 高: number }
  可见: boolean
}
