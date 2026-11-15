export type 安卓目标 = { 按: '文字' | '描述' | '资源ID' | '网页文字' | '网页选择器'; 值: string }

export type 安卓界面元素 = {
  文字: string
  描述: string
  资源ID: string
  包名: string
  范围: { 左: number; 上: number; 右: number; 下: number }
  可点击: boolean
  可输入: boolean
}
