'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface ModulationStep { stepName: string; carrierOffset: number; beatOffset: number; }
interface WavePreset { id: string; name: string; range: string; beatFreq: number; carrierFreq: number; icon: React.ReactNode; }

export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180);
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10);
  const [activePreset, setActivePreset] = useState<string>('alpha');
  const [currentModStep, setCurrentModStep] = useState<number>(0);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);

  const modulationSteps: ModulationStep[] = [
    { stepName: 'Sync', carrierOffset: 0, beatOffset: 0 },
    { stepName: 'Optimize', carrierOffset: 4, beatOffset: 0.3 },
    { stepName: 'Align', carrierOffset: -3, beatOffset: -0.2 },
    { stepName: 'Stabilize', carrierOffset: 6, beatOffset: 0.5 },
    { stepName: 'Resonate', carrierOffset: -5, beatOffset: -0.4 },
    { stepName: 'Harmonize', carrierOffset: 2, beatOffset: 0 }
  ];

  const presets: WavePreset[] = [
    { id: 'delta', name: 'Delta', range: '1-4Hz', beatFreq: 2.5, carrierFreq: 120, icon: <Moon className="w-4 h-4" /> },
    { id: 'theta', name: 'Theta', range: '4-8Hz', beatFreq: 6.0, carrierFreq: 150, icon: <Sparkles className="w-4 h-4" /> },
    { id: 'alpha', name: 'Alpha', range: '8-12Hz', beatFreq: 10.0, carrierFreq: 180, icon: <Compass className="w-4 h-4" /> },
    { id: 'beta', name: 'Beta', range: '12-30Hz', beatFreq: 18.0, carrierFreq: 220, icon: <Zap className="w-4 h-4" /> },
    { id: 'gamma', name: 'Gamma', range: '30-45Hz', beatFreq: 38.0, carrierFreq: 260, icon: <Brain className="w-4 h-4" /> },
  ];

  const carrierRatio = Math.max(0, Math.min(1, (carrierFreq - 100) / 250));
  const baseHue = carrierRatio * 280;

  const getClampedBeat = (baseBeat: number, offset: number) => {
    const ranges = [[1,4], [4,8], [8,12], [12,30], [30,45]];
    const band = ranges.find(r => baseBeat >= r[0] && baseBeat <= r[1]) || [1,45];
    return Math.min(band[1], Math.max(band[0], baseBeat + offset));
  };

  const updateFrequencies = useCallback((base: number, beat: number) => {
    if (!audioCtxRef.current || !isPlaying) return;
    const mod = modulationSteps[currentModStep];
    const actualBase = Math.max(80, base + mod.carrierOffset);
    const actualBeat = getClampedBeat(beat, mod.beatOffset);
    const now = audioCtxRef.current.currentTime;
    oscLeftRef.current?.frequency.setTargetAtTime(actualBase - (actualBeat / 2), now, 1.2);
    oscRightRef.current?.frequency.setTargetAtTime(actualBase + (actualBeat / 2), now, 1.2);
  }, [isPlaying, currentModStep]);

  const loadPreset = (p: WavePreset) => {
    setCarrierFreq(p.carrierFreq);
    setBinauralBeatFreq(p.beatFreq);
    setActivePreset(p.id);
    setCurrentModStep(0);
    updateFrequencies(p.carrierFreq, p.beatFreq);
  };

  const runSoundEngine = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    if (isPlaying) { oscLeftRef.current?.stop(); oscRightRef.current?.stop(); setIsPlaying(false); }
    else {
      const master = ctx.createGain(); master.connect(ctx.destination);
      const [oL, oR] = [ctx.createOscillator(), ctx.createOscillator()];
      const [aL, aR] = [ctx.createAnalyser(), ctx.createAnalyser()];
      const [pL, pR] = [ctx.createStereoPanner(), ctx.createStereoPanner()];
      aL.fftSize = 2048; pL.pan.value = -1; pR.pan.value = 1;
      oL.connect(aL).connect(pL).connect(master);
      oR.connect(aR).connect(pR).connect(master);
      oL.start(); oR.start();
      oscLeftRef.current = oL; oscRightRef.current = oR;
      analyserLeftRef.current = aL;
      setIsPlaying(true);
      updateFrequencies(carrierFreq, binauralBeatFreq);
    }
  };

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

      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const amp = isPlaying ? (buffer[Math.floor((x/w)*2048)] - 128) / 128.0 : Math.sin(time + x * 0.01) * 0.1;
          const y = h/2 + Math.sin(x * 0.005 + time * (2 + layer)) * 60 * (1 + amp * 5);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${baseHue}, 70%, 55%, ${0.2 + layer * 0.2})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      requestAnimationFrame(render);
    };
    render();
  }, [isPlaying, baseHue]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black font-sans text-white">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="w-full max-w-lg bg-zinc-950/40 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-[32px] p-6 z-10">
        <div className="grid grid-cols-5 gap-2 w-full mb-6">
          {presets.map((p) => (
            <button key={p.id} onClick={() => loadPreset(p)} style={{borderColor: activePreset === p.id ? `hsla(${baseHue}, 70%, 55%, 0.5)` : 'rgba(255,255,255,0.05)'}} className={cn("flex flex-col items-center justify-center p-3 rounded-xl border transition-all bg-white/[0.02]", activePreset === p.id && "bg-emerald-500/10 text-emerald-400")}>
              {p.icon}<span className="block text-xs mt-1 font-medium">{p.name}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-center mb-6">
          <button onClick={runSoundEngine} style={{boxShadow: `0 0 30px hsla(${baseHue}, 70%, 50%, 0.3)`}} className="w-16 h-16 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all">
            {isPlaying ? <Pause /> : <Play className="ml-1" />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-widest">Base Freq</div><div className="font-mono text-sm">{carrierFreq} Hz</div></div>
          <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-widest">Pulse</div><div className="font-mono text-sm">{binauralBeatFreq} Hz</div></div>
        </div>
      </div>
    </div>
  );
}
