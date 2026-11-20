import { BufferAttribute, BufferGeometry, Points, Sphere, Vector3 } from 'three';
import type { Color, ShaderMaterial } from 'three';
import { OrbitRig } from '../../core/camera/OrbitRig';
import { QUALITY_PROFILES } from '../../core/engine/quality';
import { BaseEnvironment } from '../../core/scene/BaseEnvironment';
import type { ControlSpec, ControlValue, QualityLevel } from '../../core/scene/Environment';
import type { EnvironmentAction } from '../../interaction/actions';
import { Starfield } from '../../rendering/effects/Starfield';
import { createGalaxyMaterial } from '../../rendering/materials/galaxyMaterial';
import { clamp, damp } from '../../utils/math';
import {
  GALAXY_LIMITS,
  GALAXY_PRESETS,
  GALAXY_PRESET_NAMES,
  GALAXY_RADIUS,
  generateGalaxy,
  sanitizeGalaxyConfig,
} from './generator';
import type { GalaxyConfig, GalaxyPresetName, GalaxyShape } from './generator';

export const GALAXY_PALETTES = {
  classic: { label: 'Classic', core: '#ffe2a8', arm: '#7fb4ff', accent: '#ff7bd5' },
  ember: { label: 'Ember', core: '#fff1c9', arm: '#ff7a3d', accent: '#ffd23d' },
  aurora: { label: 'Aurora', core: '#e9fff4', arm: '#3df5c8', accent: '#7a5cff' },
  amethyst: { label: 'Amethyst', core: '#ffd9f2', arm: '#9a6bff', accent: '#3df5ff' },
} as const;

type PaletteName = keyof typeof GALAXY_PALETTES;
type ShapeKey = keyof GalaxyShape;

const SHAPE_KEYS: readonly ShapeKey[] = ['arms', 'twist', 'coreSize', 'spread', 'thickness', 'bar'];
const EXPAND_OPEN = 1.5;
const EXPAND_CLOSED = 0.58;
/** Seconds to wait after the last configuration change before rebuilding (sliders fire rapidly). */
const REBUILD_SETTLE = 0.18;

/**
 * A procedural spiral galaxy in one draw call. Orbital motion runs in the vertex shader; this
 * class owns configuration, the camera rig and the collapse-and-rebirth transition between shapes.
 */
export class GalaxyExplorer extends BaseEnvironment {
  readonly id = 'galaxy' as const;

  private rig!: OrbitRig;
  private material!: ShaderMaterial;
  private points: Points<BufferGeometry, ShaderMaterial> | null = null;
  private starfield: Starfield | null = null;

  private config: GalaxyConfig = { stars: 45_000, ...GALAXY_PRESETS.grand.shape };
  private preset: GalaxyPresetName | 'custom' = 'grand';
  private palette: PaletteName = 'classic';
  private explicitStars = false;
  private speed = 1;
  private size = 2.2;

  private time = 0;
  private reveal = 0;
  private revealGoal = 1;
  private pendingRebuild = false;
  private pendingAge = 0;
  private expand = 1;
  private readonly handMode: ['none' | 'expand' | 'attract', 'none' | 'expand' | 'attract'] = [
    'none',
    'none',
  ];

  protected build(): void {
    this.rig = new OrbitRig(this.camera, {
      radius: 9.5,
      minRadius: 2.2,
      maxRadius: 26,
      phi: 1.02,
      minPhi: 0.12,
      maxPhi: Math.PI - 0.12,
      damping: 4.5,
    });
    this.material = this.resources.track(
      createGalaxyMaterial({
        pixelRatio: this.ctx.pixelRatio,
        maxPointSize: this.ctx.maxPointSize,
      }),
    );
    this.material.uniforms.uSize.value = this.size;
    this.applyPalette();

    this.explicitStars = false;
    this.config.stars = QUALITY_PROFILES[this.ctx.quality].stars;
    this.rebuild();

    this.starfield = new Starfield(QUALITY_PROFILES[this.ctx.quality].backdropStars, 110, 31);
    this.scene.add(this.starfield.points);
  }

  // --- configuration -------------------------------------------------------------------------

  getControls(): ControlSpec[] {
    const range = (
      id: ShapeKey | 'stars',
      label: string,
      step: number,
    ): Extract<ControlSpec, { kind: 'range' }> => ({
      kind: 'range',
      id,
      label,
      min: GALAXY_LIMITS[id].min,
      max: GALAXY_LIMITS[id].max,
      step,
      value: this.config[id],
    });
    return [
      {
        kind: 'select',
        id: 'preset',
        label: 'Configuration',
        value: this.preset,
        options: [
          ...GALAXY_PRESET_NAMES.map((value) => ({ value, label: GALAXY_PRESETS[value].label })),
          ...(this.preset === 'custom' ? [{ value: 'custom', label: 'Custom' }] : []),
        ],
      },
      range('stars', 'Stars', 1000),
      range('arms', 'Spiral arms', 1),
      range('twist', 'Twist', 0.05),
      range('coreSize', 'Core size', 0.01),
      range('spread', 'Arm spread', 0.01),
      range('thickness', 'Thickness', 0.01),
      range('bar', 'Central bar', 0.05),
      {
        kind: 'range',
        id: 'speed',
        label: 'Rotation speed',
        min: 0,
        max: 4,
        step: 0.05,
        value: this.speed,
      },
      {
        kind: 'range',
        id: 'size',
        label: 'Star size',
        min: 0.6,
        max: 6,
        step: 0.1,
        value: this.size,
      },
      {
        kind: 'select',
        id: 'palette',
        label: 'Star colours',
        value: this.palette,
        options: Object.entries(GALAXY_PALETTES).map(([value, p]) => ({ value, label: p.label })),
      },
      { kind: 'button', id: 'zoomIn', label: 'Zoom in' },
      { kind: 'button', id: 'zoomOut', label: 'Zoom out' },
      { kind: 'button', id: 'next', label: 'Next configuration' },
    ];
  }

  setControl(id: string, value: ControlValue): void {
    if (id === 'preset') {
      if (typeof value === 'string' && value in GALAXY_PRESETS) {
        this.applyPreset(value as GalaxyPresetName);
      }
      return; // applyPreset notifies
    }
    if (id === 'next') {
      this.cyclePreset(1);
      return;
    }
    if (id === 'stars' || (SHAPE_KEYS as readonly string[]).includes(id)) {
      if (typeof value !== 'number') return;
      const key = id as keyof GalaxyConfig;
      const next = sanitizeGalaxyConfig({ ...this.config, [key]: value });
      if (next[key] === this.config[key]) return;
      this.config = next;
      if (key === 'stars') this.explicitStars = true;
      else this.preset = 'custom';
      this.requestRebuild();
    } else if (id === 'speed') {
      if (typeof value === 'number') this.speed = clamp(value, 0, 4);
    } else if (id === 'size') {
      if (typeof value === 'number') {
        this.size = clamp(value, 0.6, 6);
        this.material.uniforms.uSize.value = this.size;
      }
    } else if (id === 'palette') {
      if (typeof value === 'string' && value in GALAXY_PALETTES) {
        this.palette = value as PaletteName;
        this.applyPalette();
      }
    } else if (id === 'zoomIn') {
      this.rig.zoom(1.35);
    } else if (id === 'zoomOut') {
      this.rig.zoom(1 / 1.35);
    } else {
      return;
    }
    this.notifyControlsChanged();
  }

  setQuality(quality: QualityLevel, pixelRatio: number): void {
    super.setQuality(quality, pixelRatio);
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    if (!this.explicitStars && this.config.stars !== QUALITY_PROFILES[quality].stars) {
      this.config.stars = QUALITY_PROFILES[quality].stars;
      this.requestRebuild();
      this.notifyControlsChanged();
    }
  }

  reset(): void {
    this.speed = 1;
    this.size = 2.2;
    this.palette = 'classic';
    this.explicitStars = false;
    this.config.stars = QUALITY_PROFILES[this.ctx.quality].stars;
    this.material.uniforms.uSize.value = this.size;
    this.applyPalette();
    this.handMode[0] = this.handMode[1] = 'none';
    this.rig.reset();
    this.applyPreset('grand');
  }

  get currentPreset(): GalaxyPresetName | 'custom' {
    return this.preset;
  }

  get starCount(): number {
    return this.points?.geometry.getAttribute('position').count ?? 0;
  }

  get cameraDistance(): number {
    return this.rig.currentRadius;
  }

  private applyPreset(name: GalaxyPresetName): void {
    this.preset = name;
    this.config = { stars: this.config.stars, ...GALAXY_PRESETS[name].shape };
    this.requestRebuild();
    this.notifyControlsChanged();
  }

  private cyclePreset(direction: 1 | -1): void {
    const names = GALAXY_PRESET_NAMES;
    const current = this.preset === 'custom' ? -1 : names.indexOf(this.preset);
    const next =
      current < 0
        ? direction > 0
          ? 0
          : names.length - 1
        : (current + direction + names.length) % names.length;
    this.applyPreset(names[next]);
  }

  private applyPalette(): void {
    const palette = GALAXY_PALETTES[this.palette];
    (this.material.uniforms.uCoreColor.value as Color).set(palette.core);
    (this.material.uniforms.uArmColor.value as Color).set(palette.arm);
    (this.material.uniforms.uAccentColor.value as Color).set(palette.accent);
  }

  // --- actions -------------------------------------------------------------------------------

  handleAction(action: EnvironmentAction): void {
    switch (action.type) {
      case 'expand':
      case 'attract':
        if (action.phase === 'end') {
          if (this.handMode[action.hand] === action.type) this.handMode[action.hand] = 'none';
        } else {
          this.handMode[action.hand] = action.type;
        }
        break;
      case 'hover':
        if (action.phase === 'end') this.handMode[action.hand] = 'none';
        break;
      case 'rotate':
        this.turn(action.dx, action.dy);
        break;
      case 'grab':
        if (action.phase === 'update') this.turn(action.dx, action.dy);
        break;
      case 'zoom':
      case 'scale':
        this.rig.zoom(action.factor);
        break;
      case 'next':
        if (action.phase === 'start') this.cyclePreset(action.direction);
        break;
      case 'release':
        this.handMode[action.hand] = 'none';
        break;
      default:
        break;
    }
  }

  /** Dragging right or up turns the galaxy the way the hand moves, as if holding it. */
  private turn(dx: number, dy: number): void {
    this.rig.rotate(-dx * 2.6, dy * 1.5);
  }

  // --- simulation ----------------------------------------------------------------------------

  update(dt: number): void {
    const u = this.material.uniforms;
    this.time += dt * this.speed;
    u.uTime.value = this.time;

    let expandGoal = 1;
    for (const mode of this.handMode) {
      if (mode === 'expand') expandGoal = Math.max(expandGoal, EXPAND_OPEN);
      if (mode === 'attract') expandGoal = Math.min(expandGoal, EXPAND_CLOSED);
    }
    this.expand = damp(this.expand, expandGoal, 3, dt);
    u.uExpand.value = this.expand;

    if (this.pendingRebuild) {
      this.pendingAge += dt;
      if (this.reveal < 0.03 && this.pendingAge >= REBUILD_SETTLE) this.rebuild();
    }
    // Collapse quickly, unfold slowly.
    this.reveal = damp(this.reveal, this.revealGoal, this.revealGoal === 0 ? 9 : 2.6, dt);
    if (this.revealGoal === 1 && this.reveal > 0.999) this.reveal = 1;
    u.uReveal.value = this.reveal;

    this.rig.update(dt);
    this.starfield?.update(dt);
  }

  /** Collapse the current galaxy; the new one is generated once it has folded into the core. */
  private requestRebuild(): void {
    this.pendingRebuild = true;
    this.pendingAge = 0;
    this.revealGoal = 0;
  }

  private rebuild(): void {
    this.config = sanitizeGalaxyConfig(this.config);
    const buffers = generateGalaxy(this.config);
    if (this.points) {
      this.resources.release(this.points.geometry);
      this.points.removeFromParent();
    }
    const geometry = this.resources.track(new BufferGeometry());
    // "position" carries polar coordinates; the shader converts them.
    geometry.setAttribute('position', new BufferAttribute(buffers.polar, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(buffers.seed, 4));
    geometry.boundingSphere = new Sphere(new Vector3(), GALAXY_RADIUS * 2.5);

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Keep overall brightness roughly constant as the star count changes.
    this.material.uniforms.uOpacity.value = clamp(
      0.95 - Math.log10(this.config.stars / 5000) * 0.38,
      0.28,
      0.95,
    );
    this.pendingRebuild = false;
    this.reveal = 0;
    this.revealGoal = 1;
  }

  dispose(): void {
    this.starfield?.dispose();
    this.starfield = null;
    this.points?.removeFromParent();
    this.points = null;
    super.dispose();
  }
}
