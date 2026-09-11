import { 组件基类 } from '../../base/base'
import { API管理器 } from '../../global/manager/api-manager'
import { 显示确认对话框, 显示输入对话框 } from '../../global/manager/dialog-manager'
import { 关闭模态框, 显示模态框 } from '../../global/manager/modal-manager'
import { 警告提示 } from '../../global/manager/toast-manager'
import { 创建元素 } from '../../global/tools/create-element'
import { 主要按钮, 普通按钮 } from '../general/base/base-button'
import { 表单 } from '../general/form/form'
import { 复选框 } from '../general/form/form-checkbox'
import { 密码输入框, 普通输入框 } from '../general/form/form-input'
import { 表格组件 } from '../general/table/table'
import { 数据表加载数据参数 } from '../general/table/types'

type 发出事件类型 = {}
type 监听事件类型 = {}

type 数据项 = { id: string; name: string }

export class 演示用户管理组件 extends 组件基类<发出事件类型, 监听事件类型> {
  static {
    this.注册组件('lsby-user-management-demo', this)
  }

  private 表格组件: 表格组件<数据项>

  public constructor() {
    super()
    this.表格组件 = new 表格组件<数据项>({
      行键: (数据项): string => 数据项.id,
      列配置: [
        { 字段名: 'id', 显示名: 'ID', 可排序: true, 可筛选: true },
        { 字段名: 'name', 显示名: '名称', 可排序: true, 可筛选: true },
      ],
      每页数量: 5,
      顶部操作列表: [
        {
          名称: '添加数据',
          回调: (): void => {
            this.显示添加用户模态框()
          },
        },
      ],
      操作列表: [
        {
          名称: '编辑',
          回调: async (数据项: 数据项): Promise<void> => {
            let name = await 显示输入对话框('请输入新名称:', 数据项.name)
            if (name === null) return
            if (name === '') {
              警告提示('未输入数据')
              return
            }
            await API管理器.请求postJson并处理错误('/api/demo/crud/user/update', { newName: name, userId: 数据项.id })
          },
        },
        {
          名称: '删除',
          回调: async (数据项: 数据项): Promise<void> => {
            let 确认结果 = await 显示确认对话框('你确定要删除这条数据吗？')
            if (确认结果 === false) return
            await API管理器.请求postJson并处理错误('/api/demo/crud/user/delete', { id: 数据项.id })
          },
        },
        {
          名称: '修改密码',
          回调: (数据项: 数据项): void => {
            this.显示修改密码模态框(数据项)
          },
        },
      ],
      加载数据: async (参数: 数据表加载数据参数<数据项>): Promise<{ 数据: 数据项[]; 总数: number }> => {
        let { data, total } = await API管理器.请求postJson并处理错误('/api/demo/crud/user/read', {
          page: 参数.页码,
          size: 参数.每页数量,
          ...(参数.排序列表.length > 0 ? { orderBy: 参数.排序列表 } : {}),
          ...(Object.keys(参数.筛选条件).length > 0 ? { filter: 参数.筛选条件 } : {}),
        })
        return { 数据: data, 总数: total }
      },
    })
  }

  protected override async 当加载时(): Promise<void> {
    this.获得宿主样式().width = '100%'

    let 容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px' } })

    容器.appendChild(this.表格组件)

    this.shadow.appendChild(容器)
  }

  private 显示添加用户模态框(): void {
    // 创建表单元素
    let 用户名输入框 = new 普通输入框({ 占位符: '请输入用户名' })

    let 密码框 = new 密码输入框({ 占位符: '请输入密码' })
    let 管理员账号复选框 = new 复选框({ 标签: '允许访问管理员功能', 可访问名称: '管理员账号' })

    // 创建表单
    let 表单实例 = new 表单<{ username: string; password: string; isAdmin: boolean }>({
      项列表: [
        { 键: 'username', 组件: 用户名输入框, 宽度: 2, 标签: '用户名' },
        { 键: 'password', 组件: 密码框, 宽度: 2, 标签: '密码' },
        { 键: 'isAdmin', 组件: 管理员账号复选框, 宽度: 2, 标签: '账号权限' },
      ],
      元素样式: { gap: '12px' },
    })

    // 创建模态框内容容器
    let 内容容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' } })

    // 添加表单到容器
    let 表单容器 = 创建元素('div', { style: { flex: '1', overflow: 'auto' } })
    表单容器.appendChild(表单实例)
    内容容器.appendChild(表单容器)

    // 添加按钮到容器底部
    let 按钮容器 = 创建元素('div', {
      style: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
        padding: '8px 0',
        borderTop: '1px solid var(--边框颜色)',
      },
    })

    let 确认按钮 = new 主要按钮({
      文本: '确认',
      点击处理函数: async (): Promise<void> => {
        let 表单数据 = 表单实例.获得数据()

        // 验证数据
        if (表单数据.username === '') {
          警告提示('用户名不能为空')
          return
        }
        if (表单数据.password === '') {
          警告提示('密码不能为空')
          return
        }

        // 调用 API
        await API管理器.请求postJson并处理错误('/api/demo/crud/user/create', {
          name: 表单数据.username,
          pwd: 表单数据.password,
          isAdmin: 表单数据.isAdmin,
        })

        // 关闭模态框
        await 关闭模态框()

        // 刷新表格
        await this.表格组件.刷新数据()
      },
    })

    let 取消按钮 = new 普通按钮({
      文本: '取消',
      点击处理函数: async (): Promise<void> => {
        await 关闭模态框()
      },
    })

    按钮容器.appendChild(取消按钮)
    按钮容器.appendChild(确认按钮)
    内容容器.appendChild(按钮容器)

    // 显示模态框
    显示模态框({ 标题: '添加用户', 可关闭: true }, 内容容器)
  }

  private 显示修改密码模态框(数据项: 数据项): void {
    // 创建表单元素
    let 新密码输入框 = new 密码输入框({ 占位符: '请输入新密码' })

    // 创建表单
    let 表单实例 = new 表单<{ newPassword: string }>({
      项列表: [{ 键: 'newPassword', 组件: 新密码输入框, 宽度: 2, 标签: '新密码' }],
      元素样式: { gap: '12px' },
    })

    // 创建模态框内容容器
    let 内容容器 = 创建元素('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' } })

    // 添加表单到容器
    let 表单容器 = 创建元素('div', { style: { flex: '1', overflow: 'auto' } })
    表单容器.appendChild(表单实例)
    内容容器.appendChild(表单容器)

    // 添加按钮到容器底部
    let 按钮容器 = 创建元素('div', {
      style: {
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
        padding: '8px 0',
        borderTop: '1px solid var(--边框颜色)',
      },
    })

    let 确认按钮 = new 主要按钮({
      文本: '确认',
      点击处理函数: async (): Promise<void> => {
        let 表单数据 = 表单实例.获得数据()

        // 验证数据
        if (表单数据.newPassword === '') {
          警告提示('新密码不能为空')
          return
        }

        // 调用 API
        await API管理器.请求postJson并处理错误('/api/user-admin/update-password', {
          userId: 数据项.id,
          newPassword: 表单数据.newPassword,
        })

        // 关闭模态框
        await 关闭模态框()

        // 提示成功
        警告提示('密码修改成功')
      },
    })

    let 取消按钮 = new 普通按钮({
      文本: '取消',
      点击处理函数: async (): Promise<void> => {
        await 关闭模态框()
      },
    })

    按钮容器.appendChild(取消按钮)
    按钮容器.appendChild(确认按钮)
    内容容器.appendChild(按钮容器)

    // 显示模态框
    显示模态框({ 标题: '修改密码', 可关闭: true }, 内容容器)
  }
}
