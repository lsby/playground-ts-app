# 移动端需求测试与项目适配

Android 真机通过 ADB，iOS 模拟器通过 Xcode、Appium 和 WebDriverAgent 操作。两端共用需求、流程、录制、导出、报告、元素识别和图片等待。普通浏览器流程不加载移动配置；选择移动设备而配置缺失时立即报错，不启动后端或操作设备。

## 项目边界

项目在 `test/mobile-test.config.ts` 默认导出 `移动测试配置模型` 校验过的对象。该文件属于项目适配，不能同步到模板。可只配置 Android 或 iOS；包名、启动组件、网页来源、测试包构建位置和命令、OCR 可执行文件、Appium 安装目录及业务准备都由此提供。

```ts
import path from 'node:path'
import { 确认OCR文件 } from '../src/model/android-test/ocr'
import { 移动测试配置模型 } from '../src/test-tools/mobile-config'

let 项目根目录 = path.resolve(import.meta.dirname, '..')
export default 移动测试配置模型.parse({
  Android: {
    包名: 'com.example.app.test',
    启动组件: 'com.example.app.test/com.example.app.MainActivity',
    网页来源: 'https://localhost',
    标准构建: {
      目录: 'test-outputs/android-test',
      应用文件: 'app.apk',
      信息文件: 'build.json',
      构建命令: '项目自己的构建命令',
    },
    热重载构建: {
      目录: 'test-outputs/android-test-live',
      应用文件: 'app.apk',
      信息文件: 'build.json',
      构建命令: '项目自己的热重载构建命令',
    },
    获得OCR程序: async (): Promise<string> => await 确认OCR文件(项目根目录, 'tools/ocr/program.exe', 'OCR'),
  },
})
```

OCR 程序由项目提供，不要求下载任何特定项目的二进制。构建目录可为绝对路径，或相对明确的项目根目录；应用文件和信息文件相对构建目录。框架只读取、校验已有测试包，不会替项目执行构建或为 Android 自动安装。

iOS 还必须提供 `网页进程标识们`、`摘要路径们`、`Appium`。Appium 的 `目录` 和 `驱动目录` 必须是绝对路径，`端口` 和 `日志级别` 显式填写。`摘要路径们` 列出应用包内要验证的文件或目录，构建脚本用同一清单调用 `计算苹果应用摘要` 写入摘要。可选 `启动前(设备, 取消信号)` 在安装或清数据后、启动应用前执行，登录市场等业务设置只能放在此回调内。

构建信息使用以下明确契约：Android 提供 `apiBaseUrl`、`sha256`；iOS 另提供 `bundleId` 和 `testMarker: 'MobileTestIos'`。热重载包另提供 `liveUrl`。iOS 测试包的 WebView User-Agent 必须追加共享的 `苹果测试包标记`，代理通过 `scripts/test/proxy-routing.cjs` 识别并仅转发测试包请求到网络中转。旧测试包必须重新构建；缺少新标记会报错并提示构建命令，不做旧包兼容。

## 使用与清理

`dev:test -- --device <serial>` 连接 Android，`dev:test -- --ios-device <UDID>` 连接 iOS；回放同样传设备参数。iOS 需要在 macOS 上准备 Xcode、Appium 和 XCUITest 驱动。应用和构建任务属于项目，模板只提供框架。

Android 保留前台应用、权限弹窗来源、通知授权和测试包摘要检查，热重载包含 HMR 端口转发。iOS 保留干净安装、包摘要、后端地址、WebView 上下文和会话存活检查。升级前先退出旧版测试开发套件和设备会话。两端使用跨项目的设备锁，同一设备不能被两个仓库同时控制。

开发套件持有 iOS 网络中转直到退出；单个设备会话关闭或重置只恢复在线。Appium 和 WDA 仍可常驻，使用项目自己的移动配置停止：

```sh
pnpm exec tsx scripts/test/ios-resident-stop.ts
```

常驻管理器只结束自己记录的进程组，不按全局进程名称清理其他应用的服务。

浏览器自动模式也通过跨进程资源锁串行执行，同一时间最多一个框架无头浏览器；关闭旧会话后再打开新会话。录制可回放支持、目标区域限定、长流程拆分及失败流程补测见 [测试文档](testing.md#失败流程补测与运行前检查)。

浏览器步骤截图在页面内只读取当前几何位置，保留视口、滚动祖先及 Shadow DOM 裁剪；iframe 内的位置按真实元素边界换算。圆十字标记由 Node 侧 Sharp 绘制，不把截图传回页面 Canvas，不滚动目标或暂停、快进动画。

取证直接等待位置读取和 Node 标记绘制完成，不额外套用计时竞争；截图和 iframe 边界读取使用 Playwright 原生 10 秒超时。浏览器普通操作、导航及可见性断言在未显式指定时使用 10 秒兜底。

录制导出时，网页、Android 和 iOS 的点击、元素等待、导航及增强点击使用操作记录推算最长等待：实际起止耗时的两倍，向上取整到秒，至少 10 秒，同时保留记录中更长的显式 `timeoutMs`。没有有效耗时时使用 10 秒及有效显式值中的较大值。录制耗时包含操作后的观察与取证，因此只用作保守上限；条件提前达成立即继续，不按耗时固定停顿。该规则在导出时写入新脚本，已有测试脚本中的显式超时保持原样。三端 MCP 操作未传超时时均默认 10 秒。

标记位置读取使用当前匹配结果，不等待目标出现：零匹配时仍保存完整画面，一个匹配时标注可见位置，多个匹配明确报歧义。目标出现与就绪由实际操作和断言各自等待，取证不提前承担业务等待。

非监听模式的测试后端直接运行 Taskfile 中配置的 Node/tsx 服务入口，关闭时发送一次 `TEST_SERVICE_SHUTDOWN`。项目 `src/server.ts` 仅在测试环境接收该消息，等待应用关闭后退出；父进程等真实服务进程的 `close` 事件，再进入下一条流程。关闭失败或超时会明确报告，并只清理本次创建的进程树。监听模式保留原来的进程树清理，原端口检查仍执行。

## 同步约束

共有文件见 [mobile-testing-shared-files.json](mobile-testing-shared-files.json)。该清单中的文件在模板与项目中必须保持相同相对路径和字节内容；引擎、设备包装、MCP、录制导出、回放和依赖的通用模块都包含在内。项目环境实现、开发套件环境入口、移动配置、应用构建、数据库业务种子及业务需求用例留在各项目。

```sh
pnpm exec tsx scripts/test/check-mobile-framework-sync.ts --other-root D:/Code/另一个仓库
```

检查按 SHA-256 比较清单中的全部文件，缺文件或有差异均失败。修改通用实现时同步两侧，再执行类型检查、已有框架测试和此检查。
