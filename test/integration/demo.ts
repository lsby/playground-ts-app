import { 默认请求附加参数 } from '@lsby/net-core'
import assert from 'assert'
import { cleanDB } from '../../scripts/db/clean-db'
import { kysely管理器 } from '../../src/global/global'
import { jwt插件 } from '../../src/global/plugin'
import { init } from '../../src/init/init'
import 是否登录接口 from '../../src/interface/project/is-login/index'
import 登录接口 from '../../src/interface/project/login/index'
import 注册接口 from '../../src/interface/project/register/index'
import type { 已审阅的any } from '../../src/tools/types'

async function 主函数(): Promise<void> {
  console.log('========== 登录与注册纯后端集成测试 ==========')
  let 数据库 = kysely管理器.获得句柄()

  await cleanDB(数据库)
  await init()
  console.log('✅ 数据库清理并初始化成功')

  // 1. 测试注册未启用时的注册请求
  let 注册参数 = { kysely: kysely管理器, json: { userName: '测试用户123', userPassword: '密码123456' } }

  let 注册结果1 = await 注册接口.获得接口逻辑().调用(注册参数, {}, 默认请求附加参数)
  assert.strictEqual(注册结果1.isLeft(), true)
  assert.strictEqual(注册结果1.assertLeft().getLeft(), '注册未启用')
  console.log('✅ 验证: 注册未启用时无法注册成功')

  // 2. 启用注册功能
  await 数据库.updateTable('system_config').set({ enable_register: 1 }).execute()
  console.log('✅ 已更新系统配置: 启用注册功能')

  // 3. 测试启用注册功能后的正常注册
  let 注册结果2 = await 注册接口.获得接口逻辑().调用(注册参数, {}, 默认请求附加参数)
  assert.strictEqual(注册结果2.isRight(), true)
  console.log('✅ 验证: 启用注册后用户注册成功')

  // 4. 测试重复注册同名用户
  let 注册结果3 = await 注册接口.获得接口逻辑().调用(注册参数, {}, 默认请求附加参数)
  assert.strictEqual(注册结果3.isLeft(), true)
  assert.strictEqual(注册结果3.assertLeft().getLeft(), '用户名已存在')
  console.log('✅ 验证: 重复注册同名用户失败')

  // 5. 获取 JWT 签名器插件并生成签名函数
  let jwt签名插件 = await jwt插件.签名器.run()
  let 签名结果 = await jwt签名插件.运行({} as 已审阅的any, {} as 已审阅的any, 默认请求附加参数)
  assert.strictEqual(签名结果.isRight(), true)
  let { signJwt } = 签名结果.assertRight().getRight()

  // 6. 测试登录功能 (成功)
  let 登录参数 = {
    kysely: kysely管理器,
    json: { userName: '测试用户123', userPassword: '密码123456' },
    signJwt: signJwt,
  }

  let 登录结果1 = await 登录接口.获得接口逻辑().调用(登录参数, {}, 默认请求附加参数)
  assert.strictEqual(登录结果1.isRight(), true)
  let 登录成功数据 = 登录结果1.assertRight().getRight()
  assert.strictEqual(typeof 登录成功数据.token === 'string', true)
  assert.strictEqual(登录成功数据.token.length > 0, true)
  console.log('✅ 验证: 正常登录成功并获得 JWT token')

  // 7. 测试登录功能 (密码错误)
  let 错误登录参数1 = {
    kysely: kysely管理器,
    json: { userName: '测试用户123', userPassword: '错误密码' },
    signJwt: signJwt,
  }

  let 登录结果2 = await 登录接口.获得接口逻辑().调用(错误登录参数1, {}, 默认请求附加参数)
  assert.strictEqual(登录结果2.isLeft(), true)
  assert.strictEqual(登录结果2.assertLeft().getLeft(), '用户不存在或密码错误')
  console.log('✅ 验证: 密码错误登录失败')

  // 8. 测试登录功能 (用户不存在)
  let 错误登录参数2 = {
    kysely: kysely管理器,
    json: { userName: '不存在的用户', userPassword: '密码123456' },
    signJwt: signJwt,
  }

  let 登录结果3 = await 登录接口.获得接口逻辑().调用(错误登录参数2, {}, 默认请求附加参数)
  assert.strictEqual(登录结果3.isLeft(), true)
  assert.strictEqual(登录结果3.assertLeft().getLeft(), '用户不存在或密码错误')
  console.log('✅ 验证: 用户不存在登录失败')

  // 9. 获取注册用户的 ID
  let 用户信息 = await 数据库.selectFrom('user').select('id').where('name', '=', '测试用户123').executeTakeFirst()
  if (用户信息 === undefined) {
    throw new Error('未找到该注册用户')
  }
  let 用户ID = 用户信息.id

  // 10. 测试是否登录接口 (已登录)
  let 是否登录参数1 = { json: {}, userId: 用户ID, kysely: kysely管理器 }
  let 是否登录结果1 = await 是否登录接口.获得接口逻辑().调用(是否登录参数1, {}, 默认请求附加参数)
  assert.strictEqual(是否登录结果1.isRight(), true)
  assert.strictEqual(是否登录结果1.assertRight().getRight().isLogin, true)
  console.log('✅ 验证: 传入有效用户ID时, 是否登录状态为 true')

  // 11. 测试是否登录接口 (未登录)
  let 是否登录参数2 = { json: {}, userId: undefined, kysely: kysely管理器 }
  let 是否登录结果2 = await 是否登录接口.获得接口逻辑().调用(是否登录参数2, {}, 默认请求附加参数)
  assert.strictEqual(是否登录结果2.isRight(), true)
  assert.strictEqual(是否登录结果2.assertRight().getRight().isLogin, false)
  console.log('✅ 验证: 未传入用户ID时, 是否登录状态为 false')

  // 12. 测试是否登录接口 (用户不存在于数据库但传入了 ID)
  let 是否登录参数3 = { json: {}, userId: '00000000-0000-0000-0000-000000000000', kysely: kysely管理器 }
  let 是否登录结果3 = await 是否登录接口.获得接口逻辑().调用(是否登录参数3, {}, 默认请求附加参数)
  assert.strictEqual(是否登录结果3.isRight(), true)
  assert.strictEqual(是否登录结果3.assertRight().getRight().isLogin, false)
  console.log('✅ 验证: 传入不存在的用户ID时, 是否登录状态为 false')

  console.log('🎉 所有登录与注册测试项全部通过！')
  process.exit(0)
}

主函数().catch((错误) => {
  console.error(错误)
  process.exit(1)
})
