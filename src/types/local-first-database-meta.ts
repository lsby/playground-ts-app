// 该文件由脚本自动生成, 请勿修改.
export let 本地数据库Schema指纹 = "887bc121e861f45965e9a8c0b0972a58fdbddd99545b8e3007fa9563dfc37bfa"
export let 本地数据库主键表: Record<string, string[]> = {
  "system_config": [
    "id"
  ],
  "user_config": [
    "id"
  ],
  "user": [
    "id"
  ]
}
export let 浏览器迁移列表: { 名称: string; 校验和: string; SQL: string }[] = [
  {
    "名称": "00000000000000_init",
    "SQL": "-- CreateTable\nCREATE TABLE \"system_config\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY DEFAULT 'SYSTEM_DEFAULT',\n    \"created_at\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"is_initialized\" BOOLEAN NOT NULL DEFAULT false,\n    \"enable_register\" BOOLEAN NOT NULL,\n    \"enable_get_interface_type\" BOOLEAN NOT NULL DEFAULT false,\n    \"version\" TEXT NOT NULL,\n    \"jwt_secret\" TEXT NOT NULL\n);\n\n-- CreateTable\nCREATE TABLE \"user_config\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"created_at\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"user_id\" TEXT NOT NULL,\n    \"theme\" TEXT NOT NULL,\n    CONSTRAINT \"user_config_user_id_fkey\" FOREIGN KEY (\"user_id\") REFERENCES \"user\" (\"id\") ON DELETE RESTRICT ON UPDATE RESTRICT\n);\n\n-- CreateTable\nCREATE TABLE \"user\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"created_at\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"name\" TEXT NOT NULL,\n    \"pwd\" TEXT NOT NULL,\n    \"is_admin\" BOOLEAN NOT NULL\n);\n\n-- CreateIndex\nCREATE UNIQUE INDEX \"user_config_user_id_key\" ON \"user_config\"(\"user_id\");\n\n-- CreateIndex\nCREATE UNIQUE INDEX \"user_name_key\" ON \"user\"(\"name\");\n",
    "校验和": "332b843d9dcdd07ca9af4c528ba765899abe797ead9f0138f0fab9fc362d8ae0"
  }
]
