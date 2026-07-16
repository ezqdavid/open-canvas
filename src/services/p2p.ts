import * as Y from 'yjs';
import { uint8ArrayToHex, hexToUint8Array } from './db';

export interface Peer {
  id: string;
  name: string;
  color: string;
  cursorX?: number;
  cursorY?: number;
  activeNodeId?: string | null;
  lastActive: number;
}

type P2PMessage =
  | { type: 'peer-join'; peer: Omit<Peer, 'lastActive'> }
  | { type: 'peer-welcome'; fromId: string; peer: Omit<Peer, 'lastActive'>; yjsStateHex?: string }
  | { type: 'peer-leave'; peerId: string }
  | { type: 'crdt-update'; workspaceId: string; updateHex: string }
  | { type: 'cursor-move'; peerId: string; x: number; y: number }
  | { type: 'focus-change'; peerId: string; nodeId: string | null }
  | { type: 'ping'; peerId: string };

const ADJECTIVES = ['Zen', 'Focus', 'Creative', 'Quiet', 'Mindful', 'Calm', 'Stellar', 'Flowing'];
const NOUNS = ['Explorer', 'Thinker', 'Creator', 'Dreamer', 'Synthesizer', 'Navigator', 'Artist'];
const COLORS = [
  '#2dd4bf', // Zen Teal
  '#a855f7', // Chaos Purple
  '#f43f5e', // Magenta Accent
  '#fbbf24', // Amber Glow
  '#3b82f6', // Bright Blue
  '#10b981', // Emerald
  '#ec4899', // Pink Ribbon
  '#f97316'  // Orange Peel
];

export class P2PCoordinator {
  public myPeer: Peer;
  private channel: BroadcastChannel | null = null;
  private ydoc: Y.Doc | null = null;
  private workspaceId: string = 'default-workspace';
  private peers: Map<string, Peer> = new Map();
  private listeners: Set<(peers: Peer[]) => void> = new Set();
  private updateCleanup: (() => void) | null = null;
  private isTauri: boolean = false;
  private pingInterval: any = null;

  constructor() {
    this.isTauri = !!(window as any).__TAURI__;
    
    // Generate a unique identity for this session
    const peerId = 'peer_' + Math.random().toString(36).substring(2, 11);
    const name = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    this.myPeer = {
      id: peerId,
      name,
      color,
      lastActive: Date.now()
    };
  }

  // Initialize P2P connection for a given workspace
  public async initialize(workspaceId: string, ydoc: Y.Doc) {
    this.cleanup();
    
    this.workspaceId = workspaceId;
    this.ydoc = ydoc;
    this.peers.clear();

    // 1. Establish BroadcastChannel for Web-Mesh
    this.channel = new BroadcastChannel(`opencanvas_mesh_${workspaceId}`);
    this.channel.onmessage = (event) => this.handleMessage(event.data);

    // 2. Setup Yjs Doc Local Update Listener
    const handleYjsUpdate = (update: Uint8Array, origin: any) => {
      if (origin === 'peer-sync' || origin === 'local-load') return;
      
      const updateHex = uint8ArrayToHex(update);
      this.broadcast({
        type: 'crdt-update',
        workspaceId: this.workspaceId,
        updateHex
      });

      // If running in Tauri, also relay down to Rust-native libp2p
      if (this.isTauri) {
        try {
          (window as any).__TAURI__.invoke('send_crdt_update', { workspaceId, updateHex });
        } catch (err) {
          console.error('Tauri invoke failed:', err);
        }
      }
    };
    this.ydoc.on('update', handleYjsUpdate);
    this.updateCleanup = () => {
      this.ydoc?.off('update', handleYjsUpdate);
    };

    // 3. Setup Tauri Rust core hooks
    if (this.isTauri) {
      this.setupTauriListeners();
    }

    // 4. Broadcast join announcement to Web-Mesh peers
    this.broadcast({
      type: 'peer-join',
      peer: {
        id: this.myPeer.id,
        name: this.myPeer.name,
        color: this.myPeer.color,
        activeNodeId: this.myPeer.activeNodeId
      }
    });

    // 5. Setup periodic Ping to keep connection list active
    this.pingInterval = setInterval(() => {
      this.broadcast({ type: 'ping', peerId: this.myPeer.id });
      this.reapDeadPeers();
    }, 5000);

    this.notifyListeners();
  }

  // Handle incoming message
  private handleMessage(msg: P2PMessage) {
    if (!msg) return;

    switch (msg.type) {
      case 'peer-join':
        if (msg.peer.id === this.myPeer.id) return;
        
        this.peers.set(msg.peer.id, { ...msg.peer, lastActive: Date.now() });
        this.notifyListeners();

        // Welcome them and send our current document state so they can sync up
        if (this.ydoc) {
          const currentState = Y.encodeStateAsUpdate(this.ydoc);
          this.broadcast({
            type: 'peer-welcome',
            fromId: this.myPeer.id,
            peer: {
              id: this.myPeer.id,
              name: this.myPeer.name,
              color: this.myPeer.color,
              activeNodeId: this.myPeer.activeNodeId
            },
            yjsStateHex: uint8ArrayToHex(currentState)
          });
        }
        break;

      case 'peer-welcome':
        if (msg.peer.id === this.myPeer.id) return;
        
        this.peers.set(msg.peer.id, { ...msg.peer, lastActive: Date.now() });
        this.notifyListeners();

        // Apply state sent by peer to get instant sync if they had changes
        if (msg.yjsStateHex && this.ydoc) {
          try {
            Y.applyUpdate(this.ydoc, hexToUint8Array(msg.yjsStateHex), 'peer-sync');
          } catch (e) {
            console.error('Failed to sync Yjs state from welcome message:', e);
          }
        }
        break;

      case 'peer-leave':
        this.peers.delete(msg.peerId);
        this.notifyListeners();
        break;

      case 'crdt-update':
        if (msg.workspaceId !== this.workspaceId) return;
        if (this.ydoc && msg.updateHex) {
          try {
            Y.applyUpdate(this.ydoc, hexToUint8Array(msg.updateHex), 'peer-sync');
          } catch (e) {
            console.error('Failed to apply P2P CRDT update:', e);
          }
        }
        break;

      case 'cursor-move':
        if (msg.peerId === this.myPeer.id) return;
        const cursorPeer = this.peers.get(msg.peerId);
        if (cursorPeer) {
          cursorPeer.cursorX = msg.x;
          cursorPeer.cursorY = msg.y;
          cursorPeer.lastActive = Date.now();
          this.notifyListeners();
        }
        break;

      case 'focus-change':
        if (msg.peerId === this.myPeer.id) return;
        const focusPeer = this.peers.get(msg.peerId);
        if (focusPeer) {
          focusPeer.activeNodeId = msg.nodeId;
          focusPeer.lastActive = Date.now();
          this.notifyListeners();
        }
        break;

      case 'ping':
        const pingPeer = this.peers.get(msg.peerId);
        if (pingPeer) {
          pingPeer.lastActive = Date.now();
        } else if (msg.peerId !== this.myPeer.id) {
          // If we see a ping from an unknown peer, trigger a join to discover them
          this.broadcast({
            type: 'peer-join',
            peer: {
              id: this.myPeer.id,
              name: this.myPeer.name,
              color: this.myPeer.color,
              activeNodeId: this.myPeer.activeNodeId
            }
          });
        }
        break;
    }
  }

  // Setup Tauri Event Listeners (Relays P2P events from Rust Libp2p up to React)
  private setupTauriListeners() {
    try {
      const tauri = (window as any).__TAURI__;
      
      // Listen for libp2p discovered peers
      tauri.listen('libp2p-peer-discovered', (event: any) => {
        const { peerId, name } = event.payload;
        this.peers.set(peerId, {
          id: peerId,
          name: name || `P2P Peer ${peerId.substring(0, 5)}`,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          lastActive: Date.now()
        });
        this.notifyListeners();
      });

      // Listen for libp2p incoming CRDT updates
      tauri.listen('libp2p-crdt-update', (event: any) => {
        const { workspaceId, updateHex } = event.payload;
        if (workspaceId === this.workspaceId && this.ydoc) {
          try {
            Y.applyUpdate(this.ydoc, hexToUint8Array(updateHex), 'peer-sync');
          } catch (e) {
            console.error('Failed to apply Rust Libp2p CRDT update:', e);
          }
        }
      });
    } catch (err) {
      console.error('Failed to register Tauri event listeners:', err);
    }
  }

  // Broadcast real-time cursor movement
  public updateCursor(x: number, y: number) {
    this.myPeer.cursorX = x;
    this.myPeer.cursorY = y;
    this.broadcast({
      type: 'cursor-move',
      peerId: this.myPeer.id,
      x,
      y
    });
  }

  // Broadcast active selected / focused element change
  public updateActiveNode(nodeId: string | null) {
    this.myPeer.activeNodeId = nodeId;
    this.broadcast({
      type: 'focus-change',
      peerId: this.myPeer.id,
      nodeId
    });
  }

  // Subscribe to peer list changes
  public subscribe(callback: (peers: Peer[]) => void) {
    this.listeners.add(callback);
    callback(Array.from(this.peers.values()));
    return () => {
      this.listeners.delete(callback);
    };
  }

  // Broadcast helper
  private broadcast(msg: P2PMessage) {
    try {
      this.channel?.postMessage(msg);
    } catch (err) {
      console.error('Failed to post message over BroadcastChannel:', err);
    }
  }

  // Reap peers who haven't pinged in 12 seconds
  private reapDeadPeers() {
    let changed = false;
    const now = Date.now();
    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.lastActive > 12000) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.notifyListeners();
  }

  private notifyListeners() {
    const list = Array.from(this.peers.values());
    this.listeners.forEach(cb => cb(list));
  }

  // Clean up all hooks
  public cleanup() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    
    if (this.channel) {
      this.broadcast({
        type: 'peer-leave',
        peerId: this.myPeer.id
      });
      this.channel.close();
      this.channel = null;
    }
    
    if (this.updateCleanup) {
      this.updateCleanup();
      this.updateCleanup = null;
    }
    
    this.peers.clear();
    this.notifyListeners();
  }
}

// Global P2P coordinator instance
export const p2pCoordinator = new P2PCoordinator();
