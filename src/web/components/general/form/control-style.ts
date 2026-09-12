import { 增强样式类型 } from '../../../global/types/style'

export type 表单控件基础样式选项 = { 禁用: boolean; 光标: 'text' | 'pointer'; 高度?: string }

export function 获得表单控件基础样式(选项: 表单控件基础样式选项): 增强样式类型 {
  return {
    width: '100%',
    height: 选项.高度 ?? 'var(--控件高度)',
    padding: '0 var(--间距-3)',
    boxSizing: 'border-box',
    border: '1px solid var(--边框颜色)',
    borderRadius: 'var(--圆角-中)',
    backgroundColor: 选项.禁用 === true ? 'var(--禁用背景)' : 'var(--输入框背景)',
    color: 'var(--文字颜色)',
    cursor: 选项.禁用 === true ? 'not-allowed' : 选项.光标,
    opacity: 选项.禁用 === true ? '0.6' : '1',
    fontFamily: 'inherit',
    fontSize: 'var(--字号-正文)',
    transition: 'border-color var(--动画-快), box-shadow var(--动画-快)',
  }
}
