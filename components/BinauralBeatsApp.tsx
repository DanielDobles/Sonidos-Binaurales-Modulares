'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, Sparkles, Moon, Brain, Zap, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

interface WavePreset { id: string; name: string; range: string; beatFreq: number; carrierFreq: number; icon: React.ReactNode; }

// --- TRUE GLSL WAVE DISTORTION SHADER ---
function AuroraWaveform({ 
  isPlaying, 
  analyserRef, 
  baseHue, 
  binauralBeatFreq, 
  pulseTextRef, 
  startTimeRef 
}: { 
  isPlaying: boolean;
  analyserRef: React.RefObject<AnalyserNode | null>;
  baseHue: number;
  binauralBeatFreq: number;
  pulseTextRef: React.RefObject<HTMLSpanElement | null>;
  startTimeRef: React.RefObject<number>;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  
  // We use a DataTexture to pass the audio array directly to the GPU
  const dataArray = useMemo(() => new Uint8Array(256), []);
  const audioTexture = useMemo(() => {
    const tex = new THREE.DataTexture(dataArray, 256, 1, THREE.RedFormat);
    tex.needsUpdate = true;
    return tex;
  }, [dataArray]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uAudioBuffer: { value: audioTexture },
    uFrequency: { value: binauralBeatFreq },
    uIsPlaying: { value: 0.0 }
  }), [audioTexture, binauralBeatFreq]);

  useFrame((state) => {
    const { clock } = state;
    const time = clock.getElapsedTime();
    
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uColor.value.setHSL(baseHue / 360, 0.8, 0.5);
      materialRef.current.uniforms.uFrequency.value = binauralBeatFreq;
      materialRef.current.uniforms.uIsPlaying.value = isPlaying ? 1.0 : 0.0;

      if (isPlaying && analyserRef.current) {
        // Read raw audio data
        analyserRef.current.getByteTimeDomainData(dataArray);
        // Tell GPU the texture data has changed
        materialRef.current.uniforms.uAudioBuffer.value.needsUpdate = true;
      }
    }

    // High-Frequency Pulse Telemetry (60 FPS DOM Injection)
    if (isPlaying && pulseTextRef.current) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const lfoModulation = Math.sin(elapsed * Math.PI * 2 * 0.04) * 0.3;
      const currentPulse = binauralBeatFreq + lfoModulation;
      pulseTextRef.current.textContent = currentPulse.toFixed(1) + " Hz";
    }

    // Subtle gentle breath of the whole mesh
    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(time * 0.1) * 0.02;
      meshRef.current.rotation.x = -Math.PI / 8 + Math.sin(time * 0.05) * 0.05;
    }
  });

  const shaderArgs = useMemo(() => ({
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uFrequency;
      uniform float uIsPlaying;
      uniform sampler2D uAudioBuffer;
      
      // Simplex noise function for organic gaseous distortion
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ; m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        
        // Read raw audio displacement from the DataTexture
        // r channel holds the 0-255 byte value. Subtract 0.5 (128/255) to center at 0.
        float audioData = texture2D(uAudioBuffer, vec2(vUv.x, 0.5)).r - 0.5;
        
        // Physical binding: Distort Y and Z based on real audio data
        float rawDisplacement = audioData * 8.0 * uIsPlaying;
        
        // Add organic Simplex noise to mimic Soft Aurora gaseousness
        float noise = snoise(vec2(pos.x * 0.5 + uTime * 0.2, pos.y * 0.5 - uTime * 0.3)) * 0.5;
        
        // Add a mathematical pulse representing the Binaural Beat frequency
        float beatPulse = sin(pos.x * 2.0 + uTime * uFrequency * 0.2) * 0.4;
        
        // Blend raw audio with gaseous noise and the beat pulse
        pos.z += rawDisplacement + noise + beatPulse;
        pos.y += (rawDisplacement * 0.5) + noise * 0.5;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uIsPlaying;

      void main() {
        // High-end Soft Aurora fading: intense center, fully transparent edges
        float edgeY = smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float edgeX = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        float alphaMask = edgeY * edgeX;
        
        // Add moving plasma glow across the X axis
        float glow = sin(vUv.x * 10.0 + uTime * 1.5) * 0.5 + 0.5;
        vec3 finalColor = mix(uColor, vec3(1.0, 1.0, 1.0), glow * 0.3);
        
        // Base opacity drops when not playing
        float baseOpacity = mix(0.1, 0.6, uIsPlaying);
        
        gl_FragColor = vec4(finalColor, alphaMask * baseOpacity * (glow + 0.5));
      }
    `
  }), []);

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} rotation={[-Math.PI / 8, 0, 0]}>
      {/* Dense subdivision for high-fidelity vertex distortion */}
      <planeGeometry args={[14, 4, 256, 32]} />
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

// --- MAIN BINAURAL APPLICATION ---
export default function BinauralBeatsApp() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180);
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10);
  const [activePreset, setActivePreset] = useState<string>('alpha');
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  
  const pulseTextRef = useRef<HTMLSpanElement | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const presets: WavePreset[] = [
    { id: 'delta', name: 'Delta', range: '1-4Hz', beatFreq: 2.5, carrierFreq: 120, icon: <Moon className="w-4 h-4" /> },
    { id: 'theta', name: 'Theta', range: '4-8Hz', beatFreq: 6.0, carrierFreq: 150, icon: <Sparkles className="w-4 h-4" /> },
    { id: 'alpha', name: 'Alpha', range: '8-12Hz', beatFreq: 10.0, carrierFreq: 180, icon: <Compass className="w-4 h-4" /> },
    { id: 'beta', name: 'Beta', range: '12-30Hz', beatFreq: 18.0, carrierFreq: 220, icon: <Zap className="w-4 h-4" /> },
    { id: 'gamma', name: 'Gamma', range: '30-45Hz', beatFreq: 38.0, carrierFreq: 260, icon: <Brain className="w-4 h-4" /> },
  ];

  // Physical Chromatic Mapping: 100Hz (Low) -> Red (0) | 350Hz (High) -> Violet (280)
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
    if (pulseTextRef.current) pulseTextRef.current.textContent = p.beatFreq.toFixed(1) + " Hz";
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
      if (pulseTextRef.current) pulseTextRef.current.textContent = binauralBeatFreq.toFixed(1) + " Hz";
    } else {
      startTimeRef.current = Date.now();
      const master = ctx.createGain();
      master.connect(ctx.destination);
      const [oL, oR] = [ctx.createOscillator(), ctx.createOscillator()];
      const aL = ctx.createAnalyser();
      const [pL, pR] = [ctx.createStereoPanner(), ctx.createStereoPanner()];
      
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.04; // 25s hardware-accelerated cycle
      lfoGain.gain.value = 0.3;    // ±0.3Hz micro-modulation
      
      aL.fftSize = 256; pL.pan.value = -1; pR.pan.value = 1;
      
      // Fix 440Hz jump
      oL.frequency.setValueAtTime(carrierFreq, ctx.currentTime);
      oR.frequency.setValueAtTime(carrierFreq + binauralBeatFreq, ctx.currentTime);
      
      oL.connect(aL).connect(pL).connect(master);
      oR.connect(pR).connect(master);
      lfo.connect(lfoGain).connect(oR.frequency);
      
      oL.start(); oR.start(); lfo.start();
      oscLeftRef.current = oL; oscRightRef.current = oR;
      lfoRef.current = lfo; lfoGainRef.current = lfoGain;
      analyserLeftRef.current = aL;
      setIsPlaying(true);
    }
  };

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
        className="absolute inset-0 opacity-20 transition-all duration-1000 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 50%, hsla(${baseHue}, 70%, 50%, 0.15), transparent 70%)` }}
      />
      
      {/* --- REACT THREE FIBER INTERACTIVE CANVAS --- */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 6], fov: 40 }}>
          <ambientLight intensity={0.4} />
          <AuroraWaveform 
            isPlaying={isPlaying} 
            analyserRef={analyserLeftRef} 
            baseHue={baseHue} 
            binauralBeatFreq={binauralBeatFreq}
            pulseTextRef={pulseTextRef}
            startTimeRef={startTimeRef}
          />
        </Canvas>
      </div>
      
      {/* --- GLASSMORPHIC DASHBOARD UI --- */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-zinc-950/40 backdrop-blur-2xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.9)] rounded-[32px] p-8 z-10 flex flex-col gap-8 relative overflow-hidden"
      >
        <div 
          className="absolute inset-0 border border-white/5 rounded-[32px] pointer-events-none"
          style={{ boxShadow: `inset 0 0 25px hsla(${baseHue}, 70%, 50%, 0.05)` }}
        />

        <div className="text-center space-y-1">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/20">Psychoacoustic Processor</h2>
          <div className="flex items-center justify-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: `hsl(${baseHue}, 80%, 60%)` }} />
            <h1 className="text-sm font-semibold text-white/70 uppercase tracking-widest">Spatial Aurora Engine</h1>
          </div>
        </div>

        {/* Adaptive Wave Preset Grid */}
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
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-500",
                  isActive ? "shadow-[inset_0_0_15px_rgba(255,255,255,0.01)]" : "hover:border-white/20"
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

        {/* Dynamic Playback Control */}
        <div className="flex justify-center relative">
          <div 
            className="absolute inset-0 blur-[50px] rounded-full opacity-20 transition-all duration-700"
            style={{ background: `hsl(${baseHue}, 80%, 50%)` }}
          />
          <button
            onClick={runSoundEngine}
            className="relative w-20 h-20 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center transition-all duration-300 shadow-2xl group"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-white/90 group-active:scale-90 transition-transform" />
            ) : (
              <Play className="w-8 h-8 text-white/90 translate-x-0.5 group-active:scale-90 transition-transform" />
            )}
          </button>
        </div>

        {/* Clinical Telemetry Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-bold mb-1">Carrier Frequency</span>
            <div className="font-mono text-base font-medium text-white/80 tabular-nums">
              {carrierFreq}<span className="text-[10px] ml-1 opacity-30">Hz</span>
            </div>
          </div>
          <div className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[8px] text-white/20 uppercase tracking-[0.2em] font-bold mb-1">Pulse Resonance</span>
            <div className="font-mono text-base font-medium text-white/80 tabular-nums">
              <span ref={pulseTextRef}>{binauralBeatFreq.toFixed(1)} Hz</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
