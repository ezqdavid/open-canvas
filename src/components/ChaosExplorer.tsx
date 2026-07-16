import React, { useState, useEffect, useRef } from 'react';
import { Network, Map as MapIcon, Search, Sparkles, Compass } from 'lucide-react';
import { type CanvasNode, type CanvasLink } from './Canvas';
import * as Y from 'yjs';

interface ChaosExplorerProps {
  ydoc: Y.Doc;
  currentWorkspaceId: string;
  onTeleport: (x: number, y: number, width: number, height: number) => void;
}

type ExplorerMode = 'minimap' | 'graph';

interface ForceNode {
  id: string;
  title: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isDragging?: boolean;
}

export const ChaosExplorer: React.FC<ChaosExplorerProps> = ({
  ydoc,
  currentWorkspaceId,
  onTeleport
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ExplorerMode>('graph');
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [links, setLinks] = useState<CanvasLink[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Pathfinding state
  const [pathStartId, setPathStartId] = useState<string | null>(null);
  const [pathEndId, setPathEndId] = useState<string | null>(null);
  const [shortestPath, setShortestPath] = useState<string[]>([]);

  // Physics simulation refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationNodesRef = useRef<ForceNode[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Sync state from Yjs
  useEffect(() => {
    const yNodes = ydoc.getMap<any>('nodes');
    const yLinks = ydoc.getArray<any>('links');

    const updateState = () => {
      const currentNodes: CanvasNode[] = [];
      yNodes.forEach((val, key) => {
        currentNodes.push({ id: key, ...val });
      });
      setNodes(currentNodes);
      setLinks(yLinks.toArray());
    };

    yNodes.observe(updateState);
    yLinks.observe(updateState);
    updateState();

    return () => {
      yNodes.unobserve(updateState);
      yLinks.unobserve(updateState);
    };
  }, [ydoc, currentWorkspaceId]);

  // Extract all unique tags
  const allTags = Array.from(
    new Set(
      nodes.flatMap(n => n.tags || (n.type === 'kanban' ? ['work'] : n.type === 'nested' ? ['map'] : ['ideas']))
    )
  );

  // 1. Interactive Spatial Minimap calculations
  const renderMinimapNodes = () => {
    if (nodes.length === 0) return <div className="text-xs italic text-slate-500 text-center p-4">No nodes spawned yet.</div>;

    // Find bounding box to scale nodes inside the minimap preview
    const minX = Math.min(...nodes.map(n => n.x)) - 100;
    const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 100;
    const minY = Math.min(...nodes.map(n => n.y)) - 100;
    const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 100;

    const width = maxX - minX;
    const height = maxY - minY;
    
    // Fit into 220px width, preserving aspect ratio
    const mapWidth = 220;
    const mapHeight = 150;
    const scale = Math.min(mapWidth / width, mapHeight / height);

    return (
      <div className="relative border border-white/10 bg-black/60 rounded-xl overflow-hidden shadow-inner h-[150px] w-full">
        {nodes.map(n => {
          const mapX = (n.x - minX) * scale;
          const mapY = (n.y - minY) * scale;
          const mapW = n.width * scale;
          const mapH = n.height * scale;

          const isHighlighted = 
            (searchQuery && n.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (selectedTag && (n.tags || []).includes(selectedTag));

          return (
            <div
              key={n.id}
              onClick={() => onTeleport(n.x, n.y, n.width, n.height)}
              className={`absolute rounded cursor-pointer transition-all border ${
                isHighlighted 
                  ? 'bg-teal-400 border-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.5)] z-10' 
                  : 'bg-white/10 border-white/10 hover:bg-white/20 hover:border-white/20'
              }`}
              style={{
                left: `${mapX}px`,
                top: `${mapY}px`,
                width: `${Math.max(mapW, 6)}px`,
                height: `${Math.max(mapH, 4)}px`
              }}
              title={`Click to teleport to: ${n.title}`}
            />
          );
        })}
      </div>
    );
  };

  // 2. Physics-Simulated Force Directed Graph
  useEffect(() => {
    if (mode !== 'graph' || !isOpen) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Synchronize force-nodes with actual Yjs nodes
    const existingForceMap = new Map(simulationNodesRef.current.map(sn => [sn.id, sn]));
    const updatedForceNodes: ForceNode[] = nodes.map(n => {
      const existing = existingForceMap.get(n.id);
      if (existing) {
        existing.title = n.title;
        existing.color = n.color || 'teal';
        return existing;
      } else {
        // Initialize at a random location near the canvas center
        return {
          id: n.id,
          title: n.title,
          color: n.color || 'teal',
          x: canvas.width / 2 + (Math.random() - 0.5) * 100,
          y: canvas.height / 2 + (Math.random() - 0.5) * 100,
          vx: 0,
          vy: 0
        };
      }
    });
    simulationNodesRef.current = updatedForceNodes;

    // Physics constants
    const repulsionConstant = 1200; // electrostatic repulsion
    const attractionConstant = 0.04; // Hooke's law link stiffness
    const gravityConstant = 0.02; // soft pull to center
    const damping = 0.85; // friction

    const runSimulation = () => {
      const fNodes = simulationNodesRef.current;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Calculate Electrostatic Repulsion (Coulomb's Law)
      for (let i = 0; i < fNodes.length; i++) {
        const nodeA = fNodes[i];
        for (let j = i + 1; j < fNodes.length; j++) {
          const nodeB = fNodes[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distSq = dx * dx + dy * dy + 1; // prevent divide-by-zero
          const dist = Math.sqrt(distSq);

          if (dist < 220) {
            const force = repulsionConstant / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            nodeA.vx -= fx;
            nodeA.vy -= fy;
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }
      }

      // 2. Calculate Link Attraction (Hooke's Law)
      links.forEach(link => {
        const nodeA = fNodes.find(n => n.id === link.from);
        const nodeB = fNodes.find(n => n.id === link.to);
        if (!nodeA || !nodeB) return;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetLength = 120;
        const stretch = dist - targetLength;

        const force = stretch * attractionConstant;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        nodeA.vx += fx;
        nodeA.vy += fy;
        nodeB.vx -= fx;
        nodeB.vy -= fy;
      });

      // 3. Gravity and boundaries
      fNodes.forEach(node => {
        const dx = width / 2 - node.x;
        const dy = height / 2 - node.y;
        node.vx += dx * gravityConstant;
        node.vy += dy * gravityConstant;

        // Apply velocities & damping
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= damping;
        node.vy *= damping;

        // Contain within canvas
        node.x = Math.max(20, Math.min(width - 20, node.x));
        node.y = Math.max(20, Math.min(height - 20, node.y));
      });

      // 4. DRAWING LAYER
      ctx.clearRect(0, 0, width, height);

      // Draw Links
      links.forEach(link => {
        const fromNode = fNodes.find(n => n.id === link.from);
        const toNode = fNodes.find(n => n.id === link.to);
        if (!fromNode || !toNode) return;

        // Highlight link if it is part of shortest path suggestions
        const isPathLink = shortestPath.includes(link.from) && shortestPath.includes(link.to) &&
          Math.abs(shortestPath.indexOf(link.from) - shortestPath.indexOf(link.to)) === 1;

        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.strokeStyle = isPathLink ? 'hsl(172, 90%, 45%)' : 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = isPathLink ? 3.5 : 1.5;
        if (isPathLink) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'hsl(172, 90%, 45%)';
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      });

      // Draw Nodes
      fNodes.forEach(node => {
        const matchSearch = searchQuery && node.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchTag = selectedTag && nodes.find(n => n.id === node.id)?.tags?.includes(selectedTag);
        const isFocusedPath = shortestPath.includes(node.id);

        const radius = isFocusedPath ? 24 : 18;
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        
        // Custom neon styles based on active filters
        if (matchSearch || matchTag || isFocusedPath) {
          ctx.fillStyle = 'hsl(172, 90%, 45%)';
          ctx.shadowBlur = 12;
          ctx.shadowColor = 'hsl(172, 90%, 45%)';
        } else {
          ctx.fillStyle = node.color === 'purple' ? 'hsl(265, 85%, 60%)' : node.color === 'magenta' ? 'hsl(325, 90%, 55%)' : '#2dd4bf';
          ctx.shadowBlur = 0;
        }
        ctx.fill();

        // Overlay text labels
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.title.substring(0, 10), node.x, node.y + 3);
        ctx.shadowBlur = 0; // reset
      });

      animationFrameRef.current = requestAnimationFrame(runSimulation);
    };

    runSimulation();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [nodes, links, mode, isOpen, searchQuery, selectedTag, shortestPath]);

  // Click on physics canvas to Teleport or select path endpoint
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Detect click collision with any node
    const clickedNode = simulationNodesRef.current.find(node => {
      const dist = Math.sqrt((node.x - clickX) ** 2 + (node.y - clickY) ** 2);
      return dist <= 24;
    });

    if (clickedNode) {
      const actualNode = nodes.find(n => n.id === clickedNode.id);
      if (!actualNode) return;

      if (pathStartId && !pathEndId && pathStartId !== clickedNode.id) {
        // Set ending path node
        setPathEndId(clickedNode.id);
        solveShortestPath(pathStartId, clickedNode.id);
      } else {
        // Teleport canvas to node
        onTeleport(actualNode.x, actualNode.y, actualNode.width, actualNode.height);
      }
    }
  };

  // Breadth-First-Search shortest path algorithm between two mind map nodes
  const solveShortestPath = (start: string, end: string) => {
    const queue: string[][] = [[start]];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (current === end) {
        setShortestPath(path);
        return;
      }

      if (!visited.has(current)) {
        visited.add(current);
        const connections = links
          .filter(l => l.from === current || l.to === current)
          .map(l => (l.from === current ? l.to : l.from));

        connections.forEach(neigh => {
          queue.push([...path, neigh]);
        });
      }
    }
    alert('No connection path exists between these thoughts.');
    setShortestPath([]);
  };

  const clearPath = () => {
    setPathStartId(null);
    setPathEndId(null);
    setShortestPath([]);
  };

  return (
    <div className="absolute top-6 right-6 flex items-start z-30 select-none">
      
      {/* Toggled Overlay Drawer */}
      {isOpen && (
        <div className="glass-panel w-72 p-4 mr-3 flex flex-col gap-4 fade-in">
          
          {/* Header & Modes Selector */}
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Compass className="w-4 h-4 text-purple-400" />
              Chaos Explorer
            </h3>
            
            <div className="flex bg-black/40 p-0.5 rounded-lg border border-white/5">
              <button
                onClick={() => setMode('graph')}
                className={`p-1 rounded-md text-xs transition-all ${
                  mode === 'graph' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'
                }`}
                title="Force Directed Graph"
              >
                <Network className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMode('minimap')}
                className={`p-1 rounded-md text-xs transition-all ${
                  mode === 'minimap' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'
                }`}
                title="Spatial Minimap"
              >
                <MapIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Filtering Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search thought jottings..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/5 outline-none text-xs text-white placeholder-slate-500 focus:border-purple-500/50 transition-all"
            />
          </div>

          {/* Tag Cloud filter */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-white/5 pb-3">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-2 py-1 rounded text-[10px] font-medium font-display transition-all ${
                  selectedTag === null ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30' : 'text-slate-400 hover:text-white bg-white/5 border border-transparent'
                }`}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                  className={`px-2 py-1 rounded text-[10px] font-medium font-display transition-all ${
                    tag === selectedTag ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30' : 'text-slate-400 hover:text-white bg-white/5 border border-transparent'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* RENDERING SCREEN */}
          <div className="flex-grow flex items-center justify-center">
            {mode === 'minimap' ? (
              renderMinimapNodes()
            ) : (
              <div className="relative border border-white/10 bg-black/60 rounded-xl overflow-hidden shadow-inner h-[180px] w-full cursor-crosshair">
                <canvas
                  ref={canvasRef}
                  width="250"
                  height="180"
                  onClick={handleCanvasClick}
                  className="w-full h-full block"
                />
              </div>
            )}
          </div>

          {/* Pathfinding hints block */}
          {mode === 'graph' && (
            <div className="bg-black/30 border border-white/5 p-2 rounded-xl text-[11px] text-slate-400 leading-relaxed font-sans">
              <div className="flex items-center justify-between text-purple-300 font-display font-semibold mb-1">
                <span>Map Pathfinding:</span>
                {(pathStartId || shortestPath.length > 0) && (
                  <button onClick={clearPath} className="text-[9px] uppercase tracking-wider text-rose-400 hover:underline">
                    Clear
                  </button>
                )}
              </div>
              {!pathStartId ? (
                <span>To trace a path, select a starting node:</span>
              ) : !pathEndId ? (
                <span>Click a target node in the graph to find shortest path.</span>
              ) : (
                <div className="flex flex-col gap-1 text-slate-300 font-display">
                  <span className="text-[10px] text-teal-400 font-bold">Path Solved:</span>
                  <span className="truncate">
                    {shortestPath.map(nodeId => nodes.find(n => n.id === nodeId)?.title || nodeId).join(' → ')}
                  </span>
                </div>
              )}

              {/* Set start list */}
              {!pathStartId && (
                <div className="flex flex-wrap gap-1 mt-1.5 max-h-[60px] overflow-y-auto">
                  {nodes.map(n => (
                    <button
                      key={n.id}
                      onClick={() => setPathStartId(n.id)}
                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] text-slate-300"
                    >
                      {n.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-[9px] text-slate-500 font-display flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
            <span>Chaos Explorer helps you trace threads without losing mapping context.</span>
          </div>

        </div>
      )}

      {/* Trigger Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-3 rounded-full border transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95 ${
          isOpen
            ? 'bg-purple-600/30 border-purple-500/40 text-purple-300 shadow-purple-500/10'
            : 'bg-teal-500/20 border-teal-500/40 text-teal-300 hover:shadow-teal-500/25'
        }`}
        title="Open Chaos Explorer"
      >
        <Network className="w-5 h-5 animate-pulse" style={{ animationDuration: '3s' }} />
      </button>

    </div>
  );
};
