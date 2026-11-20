import { PerspectiveCamera, Scene } from 'three';
import type { EnvironmentAction } from '../../interaction/actions';
import { ResourceTracker } from '../resources/ResourceTracker';
import type {
  ControlSpec,
  ControlValue,
  Environment,
  EnvironmentContext,
  EnvironmentId,
  QualityLevel,
} from './Environment';

/** Shared plumbing for environments: scene, camera, resource tracking and control notifications. */
export abstract class BaseEnvironment implements Environment {
  abstract readonly id: EnvironmentId;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 400);
  protected readonly resources = new ResourceTracker();
  protected ctx: EnvironmentContext = {
    quality: 'medium',
    pixelRatio: 1,
    aspect: 1,
    maxPointSize: 64,
  };
  private readonly controlListeners = new Set<() => void>();

  init(ctx: EnvironmentContext): void {
    this.ctx = { ...ctx };
    this.resize(ctx.aspect);
    this.build();
  }

  /** Create scene content. Called once from `init`. */
  protected abstract build(): void;
  abstract update(dt: number, elapsed: number): void;
  abstract handleAction(action: EnvironmentAction): void;
  abstract reset(): void;
  abstract getControls(): ControlSpec[];
  abstract setControl(id: string, value: ControlValue): void;

  resize(aspect: number): void {
    this.ctx.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setQuality(quality: QualityLevel, pixelRatio: number): void {
    this.ctx.quality = quality;
    this.ctx.pixelRatio = pixelRatio;
  }

  onControlsChanged(listener: () => void): () => void {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }

  protected notifyControlsChanged(): void {
    for (const listener of this.controlListeners) listener();
  }

  dispose(): void {
    this.controlListeners.clear();
    this.resources.dispose();
    this.scene.clear();
  }
}
