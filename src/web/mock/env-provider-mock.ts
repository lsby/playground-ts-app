import { z } from 'zod'

export function getRawEnv<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.infer<z.ZodObject<T>> {
  let 假环境变量 = {
    NODE_ENV: process.env['NODE_ENV'],
    BUILD_TARGET: process.env['BUILD_TARGET'],
    DEBUG_NAME: process.env['DEBUG_NAME'],
    LOCAL_MODE: process.env['LOCAL_MODE'],
    PREVIEW_MODE: process.env['PREVIEW_MODE'],
    DB_TYPE: process.env['DB_TYPE'],
    DB_PATH: process.env['DB_PATH'],
    DB_BACKUP_PATH: process.env['DB_BACKUP_PATH'],
    DB_BACKUP_PREFIX: process.env['DB_BACKUP_PREFIX'],
    DB_BACKUP_AUTO_PREFIX: process.env['DB_BACKUP_AUTO_PREFIX'],
    DB_BACKUP_RETENTION_DAYS: process.env['DB_BACKUP_RETENTION_DAYS'],
    APP_PORT: process.env['APP_PORT'],
    WEB_PORT: process.env['WEB_PORT'],
    WEB_HMR_PORT: process.env['WEB_HMR_PORT'],
    DEFAULT_SYSTEM_USER: process.env['DEFAULT_SYSTEM_USER'],
    DEFAULT_SYSTEM_PWD: process.env['DEFAULT_SYSTEM_PWD'],
    UPLOAD_MAX_FILE_SIZE: process.env['UPLOAD_MAX_FILE_SIZE'],
    DEFAULT_JWT_SECRET: process.env['DEFAULT_JWT_SECRET'],
    JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'],
    BCRYPT_ROUNDS: process.env['BCRYPT_ROUNDS'],
  }
  return schema.parse(假环境变量)
}
