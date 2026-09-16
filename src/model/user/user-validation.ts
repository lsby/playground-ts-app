export type 用户名验证错误 = '用户名不能包含空格' | '用户名不能为空' | '用户名过短' | '用户名过长'

export type 密码验证错误 = '密码不能包含空格' | '密码不能为空' | '密码过短' | '密码过长'

export function 验证用户名(用户名: string): 用户名验证错误 | undefined {
  if (用户名.includes(' ')) return '用户名不能包含空格'
  if (用户名 === '') return '用户名不能为空'
  if (用户名.length < 5) return '用户名过短'
  if (用户名.length > 20) return '用户名过长'
  return undefined
}

export function 验证密码(密码: string): 密码验证错误 | undefined {
  if (密码.includes(' ')) return '密码不能包含空格'
  if (密码 === '') return '密码不能为空'
  if (密码.length < 6) return '密码过短'
  if (密码.length > 32) return '密码过长'
  return undefined
}
