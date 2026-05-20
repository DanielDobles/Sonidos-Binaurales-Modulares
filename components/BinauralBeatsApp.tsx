'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface WavePreset { id: string; name: string; range: string; beatFreq: number; carrierFreq: number; icon: React.ReactNode; }

export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180);
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10);
  const [activePreset, setActivePreset] = useState<string>('alpha');
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);

  const presets: WavePreset[] = [
    { id: 'delta', name: 'Delta', range: '1-4Hz', beatFreq: 2.5, carrierFreq: 120, icon: <Moon className="w-4 h-4" /> },
    { id: 'theta', name: 'Theta', range: '4-8Hz', beatFreq: 6.0, carrierFreq: 150, icon: <Sparkles className="w-4 h-4" /> },
    { id: 'alpha', name: 'Alpha', range: '8-12Hz', beatFreq: 10.0, carrierFreq: 180, icon: <Compass className="w-4 h-4" /> },
    { id: 'beta', name: 'Beta', range: '12-30Hz', beatFreq: 18.0, carrierFreq: 220, icon: <Zap className="w-4 h-4" /> },
    { id: 'gamma', name: 'Gamma', range: '30-45Hz', beatFreq: 38.0, carrierFreq: 260, icon: <Brain className="w-4 h-4" /> },
  ];

  // Dynamic Spectrum Coupling: Low (100Hz) -> Red (0) | High (350Hz) -> Violet (280)
  const carrierRatio = Math.max(0, Math.min(1, (carrierFreq - 100) / 250));
  const baseHue = carrierRatio * 280;

  const updateFrequencies = useCallback((base: number, beat: number) => {
    if (!audioCtxRef.current || !isPlaying) return;
    const now = audioCtxRef.current.currentTime;
    oscLeftRef.current?.frequency.setTargetAtTime(base, now, 1.2);
    oscRightRef.current?.frequency.setTargetAtTime(base + beat, now, 1.2);
  }, [isPlaying]);

  const loadPreset = (p: WavePreset) => {
    setCarrierFreq(p.carrierFreq);
    setBinauralBeatFreq(p.beatFreq);
    setActivePreset(p.id);
    updateFrequencies(p.carrierFreq, p.beatFreq);
  };

  const runSoundEngine = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    if (isPlaying) {
      oscLeftRef.current?.stop();
      oscRightRef.current?.stop();
      if (lfoRef.current) { try { lfoRef.current.stop(); lfoRef.current.disconnect(); } catch(e){} lfoRef.current = null; }
      if (lfoGainRef.current) { lfoGainRef.current.disconnect(); lfoGainRef.current = null; }
      setIsPlaying(false);
    } else {
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const [oL, oR] = [ctx.createOscillator(), ctx.createOscillator()];
      const aL = ctx.createAnalyser();
      const [pL, pR] = [ctx.createStereoPanner(), ctx.createStereoPanner()];
      
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.04; // 25s hardware cycle
      lfoGain.gain.value = 0.3;    // ±0.3Hz micro-rhythm
      
      aL.fftSize = 2048; pL.pan.value = -1; pR.pan.value = 1;
      oL.connect(aL).connect(pL).connect(master);
      oR.connect(pR).connect(master);
      lfo.connect(lfoGain).connect(oR.frequency);
      
      oL.start(); oR.start(); lfo.start();
      oscLeftRef.current = oL; oscRightRef.current = oR;
      lfoRef.current = lfo; lfoGainRef.current = lfoGain;
      analyserLeftRef.current = aL;
      setIsPlaying(true);
      updateFrequencies(carrierFreq, binauralBeatFreq);
    }
  };

  // Sonic Plasma Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const render = () => {
      const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);
      const time = Date.now() / 1000;
      const buffer = new Uint8Array(2048);
      if (isPlaying) analyserLeftRef.current?.getByteTimeDomainData(buffer);

      // Sonic Plasma: 3 interwoven ribbons reactive to LFO and Amplitude
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        const layerOffset = (Math.PI * 2) / 3 * layer;
        // Map LFO micro-modulation to phase jitter (simulated from time variable to sync with LFO's 0.04Hz)
        const lfoVisualShift = Math.sin(time * 0.04 * Math.PI * 2) * 50; 
        
        for (let x = 0; x < w; x++) {
          const idx = Math.floor((x / w) * 2048);
          const amp = isPlaying ? (buffer[idx] - 128) / 128.0 : Math.sin(time + x * 0.01) * 0.1;
          
          // Entwined sine geometry with elastic noise
          const y = h/2 + 
                    Math.sin(x * 0.004 + time * (1.5 + layer * 0.5) + layerOffset) * (60 + lfoVisualShift) * (1 + amp * 8) +
                    Math.cos(x * 0.008 - time * 0.8) * 15;
          
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        
        const layerHue = (baseHue + layer * 15) % 360;
        ctx.strokeStyle = `hsla(${layerHue}, 80%, 60%, ${0.15 + layer * 0.2})`;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsla(${layerHue}, 80%, 50%, 0.4)`;
        ctx.stroke();
      }
      requestAnimationFrame(render);
    };
    render();
  }, [isPlaying, baseHue]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        oscLeftRef.current?.stop(); oscRightRef.current?.stop();
        if (lfoRef.current) { try { lfoRef.current.stop(); lfoRef.current.disconnect(); } catch(e){} }
        if (lfoGainRef.current) lfoGainRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#050505] font-sans text-white overflow-hidden">
      {/* Background Chromatic Depth */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 50%, hsla(${baseHue}, 70%, 50%, 0.15), transparent 70%)`
        }}
      />
      
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-zinc-950/40 backdrop-blur-2xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.9)] rounded-[32px] p-8 z-10 flex flex-col gap-8 relative overflow-hidden"
      >
        {/* Iridescent Edge Highlight */}
        <div 
          className="absolute inset-0 border border-white/5 rounded-[32px] pointer-events-none"
          style={{
            boxShadow: `inset 0 0 20px hsla(${baseHue}, 70%, 50%, 0.05)`
          }}
        />

        <div className="text-center space-y-1">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30">Psychoacoustic Processor</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: `hsl(${baseHue}, 80%, 60%)` }} />
            <h1 className="text-sm font-semibold text-white/80">Hardware-Accelerated LFO Engine</h1>
          </div>
        </div>

        {/* Adaptive Preset Grid */}
        <div className="grid grid-cols-5 gap-3 w-full">
          {presets.map((p) => {
            const pRatio = (p.carrierFreq - 100) / 250;
            const pHue = pRatio * 280;
            const isActive = activePreset === p.id;
            
            return (
              <button
                key={p.id}
                onClick={() => loadPreset(p)}
                style={{
                  borderColor: isActive ? `hsla(${pHue}, 70%, 50%, 0.4)` : 'rgba(255,255,255,0.05)',
                  backgroundColor: isActive ? `hsla(${pHue}, 70%, 50%, 0.08)` : 'rgba(255,255,255,0.02)',
                  color: isActive ? `hsla(${pHue}, 80%, 70%, 1)` : '#94a3b8'
                }}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-500 group",
                  isActive ? "shadow-[inset_0_0_15px_rgba(255,255,255,0.02)]" : "hover:border-white/20"
                )}
              >
                <div className={cn("transition-transform duration-300", isActive && "scale-110")}>
                  {p.icon}
                </div>
                <span className="block text-[10px] font-bold mt-2 uppercase tracking-tighter">{p.name}</span>
                <span className="block font-mono text-[8px] opacity-40 mt-0.5">{p.range}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Master Control */}
        <div className="flex justify-center relative">
          <div 
            className="absolute inset-0 blur-[40px] rounded-full opacity-20 transition-all duration-700"
            style={{ background: `hsl(${baseHue}, 80%, 50%)` }}
          />
          <button
            onClick={runSoundEngine}
            className="relative w-20 h-20 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all duration-300 group shadow-2xl"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white/90 fill-white/10" />
            ) : (
              <Play className="w-8 h-8 text-white/90 fill-white/10 translate-x-0.5" />
            )}
          </button>
        </div>

        {/* Clinical Telemetry Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-bold mb-1">Carrier State</span>
            <div className="font-mono text-base font-medium text-white/80 tabular-nums">
              {carrierFreq}<span className="text-[10px] ml-1 opacity-30">Hz</span>
            </div>
          </div>
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-bold mb-1">Pulse Resonance</span>
            <div className="font-mono text-base font-medium text-white/80 tabular-nums">
              {binauralBeatFreq}<span className="text-[10px] ml-1 opacity-30">Hz</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
