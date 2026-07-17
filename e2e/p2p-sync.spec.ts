import { expect, test } from '@playwright/test'

test('multi-peer P2P sync propagates bidirectional node edits', async ({ browser }) => {
  test.slow()

  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  await Promise.all([
    pageA.goto('http://localhost:5173'),
    pageB.goto('http://localhost:5173'),
  ])

  const loaderA = pageA.getByText('Syncing local mindspace...')
  const loaderB = pageB.getByText('Syncing local mindspace...')

  await Promise.all([
    expect(loaderA).toBeHidden({ timeout: 30000 }),
    expect(loaderB).toBeHidden({ timeout: 30000 }),
  ])

  const titleInputsA = pageA.locator('input.node-title-input')
  const beforeCount = await titleInputsA.count()

  await pageA.getByRole('button', { name: 'Text Jot' }).click()
  await expect(titleInputsA).toHaveCount(beforeCount + 1)
  await titleInputsA.nth(beforeCount).fill('Arquitectura P2P Validada')

  const syncedOnB = pageB.locator('input.node-title-input[value="Arquitectura P2P Validada"]')
  await expect(syncedOnB).toHaveCount(1, { timeout: 30000 })
  await syncedOnB.first().fill('Edición bidireccional exitosa')

  const syncedBackOnA = pageA.locator('input.node-title-input[value="Edición bidireccional exitosa"]')
  await expect(syncedBackOnA).toHaveCount(1, { timeout: 30000 })

  await Promise.all([contextA.close(), contextB.close()])
})
