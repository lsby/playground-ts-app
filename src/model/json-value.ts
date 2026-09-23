import { z } from 'zod'

export type JSON值 = string | number | boolean | null | JSON值[] | { [键: string]: JSON值 }

export let JSON值模式: z.ZodType<JSON值> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JSON值模式),
    z.record(z.string(), JSON值模式),
  ]),
)

export let JSON对象模式 = z.record(z.string(), JSON值模式)
