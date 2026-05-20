'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ModulationStep { stepName: string; carrierOffset: number; beatOffset: number; }
interface WavePreset { id: string; name: string; range: string; beatFreq: number; carrierFreq: number; icon: React.ReactNode; }

export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180);
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10);
  const [activePreset, setActivePreset] = useState<string>('alpha');
  const [currentModStep, setCurrentModStep] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);

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
    
    oscLeftRef.current?.frequency.setTargetAtTime(actualBase - (actualBeat / 2), audioCtxRef.current.currentTime, 0.5);
    oscRightRef.current?.frequency.setTargetAtTime(actualBase + (actualBeat / 2), audioCtxRef.current.currentTime, 0.5);
  }, [isPlaying, currentModStep]);

  const loadPreset = (p: WavePreset) => {
    setCarrierFreq(p.carrierFreq);
    setBinauralBeatFreq(p.beatFreq);
    setActivePreset(p.id);
    setCurrentModStep(0);
    setSecondsRemaining(30);
    updateFrequencies(p.carrierFreq, p.beatFreq);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) { setCurrentModStep(s => (s + 1) % modulationSteps.length); return 30; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => { updateFrequencies(carrierFreq, binauralBeatFreq); }, [currentModStep, updateFrequencies]);

  const runSoundEngine = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    if (isPlaying) { oscLeftRef.current?.stop(); oscRightRef.current?.stop(); setIsPlaying(false); } 
    else {
      const master = ctx.createGain(); master.connect(ctx.destination);
      const [oL, oR] = [ctx.createOscillator(), ctx.createOscillator()];
      const [pL, pR] = [ctx.createStereoPanner(), ctx.createStereoPanner()];
      const [aL, aR] = [ctx.createAnalyser(), ctx.createAnalyser()];
      aL.fftSize = 2048; aR.fftSize = 2048;
      pL.pan.value = -1; pR.pan.value = 1;
      oL.connect(aL).connect(pL).connect(master);
      oR.connect(aR).connect(pR).connect(master);
      oL.start(); oR.start();
      oscLeftRef.current = oL; oscRightRef.current = oR;
      analyserLeftRef.current = aL; analyserRightRef.current = aR;
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
      const centerY = h * 0.45;
      const carrierRatio = Math.max(0, Math.min(1, (carrierFreq - 100) / 250));
      const baseHue = carrierRatio * 280;
      
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, `hsla(${baseHue}, 70%, 45%, 0.2)`);
      grad.addColorStop(0.5, `hsla(${baseHue}, 70%, 55%, 0.8)`);
      grad.addColorStop(1, `hsla(${baseHue}, 70%, 45%, 0.2)`);
      
      ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.beginPath();
      
      if (isPlaying && analyserLeftRef.current) {
        const buffer = new Uint8Array(2048);
        analyserLeftRef.current.getByteTimeDomainData(buffer);
        let maxAmp = 0;
        for(let i=0; i<w; i++) {
          const val = (buffer[Math.floor((i/w)*2048)] - 128) / 128.0;
          maxAmp = Math.max(maxAmp, Math.abs(val));
          ctx.lineTo(i, centerY + val * (h * 0.15));
        }
      } else {
        const time = Date.now() / 1000;
        for(let i=0; i<w; i++) ctx.lineTo(i, centerY + Math.sin(i*0.005 + time*3) * (h * 0.05));
      }
      ctx.stroke();
      requestAnimationFrame(render);
    };
    render();
  }, [isPlaying, carrierFreq, currentModStep]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black font-sans text-white">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="w-full max-w-lg bg-neutral-950/40 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 z-10">
        <div className="grid grid-cols-5 gap-2 w-full mb-8">
          {presets.map((p) => (
            <button key={p.id} onClick={() => loadPreset(p)} className={cn("flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center bg-white/[0.02] border-white/5", activePreset === p.id ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[inset_0_0_10px_rgba(16,185,129,0.1)]" : "hover:border-white/20")}>
              {p.icon}<span className="block text-xs font-medium mt-1">{p.name}</span><span className="block font-mono text-[9px] opacity-50 mt-0.5">{p.range}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-center mb-8">
          <button onClick={runSoundEngine} className="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Base Freq</div><div className="font-mono text-sm">{carrierFreq} Hz</div></div>
          <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5 text-center"><div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Pulse</div><div className="font-mono text-sm">{binauralBeatFreq} Hz</div></div>
        </div>
      </div>
    </div>
  );
}
