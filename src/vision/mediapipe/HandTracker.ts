import { Emitter } from '../../utils/emitter';
import type { LandmarkSource, RawHandFrame } from '../landmarks/types';
import { TrackingLoop } from '../tracking/TrackingLoop';
import { createHandDetector } from './HandDetector';
import type { HandDetector, HandDetectorOptions } from './HandDetector';

export type TrackerState = 'idle' | 'loading' | 'ready' | 'running' | 'failed';

interface HandTrackerEvents {
  state: TrackerState;
  rate: number;
  detectMs: number;
  error: Error;
}

/**
 * MediaPipe Hand Landmarker plus the loop that feeds it video frames.
 * Emits RawHandFrames; it knows nothing about gestures, scenes or the UI.
 */
export class HandTracker implements LandmarkSource {
  readonly events = new Emitter<HandTrackerEvents>();
  private readonly loop: TrackingLoop;
  private detector: HandDetector | null = null;
  private loading: Promise<HandDetector> | null = null;
  private current: TrackerState = 'idle';
  private disposed = false;

  constructor(
    private readonly options: HandDetectorOptions,
    hz: number,
  ) {
    this.loop = new TrackingLoop(hz);
    this.loop.events.on('rate', (rate) => this.events.emit('rate', rate));
    this.loop.events.on('detectMs', (ms) => this.events.emit('detectMs', ms));
    this.loop.events.on('error', (error) => {
      this.setState('failed');
      this.events.emit('error', error);
    });
  }

  get state(): TrackerState {
    return this.current;
  }

  /** 'GPU' or 'CPU' once the model is loaded. */
  get delegate(): string | null {
    return this.detector?.delegate ?? null;
  }

  subscribe(listener: (frame: RawHandFrame) => void): () => void {
    return this.loop.subscribe(listener);
  }

  setRate(hz: number): void {
    this.loop.setRate(hz);
  }

  /** Downloads the runtime and model once; later calls reuse them. */
  async load(): Promise<void> {
    if (this.detector) return;
    if (!this.loading) {
      this.setState('loading');
      this.loading = createHandDetector(this.options);
    }
    try {
      const detector = await this.loading;
      if (this.disposed) {
        detector.close();
        return;
      }
      this.detector = detector;
      if (this.current === 'loading') this.setState('ready');
    } catch (error) {
      this.loading = null;
      this.setState('failed');
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /** Begins detecting on `video`. Loads the model first if needed. */
  async start(video: HTMLVideoElement): Promise<void> {
    await this.load();
    if (!this.detector || this.disposed) return;
    this.loop.start(video, this.detector);
    this.setState('running');
  }

  /** Stops detecting but keeps the model in memory for a quick restart. */
  stop(): void {
    this.loop.stop();
    if (this.current === 'running') this.setState('ready');
  }

  dispose(): void {
    this.disposed = true;
    this.loop.dispose();
    this.detector?.close();
    this.detector = null;
    this.events.clear();
  }

  private setState(state: TrackerState): void {
    if (state === this.current) return;
    this.current = state;
    this.events.emit('state', state);
  }
}
