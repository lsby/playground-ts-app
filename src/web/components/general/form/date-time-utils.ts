function 补齐两位(值: number): string {
  return String(值).padStart(2, '0')
}

export function 本地日期时间转UTC(值: string): string | null {
  if (值 === '') return null
  let 日期 = new Date(值)
  if (Number.isNaN(日期.getTime()) === true) return null
  return 日期.toISOString()
}

export function UTC时间转本地输入值(值: string): string | null {
  let 日期 = new Date(值)
  if (Number.isNaN(日期.getTime()) === true) return null
  return `${日期.getFullYear()}-${补齐两位(日期.getMonth() + 1)}-${补齐两位(日期.getDate())}T${补齐两位(日期.getHours())}:${补齐两位(日期.getMinutes())}`
}

export function 格式化UTC时间(值: string, 时区: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  let 日期 = new Date(值)
  if (Number.isNaN(日期.getTime()) === true) return '无效时间'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 时区 }).format(日期)
}
