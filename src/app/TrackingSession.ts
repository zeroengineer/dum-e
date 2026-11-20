import type { GestureSink } from '../gestures/events/types';
import { GestureEngine } from '../gestures/GestureEngine';
import { createDefaultRegistry } from '../gestures/recognizers/GestureRegistry';
import type { GestureRegistry } from '../gestures/recognizers/GestureRegistry';
import { Emitter } from '../utils/emitter';
import { LandmarkProcessor } from '../vision/landmarks/LandmarkProcessor';
import type { RawHandFrame, TrackingFrame } from '../vision/landmarks/types';
import { defaultDetectorOptions } from '../vision/mediapipe/HandDetector';
import { HandTracker } from '../vision/mediapipe/HandTracker';
import type { CameraError } from '../vision/webcam/errors';
import { WebcamManager } from '../vision/webcam/WebcamManager';
import type { CameraDeviceInfo } from '../vision/webcam/WebcamManager';

export type SessionStatus =
  | { state: 'off' }
  | { state: 'requesting' }
  | { state: 'loading' }
  | { state: 'active' }
  | { state: 'paused' }
  | { state: 'camera-failed'; error: CameraError }
  | { state: 'tracker-failed'; message: string };

interface SessionEvents {
  status: SessionStatus;
  /** Processed hands for every analysed video frame, including frames with no hands. */
  frame: TrackingFrame;
  rate: number;
  devices: CameraDeviceInfo[];
}

export interface TrackingSessionOptions {
  trackingHz: number;
  sensitivity: number;
  /** Where gesture events go. */
  sink: GestureSink;
  registry?: GestureRegistry;
}

const TRACKER_FAILED =
  'Hand tracking could not be loaded. Check your connection and retry, or continue with the mouse.';

/**
 * The camera-to-gesture pipeline as one unit:
 * WebcamManager → HandTracker → LandmarkProcessor → GestureEngine → sink.
 * This is the only place those stages are joined together.
 */
export class TrackingSession {
  readonly events = new Emitter<SessionEvents>();
  readonly webcam = new WebcamManager();
  readonly registry: GestureRegistry;
  private readonly tracker: HandTracker;
  private readonly processor = new LandmarkProcessor();
  private readonly engine: GestureEngine;
  private current: SessionStatus = { state: 'off' };
  /** Bumped by every start and stop so a slow start cannot finish after a later stop. */
  private generation = 0;

  constructor(options: TrackingSessionOptions) {
    this.registry = options.registry ?? createDefaultRegistry();
    this.engine = new GestureEngine(this.registry, options.sink, {
      sensitivity: options.sensitivity,
    });
    this.tracker = new HandTracker(defaultDetectorOptions(document.baseURI), options.trackingHz);

    this.tracker.subscribe(this.onRawFrame);
    this.tracker.events.on('rate', (rate) => this.events.emit('rate', rate));
    this.tracker.events.on('error', () =>
      this.fail({ state: 'tracker-failed', message: TRACKER_FAILED }),
    );
    this.webcam.events.on('devices', (devices) => this.events.emit('devices', devices));
    this.webcam.events.on('status', (status) => {
      // The camera went away mid-session (unplugged, permission revoked).
      if (status.state === 'failed' && status.error && this.isRunning) {
        this.fail({ state: 'camera-failed', error: status.error });
      }
    });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get status(): SessionStatus {
    return this.current;
  }

  get video(): HTMLVideoElement {
    return this.webcam.video;
  }

  get isRunning(): boolean {
    return this.current.state === 'active' || this.current.state === 'paused';
  }

  /** Which delegate inference runs on, once loaded. */
  get delegate(): string | null {
    return this.tracker.delegate;
  }

  setRate(hz: number): void {
    this.tracker.setRate(hz);
  }

  setSensitivity(sensitivity: number): void {
    this.engine.setSensitivity(sensitivity);
  }

  /** Asks for the camera, loads the model and starts tracking. Failures are reported as status. */
  async start(deviceId: string | null = null): Promise<boolean> {
    const generation = ++this.generation;
    this.haltPipeline();
    this.setStatus({ state: 'requesting' });

    const live = await this.webcam.start(deviceId);
    if (generation !== this.generation) return false;
    if (!live) {
      const error = this.webcam.status.error;
      if (error) this.setStatus({ state: 'camera-failed', error });
      return false;
    }

    this.setStatus({ state: 'loading' });
    try {
      await this.tracker.start(this.webcam.video);
    } catch (error) {
      if (generation !== this.generation) return false;
      console.error('[tracking] could not start the hand tracker', error);
      this.webcam.stop();
      this.setStatus({ state: 'tracker-failed', message: TRACKER_FAILED });
      return false;
    }
    if (generation !== this.generation) {
      return false;
    }
    this.setStatus({ state: document.hidden ? 'paused' : 'active' });
    return true;
  }

  /** Stops detection and releases the camera. The loaded model is kept for a quick restart. */
  stop(): void {
    this.generation++;
    this.haltPipeline();
    this.webcam.stop();
    this.setStatus({ state: 'off' });
  }

  /**
   * Feeds a detector frame straight into the pipeline, bypassing the camera and MediaPipe.
   * Used by automated tests and recordings; everything downstream behaves exactly as with live input.
   */
  inject(frame: RawHandFrame): void {
    this.onRawFrame(frame);
  }

  dispose(): void {
    this.generation++;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.haltPipeline();
    this.tracker.dispose();
    this.webcam.dispose();
    this.events.clear();
  }

  private readonly onRawFrame = (raw: RawHandFrame): void => {
    const frame = this.processor.process(raw);
    this.engine.process(frame);
    this.events.emit('frame', frame);
  };

  private readonly onVisibility = (): void => {
    if (document.hidden && this.current.state === 'active') {
      // No frames arrive while hidden, so nothing would ever end a gesture in progress.
      this.engine.reset();
      this.processor.reset();
      this.setStatus({ state: 'paused' });
    } else if (!document.hidden && this.current.state === 'paused') {
      this.setStatus({ state: 'active' });
    }
  };

  private fail(status: SessionStatus): void {
    this.generation++;
    this.haltPipeline();
    this.webcam.stop();
    this.setStatus(status);
  }

  /** Stops detecting and ends every gesture in progress. */
  private haltPipeline(): void {
    this.tracker.stop();
    this.engine.reset();
    this.processor.reset();
  }

  private setStatus(status: SessionStatus): void {
    this.current = status;
    this.events.emit('status', status);
  }
}
