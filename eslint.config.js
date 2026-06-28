//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // ponytail: generated + vendored code is never hand-edited, so linting it
    // only produces noise (paraglide-js output, installed skill templates).
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'src/paraglide/**',
      '.agents/**',
    ],
  },
]
