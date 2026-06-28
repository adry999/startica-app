// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  {
    // vi.mock() calls are hoisted by Vitest before imports — import/first
    // would flag them incorrectly in every test file.
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: { 'import/first': 'off' },
  },
)
