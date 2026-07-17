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

  await Promise.all([
    expect(pageA.getByText('Syncing local mindspace...')).toBeHidden(),
    expect(pageB.getByText('Syncing local mindspace...')).toBeHidden(),
  ])

  await pageA.getByRole('button', { name: 'Text Jot' }).click()
  await pageA.getByText('Double click to write...').first().click()
  await pageA.getByPlaceholder('Write your notes here... (Markdown supported)').first().fill('Arquitectura P2P Validada')

  await expect(pageB.getByText('Arquitectura P2P Validada').first()).toBeVisible()

  await pageB.getByText('Arquitectura P2P Validada').first().click()
  await pageB.getByPlaceholder('Write your notes here... (Markdown supported)').first().fill('Edición bidireccional exitosa')

  await expect(pageA.getByText('Edición bidireccional exitosa').first()).toBeVisible()

  await Promise.all([contextA.close(), contextB.close()])
})
