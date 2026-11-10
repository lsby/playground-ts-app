import { 需求, 验收点 } from '../../../src/model/test-requirement'

export let 验收点们 = {
  提交结果: new 验收点({ 名称: '表单提交结果', 描述: '提交结果显示正确的文本、数字、选项和开关值。' }),
}

export let 业务需求 = new 需求({
  名称: '强类型表单提交',
  描述: '用户填写不同类型的字段后，可以在弹窗中查看表单提交的数据。',
  验收点们: Object.values(验收点们),
})
