import { BufferAttribute, BufferGeometry, Points, Sphere, Vector3 } from 'three';
import type { ShaderMaterial, Color } from 'three';
import { ndcToPlane } from '../../core/camera/projection';
import { QUALITY_PROFILES } from '../../core/engine/quality';
import { BaseEnvironment } from '../../core/scene/BaseEnvironment';
import type { ControlSpec, ControlValue, QualityLevel } from '../../core/scene/Environment';
import type { EnvironmentAction } from '../../interaction/actions';
import { Starfield } from '../../rendering/effects/Starfield';
import { createParticleMaterial } from '../../rendering/materials/particleMaterial';
import { clamp, damp } from '../../utils/math';
import { createRng } from '../../utils/rng';
import {
  FORMATIONS,
  FORMATION_LABELS,
  FORMATION_RADIUS,
  generateFormation,
  staggeredProgress,
} from './formations';
import type { FormationName } from './formations';

export const PARTICLE_PALETTES = {
  aurora: { label: 'Aurora', a: '#3df5ff', b: '#7a5cff' },
  ember: { label: 'Ember', a: '#ffb347', b: '#ff3d6e' },
  ion: { label: 'Ion', a: '#8dffb0', b: '#1fa2ff' },
  nebula: { label: 'Nebula', a: '#ff7bd5', b: '#5b6cff' },
  solar: { label: 'Solar', a: '#fff1a8', b: '#ff7a1a' },
} as const;

type PaletteName = keyof typeof PARTICLE_PALETTES | 'custom';

type HandMode = 'none' | 'expand' | 'attract';

interface HandState {
  present: boolean;
  mode: HandMode;
  /** Where the hand is, in world space on the plane facing the camera. */
  goal: Vector3;
  current: Vector3;
  force: number;
}

const COUNT_MIN = 2_000;
const COUNT_MAX = 120_000;
const MORPH_SECONDS = 1.9;
const HOVER_FORCE = 0.2;
const CAMERA_DISTANCE = 7.2;

/**
 * Tens of thousands of particles in one draw call. Formation morphing, drift and hand forces are
 * computed in the vertex shader; this class only moves uniforms toward their targets.
 */
export class ParticleUniverse extends BaseEnvironment {
  readonly id = 'particles' as const;

  private points: Points<BufferGeometry, ShaderMaterial> | null = null;
  private material!: ShaderMaterial;
  private starfield: Starfield | null = null;
  private randoms = new Float32Array(0);

  private count = 0;
  private explicitCount = false;
  private formation: FormationName = 'sphere';
  private speed = 1;
  private size = 3;
  private spread = 1;
  private palette: PaletteName = 'aurora';
  private customColor = '#3df5ff';

  private time = 0;
  private morph = 1;
  private morphSeconds = MORPH_SECONDS;
  private expand = 1;
  private gestureSpread = 1;
  private gestureSpreadCurrent = 1;
  private wave = 0;
  private spin = 1;

  private readonly hands: [HandState, HandState] = [createHand(), createHand()];
  private grabHand: 0 | 1 | null = null;
  private readonly grabCenter = new Vector3();
  private readonly grabOffsetGoal = new Vector3();
  private readonly grabOffset = new Vector3();

  private readonly origin = new Vector3();
  private readonly scratch = new Vector3();

  protected build(): void {
    this.camera.position.set(0, 0, CAMERA_DISTANCE);
    this.camera.lookAt(this.origin);

    this.material = this.resources.track(
      createParticleMaterial({
        pixelRatio: this.ctx.pixelRatio,
        maxPointSize: this.ctx.maxPointSize,
      }),
    );
    this.applyPalette();
    this.material.uniforms.uSize.value = this.size;

    this.explicitCount = this.ctx.particleCount !== undefined;
    this.rebuild(this.ctx.particleCount ?? QUALITY_PROFILES[this.ctx.quality].particles);

    this.starfield = new Starfield(QUALITY_PROFILES[this.ctx.quality].backdropStars, 60, 11);
    this.scene.add(this.starfield.points);
  }

  // --- configuration -------------------------------------------------------------------------

  getControls(): ControlSpec[] {
    return [
      {
        kind: 'select',
        id: 'formation',
        label: 'Formation',
        value: this.formation,
        options: FORMATIONS.map((value) => ({ value, label: FORMATION_LABELS[value] })),
      },
      {
        kind: 'range',
        id: 'count',
        label: 'Particles',
        min: COUNT_MIN,
        max: COUNT_MAX,
        step: 1000,
        value: this.count,
      },
      { kind: 'range', id: 'speed', label: 'Speed', min: 0, max: 3, step: 0.05, value: this.speed },
      { kind: 'range', id: 'size', label: 'Size', min: 0.5, max: 8, step: 0.1, value: this.size },
      {
        kind: 'range',
        id: 'spread',
        label: 'Spread',
        min: 0.4,
        max: 2,
        step: 0.02,
        value: this.spread,
      },
      {
        kind: 'select',
        id: 'palette',
        label: 'Palette',
        value: this.palette,
        options: [
          ...Object.entries(PARTICLE_PALETTES).map(([value, p]) => ({ value, label: p.label })),
          { value: 'custom', label: 'Custom' },
        ],
      },
      { kind: 'color', id: 'color', label: 'Colour', value: this.currentColorHex() },
      { kind: 'button', id: 'next', label: 'Next formation' },
    ];
  }

  setControl(id: string, value: ControlValue): void {
    switch (id) {
      case 'formation':
        if (typeof value === 'string' && (FORMATIONS as readonly string[]).includes(value)) {
          this.setFormation(value as FormationName);
        }
        break;
      case 'count':
        if (typeof value === 'number') {
          this.explicitCount = value > 0;
          this.rebuild(value > 0 ? value : QUALITY_PROFILES[this.ctx.quality].particles);
        }
        break;
      case 'speed':
        if (typeof value === 'number') this.speed = clamp(value, 0, 3);
        break;
      case 'size':
        if (typeof value === 'number') {
          this.size = clamp(value, 0.5, 8);
          this.material.uniforms.uSize.value = this.size;
        }
        break;
      case 'spread':
        if (typeof value === 'number') this.spread = clamp(value, 0.4, 2);
        break;
      case 'palette':
        if (typeof value === 'string' && (value === 'custom' || value in PARTICLE_PALETTES)) {
          this.palette = value as PaletteName;
          this.applyPalette();
        }
        break;
      case 'color':
        if (typeof value === 'string') {
          this.customColor = value;
          this.palette = 'custom';
          this.applyPalette();
        }
        break;
      case 'next':
        this.cycleFormation(1);
        return; // cycleFormation notifies
      default:
        return;
    }
    this.notifyControlsChanged();
  }

  setQuality(quality: QualityLevel, pixelRatio: number): void {
    super.setQuality(quality, pixelRatio);
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    if (!this.explicitCount && this.count !== QUALITY_PROFILES[quality].particles) {
      this.rebuild(QUALITY_PROFILES[quality].particles);
      this.notifyControlsChanged();
    }
  }

  reset(): void {
    this.speed = 1;
    this.size = 3;
    this.spread = 1;
    this.palette = 'aurora';
    this.gestureSpread = 1;
    this.material.uniforms.uSize.value = this.size;
    this.applyPalette();
    for (const hand of this.hands) {
      hand.present = false;
      hand.mode = 'none';
    }
    this.grabHand = null;
    this.grabOffsetGoal.set(0, 0, 0);
    if (this.points) this.points.rotation.set(0, 0, 0);
    this.setFormation('sphere');
    this.notifyControlsChanged();
  }

  get currentFormation(): FormationName {
    return this.formation;
  }

  get particleCount(): number {
    return this.count;
  }

  // --- actions -------------------------------------------------------------------------------

  handleAction(action: EnvironmentAction): void {
    switch (action.type) {
      case 'hover': {
        const hand = this.hands[action.hand];
        hand.present = action.phase !== 'end';
        if (hand.present) this.placeHand(hand, action.x, action.y);
        else hand.mode = 'none';
        break;
      }
      case 'expand':
      case 'attract': {
        const hand = this.hands[action.hand];
        if (action.phase === 'end') {
          if (hand.mode === action.type) hand.mode = 'none';
        } else {
          hand.present = true;
          hand.mode = action.type;
          this.placeHand(hand, action.x, action.y);
        }
        break;
      }
      case 'grab':
        this.handleGrab(action);
        break;
      case 'scale':
        this.gestureSpread = clamp(this.gestureSpread * action.factor, 0.35, 2.4);
        break;
      case 'next':
        if (action.phase === 'start') this.cycleFormation(action.direction);
        break;
      case 'release':
        this.gestureSpread = 1;
        break;
      default:
        break;
    }
  }

  private handleGrab(action: Extract<EnvironmentAction, { type: 'grab' }>): void {
    const hand = this.hands[action.hand];
    if (action.phase === 'end') {
      if (this.grabHand === action.hand) {
        this.grabHand = null;
        this.grabOffsetGoal.set(0, 0, 0); // the group springs back into the formation
      }
      return;
    }
    hand.present = true;
    this.placeHand(hand, action.x, action.y);
    if (!this.points) return;
    if (action.phase === 'start' || this.grabHand === null) {
      this.grabHand = action.hand;
      // Snap the hand so the grab starts exactly where the user pinched.
      hand.current.copy(hand.goal);
      this.grabCenter.copy(this.points.worldToLocal(this.scratch.copy(hand.goal)));
      this.grabOffsetGoal.set(0, 0, 0);
      this.grabOffset.set(0, 0, 0);
      return;
    }
    if (this.grabHand === action.hand) {
      this.points.worldToLocal(this.scratch.copy(hand.goal));
      this.grabOffsetGoal.copy(this.scratch).sub(this.grabCenter);
    }
  }

  private placeHand(hand: HandState, x: number, y: number): void {
    const wasPlaced = hand.goal.lengthSq() > 0 || hand.current.lengthSq() > 0;
    ndcToPlane(this.camera, x, y, this.origin, hand.goal);
    if (!wasPlaced) hand.current.copy(hand.goal);
  }

  // --- simulation ----------------------------------------------------------------------------

  update(dt: number): void {
    const points = this.points;
    if (!points) return;
    const u = this.material.uniforms;

    this.time += dt * this.speed;
    u.uTime.value = this.time;

    if (this.morph < 1) {
      this.morph = Math.min(1, this.morph + dt / this.morphSeconds);
      u.uMorph.value = this.morph;
    }

    let expandGoal = 1;
    for (const hand of this.hands) {
      if (!hand.present) continue;
      if (hand.mode === 'expand') expandGoal = Math.max(expandGoal, 1.42);
      if (hand.mode === 'attract') expandGoal = Math.min(expandGoal, 0.72);
    }
    this.expand = damp(this.expand, expandGoal, 3.5, dt);
    this.gestureSpreadCurrent = damp(this.gestureSpreadCurrent, this.gestureSpread, 8, dt);
    u.uScale.value = this.spread * this.gestureSpreadCurrent * this.expand;

    this.wave = damp(this.wave, this.formation === 'wave' ? 0.3 : 0, 2.5, dt);
    u.uWave.value = this.wave;

    // The cloud turns slowly; it holds still while a group is being dragged so the grab stays put.
    this.spin = damp(this.spin, this.grabHand === null ? 1 : 0, 6, dt);
    points.rotation.y += dt * 0.07 * this.speed * this.spin;
    points.updateMatrixWorld();

    const handPositions = u.uHandPos.value as Vector3[];
    const handForces = u.uHandForce.value as number[];
    for (let i = 0; i < 2; i++) {
      const hand = this.hands[i];
      let forceGoal = 0;
      if (hand.present && this.grabHand !== i) {
        forceGoal = hand.mode === 'expand' ? 1 : hand.mode === 'attract' ? -1 : HOVER_FORCE;
      }
      hand.force = damp(hand.force, forceGoal, 7, dt);
      hand.current.lerp(hand.goal, 1 - Math.exp(-18 * dt));
      points.worldToLocal(handPositions[i].copy(hand.current));
      handForces[i] = hand.force;
    }

    const follow = this.grabHand === null ? 3.2 : 14;
    this.grabOffset.lerp(this.grabOffsetGoal, 1 - Math.exp(-follow * dt));
    (u.uGrabOffset.value as Vector3).copy(this.grabOffset);
    (u.uGrabCenter.value as Vector3).copy(this.grabCenter);

    this.starfield?.update(dt);
  }

  // --- formations ----------------------------------------------------------------------------

  setFormation(name: FormationName): void {
    const points = this.points;
    if (!points) return;
    if (name === this.formation && this.morph >= 1) return;
    const geometry = points.geometry;
    const from = geometry.getAttribute('position') as BufferAttribute;
    const to = geometry.getAttribute('aTarget') as BufferAttribute;
    const a = from.array as Float32Array;
    const b = to.array as Float32Array;

    // Bake wherever each particle currently is into the "from" buffer, so a formation change
    // in the middle of a transition continues from the visible state instead of jumping.
    if (this.morph >= 1) {
      a.set(b);
    } else {
      for (let i = 0; i < this.count; i++) {
        const t = staggeredProgress(this.morph, this.randoms[i * 4 + 3]);
        const k = i * 3;
        a[k] += (b[k] - a[k]) * t;
        a[k + 1] += (b[k + 1] - a[k + 1]) * t;
        a[k + 2] += (b[k + 2] - a[k + 2]) * t;
      }
    }
    b.set(generateFormation(name, this.count));
    from.needsUpdate = true;
    to.needsUpdate = true;

    this.formation = name;
    this.morph = 0;
    this.morphSeconds = name === 'explosion' ? 1.1 : MORPH_SECONDS;
    this.material.uniforms.uMorph.value = 0;
  }

  private cycleFormation(direction: 1 | -1): void {
    const i = FORMATIONS.indexOf(this.formation);
    this.setFormation(FORMATIONS[(i + direction + FORMATIONS.length) % FORMATIONS.length]);
    this.notifyControlsChanged();
  }

  /** (Re)allocates the particle buffers for a new count, disposing the previous geometry. */
  private rebuild(requested: number): void {
    const count = Math.round(clamp(requested, COUNT_MIN, COUNT_MAX));
    if (count === this.count && this.points) return;
    const rotation = this.points?.rotation.y ?? 0;
    if (this.points) {
      this.resources.release(this.points.geometry);
      this.points.removeFromParent();
    }

    this.count = count;
    const rng = createRng(1234);
    this.randoms = new Float32Array(count * 4);
    for (let i = 0; i < this.randoms.length; i++) this.randoms[i] = rng();

    const target = generateFormation(this.formation, count);
    const geometry = this.resources.track(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(target), 3));
    geometry.setAttribute('aTarget', new BufferAttribute(target, 3));
    geometry.setAttribute('aRandom', new BufferAttribute(this.randoms, 4));
    // Positions are displaced in the shader, so give Three.js a fixed generous bound.
    geometry.boundingSphere = new Sphere(new Vector3(), FORMATION_RADIUS * 4);

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.rotation.y = rotation;
    this.scene.add(this.points);

    this.morph = 1;
    this.material.uniforms.uMorph.value = 1;
    // Denser clouds overlap more; keep overall brightness roughly constant.
    this.material.uniforms.uOpacity.value = clamp(
      0.95 - Math.log10(count / 2000) * 0.32,
      0.3,
      0.95,
    );
  }

  // --- colour --------------------------------------------------------------------------------

  private applyPalette(): void {
    const a = this.material.uniforms.uColorA.value as Color;
    const b = this.material.uniforms.uColorB.value as Color;
    if (this.palette === 'custom') {
      a.set(this.customColor);
      // Derive the second colour by shifting hue so any pick still yields a gradient.
      b.set(this.customColor).offsetHSL(0.14, 0, -0.05);
    } else {
      a.set(PARTICLE_PALETTES[this.palette].a);
      b.set(PARTICLE_PALETTES[this.palette].b);
    }
  }

  private currentColorHex(): string {
    return this.palette === 'custom' ? this.customColor : PARTICLE_PALETTES[this.palette].a;
  }

  dispose(): void {
    this.starfield?.dispose();
    this.starfield = null;
    this.points?.removeFromParent();
    this.points = null;
    super.dispose();
  }
}

function createHand(): HandState {
  return { present: false, mode: 'none', goal: new Vector3(), current: new Vector3(), force: 0 };
}
