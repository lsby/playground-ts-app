import { describe, expect, it } from 'vitest'

import { 权限活动来自测试应用 } from '../../src/model/android-test/foreground'

let 包名 = 'com.example.mobiletest.localtest'
let 启动组件 = `${包名}/com.example.mobiletest.MainActivity`
let 权限组件 =
  'com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity'

function 活动栈(): string {
  return `
    topResumedActivity=ActivityRecord{116771110 u0 ${权限组件} t20160}
    * Hist  #1: ActivityRecord{116771110 u0 ${权限组件} t20160}
      launchedFromUid=10494 launchedFromPackage=${包名} launchedFromFeature=null
      rootOfTask=false task=Task{7abcd #20160 type=standard A=10494:${包名}}
    * Hist #0: ActivityRecord{12abcd u0 ${启动组件} t20160}
      rootOfTask=true task=Task{7abcd #20160 type=standard A=10494:${包名}}
  `
}

function 验证(输出: string): boolean {
  return 权限活动来自测试应用(输出, 权限组件, 包名, 启动组件)
}

describe('Android 权限活动来源验证', () => {
  it('接受唯一顶层权限活动、测试包调用者及同任务测试MainActivity', (): void => {
    expect(验证(活动栈())).toBe(true)
  })

  it.each([
    ['其他调用者', `launchedFromPackage=${包名}`, 'launchedFromPackage=com.other.app'],
    ['其他任务归属', `A=10494:${包名}`, 'A=10494:com.other.app'],
    ['任务UID不符', 'A=10494:', 'A=10555:'],
    ['过期Hist', '* Hist  #1: ActivityRecord{116771110', '* Hist  #1: ActivityRecord{deadbeef'],
    ['不同任务', `${启动组件} t20160`, `${启动组件} t20161`],
    ['缺来源', 'launchedFromUid=10494', 'fromUid=10494'],
    ['错误rootOfTask', 'rootOfTask=false', 'rootOfTask=true'],
    [
      '错误顶层组件',
      `topResumedActivity=ActivityRecord{116771110 u0 ${权限组件}`,
      `topResumedActivity=ActivityRecord{116771110 u0 ${启动组件}`,
    ],
    ['根活动非根', 'rootOfTask=true', 'rootOfTask=false'],
    [
      '顶层与Hist任务不符',
      `topResumedActivity=ActivityRecord{116771110 u0 ${权限组件} t20160}`,
      `topResumedActivity=ActivityRecord{116771110 u0 ${权限组件} t20161}`,
    ],
    [
      '顶层与Hist用户不符',
      `topResumedActivity=ActivityRecord{116771110 u0`,
      `topResumedActivity=ActivityRecord{116771110 u10`,
    ],
    ['重复调用来源', 'launchedFromFeature=null', `launchedFromUid=10494 launchedFromPackage=${包名}`],
  ])('拒绝%s', (_名称, 来源, 替换): void => {
    expect(验证(活动栈().replace(来源, 替换))).toBe(false)
  })

  it('拒绝重复顶层、重复Hist及缺失MainActivity', (): void => {
    expect(验证(`${活动栈()}\ntopResumedActivity=ActivityRecord{116771110 u0 ${权限组件} t20160}`)).toBe(false)
    expect(验证(`${活动栈()}\n* Hist #2: ActivityRecord{116771110 u0 ${权限组件} t20160}`)).toBe(false)
    expect(验证(活动栈().replace(启动组件, 'com.other.app/.Main'))).toBe(false)
    expect(验证('')).toBe(false)
  })
})
