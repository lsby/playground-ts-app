import { z } from 'zod'

let 相对路径Schema = z
  .string()
  .min(1)
  .refine((值) => 值.includes('\\') === false, '路径必须使用 /')
  .refine((值) => 值.startsWith('/') === false && /^[A-Za-z]:/u.test(值) === false, '路径必须是相对路径')
  .refine((值) => 值.split('/').includes('..') === false, '路径不能包含 ..')

export let 外挂LFS配置Schema = z
  .object({
    version: z.literal(1),
    provider: z.enum(['aliyun-oss', 'tencent-cos']),
    credentialsFile: 相对路径Schema,
    keyFile: 相对路径Schema,
    manifestDirectory: 相对路径Schema,
    remotePrefix: z
      .string()
      .min(1)
      .refine((值) => 值.startsWith('/') === false && 值.endsWith('/') === false),
    managedPaths: z
      .array(z.object({ path: 相对路径Schema, scope: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u) }).strict())
      .min(1),
    exclude: z.array(z.string().min(1)),
  })
  .strict()

export type 外挂LFS配置 = z.infer<typeof 外挂LFS配置Schema>

export let OSS凭据Schema = z
  .object({
    CONFIG_ENCRYPTION: z.literal('false'),
    EXTERNAL_LFS_OSS_REGION: z.string().min(1),
    EXTERNAL_LFS_OSS_ENDPOINT: z.string().url(),
    EXTERNAL_LFS_OSS_BUCKET: z.string().min(1),
    EXTERNAL_LFS_OSS_ACCESS_KEY_ID: z.string().min(1),
    EXTERNAL_LFS_OSS_ACCESS_KEY_SECRET: z.string().min(1),
  })
  .strict()

export type OSS凭据 = z.infer<typeof OSS凭据Schema>

export let COS凭据Schema = z
  .object({
    CONFIG_ENCRYPTION: z.literal('false'),
    EXTERNAL_LFS_COS_REGION: z.string().min(1),
    EXTERNAL_LFS_COS_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]*-\d+$/u),
    EXTERNAL_LFS_COS_SECRET_ID: z.string().min(1),
    EXTERNAL_LFS_COS_SECRET_KEY: z.string().min(1),
  })
  .strict()

export type COS凭据 = z.infer<typeof COS凭据Schema>
export type 云凭据 =
  | { provider: 'aliyun-oss'; credentials: OSS凭据 }
  | { provider: 'tencent-cos'; credentials: COS凭据 }

export let 清单Schema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    path: 相对路径Schema,
    scope: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    plaintext: z.object({ size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
    remote: z
      .object({
        provider: z.enum(['aliyun-oss', 'tencent-cos']),
        objectKey: z.string().min(1),
        versionId: z.string().min(1),
        encryptedSize: z.number().int().positive(),
        crc64: z.string().regex(/^\d+$/u),
        etag: z.string().min(1),
      })
      .strict(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export type 清单 = z.infer<typeof 清单Schema>
export type 本地文件 = { path: string; scope: string; absolutePath: string; size: number; sha256: string }
