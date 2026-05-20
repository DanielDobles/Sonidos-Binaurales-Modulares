'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Interfaces
interface ModulationStep {
  stepName: string;
  carrierOffset: number;
  beatOffset: number;
}

interface WavePreset {
  id: string;
  name: string;
  beatFreq: number;
  carrierFreq: number;
  description: string;
  icon: React.ReactNode;
}

export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180);
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10);
  const [activeProgramName, setActiveProgramName] = useState<string>('Initial Calm Waves');
  const [aiExplanation, setAiExplanation] = useState<string>('This session combines 180Hz carrier waves with a 10Hz Alpha pulse for hemispheric synchronization.');
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const presets: WavePreset[] = [
    { id: 'delta', name: 'Delta', beatFreq: 2.5, carrierFreq: 120, description: 'Deep sleep and cellular repair.', icon: <Moon className="w-5 h-5" /> },
    { id: 'theta', name: 'Theta', beatFreq: 6.0, carrierFreq: 150, description: 'Meditation and creative flow.', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'alpha', name: 'Alpha', beatFreq: 10.0, carrierFreq: 180, description: 'Alert calm and learning.', icon: <Compass className="w-5 h-5" /> },
    { id: 'beta', name: 'Beta', beatFreq: 18.0, carrierFreq: 220, description: 'Focused cognition.', icon: <Zap className="w-5 h-5" /> },
    { id: 'gamma', name: 'Gamma', beatFreq: 38.0, carrierFreq: 260, description: 'Peak concentration.', icon: <Brain className="w-5 h-5" /> },
  ];

  const loadPreset = (preset: WavePreset) => {
    setCarrierFreq(preset.carrierFreq);
    setBinauralBeatFreq(preset.beatFreq);
    setActiveProgramName(`${preset.name} Waves`);
    setAiExplanation(preset.description);
  };

  const runSoundEngine = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    if (isPlaying) {
      oscLeftRef.current?.stop();
      oscRightRef.current?.stop();
      setIsPlaying(false);
    } else {
      const master = ctx.createGain();
      master.connect(ctx.destination);
      
      const oscL = ctx.createOscillator();
      const oscR = ctx.createOscillator();
      const lPan = ctx.createStereoPanner();
      const rPan = ctx.createStereoPanner();
      const aL = ctx.createAnalyser();
      const aR = ctx.createAnalyser();
      
      lPan.pan.value = -1;
      rPan.pan.value = 1;
      
      oscL.connect(aL).connect(lPan).connect(master);
      oscR.connect(aR).connect(rPan).connect(master);
      
      oscL.frequency.value = carrierFreq - binauralBeatFreq / 2;
      oscR.frequency.value = carrierFreq + binauralBeatFreq / 2;
      
      oscL.start();
      oscR.start();
      oscLeftRef.current = oscL;
      oscRightRef.current = oscR;
      analyserLeftRef.current = aL;
      analyserRightRef.current = aR;
      setIsPlaying(true);
    }
  };

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animationFrame: number;

    const render = () => {
      const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
      const time = Date.now() / 1000;
      
      ctx.clearRect(0, 0, w, h);
      
      const grad = ctx.createLinearGradient(0, h/2 - 100, 0, h/2 + 100);
      grad.addColorStop(0, 'hsla(142, 70%, 55%, 0.8)');
      grad.addColorStop(0.5, 'hsla(142, 70%, 40%, 0.4)');
      grad.addColorStop(1, 'hsla(142, 70%, 25%, 0.1)');
      
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6;
      ctx.beginPath();
      
      for(let x = 0; x < w; x++) {
        const y = h/2 + Math.sin(x * 0.005 + time * 5) * 50 * Math.sin(time * 0.5);
        if(x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      animationFrame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const baseHue = (Math.max(0, Math.min(1, (carrierFreq - 100) / 250)) * 280);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#020204] font-sans">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg p-8 rounded-[32px] backdrop-blur-xl border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] bg-[linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{activeProgramName}</h1>
          <p className="text-slate-300">{aiExplanation}</p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-row gap-3 overflow-x-auto pb-4 mb-6">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPreset(p)}
              className={cn(
                "flex-shrink-0 p-3 rounded-xl border border-white/10 backdrop-blur-md transition-all",
                binauralBeatFreq === p.beatFreq ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-white/5 text-slate-400 hover:bg-white/10"
              )}
            >
              {p.icon}
              <span className="block text-xs mt-1 font-bold">{p.name}</span>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex justify-center mb-8">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={runSoundEngine}
            className="w-20 h-20 rounded-full flex items-center justify-center shadow-[0_0_30px_hsla(142,70%,55%,0.4)]"
            style={{ background: `linear-gradient(135deg, hsl(${baseHue}, 100%, 50%), hsl(${(baseHue + 40) % 360}, 100%, 50%))` }}
          >
            {isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white ml-1" />}
          </motion.button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Base Freq</div>
            <div className="text-xl font-mono text-white">{carrierFreq} Hz</div>
          </div>
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Pulse</div>
            <div className="text-xl font-mono text-white">{binauralBeatFreq} Hz</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
