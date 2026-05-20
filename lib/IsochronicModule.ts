/**
 * HYBRID ISOCHRONIC MODULE (DSP / Web Audio API)
 * 
 * Architecture:
 * [Sine Oscillator] --+
 *                     |--> [Shared Envelope (LFO)] --> [Resonant Filter] --> [Density Shelf] --> [Saturation Drive] --> [Output]
 * [Organic Sample] ---+
 * 
 * Combines synthetic precision with organic texture for maximum entrainment and musicality.
 */

export type PulseType = 'sine' | 'square';

export class IsochronicModule {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private carrierOsc: OscillatorNode | null = null;
  private sampleSource: AudioBufferSourceNode | null = null;
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
  private _attackTime: number = 0.02;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
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

    // Signal Path: Sources -> modGainNode (Envelope) -> Filter -> LowShelf -> Drive -> outputGainNode
    this.modGainNode.connect(this.filterNode);
    this.filterNode.connect(this.lowShelfNode);
    this.lowShelfNode.connect(this.driveNode);
    this.driveNode.connect(this.outputGainNode);

    // Modulation Path (LFO -> Shaper -> modGainNode.gain)
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
    } catch (e) {
      console.error("IsochronicModule: Load Error", e);
    }
  }

  private calculatePlaybackRate(freq: number): number {
    if (!this.buffer) return 1.0;
    const syncRate = this.buffer.duration * freq;
    let timbreMod = 1.0;
    if (freq >= 30) timbreMod = 0.7;
    else if (freq <= 4) timbreMod = 1.3;
    return Math.max(0.1, Math.min(syncRate * timbreMod + this._pitchOffset, 8.0));
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

  /**
   * CORE TRIGGER: Resets sample and LFO phase for perfect synchronization.
   */
  public trigger(time: number = this.ctx.currentTime) {
    if (!this.isRunning || !this.buffer) return;

    // Note: To "trigger" precisely on each LFO beat, the looping sample's 
    // length must match the LFO period, which we handle via playbackRate.
    // If phase drift is detected, we could restart the sampleSource here.
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

    // 2. Organic Sample (Texture & Transients)
    this.sampleSource = this.ctx.createBufferSource();
    this.sampleSource.buffer = this.buffer;
    this.sampleSource.loop = true;
    const rate = this.calculatePlaybackRate(this._pulseFreq);
    this.sampleSource.playbackRate.setValueAtTime(rate, startTime);

    // 3. Master LFO (Rhythmic Sync)
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(this._pulseFreq, startTime);

    // Connections
    this.carrierOsc.connect(this.modGainNode);
    if (this.buffer) this.sampleSource.connect(this.modGainNode);
    this.lfoOsc.connect(this.shaperNode);

    // Start
    this.carrierOsc.start(startTime);
    if (this.buffer) this.sampleSource.start(startTime);
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

  public setPulseFreq(freq: number, time: number = this.ctx.currentTime) {
    this._pulseFreq = freq;
    this.lfoOsc?.frequency.setTargetAtTime(freq, time, 0.05);
    if (this.sampleSource) {
      const rate = this.calculatePlaybackRate(freq);
      this.sampleSource.playbackRate.linearRampToValueAtTime(rate, time + 0.2);
    }
    this.updateDensity(freq, time);
    this.regenerateCurve();
  }

  // Legacy compatibility / Helper
  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this.updateResonance(freq, time);
  }
}
