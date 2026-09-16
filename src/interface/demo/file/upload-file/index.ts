import {
  Form参数解析插件,
  常用接口返回器,
  接口,
  接口逻辑,
  计算接口逻辑正确结果,
  计算接口逻辑错误结果,
} from '@lsby/net-core'
import { Right } from '@lsby/ts-fp-data'
import { z } from 'zod'
import { 环境变量 } from '../../../../global/env'
import { 检查登录 } from '../../../../interface-logic/check/check-login-jwt'

let 接口路径 = '/api/demo/file/upload-file' as const
let 接口方法 = 'post' as const

let 接口逻辑实现 = 接口逻辑
  .空逻辑()
  .绑定(检查登录)
  .绑定(
    接口逻辑.构造(
      [
        new Form参数解析插件(z.object({ description: z.string().optional() }), {
          limits: { fileSize: 环境变量.UPLOAD_MAX_FILE_SIZE * 1024 * 1024 },
        }),
      ],
      async (参数, 逻辑附加参数, 请求附加参数) => {
        let log = 请求附加参数.log.extend(接口路径)
        await log.debug(
          'userId为%o的用户, 上传的文件信息: %j, 负载信息是: %o',
          逻辑附加参数.userId,
          参数.form.files.map((a) => a.originalname).join(', '),
          参数.form.data,
        )

        let { data, files } = 参数.form

        await log.info('解析后:', {
          description: data.description,
          fileCount: Array.isArray(files) ? files.length : 'not array',
        })

        for (let file of files) {
          await log.info('处理文件:', file.originalname, '大小:', file.size)
          // 如果需要保存文件, 可以写 file.buffer 到文件
        }

        let 返回数据 = {
          message: `成功上传 ${files.length} 个文件`,
          files: files.map((f) => ({ name: f.originalname, size: f.size })),
        }

        return new Right(返回数据)
      },
    ),
  )

type _接口逻辑错误返回 = 计算接口逻辑错误结果<typeof 接口逻辑实现>
type _接口逻辑正确返回 = 计算接口逻辑正确结果<typeof 接口逻辑实现>

let 接口错误类型描述 = z.enum(['未登录'])
let 接口正确类型描述 = z.object({
  message: z.string(),
  files: z.array(z.object({ name: z.string(), size: z.number() })),
})

export default new 接口(接口路径, 接口方法, 接口逻辑实现, new 常用接口返回器(接口错误类型描述, 接口正确类型描述))
