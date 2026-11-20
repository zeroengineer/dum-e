import { Emitter } from '../../utils/emitter';
import type { LandmarkSource, RawHand, RawHandFrame } from '../landmarks/types';
import { RateLimiter, RateMeter } from './RateLimiter';

/** The only thing the loop needs from a detector. */
export interface FrameDetector {
  detect(video: HTMLVideoElement, timestampMs: number): RawHand[];
}

interface TrackingLoopEvents {
  frame: RawHandFrame;
  /** Detections per second actually achieved, about once a second. */
  rate: number;
  /** The detector kept throwing; the loop has stopped itself. */
  error: Error;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Runs hand detection on its own clock, independent of rendering.
 *
 * It wakes on new video frames (or a timer where the browser cannot signal them), runs the
 * detector at most `hz` times a second, never twice on the same video frame, and does nothing
 * while the page is hidden.
 */
export class TrackingLoop implements LandmarkSource {
  readonly events = new Emitter<TrackingLoopEvents>();
  private readonly limiter: RateLimiter;
  private readonly meter = new RateMeter();
  private video: VideoWithFrameCallback | null = null;
  private detector: FrameDetector | null = null;
  private running = false;
  private frameHandle = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastVideoTime = -1;
  private lastTimestamp = 0;
  private errors = 0;

  constructor(hz: number) {
    this.limiter = new RateLimiter(hz);
  }

  get isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: (frame: RawHandFrame) => void): () => void {
    return this.events.on('frame', listener);
  }

  setRate(hz: number): void {
    this.limiter.setRate(hz);
    if (this.running && this.timer !== null) this.schedule(); // the timer period depends on the rate
  }

  start(video: HTMLVideoElement, detector: FrameDetector): void {
    this.stop();
    this.video = video;
    this.detector = detector;
    this.running = true;
    this.errors = 0;
    this.lastVideoTime = -1;
    this.limiter.reset();
    this.meter.reset();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.cancel();
    this.video = null;
    this.detector = null;
  }

  dispose(): void {
    this.stop();
    this.events.clear();
  }

  private schedule(): void {
    this.cancel();
    const video = this.video;
    if (!video || !this.running) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.frameHandle = video.requestVideoFrameCallback(this.onVideoFrame);
    } else {
      this.timer = setInterval(this.tick, 1000 / this.limiter.rate);
    }
  }

  private cancel(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.frameHandle && this.video?.cancelVideoFrameCallback) {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    }
    this.frameHandle = 0;
  }

  private readonly onVideoFrame = (): void => {
    if (!this.running || !this.video?.requestVideoFrameCallback) return;
    this.frameHandle = this.video.requestVideoFrameCallback(this.onVideoFrame);
    this.tick();
  };

  private readonly tick = (): void => {
    const video = this.video;
    const detector = this.detector;
    if (!this.running || !video || !detector) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    // HAVE_CURRENT_DATA: there is a decoded frame to analyse.
    if (video.readyState < 2 || video.videoWidth === 0) return;
    if (video.currentTime === this.lastVideoTime) return;
    const now = performance.now();
    if (!this.limiter.shouldRun(now)) return;
    this.lastVideoTime = video.currentTime;

    // MediaPipe rejects timestamps that do not strictly increase.
    const timestamp = Math.max(now, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;

    let hands: RawHand[];
    try {
      hands = detector.detect(video, timestamp);
      this.errors = 0;
    } catch (error) {
      if (++this.errors >= MAX_CONSECUTIVE_ERRORS) {
        this.stop();
        this.events.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }

    this.events.emit('frame', {
      timestamp,
      aspect: video.videoWidth / video.videoHeight,
      hands,
    });
    const rate = this.meter.tick(now);
    if (rate !== null) this.events.emit('rate', rate);
  };
}
