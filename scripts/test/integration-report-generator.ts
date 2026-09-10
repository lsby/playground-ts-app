import * as fs from 'node:fs'
import * as path from 'node:path'

export type 单个集成测试结果 = {
  测试文件名: string
  相对路径: string
  状态: 'passed' | 'failed'
  耗时毫秒: number
  退出码: number
  标准输出: string
  错误输出: string
  开始时间: string
  结束时间: string
}

export type 集成测试报告汇总 = {
  执行时间: string
  总测试数: number
  通过数: number
  失败数: number
  总耗时毫秒: number
  Node版本: string
  平台: string
  用例列表: 单个集成测试结果[]
}

function 转义Html(字符串: string): string {
  return 字符串
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function 清理Ansi控制字符(文本: string): string {
  // 匹配常见的 ANSI 转义序列
  return 文本.replace(/\u001B\[[0-9;]*[a-zA-Z]/g, '')
}

function 格式化耗时(毫秒: number): string {
  if (毫秒 < 1000) return `${String(毫秒)} ms`
  let 秒 = (毫秒 / 1000).toFixed(2)
  return `${秒} s`
}

function 生成Html内容(数据: 集成测试报告汇总): string {
  let 全部通过 = 数据.失败数 === 0
  let 成功率 = 数据.总测试数 === 0 ? '100%' : `${String(Math.round((数据.通过数 / 数据.总测试数) * 100))}%`
  let 主题状态色 = 全部通过 === true ? '#10b981' : '#ef4444'

  let 用例列表Html = 数据.用例列表
    .map((项) => {
      let 是通过 = 项.状态 === 'passed'
      let 徽章样式 = 是通过 === true ? 'badge-passed' : 'badge-failed'
      let 徽章文字 = 是通过 === true ? 'PASSED' : 'FAILED'
      let 默认展开 = 是通过 === false ? 'open' : ''
      let 清洗后标准输出 = 转义Html(清理Ansi控制字符(项.标准输出.trim()))
      let 清洗后错误输出 = 转义Html(清理Ansi控制字符(项.错误输出.trim()))

      let 日志块 = ''
      if (清洗后错误输出 !== '') {
        日志块 += `<div class="log-title stderr-title">错误输出 (stderr)</div><pre class="log-content stderr-content">${清洗后错误输出}</pre>`
      }
      if (清洗后标准输出 !== '') {
        日志块 += `<div class="log-title stdout-title">标准输出 (stdout)</div><pre class="log-content stdout-content">${清洗后标准输出}</pre>`
      }
      if (日志块 === '') {
        日志块 = `<div class="log-empty">无控制台输出</div>`
      }

      return `
      <details class="test-item ${项.状态}" ${默认展开} data-status="${项.状态}">
        <summary class="test-summary">
          <div class="summary-left">
            <span class="status-badge ${徽章样式}">${徽章文字}</span>
            <span class="test-title">${转义Html(项.测试文件名)}</span>
            <span class="test-path">${转义Html(项.相对路径)}</span>
          </div>
          <div class="summary-right">
            <span class="duration">${格式化耗时(项.耗时毫秒)}</span>
            <span class="arrow">▼</span>
          </div>
        </summary>
        <div class="test-detail">
          <div class="meta-row">
            <span>开始: ${转义Html(项.开始时间)}</span>
            <span>结束: ${转义Html(项.结束时间)}</span>
            <span>退出码: ${String(项.退出码)}</span>
          </div>
          <div class="logs-container">
            ${日志块}
          </div>
        </div>
      </details>
      `
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>集成测试报告 - Integration Test Report</title>
  <style>
    :root {
      --bg-color: #f8fafc;
      --card-bg: #ffffff;
      --text-color: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --passed-color: #10b981;
      --passed-bg: #ecfdf5;
      --failed-color: #ef4444;
      --failed-bg: #fef2f2;
      --terminal-bg: #0f172a;
      --terminal-text: #e2e8f0;
      --accent-color: #3b82f6;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0b0f19;
        --card-bg: #1e293b;
        --text-color: #f1f5f9;
        --text-muted: #94a3b8;
        --border-color: #334155;
        --passed-color: #34d399;
        --passed-bg: rgba(16, 185, 129, 0.15);
        --failed-color: #f87171;
        --failed-bg: rgba(239, 68, 68, 0.15);
        --terminal-bg: #020617;
        --terminal-text: #cbd5e1;
        --accent-color: #60a5fa;
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: 1.5;
      padding: 24px;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 12px;
    }

    .header-title h1 {
      font-size: 24px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status-pill {
      font-size: 13px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-weight: 600;
      color: #fff;
      background-color: ${主题状态色};
    }

    .header-info {
      font-size: 13px;
      color: var(--text-muted);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .metric-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .metric-card .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .metric-card .metric-value {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.2;
    }

    .metric-passed { color: var(--passed-color); }
    .metric-failed { color: var(--failed-color); }

    .progress-bar-container {
      margin-top: 8px;
      height: 6px;
      background-color: var(--border-color);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar {
      height: 100%;
      background-color: ${主题状态色};
      width: ${成功率};
      border-radius: 3px;
    }

    .filter-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      align-items: center;
    }

    .filter-btn {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn.active, .filter-btn:hover {
      background-color: var(--accent-color);
      color: #fff;
      border-color: var(--accent-color);
    }

    .test-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .test-item {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .test-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    .test-summary::-webkit-details-marker { display: none; }

    .summary-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .status-badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-passed {
      color: var(--passed-color);
      background-color: var(--passed-bg);
    }

    .badge-failed {
      color: var(--failed-color);
      background-color: var(--failed-bg);
    }

    .test-title {
      font-weight: 600;
      font-size: 15px;
    }

    .test-path {
      font-size: 13px;
      color: var(--text-muted);
    }

    .summary-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .duration {
      font-size: 13px;
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .arrow {
      font-size: 11px;
      color: var(--text-muted);
      transition: transform 0.2s;
    }

    details[open] .arrow {
      transform: rotate(180deg);
    }

    .test-detail {
      border-top: 1px solid var(--border-color);
      padding: 16px 18px;
      background-color: rgba(0, 0, 0, 0.02);
    }

    .meta-row {
      display: flex;
      gap: 20px;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .logs-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .log-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .stderr-title { color: var(--failed-color); }
    .stdout-title { color: var(--text-muted); }

    .log-content {
      background-color: var(--terminal-bg);
      color: var(--terminal-text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      padding: 14px;
      border-radius: 6px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 480px;
    }

    .stderr-content {
      border-left: 3px solid var(--failed-color);
    }

    .log-empty {
      font-size: 13px;
      color: var(--text-muted);
      font-style: italic;
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <h1>集成测试报告</h1>
        <span class="status-pill">${全部通过 === true ? 'ALL PASSED' : 'SOME FAILED'}</span>
      </div>
      <div class="header-info">
        <div>执行时间: ${转义Html(数据.执行时间)}</div>
        <div>Node: ${转义Html(数据.Node版本)} | 平台: ${转义Html(数据.平台)}</div>
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">测试总数</div>
        <div class="metric-value">${String(数据.总测试数)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">通过用例</div>
        <div class="metric-value metric-passed">${String(数据.通过数)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">失败用例</div>
        <div class="metric-value metric-failed">${String(数据.失败数)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">成功率</div>
        <div class="metric-value">${成功率}</div>
        <div class="progress-bar-container">
          <div class="progress-bar"></div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">总耗时</div>
        <div class="metric-value" style="font-size: 22px; padding-top: 4px;">${格式化耗时(数据.总耗时毫秒)}</div>
      </div>
    </div>

    <div class="filter-bar">
      <button class="filter-btn active" onclick="filterTests('all', this)">全部 (${String(数据.总测试数)})</button>
      <button class="filter-btn" onclick="filterTests('failed', this)">仅失败 (${String(数据.失败数)})</button>
      <button class="filter-btn" onclick="filterTests('passed', this)">仅通过 (${String(数据.通过数)})</button>
    </div>

    <div class="test-list" id="testList">
      ${用例列表Html}
    </div>
  </div>

  <script>
    function filterTests(status, button) {
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      const items = document.querySelectorAll('.test-item');
      items.forEach(item => {
        if (status === 'all' || item.getAttribute('data-status') === status) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`
}

export function 生成集成测试报告(
  结果列表: 单个集成测试结果[],
  输出目录: string,
  开始时间: number,
  结束时间: number,
): { html路径: string; json路径: string; 全部通过: boolean } {
  if (fs.existsSync(输出目录) === false) {
    fs.mkdirSync(输出目录, { recursive: true })
  }

  let 通过数 = 结果列表.filter((项) => 项.状态 === 'passed').length
  let 失败数 = 结果列表.filter((项) => 项.状态 === 'failed').length
  let 总耗时毫秒 = Math.max(0, 结束时间 - 开始时间)

  let 报告汇总: 集成测试报告汇总 = {
    执行时间: new Date().toLocaleString(),
    总测试数: 结果列表.length,
    通过数,
    失败数,
    总耗时毫秒,
    Node版本: process.version,
    平台: process.platform,
    用例列表: 结果列表,
  }

  let html内容 = 生成Html内容(报告汇总)
  let html路径 = path.join(输出目录, 'index.html')
  let json路径 = path.join(输出目录, 'report.json')

  fs.writeFileSync(html路径, html内容, 'utf-8')
  fs.writeFileSync(json路径, JSON.stringify(报告汇总, undefined, 2), 'utf-8')

  return { html路径, json路径, 全部通过: 失败数 === 0 }
}
