import COS from 'cos-nodejs-sdk-v5'
import fs from 'node:fs'
import { z } from 'zod'
import type { 云存储仓库, 远端元数据 } from './cloud-store'
import type { COS凭据, 清单 } from './model'

let 响应头Schema = z
  .object({
    etag: z.string().min(1),
    'content-length': z.union([z.string(), z.number()]),
    'x-cos-hash-crc64ecma': z.union([z.string(), z.number()]),
    'x-cos-version-id': z.string().min(1),
  })
  .passthrough()

export class 腾讯云COS仓库 implements 云存储仓库 {
  private readonly 客户端: COS
  private readonly region: string
  private readonly bucket: string

  public constructor(凭据: COS凭据) {
    this.客户端 = new COS({ SecretId: 凭据.EXTERNAL_LFS_COS_SECRET_ID, SecretKey: 凭据.EXTERNAL_LFS_COS_SECRET_KEY })
    this.region = 凭据.EXTERNAL_LFS_COS_REGION
    this.bucket = 凭据.EXTERNAL_LFS_COS_BUCKET
  }

  private 解析响应头(输入: COS.Headers | undefined): 远端元数据 {
    let 头 = 响应头Schema.parse(输入)
    let encryptedSize = Number(头['content-length'])
    if (Number.isSafeInteger(encryptedSize) === false || encryptedSize <= 0) throw new Error('COS 返回了无效文件大小')
    return {
      encryptedSize,
      crc64: String(头['x-cos-hash-crc64ecma']),
      etag: 头.etag,
      versionId: 头['x-cos-version-id'],
    }
  }

  private async 查询对象(objectKey: string, versionId: string): Promise<远端元数据> {
    let 参数: COS.HeadObjectParams & { VersionId: string } = {
      Bucket: this.bucket,
      Region: this.region,
      Key: objectKey,
      VersionId: versionId,
      Headers: {},
    }
    let 结果 = await this.客户端.headObject(参数)
    return this.解析响应头(结果.headers)
  }

  public async 上传(objectKey: string, 文件路径: string): Promise<远端元数据> {
    let 文件大小 = fs.statSync(文件路径).size
    let 结果 = await this.客户端.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: objectKey,
      Body: fs.createReadStream(文件路径),
      ContentLength: 文件大小,
      Headers: {},
    })
    if (结果.VersionId === undefined || 结果.VersionId === '' || 结果.VersionId === 'null') {
      throw new Error('COS Bucket 未开启版本控制，拒绝生成不可追溯清单')
    }
    return this.查询对象(objectKey, 结果.VersionId)
  }

  public 查询(清单: 清单): Promise<远端元数据> {
    return this.查询对象(清单.remote.objectKey, 清单.remote.versionId)
  }

  public async 下载(清单: 清单, 文件路径: string): Promise<远端元数据> {
    let 输出流 = fs.createWriteStream(文件路径, { flags: 'wx' })
    let 结果 = await this.客户端.getObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: 清单.remote.objectKey,
      VersionId: 清单.remote.versionId,
      Output: 输出流,
      Headers: {},
    })
    return this.解析响应头(结果.headers)
  }
}
