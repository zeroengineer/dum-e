import { Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';
import { clamp, damp } from '../../utils/math';

export interface OrbitRigOptions {
  radius: number;
  minRadius: number;
  maxRadius: number;
  /** Azimuth in radians. */
  theta?: number;
  /** Polar angle from the +Y axis in radians. */
  phi?: number;
  minPhi?: number;
  maxPhi?: number;
  damping?: number;
}

/** A damped orbiting camera. Callers nudge targets; `update` eases the camera toward them. */
export class OrbitRig {
  readonly target = new Vector3();
  private theta: number;
  private phi: number;
  private radius: number;
  private thetaGoal: number;
  private phiGoal: number;
  private radiusGoal: number;
  private readonly initial: Required<OrbitRigOptions>;

  constructor(
    private readonly camera: PerspectiveCamera,
    options: OrbitRigOptions,
  ) {
    this.initial = {
      theta: 0,
      phi: Math.PI / 2,
      minPhi: 0.15,
      maxPhi: Math.PI - 0.15,
      damping: 5,
      ...options,
    };
    this.theta = this.thetaGoal = this.initial.theta;
    this.phi = this.phiGoal = this.initial.phi;
    this.radius = this.radiusGoal = this.initial.radius;
    this.apply();
  }

  get currentRadius(): number {
    return this.radiusGoal;
  }

  rotate(dTheta: number, dPhi: number): void {
    this.thetaGoal += dTheta;
    this.phiGoal = clamp(this.phiGoal + dPhi, this.initial.minPhi, this.initial.maxPhi);
  }

  /** factor > 1 moves the camera closer. */
  zoom(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.setRadius(this.radiusGoal / factor);
  }

  setRadius(radius: number): void {
    this.radiusGoal = clamp(radius, this.initial.minRadius, this.initial.maxRadius);
  }

  reset(): void {
    // Unwind accumulated turns so the reset takes the short way round.
    this.theta = this.theta % (Math.PI * 2);
    this.thetaGoal = this.initial.theta;
    this.phiGoal = this.initial.phi;
    this.radiusGoal = this.initial.radius;
  }

  update(dt: number): void {
    const k = this.initial.damping;
    this.theta = damp(this.theta, this.thetaGoal, k, dt);
    this.phi = damp(this.phi, this.phiGoal, k, dt);
    this.radius = damp(this.radius, this.radiusGoal, k, dt);
    this.apply();
  }

  private apply(): void {
    const sinPhi = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }
}
