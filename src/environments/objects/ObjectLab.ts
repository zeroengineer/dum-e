import {
  AdditiveBlending,
  BoxGeometry,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  GridHelper,
  HemisphereLight,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Raycaster,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import { OrbitRig } from '../../core/camera/OrbitRig';
import { ndcToPlane, worldToNdc } from '../../core/camera/projection';
import { QUALITY_PROFILES } from '../../core/engine/quality';
import { BaseEnvironment } from '../../core/scene/BaseEnvironment';
import type { ControlSpec, ControlValue } from '../../core/scene/Environment';
import type { EnvironmentAction } from '../../interaction/actions';
import { Starfield } from '../../rendering/effects/Starfield';
import { clamp, damp } from '../../utils/math';
import { createRng } from '../../utils/rng';
import { createCrystalGeometry, createTwistedRingGeometry } from './geometries';
import {
  KIND_LABELS,
  OBJECT_COLORS,
  OBJECT_COUNT_MAX,
  OBJECT_COUNT_MIN,
  clampToBounds,
  layoutObjects,
} from './layout';
import type { ObjectKind } from './layout';

type HandSlot = 0 | 1;

interface LabObject {
  kind: ObjectKind;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  outline: LineSegments<BufferGeometry, LineBasicMaterial>;
  /** Where the object settles when nothing holds it. */
  rest: Vector3;
  velocity: Vector3;
  /** Angular velocity in radians per second around the local axes. */
  spin: Vector3;
  scale: number;
  scaleGoal: number;
  glow: number;
  phase: number;
  direction: number;
}

interface Grab {
  object: LabObject;
  /** Object position minus the hand position at the moment of the grab. */
  offset: Vector3;
  /** Fixes the depth of the plane the hand drags the object across. */
  depthPoint: Vector3;
  goal: Vector3;
}

interface Shockwave {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  age: number;
}

const DEFAULT_COUNT = 10;
const SCALE_MIN = 0.4;
const SCALE_MAX = 2.6;
const SHOCKWAVE_SECONDS = 0.9;
/** How far (in screen-height units) a pointer may miss an object and still pick it. */
const PICK_SLOP = 0.17;
const ROLL_DEADZONE = 0.004;

const COLOR_HOVER = 0x9fdcff;
const COLOR_SELECTED = 0x3df5ff;
const COLOR_GRABBED = 0xffb454;

/**
 * A bench of geometric objects that can be selected, grabbed, moved, rotated, scaled and thrown
 * about. All input arrives as EnvironmentActions, one stream per hand slot.
 */
export class ObjectLab extends BaseEnvironment {
  readonly id = 'objects' as const;

  private rig!: OrbitRig;
  private starfield: Starfield | null = null;
  private readonly geometries = new Map<
    ObjectKind,
    { body: BufferGeometry; edges: BufferGeometry }
  >();
  private outlineMaterials!: Record<'hover' | 'selected' | 'grabbed', LineBasicMaterial>;
  private objects: LabObject[] = [];
  private meshes: Mesh[] = [];

  private readonly hovered: [LabObject | null, LabObject | null] = [null, null];
  private readonly grabs: [Grab | null, Grab | null] = [null, null];
  private selected: LabObject | null = null;
  private readonly reticles: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  private readonly reticleSeen: [boolean, boolean] = [false, false];
  private readonly shockwaves: Shockwave[] = [];

  private count = DEFAULT_COUNT;
  private idleSpin = 1;
  private autoOrbit = false;
  private wireframe = false;
  private colorShift = 0;
  private rng = createRng(99);

  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly origin = new Vector3();
  private readonly scratch = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();

  protected build(): void {
    this.rig = new OrbitRig(this.camera, {
      radius: 9.5,
      minRadius: 5,
      maxRadius: 16,
      phi: 1.32,
      minPhi: 0.5,
      maxPhi: 1.75,
    });

    this.scene.add(new HemisphereLight(0x9fc4ff, 0x0a0d18, 1.1));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 6);
    this.scene.add(key);
    const cyan = new PointLight(0x3df5ff, 40, 30);
    cyan.position.set(-6, 2, 4);
    const amber = new PointLight(0xffb454, 30, 30);
    amber.position.set(6, -1, 3);
    this.scene.add(cyan, amber);

    const grid = new GridHelper(40, 40, 0x2b6f8f, 0x16263c);
    grid.position.y = -3.1;
    const gridMaterial = grid.material as Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.55;
    this.resources.track(grid.geometry);
    this.resources.track(gridMaterial);
    this.scene.add(grid);

    this.starfield = new Starfield(QUALITY_PROFILES[this.ctx.quality].backdropStars, 80, 23);
    this.scene.add(this.starfield.points);

    this.buildGeometries();
    this.outlineMaterials = {
      hover: this.outlineMaterial(COLOR_HOVER, 0.45),
      selected: this.outlineMaterial(COLOR_SELECTED, 0.95),
      grabbed: this.outlineMaterial(COLOR_GRABBED, 1),
    };
    this.buildReticles();
    this.buildShockwaves();
    this.spawn(this.count);
  }

  private buildGeometries(): void {
    const add = (kind: ObjectKind, body: BufferGeometry, cage?: BufferGeometry): void => {
      this.resources.track(body);
      // Smooth shapes have no hard edges to outline, so they get a geodesic cage instead.
      const edges = this.resources.track(new EdgesGeometry(cage ?? body, cage ? 1 : 24));
      cage?.dispose();
      this.geometries.set(kind, { body, edges });
    };
    add('cube', new BoxGeometry(1, 1, 1));
    add('sphere', new SphereGeometry(0.62, 40, 24), new IcosahedronGeometry(0.66, 2));
    add('torus', new TorusGeometry(0.5, 0.2, 20, 56), new TorusGeometry(0.5, 0.23, 6, 14));
    add('pyramid', new ConeGeometry(0.72, 1.1, 4, 1));
    add('crystal', createCrystalGeometry());
    add('ring', createTwistedRingGeometry());
  }

  private outlineMaterial(color: number, opacity: number): LineBasicMaterial {
    return this.resources.track(
      new LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
    );
  }

  private buildReticles(): void {
    const geometry = this.resources.track(new RingGeometry(0.13, 0.16, 40));
    for (let i = 0; i < 2; i++) {
      const material = this.resources.track(
        new MeshBasicMaterial({
          color: COLOR_SELECTED,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
          side: DoubleSide,
          blending: AdditiveBlending,
        }),
      );
      const reticle = new Mesh(geometry, material);
      reticle.visible = false;
      reticle.renderOrder = 10;
      this.reticles.push(reticle);
      this.scene.add(reticle);
    }
  }

  private buildShockwaves(): void {
    const geometry = this.resources.track(new RingGeometry(0.86, 1, 64));
    for (let i = 0; i < 3; i++) {
      const material = this.resources.track(
        new MeshBasicMaterial({
          color: COLOR_GRABBED,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: DoubleSide,
          blending: AdditiveBlending,
        }),
      );
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({ mesh, age: SHOCKWAVE_SECONDS });
    }
  }

  /** Replaces the bench contents with `count` objects in the starting layout. */
  private spawn(count: number): void {
    for (const object of this.objects) {
      object.mesh.removeFromParent();
      this.resources.release(object.mesh.material);
    }
    this.hovered[0] = this.hovered[1] = null;
    this.grabs[0] = this.grabs[1] = null;
    this.selected = null;

    this.count = Math.round(clamp(count, OBJECT_COUNT_MIN, OBJECT_COUNT_MAX));
    this.rng = createRng(99);
    this.objects = layoutObjects(this.count).map((placement, index) => {
      const shapes = this.geometries.get(placement.kind);
      if (!shapes) throw new Error(`No geometry for "${placement.kind}"`);
      const material = this.resources.track(
        new MeshStandardMaterial({
          color: placement.color,
          emissive: placement.color,
          emissiveIntensity: 0.1,
          metalness: 0.35,
          roughness: 0.3,
          flatShading: placement.kind === 'pyramid',
          wireframe: this.wireframe,
        }),
      );
      const mesh = new Mesh(shapes.body, material);
      mesh.position.set(placement.position.x, placement.position.y, placement.position.z);
      mesh.rotation.set(this.rng() * 3, this.rng() * 3, 0);
      mesh.name = `${KIND_LABELS[placement.kind]} ${index + 1}`;
      const outline = new LineSegments(shapes.edges, this.outlineMaterials.hover);
      outline.visible = false;
      outline.renderOrder = 5;
      mesh.add(outline);
      this.scene.add(mesh);
      return {
        kind: placement.kind,
        mesh,
        outline,
        rest: mesh.position.clone(),
        velocity: new Vector3(),
        spin: new Vector3(),
        scale: 0.01, // grows in
        scaleGoal: 1,
        glow: 0.1,
        phase: this.rng() * Math.PI * 2,
        direction: index % 2 === 0 ? 1 : -1,
      };
    });
    this.meshes = this.objects.map((o) => o.mesh);
  }

  // --- configuration -------------------------------------------------------------------------

  getControls(): ControlSpec[] {
    return [
      {
        kind: 'range',
        id: 'count',
        label: 'Objects',
        min: OBJECT_COUNT_MIN,
        max: OBJECT_COUNT_MAX,
        step: 1,
        value: this.count,
      },
      {
        kind: 'range',
        id: 'spin',
        label: 'Idle spin',
        min: 0,
        max: 2.5,
        step: 0.05,
        value: this.idleSpin,
      },
      { kind: 'toggle', id: 'orbit', label: 'Auto orbit', value: this.autoOrbit },
      { kind: 'toggle', id: 'wireframe', label: 'Wireframe', value: this.wireframe },
      { kind: 'button', id: 'next', label: 'Select next' },
      { kind: 'button', id: 'scatter', label: 'Scatter' },
      { kind: 'button', id: 'regroup', label: 'Regroup' },
      { kind: 'button', id: 'recolour', label: 'Recolour' },
    ];
  }

  setControl(id: string, value: ControlValue): void {
    switch (id) {
      case 'count':
        if (typeof value === 'number') this.spawn(value);
        break;
      case 'spin':
        if (typeof value === 'number') this.idleSpin = clamp(value, 0, 2.5);
        break;
      case 'orbit':
        this.autoOrbit = value === true;
        break;
      case 'wireframe':
        this.wireframe = value === true;
        for (const object of this.objects) object.mesh.material.wireframe = this.wireframe;
        break;
      case 'next':
        this.cycleSelection(1);
        break;
      case 'scatter':
        this.scatter();
        break;
      case 'regroup':
        this.regroup();
        break;
      case 'recolour':
        this.recolour();
        break;
      default:
        return;
    }
    this.notifyControlsChanged();
  }

  reset(): void {
    this.idleSpin = 1;
    this.autoOrbit = false;
    this.wireframe = false;
    this.colorShift = 0;
    this.rig.reset();
    this.spawn(DEFAULT_COUNT);
    for (const reticle of this.reticles) reticle.visible = false;
    this.notifyControlsChanged();
  }

  get objectCount(): number {
    return this.objects.length;
  }

  get selectedName(): string | null {
    return this.selected?.mesh.name ?? null;
  }

  get grabbedCount(): number {
    return (this.grabs[0] ? 1 : 0) + (this.grabs[1] ? 1 : 0);
  }

  // --- actions -------------------------------------------------------------------------------

  handleAction(action: EnvironmentAction): void {
    switch (action.type) {
      case 'hover':
        if (action.phase === 'end') {
          this.hovered[action.hand] = null;
          this.reticles[action.hand].visible = false;
          this.reticleSeen[action.hand] = false;
        } else {
          this.hovered[action.hand] = this.pick(action.x, action.y);
          this.placeReticle(action.hand, action.x, action.y);
        }
        break;
      case 'point':
        if (action.phase !== 'end') {
          const hit = this.pick(action.x, action.y);
          this.hovered[action.hand] = hit;
          if (hit) this.selected = hit;
          this.placeReticle(action.hand, action.x, action.y);
        }
        break;
      case 'grab':
        this.handleGrab(action);
        break;
      case 'release':
        if (action.phase !== 'end') {
          // Dropping what the hand holds comes first; an empty open hand clears the selection.
          if (this.grabs[action.hand]) this.drop(action.hand);
          else if (action.phase === 'start') this.selected = null;
        }
        break;
      case 'special':
        if (action.phase === 'start') this.shockwave(action.x, action.y);
        break;
      case 'scale': {
        const target = this.focus();
        if (target) {
          target.scaleGoal = clamp(target.scaleGoal * action.factor, SCALE_MIN, SCALE_MAX);
        }
        break;
      }
      case 'rotate': {
        const target = this.focus();
        if (target) {
          this.cameraAxes();
          target.mesh.rotateOnWorldAxis(this.up, action.dx * 3);
          target.mesh.rotateOnWorldAxis(this.right, -action.dy * 3);
        } else {
          this.rig.rotate(-action.dx * 2.4, action.dy * 1.6);
        }
        break;
      }
      case 'zoom':
        this.rig.zoom(action.factor);
        break;
      case 'next':
        if (action.phase === 'start') this.cycleSelection(action.direction);
        break;
      default:
        break;
    }
  }

  private handleGrab(action: Extract<EnvironmentAction, { type: 'grab' }>): void {
    const hand = action.hand;
    if (action.phase === 'end') {
      this.drop(hand);
      return;
    }
    this.placeReticle(hand, action.x, action.y);
    let grab = this.grabs[hand];
    if (!grab) {
      // Take what is under the pinch, or failing that the object selected by pointing.
      const object = this.pick(action.x, action.y) ?? this.hovered[hand] ?? this.selected;
      const other = this.grabs[hand === 0 ? 1 : 0];
      if (!object || other?.object === object) return;
      const depthPoint = object.mesh.position.clone();
      ndcToPlane(this.camera, action.x, action.y, depthPoint, this.scratch);
      grab = {
        object,
        depthPoint,
        offset: object.mesh.position.clone().sub(this.scratch),
        goal: object.mesh.position.clone(),
      };
      this.grabs[hand] = grab;
      this.selected = object;
      object.velocity.set(0, 0, 0);
      return;
    }
    ndcToPlane(this.camera, action.x, action.y, grab.depthPoint, this.scratch);
    clampToBounds(grab.goal.copy(this.scratch).add(grab.offset));
    if (Math.abs(action.dRoll) > ROLL_DEADZONE) {
      // Turning the wrist turns the object about the line of sight.
      this.camera.getWorldDirection(this.forward);
      grab.object.mesh.rotateOnWorldAxis(this.forward, action.dRoll);
    }
  }

  private drop(hand: HandSlot): void {
    const grab = this.grabs[hand];
    if (!grab) return;
    const object = grab.object;
    // Carry a little momentum so a release feels like letting go, then settle at the drop point.
    object.velocity.copy(grab.goal).sub(object.mesh.position).multiplyScalar(6);
    object.rest.copy(grab.goal);
    this.grabs[hand] = null;
  }

  /** The object that two-hand and rotate actions apply to. */
  private focus(): LabObject | null {
    return this.grabs[0]?.object ?? this.grabs[1]?.object ?? this.selected;
  }

  private cycleSelection(direction: 1 | -1): void {
    if (this.objects.length === 0) return;
    const current = this.selected ? this.objects.indexOf(this.selected) : -1;
    const next = (current + direction + this.objects.length) % this.objects.length;
    this.selected = this.objects[next];
  }

  private shockwave(x: number, y: number): void {
    ndcToPlane(this.camera, x, y, this.origin, this.scratch);
    const wave = this.shockwaves.reduce((oldest, w) => (w.age > oldest.age ? w : oldest));
    wave.age = 0;
    wave.mesh.position.copy(this.scratch);
    wave.mesh.visible = true;

    for (const object of this.objects) {
      if (this.isGrabbed(object)) continue;
      const away = object.mesh.position.clone().sub(this.scratch);
      const distance = away.length();
      if (distance < 1e-3) away.set(this.rng() - 0.5, this.rng() - 0.5, this.rng() - 0.5);
      const strength = 11 / (1 + distance * distance * 0.22);
      object.velocity.addScaledVector(away.normalize(), strength);
      object.spin.set(
        (this.rng() - 0.5) * strength * 1.6,
        (this.rng() - 0.5) * strength * 1.6,
        (this.rng() - 0.5) * strength * 1.6,
      );
      object.glow = 1.6;
    }
  }

  private scatter(): void {
    for (const object of this.objects) {
      if (this.isGrabbed(object)) continue;
      clampToBounds(
        object.rest.set(
          (this.rng() - 0.5) * 10,
          (this.rng() - 0.5) * 4.4 + 0.3,
          this.rng() * 5 - 3,
        ),
      );
      object.spin.set(this.rng() * 6 - 3, this.rng() * 6 - 3, this.rng() * 6 - 3);
    }
  }

  private regroup(): void {
    const placements = layoutObjects(this.objects.length);
    this.objects.forEach((object, i) => {
      if (this.isGrabbed(object)) return;
      const p = placements[i].position;
      object.rest.set(p.x, p.y, p.z);
      object.scaleGoal = 1;
    });
  }

  private recolour(): void {
    this.colorShift = (this.colorShift + 3) % OBJECT_COLORS.length;
    this.objects.forEach((object, i) => {
      const color = OBJECT_COLORS[(i + this.colorShift) % OBJECT_COLORS.length];
      object.mesh.material.color.set(color);
      object.mesh.material.emissive.set(color);
      object.glow = 1.2;
    });
  }

  private isGrabbed(object: LabObject): boolean {
    return this.grabs[0]?.object === object || this.grabs[1]?.object === object;
  }

  /** The object under a pointer: an exact ray hit, otherwise the nearest one within a small slop. */
  private pick(x: number, y: number): LabObject | null {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer.set(x, y), this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    if (hit) return this.objects[this.meshes.indexOf(hit.object as Mesh)] ?? null;

    let best: LabObject | null = null;
    let bestDistance = PICK_SLOP;
    for (const object of this.objects) {
      worldToNdc(this.camera, object.mesh.position, this.scratch);
      if (this.scratch.z > 1) continue;
      const d = Math.hypot((this.scratch.x - x) * this.ctx.aspect, this.scratch.y - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = object;
      }
    }
    return best;
  }

  private placeReticle(hand: HandSlot, x: number, y: number): void {
    const reticle = this.reticles[hand];
    const anchor = this.grabs[hand]?.object ?? this.hovered[hand];
    ndcToPlane(this.camera, x, y, anchor?.mesh.position ?? this.origin, this.scratch);
    if (this.reticleSeen[hand]) reticle.position.lerp(this.scratch, 0.6);
    else reticle.position.copy(this.scratch);
    this.reticleSeen[hand] = true;
    reticle.visible = true;
  }

  private cameraAxes(): void {
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
  }

  // --- simulation ----------------------------------------------------------------------------

  update(dt: number, elapsed: number): void {
    const holding = this.grabs[0] !== null || this.grabs[1] !== null;
    if (this.autoOrbit && !holding) this.rig.rotate(dt * 0.12, 0);
    this.rig.update(dt);

    for (const object of this.objects) {
      const grab =
        this.grabs[0]?.object === object
          ? this.grabs[0]
          : this.grabs[1]?.object === object
            ? this.grabs[1]
            : null;
      const { mesh } = object;
      const isSelected = this.selected === object;
      const isHovered = this.hovered[0] === object || this.hovered[1] === object;

      if (grab) {
        mesh.position.lerp(grab.goal, 1 - Math.exp(-16 * dt));
      } else {
        // Damped spring toward the rest point, with a slow bob so the bench never looks frozen.
        const bob = Math.sin(elapsed * 0.8 + object.phase) * 0.07;
        this.scratch.copy(object.rest);
        this.scratch.y += bob;
        object.velocity.addScaledVector(this.scratch.sub(mesh.position), 16 * dt);
        object.velocity.multiplyScalar(Math.exp(-4.4 * dt));
        mesh.position.addScaledVector(object.velocity, dt);
        mesh.rotation.y += dt * 0.32 * this.idleSpin * object.direction;
        mesh.rotation.x += dt * 0.11 * this.idleSpin;
      }
      mesh.rotation.x += object.spin.x * dt;
      mesh.rotation.y += object.spin.y * dt;
      mesh.rotation.z += object.spin.z * dt;
      object.spin.multiplyScalar(Math.exp(-1.9 * dt));

      const pop = grab ? 1.1 : isHovered ? 1.05 : 1;
      object.scale = damp(object.scale, object.scaleGoal * pop, 10, dt);
      mesh.scale.setScalar(object.scale);

      const glowGoal = grab
        ? 0.95
        : isSelected
          ? 0.5 + Math.sin(elapsed * 5) * 0.14
          : isHovered
            ? 0.32
            : 0.1;
      object.glow = damp(object.glow, glowGoal, 7, dt);
      mesh.material.emissiveIntensity = object.glow;

      object.outline.visible = Boolean(grab) || isSelected || isHovered;
      if (object.outline.visible) {
        object.outline.material = grab
          ? this.outlineMaterials.grabbed
          : isSelected
            ? this.outlineMaterials.selected
            : this.outlineMaterials.hover;
      }
    }

    for (let i = 0; i < 2; i++) {
      const reticle = this.reticles[i];
      if (!reticle.visible) continue;
      const grabbing = this.grabs[i] !== null;
      reticle.quaternion.copy(this.camera.quaternion);
      reticle.material.color.setHex(grabbing ? COLOR_GRABBED : COLOR_SELECTED);
      const targetScale = grabbing ? 0.7 : this.hovered[i] ? 1.25 : 1;
      reticle.scale.setScalar(damp(reticle.scale.x, targetScale, 14, dt));
    }

    for (const wave of this.shockwaves) {
      if (wave.age >= SHOCKWAVE_SECONDS) {
        wave.mesh.visible = false;
        continue;
      }
      wave.age += dt;
      const t = wave.age / SHOCKWAVE_SECONDS;
      wave.mesh.quaternion.copy(this.camera.quaternion);
      wave.mesh.scale.setScalar(0.3 + t * 9);
      wave.mesh.material.opacity = Math.max(0, 0.9 * (1 - t) * (1 - t));
    }

    this.starfield?.update(dt);
  }

  dispose(): void {
    this.starfield?.dispose();
    this.starfield = null;
    this.objects = [];
    this.meshes = [];
    this.reticles.length = 0;
    this.shockwaves.length = 0;
    this.geometries.clear();
    super.dispose();
  }
}
