import { z } from 'zod'

const fpvEnvSchema = z.object({
  FPV_API_BASE_URL: z.string().url(),
  FPV_WEB_PUBLIC_URL: z.string().url(),
  FPV_USER_AGENT: z.string().min(10),
  FPV_RATE_LIMIT_MS: z.coerce.number().int().positive().default(1500),
  FPV_TIMEOUT_MS: z.coerce.number().int().positive().max(2147483647).default(10000),
})

const parsed = fpvEnvSchema.safeParse(process.env)

if (!parsed.success) {
  throw new Error(
    `Invalid FPV configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
  )
}

export const fpvConfig = parsed.data