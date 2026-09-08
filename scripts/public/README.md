# 发布脚本说明

本目录存放不同目标的发布脚本。远程 Docker 发布的通用实现位于 `release-docker-remote.ts`，服务器配置示例位于 `../../deploy/servers.example.json`，不同环境的 Compose 配置位于 `../../deploy/development/` 和 `../../deploy/production/`。

## Docker 远程部署

### 复用边界

- 现有通用发布流程能够满足需求时，不要新建项目专用发布脚本或 `deploy/<项目名>/` 目录
- 修改 Dockerfile 或 docker-compose 文件时应保留现有模板结构，只增补实际需要的依赖、端口或数据卷

### 远程目录

- `deployRootDir` 表示统一部署根目录，不是 SSH 用户的家目录
- 项目目录固定为 `<部署根目录>/<规范化项目名>`
- 未配置 `deployRootDir` 时才使用远程用户的 `$HOME`
- 项目目录下的 `upload/` 接收临时文件，`build/<环境>/` 用于构建，`run/<环境>/` 用于实际运行

Docker Compose 在 `run/<环境>/deploy/<环境>/` 中执行。相对数据卷以该目录为基准，例如 `../../db:/opt/app/db` 实际映射到 `run/<环境>/db`。

只有大体积数据或需要脱离项目生命周期长期保留的数据才使用宿主机绝对路径挂载。使用绝对挂载时必须同时明确备份、迁移和删除策略。

### 生命周期

- `run` 直接覆盖运行目录中的同名文件，不会先清空整个目录
- 打包产物如果包含同名 SQLite 数据库或其他数据文件，会覆盖远程已有文件
- `redeploy` 删除整个 `run/<环境>/`，其中的相对卷数据也会被删除
- `delete` 删除整个远程项目目录
- 只有位于项目目录之外的绝对挂载不受 `delete` 影响，其生命周期需要单独维护

执行 `redeploy` 或 `delete` 前必须确认数据是否需要备份或迁移。

### 环境与密钥

- 不同运行目标语义不同时应使用独立环境文件，不要在 Compose 中暗改其他目标的 `BUILD_TARGET`
- Docker 构建通过 BuildKit Secret 读取实际环境文件，不要把包含密钥的配置复制到镜像层
- `.env/*.example` 和 `deploy/servers.example.json` 只能包含脱敏的公开示例
