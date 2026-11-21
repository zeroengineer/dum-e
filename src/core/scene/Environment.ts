import type { PerspectiveCamera, Scene } from 'three';
import type { EnvironmentAction } from '../../interaction/actions';

export type EnvironmentId = 'particles' | 'objects' | 'galaxy' | 'globe';
export type QualityLevel = 'low' | 'medium' | 'high';

export interface EnvironmentContext {
  quality: QualityLevel;
  pixelRatio: number;
  aspect: number;
  /** Largest point sprite the GPU will draw, in pixels. */
  maxPointSize: number;
  /** Requested particle budget, or undefined to use the quality default. */
  particleCount?: number;
  /** The live camera picture, or null while the camera is off. */
  video: HTMLVideoElement | null;
}

/** A user-adjustable parameter. The UI renders these without knowing what the environment is. */
export type ControlSpec =
  | {
      kind: 'range';
      id: string;
      label: string;
      min: number;
      max: number;
      step: number;
      value: number;
    }
  | {
      kind: 'select';
      id: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      value: string;
    }
  | { kind: 'color'; id: string; label: string; value: string }
  | { kind: 'toggle'; id: string; label: string; value: boolean }
  | { kind: 'button'; id: string; label: string };

export type ControlValue = number | string | boolean | undefined;

export interface Environment {
  readonly id: EnvironmentId;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  init(ctx: EnvironmentContext): void;
  update(dt: number, elapsed: number): void;
  handleAction(action: EnvironmentAction): void;
  resize(aspect: number): void;
  reset(): void;
  setQuality(quality: QualityLevel, pixelRatio: number): void;
  /**
   * The camera came on (a playing video element) or went off (null). Only worlds that draw the
   * camera picture implement this. The element is for display; hand positions arrive as actions.
   */
  setVideo?(video: HTMLVideoElement | null): void;
  getControls(): ControlSpec[];
  setControl(id: string, value: ControlValue): void;
  /** Facts about the scene for diagnostics and automated tests. Optional. */
  inspect?(): Record<string, number | string | boolean>;
  /** Fires when control values change from inside the environment (for example a swipe changed a preset). */
  onControlsChanged(listener: () => void): () => void;
  dispose(): void;
}

export type EnvironmentFactory = () => Environment;
