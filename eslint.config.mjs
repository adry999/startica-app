// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

// Modules migrated behind a public index. Each migration step appends one name;
// the rules below then forbid any deep import into it.
/** @type {string[]} */
const boundaryEnforcedModules = ['billing', 'expenses', 'payments']
const enforcedModulesPattern = boundaryEnforcedModules.join('|')

const legacyModuleAlias = {
  regex: `^(~|@)/modules/(${enforcedModulesPattern})/`,
  message: 'Import this module through @modules/<name>.',
}

/**
 * @param {string} moduleName
 * @returns {import('eslint').Linter.Config}
 */
function moduleBoundary(moduleName) {
  const patterns = [legacyModuleAlias]
  if (boundaryEnforcedModules.includes(moduleName)) {
    patterns.push({
      regex: `^@modules/(?!${moduleName}(/|$))`,
      message: 'A module never imports another module. Receive a port from src/plugins/module-dependencies.ts or read src/shared state.',
    })
  }
  else {
    patterns.push({
      regex: `^@modules/(${enforcedModulesPattern})/`,
      message: 'Use only the public index: @modules/<name>.',
    })
  }
  return {
    files: [`src/modules/${moduleName}/**/*.{ts,vue}`],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  }
}

const featureModules = ['attendance', 'auth', 'billing', 'children', 'dashboard', 'expenses', 'groups', 'kindergartens', 'payments', 'pool', 'settings', 'staff']

export default withNuxt(
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
    },
  },
  {
    files: ['src/shared/**/*.{ts,vue}', 'src/core/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        regex: '^(~|@)/modules/|^@modules(/|$)',
        message: 'shared/ and core/ never depend on a feature module.',
      }] }],
    },
  },
  ...featureModules.map(moduleBoundary),
  {
    // Composition root: route wrappers, layouts, plugins and server routes wire modules together.
    files: ['src/pages/**/*.vue', 'src/layouts/**/*.vue', 'src/plugins/**/*.ts', 'src/middleware/**/*.ts', 'src/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [legacyModuleAlias, {
        regex: `^@modules/(${enforcedModulesPattern})/(?!pages/[A-Za-z]+Page\\.vue$)`,
        message: 'Outside a module, use its public index (@modules/<name>) or a routed page component.',
      }] }],
    },
  },
  {
    // vi.mock() calls are hoisted by Vitest before imports — import/first
    // would flag them incorrectly in every test file.
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: { 'import/first': 'off' },
  },
)
