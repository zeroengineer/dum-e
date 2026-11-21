import { Engine } from '../core/engine/Engine';
import type { Environment, EnvironmentId } from '../core/scene/Environment';
import { isEnvironmentId, preloadEnvironments, registerEnvironments } from '../environments';
import { FallbackInput } from '../interaction/controllers/FallbackInput';
import { InteractionController } from '../interaction/controllers/InteractionController';
import { GestureEventBus } from '../interaction/dispatcher/GestureEventBus';
import { DEFAULT_MAPPINGS } from '../interaction/mappings';
import { setTracking, store, updateSettings, watch } from '../state/store';
import { clearGestureState, syncGesturesToStore } from './gestureState';
import { TrackingSession } from './TrackingSession';
import type { SessionStatus } from './TrackingSession';

export interface AppOptions {
  /** Force multisampling on or off instead of letting the renderer choose. For measurement. */
  antialias?: boolean;
}

/**
 * The composition root. Every system is created here and joined to its neighbours here;
 * no system reaches for another on its own. The UI drives the app through this class.
 */
export class App {
  readonly engine: Engine;
  readonly bus = new GestureEventBus();
  readonly session: TrackingSession;
  readonly controller: InteractionController;
  private readonly fallback: FallbackInput;
  private readonly cleanups: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: AppOptions = {}) {
    const { settings } = store.getState();

    this.engine = new Engine(canvas, { antialias: options.antialias });
    registerEnvironments(this.engine);
    this.engine.setQualityPreference(settings.quality, settings.adaptedQuality);
    this.engine.setParticleBudget(settings.particleCount);

    this.controller = new InteractionController(this.bus, DEFAULT_MAPPINGS);
    this.controller.setSourceEnabled('fallback', settings.fallbackInput);
    this.fallback = new FallbackInput(canvas, this.bus.publish);
    this.fallback.setEnabled(settings.fallbackInput);

    this.session = new TrackingSession({
      trackingHz: settings.trackingHz,
      sensitivity: settings.sensitivity,
      sink: this.bus.publish,
    });

    this.cleanups.push(
      syncGesturesToStore(this.bus),
      this.engine.events.on('fps', (fps) => store.setState({ fps })),
      this.engine.events.on('quality', (resolvedQuality) => {
        store.setState({ resolvedQuality });
        // Styles can shed their own expensive effects on the low tier.
        document.documentElement.dataset.quality = resolvedQuality;
      }),
      this.engine.events.on('adapted', (adaptedQuality) => updateSettings({ adaptedQuality })),
      // Whatever environment is on screen is the one gestures act on.
      this.engine.events.on('environment', (environment) => {
        this.controller.setTarget(environment?.id ?? null, environment);
      }),
      this.session.events.on('status', (status) => this.onSessionStatus(status)),
      this.session.events.on('rate', (rate) => setTracking({ rate })),
      this.session.events.on('devices', (devices) => store.setState({ devices })),
      watch(
        (s) => s.settings,
        (next, previous) => {
          if (next.quality !== previous.quality) {
            // Choosing a setting by hand is a fresh start: what auto had settled on is forgotten.
            this.engine.setQualityPreference(next.quality);
            if (next.adaptedQuality) updateSettings({ adaptedQuality: null });
          }
          if (next.particleCount !== previous.particleCount) {
            this.engine.setParticleBudget(next.particleCount);
            const environment = this.environment;
            if (environment?.id === 'particles') {
              environment.setControl('count', next.particleCount);
            }
          }
          if (next.trackingHz !== previous.trackingHz) this.session.setRate(next.trackingHz);
          if (next.sensitivity !== previous.sensitivity) {
            this.session.setSensitivity(next.sensitivity);
          }
          if (next.fallbackInput !== previous.fallbackInput) {
            this.fallback.setEnabled(next.fallbackInput);
            this.controller.setSourceEnabled('fallback', next.fallbackInput);
          }
        },
      ),
    );

    store.setState({ resolvedQuality: this.engine.currentQuality });
    document.documentElement.dataset.quality = this.engine.currentQuality;
    preloadEnvironments();
    this.engine.start();
    window.addEventListener('pagehide', this.onPageHide);
  }

  get environment(): Environment | null {
    return this.engine.environment;
  }

  // --- navigation ----------------------------------------------------------------------------

  showLanding(): void {
    this.show(null);
    store.setState({ screen: 'landing', environment: null });
  }

  showSelector(): void {
    this.show(null);
    store.setState({ screen: 'selector', environment: null, settingsOpen: false });
  }

  openEnvironment(id: EnvironmentId): void {
    if (store.getState().environment !== id || !this.engine.environment) {
      this.show(id);
    }
    store.setState({ screen: 'experience', environment: id });
  }

  /** Asks the engine for a world. It appears when its code and shaders are ready. */
  private show(id: EnvironmentId | null): void {
    this.engine.setEnvironment(id).catch((error: unknown) => {
      // The world's code could not be fetched (offline, or a deploy replaced the files).
      console.error(`[app] could not open "${String(id)}"`, error);
      store.setState({ screen: 'selector', environment: null });
    });
  }

  /** Opens the environment named in the URL (?env=galaxy), if any. */
  openFromUrl(search: string): boolean {
    const requested = new URLSearchParams(search).get('env');
    if (!isEnvironmentId(requested)) return false;
    this.openEnvironment(requested);
    return true;
  }

  resetEnvironment(): void {
    this.environment?.reset();
  }

  // --- tracking ------------------------------------------------------------------------------

  /** Turns the camera and hand tracking on. Resolves true once tracking is running. */
  enableTracking(): Promise<boolean> {
    return this.session.start(store.getState().settings.cameraId);
  }

  disableTracking(): void {
    this.session.stop();
  }

  /** Switches camera, remembering the choice. Restarts tracking only if it was already on. */
  async selectCamera(deviceId: string | null): Promise<void> {
    updateSettings({ cameraId: deviceId });
    const state = store.getState().tracking.status;
    if (state !== 'off') await this.session.start(deviceId);
  }

  dispose(): void {
    window.removeEventListener('pagehide', this.onPageHide);
    for (const cleanup of this.cleanups) cleanup();
    this.fallback.dispose();
    this.controller.dispose();
    this.session.dispose();
    this.engine.dispose();
    this.bus.clear();
  }

  /** The page is going away: make sure the camera light goes off. */
  private readonly onPageHide = (event: PageTransitionEvent): void => {
    // A page kept in the back/forward cache can come back; only release the camera then.
    if (event.persisted) this.session.stop();
    else this.dispose();
  };

  private onSessionStatus(status: SessionStatus): void {
    // Starting the camera and compiling the hand model stalls the page for a moment.
    if (status.state !== 'off') this.engine.pauseQualityAdaptation(6000);
    // A paused session (hidden tab) still holds the camera; every other state has no picture.
    const live = status.state === 'active' || status.state === 'paused';
    this.engine.setVideo(live ? this.session.video : null);
    switch (status.state) {
      case 'camera-failed':
        clearGestureState();
        setTracking({
          status: status.error.kind === 'denied' ? 'denied' : 'error',
          message: status.error.message,
        });
        break;
      case 'tracker-failed':
        clearGestureState();
        setTracking({ status: 'error', message: status.message });
        break;
      case 'off':
        clearGestureState();
        setTracking({ status: 'off', message: null });
        break;
      case 'paused':
        clearGestureState();
        setTracking({ status: 'paused', message: null });
        break;
      default:
        setTracking({ status: status.state, message: null });
    }
  }
}
