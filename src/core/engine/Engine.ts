import { PerspectiveCamera, Scene } from 'three';
import { Starfield } from '../../rendering/effects/Starfield';
import { Emitter } from '../../utils/emitter';
import { timed } from '../../utils/perf';
import { SampleWindow } from '../../utils/stats';
import { RendererManager } from '../renderer/RendererManager';
import type { RendererOptions } from '../renderer/RendererManager';
import type {
  Environment,
  EnvironmentContext,
  EnvironmentFactory,
  EnvironmentId,
  QualityLevel,
} from '../scene/Environment';
import { SceneManager } from '../scene/SceneManager';
import { QUALITY_PROFILES, guessQuality } from './quality';
import { QualityGovernor, startingQuality } from './QualityGovernor';
import type { RenderQuality } from './QualityGovernor';

/** A profiling readout, published about twice a second while profiling is on. */
export interface PerfSample {
  /** Time between frames in milliseconds: the median and the slow tail. */
  frameP50: number;
  frameP95: number;
  frameMax: number;
  /**
   * Main-thread time spent updating and submitting a frame, in milliseconds. With GPU sync on
   * (a measuring mode) it also includes the time the GPU took to draw the frame.
   */
  workMean: number;
  workP95: number;
  gpuSync: boolean;
  antialias: boolean;
  drawCalls: number;
  points: number;
  triangles: number;
  lines: number;
  pixelRatio: number;
  quality: QualityLevel;
}

interface EngineEvents {
  /** Smoothed frames per second, about twice a second. */
  fps: number;
  perf: PerfSample;
  quality: QualityLevel;
  /** Automatic quality moved to a new level. Worth remembering for the next visit. */
  adapted: RenderQuality;
  environment: Environment | null;
}

const MAX_DT = 0.1;

/**
 * The render loop. Owns the renderer, the active environment and quality adaptation.
 * It knows nothing about cameras, hands or gestures; input arrives as EnvironmentActions
 * delivered straight to the active environment by the interaction layer.
 */
export class Engine {
  readonly events = new Emitter<EngineEvents>();
  private readonly renderer: RendererManager;
  private readonly scenes = new SceneManager();
  private readonly backdropScene = new Scene();
  private readonly backdropCamera = new PerspectiveCamera(55, 1, 0.1, 400);
  private readonly backdrop: Starfield;
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;
  private frames = 0;
  private fpsWindowStart = 0;
  /** Present only while quality is automatic. */
  private governor: QualityGovernor | null = null;
  private quality: QualityLevel;
  private particleBudget = 0;
  private video: HTMLVideoElement | null = null;
  private profiling = false;
  private gpuSync = false;
  /** About two seconds of frames at 60 fps. */
  private readonly frameTimes = new SampleWindow(120);
  private readonly workTimes = new SampleWindow(120);

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.renderer = new RendererManager(canvas, options);
    const start = startingQuality(guessQuality(this.renderer.hints), devicePixelRatio());
    this.quality = start.tier;
    this.renderer.setPixelRatioCap(start.pixelRatio);
    this.backdrop = new Starfield(QUALITY_PROFILES.medium.backdropStars);
    this.backdropScene.add(this.backdrop.points);
    this.backdropCamera.aspect = this.renderer.aspect;
    this.backdropCamera.updateProjectionMatrix();
    this.renderer.onResize((aspect) => {
      this.backdropCamera.aspect = aspect;
      this.backdropCamera.updateProjectionMatrix();
      this.scenes.current?.resize(aspect);
    });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get currentQuality(): QualityLevel {
    return this.quality;
  }

  get environment(): Environment | null {
    return this.scenes.current;
  }

  register(id: EnvironmentId, factory: EnvironmentFactory): void {
    this.scenes.register(id, factory);
  }

  setEnvironment(id: EnvironmentId | null): Environment | null {
    const environment = timed(`activate:${id ?? 'none'}`, () =>
      this.scenes.activate(id, this.context()),
    );
    this.governor?.settle();
    this.events.emit('environment', environment);
    return environment;
  }

  /**
   * `auto` starts from a guess at what the device can do and adapts from measured frame rate;
   * `remembered` resumes from the level an earlier visit adapted to. A named tier is fixed.
   */
  setQualityPreference(preference: 'auto' | QualityLevel, remembered?: RenderQuality | null): void {
    if (preference !== 'auto') {
      this.governor = null;
      this.applyQuality(startingQuality(preference, devicePixelRatio()));
      return;
    }
    this.governor = new QualityGovernor(
      startingQuality(guessQuality(this.renderer.hints), devicePixelRatio()),
    );
    if (remembered) this.governor.restore(remembered);
    this.applyQuality(this.governor.current);
  }

  /** 0 restores the per-quality default. */
  setParticleBudget(count: number): void {
    this.particleBudget = count;
  }

  /** Hands the live camera picture to worlds that draw it; null when the camera is off. */
  setVideo(video: HTMLVideoElement | null): void {
    if (video === this.video) return;
    this.video = video;
    this.scenes.current?.setVideo?.(video);
  }

  /**
   * Ignore slow frames for a while. Used around known one-off stalls (loading the hand model),
   * which say nothing about how fast the scene itself renders.
   */
  pauseQualityAdaptation(ms: number): void {
    this.governor?.pause(ms / 1000);
  }

  /** Collects frame timings and render counts and publishes them as `perf` events. */
  setProfiling(on: boolean): void {
    this.profiling = on;
    if (!on) this.gpuSync = false;
    this.frameTimes.clear();
    this.workTimes.clear();
  }

  /**
   * Measuring mode: wait for the GPU at the end of every frame so frame timings include its
   * work. It slows rendering down and is never on in normal use.
   */
  setGpuSync(on: boolean): void {
    this.gpuSync = on;
    this.frameTimes.clear();
    this.workTimes.clear();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.fpsWindowStart = this.lastTime;
    this.frames = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scenes.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    this.events.clear();
  }

  private context(): EnvironmentContext {
    return {
      quality: this.quality,
      pixelRatio: this.renderer.pixelRatio,
      aspect: this.renderer.aspect,
      maxPointSize: this.renderer.maxPointSize,
      particleCount: this.particleBudget > 0 ? this.particleBudget : undefined,
      video: this.video,
    };
  }

  private applyQuality(next: RenderQuality): void {
    const changed = next.tier !== this.quality;
    this.quality = next.tier;
    this.renderer.setPixelRatioCap(next.pixelRatio);
    this.scenes.current?.setQuality(next.tier, this.renderer.pixelRatio);
    if (changed) this.events.emit('quality', next.tier);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const interval = now - this.lastTime;
    const dt = Math.min(interval / 1000, MAX_DT);
    this.lastTime = now;
    const workStart = this.profiling ? performance.now() : 0;
    this.elapsed += dt;

    const environment = this.scenes.current;
    if (environment) {
      environment.update(dt, this.elapsed);
      this.renderer.render(environment.scene, environment.camera);
    } else {
      this.backdrop.update(dt * 6);
      this.renderer.render(this.backdropScene, this.backdropCamera);
    }
    if (this.profiling) {
      if (this.gpuSync) this.renderer.finish();
      this.frameTimes.push(interval);
      this.workTimes.push(performance.now() - workStart);
    }
    this.measure(now);
  };

  private measure(now: number): void {
    this.frames++;
    const span = now - this.fpsWindowStart;
    if (span < 500) return;
    const fps = (this.frames * 1000) / span;
    this.frames = 0;
    this.fpsWindowStart = now;
    this.events.emit('fps', fps);
    if (this.profiling) this.emitPerf();

    const adapted = this.governor?.sample(fps, span / 1000);
    if (adapted) {
      this.applyQuality(adapted);
      this.events.emit('adapted', { ...adapted });
    }
  }

  private emitPerf(): void {
    this.events.emit('perf', {
      frameP50: this.frameTimes.percentile(0.5),
      frameP95: this.frameTimes.percentile(0.95),
      frameMax: this.frameTimes.max(),
      workMean: this.workTimes.mean(),
      workP95: this.workTimes.percentile(0.95),
      ...this.renderer.stats(),
      pixelRatio: this.renderer.pixelRatio,
      quality: this.quality,
      gpuSync: this.gpuSync,
      antialias: this.renderer.antialias,
    });
  }

  /** A hidden tab gets no animation frames worth rendering; stop asking for them. */
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
    } else if (this.running) {
      this.lastTime = performance.now();
      this.fpsWindowStart = this.lastTime;
      this.frames = 0;
      // The gap while hidden is not a slow frame.
      this.frameTimes.clear();
      this.workTimes.clear();
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(this.frame);
    }
  };
}

const devicePixelRatio = (): number => window.devicePixelRatio || 1;
