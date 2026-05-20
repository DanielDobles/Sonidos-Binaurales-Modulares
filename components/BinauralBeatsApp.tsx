'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass, Music, Volume2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BorderGlow from './BorderGlow';
import { IsochronicModule } from '../lib/IsochronicModule';

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
  { id: 'epsilon', name: 'Epsilon', range: '<0.5Hz', beatFreq: 0.3, minFreq: 0.1, maxFreq: 0.5, icon: <Moon className="w-4 h-4 opacity-50" /> },
  { id: 'delta', name: 'Delta', range: '0.5-4Hz', beatFreq: 2.5, minFreq: 0.5, maxFreq: 4.0, icon: <Moon className="w-4 h-4" /> },
  { id: 'theta', name: 'Theta', range: '4-8Hz', beatFreq: 6.0, minFreq: 4.0, maxFreq: 8.0, icon: <Sparkles className="w-4 h-4" /> },
  { id: 'alpha', name: 'Alpha', range: '8-13Hz', beatFreq: 10.0, minFreq: 8.0, maxFreq: 13.0, icon: <Compass className="w-4 h-4" /> },
  { id: 'beta', name: 'Beta', range: '13-30Hz', beatFreq: 18.0, minFreq: 13.0, maxFreq: 30.0, icon: <Zap className="w-4 h-4" /> },
  { id: 'gamma', name: 'Gamma', range: '30-100Hz', beatFreq: 40.0, minFreq: 30.0, maxFreq: 100.0, icon: <Brain className="w-4 h-4" /> },
  { id: 'lambda', name: 'Lambda', range: '100-200Hz', beatFreq: 120.0, minFreq: 100.0, maxFreq: 200.0, icon: <Zap className="w-4 h-4 text-purple-400" /> },
];

const SOLFEGGIO: SolfeggioPreset[] = [
  { id: 'ut', name: '396 Hz', freq: 396, description: 'Liberate Guilt and Fear' },
  { id: 're', name: '417 Hz', freq: 417, description: 'Facilitate Change' },
  { id: 'mi', name: '528 Hz', freq: 528, description: 'Transformation and Miracles' },
  { id: 'fa', name: '639 Hz', freq: 639, description: 'Connection and Relationships' },
  { id: 'sol', name: '741 Hz', freq: 741, description: 'Awaken Intuition' },
  { id: 'la', name: '852 Hz', freq: 852, description: 'Spiritual Order' },
];

/**
 * PSYCHOACOUSTIC UTILS: Fletcher-Munson (ISO 226:2003) Equal Loudness Contours
 * Maps frequency (Hz) to a gain correction factor (0.0 to 1.0) to normalize perceived volume.
 */
function getFletcherMunsonGain(freq: number): number {
  const points = [
    { f: 0, g: 1.0 },
    { f: 400, g: 1.0 },
    { f: 800, g: 1.0 },
    { f: 1000, g: 0.75 },
    { f: 2500, g: 0.60 }, 
    { f: 4000, g: 0.78 },
    { f: 5000, g: 0.90 },
    { f: 8000, g: 0.90 }
  ];

  if (freq <= points[0].f) return points[0].g;
  if (freq >= points[points.length - 1].f) return points[points.length - 1].g;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (freq >= p1.f && freq <= p2.f) {
      const t = (freq - p1.f) / (p2.f - p1.f);
      return p1.g + t * (p2.g - p1.g);
    }
  }
  return 1.0;
}

/**
 * OPTIMIZED STATIC GRAINIENT COMPONENT
 */
const Grainient = ({ children, className }: { children?: React.ReactNode, className?: string }) => (
  <div className={cn("relative w-full h-full overflow-hidden bg-zinc-950", className)}>
    <svg className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noiseFilter)" />
    </svg>
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
  const lastHue = useRef<number>(baseHue);

  const audioTexture = useMemo(() => {
    const tex = new THREE.DataTexture(floatDataArray, 128, 1, THREE.RedFormat, THREE.FloatType);
    tex.needsUpdate = true;
    return tex;
  }, [floatDataArray]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorPrev: { value: new THREE.Color().setHSL(baseHue / 360, 0.7, 0.6) },
    uColorNext: { value: new THREE.Color().setHSL(baseHue / 360, 0.7, 0.6) },
    uMixProgress: { value: 1.0 },
    uAudioBuffer: { value: audioTexture },
    uIsPlaying: { value: 0.0 },
    uMaxAmplitude: { value: 1.5 }
  }), [audioTexture]);

  useFrame((state) => {
    const { clock } = state;
    const t = clock.getElapsedTime();
    
    if (baseHue !== lastHue.current) {
      if (materialRef.current) {
        const u = materialRef.current.uniforms;
        const currentColor = new THREE.Color().lerpColors(u.uColorPrev.value, u.uColorNext.value, u.uMixProgress.value);
        u.uColorPrev.value.copy(currentColor);
        u.uColorNext.value.setHSL(baseHue / 360, 0.7, 0.6);
        u.uMixProgress.value = 0.0;
      }
      lastHue.current = baseHue;
    }

    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uMixProgress.value = Math.min(materialRef.current.uniforms.uMixProgress.value + 0.07, 1.0);
      materialRef.current.uniforms.uIsPlaying.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uIsPlaying.value, isPlaying ? 1.0 : 0.0, 0.05);

      if (isPlaying && analyserRef.current && audioCtxRef.current) {
        analyserRef.current.getByteTimeDomainData(byteDataArray);
        for (let i = 0; i < 128; i++) {
          floatDataArray[i] = (byteDataArray[i] - 128.0) / 128.0;
        }
        materialRef.current.uniforms.uAudioBuffer.value.needsUpdate = true;
      }
    }

    if (pulseTextRef.current) {
      visualPulse.current = THREE.MathUtils.lerp(visualPulse.current, activePresetData.beatFreq, 0.1);
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
      uniform vec3 uColorPrev;
      uniform vec3 uColorNext;
      uniform float uMixProgress;
      uniform float uTime;
      uniform float uIsPlaying;
      void main() {
        float sweep = smoothstep(0.0, 1.0, (uMixProgress * 1.6) - (vUv.x * 0.6));
        vec3 blendedColor = mix(uColorPrev, uColorNext, sweep);
        float line = 1.0 - smoothstep(0.0, 0.05, abs(vUv.y - 0.5));
        float glow = 1.0 - abs(vUv.y - 0.5) * 2.0;
        glow = pow(glow, 4.0);
        float alpha = (line * 0.5 + glow * 0.8) * uIsPlaying;
        float pulse = sin(vUv.x * 10.0 - uTime * 2.0) * 0.5 + 0.5;
        vec3 color = mix(blendedColor, vec3(1.0), pulse * 0.3);
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
 * PSYCHOACOUSTIC UTILS: A-Weighting (dBA) approximation
 */
function getWeightingGain(f: number): number {
  if (f <= 0) return 1.0;
  const f2 = f * f;
  const f4 = f2 * f2;
  const numerator = Math.pow(12194, 2) * f4;
  const denominator = (f2 + Math.pow(20.6, 2)) * Math.sqrt((f2 + Math.pow(107.7, 2)) * (f2 + Math.pow(737.9, 2))) * (f2 + Math.pow(12194, 2));
  const dB = 20 * Math.log10(numerator / denominator) + 2.0;
  return Math.pow(10, dB / 20);
}

/**
 * MAIN APP COMPONENT
 */
export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isIsoEnabled, setIsIsoEnabled] = useState<boolean>(true);
  const [isoIntensity, setIsoIntensity] = useState<number>(1.0);
  const [pulseType, setPulseType] = useState<'sine' | 'square'>('square');
  const [activePreset, setActivePreset] = useState<string>('alpha');
  const [activeSolfeggio, setActiveSolfeggio] = useState<string>('mi');
  const [volume, setVolume] = useState<number>(0.7);

  // STOCHASTIC ENGINE STATE
  const [isAutoMode, setIsAutoMode] = useState<boolean>(false);
  const [autoBeatFreq, setAutoBeatFreq] = useState<number>(10.0);

  // Refs for Audio Engine
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const isochronicModuleRef = useRef<IsochronicModule | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pulseTextRef = useRef<HTMLSpanElement | null>(null);

  const currentSolfeggio = useMemo(() => SOLFEGGIO.find(s => s.id === activeSolfeggio) || SOLFEGGIO[2], [activeSolfeggio]);
  const currentPreset = useMemo(() => PRESETS.find(p => p.id === activePreset) || PRESETS[3], [activePreset]);
  
  const carrierFreq = currentSolfeggio.freq;
  const pulseFreq = isAutoMode ? autoBeatFreq : currentPreset.beatFreq;
  const baseHue = ((carrierFreq - 396) / (852 - 396)) * 280;

  const changePreset = useCallback((preset: WavePreset) => {
    setActivePreset(preset.id);
    if (isPlaying && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      oscRightRef.current?.frequency.setTargetAtTime(carrierFreq + preset.beatFreq, now, 0.2);
      isochronicModuleRef.current?.setPulseFreq(preset.beatFreq, now);
      if (isAutoMode) setAutoBeatFreq(preset.beatFreq);
    }
  }, [isPlaying, carrierFreq, isAutoMode]);

  // STOCHASTIC SEQUENCER: Brownian Motion & Markov Transitions
  useEffect(() => {
    if (!isAutoMode || !isPlaying) return;

    const interval = setInterval(() => {
      setAutoBeatFreq(prev => {
        const range = currentPreset.maxFreq - currentPreset.minFreq;
        const volatility = range * 0.05; 
        const center = (currentPreset.maxFreq + currentPreset.minFreq) / 2;
        const drift = (center - prev) * 0.1;
        const step = (Math.random() - 0.5) * volatility + drift;
        const next = Math.max(currentPreset.minFreq, Math.min(currentPreset.maxFreq, prev + step));
        
        if (audioCtxRef.current && oscRightRef.current) {
          const now = audioCtxRef.current.currentTime;
          oscRightRef.current.frequency.setTargetAtTime(carrierFreq + next, now, 0.5);
          isochronicModuleRef.current?.setPulseFreq(next, now);
        }
        return next;
      });
    }, 2000);

    const transitionTimer = setInterval(() => {
      const decision = Math.random();
      const currentIndex = PRESETS.findIndex(p => p.id === activePreset);
      if (decision > 0.85 && currentIndex < PRESETS.length - 1) {
        changePreset(PRESETS[currentIndex + 1]);
      } else if (decision < 0.15 && currentIndex > 0) {
        changePreset(PRESETS[currentIndex - 1]);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(transitionTimer);
    };
  }, [isAutoMode, isPlaying, activePreset, carrierFreq, currentPreset, changePreset]);

  const fletcherGain = useMemo(() => getFletcherMunsonGain(carrierFreq), [carrierFreq]);
  const fletcherGainRef = useRef(fletcherGain);

  useEffect(() => {
    fletcherGainRef.current = fletcherGain;
  }, [fletcherGain]);

  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const targetGain = volume * fletcherGain;
      const now = audioCtxRef.current.currentTime;
      masterGainRef.current.gain.cancelScheduledValues(now);
      const currentVal = Math.max(masterGainRef.current.gain.value, 0.001);
      masterGainRef.current.gain.setValueAtTime(currentVal, now);
      masterGainRef.current.gain.exponentialRampToValueAtTime(Math.max(targetGain, 0.001), now + 1.2);
    }
  }, [carrierFreq, volume, fletcherGain]);

  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const targetGain = volume * fletcherGainRef.current;
      const now = audioCtxRef.current.currentTime;
      masterGainRef.current.gain.cancelScheduledValues(now);
      const currentVal = Math.max(masterGainRef.current.gain.value, 0.001);
      masterGainRef.current.gain.setValueAtTime(currentVal, now);
      masterGainRef.current.gain.exponentialRampToValueAtTime(Math.max(targetGain, 0.001), now + 0.15);
    }
  }, [volume]);

  useEffect(() => {
    if (isochronicModuleRef.current) {
      isochronicModuleRef.current.setIntensity(isIsoEnabled ? isoIntensity : 0);
    }
  }, [isoIntensity, isIsoEnabled]);

  const initAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.setValueAtTime(0, ctx.currentTime);
      masterGainRef.current.connect(ctx.destination);
    }
    if (!isochronicModuleRef.current) {
      isochronicModuleRef.current = new IsochronicModule(ctx);
      if (analyserRef.current) isochronicModuleRef.current.connect(analyserRef.current);
    }
    return ctx;
  }, []);

  const toggleSound = useCallback(async () => {
    if (isPlaying) {
      oscLeftRef.current?.stop();
      oscLeftRef.current = null;
      oscRightRef.current?.stop();
      oscRightRef.current = null;
      isochronicModuleRef.current?.stop();
      setIsPlaying(false);
      setHasStarted(false);
    } else {
      const ctx = await initAudio();
      const startTime = ctx.currentTime + 0.2; 
      if (!analyserRef.current) {
        const anal = ctx.createAnalyser();
        anal.fftSize = 256;
        analyserRef.current = anal;
        anal.connect(masterGainRef.current!);
      }
      isochronicModuleRef.current?.connect(analyserRef.current!);
      const oL = ctx.createOscillator();
      const oR = ctx.createOscillator();
      const pL = ctx.createStereoPanner();
      const pR = ctx.createStereoPanner();
      pL.pan.value = -1;
      pR.pan.value = 1;
      oL.frequency.setValueAtTime(carrierFreq, startTime);
      oR.frequency.setValueAtTime(carrierFreq + pulseFreq, startTime);
      oL.connect(pL).connect(analyserRef.current!);
      oR.connect(pR).connect(analyserRef.current!);
      oL.start(startTime); 
      oR.start(startTime);
      oscLeftRef.current = oL;
      oscRightRef.current = oR;
      isochronicModuleRef.current!.setPulseType(pulseType);
      isochronicModuleRef.current!.setIntensity(isIsoEnabled ? isoIntensity : 0, startTime);
      isochronicModuleRef.current!.start(startTime, carrierFreq, pulseFreq);
      masterGainRef.current!.gain.cancelScheduledValues(ctx.currentTime);
      masterGainRef.current!.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGainRef.current!.gain.exponentialRampToValueAtTime(Math.max(volume * fletcherGain, 0.001), ctx.currentTime + 2.5);
      setIsPlaying(true);
      if (!hasStarted) setHasStarted(true);
    }
  }, [isPlaying, initAudio, carrierFreq, pulseFreq, pulseType, isIsoEnabled, isoIntensity, volume, fletcherGain, hasStarted]);

  const changeSolfeggio = (id: string) => {
    setActiveSolfeggio(id);
    const freq = SOLFEGGIO.find(s => s.id === id)?.freq || 528;
    if (isPlaying && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      oscLeftRef.current?.frequency.setTargetAtTime(freq, now, 0.2);
      oscRightRef.current?.frequency.setTargetAtTime(freq + pulseFreq, now, 0.2);
      isochronicModuleRef.current?.setCarrierFreq(freq, now);
    }
  };

  const toggleIsochronic = () => {
    const newVal = !isIsoEnabled;
    setIsIsoEnabled(newVal);
    if (isochronicModuleRef.current && audioCtxRef.current) {
      isochronicModuleRef.current.setIntensity(newVal ? isoIntensity : 0);
    }
  };

  const toggleAutoMode = () => {
    const newVal = !isAutoMode;
    setIsAutoMode(newVal);
    if (newVal) setAutoBeatFreq(currentPreset.beatFreq);
  };

  useEffect(() => {
    if (isochronicModuleRef.current) isochronicModuleRef.current.setPulseType(pulseType);
  }, [pulseType]);

  useEffect(() => {
    initAudio().catch(console.error);
    return () => {
      oscLeftRef.current?.stop();
      oscLeftRef.current = null;
      oscRightRef.current?.stop();
      oscRightRef.current = null;
      if (isochronicModuleRef.current) {
        isochronicModuleRef.current.stop();
        isochronicModuleRef.current = null;
      }
      analyserRef.current = null;
      masterGainRef.current = null;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'closed') {
        audioCtxRef.current = null;
        ctx.close().catch(() => {});
      }
    };
  }, [initAudio]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-zinc-950 select-none">
      <div className="absolute inset-0 z-0">
        <Grainient className="w-full h-full">
          <div 
            className="absolute inset-0 opacity-20 transition-all duration-1000 pointer-events-none"
            style={{ background: `radial-gradient(circle at 50% 50%, hsla(${baseHue}, 70%, 50%, 0.2), transparent 70%)` }}
          />
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
        </Grainient>
      </div>

      <AnimatePresence mode="wait">
        {!hasStarted ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1.25 }}
            exit={{ opacity: 0, scale: 1.35, transition: { duration: 0.6 } }}
            className="fixed inset-0 flex flex-col items-center justify-center z-50 p-4 bg-zinc-950/20 backdrop-blur-sm pointer-events-auto"
          >
            <BorderGlow
              className="p-12 md:p-16 pb-14 md:pb-20"
              borderRadius={42}
              glowColor={`${baseHue} 80 60`}
              backgroundColor="rgba(9, 9, 11, 0.8)"
              animated={true}
              glowIntensity={1.2}
              colors={[`hsla(${baseHue}, 80%, 60%, 1)`, `hsla(${baseHue + 40}, 70%, 50%, 1)`, '#ffffff']}
            >
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center gap-12 md:gap-16"
              >
                <div className="text-center space-y-4">
                  <motion.h1 
                    className="text-4xl md:text-5xl font-bold font-mono uppercase tracking-[0.3em] text-white/90 whitespace-nowrap"
                    animate={{ textShadow: ["0 0 20px rgba(255,255,255,0)", "0 0 20px rgba(255,255,255,0.2)", "0 0 20px rgba(255,255,255,0)"] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  >
                    Neuro-Sync
                  </motion.h1>
                  <p className="text-xs font-light font-mono uppercase tracking-[0.6em] text-white/30 whitespace-nowrap">
                    Engine Hemi Sync
                  </p>
                </div>

                <button 
                  onClick={toggleSound}
                  className="group relative flex items-center justify-center w-28 h-28 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-700 hover:scale-110 active:scale-95"
                >
                  <div className="absolute inset-0 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-700 bg-white" />
                  <Play className="w-10 h-10 text-white/80 fill-white/10 group-hover:fill-white/20 transition-all" />
                  <motion.div 
                    className="absolute inset-0 border border-white/20 rounded-full"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </button>
              </motion.div>
            </BorderGlow>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 1 }}
              className="mt-12 flex flex-col items-center gap-3 pointer-events-none"
            >
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono font-light tracking-[0.4em] uppercase text-white/20">Developed by</span>
                <span className="text-[10px] font-mono font-medium tracking-[0.4em] uppercase text-white/60">Daniel Dobles</span>
              </div>
              <div className="w-16 h-px bg-white/10" />
              <span className="text-[9px] font-mono font-light tracking-[0.5em] uppercase text-white/15">DSP Sound Engineering</span>
            </motion.div>
          </motion.div>
        ) : (
          <div key="controls-container" className="fixed inset-0 flex items-center justify-center z-10 p-4 pointer-events-none">
            <motion.div
              key="controls"
              initial={{ opacity: 0, y: 40, scale: 1.15 }}
              animate={{ opacity: 1, y: 0, scale: 1.25 }}
              exit={{ opacity: 0, scale: 1.35, filter: 'blur(20px)' }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-full max-w-[550px] bg-zinc-950/80 backdrop-blur-2xl border border-white/10 rounded-[42px] p-6 flex flex-col gap-4 relative shadow-[0_48px_100px_rgba(0,0,0,0.8)] origin-center"
            >
              <div className="absolute inset-0 rounded-[42px] pointer-events-none" style={{ boxShadow: `inset 0 0 60px hsla(${baseHue}, 60%, 50%, 0.05)` }} />

              <div className="flex justify-between items-center">
                <div className="flex flex-col justify-center">
                  <h2 className="text-lg font-bold font-mono uppercase tracking-[0.25em] text-white/90 leading-none">        
                    Neuro-Sync <span className="text-white/30 ml-1 font-light">Engine</span>
                  </h2>
                </div>
                <div className="flex items-center gap-3 bg-white/[0.02] border border-white/5 px-4 py-2 rounded-2xl h-10">
                  <Volume2 className="w-3.5 h-3.5 text-white/20" />    
                  <div className="relative w-24 h-1 flex items-center">
                    <div className="absolute inset-0 bg-white/10 rounded-full" />
                    <motion.div className="absolute inset-y-0 left-0 rounded-full" animate={{ width: `${volume * 100}%` }} style={{ background: `linear-gradient(90deg, hsla(${baseHue}, 70%, 50%, 0.4), hsla(${baseHue}, 100%, 60%, 1))` }} />
                    <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <motion.div className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.4)] pointer-events-none" animate={{ left: `calc(${volume * 100}% - 6px)` }} transition={{ type: "spring", stiffness: 400, damping: 40 }} />
                  </div>
                  <span className="text-[9px] font-mono text-white/30 w-7 text-right tabular-nums">{Math.round(volume * 100)}%</span>
                </div>
              </div>

              <motion.div animate={{ backgroundImage: `radial-gradient(ellipse 100% 100% at center, white 0%, hsla(${baseHue}, 100%, 70%, 1) 30%, hsla(${baseHue}, 80%, 40%, 0.5) 70%, transparent 100%)`, opacity: 1, boxShadow: `0 0 20px hsla(${baseHue}, 80%, 50%, 0.3)` }} className="w-full h-px bg-fixed" />

              <div className="flex bg-white/[0.02] border border-white/5 p-1 rounded-2xl relative">
                <button
                  onClick={toggleAutoMode}
                  className={cn(
                    "flex-1 py-1.5 text-[9px] font-mono uppercase tracking-wider rounded-xl transition-all duration-300 flex items-center justify-center gap-2",
                    isAutoMode ? "bg-white/10 text-white font-medium" : "text-white/30 hover:text-white/60"
                  )}
                >
                  <Activity className={cn("w-3 h-3", isAutoMode && "animate-pulse")} />
                  Stochastic Sync
                </button>
                <div className="w-px h-4 bg-white/5 self-center" />
                <button
                  onClick={toggleIsochronic}
                  className={cn(
                    "flex-1 py-1.5 text-[9px] font-mono uppercase tracking-wider rounded-xl transition-all duration-300",
                    isIsoEnabled ? "bg-white/10 text-white font-medium" : "text-white/30 hover:text-white/60"
                  )}
                >
                  Isochronic Layer
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex justify-center text-white/20">
                  <span className="text-[9px] font-bold font-mono uppercase tracking-[0.3em]">Resonance Carriers</span>      
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {SOLFEGGIO.map((s) => (
                    <button key={s.id} onClick={() => changeSolfeggio(s.id)} className={cn("relative flex flex-col items-center justify-center py-4 rounded-[20px] border transition-all duration-300 group overflow-hidden", activeSolfeggio === s.id ? "border-white/20 bg-white/5 text-white" : "border-white/5 bg-white/[0.02] text-white/30 hover:bg-white/[0.04]")}>
                      <span className="text-xs font-mono font-medium">{s.name.split(' ')[0]}</span>
                      <span className="text-[8px] font-mono opacity-40 uppercase tracking-tighter mt-1">{s.description.split(' ')[0]}</span>
                      {activeSolfeggio === s.id && <motion.div layoutId="solf-active" className="absolute inset-0 bg-white/[0.02] pointer-events-none" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.id} onClick={() => changePreset(p)} className={cn("flex flex-col items-center justify-center py-3 rounded-[16px] border transition-all duration-500", activePreset === p.id ? "border-white/20 bg-white/10 text-white" : "border-white/5 bg-white/[0.01] text-white/20 hover:text-white/40")}>
                    <div className={cn("transition-transform duration-700", activePreset === p.id ? "scale-110" : "scale-90 opacity-40")}>
                      {React.cloneElement(p.icon as React.ReactElement<any>, { className: "w-3.5 h-3.5" })}
                    </div>
                    <span className="text-[6px] font-mono font-bold mt-1.5 uppercase tracking-widest">{p.name}</span>        
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center gap-4 mt-2">
                <div className="flex-1 bg-white/[0.02] py-4 rounded-[24px] border border-white/5 flex flex-col items-center gap-1">
                  <span className="text-[7px] text-white/20 uppercase font-bold tracking-[0.2em]">Carrier</span>   
                  <div className="text-lg font-mono font-light text-white/80 tabular-nums">
                    {carrierFreq}<span className="text-[9px] ml-0.5 opacity-20">Hz</span>
                  </div>
                </div>

                <button onClick={toggleSound} className="w-20 h-20 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all duration-700 relative group overflow-hidden shrink-0">
                  <div className="absolute inset-0 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-700" style={{ background: `hsl(${baseHue}, 80%, 50%)` }} />
                  {isPlaying ? <Pause className="w-8 h-8 text-white/90" /> : <Play className="w-8 h-8 text-white/90 translate-x-0.5" />}
                </button>

                <div className="flex-1 bg-white/[0.02] py-4 rounded-[24px] border border-white/5 flex flex-col items-center gap-1">
                  <span className="text-[7px] text-white/20 uppercase font-bold tracking-[0.2em]">Binaural Pulse</span>  
                  <div className="text-lg font-mono font-medium text-white/80 tabular-nums">
                    <span ref={pulseTextRef}>{pulseFreq.toFixed(2)}</span>
                    <span className="text-[9px] ml-0.5 opacity-20">Hz</span>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-white/5 pt-4 min-h-[60px] flex flex-col items-center justify-center text-center gap-3">
                {isIsoEnabled ? (
                  <>
                    <div className="w-full flex items-center justify-between px-2 gap-4">
                      <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest shrink-0">Iso Intensity</span>
                      <div className="relative flex-1 h-1 flex items-center">
                        <div className="absolute inset-0 bg-white/10 rounded-full" />
                        <motion.div className="absolute inset-y-0 left-0 rounded-full" animate={{ width: `${isoIntensity * 100}%` }} style={{ background: `linear-gradient(90deg, hsla(${baseHue}, 50%, 50%, 0.5), hsla(${baseHue}, 100%, 70%, 1))` }} />
                        <input type="range" min="0" max="1" step="0.01" value={isoIntensity} onChange={(e) => setIsoIntensity(parseFloat(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                        <motion.div className="absolute w-2.5 h-2.5 bg-white rounded-full" animate={{ left: `calc(${isoIntensity * 100}% - 5px)` }} />
                      </div>
                      <span className="text-[9px] font-mono text-white/60 w-10 text-right tabular-nums">{Math.round(isoIntensity * 100)}%</span>
                    </div>
                  </>
                ) : (
                  <span className="text-[9px] font-mono text-white/10 uppercase tracking-[0.4em]">Stochastic Model Active</span>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
