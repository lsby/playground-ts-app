export function randomUUID(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  let bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  let 版本字节 = bytes[6]
  let 变体字节 = bytes[8]
  if (版本字节 === undefined || 变体字节 === undefined) throw new Error('生成 UUID 失败')
  bytes[6] = (版本字节 & 0x0f) | 0x40
  bytes[8] = (变体字节 & 0x3f) | 0x80
  let 十六进制 = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${十六进制.slice(0, 8)}-${十六进制.slice(8, 12)}-${十六进制.slice(12, 16)}-${十六进制.slice(16, 20)}-${十六进制.slice(20)}`
}

export function randomBytes(size: number): { toString: (encoding: string) => string } {
  let bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  return {
    toString: (encoding: string): string => {
      if (encoding !== 'hex') throw new Error(`Unsupported randomBytes encoding: ${encoding}`)
      return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    },
  }
}

export default { randomBytes, randomUUID }
