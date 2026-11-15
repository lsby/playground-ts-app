import sharp from 'sharp'

export async function 压缩步骤截图(图片: Buffer): Promise<Buffer> {
  return await sharp(图片).webp({ quality: 85, smartSubsample: true }).toBuffer()
}
