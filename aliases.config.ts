import { fileURLToPath } from 'node:url'

function projectPath(relativePath: string) {
  return fileURLToPath(new URL(`./${relativePath}`, import.meta.url))
}

// Single source for boundary aliases: nuxt.config.ts (which generates the
// tsconfig paths) and vitest.config.ts both read this object.
export const boundaryAliases = {
  '@core': projectPath('src/core'),
  '@shared': projectPath('src/shared'),
  '@modules': projectPath('src/modules'),
  '@test-support': projectPath('tests/support'),
}
