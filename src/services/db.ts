import { createRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import * as Y from 'yjs';

// Convert Uint8Array to Hex string for safe storage in JSON-based database
export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Convert Hex string back to Uint8Array
export function hexToUint8Array(hex: string): Uint8Array {
  if (!hex) return new Uint8Array(0);
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map(byte => parseInt(byte, 16)));
}

// RxDB Schema for Workspaces (Canvas files)
const workspaceSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' }
  },
  required: ['id', 'name', 'createdAt', 'updatedAt']
};

// RxDB Schema for Yjs Binary Updates
const yjsUpdateSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 150 }, // workspaceId_timestamp_counter
    workspaceId: { type: 'string', maxLength: 100 },
    updateHex: { type: 'string' },
    timestamp: { type: 'number' }
  },
  required: ['id', 'workspaceId', 'updateHex', 'timestamp']
};

let dbPromise: any = null;

// Initialize database
export async function getDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const db = await createRxDatabase({
      name: 'opencanvas_db',
      storage: getRxStorageDexie()
    });

    await db.addCollections({
      workspaces: {
        schema: workspaceSchema
      },
      yjs_updates: {
        schema: yjsUpdateSchema
      }
    });

    // Create a default workspace if none exists
    const existing = await db.workspaces.find().exec();
    if (existing.length === 0) {
      const defaultId = 'default-workspace';
      await db.workspaces.insert({
        id: defaultId,
        name: 'My Brain Map',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return db;
  })();

  return dbPromise;
}

// Load a workspace Yjs doc by applying all stored database updates
export async function loadWorkspaceYdoc(workspaceId: string, ydoc: Y.Doc): Promise<() => void> {
  const db = await getDatabase();
  
  // 1. Fetch all updates sorted by timestamp
  const updates = await db.yjs_updates.find({
    selector: { workspaceId },
    sort: [{ timestamp: 'asc' }]
  }).exec();

  // 2. Turn off Yjs observers while initializing state to avoid feedback loops
  ydoc.transact(() => {
    updates.forEach((doc: any) => {
      const binary = hexToUint8Array(doc.updateHex);
      if (binary.length > 0) {
        try {
          Y.applyUpdate(ydoc, binary);
        } catch (e) {
          console.error('Failed to apply update', e);
        }
      }
    });
  }, 'local-load');

  // Counter to ensure unique IDs for updates created in the same millisecond
  let changeCounter = 0;

  // 3. Bind subsequent local updates to save into RxDB
  const handleUpdate = async (update: Uint8Array, origin: any) => {
    // If update originated from database initial loading or peer synchronization, don't re-save it
    if (origin === 'local-load' || origin === 'peer-sync') return;

    const hex = uint8ArrayToHex(update);
    const timestamp = Date.now();
    const id = `${workspaceId}_${timestamp}_${changeCounter++}`;

    try {
      await db.yjs_updates.insert({
        id,
        workspaceId,
        updateHex: hex,
        timestamp
      });
      
      // Update workspace timestamp
      const ws = await db.workspaces.findOne(workspaceId).exec();
      if (ws) {
        await ws.incrementalPatch({ updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error('Failed to save Yjs update to database:', err);
    }
  };

  ydoc.on('update', handleUpdate);

  // Return unsubscribe handler to clean up listener when switching workspaces
  return () => {
    ydoc.off('update', handleUpdate);
  };
}

// Compact database: combine all old updates into a single state update, clean up fragments
export async function compactWorkspace(workspaceId: string, ydoc: Y.Doc) {
  const db = await getDatabase();
  
  // Get consolidated state update from Yjs
  const consolidatedUpdate = Y.encodeStateAsUpdate(ydoc);
  const hex = uint8ArrayToHex(consolidatedUpdate);
  const timestamp = Date.now();

  // Find all old updates
  const oldUpdates = await db.yjs_updates.find({
    selector: { workspaceId }
  }).exec();

  // Insert the single consolidated update
  await db.yjs_updates.insert({
    id: `${workspaceId}_${timestamp}_compact`,
    workspaceId,
    updateHex: hex,
    timestamp
  });

  // Delete all old updates
  await Promise.all(oldUpdates.map((doc: any) => doc.remove()));
  
  console.log(`Compacted workspace ${workspaceId}. Shrinked ${oldUpdates.length} updates into 1.`);
}

// Fetch all workspaces
export async function listWorkspaces() {
  const db = await getDatabase();
  return db.workspaces.find().exec();
}

// Create a new workspace
export async function createWorkspace(id: string, name: string) {
  const db = await getDatabase();
  return db.workspaces.insert({
    id,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

// Delete a workspace and its updates
export async function deleteWorkspace(id: string) {
  const db = await getDatabase();
  const ws = await db.workspaces.findOne(id).exec();
  if (ws) {
    await ws.remove();
  }
  
  const updates = await db.yjs_updates.find({
    selector: { workspaceId: id }
  }).exec();
  
  await Promise.all(updates.map((doc: any) => doc.remove()));
}
