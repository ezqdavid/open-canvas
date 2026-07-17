import { useState, useEffect } from 'react';
import { Link2, Trash2, Zap, Play, FileText, Image, CheckSquare, Layers, Plus, Code, Timer, Copy, Check } from 'lucide-react';
import { type CanvasNode } from './Canvas';
import * as Y from 'yjs';

interface NodeComponentProps {
  nodeId: string;
  ydoc: Y.Doc;
  isLinking: boolean;
  isLinkOrigin: boolean;
  onHeaderAction: (action: 'link' | 'delete') => void;
  onInstantFocus: () => void;
  onEnterSubCanvas?: () => void;
}

// Sub-component: LocalCardTimer
// Keeps second-by-second ticks localized inside the card state, preventing Yjs network sync flutters.
const LocalCardTimer: React.FC<{ node: CanvasNode; updateNodeData: (fields: Partial<Omit<CanvasNode, 'id'>>) => void }> = ({ node, updateNodeData }) => {
  const timerLeft = node.widgetData?.timerLeft ?? 1500;
  const timerActive = node.widgetData?.timerActive ?? false;

  useEffect(() => {
    let interval: any = null;
    if (timerActive && timerLeft > 0) {
      interval = setInterval(() => {
        updateNodeData({
          widgetData: {
            ...node.widgetData!,
            timerLeft: timerLeft - 1
          }
        });
      }, 1000);
    } else if (timerLeft === 0 && timerActive) {
      // Audio synth ping
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch (_) {}
      
      updateNodeData({
        widgetData: {
          ...node.widgetData!,
          timerActive: false
        }
      });
    }
    return () => clearInterval(interval);
  }, [timerActive, timerLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col items-center justify-center p-2 text-center h-full gap-2 select-none">
      <div className="text-4xl font-mono font-extrabold tracking-widest text-indigo-400 select-all animate-pulse">
        {formatTime(timerLeft)}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => updateNodeData({
            widgetData: {
              ...node.widgetData!,
              timerActive: !timerActive
            }
          })}
          className="px-4 py-1.5 border border-indigo-500/40 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95"
        >
          {timerActive ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => updateNodeData({
            widgetData: {
              ...node.widgetData!,
              timerLeft: 1500,
              timerActive: false
            }
          })}
          className="px-3 py-1.5 border border-white/10 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all active:scale-95"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export const NodeComponent: React.FC<NodeComponentProps> = ({
  nodeId,
  ydoc,
  isLinking: _isLinking,
  isLinkOrigin,
  onHeaderAction,
  onInstantFocus,
  onEnterSubCanvas
}) => {
  const [node, setNode] = useState<CanvasNode | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newCardText, setNewCardText] = useState('');
  const [copied, setCopied] = useState(false);

  // Decoupled deep Yjs data observer
  useEffect(() => {
    const yNodes = ydoc.getMap<any>('nodes');
    const nodeMap = yNodes.get(nodeId);

    const updateLocalNode = () => {
      const raw = yNodes.get(nodeId);
      if (raw) {
        const val = raw instanceof Y.Map ? raw.toJSON() : raw;
        setNode({ id: nodeId, ...val });
      } else {
        setNode(null);
      }
    };

    updateLocalNode();

    const handleMapChange = () => {
      updateLocalNode();
    };

    if (nodeMap instanceof Y.Map) {
      nodeMap.observe(handleMapChange);
    }

    const handleGlobalChange = (event: Y.YMapEvent<any>) => {
      if (event.keysChanged.has(nodeId)) {
        updateLocalNode();
      }
    };
    yNodes.observe(handleGlobalChange);

    return () => {
      if (nodeMap instanceof Y.Map) {
        nodeMap.unobserve(handleMapChange);
      }
      yNodes.unobserve(handleGlobalChange);
    };
  }, [ydoc, nodeId]);

  if (!node) return null;

  // Save changes directly back into Yjs nodes Map
  const updateNodeData = (fields: Partial<Omit<CanvasNode, 'id'>>) => {
    const yNodes = ydoc.getMap<any>('nodes');
    const nodeMap = yNodes.get(node.id);
    if (nodeMap instanceof Y.Map) {
      ydoc.transact(() => {
        Object.entries(fields).forEach(([k, v]) => {
          nodeMap.set(k, v);
        });
      });
    } else if (nodeMap) {
      yNodes.set(node.id, {
        ...nodeMap,
        ...fields
      });
    }
  };

  // Simple Regex-based Syntax Highlighter for Javascript/Rust/HTML/CSS
  const renderCodeHighlights = (code: string) => {
    if (!code) return <span className="text-slate-500 italic font-mono">// Double-click to write code...</span>;

    const keywords = /\b(const|let|var|function|return|import|export|from|default|class|extends|if|else|for|while|new|async|await|try|catch|pub|fn|use|struct|impl|let|mut)\b/g;
    const strings = /(["'`])(.*?)\1/g;
    const numbers = /\b(\d+)\b/g;
    const comments = /(\/\/.*|\/\*[\s\S]*?\*\/)/g;
    const methods = /\b([a-zA-Z_]\w*)\s*(?=\()/g;

    let highlighted = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    highlighted = highlighted.replace(comments, '<span class="text-emerald-500">$1</span>');
    highlighted = highlighted.replace(strings, '<span class="text-amber-300">$1$2$1</span>');
    highlighted = highlighted.replace(keywords, '<span class="text-rose-400 font-bold">$1</span>');
    highlighted = highlighted.replace(methods, '<span class="text-blue-400">$1</span>');
    highlighted = highlighted.replace(numbers, '<span class="text-orange-400">$1</span>');

    return (
      <pre 
        className="font-mono text-xs p-3 bg-black/50 border border-white/5 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed select-text"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    );
  };

  // HTML5 Drag and Drop Handlers for Kanban Cards
  const handleDragStart = (e: React.DragEvent, cardText: string, sourceCol: string) => {
    e.dataTransfer.setData('text/plain', cardText);
    e.dataTransfer.setData('source-column', sourceCol);
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Clean CRDT-based Drop logic using nested Yjs Arrays
  const handleDrop = (e: React.DragEvent, targetCol: 'todo' | 'progress' | 'done') => {
    e.preventDefault();
    e.stopPropagation();
    
    const cardText = e.dataTransfer.getData('text/plain');
    const sourceCol = e.dataTransfer.getData('source-column') as 'todo' | 'progress' | 'done';

    if (!cardText || sourceCol === targetCol) return;

    const yNodes = ydoc.getMap<any>('nodes');
    const nodeMap = yNodes.get(node.id);
    if (nodeMap instanceof Y.Map) {
      const kanbanMap = nodeMap.get('kanbanData');
      if (kanbanMap instanceof Y.Map) {
        const sourceArray = kanbanMap.get(sourceCol);
        const targetArray = kanbanMap.get(targetCol);

        if (sourceArray instanceof Y.Array && targetArray instanceof Y.Array) {
          ydoc.transact(() => {
            const items = sourceArray.toArray();
            const idx = items.indexOf(cardText);
            if (idx !== -1) {
              sourceArray.delete(idx, 1);
            }
            targetArray.push([cardText]);
          });
          return;
        }
      }
    }

    // Fallback for legacy plain objects
    if (!node.kanbanData) return;
    const updatedTodo = [...(node.kanbanData.todo || [])];
    const updatedProgress = [...(node.kanbanData.progress || [])];
    const updatedDone = [...(node.kanbanData.done || [])];

    if (sourceCol === 'todo') {
      const idx = updatedTodo.indexOf(cardText);
      if (idx !== -1) updatedTodo.splice(idx, 1);
    } else if (sourceCol === 'progress') {
      const idx = updatedProgress.indexOf(cardText);
      if (idx !== -1) updatedProgress.splice(idx, 1);
    } else if (sourceCol === 'done') {
      const idx = updatedDone.indexOf(cardText);
      if (idx !== -1) updatedDone.splice(idx, 1);
    }

    if (targetCol === 'todo') updatedTodo.push(cardText);
    else if (targetCol === 'progress') updatedProgress.push(cardText);
    else if (targetCol === 'done') updatedDone.push(cardText);

    updateNodeData({
      kanbanData: {
        todo: updatedTodo,
        progress: updatedProgress,
        done: updatedDone
      }
    });
  };

  // Clean CRDT-based Card Insertion using Yjs array pushes
  const addKanbanCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardText.trim()) return;

    const yNodes = ydoc.getMap<any>('nodes');
    const nodeMap = yNodes.get(node.id);
    if (nodeMap instanceof Y.Map) {
      const kanbanMap = nodeMap.get('kanbanData');
      if (kanbanMap instanceof Y.Map) {
        const todoArray = kanbanMap.get('todo');
        if (todoArray instanceof Y.Array) {
          todoArray.push([newCardText.trim()]);
          setNewCardText('');
          return;
        }
      }
    }

    // Fallback for legacy plain objects
    if (!node.kanbanData) return;
    const updatedTodo = [...(node.kanbanData.todo || []), newCardText.trim()];
    updateNodeData({
      kanbanData: {
        ...node.kanbanData,
        todo: updatedTodo
      }
    });
    setNewCardText('');
  };

  // Format simple markdown shortcuts for rendering
  const renderFormattedMarkdown = (text: string) => {
    if (!text) return <p className="italic text-slate-500">Double click to write...</p>;
    
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} className="ml-4 list-disc text-secondary my-1">{line.substring(2)}</li>;
      }
      if (line.startsWith('### ')) {
        return <h4 key={idx} className="text-sm font-bold text-primary mt-3 mb-1 font-display">{line.substring(4)}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={idx} className="text-base font-bold text-primary mt-4 mb-1 font-display">{line.substring(3)}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={idx} className="text-lg font-bold text-primary mt-4 mb-2 font-display">{line.substring(2)}</h2>;
      }
      return <p key={idx} className="my-1.5 text-secondary leading-relaxed break-words">{line}</p>;
    });
  };

  return (
    <>
      {/* Node Header */}
      <div className="node-header handle-drag select-none">
        <div className="flex items-center gap-1.5 w-full">
          {node.type === 'text' && <FileText className="w-4 h-4 text-teal-400" />}
          {node.type === 'kanban' && <CheckSquare className="w-4 h-4 text-purple-400" />}
          {node.type === 'media' && <Play className="w-4 h-4 text-pink-400" />}
          {node.type === 'nested' && <Layers className="w-4 h-4 text-indigo-400" />}
          {node.type === 'code' && <Code className="w-4 h-4 text-amber-400" />}
          {node.type === 'widget' && <Timer className="w-4 h-4 text-indigo-400" />}

          <input
            type="text"
            value={node.title}
            onChange={(e) => updateNodeData({ title: e.target.value })}
            className="node-title-input"
            placeholder="Untitled Jotting"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>

        {/* Action Controls in MD3 shapes */}
        <div className="flex items-center gap-1">
          <button
            title="Instant Focus"
            onClick={(e) => {
              e.stopPropagation();
              onInstantFocus();
            }}
            className="p-1 rounded-full hover:bg-white/10 text-teal-400/80 hover:text-teal-400 transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4" />
          </button>

          <button
            title="Create Link"
            onClick={(e) => {
              e.stopPropagation();
              onHeaderAction('link');
            }}
            className={`p-1 rounded-full hover:bg-white/10 text-secondary hover:text-purple-400 transition-colors cursor-pointer ${
              isLinkOrigin ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' : ''
            }`}
          >
            <Link2 className="w-4 h-4" />
          </button>

          <button
            title="Delete block"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this block?')) {
                onHeaderAction('delete');
              }
            }}
            className="p-1 rounded-full hover:bg-rose-500/20 text-secondary hover:text-rose-400 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Node Content area */}
      <div
        className="node-content flex flex-col h-full overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (node.type === 'text' || node.type === 'code') setIsEditing(true);
        }}
      >
        {/* TEXT / JOT NODE TYPE */}
        {node.type === 'text' && (
          <div className="flex-grow w-full h-full min-h-[100px]">
            {isEditing ? (
              <textarea
                value={node.content}
                onChange={(e) => updateNodeData({ content: e.target.value })}
                onBlur={() => setIsEditing(false)}
                className="node-textarea font-sans"
                placeholder="Write your notes here... (Markdown supported)"
                autoFocus
              />
            ) : (
              <div className="cursor-text select-text" onClick={() => setIsEditing(true)}>
                {renderFormattedMarkdown(node.content)}
              </div>
            )}
          </div>
        )}

        {/* CODE SNIPPET NODE TYPE */}
        {node.type === 'code' && (
          <div className="flex-grow w-full h-full min-h-[120px] relative group/code font-mono">
            {!isEditing && node.content && (
              <button
                title="Copy Code"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(node.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 border border-white/10 text-secondary hover:text-amber-400 hover:border-amber-400/30 transition-all z-10 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
            {isEditing ? (
              <textarea
                value={node.content}
                onChange={(e) => updateNodeData({ content: e.target.value })}
                onBlur={() => setIsEditing(false)}
                className="node-textarea font-mono text-xs bg-black/40 border border-white/5 p-3 rounded-xl focus:border-amber-500/50 outline-none"
                placeholder="// Double-click to write code... (Javascript/Rust/HTML/CSS supported)"
                autoFocus
              />
            ) : (
              <div className="cursor-text select-text" onClick={() => setIsEditing(true)}>
                {renderCodeHighlights(node.content)}
              </div>
            )}
          </div>
        )}

        {/* KANBAN BOARD NODE TYPE */}
        {node.type === 'kanban' && node.kanbanData && (
          <div className="flex flex-col gap-3 h-full">
            <div className="kanban-board flex-grow">
              {/* To-Do Column */}
              <div
                className="kanban-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'todo')}
              >
                <div className="kanban-col-title text-teal-400">To do</div>
                {(node.kanbanData.todo || []).map((card, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card, 'todo')}
                    className="kanban-card"
                  >
                    {card}
                  </div>
                ))}
              </div>

              {/* Progress Column */}
              <div
                className="kanban-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'progress')}
              >
                <div className="kanban-col-title text-purple-400">Doing</div>
                {(node.kanbanData.progress || []).map((card, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card, 'progress')}
                    className="kanban-card"
                  >
                    {card}
                  </div>
                ))}
              </div>

              {/* Done Column */}
              <div
                className="kanban-col"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'done')}
              >
                <div className="kanban-col-title text-pink-400">Done</div>
                {(node.kanbanData.done || []).map((card, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card, 'done')}
                    className="kanban-card line-through opacity-60"
                  >
                    {card}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Card Insertion Form */}
            <form onSubmit={addKanbanCard} className="flex gap-1.5 mt-auto">
              <input
                type="text"
                value={newCardText}
                onChange={(e) => setNewCardText(e.target.value)}
                placeholder="Add card to To Do..."
                className="flex-grow px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 outline-none text-xs text-primary placeholder-muted focus:border-purple-500/50 transition-all"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* NESTED MAP INDICATOR PORTAL */}
        {node.type === 'nested' && (
          <div className="flex flex-col items-center justify-center p-4 text-center h-full gap-2">
            <Layers className="w-12 h-12 text-indigo-400 opacity-60 animate-bounce" style={{ animationDuration: '4s' }} />
            <div className="text-sm font-semibold text-primary font-display">Sub-canvas map portal</div>
            <p className="text-xs text-secondary leading-relaxed max-w-[200px]">
              Contains hierarchical nested nodes. Double-click inside to open sub-dimension map folder.
            </p>
            <button
              onClick={() => {
                if (onEnterSubCanvas) onEnterSubCanvas();
              }}
              className="mt-2 text-[11px] font-bold text-indigo-400 uppercase tracking-widest border border-indigo-500/30 rounded px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/30 hover:border-indigo-500 transition-all cursor-pointer"
            >
              Enter Sub-Canvas
            </button>
          </div>
        )}

        {/* WIDGET NODE TYPE */}
        {node.type === 'widget' && node.widgetData && (
          <div className="flex flex-col h-full gap-2.5">
            {/* Widget Tab Selector */}
            <div className="flex bg-black/30 border border-white/5 rounded-lg p-0.5 text-[10px] uppercase font-bold tracking-wider">
              {(['checklist', 'poll', 'timer'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => updateNodeData({
                    widgetData: {
                      ...node.widgetData!,
                      type: tab
                    }
                  })}
                  className={`flex-1 py-1 rounded text-center cursor-pointer transition-all ${
                    node.widgetData!.type === tab 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-extrabold font-display' 
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Render Tab Contents */}
            <div className="flex-grow flex flex-col justify-between overflow-y-auto min-h-[120px]">
              {/* A. CHECKLIST TAB */}
              {node.widgetData.type === 'checklist' && (
                <div className="flex flex-col gap-2 h-full justify-between">
                  <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[110px] pr-1">
                    {(node.widgetData.checklist || []).map((item, idx) => (
                      <label 
                        key={idx} 
                        className="flex items-start gap-2 text-xs text-secondary hover:text-primary cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(e) => {
                            const updated = [...(node.widgetData!.checklist || [])];
                            updated[idx] = { ...updated[idx], checked: e.target.checked };
                            updateNodeData({
                              widgetData: {
                               ...node.widgetData!,
                                checklist: updated
                              }
                            });
                          }}
                          className="mt-0.5 rounded accent-indigo-500 cursor-pointer"
                        />
                        <span className={item.checked ? 'line-through text-muted' : ''}>
                          {item.text}
                        </span>
                      </label>
                    ))}
                  </div>
                  
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.target as HTMLFormElement).elements.namedItem('chkInput') as HTMLInputElement;
                      if (!input.value.trim()) return;
                      const updated = [...(node.widgetData!.checklist || []), { text: input.value.trim(), checked: false }];
                      updateNodeData({
                        widgetData: {
                          ...node.widgetData!,
                          checklist: updated
                        }
                      });
                      input.value = '';
                    }}
                    className="flex gap-1.5 mt-auto"
                  >
                    <input
                      name="chkInput"
                      type="text"
                      placeholder="New task item..."
                      className="flex-grow px-2 py-1 rounded bg-black/40 border border-white/5 outline-none text-[11px] text-primary placeholder-muted focus:border-indigo-500/50"
                    />
                    <button type="submit" className="p-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-300 cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* B. POLL TAB */}
              {node.widgetData.type === 'poll' && (
                <div className="flex flex-col gap-2 h-full justify-between">
                  <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[110px] pr-1">
                    {(node.widgetData.poll || []).map((opt, idx) => {
                      const totalVotes = (node.widgetData!.poll || []).reduce((acc, o) => acc + o.votes, 0) || 1;
                      const percentage = Math.round((opt.votes / totalVotes) * 100);
                      return (
                        <div 
                          key={idx} 
                          onClick={() => {
                            const updated = [...(node.widgetData!.poll || [])];
                            updated[idx] = { ...updated[idx], votes: updated[idx].votes + 1 };
                            updateNodeData({
                              widgetData: {
                                ...node.widgetData!,
                                poll: updated
                              }
                            });
                          }}
                          className="relative bg-black/40 border border-white/5 hover:border-indigo-500/40 p-1.5 rounded-lg cursor-pointer overflow-hidden transition-all flex items-center justify-between group"
                        >
                          <div 
                            className="absolute left-0 top-0 bottom-0 bg-indigo-500/15 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                          <span className="text-[11px] text-secondary z-10 font-medium group-hover:text-indigo-300 transition-colors pl-1">
                            {opt.option}
                          </span>
                          <span className="text-[10px] text-muted font-mono font-bold z-10 pr-1">
                            {opt.votes} ({percentage}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.target as HTMLFormElement).elements.namedItem('pollInput') as HTMLInputElement;
                      if (!input.value.trim()) return;
                      const updated = [...(node.widgetData!.poll || []), { option: input.value.trim(), votes: 0 }];
                      updateNodeData({
                        widgetData: {
                          ...node.widgetData!,
                          poll: updated
                        }
                      });
                      input.value = '';
                    }}
                    className="flex gap-1.5 mt-auto"
                  >
                    <input
                      name="pollInput"
                      type="text"
                      placeholder="New poll option..."
                      className="flex-grow px-2 py-1 rounded bg-black/40 border border-white/5 outline-none text-[11px] text-primary placeholder-muted focus:border-indigo-500/50"
                    />
                    <button type="submit" className="p-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-300 cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* C. ON-CARD TIMER TAB */}
              {node.widgetData.type === 'timer' && (
                <div className="h-full flex flex-col justify-center">
                  <LocalCardTimer node={node} updateNodeData={updateNodeData} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* MEDIA EMBED NODE TYPE */}
        {node.type === 'media' && (
          <div className="flex flex-col h-full gap-2 justify-center">
            {node.content ? (
              <div className="rounded-lg overflow-hidden border border-white/5 bg-black/20 flex-grow flex items-center justify-center">
                {node.content.match(/\.(jpeg|jpg|gif|png|webp)/i) ? (
                  <img
                    src={node.content}
                    alt="Media Node Anchor"
                    className="max-h-[140px] w-full object-cover select-none"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <video
                    src={node.content}
                    controls
                    className="w-full max-h-[140px] object-contain"
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 text-center gap-2">
                <Image className="w-8 h-8 text-pink-400 opacity-50" />
                <div className="text-[11px] text-muted">Embed local video/image URL below:</div>
                <input
                  type="text"
                  placeholder="https://images.unsplash.com/photo-... or video.mp4"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateNodeData({ content: (e.target as HTMLInputElement).value });
                    }
                  }}
                  className="w-full px-2 py-1 bg-black/40 border border-white/10 rounded text-[11px] text-secondary outline-none focus:border-pink-500/50"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
