/** tsx 的 keepNames 会向命名局部函数插入 Node 侧 __name；浏览器序列化不会携带该帮助函数。 */
/** @type {import('eslint').Rule.RuleModule} */
let 规则 = {
  meta: {
    type: 'problem',
    docs: { description: '禁止在序列化至浏览器的回调内部声明会注入 __name 的局部函数' },
    schema: [],
    messages: {
      named:
        '浏览器回调中的命名局部函数会被 tsx 插入 __name，回放时浏览器找不到它。改用对象方法，或直接把匿名函数传给调用方；不要给页面添加全局 __name。',
    },
  },
  create(context) {
    let 源码 = context.sourceCode
    let 已检查 = new Set()
    let 浏览器方法 = new Set(['evaluate', 'evaluateAll', 'waitForFunction', 'addInitScript'])
    function 检查(函数) {
      if (函数 === undefined || 已检查.has(函数)) return
      已检查.add(函数)
      function 遍历(node) {
        if (node === null || typeof node !== 'object') return
        if (
          node.type === 'FunctionDeclaration' ||
          (node.type === 'VariableDeclarator' &&
            (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')) ||
          (node.type === 'FunctionExpression' && node.id !== null)
        )
          context.report({ node, messageId: 'named' })
        for (let 键 of 源码.visitorKeys[node.type] ?? []) {
          let 值 = node[键]
          if (Array.isArray(值)) for (let 子节点 of 值) 遍历(子节点)
          else 遍历(值)
        }
      }
      遍历(函数.body)
    }
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed === true) return
        if (node.callee.property.type !== 'Identifier' || 浏览器方法.has(node.callee.property.name) === false) return
        let 回调 = node.arguments[0]
        if (回调?.type === 'ArrowFunctionExpression' || 回调?.type === 'FunctionExpression') 检查(回调)
        if (回调?.type !== 'Identifier') return
        let 作用域 = 源码.getScope(node)
        while (作用域 !== null) {
          let 变量 = 作用域.set.get(回调.name)
          if (变量 !== undefined) {
            for (let 定义 of 变量.defs) {
              if (定义.node.type === 'FunctionDeclaration') 检查(定义.node)
              if (定义.node.type === 'VariableDeclarator') 检查(定义.node.init)
            }
            return
          }
          作用域 = 作用域.upper
        }
      },
    }
  },
}

export default 规则
