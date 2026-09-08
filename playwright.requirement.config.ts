import { defineConfig, devices } from '@playwright/test'

let port = process.env.APP_PORT
if (port === undefined) throw new Error('运行需求测试失败：缺少 APP_PORT，请通过任务系统启动测试')

export default defineConfig({
  testDir: './test/requirement',
  outputDir: './test-outputs/requirement-results',
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 2,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: './test-outputs/requirement-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: process.env.DEMO_MODE !== 'true',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run task -- test:e2e:server',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: process.env.CI === undefined,
    timeout: 120000,
  },
})
