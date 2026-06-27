import { config as loadEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

// Load .env so admin-API tests (e.g. accept-invite) can access
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY without manual export.
loadEnv()

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ro-RO',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
