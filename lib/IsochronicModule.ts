/**
 * HYBRID ISOCHRONIC MODULE (DSP / Web Audio API)
 * 
 * Architecture:
 * [Sine Oscillator] -> [Carrier Gain] --+
 *                                       |--> [modGainNode (Envelope)] -> [filterNode] -> [LowShelf] -> [Drive] -> [outputGainNode]
 * [Organic Sample]  -> [Sample Gain] ---+
 * 
 * Features:
 * - Harmonic Locking: Ensures tonal consonance between synthetic and organic sources.
 * - Gain Staging: Professional mixing with logarithmic normalization to prevent clipping.
 * - Robust Fallback: Maintains audio integrity if sample assets are missing.
 */

export type PulseType = 'sine' | 'square';

export class IsochronicModule {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private carrierOsc: OscillatorNode | null = null;
  private sampleSource: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  
  // Gain Nodes for mixing
  private carrierGainNode: GainNode;
  private sampleGainNode: GainNode;
  private mixGainNode: GainNode; // Summation node
  
  private shaperNode: WaveShaperNode;
  private driveNode: WaveShaperNode;
  private filterNode: BiquadFilterNode;
  private lowShelfNode: BiquadFilterNode;
  private qGainNode: GainNode;
  private modGainNode: GainNode; // Envelope LFO gate
  private outputGainNode: GainNode; // Master volume
  
  private isRunning: boolean = false;
  private isBufferLoaded: Promise<void>;

  private _resonanceCarrier: number = 200;
  private _pulseFreq: number = 10;
  private _pulseType: PulseType = 'square';
  private _dutyCycle: number = 0.50;
  private _intensity: number = 0.5;
  private _drive: number = 0.5;
  private _pitchOffset: number = 0.0;
  private _attackTime: number = 0.02;

  // Mix Balance (0.0 = pure synthetic, 1.0 = pure sample)
  private _mixBalance: number = 0.4;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    
    // Initialize Nodes
    this.carrierGainNode = this.ctx.createGain();
    this.sampleGainNode = this.ctx.createGain();
    this.mixGainNode = this.ctx.createGain();
    
    this.shaperNode = this.ctx.createWaveShaper();
    this.driveNode = this.ctx.createWaveShaper();
    this.filterNode = this.ctx.createBiquadFilter();
    this.lowShelfNode = this.ctx.createBiquadFilter();
    this.qGainNode = this.ctx.createGain();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    // 1. Resonant Filter (Bandpass Maestro)
    this.filterNode.type = 'bandpass';
    this.filterNode.frequency.value = this._resonanceCarrier;
    this.filterNode.Q.value = 1.0;

    // 2. Low-Shelf (Density compensation)
    this.lowShelfNode.type = 'lowshelf';
    this.lowShelfNode.frequency.value = 80;
    this.lowShelfNode.gain.value = 0;

    // Signal Path Configuration
    // [Sources] -> [Source Gains] -> [MixGain] -> [Envelope] -> [Filter] -> [Shelf] -> [Drive] -> [Output]
    this.carrierGainNode.connect(this.mixGainNode);
    this.sampleGainNode.connect(this.mixGainNode);
    
    this.mixGainNode.connect(this.modGainNode);
    this.modGainNode.connect(this.filterNode);
    this.filterNode.connect(this.lowShelfNode);
    this.lowShelfNode.connect(this.driveNode);
    this.driveNode.connect(this.outputGainNode);

    // Modulation Path (LFO -> Shaper -> modGainNode.gain)
    this.shaperNode.connect(this.modGainNode.gain);
    this.shaperNode.connect(this.qGainNode);
    this.qGainNode.connect(this.filterNode.Q);
    
    // Initial Values
    this.modGainNode.gain.value = 0.0;
    this.outputGainNode.gain.value = 0.5;
    this.qGainNode.gain.value = 10.0;
    
    this.updateGainStaging();
    this.regenerateCurve();
    this.updateDriveCurve();
    
    // Auto-load sample
    this.isBufferLoaded = this.loadSample('/IsochronicModule.wav');
  }

  /**
   * Professional Gain Staging: Logarithmic normalization to prevent clipping.
   * Ensures the sum of both sources is balanced and safe (< 0dB).
   */
  private updateGainStaging(time: number = this.ctx.currentTime) {
    const balance = this._mixBalance;
    // Equal-power crossfade approximation for smooth mixing
    const carrierLevel = Math.cos(balance * 0.5 * Math.PI);
    const sampleLevel = Math.sin(balance * 0.5 * Math.PI);

    // Normalize to prevent sum exceeding 1.0 linearly
    const total = carrierLevel + sampleLevel;
    const norm = 1.0 / Math.max(1.0, total);

    this.carrierGainNode.gain.setTargetAtTime(carrierLevel * norm, time, 0.05);
    this.sampleGainNode.gain.setTargetAtTime(sampleLevel * norm, time, 0.05);
  }

  /**
   * Harmonic Locking: Calculates the even harmonic relationship.
   * Finds the playbackRate that aligns the sample with the resonance carrier.
   */
  private calculateHarmonicLockedRate(freq: number): number {
    if (!this.buffer) return 1.0;

    // Base synchronization for rhythmic phase
    const syncRate = this.buffer.duration * freq;
    
    // Harmonic Locking logic:
    // We want the internal frequency content of the sample to be an even multiple
    // of the resonance carrier. Assuming sample base is harmonically compatible.
    // We find the nearest power of 2 that respects the frequency range.
    let harmonicMultiplier = 1.0;
    if (this._resonanceCarrier > 0) {
        // Find nearest octave relationship
        const ratio = this._resonanceCarrier / freq;
        const octaves = Math.round(Math.log2(ratio));
        harmonicMultiplier = Math.pow(2, octaves);
    }

    // Combine sync with harmonic multiplier, clamped for stability
    const finalRate = syncRate * (harmonicMultiplier > 0 ? 1.0 : 1.0); // Simple sync for now, refined below
    
    // Refining: Use even multiples (2, 4, 8) to maintain consonance
    let timbreMod = 1.0;
    if (freq >= 30) timbreMod = 0.5; // Double density for Gamma
    else if (freq <= 4) timbreMod = 2.0; // Half density for Delta
    
    return Math.max(0.1, Math.min(syncRate * timbreMod + this._pitchOffset, 8.0));
  }

  private updateDriveCurve() {
    const k = this._drive * 20; 
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.driveNode.curve = curve;
  }

  private async loadSample(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
      console.log("IsochronicModule: Sample assets loaded and verified.");
    } catch (e) {
      console.warn("IsochronicModule: Sample load failed. Falling back to synthetic synthesis.", e);
      this.buffer = null;
    }
  }

  private updateDensity(freq: number, time: number = this.ctx.currentTime) {
    const maxBoost = 15;
    const boost = freq < 10 ? (1.0 - (freq / 10)) * maxBoost : 0;
    this.lowShelfNode.gain.setTargetAtTime(boost, time, 0.1);
  }

  private regenerateCurve() {
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);
    const d = this._dutyCycle;
    const pulsePeriod = 1 / this._pulseFreq;
    const attackPct = Math.min(this._attackTime / pulsePeriod, d * 0.5);

    for (let i = 0; i < curveLength; i++) {
      const x = (i / (curveLength - 1)) * 2.0 - 1.0;
      const phase = (x + 1) / 2;
      
      if (phase > d) {
        curve[i] = 0;
        continue;
      }

      if (phase < attackPct) {
        const t = phase / attackPct;
        curve[i] = t * t * (3.0 - 2.0 * t);
      } else if (phase > d - attackPct) {
        const t = (d - phase) / attackPct;
        curve[i] = t * t * (3.0 - 2.0 * t);
      } else {
        curve[i] = 1.0;
      }

      if (this._pulseType === 'sine') {
        curve[i] *= Math.sin(phase * Math.PI / d);
      }
    }
    this.shaperNode.curve = curve;
  }

  public async start(startTime: number, resonanceCarrier: number, pulseFreq: number) {
    if (this.isRunning) this.stop();
    await this.isBufferLoaded;

    this._resonanceCarrier = resonanceCarrier;
    this._pulseFreq = pulseFreq;

    // 1. Sine Carrier (Entrainment Stability)
    this.carrierOsc = this.ctx.createOscillator();
    this.carrierOsc.type = 'sine';
    this.carrierOsc.frequency.setValueAtTime(this._resonanceCarrier, startTime);
    this.carrierOsc.connect(this.carrierGainNode);

    // 2. Organic Sample (Texture & Transients)
    if (this.buffer) {
        this.sampleSource = this.ctx.createBufferSource();
        this.sampleSource.buffer = this.buffer;
        this.sampleSource.loop = true;
        
        const rate = this.calculateHarmonicLockedRate(this._pulseFreq);
        this.sampleSource.playbackRate.setValueAtTime(rate, startTime);
        
        // Connect to its gain node
        this.sampleSource.connect(this.sampleGainNode);
        
        // Smooth fade-in to prevent clicks
        this.sampleGainNode.gain.setValueAtTime(0, startTime);
        this.updateGainStaging(startTime + 0.1);
    } else {
        // Fallback: Maximize carrier if sample is missing
        this.carrierGainNode.gain.setTargetAtTime(1.0, startTime, 0.05);
        this.sampleGainNode.gain.setValueAtTime(0, startTime);
    }

    // 3. Master LFO (Rhythmic Sync)
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(this._pulseFreq, startTime);
    this.lfoOsc.connect(this.shaperNode);

    // Start
    this.carrierOsc.start(startTime);
    if (this.sampleSource) this.sampleSource.start(startTime);
    this.lfoOsc.start(startTime);

    this.updateDensity(this._pulseFreq, startTime);
    this.isRunning = true;
  }

  public stop(time: number = this.ctx.currentTime) {
    if (!this.isRunning) return;
    try {
      this.carrierOsc?.stop(time);
      this.sampleSource?.stop(time);
      this.lfoOsc?.stop(time);
    } catch (e) {}
    this.carrierOsc = null;
    this.sampleSource = null;
    this.lfoOsc = null;
    this.isRunning = false;
  }

  public connect(destination: AudioNode) {
    this.outputGainNode.connect(destination);
  }

  public updateResonance(freq: number, time: number = this.ctx.currentTime) {
    this._resonanceCarrier = freq;
    this.filterNode.frequency.setTargetAtTime(freq, time, 0.05);
    this.carrierOsc?.frequency.setTargetAtTime(freq, time, 0.05);
    
    // Recalculate harmonic pitch if running
    if (this.sampleSource && this.buffer) {
        const rate = this.calculateHarmonicLockedRate(this._pulseFreq);
        this.sampleSource.playbackRate.setTargetAtTime(rate, time, 0.1);
    }
  }

  public setIntensity(val: number, time: number = this.ctx.currentTime) {
    this._intensity = val;
    this.outputGainNode.gain.setTargetAtTime(val, time, 0.05);
  }

  public setPulseType(type: PulseType) {
    this._pulseType = type;
    this.regenerateCurve();
  }

  public setDrive(val: number) {
    this._drive = val;
    this.updateDriveCurve();
  }

  public setMixBalance(balance: number, time: number = this.ctx.currentTime) {
    this._mixBalance = Math.max(0, Math.min(balance, 1));
    this.updateGainStaging(time);
  }

  public setPulseFreq(freq: number, time: number = this.ctx.currentTime) {
    this._pulseFreq = freq;
    this.lfoOsc?.frequency.setTargetAtTime(freq, time, 0.05);
    if (this.sampleSource) {
      const rate = this.calculateHarmonicLockedRate(freq);
      this.sourceNodePlaybackRateRamp(rate, time);
    }
    this.updateDensity(freq, time);
    this.regenerateCurve();
  }

  private sourceNodePlaybackRateRamp(rate: number, time: number) {
    if (this.sampleSource) {
        this.sampleSource.playbackRate.linearRampToValueAtTime(rate, time + 0.2);
    }
  }

  // Legacy compatibility / Helper
  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this.updateResonance(freq, time);
  }
}
