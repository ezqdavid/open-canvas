import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export interface Peer {
  id: string;
  name: string;
  color: string;
  cursorX?: number;
  cursorY?: number;
  activeNodeId?: string | null;
  lastActive: number;
}

const ADJECTIVES = ['Zen', 'Focus', 'Creative', 'Quiet', 'Mindful', 'Calm', 'Stellar', 'Flowing'];
const NOUNS = ['Explorer', 'Thinker', 'Creator', 'Dreamer', 'Synthesizer', 'Navigator', 'Artist'];
const COLORS = ['#2dd4bf', '#a855f7', '#f43f5e', '#fbbf24', '#3b82f6', '#10b981', '#ec4899', '#f97316'];

export class P2PCoordinator {
  public myPeer: Peer;
  private provider: WebrtcProvider | null = null;
  private ydoc: Y.Doc | null = null;
  private workspaceId: string = 'default-workspace';
  private peers: Map<string, Peer> = new Map();
  private listeners: Set<(peers: Peer[]) => void> = new Set();
  private awarenessCleanup: (() => void) | null = null;

  constructor() {
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

  public async initialize(workspaceId: string, ydoc: Y.Doc) {
    this.cleanup();

    this.workspaceId = workspaceId;
    this.ydoc = ydoc;
    this.peers.clear();

    this.provider = new WebrtcProvider(`opencanvas_mesh_${workspaceId}`, ydoc, {
      signaling: [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com'
      ]
    });
    this.setLocalAwarenessState();

    const awareness = this.provider.awareness;
    const handleAwarenessChange = () => this.syncPeersFromAwareness();
    awareness.on('change', handleAwarenessChange);
    this.awarenessCleanup = () => {
      awareness.off('change', handleAwarenessChange);
    };

    this.syncPeersFromAwareness();
    this.notifyListeners();
  }

  private setLocalAwarenessState() {
    if (!this.provider) return;
    const currentState = (this.provider.awareness.getLocalState() as Record<string, unknown> | null) ?? {};
    this.provider.awareness.setLocalState({
      ...currentState,
      user: {
        id: this.myPeer.id,
        name: this.myPeer.name,
        color: this.myPeer.color
      },
      cursor: this.myPeer.cursorX !== undefined && this.myPeer.cursorY !== undefined
        ? { x: this.myPeer.cursorX, y: this.myPeer.cursorY }
        : null,
      activeNodeId: this.myPeer.activeNodeId ?? null
    });
  }

  private syncPeersFromAwareness() {
    if (!this.provider) return;

    const nextPeers = new Map<string, Peer>();
    for (const state of this.provider.awareness.getStates().values()) {
      const peerState = state as {
        user?: { id?: string; name?: string; color?: string };
        cursor?: { x?: number; y?: number } | null;
        activeNodeId?: string | null;
      };
      const user = peerState.user;
      if (!user?.id || user.id === this.myPeer.id) continue;

      nextPeers.set(user.id, {
        id: user.id,
        name: user.name ?? 'Peer',
        color: user.color ?? '#3b82f6',
        cursorX: peerState.cursor?.x,
        cursorY: peerState.cursor?.y,
        activeNodeId: peerState.activeNodeId ?? null,
        lastActive: Date.now()
      });
    }
    this.peers = nextPeers;
    this.notifyListeners();
  }

  public updateCursor(x: number, y: number) {
    this.myPeer.cursorX = x;
    this.myPeer.cursorY = y;
    this.setLocalAwarenessState();
  }

  public updateActiveNode(nodeId: string | null) {
    this.myPeer.activeNodeId = nodeId;
    this.setLocalAwarenessState();
  }

  public subscribe(callback: (peers: Peer[]) => void) {
    this.listeners.add(callback);
    callback(Array.from(this.peers.values()));
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    const list = Array.from(this.peers.values());
    this.listeners.forEach(cb => cb(list));
  }

  public cleanup() {
    if (this.awarenessCleanup) {
      this.awarenessCleanup();
      this.awarenessCleanup = null;
    }

    this.provider?.awareness.setLocalState(null);
    this.provider?.destroy();
    this.provider = null;
    this.ydoc = null;
    this.peers.clear();
    this.notifyListeners();
  }
}

// Global P2P coordinator instance
export const p2pCoordinator = new P2PCoordinator();
