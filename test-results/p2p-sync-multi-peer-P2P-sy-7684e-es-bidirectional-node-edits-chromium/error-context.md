# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p2p-sync.spec.ts >> multi-peer P2P sync propagates bidirectional node edits
- Location: e2e/p2p-sync.spec.ts:3:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('input.node-title-input[value="Arquitectura P2P Validada"]')
Expected: 1
Received: 0
Timeout:  30000ms

Call log:
  - Expect "toHaveCount" with timeout 30000ms
  - waiting for locator('input.node-title-input[value="Arquitectura P2P Validada"]')
    64 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e7]:
        - img [ref=e8]
        - heading "Open Canvas" [level=2] [ref=e10]
      - generic [ref=e11]:
        - button "Canvas files" [ref=e12] [cursor=pointer]:
          - img [ref=e13]
        - button "Micro plugins" [ref=e15] [cursor=pointer]:
          - img [ref=e16]
        - button "ADHD copilot" [ref=e17] [cursor=pointer]:
          - img [ref=e18]
        - button "DAO governance" [ref=e21] [cursor=pointer]:
          - img [ref=e22]
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: Canvas workspace files
          - generic [ref=e30] [cursor=pointer]:
            - generic [ref=e31]:
              - img [ref=e32]
              - generic [ref=e34]: My Brain Map
            - generic [ref=e35]:
              - button [ref=e36]:
                - img [ref=e37]
              - button [ref=e39]:
                - img [ref=e40]
          - generic [ref=e43]:
            - textbox "New canvas name..." [ref=e44]
            - button [ref=e45] [cursor=pointer]:
              - img [ref=e46]
        - generic [ref=e47]:
          - generic [ref=e48]: Data sovereignty
          - generic [ref=e49]:
            - button "Backup" [ref=e50] [cursor=pointer]:
              - img [ref=e51]
              - generic [ref=e54]: Backup
            - generic [ref=e55] [cursor=pointer]:
              - img [ref=e56]
              - generic [ref=e59]: Load JSON
        - generic [ref=e60]:
          - generic [ref=e61]: P2P live mesh network
          - generic [ref=e62]:
            - generic [ref=e63]:
              - generic [ref=e64]: "Connection ID:"
              - button "Copy" [ref=e65] [cursor=pointer]:
                - img [ref=e66]
                - generic [ref=e69]: Copy
            - generic [ref=e70]: peer_9fno28yyd
          - generic [ref=e71]:
            - generic [ref=e72]:
              - img [ref=e73]
              - generic [ref=e78]: "Online collaborators (0):"
            - generic [ref=e79]: No active peers online. Open in another tab to mesh sync!
    - button [ref=e80] [cursor=pointer]:
      - img [ref=e81]
  - generic [ref=e83]:
    - generic [ref=e84]:
      - button "🌌 Core Space" [ref=e86]
      - generic:
        - img
        - generic [ref=e87]:
          - generic [ref=e88]:
            - generic [ref=e89]:
              - img [ref=e90]
              - textbox "Untitled Jotting" [active] [ref=e93]: Arquitectura P2P Validada
            - generic [ref=e94]:
              - button "Instant Focus" [ref=e95] [cursor=pointer]:
                - img [ref=e96]
              - button "Create Link" [ref=e98] [cursor=pointer]:
                - img [ref=e99]
              - button "Delete block" [ref=e102] [cursor=pointer]:
                - img [ref=e103]
          - paragraph [ref=e109]: Double-click to write your thoughts here. Map out connections!
      - generic [ref=e110]:
        - generic [ref=e111]: "Spawn:"
        - button "Text Jot" [ref=e112] [cursor=pointer]:
          - img [ref=e113]
          - text: Text Jot
        - button "Kanban Board" [ref=e114] [cursor=pointer]:
          - img [ref=e115]
          - text: Kanban Board
        - button "Code Snippet" [ref=e116] [cursor=pointer]:
          - img [ref=e117]
          - text: Code Snippet
        - button "Interactive Widget" [ref=e120] [cursor=pointer]:
          - img [ref=e121]
          - text: Interactive Widget
        - button "Nested Map" [ref=e124] [cursor=pointer]:
          - img [ref=e125]
          - text: Nested Map
      - generic [ref=e130]:
        - button "Recenter Map" [ref=e131]:
          - img [ref=e132]
        - generic [ref=e137]: 100%
    - button "Open Chaos Explorer" [ref=e139] [cursor=pointer]:
      - img [ref=e140]
    - button "Enter Zen Focus Mode" [ref=e145] [cursor=pointer]:
      - img [ref=e146]
      - text: Enter Zen Focus Mode
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | 
  3  | test('multi-peer P2P sync propagates bidirectional node edits', async ({ browser }) => {
  4  |   test.slow()
  5  | 
  6  |   const contextA = await browser.newContext()
  7  |   const contextB = await browser.newContext()
  8  |   const pageA = await contextA.newPage()
  9  |   const pageB = await contextB.newPage()
  10 | 
  11 |   await Promise.all([
  12 |     pageA.goto('http://localhost:5173'),
  13 |     pageB.goto('http://localhost:5173'),
  14 |   ])
  15 | 
  16 |   const loaderA = pageA.getByText('Syncing local mindspace...')
  17 |   const loaderB = pageB.getByText('Syncing local mindspace...')
  18 | 
  19 |   await Promise.all([
  20 |     expect(loaderA).toBeHidden({ timeout: 30000 }),
  21 |     expect(loaderB).toBeHidden({ timeout: 30000 }),
  22 |   ])
  23 | 
  24 |   const titleInputsA = pageA.locator('input.node-title-input')
  25 |   const beforeCount = await titleInputsA.count()
  26 | 
  27 |   await pageA.getByRole('button', { name: 'Text Jot' }).click()
  28 |   await expect(titleInputsA).toHaveCount(beforeCount + 1)
  29 |   await titleInputsA.nth(beforeCount).fill('Arquitectura P2P Validada')
  30 | 
  31 |   const syncedOnB = pageB.locator('input.node-title-input[value="Arquitectura P2P Validada"]')
> 32 |   await expect(syncedOnB).toHaveCount(1, { timeout: 30000 })
     |                           ^ Error: expect(locator).toHaveCount(expected) failed
  33 |   await syncedOnB.first().fill('Edición bidireccional exitosa')
  34 | 
  35 |   const syncedBackOnA = pageA.locator('input.node-title-input[value="Edición bidireccional exitosa"]')
  36 |   await expect(syncedBackOnA).toHaveCount(1, { timeout: 30000 })
  37 | 
  38 |   await Promise.all([contextA.close(), contextB.close()])
  39 | })
  40 | 
```