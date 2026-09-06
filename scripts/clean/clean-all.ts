import { existsSync, rmSync } from 'fs'

function 清理全部(): void {
  let 路径组 = ['dist', '.parcel-cache']
  for (let 路径 of 路径组) {
    if (existsSync(路径)) {
      try {
        rmSync(路径, { recursive: true, force: true })
        console.log('已清理:', 路径)
      } catch (错误) {
        console.error('清理失败:', 错误)
        process.exit(1)
      }
    } else {
      console.log('目录不存在: %o, 无需清理', 路径)
    }
  }
}

清理全部()
