// ponytail: build-time version injected by vite.config.ts `define`.
// Source of truth is package.json `version`. Don't edit this by hand.
declare const __APP_VERSION__: string

export const APP_VERSION: string = __APP_VERSION__
