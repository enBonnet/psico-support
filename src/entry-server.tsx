import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

import { setCloudflareEnv } from '#/db'

// ponytail: custom server entry captures the worker (request, env, ctx)
// signature so we can stash the D1 binding where getDb() reaches it. The
// default entry drops env on the floor.
type CloudflareEnv = {
  DB: D1Database
}

const handler = createStartHandler(defaultStreamHandler)

async function fetch(request: Request, env?: CloudflareEnv): Promise<Response> {
  if (env) setCloudflareEnv(env)
  // ponytail: store the active request on a global so auth.getSession
  // can read cookies. Cleared in finally after the handler resolves.
  const g = globalThis as unknown as { __TSS_REQUEST__?: Request }
  g.__TSS_REQUEST__ = request
  try {
    // @ts-expect-error — createStartHandler's signature only declares
    // (request); passing extra args is the worker fetch convention.
    return await handler(request, env)
  } finally {
    g.__TSS_REQUEST__ = undefined
  }
}

export default { fetch }
