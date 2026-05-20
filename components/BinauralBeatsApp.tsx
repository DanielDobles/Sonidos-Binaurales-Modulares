'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass, Music, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * UTILS
 */
function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

/**
 * CONSTANTS & TYPES
 */
interface WavePreset { 
  id: string; 
  name: string; 
  range: string; 
  beatFreq: number; 
  minFreq: number; 
  maxFreq: number; 
  icon: React.ReactNode; 
}

interface SolfeggioPreset {
  id: string;
  name: string;
  freq: number;
  description: string;
}

const PRESETS: WavePreset[] = [
  { id: 'delta', name: 'Delta', range: '0.5-4Hz', beatFreq: 2.5, minFreq: 0.5, maxFreq: 4.0, icon: <Moon className="w-4 h-4" /> },
  { id: 'theta', name: 'Theta', range: '4-8Hz', beatFreq: 6.0, minFreq: 4.0, maxFreq: 8.0, icon: <Sparkles className="w-4 h-4" /> },
  { id: 'alpha', name: 'Alpha', range: '8-13Hz', beatFreq: 10.0, minFreq: 8.0, maxFreq: 13.0, icon: <Compass className="w-4 h-4" /> },
  { id: 'beta', name: 'Beta', range: '13-30Hz', beatFreq: 18.0, minFreq: 13.0, maxFreq: 30.0, icon: <Zap className="w-4 h-4" /> },
  { id: 'gamma', name: 'Gamma', range: '30-50Hz', beatFreq: 38.0, minFreq: 30.0, maxFreq: 50.0, icon: <Brain className="w-4 h-4" /> },
];

const SOLFEGGIO: SolfeggioPreset[] = [
  { id: 'ut', name: '396 Hz', freq: 396, description: 'Liberar Culpa y Miedo' },
  { id: 're', name: '417 Hz', freq: 417, description: 'Facilitar el Cambio' },
  { id: 'mi', name: '528 Hz', freq: 528, description: 'Transformación y Milagros' },
  { id: 'fa', name: '639 Hz', freq: 639, description: 'Conexión y Relaciones' },
  { id: 'sol', name: '741 Hz', freq: 741, description: 'Despertar Intuición' },
  { id: 'la', name: '852 Hz', freq: 852, description: 'Orden Espiritual' },
];

/**
 * OPTIMIZED GRAINIENT COMPONENT (SVG FILTER)
 * Prevents GPU degradation and visual artifacts with calibrated turbulence.
 */
const Grainient = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
  <div className={cn("relative w-full h-full overflow-hidden bg-zinc-950", className)}>
    <div 
      className="absolute inset-0 z-0 opacity-[0.15] mix-blend-overlay pointer-events-none" 
      style={{ 
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 250 250' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
      }} 
    />
    {children}
  </div>
);

/**
 * AURORA WAVEFORM - THREE.JS VISUALIZER
 */
function AuroraWaveform({ 
  isPlaying, 
  analyserRef, 
  baseHue, 
  activePresetData,
  pulseTextRef, 
  oscRightRef,
  audioCtxRef,
  carrierFreq
}: { 
  isPlaying: boolean;
  analyserRef: React.RefObject<AnalyserNode | null>;
  baseHue: number;
  activePresetData: WavePreset;
  pulseTextRef: React.RefObject<HTMLSpanElement | null>;
  oscRightRef: React.RefObject<OscillatorNode | null>;
  audioCtxRef: React.RefObject<AudioContext | null>;
  carrierFreq: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const byteDataArray = useMemo(() => new Uint8Array(128), []);
  const floatDataArray = useMemo(() => new Float32Array(128), []);
  
  const visualPulse = useRef<number>(activePresetData.beatFreq);
  
  const audioTexture = useMemo(() => {
    const tex = new THREE.DataTexture(floatDataArray, 128, 1, THREE.RedFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return tex;
  }, [floatDataArray]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uAudioBuffer: { value: audioTexture },
    uIsPlaying: { value: 0.0 },
    uMaxAmplitude: { value: 1.5 }
  }), [audioTexture]);

  useFrame((state) => {
    const { clock } = state;
    const t = clock.getElapsedTime();
    
    // Modulation of the binaural pulse within the preset range
    const noiseValue = Math.sin(t * 0.15) * Math.cos(t * 0.07);
    const range = activePresetData.maxFreq - activePresetData.minFreq;
    const currentInstantPulse = activePresetData.minFreq + ((noiseValue + 1.0) / 2.0) * range;

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uColor.value.setHSL(baseHue / 360, 0.7, 0.6);
      materialRef.current.uniforms.uIsPlaying.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uIsPlaying.value, isPlaying ? 1.0 : 0.0, 0.05);

      if (isPlaying && analyserRef.current && audioCtxRef.current) {
        if (oscRightRef.current) {
          oscRightRef.current.frequency.setTargetAtTime(carrierFreq + currentInstantPulse, audioCtxRef.current.currentTime, 0.1);
        }

        analyserRef.current.getByteTimeDomainData(byteDataArray);
        for (let i = 0; i < 128; i++) {
          floatDataArray[i] = (byteDataArray[i] - 128.0) / 128.0;
        }
        materialRef.current.uniforms.uAudioBuffer.value.needsUpdate = true;
      }
    }

    if (pulseTextRef.current) {
      visualPulse.current = THREE.MathUtils.lerp(visualPulse.current, isPlaying ? currentInstantPulse : activePresetData.beatFreq, 0.1);
      pulseTextRef.current.textContent = visualPulse.current.toFixed(2);
    }

    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(t * 0.05) * 0.02;
    }
  });

  const shaderArgs = useMemo(() => ({
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIsPlaying;
      uniform float uMaxAmplitude;
      uniform sampler2D uAudioBuffer;
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        float audioData = texture2D(uAudioBuffer, vec2(vUv.x, 0.5)).r;
        float displacement = audioData * uIsPlaying * uMaxAmplitude;
        pos.y += displacement * sin(vUv.x * 3.14159);
        pos.z += displacement * 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIsPlaying;

      void main() {
        float line = 1.0 - smoothstep(0.0, 0.05, abs(vUv.y - 0.5));
        float glow = 1.0 - abs(vUv.y - 0.5) * 2.0;
        glow = pow(glow, 4.0);
        
        float alpha = (line * 0.5 + glow * 0.8) * uIsPlaying;
        float pulse = sin(vUv.x * 10.0 - uTime * 2.0) * 0.5 + 0.5;
        vec3 color = mix(uColor, vec3(1.0), pulse * 0.3);
        
        gl_FragColor = vec4(color, alpha * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x));
      }
    `
  }), []);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[12, 4, 128, 16]} />
      <shaderMaterial
        ref={materialRef}
        args={[shaderArgs]}
        transparent
        uniforms={uniforms}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * MAIN APP COMPONENT
 */
export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string>('alpha');
  const [activeSolfeggio, setActiveSolfeggio] = useState<string>('mi');
  const [volume, setVolume] = useState<number>(0.7);

  // Refs for Audio Engine
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pulseTextRef = useRef<HTMLSpanElement | null>(null);

  const currentSolfeggio = useMemo(() => SOLFEGGIO.find(s => s.id === activeSolfeggio) || SOLFEGGIO[2], [activeSolfeggio]);
  const currentPreset = useMemo(() => PRESETS.find(p => p.id === activePreset) || PRESETS[2], [activePreset]);
  
  const carrierFreq = currentSolfeggio.freq;
  const baseHue = ((carrierFreq - 396) / (852 - 396)) * 280;

  // Volume modulation with setTargetAtTime
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, audioCtxRef.current.currentTime, 0.05);
    }
  }, [volume]);

  const initAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.setValueAtTime(volume, ctx.currentTime);
      masterGainRef.current.connect(ctx.destination);
    }
    return ctx;
  };

  const toggleSound = async () => {
    if (isPlaying) {
      oscLeftRef.current?.stop();
      oscRightRef.current?.stop();
      setIsPlaying(false);
    } else {
      const ctx = await initAudio();
      
      const oL = ctx.createOscillator();
      const oR = ctx.createOscillator();
      const pL = ctx.createStereoPanner();
      const pR = ctx.createStereoPanner();
      const anal = ctx.createAnalyser();

      anal.fftSize = 256;
      pL.pan.value = -1; // Hard Left
      pR.pan.value = 1;  // Hard Right

      oL.frequency.setValueAtTime(carrierFreq, ctx.currentTime);
      oR.frequency.setValueAtTime(carrierFreq + currentPreset.beatFreq, ctx.currentTime);

      oL.connect(pL).connect(anal).connect(masterGainRef.current!);
      oR.connect(pR).connect(masterGainRef.current!);

      oL.start(); oR.start();
      oscLeftRef.current = oL;
      oscRightRef.current = oR;
      analyserRef.current = anal;
      setIsPlaying(true);
    }
  };

  const changePreset = (preset: WavePreset) => {
    setActivePreset(preset.id);
    if (isPlaying && audioCtxRef.current && oscRightRef.current) {
      oscRightRef.current.frequency.setTargetAtTime(carrierFreq + preset.beatFreq, audioCtxRef.current.currentTime, 0.2);
    }
  };

  const changeSolfeggio = (id: string) => {
    setActiveSolfeggio(id);
    const freq = SOLFEGGIO.find(s => s.id === id)?.freq || 528;
    if (isPlaying && audioCtxRef.current) {
      oscLeftRef.current?.frequency.setTargetAtTime(freq, audioCtxRef.current.currentTime, 0.2);
      oscRightRef.current?.frequency.setTargetAtTime(freq + currentPreset.beatFreq, audioCtxRef.current.currentTime, 0.2);
    }
  };

  useEffect(() => {
    return () => {
      oscLeftRef.current?.stop();
      oscRightRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  return (
    <Grainient className="fixed inset-0 flex items-center justify-center p-4">
      {/* Dynamic Background Glow */}
      <div 
        className="absolute inset-0 opacity-20 transition-all duration-1000 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 50%, hsla(${baseHue}, 70%, 50%, 0.2), transparent 70%)` }}
      />
      
      {/* 3D Waveform Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 5], fov: 40 }}>
          <AuroraWaveform 
            isPlaying={isPlaying} 
            analyserRef={analyserRef} 
            baseHue={baseHue} 
            activePresetData={currentPreset}
            pulseTextRef={pulseTextRef}
            oscRightRef={oscRightRef}
            audioCtxRef={audioCtxRef}
            carrierFreq={carrierFreq}
          />
        </Canvas>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 1.45, y: 20 }}
        animate={{ opacity: 1, scale: 1.5, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-xl bg-zinc-950/60 backdrop-blur-3xl border border-white/10 rounded-[40px] p-5 z-10 flex flex-col gap-4 relative shadow-[0_30px_100px_rgba(0,0,0,0.8)] origin-center"
      >
        {/* Internal Glow Decor */}
        <div className="absolute inset-0 rounded-[40px] pointer-events-none" style={{ boxShadow: `inset 0 0 40px hsla(${baseHue}, 60%, 50%, 0.05)` }} />

        {/* Header Telemetry */}
        <div className="flex justify-between items-end px-2">
          <div className="space-y-0.5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30">Neuro-Sync Engine <span className="text-[8px] opacity-50 ml-1">v1.0.0</span></h2>
            <div className="flex items-center">
              <div className={cn("w-1.5 h-1.5 rounded-full", isPlaying ? "animate-pulse" : "opacity-30")} style={{ backgroundColor: `hsl(${baseHue}, 80%, 60%)` }} />
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
            <Volume2 className="w-3.5 h-3.5 text-white/30" />
            <input 
              type="range" min="0" max="1" step="0.01" value={volume} 
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 accent-white/40 h-1 rounded-full appearance-none bg-white/10 cursor-pointer"
            />
          </div>
        </div>

        {/* Solfeggio Carriers Grid */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-white/40 px-1">
            <Music className="w-3 h-3" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Base Carrier Frequency</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SOLFEGGIO.map((s) => (
              <button
                key={s.id}
                onClick={() => changeSolfeggio(s.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 overflow-hidden group",
                  activeSolfeggio === s.id 
                    ? "border-white/20 bg-white/5 text-white shadow-lg" 
                    : "border-white/5 bg-white/[0.02] text-white/40 hover:bg-white/[0.05]"
                )}
              >
                <span className="text-xs font-bold font-mono tracking-tight">{s.name}</span>
                <span className="text-[8px] opacity-60 uppercase tracking-tighter mt-1 block truncate w-full text-center px-1">
                  {s.description}
                </span>
                {activeSolfeggio === s.id && (
                  <motion.div layoutId="solf-glow" className="absolute inset-0 bg-white/5 pointer-events-none" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Brainwave Presets */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-white/40 px-1">
            <Brain className="w-3 h-3" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Target Entrainment Band</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => changePreset(p)}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-500",
                  activePreset === p.id 
                    ? "border-white/20 bg-white/10 text-white" 
                    : "border-white/5 bg-white/[0.01] text-white/30 hover:text-white/50"
                )}
              >
                <div className={cn("transition-transform duration-500", activePreset === p.id && "scale-110")}>
                  {p.icon}
                </div>
                <span className="text-[9px] font-bold mt-2 uppercase tracking-tighter">{p.name}</span>
                <span className="font-mono text-[7px] opacity-30 mt-0.5">{p.range}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Controls & Telemetry */}
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-4 bg-white/[0.03] p-4 rounded-[28px] border border-white/5 flex flex-col items-center gap-1">
            <span className="text-[8px] text-white/20 uppercase font-bold tracking-widest">Carrier</span>
            <div className="text-xl font-mono font-medium text-white/90 tabular-nums">
              {carrierFreq}<span className="text-[10px] ml-1 opacity-20">Hz</span>
            </div>
          </div>

          <div className="col-span-4 flex justify-center">
            <button 
              onClick={toggleSound} 
              className="w-20 h-20 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all duration-500 shadow-2xl relative group"
            >
              <div className="absolute inset-0 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity" style={{ background: `hsl(${baseHue}, 80%, 50%)` }} />
              {isPlaying ? (
                <Pause className="w-8 h-8 text-white/90 fill-white/10" />
              ) : (
                <Play className="w-8 h-8 text-white/90 translate-x-0.5 fill-white/10" />
              )}
            </button>
          </div>

          <div className="col-span-4 bg-white/[0.03] p-4 rounded-[28px] border border-white/5 flex flex-col items-center gap-1">
            <span className="text-[8px] text-white/20 uppercase font-bold tracking-widest">Binaural</span>
            <div className="text-xl font-mono font-medium text-white/90 tabular-nums">
              <span ref={pulseTextRef}>{currentPreset.beatFreq.toFixed(2)}</span>
              <span className="text-[10px] ml-1 opacity-20">Hz</span>
            </div>
          </div>
        </div>

        {/* Creator Footer */}
        <div className="mt-2 pt-4 border-t border-white/5 flex flex-col items-center gap-1 opacity-40 hover:opacity-80 transition-opacity duration-500">
          <div className="flex items-center gap-2">
            <div className="h-px w-4 bg-white/20" />
            <span className="text-[7px] uppercase tracking-[0.4em] font-medium text-white/60">Architect & Audio Engineer</span>
            <div className="h-px w-4 bg-white/20" />
          </div>
          <span className="text-[10px] font-bold tracking-widest uppercase text-white/80">Daniel Dobles</span>
        </div>
      </motion.div>
    </Grainient>
  );
}
