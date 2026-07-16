import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, X, Sparkles, Music } from 'lucide-react';
import { type CanvasNode } from './Canvas';
import { NodeComponent } from './NodeComponent';
import * as Y from 'yjs';

interface ZenFocusOverlayProps {
  node: CanvasNode;
  ydoc: Y.Doc;
  onExit: () => void;
}

type BackdropTheme = 'aurora' | 'cosmic' | 'void';
type SoundType = 'off' | 'brown' | 'rain' | 'lofi';

export const ZenFocusOverlay: React.FC<ZenFocusOverlayProps> = ({
  node,
  ydoc,
  onExit
}) => {
  const [theme, setTheme] = useState<BackdropTheme>('aurora');
  const [sound, setSound] = useState<SoundType>('off');
  const [volume, setVolume] = useState(0.5);
  
  // Pomodoro Timer state
  const [timerLeft, setTimerLeft] = useState(25 * 60);
  const [timerActive, setTimerActive] = useState(false);
  
  // Web Audio Context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<any>(null); // holds buffer source or synth nodes
  const lofiIntervalRef = useRef<any>(null); // handles chord sequence trigger

  // Format timer text
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Pomodoro Timer countdown ticker
  useEffect(() => {
    let interval: any = null;
    if (timerActive && timerLeft > 0) {
      interval = setInterval(() => {
        setTimerLeft(prev => prev - 1);
      }, 1000);
    } else if (timerLeft === 0) {
      setTimerActive(false);
      // Play a gentle local synthesized bell sound when countdown hits zero
      playFocusBell();
    }
    return () => clearInterval(interval);
  }, [timerActive, timerLeft]);

  // Audio state watcher: triggers sound synthesis when sound type or volume is updated
  useEffect(() => {
    if (sound === 'off') {
      stopAllSounds();
    } else {
      startSound(sound);
    }
    return () => stopAllSounds();
  }, [sound]);

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.linearRampToValueAtTime(volume, audioCtxRef.current.currentTime + 0.1);
    }
  }, [volume]);

  // Synthesize soft bell chime
  const playFocusBell = () => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 chime
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.05); // harmonic sparkle
      osc.frequency.exponentialRampToValueAtTime(587.33, ctx.currentTime + 0.2);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5); // long sustain decay
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 2.6);
    } catch (err) {
      console.warn('Audio Bell failed', err);
    }
  };

  // Web Audio Synthesis Core Engines
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      gainNodeRef.current = audioCtxRef.current.createGain();
      gainNodeRef.current.gain.setValueAtTime(volume, audioCtxRef.current.currentTime);
      gainNodeRef.current.connect(audioCtxRef.current.destination);
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const startSound = (type: SoundType) => {
    try {
      initAudio();
      stopAllSounds(); // Ensure previous generators are fully closed
      const ctx = audioCtxRef.current!;
      const mainGain = gainNodeRef.current!;

      if (type === 'brown') {
        // Synthesize Organic Brown Noise
        const bufferSize = 10 * ctx.sampleRate; // 10 seconds of looping noise
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          // Apply lowpass/integration filter for a brown spectral density
          output[i] = (lastOut + (0.025 * white)) / 1.025;
          lastOut = output[i];
          output[i] *= 3.8; // Compensate gain loss
        }

        const bufferSource = ctx.createBufferSource();
        bufferSource.buffer = noiseBuffer;
        bufferSource.loop = true;
        bufferSource.connect(mainGain);
        bufferSource.start();
        sourceNodeRef.current = bufferSource;

      } else if (type === 'rain') {
        // Synthesize Rain Shower
        // 1. Base falling drops (pink-filtered white noise)
        const bufferSize = 4 * ctx.sampleRate;
        const rainBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = rainBuffer.getChannelData(0);
        
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          // Pink noise filter coefficients (flicker noise spectral slope)
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          output[i] *= 0.11; // gain adjustment
          b6 = white * 0.115926;
        }

        const rainSource = ctx.createBufferSource();
        rainSource.buffer = rainBuffer;
        rainSource.loop = true;

        // 2. High-frequency filter for hissiness of rain
        const rainFilter = ctx.createBiquadFilter();
        rainFilter.type = 'bandpass';
        rainFilter.frequency.value = 1200;
        rainFilter.Q.value = 0.6;

        rainSource.connect(rainFilter);
        rainFilter.connect(mainGain);
        rainSource.start();
        sourceNodeRef.current = rainSource;

      } else if (type === 'lofi') {
        // Synthesize Chill Lofi Synthesizer Chords
        // Plays detuned analog lofi chord swells dynamically
        const chordProgressions = [
          [261.63, 329.63, 392.00, 493.88], // Cmaj7 (C4, E4, G4, B4)
          [349.23, 440.00, 523.25, 659.25], // Fmaj7 (F4, A4, C5, E5)
          [293.66, 349.23, 440.00, 587.33], // Dmin7 (D4, F4, A4, D5)
          [329.63, 392.00, 493.88, 587.33]  // Emin7 (E4, G4, B4, D5)
        ];

        let progIndex = 0;
        const playChord = () => {
          const freqs = chordProgressions[progIndex];
          progIndex = (progIndex + 1) % chordProgressions.length;

          // Detuned analog swell
          const activeSwells: any[] = [];
          freqs.forEach((freq) => {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            // Dual detuned oscillators (creates rich analog lofi width)
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(freq - 1.2, ctx.currentTime);
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(freq + 1.2, ctx.currentTime);

            // Vintage lofi bandpass filter modulation
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(100, ctx.currentTime);
            filter.frequency.linearRampToValueAtTime(650, ctx.currentTime + 2.0); // slow opening sweep
            filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 5.5); // long decay closure

            // Swell envelope (slow attack, long decay)
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1.8);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 5.8);

            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
            gain.connect(mainGain);

            osc1.start();
            osc2.start();
            osc1.stop(ctx.currentTime + 6.0);
            osc2.stop(ctx.currentTime + 6.0);

            activeSwells.push({ osc1, osc2 });
          });
        };

        // Play initial chord and trigger loop every 6 seconds
        playChord();
        lofiIntervalRef.current = setInterval(playChord, 6200);
      }
    } catch (err) {
      console.error('Web Audio Playback failed:', err);
    }
  };

  // Close and stop all audio context sources
  const stopAllSounds = () => {
    if (lofiIntervalRef.current) {
      clearInterval(lofiIntervalRef.current);
      lofiIntervalRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      sourceNodeRef.current = null;
    }
  };

  return (
    <div className={`fixed inset-0 w-screen h-screen z-50 flex items-center justify-center p-8 transition-all duration-700 select-none zen-backdrop-${theme}`}>
      
      {/* Background Soft Breathing Focus Orbs (breathing animation visual feedback) */}
      <div
        className="ambient-pulser absolute"
        style={{
          width: '500px',
          height: '500px',
          left: '15%',
          top: '10%',
          background: theme === 'void' ? 'transparent' : 'radial-gradient(circle, var(--accent-teal) 0%, transparent 70%)',
          animationDuration: '10s'
        }}
      />
      <div
        className="ambient-pulser absolute"
        style={{
          width: '600px',
          height: '600px',
          right: '10%',
          bottom: '10%',
          background: theme === 'void' ? 'transparent' : 'radial-gradient(circle, var(--accent-purple) 0%, transparent 70%)',
          animationDuration: '14s'
        }}
      />

      {/* Exit Button */}
      <button
        onClick={() => {
          stopAllSounds();
          onExit();
        }}
        className="absolute top-6 right-6 p-2 rounded-full glass-panel text-slate-400 hover:text-white hover:border-teal-500/40 hover:shadow-[0_0_12px_var(--accent-teal-glow)] transition-all cursor-pointer z-50"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Floating Zen Controls Widget (themes, soundscapes, volume) */}
      <div className="absolute top-6 left-6 glass-panel p-3 flex items-center gap-4 z-40">
        {/* Theme select buttons */}
        <div className="flex items-center gap-1 border-r border-white/10 pr-4">
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-display mr-2">Theme:</span>
          <button
            onClick={() => setTheme('aurora')}
            className={`px-2.5 py-1 rounded text-xs font-display font-medium transition-all ${
              theme === 'aurora' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            Aurora
          </button>
          <button
            onClick={() => setTheme('cosmic')}
            className={`px-2.5 py-1 rounded text-xs font-display font-medium transition-all ${
              theme === 'cosmic' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            Cosmic
          </button>
          <button
            onClick={() => setTheme('void')}
            className={`px-2.5 py-1 rounded text-xs font-display font-medium transition-all ${
              theme === 'void' ? 'bg-white/10 text-white border border-white/25' : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            Void
          </button>
        </div>

        {/* ADHD Audio Synthesizer Controls */}
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-teal-400" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-display mr-1">ADHD Audio:</span>
          
          <div className="flex bg-black/30 border border-white/5 p-0.5 rounded-lg">
            {(['off', 'brown', 'rain', 'lofi'] as SoundType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSound(type)}
                className={`px-2 py-1 rounded-md text-xs font-display font-medium capitalize transition-all ${
                  sound === type
                    ? 'bg-teal-500/25 text-teal-300 border border-teal-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {type === 'off' ? 'Mute' : type}
              </button>
            ))}
          </div>

          {/* Volume Slider */}
          {sound !== 'off' && (
            <div className="flex items-center gap-2 pl-2">
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-teal-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Isolated Editor on the Left, Pomodoro Timer on the Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-5xl z-10 fade-in h-[75vh]">
        {/* Left Side: Consolidated Distraction-Free Editor */}
        <div className="lg:col-span-2 flex flex-col h-full bg-slate-950/40 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <NodeComponent
            node={node}
            ydoc={ydoc}
            isLinking={false}
            isLinkOrigin={false}
            onHeaderAction={() => {}} // disable linkage / deletion during isolated focus
            onInstantFocus={() => {}}
          />
        </div>

        {/* Right Side: Pomodoro Timer & ADHD Breathing Aid */}
        <div className="flex flex-col gap-6 h-full justify-between">
          
          {/* Pomodoro Timer Container */}
          <div className="glass-panel p-6 flex flex-col items-center justify-center text-center flex-grow">
            <h3 className="text-xs uppercase font-bold tracking-widest text-teal-400 mb-6 font-display">Focus Session</h3>
            
            {/* Countdown text with customized glow */}
            <div className="text-6xl font-extrabold font-mono text-white mb-6 select-all drop-shadow-[0_0_15px_hsla(172,90%,45%,0.3)]">
              {formatTime(timerLeft)}
            </div>

            {/* Timers controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTimerActive(!timerActive)}
                className={`p-3 rounded-full border transition-all ${
                  timerActive
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-teal-500/20 border-teal-500/40 text-teal-300 shadow-lg shadow-teal-500/10 hover:shadow-teal-500/25'
                }`}
              >
                {timerActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                onClick={() => {
                  setTimerActive(false);
                  setTimerLeft(25 * 60);
                }}
                className="p-3 rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/15 transition-all"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            {/* Quick minute intervals buttons */}
            <div className="flex items-center gap-1.5 mt-8">
              {[5, 15, 25, 45].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    setTimerActive(false);
                    setTimerLeft(mins * 60);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-white/5 bg-black/40 text-[10px] font-bold text-slate-400 hover:text-white hover:border-teal-500/30 transition-all font-display"
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Calming ADHD Breathing Sync Card */}
          <div className="glass-panel p-6 flex flex-col items-center justify-center text-center">
            <h3 className="text-xs uppercase font-bold tracking-widest text-purple-400 mb-4 font-display">Pace Your Breath</h3>
            
            {/* Visual breathing guide orb */}
            <div className="relative w-24 h-24 flex items-center justify-center">
              {/* Expansion outer glow breathing aid */}
              <div className="absolute inset-0 rounded-full border border-purple-500/30 bg-purple-500/10 animate-ping" style={{ animationDuration: '4s' }} />
              {/* Inner glowing core that grows with a breathing cycle */}
              <div
                className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-bold text-[10px] font-display uppercase tracking-widest text-purple-100 shadow-[0_0_20px_var(--accent-purple-glow)]"
                style={{
                  animation: 'pulse 4s infinite ease-in-out'
                }}
              >
                Focus
              </div>
            </div>
            
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-4 font-display">Inhale ... Exhale ...</span>
          </div>

        </div>
      </div>

      {/* Ambient Sparkle Dust overlaying focus container */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] text-slate-500 font-display z-15 select-none pointer-events-none">
        <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-spin" style={{ animationDuration: '6s' }} />
        <span>You are inside your Zen Focus Space. Extraneous noises have been synthesized out.</span>
      </div>

    </div>
  );
};
