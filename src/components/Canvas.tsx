import React, { useState, useRef, useEffect } from 'react';
import { Plus, Maximize, Sparkles, Code, ListTodo } from 'lucide-react';
import { type Peer, p2pCoordinator } from '../services/p2p';
import { NodeComponent } from './NodeComponent';
import * as Y from 'yjs';

interface CanvasProps {
  workspaceId: string;
  ydoc: Y.Doc;
  activeNodeId: string | null;
  setActiveNodeId: (id: string | null) => void;
  canvasPath: string[];
  setCanvasPath: (path: string[]) => void;
  onInstantFocus: (nodeId: string) => void;
}

export interface CanvasNode {
  id: string;
  title: string;
  type: 'text' | 'shape' | 'kanban' | 'media' | 'nested' | 'code' | 'widget';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color?: string;
  tags?: string[];
  parentId?: string;
  shapeType?: 'circle' | 'square' | 'triangle' | 'hexagon';
  kanbanData?: {
    todo: string[];
    progress: string[];
    done: string[];
  };
  widgetData?: {
    type: 'checklist' | 'poll' | 'timer';
    checklist?: { text: string; checked: boolean }[];
    poll?: { option: string; votes: number }[];
    timerLeft?: number;
    timerActive?: boolean;
  };
}

export interface CanvasLink {
  id: string;
  from: string;
  to: string;
}

export const Canvas: React.FC<CanvasProps> = ({
  workspaceId,
  ydoc,
  activeNodeId,
  setActiveNodeId,
  canvasPath,
  setCanvasPath,
  onInstantFocus
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [links, setLinks] = useState<CanvasLink[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  
  const activeParentId = canvasPath[canvasPath.length - 1];

  // Dynamic filter for nodes belonging to active sub-canvas scope
  const filteredNodes = nodes.filter(node => {
    if (activeParentId === 'Root') {
      return !node.parentId || node.parentId === 'Root';
    }
    return node.parentId === activeParentId;
  });

  // Dynamic filter for links belonging to visible nodes
  const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredLinks = links.filter(link => visibleNodeIds.has(link.from) && visibleNodeIds.has(link.to));
  
  // Transform state: panning offsets and zoom level
  const [pan, setPan] = useState({ x: window.innerWidth / 2 - 250, y: window.innerHeight / 2 - 200 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);
  
  // Dragging states
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  
  // Linking states
  const [linkingFromNodeId, setLinkingFromNodeId] = useState<string | null>(null);
  const [mouseVirtualPos, setMouseVirtualPos] = useState({ x: 0, y: 0 });
  
  // Canvas coordinate conversion helper: Screen -> Virtual Space
  const getVirtualCoords = (screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom
    };
  };

  // Sync Yjs maps to local React state
  useEffect(() => {
    const yNodes = ydoc.getMap<any>('nodes');
    const yLinks = ydoc.getArray<any>('links');

    const updateState = () => {
      // Load nodes
      const currentNodes: CanvasNode[] = [];
      yNodes.forEach((val, key) => {
        currentNodes.push({ id: key, ...val });
      });
      setNodes(currentNodes);

      // Load links
      setLinks(yLinks.toArray());
    };

    yNodes.observe(updateState);
    yLinks.observe(updateState);
    updateState();

    // Subscribe to P2P peer changes (live collaborator cursor locations)
    const unsubscribePeers = p2pCoordinator.subscribe((currentPeers) => {
      setPeers(currentPeers);
    });

    return () => {
      yNodes.unobserve(updateState);
      yLinks.unobserve(updateState);
      unsubscribePeers();
    };
  }, [ydoc, workspaceId]);

  // Handle Mouse Down on Canvas for Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-grid-bg')) {
      setIsPanning(true);
      e.preventDefault();
    }
  };

  // Handle Mouse Move for Panning & Dragging Nodes
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const virtual = getVirtualCoords(e.clientX, e.clientY);
    setMouseVirtualPos(virtual);

    // Track active cursor position with peers
    p2pCoordinator.updateCursor(virtual.x, virtual.y);

    if (isPanning) {
      setIsFocusing(false); // disable smooth transitions during active manual panning
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    } else if (draggedNodeId) {
      const yNodes = ydoc.getMap<any>('nodes');
      const nodeData = yNodes.get(draggedNodeId);
      if (nodeData) {
        yNodes.set(draggedNodeId, {
          ...nodeData,
          x: virtual.x - dragStartOffset.current.x,
          y: virtual.y - dragStartOffset.current.y
        });
      }
    }
  };

  // Handle Mouse Up
  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
  };

  // Zooming around Mouse cursor location
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const zoomIntensity = 0.08;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert mouse position to virtual coordinate before zoom scale change
    const wheelVirtualX = (mouseX - pan.x) / zoom;
    const wheelVirtualY = (mouseY - pan.y) / zoom;

    const zoomFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const nextZoom = Math.min(Math.max(zoom * zoomFactor, 0.15), 3);

    setIsFocusing(false);
    setZoom(nextZoom);
    setPan({
      x: mouseX - wheelVirtualX * nextZoom,
      y: mouseY - wheelVirtualY * nextZoom
    });
  };

  // Double click to add a new Node
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).classList.contains('canvas-grid-bg')) return;
    
    const virtual = getVirtualCoords(e.clientX, e.clientY);
    spawnNode('text', virtual.x - 120, virtual.y - 75);
  };

  // Spawn dynamic Node in Yjs mapping
  const spawnNode = (type: CanvasNode['type'], x: number, y: number) => {
    const id = 'node_' + Math.random().toString(36).substring(2, 11);
    const yNodes = ydoc.getMap<any>('nodes');
    
    const newNode: Omit<CanvasNode, 'id'> = {
      title: type === 'text' ? 'New Jotting' : type === 'kanban' ? 'Project Flow' : type === 'code' ? 'Code Snippet' : type === 'widget' ? 'Task Widget' : 'Visual Anchor',
      type,
      x,
      y,
      width: type === 'kanban' ? 450 : type === 'nested' ? 320 : type === 'code' ? 360 : type === 'widget' ? 260 : 240,
      height: type === 'kanban' ? 280 : type === 'nested' ? 220 : type === 'code' ? 240 : type === 'widget' ? 220 : 150,
      content: type === 'text' ? 'Double-click to write your thoughts here. Map out connections!' : type === 'code' ? '// Write your custom code here\nconsole.log("Hello, Open Canvas!");' : '',
      color: type === 'text' ? 'teal' : type === 'kanban' ? 'purple' : type === 'code' ? 'amber' : type === 'widget' ? 'indigo' : 'magenta',
      parentId: activeParentId
    };

    if (type === 'kanban') {
      newNode.kanbanData = {
        todo: ['Review requirements', 'Brainstorm layout'],
        progress: ['Wireframe UI'],
        done: []
      };
    } else if (type === 'widget') {
      newNode.widgetData = {
        type: 'checklist',
        checklist: [
          { text: 'Create draft notes', checked: false },
          { text: 'Link related blocks', checked: false }
        ],
        poll: [
          { option: 'Concept Draft', votes: 1 },
          { option: 'Production Pipeline', votes: 0 }
        ],
        timerLeft: 1500,
        timerActive: false
      };
    }

    yNodes.set(id, newNode);
    setActiveNodeId(id);
  };

  // Triggers node dragging
  const handleNodeDragStart = (id: string, e: React.MouseEvent) => {
    if (linkingFromNodeId) return; // Prevent drag if we are in linking mode

    const node = nodes.find(n => n.id === id);
    if (!node) return;

    setIsFocusing(false);
    const virtual = getVirtualCoords(e.clientX, e.clientY);
    dragStartOffset.current = {
      x: virtual.x - node.x,
      y: virtual.y - node.y
    };
    setDraggedNodeId(id);
    setActiveNodeId(id);
    p2pCoordinator.updateActiveNode(id);
  };

  // Triggers instant focus animation centering the selected node
  const triggerInstantFocus = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    setIsFocusing(true);
    setZoom(1.0); // Reset zoom level back to standard scale for comfortable reading
    setPan({
      x: width / 2 - (node.x + node.width / 2),
      y: height / 2 - (node.y + node.height / 2)
    });
    
    setActiveNodeId(nodeId);
    p2pCoordinator.updateActiveNode(nodeId);
    onInstantFocus(nodeId);
  };

  // Establish connection logic
  const handleNodeHeaderAction = (id: string, action: 'link' | 'delete') => {
    if (action === 'delete') {
      const yNodes = ydoc.getMap<any>('nodes');
      const yLinks = ydoc.getArray<any>('links');
      
      // Delete links connected to this node
      const currentLinks = yLinks.toArray();
      const indicesToDelete = currentLinks
        .map((link, idx) => (link.from === id || link.to === id ? idx : -1))
        .filter(idx => idx !== -1)
        .sort((a, b) => b - a); // sort desc to avoid index shifts on deletion
      
      indicesToDelete.forEach(idx => yLinks.delete(idx));
      
      // Delete node
      yNodes.delete(id);
      if (activeNodeId === id) setActiveNodeId(null);
    } else if (action === 'link') {
      setLinkingFromNodeId(id);
    }
  };

  // Link target node selected
  const handleNodeSelectForLink = (targetId: string) => {
    if (!linkingFromNodeId || linkingFromNodeId === targetId) return;

    const yLinks = ydoc.getArray<any>('links');
    
    // Check if link already exists
    const linkExists = yLinks.toArray().some(l => 
      (l.from === linkingFromNodeId && l.to === targetId) || 
      (l.from === targetId && l.to === linkingFromNodeId)
    );

    if (!linkExists) {
      yLinks.push([{
        id: 'link_' + Math.random().toString(36).substring(2, 11),
        from: linkingFromNodeId,
        to: targetId
      }]);
    }

    setLinkingFromNodeId(null);
  };

  // Cancel any active linking
  const cancelLinking = () => {
    setLinkingFromNodeId(null);
  };

  // Delete an existing connection link
  const deleteLink = (linkId: string) => {
    const yLinks = ydoc.getArray<any>('links');
    const current = yLinks.toArray();
    const idx = current.findIndex(l => l.id === linkId);
    if (idx !== -1) {
      yLinks.delete(idx);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()} // prevent right-click browser menu
    >
      {/* Breadcrumbs Navigation Bar */}
      <div className="absolute top-6 left-6 glass-panel px-4 py-2.5 flex items-center gap-2 z-30 shadow-2xl font-display border border-white/10 select-none">
        {canvasPath.map((id, index) => {
          const isLast = index === canvasPath.length - 1;
          const title = index === 0 ? '🌌 Core Space' : nodes.find(n => n.id === id)?.title || 'Sub-Space';
          return (
            <React.Fragment key={id}>
              {index > 0 && <span className="text-slate-500 text-xs font-semibold mx-1">→</span>}
              <button
                onClick={() => {
                  if (!isLast) {
                    setCanvasPath(canvasPath.slice(0, index + 1));
                    setActiveNodeId(null);
                  }
                }}
                className={`text-xs font-bold transition-all uppercase tracking-widest ${
                  isLast ? 'text-teal-400 font-extrabold' : 'text-slate-400 hover:text-white hover:underline cursor-pointer'
                }`}
              >
                {title}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Background Dot-Grid with dynamic transforms */}
      <div
        className="canvas-grid-bg"
        style={{
          '--grid-offset-x': `${pan.x}px`,
          '--grid-offset-y': `${pan.y}px`,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          opacity: zoom < 0.25 ? 0.15 : 0.6
        } as React.CSSProperties}
      />

      {/* Canvas Elements container */}
      <div
        className={`absolute origin-top-left w-0 h-0`}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: isFocusing ? 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
        }}
      >
        {/* Connection Links rendering SVG Layer */}
        <svg className="canvas-svg-overlay">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 2 L 10 5 L 0 8 z" fill="var(--accent-purple)" />
            </marker>
          </defs>

          {/* Render Active Connections */}
          {filteredLinks.map((link) => {
            const fromNode = nodes.find(n => n.id === link.from);
            const toNode = nodes.find(n => n.id === link.to);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.x + fromNode.width / 2;
            const y1 = fromNode.y + fromNode.height / 2;
            const x2 = toNode.x + toNode.width / 2;
            const y2 = toNode.y + toNode.height / 2;

            // Curved Bezier calculation
            const dx = x2 - x1;
            const cx1 = x1 + dx * 0.4;
            const cy1 = y1;
            const cx2 = x2 - dx * 0.4;
            const cy2 = y2;
            const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

            return (
               <g key={link.id} className="group pointer-events-auto">
                {/* Invisible wider stroke path for easier hover selection */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="12"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete connection?')) {
                      deleteLink(link.id);
                    }
                  }}
                />
                {/* Visual rendering path */}
                <path
                  d={d}
                  className="connection-line"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {/* Render Active Thread Link under cursor */}
          {linkingFromNodeId && (() => {
            const originNode = nodes.find(n => n.id === linkingFromNodeId);
            if (!originNode) return null;

            const x1 = originNode.x + originNode.width / 2;
            const y1 = originNode.y + originNode.height / 2;
            const x2 = mouseVirtualPos.x;
            const y2 = mouseVirtualPos.y;

            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--accent-teal)"
                strokeWidth="2"
                strokeDasharray="6 3"
                opacity="0.85"
                className="animate-pulse"
              />
            );
          })()}
        </svg>

        {/* Nodes Layer */}
        {filteredNodes.map((node) => (
          <div
            key={node.id}
            className={`canvas-node node-${node.color || 'teal'} ${activeNodeId === node.id ? 'selected' : ''}`}
            style={{
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              height: `${node.height}px`
            }}
            onMouseDown={(e) => handleNodeDragStart(node.id, e)}
            onClick={(e) => {
              e.stopPropagation();
              if (linkingFromNodeId && linkingFromNodeId !== node.id) {
                handleNodeSelectForLink(node.id);
              } else {
                setActiveNodeId(node.id);
                p2pCoordinator.updateActiveNode(node.id);
              }
            }}
          >
            <NodeComponent
              node={node}
              ydoc={ydoc}
              isLinking={!!linkingFromNodeId}
              isLinkOrigin={linkingFromNodeId === node.id}
              onHeaderAction={(action) => handleNodeHeaderAction(node.id, action)}
              onInstantFocus={() => triggerInstantFocus(node.id)}
              onEnterSubCanvas={() => {
                setCanvasPath([...canvasPath, node.id]);
                setActiveNodeId(null);
              }}
            />
          </div>
        ))}

        {/* Live Peer Cursors Overlay */}
        {peers.map((peer) => {
          if (peer.cursorX === undefined || peer.cursorY === undefined) return null;

          return (
            <div
              key={peer.id}
              className="absolute pointer-events-none z-50 flex flex-col items-start"
              style={{
                left: `${peer.cursorX}px`,
                top: `${peer.cursorY}px`,
                transform: 'translate(-2px, -2px)'
              }}
            >
              {/* Custom SVG mouse cursor colored specifically for this peer */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={peer.color}
                stroke="white"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
              >
                <path d="M4.5 3V17L9.5 12.5L15 21L18 19.5L12.5 11L18.5 11.5L4.5 3Z" />
              </svg>

              {/* Float badge showcasing username */}
              <div
                className="px-2 py-0.5 rounded text-[10px] font-medium font-display text-white mt-1 border border-white/20 shadow-lg"
                style={{ backgroundColor: peer.color }}
              >
                {peer.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Link-Active Notification Banner */}
      {linkingFromNodeId && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 flex items-center gap-3 z-30 shadow-2xl border-teal-500/30 animate-pulse fade-in">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span className="text-xs text-teal-200 font-display">Select another node to link, or click anywhere to cancel</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              cancelLinking();
            }}
            className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-teal-500/20 text-teal-400 border border-teal-500/40 hover:bg-teal-500/40 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Canvas Quick Spawner Dock */}
      <div className="floating-dock glass-panel bottom-6 left-1/2 -translate-x-1/2">
        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mr-1">Spawn:</span>
        <button
          onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const rx = getVirtualCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
              spawnNode('text', rx.x - 120, rx.y - 75);
            }
          }}
          className="btn-premium"
        >
          <Plus className="w-4 h-4 text-teal-400" />
          Text Jot
        </button>
        <button
          onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const rx = getVirtualCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
              spawnNode('kanban', rx.x - 225, rx.y - 140);
            }
          }}
          className="btn-premium btn-premium-purple"
        >
          <Plus className="w-4 h-4 text-purple-400" />
          Kanban Board
        </button>
        <button
          onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const rx = getVirtualCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
              spawnNode('code', rx.x - 180, rx.y - 120);
            }
          }}
          className="btn-premium btn-premium-amber"
        >
          <Code className="w-4 h-4 text-amber-400" />
          Code Snippet
        </button>
        <button
          onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const rx = getVirtualCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
              spawnNode('widget', rx.x - 130, rx.y - 110);
            }
          }}
          className="btn-premium"
          style={{ borderColor: 'hsla(220, 80%, 45%, 0.4)' }}
        >
          <ListTodo className="w-4 h-4 text-blue-400" />
          Interactive Widget
        </button>
        <button
          onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const rx = getVirtualCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
              const nodeType: CanvasNode['type'] = 'nested';
              spawnNode(nodeType, rx.x - 160, rx.y - 110);
            }
          }}
          className="btn-premium btn-premium-magenta"
        >
          <Maximize className="w-4 h-4 text-pink-400" />
          Nested Map
        </button>
      </div>

      {/* Interactive Controls Panel (Zoom reset and panning cues) */}
      <div className="absolute bottom-6 right-6 glass-panel p-2 flex flex-col gap-2 z-10">
        <button
          title="Recenter Map"
          onClick={() => {
            if (containerRef.current) {
              setIsFocusing(true);
              setZoom(1);
              setPan({
                x: containerRef.current.clientWidth / 2 - 250,
                y: containerRef.current.clientHeight / 2 - 200
              });
            }
          }}
          className="p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors"
        >
          <Maximize className="w-4 h-4" />
        </button>
        <div className="text-[10px] font-bold text-center text-slate-500 font-display border-t border-white/5 pt-1.5 mt-0.5">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
};
