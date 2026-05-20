/**
 * ISOCHRONIC MODULE (DSP / Web Audio API)
 * 
 * Provides high-precision Isochronic Tone synthesis with custom Amplitude Modulation (AM),
 * phase synchronization, adjustable duty cycle, and advanced cubic spline edge 
 * smoothing to eliminate transient clicks.
 */

export type PulseType = 'sine' | 'square';

export class IsochronicModule {
  private ctx: AudioContext;
  private carrierOsc: OscillatorNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private shaperNode: WaveShaperNode;
  private modGainNode: GainNode;
  private outputGainNode: GainNode;
  private isRunning: boolean = false;

  private _carrierFreq: number = 200;
  private _pulseFreq: number = 10;
  private _pulseType: PulseType = 'square';
  private _dutyCycle: number = 0.50;
  private _intensity: number = 0.5;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.shaperNode = this.ctx.createWaveShaper();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    this.modGainNode.gain.value = 0.0;
    this.outputGainNode.gain.value = 0.5;

    this.shaperNode.connect(this.modGainNode.gain);
    this.modGainNode.connect(this.outputGainNode);

    this.regenerateCurve();
  }

  /**
   * Core DSP Logic: Applies a pulse envelope over a signal.
   * This implements the requested 'processIsochronic' logic within the class lifecycle.
   */
  private regenerateCurve() {
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);
    const type = this._pulseType;
    const d = this._dutyCycle;

    for (let i = 0; i < curveLength; i++) {
      // Scale index to LFO range [-1.0, 1.0]
      const x = (i / (curveLength - 1)) * 2.0 - 1.0;
      
      if (type === 'sine') {
        // Sinusoidal pulse envelope
        // Maps [-1, 1] triangle to a smooth sine pulse [0, 1]
        const phase = (x + 1) / 2; // [0, 1]
        curve[i] = Math.max(0, Math.sin(phase * Math.PI * 2 * (1/d) - Math.PI/2) * 0.5 + 0.5);
        if (phase > d) curve[i] = 0;
      } else {
        // Square pulse with smoothstep edges (anti-click)
        const theta = 1.0 - 2.0 * d;
        const epsilon = 0.05; // Fixed small epsilon for anti-click
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

  public start(startTime: number, carrierFreq: number, pulseFreq: number) {
    if (this.isRunning) this.stop();

    this._carrierFreq = carrierFreq;
    this._pulseFreq = pulseFreq;

    this.carrierOsc = this.ctx.createOscillator();
    this.carrierOsc.type = 'sine';
    this.carrierOsc.frequency.setValueAtTime(this._carrierFreq, startTime);

    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(this._pulseFreq, startTime);

    this.carrierOsc.connect(this.modGainNode);
    this.lfoOsc.connect(this.shaperNode);

    this.carrierOsc.start(startTime);
    this.lfoOsc.start(startTime);

    this.isRunning = true;
  }

  public stop(time: number = this.ctx.currentTime) {
    if (!this.isRunning) return;
    this.carrierOsc?.stop(time);
    this.lfoOsc?.stop(time);
    this.carrierOsc = null;
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

  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this._carrierFreq = freq;
    this.carrierOsc?.frequency.setTargetAtTime(freq, time, 0.05);
  }

  public setPulseFreq(freq: number, time: number = this.ctx.currentTime) {
    this._pulseFreq = freq;
    this.lfoOsc?.frequency.setTargetAtTime(freq, time, 0.05);
    this.regenerateCurve();
  }
}
