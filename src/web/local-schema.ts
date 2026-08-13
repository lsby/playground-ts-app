// 该文件由脚本自动生成, 请勿修改.
// 这是供前端 IndexedDB 持久化的 WASM-SQLite 数据库建表使用的 SQL 语句
export let 初始建表SQL = `
-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_initialized" BOOLEAN NOT NULL DEFAULT false,
    "enable_register" BOOLEAN NOT NULL,
    "enable_get_interface_type" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL,
    "jwt_secret" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "user_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    CONSTRAINT "user_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "pwd" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "user_config_user_id_key" ON "user_config"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_name_key" ON "user"("name");
`
