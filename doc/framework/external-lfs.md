# 外挂 LFS

外挂 LFS 用于同步不适合直接提交 Git、但构建和发布需要的私密文件。当前支持阿里云 OSS 和腾讯云 COS。Git 保存明文配置和逐文件加密清单，云存储只保存逐文件加密后的对象；`.project-config.key` 是唯一解密根密钥，仍需通过 GitHub Actions Secret 和线下备份保管。

## 启用

复制 `.external-lfs/config.example.json` 为 `.external-lfs/config.json`，然后显式修改以下内容：

- `provider`：`aliyun-oss` 或 `tencent-cos`。
- `remotePrefix`：该项目独占的云端前缀。
- `managedPaths`：需要同步的目录及其稳定 scope。不得直接沿用示例目录。
- `exclude`：管辖目录内不应上传的文件 glob。

`.external-lfs/config.json` 是项目配置，应提交 Git。模板不提供该文件，未完成配置时命令会立即失败。

## 云存储准备

创建私有 Bucket、开启版本控制，并把权限限制在 `remotePrefix`。工具上传后必须取得 `versionId`，否则立即失败；工具不会远程删除对象。

阿里云专用 RAM 用户的最小权限为 `oss:PutObject` 和 `oss:GetObject`。腾讯云专用 CAM 子用户的最小权限为 `cos:PutObject` 和 `cos:GetObject`。两家云的 HeadObject 都由 GetObject 权限控制。

在 `.env/.env.external-lfs` 写入所选 provider 对应的字段，然后立即运行 `npm run task -- env:enable-encryption`。正式文件加密后应提交 Git，不得提交短暂出现的明文内容。

阿里云 OSS：

```dotenv
CONFIG_ENCRYPTION=false
EXTERNAL_LFS_OSS_REGION=oss-cn-hangzhou
EXTERNAL_LFS_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
EXTERNAL_LFS_OSS_BUCKET=替换为Bucket名称
EXTERNAL_LFS_OSS_ACCESS_KEY_ID=替换为AccessKeyId
EXTERNAL_LFS_OSS_ACCESS_KEY_SECRET=替换为AccessKeySecret
```

腾讯云 COS：

```dotenv
CONFIG_ENCRYPTION=false
EXTERNAL_LFS_COS_REGION=ap-guangzhou
EXTERNAL_LFS_COS_BUCKET=替换为包含APPID的完整Bucket名称
EXTERNAL_LFS_COS_SECRET_ID=替换为SecretId
EXTERNAL_LFS_COS_SECRET_KEY=替换为SecretKey
```

日后修改凭据时使用现有的 `env:decode`、`env:encode` 流程。

## 安全边界

- 每次上传使用随机对象名，不覆盖旧对象；取消登记不会删除云端历史对象。
- 文件使用 AES-256-GCM 加密，每个对象和清单都使用随机盐，通过 HKDF 从 `.project-config.key` 派生独立密钥。
- 清单文件名是随机 UUID，文件路径、SHA-256、云端 object key 和 versionId 都在加密清单内部。
- `.external-lfs/manifests/` 无需预创建，首次产生清单时由 `push` 自动创建；其中生成的加密清单文件必须提交 Git。`.project-config.key`、管辖目录明文、恢复区和 `.decode` 文件禁止提交。
- 第一版拒绝符号链接，加密后单文件上限为 5 GiB。
- 同一组清单只属于一个 provider；切换云厂商前必须显式迁移。

## 命令

```bash
npm run task -- external-lfs:status
npm run task -- external-lfs:push
npm run task -- external-lfs:pull
npm run task -- external-lfs:verify
```

所有命令支持 `--scope <名称>`。`push` 遇到已登记但本地缺失的文件默认失败，人工确认后使用 `--accept-deletions`；`pull` 默认不覆盖本地变化，使用 `--exact` 时先把冲突和额外文件移动到 `.external-lfs/recovery/`。`verify` 下载全部选中对象，在临时目录中完成云端元数据、GCM 和明文 SHA-256 三层校验，不修改管辖目录。

## 提交保护

提交钩子会识别暂存区中的疑似二进制内容，并在放行前要求二次确认。此类文件原则上不应直接写入 Git；确有存储需求时，应优先纳入扩展 LFS，或采用其他合适的外部存储方案。
