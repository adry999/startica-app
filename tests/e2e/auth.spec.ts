import { test, expect } from '@playwright/test'

test.describe('auth', () => {
  test('redirects an unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login\?redirect=\/$/)
  })

  test('logs in, lands on the home placeholder, then logs out', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('admin@startica.dev')
    await page.getByLabel('Parolă').or(page.getByLabel('Password')).fill('Startica123!')
    await page.getByRole('button', { name: /autentificare|log in/i }).click()

    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
    await expect(page.getByText('Salut, Super Admin')).toBeVisible()

    await page.getByRole('button', { name: /deconectare|log out/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('forgot-password always shows the generic success message', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('does-not-exist@startica.dev')
    await page.getByRole('button', { name: /trimite|send/i }).click()

    await expect(page.getByText(/email cu instrucțiuni|email with reset instructions/i)).toBeVisible()
  })
})
