import * as eslintConfig from '@lsby/eslint-config'
import projectRules from './scripts/eslint/project-rules.js'

let 常用忽略域 = [...eslintConfig.常用忽略域, 'android', 'package', 'release', 'test-outputs', 'dist']
let 忽略常见文件夹 = { ignores: 常用忽略域 }
let 常用作用域 = [...eslintConfig.常用作用域, 'scripts/**/*.ts']

export default [
  {
    files: ['test/requirement/**/*.ts', 'test/requirement-support/**/*.ts'],
    rules: { 'project/no-browser-named-callback': 'error' },
  },
  // ..
  忽略常见文件夹,
  { ...eslintConfig.ts安全性, files: 常用作用域 },
  { ...eslintConfig.jsDoc安全性, files: 常用作用域 },
  { ...eslintConfig.风格美化, files: 常用作用域 },
  {
    files: 常用作用域,
    plugins: { project: projectRules },
    rules: {
      // ..
      'project/no-dom-query': 'error',
      'project/no-absolute-src-import': 'error',
    },
  },
]
