import { Emitter } from '../../utils/emitter';
import { cameraError, cameraSupportProblem, classifyCameraError } from './errors';
import type { CameraError } from './errors';

export type CameraState = 'idle' | 'requesting' | 'live' | 'failed';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
}

export interface CameraStatus {
  state: CameraState;
  error: CameraError | null;
  /** The device actually in use while live. */
  deviceId: string | null;
}

export interface WebcamOptions {
  width: number;
  height: number;
  frameRate: number;
}

interface WebcamEvents {
  status: CameraStatus;
  devices: CameraDeviceInfo[];
}

/** Hands are large features; a small frame keeps inference cheap without hurting accuracy. */
export const DEFAULT_WEBCAM_OPTIONS: WebcamOptions = { width: 640, height: 480, frameRate: 30 };

/**
 * Owns the camera: permission, device choice, the MediaStream and the <video> it plays in.
 * Nothing else in the app calls getUserMedia or touches a MediaStreamTrack.
 */
export class WebcamManager {
  readonly events = new Emitter<WebcamEvents>();
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private current: CameraStatus = { state: 'idle', error: null, deviceId: null };
  /** Incremented by every start/stop so a slow permission prompt cannot revive a cancelled request. */
  private generation = 0;

  constructor(private readonly options: WebcamOptions = DEFAULT_WEBCAM_OPTIONS) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    this.video.setAttribute('aria-hidden', 'true');
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
  }

  get status(): CameraStatus {
    return this.current;
  }

  get isLive(): boolean {
    return this.current.state === 'live';
  }

  /** Width / height of the live video, or the requested aspect before the first frame. */
  get aspect(): number {
    const { videoWidth, videoHeight } = this.video;
    return videoWidth > 0 && videoHeight > 0
      ? videoWidth / videoHeight
      : this.options.width / this.options.height;
  }

  /**
   * Asks for the camera and starts playback. Resolves true once frames are flowing.
   * Calling it again switches device; a failure is reported through `status`, never thrown.
   */
  async start(deviceId: string | null = null): Promise<boolean> {
    const generation = ++this.generation;
    this.releaseStream();

    const problem = cameraSupportProblem({
      isSecureContext: globalThis.isSecureContext !== false,
      hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
    });
    if (problem) {
      this.setStatus({ state: 'failed', error: problem, deviceId: null });
      return false;
    }

    this.setStatus({ state: 'requesting', error: null, deviceId: null });
    let stream: MediaStream;
    try {
      stream = await this.request(deviceId);
    } catch (error) {
      if (generation !== this.generation) return false;
      this.setStatus({ state: 'failed', error: classifyCameraError(error), deviceId: null });
      return false;
    }
    if (generation !== this.generation) {
      // stop() or another start() happened while the prompt was open.
      stopTracks(stream);
      return false;
    }

    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    track?.addEventListener('ended', this.onTrackEnded);
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (error) {
      if (generation !== this.generation) return false;
      this.releaseStream();
      this.setStatus({ state: 'failed', error: classifyCameraError(error), deviceId: null });
      return false;
    }
    if (generation !== this.generation) return false;

    this.setStatus({
      state: 'live',
      error: null,
      deviceId: track?.getSettings().deviceId ?? deviceId,
    });
    // Device labels are only readable once permission has been granted.
    void this.refreshDevices();
    return true;
  }

  /** Stops every track so the camera light goes off. */
  stop(): void {
    this.generation++;
    this.releaseStream();
    this.setStatus({ state: 'idle', error: null, deviceId: null });
  }

  async refreshDevices(): Promise<CameraDeviceInfo[]> {
    if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
        // Before permission is granted browsers return a single entry with an empty id.
        .filter((d) => d.deviceId !== '');
      this.events.emit('devices', cameras);
      return cameras;
    } catch {
      return [];
    }
  }

  dispose(): void {
    this.stop();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.video.remove();
    this.events.clear();
  }

  private async request(deviceId: string | null): Promise<MediaStream> {
    const { width, height, frameRate } = this.options;
    const base: MediaTrackConstraints = {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate, max: frameRate },
    };
    const media = navigator.mediaDevices;
    if (deviceId) {
      try {
        return await media.getUserMedia({
          audio: false,
          video: { ...base, deviceId: { exact: deviceId } },
        });
      } catch (error) {
        // A remembered camera that has been unplugged should not block the default one.
        const name = (error as { name?: string } | null)?.name;
        if (name !== 'OverconstrainedError' && name !== 'NotFoundError') throw error;
      }
    }
    return media.getUserMedia({ audio: false, video: { ...base, facingMode: 'user' } });
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.removeEventListener('ended', this.onTrackEnded);
      }
      stopTracks(this.stream);
      this.stream = null;
    }
    this.video.pause();
    this.video.srcObject = null;
  }

  private setStatus(status: CameraStatus): void {
    this.current = status;
    this.events.emit('status', status);
  }

  /** Fires when the camera is unplugged or the browser revokes access mid-session. */
  private readonly onTrackEnded = (): void => {
    this.generation++;
    this.releaseStream();
    this.setStatus({ state: 'failed', error: cameraError('aborted'), deviceId: null });
  };

  private readonly onDeviceChange = (): void => {
    void this.refreshDevices();
  };
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
