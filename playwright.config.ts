import { config as loadEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

// Load .env so admin-API tests (e.g. accept-invite) can access
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY without manual export.
loadEnv()

// E2E_PORT lets the suite run against a non-default port when 3000 is
// occupied by another local app (reuseExistingServer would otherwise
// silently attach to the wrong server). Default keeps CI unchanged.
const port = process.env.E2E_PORT ?? '3000'
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL,
    locale: 'ro-RO',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { ...process.env as Record<string, string>, PORT: port },
  },
})
