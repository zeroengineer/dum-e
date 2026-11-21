import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Mesh,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Sphere,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { Color, ShaderMaterial, WebGLRenderer } from 'three';
import { ndcToPlane } from '../../core/camera/projection';
import { imageToNdc } from '../../core/camera/videoFit';
import { QUALITY_PROFILES } from '../../core/engine/quality';
import { BaseEnvironment } from '../../core/scene/BaseEnvironment';
import type { ControlSpec, ControlValue, QualityLevel } from '../../core/scene/Environment';
import type { EnvironmentAction } from '../../interaction/actions';
import { CameraBackdrop } from '../../rendering/effects/CameraBackdrop';
import { Starfield } from '../../rendering/effects/Starfield';
import {
  createGlobeDotsMaterial,
  createGlobeHaloMaterial,
  createGlobeLinesMaterial,
  createGlobeShellMaterial,
} from '../../rendering/materials/globeMaterial';
import { clamp, damp, lerp } from '../../utils/math';
import { timed } from '../../utils/perf';
import { GLOBE_EFFECTS, GLOBE_EFFECT_CHOICES } from './effects';
import type { GlobeEffect, GlobeEffectName, GlobeParts } from './effects';
import { generate } from '../generation/generate';
import { generateGraticule } from './geometry';
import {
  COLLAPSED_SCALE,
  DEFAULT_GLOBE_OPTIONS,
  GLOBE_RADIUS_MAX,
  GLOBE_RADIUS_MIN,
  GlobeState,
} from './globeState';

export const GLOBE_LOOKS = {
  earth: { label: 'Earth', land: 1, grid: 0.2 },
  grid: { label: 'Grid', land: 0, grid: 0.85 },
} as const;

export const GLOBE_COLOURS = {
  arc: { label: 'Arc blue', main: '#3fb8ff', accent: '#d6f6ff' },
  amber: { label: 'Amber', main: '#ff9d3c', accent: '#ffe9c4' },
  jade: { label: 'Jade', main: '#2fe6a0', accent: '#d8ffee' },
  rose: { label: 'Rose', main: '#ff5fa2', accent: '#ffd9ea' },
} as const;

type LookName = keyof typeof GLOBE_LOOKS;
type ColourName = keyof typeof GLOBE_COLOURS;

const LOOK_NAMES = Object.keys(GLOBE_LOOKS) as LookName[];

/** Dots drawn per quality tier. The buffers always hold the largest; lower tiers draw fewer. */
const DOTS: Record<QualityLevel, number> = { low: 7_000, medium: 14_000, high: 24_000 };
const DOTS_MAX = DOTS.high;

const CAMERA_DISTANCE = 6;
/** The halo quad is this many globe radii across, so the glow has room to fade out. */
const HALO_SPAN = 3.2;
const DEFAULTS = { look: 'earth', colour: 'arc', effect: 'scan', glow: 1, dimming: 0.35 } as const;

type EffectChoice = GlobeEffectName | 'none';
/** Five fingertips for each of two hands. */
const TIP_COUNT = 10;

interface LiveEffect {
  effect: GlobeEffect;
  /** 0 off, 1 on; eased so effects cross-fade. */
  strength: number;
}

const ORIGIN = new Vector3();
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

/**
 * A holographic globe held in the hand, in front of the live camera picture.
 *
 * The behaviour (where the globe is, how big, how it turns) lives in `GlobeState` and works in
 * screen terms; this class draws it: the camera backdrop, the dotted Earth, its grid, a rim of
 * light and a halo. Hand positions arrive in camera-image space and are fitted to the screen
 * with the same fit the backdrop uses, so the globe lands on the hand.
 */
export class HoloGlobe extends BaseEnvironment {
  readonly id = 'globe' as const;

  private readonly state = new GlobeState();
  private backdrop!: CameraBackdrop;
  private starfield: Starfield | null = null;
  private readonly globe = new Group();
  /** The parts that turn with the globe; the halo stays facing the screen. */
  private readonly turning = new Group();
  /** Effect parts that move with the globe but do not turn with it. */
  private readonly fixed = new Group();
  private readonly effects = new Map<GlobeEffectName, LiveEffect>();
  private effect: EffectChoice = DEFAULTS.effect;
  /** Fingertips in device coordinates as last reported, and from there in scene units. */
  private readonly tipPoints = Array.from({ length: TIP_COUNT }, () => new Vector2());
  private readonly tips = Array.from({ length: TIP_COUNT }, () => new Vector3());
  private readonly tipsPresent = new Array<boolean>(TIP_COUNT).fill(false);
  /** Where each palm was last reported on screen, for the tracked-points display. */
  private readonly palmPoints = [new Vector2(), new Vector2()];
  private readonly palmsPresent = [false, false];
  private markers!: Points<BufferGeometry, PointsMaterial>;
  private showTracked = false;
  private readonly spin = new Quaternion();
  private readonly turn = new Quaternion();
  private dots!: Points<BufferGeometry, ShaderMaterial>;
  private lines!: LineSegments<BufferGeometry, ShaderMaterial>;
  private shell!: Mesh<SphereGeometry, ShaderMaterial>;
  private halo!: Mesh<PlaneGeometry, ShaderMaterial>;

  private look: LookName = DEFAULTS.look;
  private colour: ColourName = DEFAULTS.colour;
  private glow: number = DEFAULTS.glow;
  private dimming: number = DEFAULTS.dimming;
  private land = 1;
  private gridOpacity: number = GLOBE_LOOKS.earth.grid;
  private time = 0;
  private drawn = 0;
  private readonly place = new Vector3();
  private readonly point = new Vector2();
  private readonly bufferSize = new Vector2();
  private disposed = false;

  protected build(): void {
    this.camera.position.set(0, 0, CAMERA_DISTANCE);
    this.camera.lookAt(ORIGIN);
    this.state.setAspect(this.ctx.aspect);

    this.backdrop = new CameraBackdrop();
    this.backdrop.setDimming(this.dimming);
    this.scene.add(this.backdrop.mesh);
    // Without a camera the globe floats in the same night sky as the other worlds.
    this.starfield = new Starfield(QUALITY_PROFILES.high.backdropStars, 90, 53);
    this.starfield.setDrawCount(QUALITY_PROFILES[this.ctx.quality].backdropStars);
    this.scene.add(this.starfield.points);

    timed('globe:build', () => this.buildGlobe());
    this.resetOrientation();
    this.setEffect(this.effect);
    this.applyColour();
    this.applyDrawCount(this.ctx.quality);
    this.setVideo(this.ctx.video);
  }

  private buildGlobe(): void {
    // The dots are placed in the background; the rest of the globe is on screen meanwhile.
    const dotGeometry = this.resources.track(new BufferGeometry());
    dotGeometry.boundingSphere = new Sphere(new Vector3(), 1);
    void generate({ kind: 'globeDots', count: DOTS_MAX }).then((result) => {
      if (this.disposed || result.kind !== 'globeDots') return;
      dotGeometry.setAttribute('position', new BufferAttribute(result.positions, 3));
      dotGeometry.setAttribute('aSeed', new BufferAttribute(result.seeds, 4));
      this.dots.visible = true;
    });
    this.dots = new Points(
      dotGeometry,
      this.resources.track(createGlobeDotsMaterial(this.ctx.maxPointSize)),
    );
    this.dots.visible = false;
    // Point size depends on the drawing buffer height, which only the renderer knows.
    this.dots.onBeforeRender = (renderer: WebGLRenderer) => {
      this.dots.material.uniforms.uViewportHeight.value = renderer.getDrawingBufferSize(
        this.bufferSize,
      ).y;
    };

    const lineGeometry = this.resources.track(new BufferGeometry());
    lineGeometry.setAttribute('position', new BufferAttribute(generateGraticule(15, 5), 3));
    lineGeometry.boundingSphere = new Sphere(new Vector3(), 1);
    this.lines = new LineSegments(lineGeometry, this.resources.track(createGlobeLinesMaterial()));

    this.shell = new Mesh(
      this.resources.track(new SphereGeometry(1, 48, 32)),
      this.resources.track(createGlobeShellMaterial()),
    );
    this.halo = new Mesh(
      this.resources.track(new PlaneGeometry(HALO_SPAN, HALO_SPAN)),
      this.resources.track(createGlobeHaloMaterial()),
    );
    this.halo.material.uniforms.uEdge.value = 2 / HALO_SPAN;

    this.turning.add(this.shell, this.lines, this.dots);
    this.globe.add(this.halo, this.turning, this.fixed);
    for (const part of [this.dots, this.lines, this.shell, this.halo]) part.frustumCulled = false;
    this.halo.renderOrder = 1;
    this.shell.renderOrder = 2;
    this.lines.renderOrder = 3;
    this.dots.renderOrder = 4;
    this.scene.add(this.globe);

    // The points hand tracking reports, drawn where the globe believes they are: one per palm
    // and one per fingertip. If they do not sit on the hand in the picture, tracking and
    // picture disagree, and that is the thing to fix rather than the globe's placement.
    const markerGeometry = this.resources.track(new BufferGeometry());
    markerGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array((2 + TIP_COUNT) * 3), 3),
    );
    this.markers = new Points(
      markerGeometry,
      this.resources.track(
        new PointsMaterial({
          color: '#ffb454',
          size: 10,
          sizeAttenuation: false,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    this.markers.frustumCulled = false;
    this.markers.renderOrder = 20;
    this.markers.visible = false;
    this.scene.add(this.markers);
  }

  /** Lays the tracked points out for drawing: palms first, then fingertips, live ones only. */
  private updateMarkers(): void {
    const live = this.showTracked && (this.palmsPresent[0] || this.palmsPresent[1]);
    this.markers.visible = live;
    if (!live) return;
    const attribute = this.markers.geometry.getAttribute('position') as BufferAttribute;
    let count = 0;
    const put = (point: Vector2): void => {
      ndcToPlane(this.camera, point.x, point.y, ORIGIN, this.place);
      attribute.setXYZ(count++, this.place.x, this.place.y, this.place.z);
    };
    for (let hand = 0; hand < 2; hand++) if (this.palmsPresent[hand]) put(this.palmPoints[hand]);
    for (let i = 0; i < TIP_COUNT; i++) if (this.tipsPresent[i]) put(this.tipPoints[i]);
    attribute.needsUpdate = true;
    this.markers.geometry.setDrawRange(0, count);
  }

  // --- the camera picture ------------------------------------------------------------------

  setVideo(video: HTMLVideoElement | null): void {
    this.backdrop.setVideo(video);
  }

  // --- configuration -----------------------------------------------------------------------

  getControls(): ControlSpec[] {
    return [
      {
        kind: 'select',
        id: 'look',
        label: 'Look',
        value: this.look,
        options: LOOK_NAMES.map((value) => ({ value, label: GLOBE_LOOKS[value].label })),
      },
      {
        kind: 'select',
        id: 'effect',
        label: 'Effect',
        value: this.effect,
        options: GLOBE_EFFECT_CHOICES.map((value) => ({
          value,
          label: value === 'none' ? 'None' : GLOBE_EFFECTS[value].label,
        })),
      },
      {
        kind: 'select',
        id: 'colour',
        label: 'Colour',
        value: this.colour,
        options: Object.entries(GLOBE_COLOURS).map(([value, c]) => ({ value, label: c.label })),
      },
      {
        kind: 'range',
        id: 'size',
        label: 'Size',
        min: GLOBE_RADIUS_MIN,
        max: GLOBE_RADIUS_MAX,
        step: 0.01,
        value: this.state.baseRadius,
      },
      {
        kind: 'range',
        id: 'spin',
        label: 'Spin speed',
        min: 0,
        max: 2,
        step: 0.05,
        value: this.state.spinSpeed,
      },
      { kind: 'range', id: 'glow', label: 'Glow', min: 0, max: 2, step: 0.05, value: this.glow },
      {
        kind: 'range',
        id: 'dimming',
        label: 'Camera dimming',
        min: 0,
        max: 0.9,
        step: 0.05,
        value: this.dimming,
      },
      {
        kind: 'range',
        id: 'hover',
        label: 'Height above palm',
        min: 0,
        max: 2.5,
        step: 0.05,
        value: this.state.hover,
      },
      {
        kind: 'range',
        id: 'follow',
        label: 'Follow speed',
        min: 4,
        max: 40,
        step: 1,
        value: this.state.follow,
      },
      { kind: 'toggle', id: 'tracked', label: 'Show tracked points', value: this.showTracked },
      { kind: 'button', id: 'next', label: 'Next effect' },
    ];
  }

  setControl(id: string, value: ControlValue): void {
    if (id === 'next') {
      this.cycleEffect(1);
      return; // cycleEffect notifies
    }
    if (id === 'tracked') {
      this.showTracked = value === true;
      this.notifyControlsChanged();
      return;
    }
    if (id === 'effect') {
      if (!GLOBE_EFFECT_CHOICES.includes(value as EffectChoice)) return;
      this.setEffect(value as EffectChoice);
    } else if (id === 'look') {
      if (typeof value !== 'string' || !(value in GLOBE_LOOKS)) return;
      this.look = value as LookName;
    } else if (id === 'colour') {
      if (typeof value !== 'string' || !(value in GLOBE_COLOURS)) return;
      this.colour = value as ColourName;
      this.applyColour();
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    } else if (id === 'size') {
      this.state.setBaseRadius(value);
    } else if (id === 'spin') {
      this.state.setSpinSpeed(clamp(value, 0, 2));
    } else if (id === 'glow') {
      this.glow = clamp(value, 0, 2);
    } else if (id === 'dimming') {
      this.dimming = clamp(value, 0, 0.9);
      this.backdrop.setDimming(this.dimming);
    } else if (id === 'follow') {
      this.state.setFollow(value);
    } else if (id === 'hover') {
      this.state.setHover(value);
    } else {
      return;
    }
    this.notifyControlsChanged();
  }

  setQuality(quality: QualityLevel, pixelRatio: number): void {
    super.setQuality(quality, pixelRatio);
    this.starfield?.setDrawCount(QUALITY_PROFILES[quality].backdropStars);
    this.applyDrawCount(quality);
    for (const live of this.effects.values()) live.effect.setQuality?.(quality);
  }

  resize(aspect: number): void {
    super.resize(aspect);
    this.state.setAspect(aspect);
  }

  reset(): void {
    this.state.reset();
    this.state.setSpinSpeed(DEFAULT_GLOBE_OPTIONS.spinSpeed);
    this.state.setFollow(DEFAULT_GLOBE_OPTIONS.follow);
    this.state.setHover(DEFAULT_GLOBE_OPTIONS.hover);
    this.showTracked = false;
    this.look = DEFAULTS.look;
    this.colour = DEFAULTS.colour;
    this.setEffect(DEFAULTS.effect);
    this.glow = DEFAULTS.glow;
    this.dimming = DEFAULTS.dimming;
    this.backdrop.setDimming(this.dimming);
    this.applyColour();
    this.resetOrientation();
    this.notifyControlsChanged();
  }

  /** Facts about the globe for diagnostics and automated tests. */
  inspect(): Record<string, number | string | boolean> {
    return {
      x: this.state.x,
      y: this.state.y,
      radius: this.state.radius,
      mode: this.state.mode,
      collapse: this.state.collapse,
      pulse: this.state.pulse,
      dots: this.drawn,
      look: this.look,
      effect: this.effect,
      video: this.backdrop.live,
      tracked: this.markers.visible ? this.markers.geometry.drawRange.count : 0,
      ...(this.effect === 'none' ? null : this.effects.get(this.effect)?.effect.inspect?.()),
    };
  }

  private cycleEffect(direction: 1 | -1): void {
    const choices = GLOBE_EFFECT_CHOICES;
    const i = choices.indexOf(this.effect);
    this.setEffect(choices[(i + direction + choices.length) % choices.length]);
    this.notifyControlsChanged();
  }

  /** Effects are built the first time they are chosen and cross-fade from then on. */
  private setEffect(choice: EffectChoice): void {
    this.effect = choice;
    if (choice === 'none' || this.effects.has(choice)) return;
    const parts: GlobeParts = {
      turning: this.turning,
      fixed: this.fixed,
      dots: this.dots.material,
      lines: this.lines.material,
      shell: this.shell.material,
      halo: this.halo.material,
      resources: this.resources,
      quality: this.ctx.quality,
    };
    const effect = timed(`globe:effect:${choice}`, () => GLOBE_EFFECTS[choice].create(parts));
    const { main, accent } = GLOBE_COLOURS[this.colour];
    effect.setColour?.(main, accent);
    this.effects.set(choice, { effect, strength: 0 });
  }

  private applyColour(): void {
    const { main, accent } = GLOBE_COLOURS[this.colour];
    (this.dots.material.uniforms.uColor.value as Color).set(main);
    (this.dots.material.uniforms.uAccent.value as Color).set(accent);
    (this.lines.material.uniforms.uColor.value as Color).set(main);
    (this.shell.material.uniforms.uColor.value as Color).set(main);
    (this.halo.material.uniforms.uColor.value as Color).set(main);
    for (const live of this.effects.values()) live.effect.setColour?.(main, accent);
  }

  private applyDrawCount(quality: QualityLevel): void {
    this.drawn = DOTS[quality];
    this.dots.geometry.setDrawRange(0, this.drawn);
    // Mean distance between neighbouring dots on a unit sphere holding this many.
    this.dots.material.uniforms.uSpacing.value = Math.sqrt((4 * Math.PI) / this.drawn);
  }

  private resetOrientation(): void {
    // Tipped toward the viewer a little, as a globe on a desk is.
    this.spin.setFromAxisAngle(AXIS_X, 0.3);
    this.turning.quaternion.copy(this.spin);
  }

  // --- actions -----------------------------------------------------------------------------

  handleAction(action: EnvironmentAction): void {
    switch (action.type) {
      case 'anchor': {
        // With the camera picture up the globe belongs to the hands in it; a mouse passing over
        // on its way to a button must not carry it off. The mouse can still spin and resize it.
        const stray = action.space === 'screen' && this.backdrop.live;
        const gone = action.phase === 'end' || stray;
        this.palmsPresent[action.hand] = !gone;
        this.readTips(action.hand, gone ? undefined : action.tips, action.space);
        if (gone) {
          this.state.setHand(action.hand, false);
          break;
        }
        const at = this.toScreen(action.space, action.u, action.v);
        this.state.setHand(
          action.hand,
          true,
          at.x,
          at.y,
          this.toScreenHeights(action.space, action.size),
        );
        this.palmPoints[action.hand].copy(at);
        break;
      }
      case 'span': {
        if (action.phase === 'end') {
          this.state.setSpan(false);
          this.notifyControlsChanged(); // the hands left the globe a new size
          break;
        }
        const at = this.toScreen(action.space, action.u, action.v);
        this.state.setSpan(
          true,
          at.x,
          at.y,
          this.toScreenHeights(action.space, action.gap),
          action.factor,
        );
        break;
      }
      case 'grab':
        if (action.phase === 'end') this.state.grab(action.hand, false);
        else this.state.grab(action.hand, true, action.dx, action.dy, action.dRoll);
        break;
      case 'attract':
        this.state.setCollapsing(action.hand, action.phase !== 'end');
        break;
      case 'expand':
        if (action.phase === 'start') this.state.firePulse();
        break;
      case 'next':
        if (action.phase === 'start') this.cycleEffect(action.direction);
        break;
      default:
        break;
    }
  }

  /** Remembers where a hand's fingertips are on screen, or that the hand has none to offer. */
  private readTips(
    hand: 0 | 1,
    tips: ReadonlyArray<{ x: number; y: number }> | undefined,
    space: 'image' | 'screen',
  ): void {
    for (let i = 0; i < 5; i++) {
      const slot = hand * 5 + i;
      const tip = tips?.[i];
      this.tipsPresent[slot] = tip !== undefined;
      if (tip) this.tipPoints[slot].copy(this.toScreen(space, tip.x, tip.y));
    }
  }

  /** A position from an action to device coordinates on this screen. */
  private toScreen(space: 'image' | 'screen', u: number, v: number): Vector2 {
    if (space === 'screen') return this.point.set(u * 2 - 1, 1 - v * 2);
    return imageToNdc(u, v, this.backdrop.fit, this.point);
  }

  /** A length in camera-image heights to screen heights. A mouse has no such lengths. */
  private toScreenHeights(space: 'image' | 'screen', length: number): number {
    return space === 'image' ? length / this.backdrop.fit.visibleY : 0;
  }

  // --- simulation --------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.backdrop.update(this.ctx.aspect);
    if (this.starfield) {
      this.starfield.points.visible = !this.backdrop.live;
      this.starfield.update(dt);
    }

    const state = this.state;
    state.update(dt);
    this.updateMarkers();

    // Screen terms to scene terms: the globe lives on the plane through the origin.
    ndcToPlane(this.camera, state.x, state.y, ORIGIN, this.place);
    this.globe.position.copy(this.place);
    const screenHeight = 2 * CAMERA_DISTANCE * Math.tan((this.camera.fov * Math.PI) / 360);
    const radius = state.radius * screenHeight * lerp(1, COLLAPSED_SCALE, state.collapse);
    this.globe.scale.setScalar(radius);

    // Turns are about the screen's axes, so a drag always moves the surface under the hand.
    this.spin
      .premultiply(this.turn.setFromAxisAngle(AXIS_Y, state.dYaw))
      .premultiply(this.turn.setFromAxisAngle(AXIS_X, state.dPitch))
      .premultiply(this.turn.setFromAxisAngle(AXIS_Z, state.dRoll))
      .normalize();
    this.turning.quaternion.copy(this.spin);

    const look = GLOBE_LOOKS[this.look];
    this.land = damp(this.land, look.land, 5, dt);
    this.gridOpacity = damp(this.gridOpacity, look.grid, 5, dt);

    // Brighter in the hand than adrift, brighter still folded up or pulsing.
    const boost =
      this.glow * (0.7 + 0.3 * state.held + state.collapse * 1.3 + state.pulse * 0.5) + 0.15;
    const dots = this.dots.material.uniforms;
    dots.uTime.value = this.time;
    dots.uLand.value = this.land;
    dots.uBoost.value = boost;
    const lines = this.lines.material.uniforms;
    lines.uOpacity.value = this.gridOpacity;
    lines.uBoost.value = boost;
    this.shell.material.uniforms.uBoost.value = boost;
    const halo = this.halo.material.uniforms;
    halo.uGlow.value = this.glow * (0.8 + 0.4 * state.held + state.collapse * 1.6);
    halo.uPulse.value = state.pulse;

    this.updateEffects(dt, radius);
  }

  private updateEffects(dt: number, radius: number): void {
    if (this.effects.size === 0) return;
    for (let i = 0; i < TIP_COUNT; i++) {
      if (!this.tipsPresent[i]) continue;
      const point = this.tipPoints[i];
      ndcToPlane(this.camera, point.x, point.y, ORIGIN, this.tips[i]).sub(this.globe.position);
    }
    for (const [name, live] of this.effects) {
      const goal = name === this.effect ? 1 : 0;
      if (goal === 0 && live.strength === 0) continue; // faded out and already told so
      live.strength = damp(live.strength, goal, 5, dt);
      if (goal === 0 && live.strength < 0.004) live.strength = 0;
      if (goal === 1 && live.strength > 0.996) live.strength = 1;
      live.effect.update({
        dt,
        time: this.time,
        strength: live.strength,
        state: this.state,
        radius,
        orientation: this.spin,
        tips: this.tips,
        tipsPresent: this.tipsPresent,
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.backdrop.dispose();
    this.starfield?.dispose();
    this.starfield = null;
    super.dispose();
  }
}
