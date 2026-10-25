import { z } from 'zod'

let 相对路径Schema = z
  .string()
  .min(1)
  .refine((值) => 值.includes('\\') === false, '路径必须使用 /')
  .refine((值) => 值.startsWith('/') === false && /^[A-Za-z]:/u.test(值) === false, '路径必须是相对路径')
  .refine((值) => 值.split('/').includes('..') === false, '路径不能包含 ..')

let 目标名称Schema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u, '目标名称仅支持小写字母、数字和短横线')

export let 阿里云目标配置Schema = z
  .object({
    provider: z.literal('aliyun-oss'),
    remotePrefix: z
      .string()
      .min(1)
      .refine((值) => 值.startsWith('/') === false && 值.endsWith('/') === false, 'remotePrefix 前后不能有 /'),
    env: z
      .object({
        region: z.string().min(1),
        endpoint: z.string().min(1),
        bucket: z.string().min(1),
        accessKeyId: z.string().min(1),
        accessKeySecret: z.string().min(1),
      })
      .strict(),
  })
  .strict()

export type 阿里云目标配置 = z.infer<typeof 阿里云目标配置Schema>

export let 腾讯云目标配置Schema = z
  .object({
    provider: z.literal('tencent-cos'),
    remotePrefix: z
      .string()
      .min(1)
      .refine((值) => 值.startsWith('/') === false && 值.endsWith('/') === false, 'remotePrefix 前后不能有 /'),
    env: z
      .object({
        region: z.string().min(1),
        bucket: z.string().min(1),
        secretId: z.string().min(1),
        secretKey: z.string().min(1),
      })
      .strict(),
  })
  .strict()

export type 腾讯云目标配置 = z.infer<typeof 腾讯云目标配置Schema>

export let 目标配置Schema = z.discriminatedUnion('provider', [阿里云目标配置Schema, 腾讯云目标配置Schema])
export type 目标配置 = z.infer<typeof 目标配置Schema>

export let 外挂LFS配置Schema = z
  .object({
    version: z.literal(1),
    credentialsFile: 相对路径Schema,
    keyFile: 相对路径Schema,
    manifestDirectory: 相对路径Schema,
    targets: z
      .record(目标名称Schema, 目标配置Schema)
      .refine((值) => Object.keys(值).length > 0, '至少配置一个存储目标'),
    managedPaths: z
      .array(z.object({ path: 相对路径Schema, scope: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u) }).strict())
      .min(1),
    exclude: z.array(z.string().min(1)),
  })
  .strict()

export type 外挂LFS配置 = z.infer<typeof 外挂LFS配置Schema>

export let 纯OSS凭据Schema = z
  .object({
    region: z.string().min(1),
    endpoint: z.string().url(),
    bucket: z.string().min(1),
    accessKeyId: z.string().min(1),
    accessKeySecret: z.string().min(1),
  })
  .strict()

export type 纯OSS凭据 = z.infer<typeof 纯OSS凭据Schema>

export let 纯COS凭据Schema = z
  .object({
    region: z.string().min(1),
    bucket: z.string().regex(/^[a-z0-9][a-z0-9-]*-\d+$/u),
    secretId: z.string().min(1),
    secretKey: z.string().min(1),
  })
  .strict()

export type 纯COS凭据 = z.infer<typeof 纯COS凭据Schema>

export type 目标云凭据 =
  | { targetName: string; provider: 'aliyun-oss'; credentials: 纯OSS凭据 }
  | { targetName: string; provider: 'tencent-cos'; credentials: 纯COS凭据 }

export let 清单Schema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    path: 相对路径Schema,
    scope: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    plaintext: z.object({ size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
    remote: z
      .object({
        target: 目标名称Schema,
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
