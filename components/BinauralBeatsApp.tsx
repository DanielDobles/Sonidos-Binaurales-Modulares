'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Sparkles, 
  RefreshCw, 
  Volume2, 
  Info, 
  Brain, 
  Sliders, 
  Compass, 
  Shuffle, 
  Moon, 
  BookOpen, 
  Heart, 
  Activity, 
  Zap, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Interfaces for structured psychoacoustic programs
interface ModulationStep {
  stepName: string;
  carrierOffset: number;
  beatOffset: number;
}

interface CustomAIPres {
  sessionName: string;
  explanation: string;
  baseCarrierFrequency: number;
  binauralBeatFrequency: number;
  autoModulationPattern: ModulationStep[];
  suggestedAmbient: string;
}

// Preset definition
interface WavePreset {
  id: string;
  name: string;
  range: string;
  beatFreq: number;
  carrierFreq: number;
  description: string;
  icon: React.ReactNode;
}

export default function BinauralBeatsApp() {
  // --- SOUND SYNTHESIS REFERENCES ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // Left and Right core oscillators & gain nodes for the binaural offset
  const oscLeftRef = useRef<OscillatorNode | null>(null);
  const oscRightRef = useRef<OscillatorNode | null>(null);
  const oscLeftGainRef = useRef<GainNode | null>(null);
  const oscRightGainRef = useRef<GainNode | null>(null);
  
  // Audio Analysers for left and right outputs (Stereo visualisation)
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);
  
  // Master control nodes
  const masterGainRef = useRef<GainNode | null>(null);
  
  // Ambient noise generator nodes
  const ambientSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const ambientFilterRef = useRef<BiquadFilterNode | null>(null);
  const ambientLFORef = useRef<OscillatorNode | null>(null);
  const ambientLFOGainRef = useRef<GainNode | null>(null);

  // --- REACT STATES ---
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [carrierFreq, setCarrierFreq] = useState<number>(180); // Hz
  const [binauralBeatFreq, setBinauralBeatFreq] = useState<number>(10); // Hz (Alpha)
  const [masterVolume, setMasterVolume] = useState<number>(0.5); // 0 - 1
  const [ambientVolume, setAmbientVolume] = useState<number>(0.0); // 0 - 1
  const [ambientType, setAmbientType] = useState<string>('none'); // Default to none per user request
  const [waveType, setWaveType] = useState<'sine' | 'triangle'>('sine');
  
  // Modulator parameters
  const [isModulationEnabled, setIsModulationEnabled] = useState<boolean>(true);
  const [currentModStep, setCurrentModStep] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  
  // AI program states
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeProgramName, setActiveProgramName] = useState<string>('Ondas de Calma Inicial');
  const [aiExplanation, setAiExplanation] = useState<string>('Esta sesión inicial combina ondas portadoras de 180Hz con un pulso de 10Hz en el rango Alfa para sincronizar tus hemisferios y disolver el estrés con micro-variaciones controladas.');
  
  // Adaptive modulation pattern with micro-variations that keep the frequency within the same brainwave range
  const [modulationSteps, setModulationSteps] = useState<ModulationStep[]>([
    { stepName: 'Sincronización Inicial', carrierOffset: 0, beatOffset: 0 },
    { stepName: 'Optimización de Frecuencia', carrierOffset: 4, beatOffset: 0.3 },
    { stepName: 'Alineación Cortical', carrierOffset: -3, beatOffset: -0.2 },
    { stepName: 'Estabilización Transitoria', carrierOffset: 6, beatOffset: 0.5 },
    { stepName: 'Resonancia Focal', carrierOffset: -5, beatOffset: -0.4 },
    { stepName: 'Armonización Integrada', carrierOffset: 2, beatOffset: 0 }
  ]);

  // Canvas visualizer reference
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Default wave ranges
  const presets: WavePreset[] = [
    { 
      id: 'delta', 
      name: 'Ondas Delta', 
      range: '1 - 4 Hz', 
      beatFreq: 2.5, 
      carrierFreq: 120, 
      description: 'Sueño profundo, reparación celular, descanso trascendental libre de sueños.',
      icon: <Moon className="w-4 h-4" /> 
    },
    { 
      id: 'theta', 
      name: 'Ondas Theta', 
      range: '4 - 8 Hz', 
      beatFreq: 6.0, 
      carrierFreq: 150, 
      description: 'Meditación budista profunda, estados creativos fluidos, acceso al subconsciente.',
      icon: <Sparkles className="w-4 h-4" /> 
    },
    { 
      id: 'alpha', 
      name: 'Ondas Alfa', 
      range: '8 - 12 Hz', 
      beatFreq: 10.0, 
      carrierFreq: 180, 
      description: 'Relajación consciente, estado de flujo cognitivo, absorción de nuevo aprendizaje.',
      icon: <Compass className="w-4 h-4" /> 
    },
    { 
      id: 'beta', 
      name: 'Ondas Beta', 
      range: '12 - 30 Hz', 
      beatFreq: 18.0, 
      carrierFreq: 220, 
      description: 'Enfoque ejecutivo acelerado, razonamiento analítico, resolución de problemas complejos.',
      icon: <Zap className="w-4 h-4" /> 
    },
    { 
      id: 'gamma', 
      name: 'Ondas Gamma', 
      range: '30 - 45 Hz', 
      beatFreq: 38.0, 
      carrierFreq: 260, 
      description: 'Comprensión integral fulminante, máxima concentración, memoria de corto plazo integrada.',
      icon: <Brain className="w-4 h-4 text-emerald-400" /> 
    },
  ];

  // Map beat frequency to active band
  const getActivePresetName = useCallback((freq: number) => {
    if (freq < 4) return 'Delta (Sueño Profundo)';
    if (freq < 8) return 'Theta (Meditación)';
    if (freq < 12) return 'Alfa (Calma Alerta)';
    if (freq < 30) return 'Beta (Cognición)';
    return 'Gamma (Procesamiento Elevado)';
  }, []);

  // --- AUDIO SYNTHESIS ENGINE FUNCTIONS ---

  // Generate Noise buffer (Brownian/Pink noise)
  const generateNoiseBuffer = (type: 'pink' | 'brown', audioCtx: AudioContext): AudioBuffer => {
    const bufferSize = 4 * audioCtx.sampleRate; // 4 seconds loop
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brownian noise integrator formula
        data[i] = (lastOut + (0.025 * white)) / 1.025;
        lastOut = data[i];
        data[i] *= 4.5; // Compensate amplitude loss
      }
    } else {
      // Pink noise algorithm (Voss-McCartney approximation)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] *= 0.11; // Normalize
      }
    }
    return buffer;
  };

  // Re-start ambient background audionodes
  const configureAmbientNode = useCallback(() => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx || !isPlaying) return;

    // Stop existing source if playing
    if (ambientSourceRef.current) {
      try { ambientSourceRef.current.stop(); } catch (e) {}
      ambientSourceRef.current.disconnect();
      ambientSourceRef.current = null;
    }
    if (ambientLFORef.current) {
      try { ambientLFORef.current.stop(); } catch (e) {}
      ambientLFORef.current.disconnect();
      ambientLFORef.current = null;
    }

    if (ambientType === 'none') {
      if (ambientGainRef.current) {
        ambientGainRef.current.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
      }
      return;
    }

    // Set ambient gain value smoothly
    if (ambientGainRef.current) {
      ambientGainRef.current.gain.setTargetAtTime(ambientVolume * 0.4, audioCtx.currentTime, 0.5);
    }

    // Generate buffer
    const bufferType = ambientType === 'cosmic' ? 'brown' : (ambientType as 'pink' | 'brown');
    const buffer = generateNoiseBuffer(bufferType, audioCtx);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Connect source to filter
    if (ambientFilterRef.current) {
      source.connect(ambientFilterRef.current);
    }

    // High performance slow filtering sweep for Cosmic wind effect
    if (ambientType === 'cosmic' && ambientFilterRef.current && ambientLFOGainRef.current) {
      ambientFilterRef.current.type = 'lowpass';
      ambientFilterRef.current.frequency.setValueAtTime(450, audioCtx.currentTime);
      ambientFilterRef.current.Q.setValueAtTime(3.5, audioCtx.currentTime);

      const lfo = audioCtx.createOscillator();
      const lfoGain = ambientLFOGainRef.current;

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.06, audioCtx.currentTime); // very slow 0.06Hz sweep
      lfoGain.gain.setValueAtTime(250, audioCtx.currentTime); // span +/- 250Hz around cutoff

      lfo.connect(lfoGain);
      lfoGain.connect(ambientFilterRef.current.frequency);
      lfo.start();
      
      ambientLFORef.current = lfo;
    } else if (ambientFilterRef.current) {
      // Direct pass filter with fixed comfortable static
      ambientFilterRef.current.type = 'lowpass';
      ambientFilterRef.current.frequency.setValueAtTime(1200, audioCtx.currentTime);
      ambientFilterRef.current.Q.setValueAtTime(0.5, audioCtx.currentTime);
    }

    source.start();
    ambientSourceRef.current = source;
  }, [isPlaying, ambientType, ambientVolume]);

  // Handle manual frequency slides with strict band-locking for the active brainwave state
  const updateFrequencies = useCallback((base: number, beat: number) => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx || !isPlaying) return;

    // Binaural calculations
    // Left ear plays: Base - (Beat / 2)
    // Right ear plays: Base + (Beat / 2)
    const activeMod = isModulationEnabled ? modulationSteps[currentModStep] : null;
    const carrierOffset = activeMod ? activeMod.carrierOffset : 0;
    const beatOffset = activeMod ? activeMod.beatOffset : 0;

    const actualBase = Math.max(80, base + carrierOffset);
    
    // Determine corresponding clinical brainwave range limits based on the unmodulated, selected base beat frequency:
    // Delta: 1 - 4 Hz
    // Theta: 4 - 8 Hz
    // Alfa / Alpha: 8 - 12 Hz
    // Beta: 12 - 30 Hz
    // Gamma: 30 - 45 Hz
    let minWaveFreq = 1.0;
    let maxWaveFreq = 45.0;
    
    if (beat < 4.0) {
      minWaveFreq = 1.0;
      maxWaveFreq = 4.0;
    } else if (beat < 8.0) {
      minWaveFreq = 4.0;
      maxWaveFreq = 8.0;
    } else if (beat < 12.0) {
      minWaveFreq = 8.0;
      maxWaveFreq = 12.0;
    } else if (beat < 30.0) {
      minWaveFreq = 12.0;
      maxWaveFreq = 30.0;
    } else {
      minWaveFreq = 30.0;
      maxWaveFreq = 45.0;
    }

    // Keep the actual beat frequency of micro-variations locked inside the selected base range
    const actualBeat = Math.min(maxWaveFreq, Math.max(minWaveFreq, beat + beatOffset));

    const freqLeft = actualBase - (actualBeat / 2);
    const freqRight = actualBase + (actualBeat / 2);

    const now = audioCtx.currentTime;
    if (oscLeftRef.current && oscRightRef.current) {
      // Smooth portamento preventing click & brain shocks
      oscLeftRef.current.frequency.setTargetAtTime(freqLeft, now, 1.2);
      oscRightRef.current.frequency.setTargetAtTime(freqRight, now, 1.2);
    }
  }, [isPlaying, isModulationEnabled, modulationSteps, currentModStep]);

  // Main system sound trigger
  const runSoundEngine = async () => {
    // Initialize Web Audio context
    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtxClass();
    }

    const audioCtx = audioCtxRef.current;

    // Resume context if browser blocked it
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (isPlaying) {
      // Disconnect and silence nodes
      stopSoundEngine();
      setIsPlaying(false);
      return;
    }

    // BUILD MASTER PIPELINE
    const masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
    masterGainRef.current = masterGain;

    // BUILD AMBIENT STATIC SYSTEM
    const ambientGain = audioCtx.createGain();
    ambientGain.gain.setValueAtTime(ambientVolume * 0.4, audioCtx.currentTime);
    ambientGain.connect(masterGain);
    ambientGainRef.current = ambientGain;

    const ambientFilter = audioCtx.createBiquadFilter();
    ambientFilter.connect(ambientGain);
    ambientFilterRef.current = ambientFilter;

    const ambientLFOGain = audioCtx.createGain();
    ambientLFOGain.connect(ambientFilter.frequency);
    ambientLFOGainRef.current = ambientLFOGain;

    // BUILD BINAURAL CHANNELS
    // Config stereo splitter (Separate left and right channels)
    const analyserLeft = audioCtx.createAnalyser();
    analyserLeft.fftSize = 512;
    analyserLeftRef.current = analyserLeft;

    const analyserRight = audioCtx.createAnalyser();
    analyserRight.fftSize = 512;
    analyserRightRef.current = analyserRight;

    // Stereo Panner Nodes
    const pannerLeft = audioCtx.createStereoPanner();
    pannerLeft.pan.setValueAtTime(-1.0, audioCtx.currentTime); // Complete left ear

    const pannerRight = audioCtx.createStereoPanner();
    pannerRight.pan.setValueAtTime(1.0, audioCtx.currentTime); // Complete right ear

    // Gains per channel
    const oscLeftGain = audioCtx.createGain();
    oscLeftGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    oscLeftGainRef.current = oscLeftGain;

    const oscRightGain = audioCtx.createGain();
    oscRightGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    oscRightGainRef.current = oscRightGain;

    // Connect Left System: Oscillator -> Analyser -> Pan Left -> Master
    oscLeftGain.connect(analyserLeft);
    analyserLeft.connect(pannerLeft);
    pannerLeft.connect(masterGain);

    // Connect Right System: Oscillator -> Analyser -> Pan Right -> Master
    oscRightGain.connect(analyserRight);
    analyserRight.connect(pannerRight);
    pannerRight.connect(masterGain);

    // Create Left and Right Sine/Triangle Oscillators
    const oscLeft = audioCtx.createOscillator();
    const oscRight = audioCtx.createOscillator();

    oscLeft.type = waveType;
    oscRight.type = waveType;

    oscLeftRef.current = oscLeft;
    oscRightRef.current = oscRight;

    oscLeft.connect(oscLeftGain);
    oscRight.connect(oscRightGain);

    // Trigger oscillations
    oscLeft.start();
    oscRight.start();

    setIsPlaying(true);
  };

  // Safe sound shutdown
  const stopSoundEngine = () => {
    // Left osc cleanup
    if (oscLeftRef.current) {
      try { oscLeftRef.current.stop(); } catch (e) {}
      oscLeftRef.current.disconnect();
      oscLeftRef.current = null;
    }
    // Right osc cleanup
    if (oscRightRef.current) {
      try { oscRightRef.current.stop(); } catch (e) {}
      oscRightRef.current.disconnect();
      oscRightRef.current = null;
    }
    // Ambient source cleanup
    if (ambientSourceRef.current) {
      try { ambientSourceRef.current.stop(); } catch (e) {}
      ambientSourceRef.current.disconnect();
      ambientSourceRef.current = null;
    }
    // LFO cleanup
    if (ambientLFORef.current) {
      try { ambientLFORef.current.stop(); } catch (e) {}
      ambientLFORef.current.disconnect();
      ambientLFORef.current = null;
    }
    // Disconnect pipelines
    if (masterGainRef.current) {
      masterGainRef.current.disconnect();
      masterGainRef.current = null;
    }
    setIsPlaying(false);
    setSecondsRemaining(30);
  };

  // --- REACT ACTIONS ON PLAY & PARAM CHANGE ---

  // Handle active playback frequency updating
  useEffect(() => {
    if (isPlaying) {
      updateFrequencies(carrierFreq, binauralBeatFreq);
    }
  }, [isPlaying, carrierFreq, binauralBeatFreq, updateFrequencies, currentModStep, isModulationEnabled]);

  // Restart ambient noise when ambient preferences change
  useEffect(() => {
    configureAmbientNode();
  }, [isPlaying, ambientType, configureAmbientNode]);

  // Adjust volume levels dynamically
  useEffect(() => {
    const audioCtx = audioCtxRef.current;
    if (audioCtx && isPlaying) {
      if (masterGainRef.current) {
        masterGainRef.current.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.1);
      }
      if (ambientGainRef.current) {
        ambientGainRef.current.gain.setTargetAtTime(ambientVolume * 0.4, audioCtx.currentTime, 0.1);
      }
    }
  }, [masterVolume, ambientVolume, isPlaying]);

  // Handle wave type selector adjustments
  useEffect(() => {
    if (isPlaying && oscLeftRef.current && oscRightRef.current) {
      oscLeftRef.current.type = waveType;
      oscRightRef.current.type = waveType;
    }
  }, [waveType, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSoundEngine();
    };
  }, []);

  // --- MODULAR TIMELINE TIMER ENGINE (30s) ---
  useEffect(() => {
    if (!isPlaying || !isModulationEnabled) {
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Time's up! Rotate to next phase step seamlessly.
          setCurrentModStep((step) => {
            const nextStep = (step + 1) % modulationSteps.length;
            return nextStep;
          });
          return 30; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, isModulationEnabled, modulationSteps.length]);

  // If modulation changes, trigger a quick refresh on frequencies
  useEffect(() => {
    if (isPlaying) {
      updateFrequencies(carrierFreq, binauralBeatFreq);
    }
  }, [currentModStep, isPlaying, updateFrequencies, carrierFreq, binauralBeatFreq]);

  // --- RECHART DRAWING REALTIME VISUALIZER (Full-screen Iridescent Waveform) ---
  const sparksRef = useRef<{x: number, y: number, vy: number, size: number, alpha: number}[]>([]);

  useEffect(() => {
    let animationFrameId: number;

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    const renderVisuals = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const analyserL = analyserLeftRef.current;
      const analyserR = analyserRightRef.current;

      const bufferLengthL = analyserL ? analyserL.frequencyBinCount : 256;
      const bufferLengthR = analyserR ? analyserR.frequencyBinCount : 256;

      const dataArrayL = new Uint8Array(bufferLengthL);
      const dataArrayR = new Uint8Array(bufferLengthR);

      const timeSec = Date.now() / 1000;

      // Fetch array data on active playing
      if (isPlaying && analyserL && analyserR) {
        analyserL.getByteTimeDomainData(dataArrayL);
        analyserR.getByteTimeDomainData(dataArrayR);
      }

      // Calculate actual live frequencies with offsets
      const activeMod = isModulationEnabled ? modulationSteps[currentModStep] : null;
      const beatOffset = activeMod ? activeMod.beatOffset : 0;
      
      let minWaveFreq = 1.0;
      let maxWaveFreq = 45.0;
      if (binauralBeatFreq < 4.0) {
        minWaveFreq = 1.0;
        maxWaveFreq = 4.0;
      } else if (binauralBeatFreq < 8.0) {
        minWaveFreq = 4.0;
        maxWaveFreq = 8.0;
      } else if (binauralBeatFreq < 12.0) {
        minWaveFreq = 8.0;
        maxWaveFreq = 12.0;
      } else if (binauralBeatFreq < 30.0) {
        minWaveFreq = 12.0;
        maxWaveFreq = 30.0;
      } else {
        minWaveFreq = 30.0;
        maxWaveFreq = 45.0;
      }

      const currentPulse = Math.min(maxWaveFreq, Math.max(minWaveFreq, binauralBeatFreq + beatOffset));

      // DYNAMIC SPECTRAL COLOR SYSTEMS (HSL SINUSOIDAL INTERPOLATION BASED ON CARRIER)
      // Carrier frequency represents the actual sound pitch (from 100Hz graves to 350Hz agudos)
      const carrierRatio = Math.max(0, Math.min(1, (carrierFreq - 100) / 250));
      // Base hue from 0 (Red) to 280 (Violet/Purple)
      const baseHue = carrierRatio * 280;

      // Dynamic palette colors
      const colorCore = `hsl(${baseHue}, 100%, 90%)`;
      const colorMain = `hsl(${baseHue}, 100%, 55%)`;
      const colorSecondary = `hsl(${(baseHue + 40) % 360}, 100%, 48%)`;
      const colorDeep = `hsl(${(baseHue - 20 + 360) % 360}, 100%, 30%)`;

      // Calculate amplitude for scaling sparks and background pulse
      let maxVal = 0;
      if (isPlaying) {
        for (let i = 0; i < bufferLengthL; i++) {
          const val = Math.abs(dataArrayL[i] - 128);
          if (val > maxVal) maxVal = val;
        }
      }
      const amplitude = isPlaying ? (maxVal / 128.0) : 0.05;

      // --- SAVE CTX AND APPLY DPR SCALE FOR HIGH-DPI SHARPNESS ---
      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Draw Deep Cosmic Void Background
      const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.max(width, height));
      bgGrad.addColorStop(0, `hsla(${baseHue}, 100%, 4%, ${0.2 + amplitude * 0.15})`);
      bgGrad.addColorStop(0.6, `hsla(${(baseHue + 30) % 360}, 100%, 2%, 0.1)`);
      bgGrad.addColorStop(1, '#020204');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Faint Spherical Orbits (Planetary waves)
      const centerY = height * 0.45;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      const radii = [height * 0.22, height * 0.38, height * 0.40];
      const opacities = [0.03, 0.015, 0.01];
      radii.forEach((r, idx) => {
        ctx.strokeStyle = `rgba(255, 255, 255, ${opacities[idx]})`;
        ctx.beginPath();
        ctx.arc(width / 2, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.ellipse(width / 2, centerY, r * 1.6, r * 0.5, Math.PI / 10 + timeSec * 0.003 * (idx === 0 ? 1 : -1), 0, Math.PI * 2);
        ctx.stroke();
      });

      // 3. Draw Sparks Particle System (Drifting across the cosmic background)
      if (sparksRef.current.length === 0) {
        for (let i = 0; i < 60; i++) {
          sparksRef.current.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vy: (0.3 + Math.random() * 0.9),
            size: (0.8 + Math.random() * 2.2),
            alpha: 0.1 + Math.random() * 0.6
          });
        }
      }

      sparksRef.current.forEach((spark) => {
        spark.y -= spark.vy * (1 + amplitude * 1.5);
        spark.x += Math.sin(spark.y * 0.01 + timeSec) * 0.3;

        ctx.fillStyle = `hsla(${(baseHue + (Math.random() - 0.5) * 35) % 360}, 100%, 75%, ${spark.alpha})`;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();

        if (spark.y < 0) {
          spark.y = height + Math.random() * 15;
          spark.x = Math.random() * width;
        }
      });

      // 4. Draw Waveforms: Full-Width Horizontal Intersecting Binaural Waves
      const waveAmplitude = height * 0.22; // Large, dramatic wave height
      const waveSpeed = 0.6 + (currentPulse / 45) * 4.0; // Faster speed for higher brainwaves

      // --- Left Channel Wave Path ---
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let x = 0; x <= width; x += 4) {
        const sampleIdx = Math.floor((x / width) * (bufferLengthL - 1));
        let val = 0;
        if (isPlaying && analyserL) {
          val = (dataArrayL[sampleIdx] - 128) / 128.0;
        } else {
          // Lush, multi-layered placeholder waves
          val = Math.sin(x * 0.007 + timeSec * waveSpeed) * 0.55 + 
                Math.sin(x * 0.015 - timeSec * waveSpeed * 0.6) * 0.25 +
                Math.cos(x * 0.003 + timeSec * waveSpeed * 0.4) * 0.1;
        }
        const edgeTaper = Math.sin((x / width) * Math.PI); // Smoothly tapers to 0 at edges
        const y = centerY + val * waveAmplitude * edgeTaper;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, centerY);
      ctx.closePath();

      // Left Channel Glow Fill (Liquid ribbon)
      const fillGradL = ctx.createLinearGradient(0, centerY - waveAmplitude, 0, centerY + waveAmplitude);
      fillGradL.addColorStop(0, `hsla(${baseHue}, 100%, 55%, 0.25)`);
      fillGradL.addColorStop(0.5, `hsla(${baseHue}, 100%, 55%, 0.02)`);
      fillGradL.addColorStop(1, `hsla(${baseHue}, 100%, 55%, 0.25)`);
      ctx.fillStyle = fillGradL;
      ctx.fill();

      // Left Channel Border Glow Line
      ctx.shadowBlur = 30;
      ctx.shadowColor = colorMain;
      ctx.strokeStyle = `hsla(${baseHue}, 100%, 70%, 0.75)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const sampleIdx = Math.floor((x / width) * (bufferLengthL - 1));
        let val = 0;
        if (isPlaying && analyserL) {
          val = (dataArrayL[sampleIdx] - 128) / 128.0;
        } else {
          val = Math.sin(x * 0.007 + timeSec * waveSpeed) * 0.55 + 
                Math.sin(x * 0.015 - timeSec * waveSpeed * 0.6) * 0.25 +
                Math.cos(x * 0.003 + timeSec * waveSpeed * 0.4) * 0.1;
        }
        const edgeTaper = Math.sin((x / width) * Math.PI);
        const y = centerY + val * waveAmplitude * edgeTaper;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // --- Right Channel Wave Path ---
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let x = 0; x <= width; x += 4) {
        const sampleIdx = Math.floor((x / width) * (bufferLengthR - 1));
        let val = 0;
        if (isPlaying && analyserR) {
          val = (dataArrayR[sampleIdx] - 128) / 128.0;
        } else {
          // Opposite phase and frequency offsets for gorgeous intersection visual
          val = Math.sin(x * 0.006 - timeSec * waveSpeed * 1.1) * 0.55 + 
                Math.sin(x * 0.018 + timeSec * waveSpeed * 0.5) * 0.25 +
                Math.cos(x * 0.004 - timeSec * waveSpeed * 0.3) * 0.1;
        }
        const edgeTaper = Math.sin((x / width) * Math.PI);
        const y = centerY + val * waveAmplitude * edgeTaper;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, centerY);
      ctx.closePath();

      // Right Channel Glow Fill (Liquid ribbon with offset HSL hue for dual-color iridiscence)
      const hueRight = (baseHue + 40) % 360;
      const fillGradR = ctx.createLinearGradient(0, centerY - waveAmplitude, 0, centerY + waveAmplitude);
      fillGradR.addColorStop(0, `hsla(${hueRight}, 100%, 50%, 0.2)`);
      fillGradR.addColorStop(0.5, `hsla(${hueRight}, 100%, 50%, 0.02)`);
      fillGradR.addColorStop(1, `hsla(${hueRight}, 100%, 50%, 0.2)`);
      ctx.fillStyle = fillGradR;
      ctx.fill();

      // Right Channel Border Glow Line
      ctx.shadowBlur = 30;
      ctx.shadowColor = `hsl(${hueRight}, 100%, 45%)`;
      ctx.strokeStyle = `hsla(${hueRight}, 100%, 65%, 0.7)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 4) {
        const sampleIdx = Math.floor((x / width) * (bufferLengthR - 1));
        let val = 0;
        if (isPlaying && analyserR) {
          val = (dataArrayR[sampleIdx] - 128) / 128.0;
        } else {
          val = Math.sin(x * 0.006 - timeSec * waveSpeed * 1.1) * 0.55 + 
                Math.sin(x * 0.018 + timeSec * waveSpeed * 0.5) * 0.25 +
                Math.cos(x * 0.004 - timeSec * waveSpeed * 0.3) * 0.1;
        }
        const edgeTaper = Math.sin((x / width) * Math.PI);
        const y = centerY + val * waveAmplitude * edgeTaper;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // --- Central Binaural Interference Spine (The emergent beat) ---
      ctx.shadowBlur = 30 + amplitude * 25;
      ctx.shadowColor = colorMain;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 + amplitude * 4;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 3) {
        const sampleIdx = Math.floor((x / width) * (bufferLengthL - 1));
        let valL = 0;
        let valR = 0;
        
        if (isPlaying && analyserL && analyserR) {
          valL = (dataArrayL[sampleIdx] - 128) / 128.0;
          valR = (dataArrayR[sampleIdx] - 128) / 128.0;
        } else {
          valL = Math.sin(x * 0.007 + timeSec * waveSpeed) * 0.55 + Math.sin(x * 0.015 - timeSec * waveSpeed * 0.6) * 0.25;
          valR = Math.sin(x * 0.006 - timeSec * waveSpeed * 1.1) * 0.55 + Math.sin(x * 0.018 + timeSec * waveSpeed * 0.5) * 0.25;
        }
        
        // Summing waves creates natural beat packets/modulation on screen!
        const valInterference = (valL + valR) / 2;
        const edgeTaper = Math.sin((x / width) * Math.PI);
        
        // Subtle micro-ripple at the specific beat frequency to show wave interaction
        const beatRipple = Math.sin(x * 0.05 - timeSec * currentPulse * 1.5) * 0.04;
        
        const y = centerY + (valInterference + beatRipple) * waveAmplitude * 1.25 * edgeTaper;
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Restore shadows to default
      ctx.shadowBlur = 0;

      // 5. Draw horizontal baseline glowing pulse at the origin
      const bottomGlow = ctx.createLinearGradient(0, height - 80, 0, height);
      bottomGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
      bottomGlow.addColorStop(1, `hsla(${baseHue}, 100%, 50%, ${0.08 + amplitude * 0.12})`);
      ctx.fillStyle = bottomGlow;
      ctx.fillRect(0, height - 80, width, 80);

      // --- RESTORE ORIGINAL CTX TRANSFORM ---
      ctx.restore();

      animationFrameId = requestAnimationFrame(renderVisuals);
    };

    animationFrameId = requestAnimationFrame(renderVisuals);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, binauralBeatFreq, carrierFreq, currentModStep, isModulationEnabled, modulationSteps]);

  // --- GEMINI SERVICE REQUESTS ---
  const launchAiArchitect = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/psychoacoustic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      });

      if (!response.ok) {
        const errVal = await response.json();
        throw new Error(errVal.error || 'No se pudo generar la prescripción acústica.');
      }

      const program: CustomAIPres = await response.json();

      // Configure frequencies instantly from Gemini JSON suggestion
      setCarrierFreq(program.baseCarrierFrequency);
      setBinauralBeatFreq(program.binauralBeatFrequency);
      setActiveProgramName(program.sessionName);
      setAiExplanation(program.explanation);
      setModulationSteps(program.autoModulationPattern);
      setCurrentModStep(0);
      setSecondsRemaining(30);

      // Keep ambient strictly off/none per user request to remove background atmosphere noise
      setAmbientType('none');

    } catch (err: any) {
      console.error(err);
      setAiError(err.message || 'Error resolviendo la programación acústica de IA.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Preset quick click loader
  const loadPreset = (preset: WavePreset) => {
    setCarrierFreq(preset.carrierFreq);
    setBinauralBeatFreq(preset.beatFreq);
    setActiveProgramName(preset.name);
    setAiExplanation(preset.description);
    
    // Set typical modulation intervals suitable for the waveform preset
    const scale = preset.beatFreq > 15 ? 1.5 : 0.6; 
    setModulationSteps([
      { stepName: 'Sincronización Inicial', carrierOffset: 0, beatOffset: 0 },
      { stepName: 'Estimulación de Amplitud', carrierOffset: Math.round(5 * scale), beatOffset: 0.1 * scale },
      { stepName: 'Fase de Absorción', carrierOffset: Math.round(-4 * scale), beatOffset: -0.2 * scale },
      { stepName: 'Modulación Sostenida', carrierOffset: Math.round(8 * scale), beatOffset: 0.3 * scale },
      { stepName: 'Anti-Habituación Activa', carrierOffset: Math.round(-6 * scale), beatOffset: -0.1 * scale },
      { stepName: 'Sintonía de Cierre', carrierOffset: Math.round(2 * scale), beatOffset: 0 }
    ]);
    
    setCurrentModStep(0);
    setSecondsRemaining(30);
  };

  // Modulator statistics with strict clinical band locked clamping
  const currentActualCarrier = Math.max(80, carrierFreq + (isModulationEnabled ? modulationSteps[currentModStep].carrierOffset : 0));
  
  const getClampedBeat = (baseBeat: number, offset: number) => {
    let minWaveFreq = 1.0;
    let maxWaveFreq = 45.0;
    if (baseBeat < 4.0) {
      minWaveFreq = 1.0;
      maxWaveFreq = 4.0;
    } else if (baseBeat < 8.0) {
      minWaveFreq = 4.0;
      maxWaveFreq = 8.0;
    } else if (baseBeat < 12.0) {
      minWaveFreq = 8.0;
      maxWaveFreq = 12.0;
    } else if (baseBeat < 30.0) {
      minWaveFreq = 12.0;
      maxWaveFreq = 30.0;
    } else {
      minWaveFreq = 30.0;
      maxWaveFreq = 45.0;
    }
    return Math.min(maxWaveFreq, Math.max(minWaveFreq, baseBeat + offset));
  };

  const currentActualBeat = getClampedBeat(binauralBeatFreq, isModulationEnabled ? modulationSteps[currentModStep].beatOffset : 0);

  // --- UI RENDER: 2026 IRIDESCENT DASHBOARD ---
  const carrierRatio = Math.max(0, Math.min(1, (carrierFreq - 100) / 250));
  const baseHue = carrierRatio * 280;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#020204]">
      {/* Iridescent Background Glow */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 50% 50%, hsl(${baseHue}, 100%, 20%), transparent 70%)`
        }}
      />

      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none" 
      />

      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg p-8 rounded-[32px] backdrop-blur-2xl border border-white/10 shadow-2xl relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))`
        }}
      >
        {/* Iridescent Border Effect */}
        <div className="absolute inset-0 border-[1px] border-white/20 rounded-[32px] pointer-events-none" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col gap-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/50">
              {activeProgramName}
            </h1>
            <p className="text-sm text-slate-400 font-mono">{aiExplanation}</p>
          </div>

          <div className="flex justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={runSoundEngine}
              className="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 relative overflow-hidden group"
              style={{
                background: `linear-gradient(135deg, hsl(${baseHue}, 100%, 50%), hsl(${(baseHue + 40) % 360}, 100%, 50%))`
              }}
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              {isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white ml-1" />}
            </motion.button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest">Frecuencia Base</label>
              <div className="text-xl font-bold text-white">{carrierFreq} Hz</div>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest">Beat</label>
              <div className="text-xl font-bold text-white">{binauralBeatFreq} Hz</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
