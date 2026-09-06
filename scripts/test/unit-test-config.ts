export function 获得单元测试生成参数(过滤器?: string): string[] {
  let 参数组 = ['./tsconfig.json', './src/interface', './test/unit/unit-test.test.ts']
  if (过滤器 !== undefined) 参数组.push(过滤器)
  return 参数组
}
