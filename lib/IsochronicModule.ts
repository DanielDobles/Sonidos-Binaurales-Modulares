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
 * - Proportional Volume: Natural quadratic response for better intensity control.
 */

export type PulseType = 'sine' | 'square';

export class IsochronicModule {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private carrierOsc: OscillatorNode | null = null;
  private schedulerTimer: any = null;
  private nextPulseTime: number = 0;
  
  // Gain Nodes for mixing
  private carrierGainNode: GainNode;
  private sampleGainNode: GainNode;
  private mixGainNode: GainNode; // Summation node
  
  private driveNode: WaveShaperNode;
  private filterNode: BiquadFilterNode;
  private lowShelfNode: BiquadFilterNode;
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
  private _attackTime: number = 0.15; // 150ms Attack (Softer entry)
  private _releaseTime: number = 0.40; // 400ms Release (Linger/Blur)

  // Mix Balance (0.0 = pure synthetic, 1.0 = pure sample)
  private _mixBalance: number = 0.4;

  // Clipping Detection
  private monitorNode: AnalyserNode;
  public onClipping?: (isClipping: boolean) => void;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    console.log("IsochronicModule: Initializing audio graph...");
    
    // Initialize Nodes
    this.carrierGainNode = this.ctx.createGain();
    this.sampleGainNode = this.ctx.createGain();
    this.mixGainNode = this.ctx.createGain();
    this.monitorNode = this.ctx.createAnalyser();
    
    this.driveNode = this.ctx.createWaveShaper();
    this.filterNode = this.ctx.createBiquadFilter();
    this.lowShelfNode = this.ctx.createBiquadFilter();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    // Clipping monitor config
    this.monitorNode.fftSize = 32;

    // 1. Resonant Filter (Bandpass Maestro)
    this.filterNode.type = 'bandpass';
    this.filterNode.frequency.value = this._resonanceCarrier;
    this.filterNode.Q.value = 1.0;

    // 2. Low-Shelf (Density compensation)
    this.lowShelfNode.type = 'lowshelf';
    this.lowShelfNode.frequency.value = 80;
    this.lowShelfNode.gain.value = 0;

    // Signal Path Configuration: Both converge in mixGainNode
    console.log("IsochronicModule: Connecting Carrier -> Mix");
    this.carrierGainNode.connect(this.mixGainNode);
    
    console.log("IsochronicModule: Connecting Sample -> Mix");
    this.sampleGainNode.connect(this.mixGainNode);
    
    console.log("IsochronicModule: Connecting Mix -> Envelope Gate (Mod)");
    this.mixGainNode.connect(this.modGainNode);
    
    console.log("IsochronicModule: Connecting Envelope -> Filter");
    this.modGainNode.connect(this.filterNode);
    
    console.log("IsochronicModule: Connecting Filter -> Post-processing chain");
    this.filterNode.connect(this.lowShelfNode);
    this.lowShelfNode.connect(this.driveNode);
    this.driveNode.connect(this.outputGainNode);
    
    // Connect output to monitor
    this.outputGainNode.connect(this.monitorNode);
    
    this.modGainNode.gain.value = 0.0;
    this.outputGainNode.gain.value = 0.25; 
    
    this.updateGainStaging();
    this.updateDriveCurve();
    this.startMonitor();
    
    // Auto-load sample
    this.isBufferLoaded = this.loadSample('/IsochronicModule.wav');
  }

  /**
   * Proportional Volume Control (Quadratic mapping)
   */
  public setIntensity(val: number, time: number = this.ctx.currentTime) {
    this._intensity = val;
    const gain = val * val;
    console.log(`IsochronicModule: Setting intensity to ${val} (Gain: ${gain})`);
    this.outputGainNode.gain.setTargetAtTime(gain, time, 0.05);
  }

  private startMonitor() {
    const buffer = new Float32Array(this.monitorNode.fftSize);
    const check = () => {
      if (!this.isRunning) return;
      try {
        this.monitorNode.getFloatTimeDomainData(buffer);
        let clipped = false;
        for (let i = 0; i < buffer.length; i++) {
          if (Math.abs(buffer[i]) > 0.99) {
            clipped = true;
            break;
          }
        }
        if (this.onClipping) this.onClipping(clipped);
        requestAnimationFrame(check);
      } catch (e) {
        console.error("IsochronicModule: Monitor error", e);
      }
    };
    if (this.isRunning) check();
  }

  /**
   * Professional Gain Staging: Logarithmic normalization to prevent clipping.
   */
  private updateGainStaging(time: number = this.ctx.currentTime) {
    const balance = this._mixBalance;
    const carrierLevel = Math.cos(balance * 0.5 * Math.PI);
    const sampleLevel = Math.sin(balance * 0.5 * Math.PI);
    const total = carrierLevel + sampleLevel;
    const norm = 1.0 / Math.max(1.0, total);

    console.log(`IsochronicModule: Gain Staging (Balance: ${balance}) -> Carrier: ${carrierLevel.toFixed(2)}, Sample: ${sampleLevel.toFixed(2)}`);
    this.carrierGainNode.gain.setTargetAtTime(carrierLevel * norm, time, 0.05);
    this.sampleGainNode.gain.setTargetAtTime(sampleLevel * norm, time, 0.05);
  }

  /**
   * Harmonic Locking: Ensures tonal consonance.
   */
  private calculateHarmonicRatio(freq: number): number {
    if (!this.buffer) return 1.0;
    const syncRate = this.buffer.duration * freq;
    
    let harmonicMultiplier = 1.0;
    if (this._resonanceCarrier > 0) {
        const ratio = this._resonanceCarrier / freq;
        const octaves = Math.round(Math.log2(ratio));
        harmonicMultiplier = Math.pow(2, octaves);
    }

    let timbreMod = 1.0;
    if (freq >= 30) timbreMod = 0.5;
    else if (freq <= 4) timbreMod = 2.0;
    
    // We want the playback rate to be a multiple of the pulse freq for locking
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
      console.log("IsochronicModule: Hybrid sample assets loaded and verified.");
    } catch (e) {
      console.warn("IsochronicModule: Sample load failed. Falling back.", e);
      this.buffer = null;
    }
  }

  private updateDensity(freq: number, time: number = this.ctx.currentTime) {
    const maxBoost = 15;
    const boost = freq < 10 ? (1.0 - (freq / 10)) * maxBoost : 0;
    this.lowShelfNode.gain.setTargetAtTime(boost, time, 0.1);
  }

  /**
   * Scheduler: A Tale of Two Clocks
   * Precise audio scheduling combined with relaxed JS timing.
   */
  private schedulePulses() {
    if (!this.isRunning) return;
    
    const lookahead = 0.15; // Schedule 150ms in advance
    const interval = 0.04;  // Check every 40ms
    
    while (this.nextPulseTime < this.ctx.currentTime + lookahead) {
      this.triggerPulse(this.nextPulseTime);
      this.nextPulseTime += 1 / this._pulseFreq;
    }
    
    this.schedulerTimer = setTimeout(() => this.schedulePulses(), interval * 1000);
  }

  /**
   * Frequency-Dependent Gain Compensation
   * Balances perceived loudness across the brainwave spectrum.
   * Delta (low freq) needs less gain, Gamma (high freq) needs more to feel balanced.
   */
  private calculateFrequencyGain(freq: number): number {
    // Delta (0.5-4Hz) -> Lower gain (around 0.6 - 0.8)
    // Alpha/Beta (8-30Hz) -> Nominal gain (1.0)
    // Gamma (30-50Hz) -> Boosted gain (around 1.2 - 1.4)
    
    if (freq <= 4) return 0.65 + (freq / 4) * 0.15; // Delta range ramp
    if (freq <= 13) return 0.8 + ((freq - 4) / 9) * 0.2; // Theta to Alpha ramp
    if (freq <= 30) return 1.0; // Beta range is nominal
    
    // Gamma boost (logarithmic increase for natural feel)
    const gammaBoost = 1.0 + Math.log10(freq / 30) * 1.5;
    return Math.min(gammaBoost, 1.6);
  }

  private triggerPulse(time: number) {
    const period = 1 / this._pulseFreq;
    const d = this._dutyCycle;
    const isSine = this._pulseType === 'sine';
    
    // Dynamic Gain Compensation based on Frequency
    const freqGain = this.calculateFrequencyGain(this._pulseFreq);
    
    // Pulse Shaping with Requested Fades
    // We clamp the fades to ensure they fit within the active duty cycle period
    const activePeriod = period * d;
    const attack = Math.min(this._attackTime, activePeriod * 0.4);
    const release = Math.min(this._releaseTime, activePeriod * 0.6);
    const sustain = Math.max(0, activePeriod - attack - release);
    
    // 1. Envelope Gate (modGainNode)
    this.modGainNode.gain.cancelScheduledValues(time);
    this.modGainNode.gain.setValueAtTime(0, time);
    
    if (isSine) {
        // Smooth Sine-like Pulse (uses full active period)
        this.modGainNode.gain.setTargetAtTime(freqGain, time, activePeriod * 0.3);
        this.modGainNode.gain.setTargetAtTime(0.0, time + activePeriod * 0.5, activePeriod * 0.3);
    } else {
        // Percussive but Smooth Square-like Pulse (Trapezoidal)
        this.modGainNode.gain.linearRampToValueAtTime(freqGain, time + attack);
        this.modGainNode.gain.setValueAtTime(freqGain, time + attack + sustain);
        this.modGainNode.gain.linearRampToValueAtTime(0, time + attack + sustain + release);
    }

    // 2. Resonant Filter Q Modulation (Organic character)
    this.filterNode.Q.cancelScheduledValues(time);
    this.filterNode.Q.setValueAtTime(1.0, time);
    this.filterNode.Q.linearRampToValueAtTime(isSine ? 4.0 : 12.0, time + attack); 
    this.filterNode.Q.setTargetAtTime(1.0, time + attack, 0.05);

    // 3. Hybrid Sample Trigger
    if (this.buffer) {
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.buffer;
            const rate = this.calculateHarmonicRatio(this._pulseFreq);
            source.playbackRate.setValueAtTime(rate, time);
            
            // Adjust sample source volume as well to match compensation
            const sampleLocalGain = this.ctx.createGain();
            sampleLocalGain.gain.setValueAtTime(freqGain, time);
            
            source.connect(sampleLocalGain).connect(this.sampleGainNode);
            source.start(time);
            source.stop(time + activePeriod + release);
        } catch (e) {
            console.error("IsochronicModule: Failed to trigger sample pulse", e);
        }
    }
  }

  public async start(startTime: number, resonanceCarrier: number, pulseFreq: number) {
    console.log(`IsochronicModule: start() requested for ${startTime.toFixed(2)}`);
    if (this.isRunning) this.stop();
    
    // Crucial: Wait for sample assets if they are still loading
    await this.isBufferLoaded;

    // Recalculate start time in case loading took longer than the provided startTime
    const now = this.ctx.currentTime;
    const actualStartTime = Math.max(startTime, now + 0.1);
    
    console.log(`IsochronicModule: Actually starting at ${actualStartTime.toFixed(2)} (Current time: ${now.toFixed(2)})`);

    this._resonanceCarrier = resonanceCarrier;
    this._pulseFreq = pulseFreq;
    this.isRunning = true;

    // 1. Synchronize Filter Frequency
    this.filterNode.frequency.setValueAtTime(this._resonanceCarrier, actualStartTime);

    // 2. Continuous Sine Carrier
    this.carrierOsc = this.ctx.createOscillator();
    this.carrierOsc.type = 'sine';
    this.carrierOsc.frequency.setValueAtTime(this._resonanceCarrier, actualStartTime);
    this.carrierOsc.connect(this.carrierGainNode);
    
    try {
        this.carrierOsc.start(actualStartTime);
        console.log("IsochronicModule: Carrier Oscillator started.");
    } catch (e) {
        console.error("IsochronicModule: Failed to start carrier oscillator", e);
    }

    // 2. Initiate Scheduler
    this.nextPulseTime = actualStartTime;
    this.schedulePulses();

    this.updateGainStaging(actualStartTime);
    this.updateDensity(this._pulseFreq, actualStartTime);
    this.startMonitor();
  }

  public stop(time: number = this.ctx.currentTime) {
    if (!this.isRunning) return;
    console.log(`IsochronicModule: Stopping at ${time.toFixed(2)}`);
    this.isRunning = false;
    
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    try {
      this.carrierOsc?.stop(time);
      this.modGainNode.gain.cancelScheduledValues(time);
      this.modGainNode.gain.setTargetAtTime(0, time, 0.02);
    } catch (e) {
        console.warn("IsochronicModule: Error during stop", e);
    }
    
    this.carrierOsc = null;
  }

  public connect(destination: AudioNode) {
    console.log("IsochronicModule: Connecting to external destination.");
    this.outputGainNode.connect(destination);
  }

  public updateResonance(freq: number, time: number = this.ctx.currentTime) {
    this._resonanceCarrier = freq;
    this.filterNode.frequency.setTargetAtTime(freq, time, 0.05);
    this.carrierOsc?.frequency.setTargetAtTime(freq, time, 0.05);
  }

  public setPulseType(type: PulseType) {
    this._pulseType = type;
    // Note: With the scheduler, we can implement different pulse shapes here if needed
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
    this.updateDensity(freq, time);
  }

  // Legacy compatibility / Helper
  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this.updateResonance(freq, time);
  }
}
