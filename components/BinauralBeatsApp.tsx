'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface WavePreset { 
  id: string; 
  name: string; 
  range: string; 
  beatFreq: number; 
  carrierFreq: number; 
  minFreq: number; 
  maxFreq: number; 
  icon: React.ReactNode; 
}

// --- NEURO-SPATIAL AURORA ENGINE ---
function AuroraWaveform({ 
  isPlaying, 
  analyserRef, 
  baseHue, 
  activePresetData,
  pulseTextRef, 
  oscRightRef,
  audioCtxRef
}: { 
  isPlaying: boolean;
  analyserRef: React.RefObject<AnalyserNode | null>;
  baseHue: number;
  activePresetData: WavePreset;
  pulseTextRef: React.RefObject<HTMLSpanElement | null>;
  oscRightRef: React.RefObject<OscillatorNode | null>;
  audioCtxRef: React.RefObject<AudioContext | null>;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const byteDataArray = useMemo(() => new Uint8Array(256), []);
  const floatDataArray = useMemo(() => new Float32Array(256), []);
  
  const audioTexture = useMemo(() => {
    const tex = new THREE.DataTexture(floatDataArray, 256, 1, THREE.RedFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return tex;
  }, [floatDataArray]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uAudioBuffer: { value: audioTexture },
    uPulseFrequency: { value: 10.0 },
    uIsPlaying: { value: 0.0 }
  }), [audioTexture]);

  useFrame((state) => {
    const { clock } = state;
    const t = clock.getElapsedTime();
    
    // 1. Stochastic Band-Limited Modulation (Noise Simulation)
    const noiseValue = Math.sin(t * 0.4) * Math.cos(t * 0.15) * Math.sin(t * 0.08); // Multi-octave wave
    const range = activePresetData.maxFreq - activePresetData.minFreq;
    const currentInstantPulse = activePresetData.minFreq + ((noiseValue + 1.0) / 2.0) * range;

    // 2. Audio-Visual Hardware Injection
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uColor.value.setHSL(baseHue / 360, 0.8, 0.5);
      materialRef.current.uniforms.uPulseFrequency.value = currentInstantPulse;
      materialRef.current.uniforms.uIsPlaying.value = isPlaying ? 1.0 : 0.0;

      if (isPlaying && analyserRef.current && audioCtxRef.current) {
        // Real-time Audio Graph Mutation (Zero-latency)
        if (oscRightRef.current) {
          oscRightRef.current.frequency.setTargetAtTime(
            activePresetData.carrierFreq + currentInstantPulse, 
            audioCtxRef.current.currentTime, 
            0.016 // Interpolate over 1 frame to prevent clicks
          );
        }

        // Buffer Normalization
        analyserRef.current.getByteTimeDomainData(byteDataArray);
        for (let i = 0; i < 256; i++) {
          floatDataArray[i] = (byteDataArray[i] - 128) / 128.0;
        }
        materialRef.current.uniforms.uAudioBuffer.value.needsUpdate = true;
      }
    }

    // 3. Telemetry Inversion (60 FPS DOM Injection)
    if (isPlaying && pulseTextRef.current) {
      pulseTextRef.current.textContent = currentInstantPulse.toFixed(1) + " Hz";
    }

    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(t * 0.1) * 0.01;
    }
  });

  const shaderArgs = useMemo(() => ({
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uPulseFrequency;
      uniform float uIsPlaying;
      uniform sampler2D uAudioBuffer;
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        float audioData = texture2D(uAudioBuffer, vec2(vUv.x, 0.5)).r;
        
        // Pulse-driven dynamics: faster vibration for higher frequencies
        float displacement = audioData * mix(0.1, 2.8, uIsPlaying);
        float pulseSpeed = uPulseFrequency * 0.1;
        float latentWave = sin(pos.x * 2.0 + uTime * (2.0 + pulseSpeed)) * 0.15;
        
        pos.y += mix(latentWave, displacement, uIsPlaying);
        pos.y = clamp(pos.y, -3.0, 3.0);
        pos.z += displacement * 1.5;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uPulseFrequency;

      void main() {
        float edgeY = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
        float edgeX = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        
        // High-frequency ripple texture based on active pulse
        float ripple = sin(vUv.x * (10.0 + uPulseFrequency) + uTime * 2.0) * 0.5 + 0.5;
        vec3 finalColor = mix(uColor, vec3(1.0), ripple * 0.2);
        
        gl_FragColor = vec4(finalColor, edgeY * edgeX * 0.6);
      }
    `
  }), []);

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} rotation={[-Math.PI / 12, 0, 0]}>
      <planeGeometry args={[14, 6, 256, 32]} />
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

// --- MAIN APPLICATION COMPONENT ---
export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180);
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10);
  const [activePreset, setActivePreset] = useState<string>('alpha');
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const pulseTextRef = useRef<HTMLSpanElement | null>(null);

  const presets: WavePreset[] = [
    { id: 'delta', name: 'Delta', range: '0.5-4Hz', beatFreq: 2.5, carrierFreq: 120, minFreq: 0.5, maxFreq: 4.0, icon: <Moon className="w-4 h-4" /> },
    { id: 'theta', name: 'Theta', range: '4-8Hz', beatFreq: 6.0, carrierFreq: 150, minFreq: 4.0, maxFreq: 8.0, icon: <Sparkles className="w-4 h-4" /> },
    { id: 'alpha', name: 'Alpha', range: '8-13Hz', beatFreq: 10.0, carrierFreq: 180, minFreq: 8.0, maxFreq: 13.0, icon: <Compass className="w-4 h-4" /> },
    { id: 'beta', name: 'Beta', range: '13-30Hz', beatFreq: 18.0, carrierFreq: 220, minFreq: 13.0, maxFreq: 30.0, icon: <Zap className="w-4 h-4" /> },
    { id: 'gamma', name: 'Gamma', range: '30-50Hz', beatFreq: 38.0, carrierFreq: 260, minFreq: 30.0, maxFreq: 50.0, icon: <Brain className="w-4 h-4" /> },
  ];

  const currentPresetData = presets.find(p => p.id === activePreset) || presets[2];
  const carrierRatio = Math.max(0, Math.min(1, (carrierFreq - 100) / 250));
  const baseHue = carrierRatio * 280;

  const loadPreset = (p: WavePreset) => {
    setCarrierFreq(p.carrierFreq);
    setBinauralBeatFreq(p.beatFreq);
    setActivePreset(p.id);
    if (!audioCtxRef.current || !isPlaying) return;
    const now = audioCtxRef.current.currentTime;
    oscLeftRef.current?.frequency.setTargetAtTime(p.carrierFreq, now, 1.2);
    // Right oscillator will be modulated by the useFrame loop immediately
  };

  const runSoundEngine = async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    if (isPlaying) {
      oscLeftRef.current?.stop();
      oscRightRef.current?.stop();
      setIsPlaying(false);
      if (pulseTextRef.current) pulseTextRef.current.textContent = binauralBeatFreq.toFixed(1) + " Hz";
    } else {
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const [oL, oR] = [ctx.createOscillator(), ctx.createOscillator()];
      const aL = ctx.createAnalyser();
      const [pL, pR] = [ctx.createStereoPanner(), ctx.createStereoPanner()];
      
      aL.fftSize = 256; pL.pan.value = -1; pR.pan.value = 1;
      
      oL.frequency.setValueAtTime(carrierFreq, ctx.currentTime);
      oR.frequency.setValueAtTime(carrierFreq + binauralBeatFreq, ctx.currentTime);
      
      oL.connect(aL).connect(pL).connect(master);
      oR.connect(pR).connect(master);
      
      oL.start(); oR.start();
      oscLeftRef.current = oL; oscRightRef.current = oR;
      analyserLeftRef.current = aL;
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => { if (audioCtxRef.current) { oscLeftRef.current?.stop(); oscRightRef.current?.stop(); } };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#050505] font-sans text-white overflow-hidden">
      <div 
        className="absolute inset-0 opacity-20 transition-all duration-1000 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 50%, hsla(${baseHue}, 70%, 50%, 0.15), transparent 70%)` }}
      />
      
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 6], fov: 40 }}>
          <ambientLight intensity={0.4} />
          <AuroraWaveform 
            isPlaying={isPlaying} 
            analyserRef={analyserLeftRef} 
            baseHue={baseHue} 
            activePresetData={currentPresetData}
            pulseTextRef={pulseTextRef}
            oscRightRef={oscRightRef}
            audioCtxRef={audioCtxRef}
          />
        </Canvas>
      </div>
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-zinc-950/40 backdrop-blur-2xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.9)] rounded-[32px] p-8 z-10 flex flex-col gap-8 relative overflow-hidden"
      >
        <div className="absolute inset-0 border border-white/5 rounded-[32px] pointer-events-none" style={{ boxShadow: `inset 0 0 25px hsla(${baseHue}, 70%, 50%, 0.05)` }} />

        <div className="text-center space-y-1">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/20">Bio-Neural Sync</h2>
          <div className="flex items-center justify-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: `hsl(${baseHue}, 80%, 60%)` }} />
            <h1 className="text-sm font-semibold text-white/70 uppercase tracking-widest">Stochastic Band Sweep</h1>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 w-full">
          {presets.map((p) => {
            const pHue = ((p.carrierFreq - 100) / 250) * 280;
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
                className={cn("flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-500", isActive && "shadow-[inset_0_0_15px_rgba(255,255,255,0.01)]")}
              >
                <div className={cn("transition-transform duration-300", isActive && "scale-110")}>{p.icon}</div>
                <span className="block text-[10px] font-bold mt-2 uppercase tracking-tighter">{p.name}</span>
                <span className="block font-mono text-[8px] opacity-40 mt-0.5">{p.range}</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-center relative">
          <div className="absolute inset-0 blur-[50px] rounded-full opacity-20 transition-all duration-700" style={{ background: `hsl(${baseHue}, 80%, 50%)` }} />
          <button onClick={runSoundEngine} className="relative w-20 h-20 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all duration-300 shadow-2xl group">
            {isPlaying ? <Pause className="w-8 h-8 text-white/90" /> : <Play className="w-8 h-8 text-white/90 translate-x-0.5" />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center">
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-bold mb-1">Carrier State</span>
            <div className="font-mono text-base font-medium text-white/80 tabular-nums">{carrierFreq}<span className="text-[10px] ml-1 opacity-30">Hz</span></div>
          </div>
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center">
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-bold mb-1">Active Band Sweep</span>
            <div className="font-mono text-base font-medium text-white/80 tabular-nums"><span ref={pulseTextRef}>{binauralBeatFreq.toFixed(1)} Hz</span></div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
