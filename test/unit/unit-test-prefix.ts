import { afterAll } from 'vitest'
import { 应用单例 } from '../../src/app/app'

await 应用单例.run()

afterAll(async (): Promise<void> => {
  await 应用单例.close()
})
