let 布尔参数定义们 = [
  ['--initialize', '--no-initialize', '执行初始化'],
  ['--github-secret', '--no-github-secret', '配置GitHubSecret'],
  ['--random-ports', '--no-random-ports', '使用随机端口'],
  ['--regenerate-ports', '--no-regenerate-ports', '重新生成端口'],
  ['--dev-database', '--no-dev-database', '初始化开发数据库'],
  ['--rename-project', '--no-rename-project', '重命名项目'],
  ['--confirm-rename', '--no-confirm-rename', '确认重命名'],
]

function 设置布尔参数(结果, 字段, 值, 参数名) {
  let 旧值 = 结果[字段]
  if (旧值 !== undefined && 旧值 !== 值) throw new Error(`参数 ${参数名} 与已指定的反向参数冲突`)
  结果[字段] = 值
}

function 设置文本参数(结果, 字段, 值, 参数名) {
  let 标准值 = 值?.trim()
  if (标准值 === undefined || 标准值 === '') throw new Error(`参数 ${参数名} 必须提供非空值`)
  let 旧值 = 结果[字段]
  if (旧值 !== undefined && 旧值 !== 标准值) throw new Error(`参数 ${参数名} 被重复指定且值不一致`)
  结果[字段] = 标准值
}

export function 解析初始化参数(参数们) {
  let 结果 = { 强制运行: false, 显示帮助: false }
  for (let 索引 = 0; 索引 < 参数们.length; 索引 += 1) {
    let 参数 = 参数们[索引]
    if (参数 === undefined) throw new Error(`初始化参数索引越界: ${索引}`)
    if (参数 === '--force') {
      结果.强制运行 = true
      continue
    }
    if (参数 === '--help' || 参数 === '-h') {
      结果.显示帮助 = true
      continue
    }
    let 布尔定义 = 布尔参数定义们.find(([正向, 反向]) => 参数 === 正向 || 参数 === 反向)
    if (布尔定义 !== undefined) {
      let [正向, , 字段] = 布尔定义
      设置布尔参数(结果, 字段, 参数 === 正向, 参数)
      continue
    }
    let 文本定义们 = [
      ['--new-author', '新作者名'],
      ['--new-project', '新项目名'],
    ]
    let 文本定义 = 文本定义们.find(([名称]) => 参数 === 名称 || 参数.startsWith(`${名称}=`))
    if (文本定义 !== undefined) {
      let [名称, 字段] = 文本定义
      let 值 = 参数 === 名称 ? 参数们[索引 + 1] : 参数.slice(名称.length + 1)
      设置文本参数(结果, 字段, 值, 名称)
      if (参数 === 名称) 索引 += 1
      continue
    }
    throw new Error(`未知的初始化参数: ${参数}`)
  }
  if (
    结果.重命名项目 === false &&
    (结果.新作者名 !== undefined || 结果.新项目名 !== undefined || 结果.确认重命名 === true)
  ) {
    throw new Error('--no-rename-project 不能与重命名参数同时使用')
  }
  return 结果
}

export function 打印初始化帮助() {
  console.log(`
项目初始化参数：
  --force                                      强制重新运行向导（setup:all 自动提供）
  --initialize / --no-initialize
  --github-secret / --no-github-secret
  --random-ports / --no-random-ports
  --regenerate-ports / --no-regenerate-ports
  --dev-database / --no-dev-database
  --rename-project / --no-rename-project
  --new-author <新作者名>
  --new-project <新项目名>
  --confirm-rename / --no-confirm-rename
  --help / -h                                  显示本帮助

未指定的选项在交互终端中继续询问；非交互环境使用上次状态或安全默认值。
命令示例：
  npm run setup:all -- --no-github-secret --random-ports --regenerate-ports --dev-database --no-rename-project`)
}
