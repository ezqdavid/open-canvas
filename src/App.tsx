import { useState, useEffect } from 'react';
import { Canvas, type CanvasNode } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { ZenFocusOverlay } from './components/ZenFocusOverlay';
import { ChaosExplorer } from './components/ChaosExplorer';
import { loadWorkspaceYdoc, compactWorkspace } from './services/db';
import { p2pCoordinator } from './services/p2p';
import * as Y from 'yjs';
import { Sparkles, BrainCircuit } from 'lucide-react';

export default function App() {
  const [workspaceId, setWorkspaceId] = useState<string>('default-workspace');
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [canvasPath, setCanvasPath] = useState<string[]>(['Root']);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize and reload Workspace state when workspaceId is switched
  useEffect(() => {
    let dbUnsubscribe: (() => void) | null = null;
    setIsLoading(true);

    const initWorkspace = async () => {
      // 1. Create a clean Yjs document for the active workspace
      const doc = new Y.Doc();
      
      // 2. Load and play back all stored database updates from local RxDB
      dbUnsubscribe = await loadWorkspaceYdoc(workspaceId, doc);
      
      // 3. Setup P2P Broadcast synchronization for real-time collaboration
      await p2pCoordinator.initialize(workspaceId, doc);

      setYdoc(doc);
      setIsLoading(false);

      // Trigger automatic compaction of Yjs updates in the database on load as an optimization
      setTimeout(() => {
        compactWorkspace(workspaceId, doc).catch(err => {
          console.warn('Compaction failed:', err);
        });
      }, 3000);
    };

    initWorkspace();

    return () => {
      if (dbUnsubscribe) dbUnsubscribe();
      p2pCoordinator.cleanup();
      setIsZenMode(false);
      setActiveNodeId(null);
      setCanvasPath(['Root']);
    };
  }, [workspaceId]);

  const handleSelectWorkspace = (id: string) => {
    setWorkspaceId(id);
  };

  // Teleport handler: triggers when clicking a node inside the Chaos Explorer minimap
  const handleTeleport = (x: number, y: number, _width: number, _height: number) => {
    // Custom trigger which centers canvas. 
    // In our custom Canvas implementation, onInstantFocus re-pans the map to coordinate.
    // So trigger by setting active node and letting Canvas transition
    const nodesMap = ydoc?.getMap<any>('nodes');
    const nodeId = Object.keys(nodesMap?.toJSON() || {}).find(
      key => nodesMap?.get(key).x === x && nodesMap?.get(key).y === y
    );
    if (nodeId) {
      setActiveNodeId(nodeId);
      // Simulate click centering event
      const el = document.querySelector(`[title="Instant Focus"]`) as HTMLButtonElement;
      if (el) el.click();
    }
  };

  if (isLoading || !ydoc) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0c0c0e] gap-4 select-none">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-teal-500/20 border-t-teal-400 animate-spin" />
          <BrainCircuit className="w-6 h-6 text-teal-400 absolute animate-pulse" />
        </div>
        <div className="text-sm font-semibold text-slate-300 font-display flex items-center gap-1.5 tracking-wider">
          <Sparkles className="w-4 h-4 text-teal-400 animate-bounce" />
          Syncing local mindspace...
        </div>
        <span className="text-[10px] text-slate-500 font-display">RADICAL USER AUTONOMY • SECURE OFFLINE DATA</span>
      </div>
    );
  }

  // Find active node data for Zen Mode overlay
  const activeNode = activeNodeId 
    ? (ydoc.getMap<any>('nodes').get(activeNodeId) as CanvasNode)
    : null;

  return (
    <div className="relative w-screen h-screen flex overflow-hidden bg-space select-none">
      
      {/* 1. Left Drawer sidebar: Works folders, peer logs */}
      <Sidebar
        currentWorkspaceId={workspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        ydoc={ydoc}
      />

      {/* 2. Central Infinite pan/zoom canvas grid */}
      <div className="flex-grow h-full relative">
        <Canvas
          workspaceId={workspaceId}
          ydoc={ydoc}
          activeNodeId={activeNodeId}
          setActiveNodeId={setActiveNodeId}
          canvasPath={canvasPath}
          setCanvasPath={setCanvasPath}
          onInstantFocus={(nodeId) => {
            console.log(`Main viewport focused on element: ${nodeId}`);
          }}
        />

        {/* 3. Chaos Explorer (floating minimap and physics graph) */}
        <ChaosExplorer
          ydoc={ydoc}
          currentWorkspaceId={workspaceId}
          onTeleport={handleTeleport}
        />

        {/* 4. Zen Focus Mode toggle trigger (shows only when a node is highlighted) */}
        {activeNodeId && !isZenMode && (
          <button
            onClick={() => setIsZenMode(true)}
            className="absolute top-6 left-1/2 -translate-x-1/2 btn-premium glass-panel px-4 py-2 border-teal-500/30 text-teal-200 hover:border-teal-500/60 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:shadow-[0_0_12px_var(--accent-teal-glow)] animate-pulse z-20 cursor-pointer"
            title="Enter distraction-free focus room"
          >
            <BrainCircuit className="w-4 h-4 text-teal-400" />
            Enter Zen Focus Mode
          </button>
        )}
      </div>

      {/* 5. Immersive Zen Focus Space full-screen overlay */}
      {isZenMode && activeNode && (
        <ZenFocusOverlay
          node={{ ...activeNode, id: activeNodeId! }}
          ydoc={ydoc}
          onExit={() => setIsZenMode(false)}
        />
      )}

    </div>
  );
}
