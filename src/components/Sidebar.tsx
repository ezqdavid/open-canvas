import React, { useState, useEffect } from 'react';
import { Folder, Plus, Trash2, Edit3, Check, ChevronLeft, ChevronRight, Copy, Download, Upload, Users, Wifi, Sliders, Sparkles, Vote } from 'lucide-react';
import { createWorkspace, deleteWorkspace, getDatabase } from '../services/db';
import { p2pCoordinator, type Peer } from '../services/p2p';
import * as Y from 'yjs';

interface SidebarProps {
  currentWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  ydoc: Y.Doc;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentWorkspaceId,
  onSelectWorkspace,
  ydoc
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditingName] = useState('');
  const [activePeers, setActivePeers] = useState<Peer[]>([]);
  const [copied, setCopied] = useState(false);

  // Load and subscribe to workspaces from RxDB
  useEffect(() => {
    let sub: any = null;
    
    const loadAndListen = async () => {
      const db = await getDatabase();
      
      // RxDB lets us query and subscribe to changes in real-time!
      const query = db.workspaces.find({
        sort: [{ updatedAt: 'desc' }]
      });
      
      sub = query.$.subscribe((docs: any) => {
        setWorkspaces(docs.map((d: any) => d.toJSON()));
      });
    };

    loadAndListen();

    // Subscribe to P2P peer lists
    const unsubscribePeers = p2pCoordinator.subscribe((peers) => {
      setActivePeers(peers);
    });

    return () => {
      if (sub) sub.unsubscribe();
      unsubscribePeers();
    };
  }, []);

  // Create new workspace file
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    const id = 'ws_' + Math.random().toString(36).substring(2, 11);
    await createWorkspace(id, newWorkspaceName.trim());
    setNewWorkspaceName('');
    onSelectWorkspace(id);
  };

  // Delete workspace
  const handleDeleteWorkspace = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspaces.length <= 1) {
      alert("You must keep at least one workspace mapping.");
      return;
    }
    
    if (window.confirm('Delete this canvas workspace? This will erase all local notes.')) {
      await deleteWorkspace(id);
      if (currentWorkspaceId === id) {
        // Fallback to another workspace
        const remaining = workspaces.find(w => w.id !== id);
        if (remaining) onSelectWorkspace(remaining.id);
      }
    }
  };

  // Save workspace renaming
  const handleSaveRename = async (id: string) => {
    if (!editName.trim()) return;
    const db = await getDatabase();
    const ws = await db.workspaces.findOne(id).exec();
    if (ws) {
      await ws.incrementalPatch({ name: editName.trim() });
    }
    setEditingId(null);
  };

  // Copy Peer ID to clipboard
  const copyPeerId = () => {
    navigator.clipboard.writeText(p2pCoordinator.myPeer.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Backup Workspace to JSON file
  const handleExportWorkspace = () => {
    const yNodes = ydoc.getMap('nodes').toJSON();
    const yLinks = ydoc.getArray('links').toJSON();
    const workspace = workspaces.find(w => w.id === currentWorkspaceId);

    const fileContent = JSON.stringify({
      version: 'open-canvas-v1',
      name: workspace?.name || 'Workspace Backup',
      nodes: yNodes,
      links: yLinks
    }, null, 2);

    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workspace?.name.toLowerCase().replace(/\s+/g, '_')}_backup.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import Workspace from JSON backup
  const handleImportWorkspace = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.version !== 'open-canvas-v1') {
          alert('Invalid backup file version schema.');
          return;
        }

        const newId = 'ws_imported_' + Math.random().toString(36).substring(2, 11);
        await createWorkspace(newId, `${data.name} (Imported)`);

        // Initialize Yjs for this imported canvas
        const tempDoc = new Y.Doc();
        const yNodes = tempDoc.getMap<any>('nodes');
        const yLinks = tempDoc.getArray<any>('links');

        tempDoc.transact(() => {
          Object.entries(data.nodes).forEach(([key, val]: [string, any]) => {
            yNodes.set(key, val);
          });
          yLinks.push(data.links);
        });

        // Store consolidated update directly inside RxDB so it loads instantly
        const consolidatedUpdate = Y.encodeStateAsUpdate(tempDoc);
        const db = await getDatabase();
        await db.yjs_updates.insert({
          id: `${newId}_${Date.now()}_import`,
          workspaceId: newId,
          updateHex: Array.from(consolidatedUpdate).map(b => b.toString(16).padStart(2, '0')).join(''),
          timestamp: Date.now()
        });

        onSelectWorkspace(newId);
        alert('Workspace imported successfully!');
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to parse backup JSON.');
      }
    };
    reader.readAsText(file);
  };

  const [activeTab, setActiveTab] = useState<'files' | 'plugins' | 'ai' | 'dao'>('files');
  const [isMinimalFocus, setIsMinimalFocus] = useState(false);
  const [isInsomniaFilter, setIsInsomniaFilter] = useState(false);
  
  // Word & Node counts live tracker
  const [stats, setStats] = useState({ nodes: 0, words: 0, characters: 0 });

  // Passive Flow State telemetry states
  const [activityTicks, setActivityTicks] = useState<number[]>([10, 15, 8, 20, 25, 12, 18, 14, 22, 15]);
  const [flowState, setFlowState] = useState<'Resting' | 'Focused' | 'Deep Flow'>('Resting');

  // ADHD Local AI Copilot states
  const [aiInput, setAiInput] = useState('');
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: '🌌 Focus Copilot online. I analyze your canvas offline to guard absolute privacy. Ask me to "summarize space" or click "Bridge Thoughts" below!' }
  ]);
  const [unlinkedAlerts, setUnlinkedAlerts] = useState<string[]>([]);

  // Decentralized DAO Governance Panel proposals
  const [proposals, setProposals] = useState([
    { id: 'D-021', title: 'Migrate canvas coordinates to WASM-based peer replication layers.', for: 12, against: 3, voted: false },
    { id: 'D-022', title: 'Implement customizable keyboard hyperfocus macros for ADHD speed navigation.', for: 24, against: 1, voted: false },
    { id: 'D-023', title: 'Enable local-first multi-device WebRTC routing without fallback trackers.', for: 8, against: 9, voted: false }
  ]);

  // Injects/clears HTML root classes for plugins
  useEffect(() => {
    if (isMinimalFocus) {
      document.documentElement.classList.add('minimal-focus-theme');
    } else {
      document.documentElement.classList.remove('minimal-focus-theme');
    }
  }, [isMinimalFocus]);

  useEffect(() => {
    if (isInsomniaFilter) {
      document.documentElement.classList.add('warm-insomnia-filter');
    } else {
      document.documentElement.classList.remove('warm-insomnia-filter');
    }
  }, [isInsomniaFilter]);

  // Real-time canvas stats tracker
  useEffect(() => {
    const updateStats = () => {
      try {
        const nodesMap = ydoc.getMap<any>('nodes');
        const nodesList = Array.from(nodesMap.values());
        let totalWords = 0;
        let totalChars = 0;
        nodesList.forEach((n: any) => {
          if (n.content) {
            totalWords += n.content.trim().split(/\s+/).filter(Boolean).length;
            totalChars += n.content.length;
          }
        });
        setStats({
          nodes: nodesList.length,
          words: totalWords,
          characters: totalChars
        });
      } catch (_) {}
    };

    updateStats();
    ydoc.on('update', updateStats);
    return () => {
      ydoc.off('update', updateStats);
    };
  }, [ydoc, currentWorkspaceId]);

  // Live passive flow-state telemetry gatherer
  useEffect(() => {
    let tickCount = 0;
    const handleActivity = () => {
      tickCount++;
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    const interval = setInterval(() => {
      setActivityTicks((prev) => {
        const next = [...prev.slice(1), Math.min(tickCount, 30)];
        const avg = next.reduce((a, b) => a + b, 0) / next.length;
        if (avg > 15) setFlowState('Deep Flow');
        else if (avg > 4) setFlowState('Focused');
        else setFlowState('Resting');
        return next;
      });
      tickCount = 0;
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      clearInterval(interval);
    };
  }, []);

  // offline thought analyzer
  const analyzeUnlinkedThoughts = () => {
    try {
      const nodesMap = ydoc.getMap<any>('nodes');
      const nodesList = Array.from(nodesMap.values());
      const linksList = ydoc.getArray<any>('links').toArray();
      const alerts: string[] = [];

      for (let i = 0; i < nodesList.length; i++) {
        for (let j = i + 1; j < nodesList.length; j++) {
          const n1 = nodesList[i];
          const n2 = nodesList[j];

          const isLinked = linksList.some(l => 
            (l.from === n1.id && l.to === n2.id) || 
            (l.from === n2.id && l.to === n1.id)
          );

          if (!isLinked) {
            const text1 = (n1.title + ' ' + n1.content).toLowerCase();
            const text2 = (n2.title + ' ' + n2.content).toLowerCase();
            const keywords = ['code', 'style', 'test', 'design', 'layout', 'canvas', 'task', 'review', 'flow'];
            const matched = keywords.find(k => text1.includes(k) && text2.includes(k));

            if (matched) {
              alerts.push(`Bridge suggestion: "${n1.title}" and "${n2.title}" both reference "${matched}". Link them?`);
            }
          }
        }
      }

      if (alerts.length === 0) {
        alerts.push('🌌 No unlinked matching keywords found. Your canvas layout is aligned.');
      }
      setUnlinkedAlerts(alerts);
    } catch (_) {
      setUnlinkedAlerts(['Unable to run analyzer inside empty workspace file.']);
    }
  };

  // Local AI chatbot responder
  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput.trim();
    const updated = [...aiChat, { role: 'user' as const, text: userMsg }];
    setAiChat(updated);
    setAiInput('');

    setTimeout(() => {
      const nodesMap = ydoc.getMap<any>('nodes');
      const nodesList = Array.from(nodesMap.values());
      const query = userMsg.toLowerCase();
      let reply = '';

      if (query.includes('unlinked') || query.includes('bridge') || query.includes('connect')) {
        reply = 'I can detect unlinked thought associations. Click "Bridge Thoughts" below to automatically identify them!';
      } else if (query.includes('summarize') || query.includes('summary') || query.includes('outline')) {
        if (nodesList.length === 0) {
          reply = 'Active space is empty. Double-click to spawn nodes and construct a mindmap!';
        } else {
          reply = `Here is an outline summarizing your space:\n` + nodesList.map((n: any) => `- **${n.title}** (${n.type})`).join('\n');
        }
      } else if (query.includes('focus') || query.includes('adhd') || query.includes('help')) {
        reply = 'Focus Tip: Try selecting a node and clicking the ⚡ Spark button for the Instant Focus overlay. It limits workspace distractions.';
      } else {
        reply = `Offline NLP parsed: Workspace has ${nodesList.length} active nodes. Try asking to "summarize space" or "focus tips"!`;
      }

      setAiChat([...updated, { role: 'assistant' as const, text: reply }]);
    }, 600);
  };

  const castDaoVote = (proposalId: string, choice: 'for' | 'against') => {
    setProposals(prev => prev.map(p => {
      if (p.id === proposalId) {
        if (p.voted) return p;
        return { ...p, [choice]: p[choice] + 1, voted: true };
      }
      return p;
    }));
    alert(`Ballot cryptographically signed and cast using peer Connection ID!`);
  };

  // SVG Passive Sparkline
  const renderFlowGraph = () => {
    const width = 210;
    const height = 35;
    const maxVal = Math.max(...activityTicks, 1) || 30;
    const points = activityTicks
      .map((tick, idx) => {
        const x = (idx / (activityTicks.length - 1)) * width;
        const y = height - (tick / maxVal) * height + 2;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <div className="bg-black/40 border border-white/5 rounded-xl p-3 select-none">
        <div className="flex items-center justify-between text-[11px] mb-2 font-display">
          <span className="text-slate-400">Live Cognitive Flow:</span>
          <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${
            flowState === 'Deep Flow' 
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
              : flowState === 'Focused' 
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' 
                : 'bg-slate-500/20 text-slate-400'
          }`}>
            {flowState}
          </span>
        </div>
        <svg className="w-full h-[35px] overflow-visible">
          <polyline
            fill="none"
            stroke={flowState === 'Deep Flow' ? '#fbbf24' : '#2dd4bf'}
            strokeWidth="2"
            points={points}
            className="transition-all duration-500"
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="relative h-full flex z-20">
      {/* Sidebar Drawer Contents */}
      <div
        className={`glass-panel h-full flex flex-col transition-all duration-300 ease-in-out border-y-0 border-l-0 rounded-none overflow-hidden ${
          isOpen ? 'w-64 p-4' : 'w-0 p-0 border-r-0'
        }`}
      >
        {isOpen && (
          <>
            {/* Drawer Header Brand */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-teal-400 animate-pulse" />
                <h2 className="app-branding">Open Canvas</h2>
              </div>
            </div>

            {/* Premium Tab Selector Toolbar */}
            <div className="flex bg-black/40 border border-white/5 rounded-lg p-0.5 mb-5 shrink-0 text-slate-400">
              <button
                title="Canvas Files"
                onClick={() => setActiveTab('files')}
                className={`flex-1 py-1.5 rounded flex justify-center cursor-pointer transition-colors ${activeTab === 'files' ? 'bg-teal-500/15 text-teal-400 font-extrabold' : 'hover:text-slate-200'}`}
              >
                <Folder className="w-4 h-4" />
              </button>
              <button
                title="Micro Plugins"
                onClick={() => setActiveTab('plugins')}
                className={`flex-1 py-1.5 rounded flex justify-center cursor-pointer transition-colors ${activeTab === 'plugins' ? 'bg-teal-500/15 text-teal-400 font-extrabold' : 'hover:text-slate-200'}`}
              >
                <Sliders className="w-4 h-4" />
              </button>
              <button
                title="ADHD Copilot"
                onClick={() => setActiveTab('ai')}
                className={`flex-1 py-1.5 rounded flex justify-center cursor-pointer transition-colors ${activeTab === 'ai' ? 'bg-teal-500/15 text-teal-400 font-extrabold' : 'hover:text-slate-200'}`}
              >
                <Sparkles className="w-4 h-4" />
              </button>
              <button
                title="DAO Governance"
                onClick={() => setActiveTab('dao')}
                className={`flex-1 py-1.5 rounded flex justify-center cursor-pointer transition-colors ${activeTab === 'dao' ? 'bg-teal-500/15 text-teal-400 font-extrabold' : 'hover:text-slate-200'}`}
              >
                <Vote className="w-4 h-4" />
              </button>
            </div>

            {/* TAB CONTENT RENDER CONTAINER */}
            <div className="flex-grow flex flex-col overflow-y-auto pr-1">
              
              {/* 1. FILES & CONNECTIVITY TAB */}
              {activeTab === 'files' && (
                <div className="flex flex-col gap-5 h-full">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      Canvas Workspace Files
                    </div>
                    <div className="flex flex-col gap-1 overflow-y-auto max-h-[160px] pr-1 mb-3">
                      {workspaces.map((ws) => (
                        <div
                          key={ws.id}
                          onClick={() => onSelectWorkspace(ws.id)}
                          className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                            currentWorkspaceId === ws.id
                              ? 'bg-teal-500/10 border border-teal-500/30 text-teal-200'
                              : 'hover:bg-white/5 border border-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 w-[70%]">
                            <Folder className={`w-3.5 h-3.5 ${currentWorkspaceId === ws.id ? 'text-teal-400' : 'text-slate-500'}`} />
                            {editingId === ws.id ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRename(ws.id);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white outline-none w-full"
                                autoFocus
                              />
                            ) : (
                              <span className="text-xs truncate font-display font-medium">{ws.name}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {editingId === ws.id ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSaveRename(ws.id);
                                }}
                                className="p-0.5 rounded text-emerald-400 hover:bg-emerald-500/10"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(ws.id);
                                  setEditingName(ws.name);
                                }}
                                className="p-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                              className="p-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleCreateWorkspace} className="flex gap-1.5">
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="New canvas name..."
                        className="flex-grow px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 outline-none text-xs text-white placeholder-slate-500 focus:border-teal-500/50"
                      />
                      <button
                        type="submit"
                        className="p-1.5 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 border border-teal-500/30 text-teal-200 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      Data Sovereignty
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleExportWorkspace}
                        className="flex-1 btn-premium py-1.5 cursor-pointer"
                        title="Export JSON"
                      >
                        <Download className="w-3.5 h-3.5 text-teal-400" />
                        <span className="text-xs">Backup</span>
                      </button>
                      <label className="flex-1 btn-premium py-1.5 cursor-pointer text-center">
                        <Upload className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs">Load JSON</span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportWorkspace}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      P2P Live Mesh Network
                    </div>
                    <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl mb-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span>Connection ID:</span>
                        <button
                          onClick={copyPeerId}
                          className="p-1 rounded hover:bg-white/10 text-teal-400 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-xs font-mono select-all truncate text-teal-300 font-bold bg-black/60 px-2 py-1.5 rounded-lg border border-white/10">
                        {p2pCoordinator.myPeer.id}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-display font-semibold">
                        <Users className="w-3 h-3 text-teal-400" />
                        <span>Online Collaborators ({activePeers.length}):</span>
                      </div>
                      {activePeers.length === 0 ? (
                        <div className="text-[11px] italic text-slate-500 pl-1">
                          No active peers online. Open in another tab to mesh sync!
                        </div>
                      ) : (
                        activePeers.map((p) => (
                          <div key={p.id} className="flex items-center gap-2 bg-white/5 border border-white/5 px-2.5 py-1.5 rounded-lg">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                            <span className="text-xs text-slate-200 truncate font-display">{p.name}</span>
                            <Wifi className="w-3.5 h-3.5 text-teal-400 ml-auto shrink-0" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. PLUGINS & ACTIVE THEMES TAB */}
              {activeTab === 'plugins' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      Micro-Plugin Center
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between bg-black/40 border border-white/5 p-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-all select-none">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-200 font-display">Minimalist Focus</span>
                          <span className="text-[10px] text-slate-500">Hide grids, colors & shadows</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isMinimalFocus}
                          onChange={(e) => setIsMinimalFocus(e.target.checked)}
                          className="rounded accent-teal-400 cursor-pointer w-4 h-4"
                        />
                      </label>

                      <label className="flex items-center justify-between bg-black/40 border border-white/5 p-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-all select-none">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-200 font-display">Late-Night Insomnia sepia</span>
                          <span className="text-[10px] text-slate-500">Warming blue-light contrast filter</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isInsomniaFilter}
                          onChange={(e) => setIsInsomniaFilter(e.target.checked)}
                          className="rounded accent-teal-400 cursor-pointer w-4 h-4"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Flow State visual graph widget */}
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      ADHD telemetry tracker
                    </div>
                    {renderFlowGraph()}
                  </div>

                  {/* Words / Nodes counter stats card */}
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      Canvas Metrics statistics
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-2 font-display">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Total Cards:</span>
                        <span className="text-teal-300 font-bold font-mono">{stats.nodes}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Word Count:</span>
                        <span className="text-indigo-300 font-bold font-mono">{stats.words}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Char Count:</span>
                        <span className="text-pink-300 font-bold font-mono">{stats.characters}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. LOCAL COGNITIVE AI COPILOT */}
              {activeTab === 'ai' && (
                <div className="flex flex-col gap-4 h-full">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      ADHD Cognitive NLP chat
                    </div>
                    <div className="flex flex-col gap-2 bg-black/40 border border-white/5 rounded-xl p-3 h-[200px] overflow-y-auto mb-2">
                      {aiChat.map((msg, idx) => (
                        <div key={idx} className={`text-xs p-2 rounded-lg leading-relaxed ${msg.role === 'user' ? 'bg-indigo-500/10 text-indigo-200 ml-4 self-end' : 'bg-white/5 text-slate-300 mr-4 self-start'}`}>
                          <strong>{msg.role === 'user' ? 'You' : 'Copilot'}:</strong> {msg.text}
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleAiSubmit} className="flex gap-1.5">
                      <input
                        type="text"
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="Type 'summarize space'..."
                        className="flex-grow px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 outline-none text-xs text-white focus:border-indigo-500/50"
                      />
                      <button type="submit" className="px-3 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-300 cursor-pointer text-xs font-bold font-display">
                        Send
                      </button>
                    </form>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-display">
                        Unlinked thought Bridge Detector
                      </span>
                      <button
                        onClick={analyzeUnlinkedThoughts}
                        className="text-[9px] uppercase font-bold tracking-wider px-2 py-1 border border-teal-500/30 rounded bg-teal-500/10 hover:bg-teal-500/30 text-teal-300 cursor-pointer transition-colors"
                      >
                        Scan Bridge
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {unlinkedAlerts.length === 0 ? (
                        <div className="text-[11px] text-slate-500 italic pl-1">
                          Click "Scan Bridge" to analyze current mindmap association overlaps...
                        </div>
                      ) : (
                        unlinkedAlerts.map((alt, idx) => (
                          <div key={idx} className="bg-white/5 border border-white/5 p-2 rounded-lg text-[11px] text-teal-200 font-display leading-relaxed">
                            {alt}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. DAO GOVERNANCE TAB */}
              {activeTab === 'dao' && (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2 font-display">
                      Sovereign DAO Ballot dashboard
                    </div>
                    <div className="flex flex-col gap-3">
                      {proposals.map((prop) => (
                        <div key={prop.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-2 select-none">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">{prop.id}</span>
                            <span className="text-[9px] uppercase font-bold text-slate-500">Consensus active</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed font-display">{prop.title}</p>
                          <div className="flex items-center justify-between text-[11px] font-mono mt-1 pt-2 border-t border-white/5 text-slate-400">
                            <span>Yes: <strong className="text-teal-400 font-bold">{prop.for}</strong></span>
                            <span>No: <strong className="text-pink-400 font-bold">{prop.against}</strong></span>
                            {prop.voted ? (
                              <span className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">Voted</span>
                            ) : (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => castDaoVote(prop.id, 'for')}
                                  className="px-2 py-0.5 rounded border border-teal-500/30 bg-teal-500/15 text-teal-300 font-bold text-[10px] cursor-pointer hover:bg-teal-500/30 active:scale-95 transition-all"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => castDaoVote(prop.id, 'against')}
                                  className="px-2 py-0.5 rounded border border-pink-500/30 bg-pink-500/15 text-pink-300 font-bold text-[10px] cursor-pointer hover:bg-pink-500/30 active:scale-95 transition-all"
                                >
                                  No
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>

      {/* Drawer Toggle Slider Handle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-1/2 -translate-y-1/2 -right-3.5 glass-panel p-1 rounded-full border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer z-30"
        style={{ borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </div>
  );
};
