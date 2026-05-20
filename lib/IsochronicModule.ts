/**
 * ISOCHRONIC MODULE (DSP / Web Audio API)
 * 
 * Provides high-precision Isochronic Tone synthesis using a sample-based source
 * with dynamic resonance, adjustable duty cycle, and advanced envelope smoothing.
 */

export type PulseType = 'sine' | 'square';

export class IsochronicModule {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private shaperNode: WaveShaperNode;
  private filterNode: BiquadFilterNode;
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

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.shaperNode = this.ctx.createWaveShaper();
    this.filterNode = this.ctx.createBiquadFilter();
    this.qGainNode = this.ctx.createGain();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    // Configure Filter: Peaking is more audible than Bandpass
    this.filterNode.type = 'peaking';
    this.filterNode.frequency.value = this._resonanceCarrier;
    this.filterNode.Q.value = 1.0;
    this.filterNode.gain.value = 12.0; // Boost the resonance frequency

    // Signal Path: Source (connected in start) -> Filter -> ModGain (Gate) -> Output
    this.filterNode.connect(this.modGainNode);
    this.modGainNode.connect(this.outputGainNode);

    // Modulation Path:
    // 1. Shaper -> ModGain.gain (Amplitude Gating)
    this.shaperNode.connect(this.modGainNode.gain);
    // 2. Shaper -> QGain -> Filter.Q (Dynamic Resonance)
    this.shaperNode.connect(this.qGainNode);
    this.qGainNode.connect(this.filterNode.Q);
    
    this.modGainNode.gain.value = 0.0;
    this.outputGainNode.gain.value = 0.5;
    this.qGainNode.gain.value = 10.0; // Q modulation depth

    this.regenerateCurve();
    
    // Auto-load sample
    console.log("IsochronicModule: Initiating sample load...");
    this.isBufferLoaded = this.loadSample('/IsochronicModule.wav');
  }

  private async loadSample(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error("Audio buffer is empty.");
      }

      this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
      console.log("IsochronicModule: Sample loaded successfully. Duration:", this.buffer.duration);
    } catch (e) {
      console.error("IsochronicModule: Critical Audio Decoding Error:", e);
    }
  }

  /**
   * Core DSP Logic: Applies a pulse envelope over a signal.
   */
  private regenerateCurve() {
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);
    const type = this._pulseType;
    const d = this._dutyCycle;

    for (let i = 0; i < curveLength; i++) {
      const x = (i / (curveLength - 1)) * 2.0 - 1.0;
      
      if (type === 'sine') {
        const phase = (x + 1) / 2; // [0, 1]
        curve[i] = Math.max(0, Math.sin(phase * Math.PI * 2 * (1/d) - Math.PI/2) * 0.5 + 0.5);
        if (phase > d) curve[i] = 0;
      } else {
        const theta = 1.0 - 2.0 * d;
        const epsilon = 0.05;
        const low = theta - epsilon;
        const high = theta + epsilon;

        if (x < low) curve[i] = 0;
        else if (x > high) curve[i] = 1;
        else {
          const t = (x - low) / (high - low);
          curve[i] = t * t * (3.0 - 2.0 * t);
        }
      }
    }
    this.shaperNode.curve = curve;
  }

  public async start(startTime: number, resonanceCarrier: number, pulseFreq: number) {
    if (this.isRunning) this.stop();
    
    console.log("IsochronicModule: Starting playback...", { resonanceCarrier, pulseFreq });
    
    await this.isBufferLoaded;
    if (!this.buffer) {
      console.warn("IsochronicModule: Cannot start, buffer not loaded.");
      return;
    }

    this._resonanceCarrier = resonanceCarrier;
    this._pulseFreq = pulseFreq;

    // Create Source
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.loop = true;
    
    // Adjust playbackRate: We want the sample to fit the pulse period
    // If pulseFreq is 10Hz, period is 0.1s. If sample is 0.2s, playbackRate should be 2.0
    const playbackRate = Math.max(0.1, Math.min(this.buffer.duration * this._pulseFreq, 4.0));
    this.sourceNode.playbackRate.setValueAtTime(playbackRate, startTime);

    // Create LFO for gating and resonance modulation
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(this._pulseFreq, startTime);

    // Set filter frequency (Resonance Carrier)
    this.filterNode.frequency.setValueAtTime(this._resonanceCarrier, startTime);

    // Connect Source to Filter
    this.sourceNode.connect(this.filterNode);
    this.lfoOsc.connect(this.shaperNode);

    this.sourceNode.start(startTime);
    this.lfoOsc.start(startTime);

    this.isRunning = true;
  }

  public stop(time: number = this.ctx.currentTime) {
    if (!this.isRunning) return;
    try {
      this.sourceNode?.stop(time);
    } catch (e) { /* ignore already stopped */ }
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

  /**
   * Updates the Resonance Carrier (Filter Frequency)
   */
  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this._resonanceCarrier = freq;
    this.filterNode.frequency.setTargetAtTime(freq, time, 0.05);
    // Also scale Q depth relative to frequency for organic scaling if desired
    // Here we just keep it stable but could be adjusted
  }

  public setPulseFreq(freq: number, time: number = this.ctx.currentTime) {
    this._pulseFreq = freq;
    this.lfoOsc?.frequency.setTargetAtTime(freq, time, 0.05);
    
    if (this.sourceNode && this.buffer) {
      const playbackRate = this.buffer.duration * freq;
      this.sourceNode.playbackRate.setTargetAtTime(playbackRate, time, 0.05);
    }
    
    this.regenerateCurve();
  }
}

