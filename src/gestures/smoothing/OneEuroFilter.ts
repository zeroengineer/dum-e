export interface OneEuroOptions {
  /** Cutoff in Hz when the signal is still. Lower removes more jitter but adds lag at rest. */
  minCutoff: number;
  /** How quickly the cutoff rises with speed. Higher means less lag during fast movement. */
  beta: number;
  /** Cutoff in Hz for the speed estimate itself. */
  dCutoff: number;
}

/** Tuned for landmark coordinates in 0..1 sampled at 10 to 30 Hz. */
export const LANDMARK_SMOOTHING: OneEuroOptions = { minCutoff: 1.6, beta: 9, dCutoff: 1 };

const smoothingFactor = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

/**
 * One-Euro filter (Casiez, Roussel, Vogel 2012): a low-pass filter whose cutoff rises with the
 * signal's speed. A still hand is smoothed heavily; a fast hand is barely smoothed, so the
 * filter removes jitter without making quick gestures feel laggy.
 */
export class OneEuroFilter {
  private value = 0;
  private derivative = 0;
  private lastTime = 0;
  private initialised = false;

  constructor(private readonly options: OneEuroOptions = LANDMARK_SMOOTHING) {}

  /** `time` is in seconds and must not go backwards. */
  filter(input: number, time: number): number {
    if (!this.initialised) {
      this.initialised = true;
      this.value = input;
      this.derivative = 0;
      this.lastTime = time;
      return input;
    }
    const dt = time - this.lastTime;
    if (dt <= 0) return this.value;
    this.lastTime = time;

    const rawDerivative = (input - this.value) / dt;
    this.derivative +=
      smoothingFactor(this.options.dCutoff, dt) * (rawDerivative - this.derivative);
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(this.derivative);
    this.value += smoothingFactor(cutoff, dt) * (input - this.value);
    return this.value;
  }

  reset(): void {
    this.initialised = false;
  }
}
