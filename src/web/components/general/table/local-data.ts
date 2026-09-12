import { 数据表加载数据参数 } from './types'

export function 加载本地表格数据<数据项>(
  原始数据: readonly 数据项[],
  参数: 数据表加载数据参数<数据项>,
  可筛选字段: readonly (keyof 数据项)[],
): { 数据: 数据项[]; 总数: number } {
  let 数据 = [...原始数据]
  for (let 字段 of 可筛选字段) {
    let 筛选值 = 参数.筛选条件[String(字段)]
    if (筛选值 === undefined || 筛选值 === '') continue
    let 标准筛选值 = 筛选值.toLocaleLowerCase()
    数据 = 数据.filter((项): boolean => String(项[字段]).toLocaleLowerCase().includes(标准筛选值))
  }

  if (参数.排序列表.length > 0) {
    数据.sort((左项, 右项): number => {
      for (let 排序项 of 参数.排序列表) {
        let 比较结果 = 比较表格值(左项[排序项.field], 右项[排序项.field])
        if (比较结果 !== 0) return 排序项.direction === 'asc' ? 比较结果 : -比较结果
      }
      return 0
    })
  }

  let 总数 = 数据.length
  let 开始索引 = (参数.页码 - 1) * 参数.每页数量
  return { 数据: 数据.slice(开始索引, 开始索引 + 参数.每页数量), 总数 }
}

function 比较表格值(左值: unknown, 右值: unknown): number {
  if (左值 === 右值) return 0
  if (左值 === null || 左值 === undefined) return -1
  if (右值 === null || 右值 === undefined) return 1
  if (typeof 左值 === 'number' && typeof 右值 === 'number') return 左值 - 右值
  return String(左值).localeCompare(String(右值))
}
