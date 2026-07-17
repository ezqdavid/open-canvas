import { expect, test } from '@playwright/test'

test('chaos explorer canvas mounts and unmounts cleanly', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.getByText('Syncing local mindspace...')).toBeHidden()

  await page.getByRole('button', { name: 'Text Jot' }).click()
  await page.getByRole('button', { name: 'Text Jot' }).click()

  const toggle = page.getByTitle('Open Chaos Explorer')
  await toggle.click()
  await expect(page.locator('canvas')).toBeVisible()

  await toggle.click()
  await expect(page.locator('canvas')).toHaveCount(0)
})
