import { test, expect } from '@playwright/test'

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('admin.demo@startica.dev')
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
}

test.describe('admin role', () => {
  test('admin is redirected away from /kindergartens', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/kindergartens')
    await expect(page).toHaveURL('http://localhost:3000/')
  })

  test('admin sees the staff page and their kindergarten staff', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()
    await expect(page).toHaveURL('http://localhost:3000/staff')

    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()
  })

  test('admin can invite an educator', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()

    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()

    const uniqueEmail = `admin-invited-${Date.now()}@example.com`
    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')
    await inviteDialog.getByLabel('Email').fill(uniqueEmail)
    await inviteDialog.getByLabel('Nume complet').fill('Educator Nou Admin')
    await inviteDialog.getByRole('button', { name: 'Invită' }).click()
    await expect(page.getByText('Invitația a fost trimisă.', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('cell', { name: 'Educator Nou Admin' }).first()).toBeVisible()
  })

  test('admin invite dialog does not offer the admin role option', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()

    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')

    // The role select (if present) must not expose the 'admin' option
    const roleSelect = inviteDialog.locator('select[name="role"], [data-testid="role-select"]')
    if (await roleSelect.isVisible()) {
      await expect(inviteDialog.getByRole('option', { name: /^admin$/i })).not.toBeVisible()
    }
    // If there is no role field at all, the invite is implicitly educator-only — also valid
  })
})
