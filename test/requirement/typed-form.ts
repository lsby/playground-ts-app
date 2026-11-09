import { 流程, 行为, 观察, 需求, 需求测试, 验收点, type 需求测试工具 } from '../../src/model/test-requirement'
import { 切换演示标签, 登录演示页 } from './helper/browser-demo-helper'

/**
 * 验证强类型表单的填写与数据提交。
 * 准备演示账号后操作表单控件，检查提交弹窗显示的数据。
 */
type 测试上下文 = { 工具: 需求测试工具 }

let 验收 = new 验收点({ 描述: '提交结果显示正确的文本、数字、选项和开关值。', 验收手段: '自动' })
let 业务需求 = new 需求({
  名称: '强类型表单提交',
  描述: '用户填写不同类型的字段后，可以在弹窗中查看表单提交的数据。',
  验收点们: [验收],
})

class 强类型表单测试 extends 需求测试 {
  private static 获得主流程步骤(): (行为<测试上下文> | 观察<测试上下文>)[] {
    return [
      new 行为<测试上下文>('登录并打开表单示例', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        await 引擎.导航('/demo/login.html')
        // 1. 核心原则：开场在测试第一秒立刻居中出现
        await 引擎.开场('依次填写文本、数字、下拉选择等控件，再提交表单查看实际收到的数据。', '填写并提交强类型表单')
        // 2. 前置准备：仅显示一次进入说明，内部登录与切页不再重复展示说明和动画
        await 引擎.作用域(
          {
            粒度: '表单现场准备',
            进入说明: '前置准备：自动登录演示系统并切换至表单组件现场',
            跳过步骤说明: true,
            跳过操作动画: true,
          },
          async () => {
            await 登录演示页(引擎)
            await 切换演示标签(引擎, '表单组件')
          },
        )
        return 当前状态
      }),
      new 行为<测试上下文>('填写表单并选择多选项', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 名称输入框 = 引擎.按角色('textbox', { name: '普通文本演示' })
        await 引擎.说明('从“普通文本演示”开始，依次填写文本、数字和其他选项。', 名称输入框)
        await 引擎.输入(名称输入框, '示例资料')
        await 引擎.输入(引擎.按角色('spinbutton', { name: '数字输入演示' }), '3')
        await 引擎.选择(引擎.按角色('combobox', { name: '下拉选择演示' }), 'business')
        await 引擎.勾选(引擎.按角色('radio', { name: '紧凑' }))
        await 引擎.勾选(引擎.按角色('checkbox', { name: '复选框演示' }))
        await 引擎.勾选(引擎.按角色('checkbox', { name: '表格' }))

        let 多选下拉 = 引擎.按角色('combobox', { name: '多选下拉演示' })
        await 引擎.点击(多选下拉)
        await 引擎.点击(引擎.按角色('option', { name: '前端', exact: true }))
        await 引擎.点击(引擎.按角色('option', { name: '后端', exact: true }))
        await 引擎.断言(多选下拉).toContainText('已选 2 项')
        await 引擎.按键('Escape')
        await 引擎.断言(多选下拉).toHaveAttribute('aria-expanded', 'false')

        await 引擎.勾选(引擎.按角色('switch', { name: '布尔开关演示' }))
        let 自动伸缩文本框 = 引擎.按角色('textbox', { name: '自动伸缩文本框演示' })
        await 引擎.输入(自动伸缩文本框, '多行文本示例')
        return 当前状态
      }),
      new 行为<测试上下文>('提交表单', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 提交按钮 = 引擎.按角色('button', { name: '验证并提交' })
        await 引擎.说明('表单已填好。继续后会点击“验证并提交”，弹窗会显示刚才填写的内容。', 提交按钮)
        await 引擎.点击(提交按钮)
        return 当前状态
      }),
      new 观察<测试上下文>('核对提交弹窗中的字段值', async (当前状态, 提交附件): Promise<void> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 数据模态框 = 引擎.按角色('dialog', { name: '表单提交数据' })
        await 引擎.验证可见(数据模态框)
        await 引擎.断言(数据模态框).toContainText('"name": "示例资料"')
        await 引擎.断言(数据模态框).toContainText('"quantity": 3')
        await 引擎.断言(数据模态框).toContainText('"category": "business"')
        await 引擎.断言(数据模态框).toContainText('"mode": "紧凑"')
        await 引擎.断言(数据模态框).toContainText('"confirmed": true')
        await 引擎.断言(数据模态框).toContainText('"frontend"')
        await 引擎.断言(数据模态框).toContainText('"backend"')
        await 引擎.断言(数据模态框).toContainText('"description": "多行文本示例"')
        await 引擎.断言(数据模态框).toContainText('"switchDemo": true')
        提交附件([{ 类型: '文本', 内容: '提交结果与表单中的文本、数量、分类、多选项和开关值一致。' }], {
          并入上一组: true,
        })
      }),
      new 行为<测试上下文>('关闭提交弹窗', async (当前状态): Promise<测试上下文> => {
        let 引擎 = 当前状态.工具.浏览器.获得('主会话')
        let 数据模态框 = 引擎.按角色('dialog', { name: '表单提交数据' })
        let 关闭按钮 = 数据模态框.getByRole('button', { name: '关闭' })
        await 引擎.说明('提交成功。可以先查看弹窗里的数据，继续后会关闭弹窗。', 关闭按钮)
        await 引擎.点击(关闭按钮)
        await 引擎.验证隐藏(数据模态框)
        await 引擎.完成('表单填写并提交成功，弹窗显示的数据与刚才填写的内容一致。')
        return 当前状态
      }),
    ]
  }
  public constructor() {
    super(
      [业务需求],
      [
        new 流程({
          名称: '填写多种控件并核对提交结果',
          测试思路: '给不同类型的控件填入固定值并提交，逐项比对结果弹窗中的数据，再关闭弹窗。',
          步骤们: 强类型表单测试.获得主流程步骤(),
          覆盖验收点们: [验收],
        }),
      ],
      { 使用测试服务: true },
    )
  }

  protected override async 准备数据(工具: 需求测试工具): Promise<object> {
    await 工具.浏览器.打开('主会话')
    return {}
  }
}

export default 强类型表单测试
