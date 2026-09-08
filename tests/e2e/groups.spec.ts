import { test, expect } from '@playwright/test'

test.describe('groups critical flows', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('admin@startica.dev')
    await page.getByLabel('Parolă').or(page.getByLabel('Password')).fill('Startica123!')
    await page.getByRole('button', { name: /autentificare|log in/i }).click()
    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
  })

  test('create group with educator assignment', async ({ page }) => {
    // Navigate to groups
    await page.goto('/groups')
    await page.waitForLoadState('networkidle')

    // Click create group button
    const createBtn = page.getByRole('button', { name: /crează|create|add/i }).first()
    await createBtn.click()
    await page.waitForLoadState('networkidle')

    // Fill group form
    const timestamp = Date.now()
    const groupName = `TestGroup${timestamp}`

    await page.getByLabel(/nume|name/i).fill(groupName)
    await page.getByLabel(/interval vârstă|age range/i).fill('3-4 ani')

    // Select educator if dropdown exists
    const educatorSelect = page.locator('select, [role="combobox"]').nth(0)
    if (await educatorSelect.isVisible().catch(() => false)) {
      await educatorSelect.click()
      await page.getByRole('option').first().click()
    }

    // Submit
    await page.getByRole('button', { name: /salvează|save|create/i }).click()
    await page.waitForLoadState('networkidle')

    // Verify group appears in list
    await expect(page.getByText(groupName)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/creat|created/i)).toBeVisible()
  })

  test('edit group details', async ({ page }) => {
    // Navigate to groups
    await page.goto('/groups')
    await page.waitForLoadState('networkidle')

    // Open first group
    const groupRow = page.locator('[role="row"]').nth(1)
    await groupRow.click()
    await page.waitForLoadState('networkidle')

    // Click edit button
    const editBtn = page.getByRole('button', { name: /editează|edit/i }).first()
    await editBtn.click()
    await page.waitForLoadState('networkidle')

    // Change name
    const timestamp = Date.now()
    const newName = `Updated${timestamp}`
    const nameInput = page.getByLabel(/nume|name/i)
    await nameInput.fill(newName)

    // Submit
    await page.getByRole('button', { name: /salvează|save/i }).click()
    await page.waitForLoadState('networkidle')

    // Verify update
    await expect(page.getByText(/actualizat|updated/i)).toBeVisible()
    await expect(page.getByText(newName)).toBeVisible({ timeout: 5000 })
  })
})
