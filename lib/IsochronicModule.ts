/**
 * ISOCHRONIC MODULE (DSP / Web Audio API)
 * 
 * Provides high-precision Isochronic Tone synthesis using a sample-based source
 * with dynamic resonance, adjustable duty cycle, and advanced envelope smoothing.
 * 
 * Optimized for rhythmic phase stability and harmonic density across all brainwave ranges.
 */

export type PulseType = 'sine' | 'square';

export class IsochronicModule {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private shaperNode: WaveShaperNode;
  private driveNode: WaveShaperNode;
  private filterNode: BiquadFilterNode;
  private lowShelfNode: BiquadFilterNode;
  private qGainNode: GainNode;
  private modGainNode: GainNode;
  private outputGainNode: GainNode;
  private isRunning: boolean = false;
  private isBufferLoaded: Promise<void>;

  private _resonanceCarrier: number = 200;
  private _pulseFreq: number = 10;
  private _pulseType: PulseType = 'square';
  private _dutyCycle: number = 0.50;
  private _intensity: number = 0.5;
  private _drive: number = 0.5;
  private _pitchOffset: number = 0.0;
  private _attackTime: number = 0.02; // Fixed 20ms attack for "thump" consistency

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.shaperNode = this.ctx.createWaveShaper();
    this.driveNode = this.ctx.createWaveShaper();
    this.filterNode = this.ctx.createBiquadFilter();
    this.lowShelfNode = this.ctx.createBiquadFilter();
    this.qGainNode = this.ctx.createGain();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    // Configure Resonance Filter
    this.filterNode.type = 'peaking';
    this.filterNode.frequency.value = this._resonanceCarrier;
    this.filterNode.Q.value = 1.0;
    this.filterNode.gain.value = 12.0;

    // Configure Low-Shelf (Density compensation)
    this.lowShelfNode.type = 'lowshelf';
    this.lowShelfNode.frequency.value = 80; // Target 40-100Hz range
    this.lowShelfNode.gain.value = 0;

    // Signal Path: Source -> Filter -> LowShelf -> Drive -> ModGain (Gate) -> Output
    this.filterNode.connect(this.lowShelfNode);
    this.lowShelfNode.connect(this.driveNode);
    this.driveNode.connect(this.modGainNode);
    this.modGainNode.connect(this.outputGainNode);

    // Modulation Path
    this.shaperNode.connect(this.modGainNode.gain);
    this.shaperNode.connect(this.qGainNode);
    this.qGainNode.connect(this.filterNode.Q);
    
    this.modGainNode.gain.value = 0.0;
    this.outputGainNode.gain.value = 0.5;
    this.qGainNode.gain.value = 10.0;

    this.regenerateCurve();
    this.updateDriveCurve();
    
    // Auto-load sample
    this.isBufferLoaded = this.loadSample('/IsochronicModule.wav');
  }

  /**
   * Generates a soft-clipping saturation curve based on _drive
   */
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
      if (arrayBuffer.byteLength === 0) throw new Error("Audio buffer is empty.");
      this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error("IsochronicModule Error:", e);
    }
  }

  /**
   * Phase-Locked Resampling:
   * Maps pulse frequency to a dynamic playbackRate.
   * Ensures 1 cycle of sample aligns with 1 cycle of pulse for rhythmic stability.
   */
  private calculatePlaybackRate(freq: number): number {
    if (!this.buffer) return 1.0;

    // Sync: playbackRate * (1/freq) = buffer.duration 
    // => playbackRate = buffer.duration * freq
    const syncRate = this.buffer.duration * freq;
    
    // Timbre Modulation to maintain contrast across ranges
    let timbreMod = 1.0;
    if (freq >= 30) {
      timbreMod = 0.7; // Darker/Denser Gamma
    } else if (freq <= 4) {
      timbreMod = 1.3; // Clearer/Bigger Delta
    }

    return Math.max(0.1, Math.min(syncRate * timbreMod + this._pitchOffset, 8.0));
  }

  /**
   * Dynamic Low-End Compensation:
   * Increases Low-Shelf gain as frequency decreases.
   */
  private updateDensity(freq: number, time: number = this.ctx.currentTime) {
    // Boost gain up to 15dB for Delta waves to maintain "blackness"
    const maxBoost = 15;
    const boost = freq < 10 ? (1.0 - (freq / 10)) * maxBoost : 0;
    this.lowShelfNode.gain.setTargetAtTime(boost, time, 0.1);
  }

  /**
   * Core DSP Logic: Applies a pulse envelope over a signal.
   * Implements fixed-time attack (transient definition) for consistency.
   */
  private regenerateCurve() {
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);
    const type = this._pulseType;
    const d = this._dutyCycle;
    
    // Calculate attack as percentage of cycle based on fixed 20ms attackTime
    const pulsePeriod = 1 / this._pulseFreq;
    const attackPct = Math.min(this._attackTime / pulsePeriod, d * 0.5);

    for (let i = 0; i < curveLength; i++) {
      const x = (i / (curveLength - 1)) * 2.0 - 1.0; // [-1, 1]
      const phase = (x + 1) / 2; // [0, 1]
      
      if (phase > d) {
        curve[i] = 0;
        continue;
      }

      // Smoothstep Attack/Release with fixed attack time for sharp transients
      if (phase < attackPct) {
        const t = phase / attackPct;
        curve[i] = t * t * (3.0 - 2.0 * t);
      } else if (phase > d - attackPct) {
        const t = (d - phase) / attackPct;
        curve[i] = t * t * (3.0 - 2.0 * t);
      } else {
        curve[i] = 1.0;
      }

      if (type === 'sine') {
        curve[i] *= Math.sin(phase * Math.PI / d);
      }
    }
    this.shaperNode.curve = curve;
  }

  public async start(startTime: number, resonanceCarrier: number, pulseFreq: number) {
    if (this.isRunning) this.stop();
    await this.isBufferLoaded;
    if (!this.buffer) return;

    console.log("IsochronicModule: Starting phase-locked playback...", { resonanceCarrier, pulseFreq });

    this._resonanceCarrier = resonanceCarrier;
    this._pulseFreq = pulseFreq;

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.loop = true;
    
    const rate = this.calculatePlaybackRate(this._pulseFreq);
    this.sourceNode.playbackRate.setValueAtTime(rate, startTime);

    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(this._pulseFreq, startTime);

    this.filterNode.frequency.setValueAtTime(this._resonanceCarrier, startTime);
    this.updateDensity(this._pulseFreq, startTime);

    this.sourceNode.connect(this.filterNode);
    this.lfoOsc.connect(this.shaperNode);

    this.sourceNode.start(startTime);
    this.lfoOsc.start(startTime);

    this.isRunning = true;
  }

  public stop(time: number = this.ctx.currentTime) {
    if (!this.isRunning) return;
    try { this.sourceNode?.stop(time); } catch (e) {}
    this.lfoOsc?.stop(time);
    this.sourceNode = null;
    this.lfoOsc = null;
    this.isRunning = false;
  }

  public connect(destination: AudioNode) {
    this.outputGainNode.connect(destination);
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

  public setPitchOffset(val: number, time: number = this.ctx.currentTime) {
    this._pitchOffset = val;
    if (this.sourceNode) {
      const rate = this.calculatePlaybackRate(this._pulseFreq);
      this.sourceNode.playbackRate.linearRampToValueAtTime(rate, time + 0.1);
    }
  }

  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this._resonanceCarrier = freq;
    this.filterNode.frequency.setTargetAtTime(freq, time, 0.05);
  }

  public setPulseFreq(freq: number, time: number = this.ctx.currentTime) {
    this._pulseFreq = freq;
    this.lfoOsc?.frequency.setTargetAtTime(freq, time, 0.05);
    
    if (this.sourceNode) {
      const rate = this.calculatePlaybackRate(freq);
      this.sourceNode.playbackRate.linearRampToValueAtTime(rate, time + 0.2);
    }
    
    this.updateDensity(freq, time);
    this.regenerateCurve();
  }
}
