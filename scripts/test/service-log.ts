import { StringDecoder } from 'node:string_decoder'

export class 测试日志缓冲 {
  private 解码器 = new StringDecoder('utf8')
  private 内容 = ''
  private 结束位置 = 0

  public 追加(数据: Buffer): void {
    let 文本 = this.解码器.write(数据)
    this.结束位置 += 文本.length
    this.内容 = (this.内容 + 文本).slice(-32_768)
  }

  public 获得位置(): number {
    return this.结束位置
  }

  public 读取(起点: number): string {
    let 最早位置 = this.结束位置 - this.内容.length
    if (起点 < 最早位置) return `（较早日志已截断）\n${this.内容}`
    return this.内容.slice(起点 - 最早位置)
  }
}
