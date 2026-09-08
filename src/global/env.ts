import { z } from 'zod'
import { getRawEnv } from './env-provider'

export let 环境变量 = getRawEnv(
  z.object({
    // 环境名称
    NODE_ENV: z.enum(['development', 'production', 'test']),
    /**
     * 应用编译目标, 各模式运行时的文件结构不同:
     *
     * - development / test (web / pure-frontend / electron): 通过 tsx 直接运行源码, 代码在 src/ 下
     *   项目根/
     *   ├── src/server.ts    ← 入口
     *   ├── src/web/         ← 前端源码 (由 parcel dev server 代理)
     *   └── public/          ← 静态资源
     *
     * - production (web / electron): tsc 编译后运行, 代码在 dist/src/ 下, 多了一层 dist
     *   项目根/
     *   ├── dist/src/server.js    ← 入口 (web 用 node 运行)
     *   ├── dist/src/electron.js  ← 入口 (electron 由 electron-builder 打包)
     *   ├── dist/src/web/         ← parcel 编译后的前端产物
     *   └── public/               ← 静态资源
     *
     * - production (sea): 打包为单文件可执行程序, 没有项目根的概念
     *   任意目录/
     *   ├── app.exe          ← 入口 (所有后端代码打包在内)
     *   ├── dist/src/web/    ← 前端产物 (需要放在 exe 同级)
     *   └── public/          ← 静态资源 (需要放在 exe 同级)
     */
    BUILD_TARGET: z.enum(['web', 'electron', 'sea', 'pure-frontend']),
    // 调试名称
    DEBUG_NAME: z.string(),
    // 本地免登录模式
    LOCAL_MODE: z.enum(['true', 'false']).transform((值): boolean => 值 === 'true'),
    // ========= 数据库部分 开始 =========
    DB_TYPE: z.enum(['sqlite', 'pg', 'mysql']),
    // sqlite
    DB_PATH: z.string(),
    DB_BACKUP_PATH: z.string(),
    DB_BACKUP_PREFIX: z.string(),
    DB_BACKUP_AUTO_PREFIX: z.string(),
    DB_BACKUP_RETENTION_DAYS: z.coerce.number(),
    // pg/mysql
    // DB_USER: z.string(),
    // DB_PWD: z.string(),
    // DB_HOST: z.string(),
    // DB_PORT: z.coerce.number(),
    // DB_NAME: z.string(),
    // SHADOW_DB_NAME: z.string(),
    // ========= 数据库部分 结束 =========
    // 应用端口
    APP_PORT: z.coerce.number(),
    WEB_PORT: z.coerce.number(),
    WEB_HMR_PORT: z.coerce.number(),
    // 系统用户
    DEFAULT_SYSTEM_USER: z.string(),
    DEFAULT_SYSTEM_PWD: z.string(),
    // 文件上传
    UPLOAD_MAX_FILE_SIZE: z.coerce.number(),
    // JWT
    DEFAULT_JWT_SECRET: z.string(),
    JWT_EXPIRES_IN: z.string(),
    // bcrypt
    BCRYPT_ROUNDS: z.coerce.number(),
  }),
)
