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
  private driveNode: WaveShaperNode;
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
  private _drive: number = 0.5;
  private _pitchOffset: number = 0.0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.shaperNode = this.ctx.createWaveShaper();
    this.driveNode = this.ctx.createWaveShaper();
    this.filterNode = this.ctx.createBiquadFilter();
    this.qGainNode = this.ctx.createGain();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    // Configure Filter
    this.filterNode.type = 'peaking';
    this.filterNode.frequency.value = this._resonanceCarrier;
    this.filterNode.Q.value = 1.0;
    this.filterNode.gain.value = 12.0;

    // Signal Path: Source -> Filter -> Drive -> ModGain (Gate) -> Output
    this.filterNode.connect(this.driveNode);
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
    console.log("IsochronicModule: Initiating sample load...");
    this.isBufferLoaded = this.loadSample('/IsochronicModule.wav');
  }

  /**
   * Generates a soft-clipping saturation curve based on _drive
   */
  private updateDriveCurve() {
    const k = this._drive * 20; // Scale drive
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
      console.log("IsochronicModule: Sample loaded.", this.buffer.duration);
    } catch (e) {
      console.error("IsochronicModule Error:", e);
    }
  }

  /**
   * Maps pulse frequency to a dynamic playbackRate (Pitch)
   * Gamma (30-50Hz) -> Lower pitch
   * Delta (0.5-4Hz) -> Higher pitch
   */
  private calculatePlaybackRate(freq: number): number {
    let baseRate = 1.0;
    
    if (freq >= 30) {
      baseRate = 0.8 - ((freq - 30) / 20) * 0.3;
    } else if (freq <= 4) {
      baseRate = 1.5 - ((freq - 0.5) / 3.5) * 0.5;
    } else {
      baseRate = 1.0 - ((freq - 4) / 26) * 0.2;
    }

    return Math.max(0.2, Math.min(baseRate + this._pitchOffset, 4.0));
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
    await this.isBufferLoaded;
    if (!this.buffer) return;

    console.log("IsochronicModule: Starting playback...", { resonanceCarrier, pulseFreq });

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
    
    this.regenerateCurve();
  }
}
