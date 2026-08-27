// Client-environment stub for `#/db/driver`. Never imported directly — it is
// swapped in by the `environments.client.resolve.alias` rule in
// vite.config.ts, which protects the browser bundle from BOTH real drivers:
//   - dev client: src/db/driver.ts pulls better-sqlite3, a native addon whose
//     module scope uses node builtins ("promisify is not a function") and
//     crashes hydration before any route mounts
//   - prod client: src/db/driver.worker.ts would ship D1/R2 binding code into
//     dist/client where bindings don't exist anyway
// Server environments are unaffected: plain `vite dev` SSR resolves driver.ts
// naturally, and the prod/prerender build aliases #/db/driver to
// driver.worker.ts. Reach for this file only if you see its errors in a
// BROWSER console — that means a new client-graph import chain bypassed the
// client alias (check vite.config.ts).
import type { Db } from './index.ts'

export function getDriverDb(): Db {
  throw new Error(
    'getDb() was reached in the browser. SQL must run behind createServerFn (server fns). If this appears in a browser console, some client-reachable module imported #/db/driver and the environments.client alias in vite.config.ts no longer covers it.',
  )
}

export function getDriverR2(): R2Bucket {
  throw new Error(
    'getR2() was reached in the browser. R2 access must run behind createServerFn (server fns). If this appears in a browser console, check the environments.client alias in vite.config.ts.',
  )
}
