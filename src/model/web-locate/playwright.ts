import type { Locator, Page } from '@playwright/test'

import { 转为动作未执行 } from '../../test-tools/action-guard'
import { 标记动作已执行 } from '../../test-tools/action-phase'
import type { 定位候选, 落点探测结果 } from './candidates'
import {
  格式化歧义建议,
  格式化点中元素,
  点中元素脚本,
  type 歧义匹配,
  type 点中元素,
  type 点击现场记录,
} from './diagnostics'
import { 整理落点结果, 视口模型 } from './probe'
import { 清理脚本, 落点脚本, 读取视口脚本 } from './scripts'

/** 在页面里执行函数体脚本（与 Appium executeScript 同一种写法：参数在 arguments 里）。 */
export async function 执行页面脚本(页面: Page, 脚本: string, 参数们: readonly unknown[] = []): Promise<unknown> {
  return await 页面.evaluate(`(function () { ${脚本} }).apply(null, ${JSON.stringify(参数们)})`)
}

export async function 读取页面视口(页面: Page): Promise<{ 宽: number; 高: number }> {
  return 视口模型.parse(await 执行页面脚本(页面, 读取视口脚本))
}

function 候选定位(页面: Page, 候选: 定位候选): Locator {
  return 候选.种类 === '文字' ? 页面.getByText(候选.值, { exact: true }) : 页面.locator(`css=${候选.值}`)
}

/** 候选匹配到的元素就是落点元素：选择器要求就是它，文字匹配到的是含该文字的最深元素，允许是落点元素的后代。 */
async function 是落点元素(定位: Locator, 允许后代: boolean): Promise<boolean> {
  return await 定位.evaluate((元素, 后代也算) => {
    let 目标: unknown = Reflect.get(window, '__ntProbeTarget')
    let 节点: Node | null = 元素
    while (节点 !== null) {
      if (节点 === 目标) return true
      if (后代也算 === false) return false
      let 宿主: unknown = Reflect.get(节点, 'host')
      节点 = 节点.parentNode ?? (宿主 instanceof Node ? 宿主 : null)
    }
    return false
  }, 允许后代)
}

/**
 * 页面（CSS 视口）坐标处的落点识别：找到落点元素，生成候选，用 Playwright 的真实定位器当场验证
 * 「只匹配到一个，而且就是这个元素」，返回第一个通过的候选。Android 和浏览器共用。
 */
export async function 探测页面落点(页面: Page, 点: { x: number; y: number }): Promise<落点探测结果> {
  try {
    return await 整理落点结果(await 执行页面脚本(页面, 落点脚本, [点.x, 点.y]), async (候选们) => {
      for (let 候选 of 候选们) {
        try {
          let 定位 = 候选定位(页面, 候选)
          if ((await 定位.count()) !== 1) continue
          if (await 是落点元素(定位, 候选.种类 === '文字')) return 候选
        } catch {
          // 候选的写法在这个引擎里不能解析时，换下一个
        }
      }
      return undefined
    })
  } finally {
    await 执行页面脚本(页面, 清理脚本).catch((): void => {})
  }
}

/** 点击中心点最上层元素的描述，传入 现场 时同时记下；元素不可见或读取失败返回 undefined。只做诊断。 */
export async function 描述点击落点(
  页面: Page,
  定位: Locator,
  现场?: 点击现场记录,
  超时毫秒 = 1000,
): Promise<string | undefined> {
  try {
    let 范围 = await 定位.boundingBox({ timeout: 超时毫秒 })
    if (范围 === null) return undefined
    return await 描述页面坐标(页面, { x: 范围.x + 范围.width / 2, y: 范围.y + 范围.height / 2 }, 现场)
  } catch {
    return undefined
  }
}

/** 页面（CSS 视口）坐标处最上层元素的描述。 */
export async function 描述页面坐标(
  页面: Page,
  点: { x: number; y: number },
  现场?: 点击现场记录,
): Promise<string | undefined> {
  try {
    let 值 = (await 执行页面脚本(页面, 点中元素脚本, [点.x, 点.y])) as 点中元素 | null
    let 描述 = 格式化点中元素(值)
    现场?.记录(描述)
    return 描述
  } catch {
    return undefined
  }
}

/**
 * 点击前等目标及其祖先（穿过 shadow host）上的有限动画播完：getAnimations() 里 iterations 为 Infinity 的循环动画跳过不等。
 * 位置稳定和「点击点没被别的层盖住」由 Playwright 点击自带的可操作性检查负责（连续两帧位置不变、命中目标自身或后代，不满足就重试），这里不重复。
 * 总超时沿用点击超时：返回已用掉的毫秒数，调用方用剩余时间点击；超时仍有有限动画就报错。
 */
export async function 等待目标动画结束(定位: Locator, 超时毫秒: number): Promise<number> {
  let 开始 = Date.now()
  let 最近数量 = 0
  while (true) {
    let 剩余 = 超时毫秒 - (Date.now() - 开始)
    if (剩余 <= 0)
      throw new Error(
        `等待目标动画结束超时（${String(超时毫秒)}ms）：${定位.toString()} 上或祖先上仍有 ${String(最近数量)} 个有限动画在播放`,
      )
    // evaluate 的签名是 (函数, 参数, 选项)：超时必须放在第三个位置，放第二个会被当成参数而忽略，退回默认 10 秒
    let 有限动画数 = await 定位
      .evaluate(
        (元素): number => {
          let 数量 = 0
          let 节点: Element | null = 元素
          while (节点 !== null) {
            for (let 动画 of 节点.getAnimations()) {
              let 时间 = 动画.effect?.getTiming()
              if (时间?.iterations === Infinity) continue
              if (动画.playState === 'running' || 动画.pending) 数量 += 1
            }
            let 根: Node = 节点.getRootNode()
            节点 = 节点.parentElement ?? (根 instanceof ShadowRoot ? 根.host : null)
          }
          return 数量
        },
        undefined,
        { timeout: 剩余 },
      )
      .catch((错误: unknown): never => {
        // 目标一直不存在：报「找不到目标」，和点击本身等不到目标的语义一致，不暴露内部的 evaluate 超时
        if (错误 instanceof Error && 错误.name === 'TimeoutError')
          throw new Error(`找不到目标：等待 ${String(超时毫秒)}ms 内页面里没有出现 ${定位.toString()}`, { cause: 错误 })
        throw 错误
      })
    if (有限动画数 === 0) return Date.now() - 开始
    最近数量 = 有限动画数
    await new Promise<void>((完成) => setTimeout(完成, 80))
  }
}

/** 匹配多个元素时读取前 8 个的描述（角色、名称、aria-label、类名），用来列推荐定位。 */
export async function 读取歧义建议(定位: Locator, 序号写法: string, 含角色写法 = true): Promise<string> {
  let 总数 = await 定位.count()
  let 原始匹配们 = await 定位.evaluateAll((元素们): Omit<歧义匹配, '序号'>[] =>
    元素们.slice(0, 8).map((元素) => {
      // 不在页面函数里声明具名函数：tsx 的 keepNames 会注入页面里不存在的 __name
      let 标签 = 元素.tagName.toLowerCase()
      let 类型 = 元素 instanceof HTMLInputElement ? 元素.type : ''
      let 角色 = 元素.getAttribute('role') ?? ''
      if (角色 === '') {
        if (标签 === 'button') 角色 = 'button'
        else if (标签 === 'a' && 元素.hasAttribute('href')) 角色 = 'link'
        else if (标签 === 'input')
          角色 = ['checkbox', 'radio'].includes(类型)
            ? 类型
            : ['button', 'submit', 'reset'].includes(类型)
              ? 'button'
              : 'textbox'
        else if (标签 === 'textarea') 角色 = 'textbox'
        else if (标签 === 'select') 角色 = 'combobox'
        else if (标签 === 'img') 角色 = 'img'
        else if (/^h[1-6]$/u.test(标签)) 角色 = 'heading'
      }
      let aria标签 = (元素.getAttribute('aria-label') ?? '').replace(/\s+/gu, ' ').trim()
      let 文字 = 元素.textContent.replace(/\s+/gu, ' ').trim().slice(0, 41)
      let 名称 =
        [
          aria标签,
          (元素.getAttribute('alt') ?? '').trim(),
          (元素.getAttribute('title') ?? '').trim(),
          (元素.getAttribute('placeholder') ?? '').trim(),
          文字,
        ].find((值) => 值 !== '') ?? ''
      return { 标签, 角色, 名称, aria标签, 文字, 类名: (元素.getAttribute('class') ?? '').replace(/\s+/gu, ' ').trim() }
    }),
  )
  let 页面 = 定位.page()
  let 匹配们: 歧义匹配[] = []
  for (let [序号, 匹配] of 原始匹配们.entries()) {
    // 当场在页面里核对：推荐的写法必须只匹配一个元素
    let aria = 匹配.aria标签 ?? ''
    let 选择器唯一 = false
    if (aria !== '') {
      let 值 = aria.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      选择器唯一 = (await 页面.locator(`css=${匹配.标签}[aria-label="${值}"]`).count()) === 1
    }
    let 角色名称唯一 = false
    let 名称 = 匹配.名称 ?? ''
    if (含角色写法 && (匹配.角色 ?? '') !== '' && 名称 !== '') {
      let 角色 = 匹配.角色 as Parameters<Page['getByRole']>[0]
      角色名称唯一 = (await 页面.getByRole(角色, { name: 名称, exact: true }).count()) === 1
    }
    匹配们.push({ ...匹配, 序号, 选择器唯一, 角色名称唯一 })
  }
  return 格式化歧义建议(匹配们, { 总数, 序号写法, 含角色写法 })
}

/**
 * Playwright 的「strict mode violation」（匹配多个元素）报错改写成带推荐定位的错误；其他错误原样返回。
 * `序号写法` 里的 {序号} 会被替换成匹配项序号。
 */
export async function 补充歧义错误(
  定位: Locator,
  错误: unknown,
  序号写法: string,
  含角色写法 = true,
): Promise<unknown> {
  if (错误 instanceof Error === false || 错误.message.includes('strict mode violation') === false) return 错误
  try {
    let 首行 = 错误.message.split('\n')[0] ?? 错误.message
    return new Error(`${首行}\n${await 读取歧义建议(定位, 序号写法, 含角色写法)}`, { cause: 错误 })
  } catch {
    return 错误
  }
}

/**
 * 浏览器的诊断点击：先等有限动画播完，再用 trial 点击等 Playwright 的可操作性检查通过（稳定、没被盖住、可用，被谁盖住由它的报错说明），
 * 取点击点处最上层元素记进 点击现场，最后真正点击。总超时沿用 参数.timeout（默认 10 秒），三步共用。
 * 匹配多个时报错改写成带推荐定位的错误。返回点击前落点元素的描述。
 */
export async function 诊断点击(
  页面: Page,
  目标: Locator,
  参数: Parameters<Locator['click']>[0],
  点击现场: 点击现场记录,
): Promise<string | undefined> {
  let 总超时 = 参数?.timeout ?? 10_000
  let 开始 = Date.now()
  let 剩余 = (): number => Math.max(1, 总超时 - (Date.now() - 开始))
  try {
    if (参数?.trial === true) return await 目标.click(参数).then((): undefined => undefined)
    await 等待目标动画结束(目标, 总超时)
    await 目标.click({ ...参数, trial: true, timeout: 剩余() })
    let 描述 = await 描述点击落点(页面, 目标, 点击现场, Math.min(1000, 剩余()))
    await 目标.click({ ...参数, timeout: 剩余() })
    标记动作已执行()
    return 描述
  } catch (错误) {
    throw 转为动作未执行(await 补充歧义错误(目标, 错误, '改用 index={序号}（或在选择器后加 " >> nth={序号}"）'))
  }
}

/** 点击一个页面（CSS 视口）坐标：先记下落点元素描述，点击失败算动作没执行，点完标记动作已执行。 */
export async function 诊断点击坐标(
  页面: Page,
  点: { x: number; y: number },
  参数: Parameters<Page['mouse']['click']>[2],
  点击现场: 点击现场记录,
): Promise<string | undefined> {
  let 描述 = await 描述页面坐标(页面, 点, 点击现场)
  await 页面.mouse.click(点.x, 点.y, 参数).catch((错误: unknown): never => {
    throw 转为动作未执行(错误)
  })
  标记动作已执行()
  return 描述
}

/** 填写输入框：失败算动作没执行，填完标记动作已执行。 */
export async function 诊断填写(目标: Locator, 文本: string, 参数: Parameters<Locator['fill']>[1]): Promise<void> {
  await 目标.fill(文本, 参数).catch((错误: unknown): never => {
    throw 转为动作未执行(错误)
  })
  标记动作已执行()
}
