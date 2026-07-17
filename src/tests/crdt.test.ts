import * as Y from 'yjs'

describe('Yjs CRDT Convergence Engine', () => {
  const syncDocs = (docA: Y.Doc, docB: Y.Doc) => {
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB))
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA))
  }

  const bootstrapKanban = (doc: Y.Doc) => {
    const board = doc.getMap<Y.Array<string>>('kanban')
    board.set('todo', new Y.Array<string>())
    board.set('done', new Y.Array<string>())
    board.get('todo')?.push(['Draft CRDT test'])
  }

  it('converges after concurrent offline operations without data loss', () => {
    const peerA = new Y.Doc()
    const peerB = new Y.Doc()

    bootstrapKanban(peerA)

    // Initial sync
    syncDocs(peerA, peerB)

    const boardA = peerA.getMap<Y.Array<string>>('kanban')
    const boardB = peerB.getMap<Y.Array<string>>('kanban')

    // Concurrent offline edits
    peerA.transact(() => {
      const todo = boardA.get('todo')
      const done = boardA.get('done')
      const card = todo?.get(0)
      if (card) {
        todo?.delete(0, 1)
        done?.push([card])
      }
    })

    peerB.transact(() => {
      boardB.get('todo')?.push(['Nueva tarjeta concurrente'])
    })

    // Re-sync and verify deterministic convergence
    syncDocs(peerA, peerB)

    expect(peerA.toJSON()).toEqual(peerB.toJSON())

    const convergedA = peerA.getMap<Y.Array<string>>('kanban')
    expect(convergedA.get('todo')?.toArray()).toContain('Nueva tarjeta concurrente')
    expect(convergedA.get('done')?.toArray()).toContain('Draft CRDT test')
  })
})
