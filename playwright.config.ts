import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load test environment variables
let 当前目录 = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(当前目录, '.env', '.env.test.web') })

let port = process.env.APP_PORT
if (port === undefined) {
  throw new Error('运行测试失败：未在 .env.test.web 中找到 APP_PORT 环境变量！')
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './test/e2e',
  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: './test-outputs/test-results',
  /* Run tests in files in parallel */
  fullyParallel: false, // E2E 涉及到清空数据库，最好串行运行避免互相干扰
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: './test-outputs/playwright-report' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://127.0.0.1:${port}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    // demo 模式下走有头，非 demo 模式下走无头
    headless: process.env.DEMO_MODE !== 'true',
  },

  /* Configure projects for major browsers */
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /* 自动拉起测试服务器 */
  webServer: {
    // 启动前先构建一下前端，然后拉起以 test-web 环境变量运行的服务端进程 (端口 9000)
    command: 'pnpm _build:web-test && pnpm run:service:test',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
