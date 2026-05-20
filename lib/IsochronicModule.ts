/**
 * ISOCHRONIC MODULE (DSP / Web Audio API)
 * 
 * Provides high-precision Isochronic Tone synthesis with custom Amplitude Modulation (AM),
 * phase synchronization, adjustable duty cycle, and advanced 5ms (or custom) cubic 
 * spline edge smoothing (anti-click) to eliminate transient clicks.
 */

export type IsochronicWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth';

export class IsochronicModule {
  private ctx: AudioContext;
  private carrierOsc: OscillatorNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private shaperNode: WaveShaperNode;
  private modGainNode: GainNode;
  private outputGainNode: GainNode;
  private isRunning: boolean = false;

  // Module configuration state
  private _carrierFreq: number = 200; // Hz
  private _pulseFreq: number = 10;     // Hz (0.5Hz - 50Hz range)
  private _carrierType: IsochronicWaveform = 'sine';
  private _dutyCycle: number = 0.50;    // 50% default
  private _edgeSmoothnessMs: number = 5.0; // 5ms rise/fall ramp

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // 1. Instantiate the nodes
    this.shaperNode = this.ctx.createWaveShaper();
    this.modGainNode = this.ctx.createGain();
    this.outputGainNode = this.ctx.createGain();

    // 2. Set default output gains
    this.modGainNode.gain.value = 0.0; // Initialized to 0, driven entirely by LFO through WaveShaper
    this.outputGainNode.gain.value = 0.7; // Default mix level

    // 3. Establish the DSP routing topology
    // The modulator wave will feed directly into the gain parameter of the Mod Gain Node.
    // Base AM formula: S(t) = C(t) * [0.5 * (1 + LFO_mod(f_target))]
    // Which is represented in the graph as: Carrier -> Mod Gain (driven by LFO via WaveShaper) -> Output Gain -> Destination
    this.shaperNode.connect(this.modGainNode.gain);
    this.modGainNode.connect(this.outputGainNode);

    // Initialize the WaveShaper curve for pulse train modulation
    this.regenerateCurve();
  }

  /**
   * Generates a custom cubic spline curve (smoothstep) for the WaveShaper node.
   * Maps a standard triangle wave LFO [-1.0, 1.0] to a unipolar pulse train [0.0, 1.0]
   * with a mathematically perfect adjustable duty cycle and anti-click smoothing.
   */
  private regenerateCurve() {
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);

    // Duty cycle mapping: d = (1 - theta) / 2 => theta = 1 - 2d
    // theta defines the threshold above which the pulse is "active"
    const theta = 1.0 - 2.0 * this._dutyCycle;

    // Triangle wave rate of change is 4 * pulseFreq units/sec.
    // Edge transition width (in LFO signal units) for requested transition time:
    const transitionSec = this._edgeSmoothnessMs / 1000.0;
    let epsilon = 4.0 * this._pulseFreq * transitionSec;

    // Safety constraint bounds for extreme frequencies / parameters
    epsilon = Math.max(0.001, Math.min(0.45, epsilon));

    const halfEps = epsilon / 2.0;
    const lowBound = theta - halfEps;
    const highBound = theta + halfEps;

    for (let i = 0; i < curveLength; i++) {
      // Scale index to LFO range [-1.0, 1.0]
      const x = (i / (curveLength - 1)) * 2.0 - 1.0;

      if (x < lowBound) {
        curve[i] = 0.0; // Completely off
      } else if (x > highBound) {
        curve[i] = 1.0; // Completely on
      } else {
        // Cubic Hermite Spline (smoothstep) transition to prevent audio click artifacts
        const t = (x - lowBound) / (highBound - lowBound);
        curve[i] = t * t * (3.0 - 2.0 * t);
      }
    }

    this.shaperNode.curve = curve;
  }

  /**
   * Initializes and starts the audio synthesis nodes synchronizing with a specific clock time.
   * @param startTime AudioContext scheduled start time (defaults to currentTime)
   */
  public start(startTime: number = this.ctx.currentTime) {
    if (this.isRunning) return;

    const actualStart = Math.max(startTime, this.ctx.currentTime);

    // Instantiate Carrier Oscillator
    this.carrierOsc = this.ctx.createOscillator();
    this.carrierOsc.type = this._carrierType;
    this.carrierOsc.frequency.setValueAtTime(this._carrierFreq, actualStart);

    // Instantiate LFO Modulator (Triangle wave represents perfect symmetrical rise/fall)
    this.lfoOsc = this.ctx.createOscillator();
    this.lfoOsc.type = 'triangle';
    this.lfoOsc.frequency.setValueAtTime(this._pulseFreq, actualStart);

    // Connect audio paths
    this.carrierOsc.connect(this.modGainNode);
    this.lfoOsc.connect(this.shaperNode);

    // Start oscillators with exact phase sync relative to start timeline
    this.carrierOsc.start(actualStart);
    this.lfoOsc.start(actualStart);

    this.isRunning = true;
  }

  /**
   * Stops the synthesis nodes.
   * @param stopTime AudioContext scheduled stop time (defaults to currentTime)
   */
  public stop(stopTime: number = this.ctx.currentTime) {
    if (!this.isRunning) return;

    const actualStop = Math.max(stopTime, this.ctx.currentTime);

    if (this.carrierOsc) {
      this.carrierOsc.stop(actualStop);
      this.carrierOsc.disconnect();
      this.carrierOsc = null;
    }

    if (this.lfoOsc) {
      this.lfoOsc.stop(actualStop);
      this.lfoOsc.disconnect();
      this.lfoOsc = null;
    }

    this.isRunning = false;
  }

  /**
   * Connects the module output to any Web Audio target destination.
   */
  public connect(destination: AudioNode): AudioNode {
    return this.outputGainNode.connect(destination);
  }

  /**
   * Disconnects the module output.
   */
  public disconnect() {
    this.outputGainNode.disconnect();
  }

  // --- Dynamic DSP Param Setters & Getters (Click-Free Adjustments) ---

  public get carrierFreq(): number { return this._carrierFreq; }
  public setCarrierFreq(freq: number, time: number = this.ctx.currentTime) {
    this._carrierFreq = freq;
    if (this.carrierOsc && this.isRunning) {
      // Smooth frequency glide (20ms target time constant) to avoid frequency steps
      this.carrierOsc.frequency.setTargetAtTime(freq, time, 0.02);
    }
  }

  public get pulseFreq(): number { return this._pulseFreq; }
  public setPulseFreq(freq: number, time: number = this.ctx.currentTime) {
    // 0.5Hz to 50Hz range restriction
    this._pulseFreq = Math.max(0.5, Math.min(50.0, freq));
    if (this.lfoOsc && this.isRunning) {
      // Smooth frequency adjustment
      this.lfoOsc.frequency.setTargetAtTime(this._pulseFreq, time, 0.02);
    }
    // Re-generate curve to maintain consistent duty cycle and edge transition width
    this.regenerateCurve();
  }

  public get carrierType(): IsochronicWaveform { return this._carrierType; }
  public setCarrierType(type: IsochronicWaveform) {
    this._carrierType = type;
    if (this.carrierOsc && this.isRunning) {
      this.carrierOsc.type = type;
    }
  }

  public get dutyCycle(): number { return this._dutyCycle; }
  public setDutyCycle(duty: number) {
    // Keep duty cycle in a safe 5% - 95% range
    this._dutyCycle = Math.max(0.05, Math.min(0.95, duty));
    this.regenerateCurve();
  }

  public get edgeSmoothnessMs(): number { return this._edgeSmoothnessMs; }
  public setEdgeSmoothness(smoothnessMs: number) {
    // Clamp transition length to safe ranges (2ms to 20ms)
    this._edgeSmoothnessMs = Math.max(2.0, Math.min(20.0, smoothnessMs));
    this.regenerateCurve();
  }

  public get mixLevel(): number { return this.outputGainNode.gain.value; }
  public setMixLevel(level: number, time: number = this.ctx.currentTime) {
    const target = Math.max(0.0, Math.min(1.0, level));
    this.outputGainNode.gain.cancelScheduledValues(time);
    this.outputGainNode.gain.setValueAtTime(this.outputGainNode.gain.value, time);
    this.outputGainNode.gain.exponentialRampToValueAtTime(Math.max(target, 0.001), time + 0.15);
  }
}
