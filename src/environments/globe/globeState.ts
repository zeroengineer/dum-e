import { clamp, damp } from '../../utils/math';

/** Smallest and largest the globe may be, as a fraction of screen height (radius). */
export const GLOBE_RADIUS_MIN = 0.04;
export const GLOBE_RADIUS_MAX = 0.48;
export const GLOBE_RADIUS_DEFAULT = 0.14;

/** Held between two palms, the globe fills this much of the gap, leaving room for the hands. */
const SPAN_FILL = 0.72;
/** How far past the last known hand position the globe may run ahead, in seconds. */
const PREDICT_SECONDS = 0.08;
/** Fully folded up in a fist, the globe is this fraction of its size. */
export const COLLAPSED_SCALE = 0.25;
const PULSE_SECONDS = 0.9;

export type GlobeMode = 'free' | 'held' | 'stretched';

interface Hand {
  present: boolean;
  x: number;
  y: number;
  /** Palm size in screen heights; 0 for a mouse, which has no size. */
  size: number;
  /** The same, eased: the reading is noisy and the globe's size hangs on it. */
  steadySize: number;
  vx: number;
  vy: number;
  /** Seconds since this hand was last reported. */
  age: number;
  grabbing: boolean;
  collapsing: boolean;
}

const createHand = (): Hand => ({
  present: false,
  x: 0,
  y: 0,
  size: 0,
  steadySize: 0,
  vx: 0,
  vy: 0,
  age: 0,
  grabbing: false,
  collapsing: false,
});

export interface GlobeOptions {
  /** Resting radius as a fraction of screen height. */
  baseRadius: number;
  /** Idle turn rate in radians per second. */
  spinSpeed: number;
  /** How quickly the globe catches up with the hand; higher is tighter. */
  follow: number;
  /**
   * How high the globe rides above the palm, in globe radii from the palm to the globe's
   * centre. 1 rests its lowest point on the palm; 0 centres it on the palm.
   */
  hover: number;
}

export const DEFAULT_GLOBE_OPTIONS: GlobeOptions = {
  baseRadius: GLOBE_RADIUS_DEFAULT,
  spinSpeed: 0.35,
  follow: 22,
  hover: 1.08,
};

/**
 * Where the globe is and how big, given what the hands are doing. No rendering in here:
 * positions are normalised device coordinates (-1..1, y up) and sizes are fractions of screen
 * height, so the behaviour can be reasoned about and tested without a 3D scene.
 *
 * - One hand: the globe rests on the palm, straight above it on screen.
 * - Two hands: it sits between the palms and fills the gap.
 * - Pinch: it stays put and the hand's movement spins it; it keeps turning when released.
 * - Fist: it folds up small. Open palm: a pulse.
 * - No hands: it stays where it was left, at the size it was left.
 */
export class GlobeState {
  x = 0;
  y = 0;
  radius: number;
  /** 0 normally, 1 fully folded up. */
  collapse = 0;
  /** 1 at the moment of a pulse, falling to 0. */
  pulse = 0;
  /** 0 while free, 1 while in a hand. For brightness. */
  held = 0;
  /** How far to turn this frame, in radians, about the screen's up, right and forward axes. */
  dYaw = 0;
  dPitch = 0;
  dRoll = 0;

  private readonly options: GlobeOptions;
  private readonly hands: [Hand, Hand] = [createHand(), createHand()];
  private aspect = 1;
  private holder: 0 | 1 | null = null;
  /** The holding hand's size when it took hold; moving it nearer or farther resizes from there. */
  private referenceSize = 0;
  private spanning = false;
  /** False for a mouse wheel, which resizes the globe but says nothing about where it is. */
  private spanPlaced = false;
  private spanX = 0;
  private spanY = 0;
  private goalX = 0;
  private goalY = 0;
  private radiusGoal: number;
  private yawVelocity: number;
  private pitchVelocity = 0;
  private rollVelocity = 0;
  private pendingYaw = 0;
  private pendingPitch = 0;
  private pendingRoll = 0;
  private sinceGrabMove = 0;

  constructor(options: Partial<GlobeOptions> = {}) {
    this.options = { ...DEFAULT_GLOBE_OPTIONS, ...options };
    this.options.baseRadius = clampRadius(this.options.baseRadius);
    this.radius = this.options.baseRadius;
    this.radiusGoal = this.radius;
    this.yawVelocity = this.options.spinSpeed;
  }

  get mode(): GlobeMode {
    if (this.spanning) return 'stretched';
    return this.holder === null ? 'free' : 'held';
  }

  get baseRadius(): number {
    return this.options.baseRadius;
  }

  get spinSpeed(): number {
    return this.options.spinSpeed;
  }

  get follow(): number {
    return this.options.follow;
  }

  get hover(): number {
    return this.options.hover;
  }

  get grabbing(): boolean {
    return this.hands[0].grabbing || this.hands[1].grabbing;
  }

  setAspect(aspect: number): void {
    if (aspect > 0) this.aspect = aspect;
  }

  setBaseRadius(radius: number): void {
    this.options.baseRadius = clampRadius(radius);
    this.radiusGoal = this.options.baseRadius;
    this.rebaseHolder();
  }

  setSpinSpeed(speed: number): void {
    this.options.spinSpeed = speed;
  }

  setFollow(follow: number): void {
    this.options.follow = clamp(follow, 1, 60);
  }

  setHover(hover: number): void {
    this.options.hover = clamp(hover, 0, 3);
  }

  /** A hand appeared, moved or (`present` false) left. `size` is 0 when unknown. */
  setHand(slot: 0 | 1, present: boolean, x = 0, y = 0, size = 0): void {
    const hand = this.hands[slot];
    if (!present) {
      hand.present = false;
      hand.grabbing = false;
      hand.collapsing = false;
      if (this.holder === slot) this.takeHold(this.hands[1 - slot].present ? other(slot) : null);
      return;
    }
    if (hand.present) {
      // Velocity from the last two reports, smoothed, for running ahead between reports.
      const elapsed = Math.max(hand.age, 1 / 90);
      hand.vx += ((x - hand.x) / elapsed - hand.vx) * 0.5;
      hand.vy += ((y - hand.y) / elapsed - hand.vy) * 0.5;
    } else {
      hand.vx = 0;
      hand.vy = 0;
      hand.steadySize = size;
    }
    hand.present = true;
    hand.x = x;
    hand.y = y;
    hand.size = size;
    hand.age = 0;
    if (this.holder === null) this.takeHold(slot);
  }

  /**
   * Both hands held up. `gap` is the distance between the palms in screen heights, or 0 when
   * only the change is known (a mouse wheel), in which case `factor` resizes the globe.
   */
  setSpan(active: boolean, x = 0, y = 0, gap = 0, factor = 1): void {
    if (!active) {
      if (!this.spanning) return;
      this.spanning = false;
      // Letting go keeps the size the hands made.
      this.options.baseRadius = this.radiusGoal;
      this.rebaseHolder();
      return;
    }
    if (!this.spanning) {
      this.spanning = true;
      this.radiusGoal = this.radius;
    }
    this.spanPlaced = gap > 0;
    this.spanX = x;
    this.spanY = y;
    if (gap > 0) {
      this.radiusGoal = clampRadius(gap * 0.5 * SPAN_FILL);
    } else if (Number.isFinite(factor) && factor > 0) {
      this.radiusGoal = clampRadius(this.radiusGoal * factor);
    }
  }

  /** A pinch began, moved by (dx, dy) in device coordinates, or ended. */
  grab(slot: 0 | 1, active: boolean, dx = 0, dy = 0, dRoll = 0): void {
    const hand = this.hands[slot];
    if (!active) {
      hand.grabbing = false;
      return;
    }
    hand.grabbing = true;
    // A trackball: the surface under the hand moves with the hand.
    const reach = Math.max(this.radius, GLOBE_RADIUS_MIN);
    const yaw = (dx * this.aspect) / 2 / reach;
    const pitch = -dy / 2 / reach;
    const roll = -dRoll;
    this.pendingYaw += yaw;
    this.pendingPitch += pitch;
    this.pendingRoll += roll;
    if (yaw !== 0 || pitch !== 0 || roll !== 0) {
      const elapsed = Math.max(this.sinceGrabMove, 1 / 90);
      this.yawVelocity += (yaw / elapsed - this.yawVelocity) * 0.5;
      this.pitchVelocity += (pitch / elapsed - this.pitchVelocity) * 0.5;
      this.rollVelocity += (roll / elapsed - this.rollVelocity) * 0.5;
      this.sinceGrabMove = 0;
    }
  }

  setCollapsing(slot: 0 | 1, on: boolean): void {
    this.hands[slot].collapsing = on;
  }

  firePulse(): void {
    this.pulse = 1;
  }

  /** Back to the middle of the screen at the default size, turning idly. */
  reset(): void {
    for (const hand of this.hands) Object.assign(hand, createHand());
    this.holder = null;
    this.spanning = false;
    this.spanPlaced = false;
    this.options.baseRadius = GLOBE_RADIUS_DEFAULT;
    this.x = this.y = this.goalX = this.goalY = 0;
    this.radius = this.radiusGoal = GLOBE_RADIUS_DEFAULT;
    this.collapse = this.pulse = this.held = 0;
    this.yawVelocity = this.options.spinSpeed;
    this.pitchVelocity = this.rollVelocity = 0;
    this.pendingYaw = this.pendingPitch = this.pendingRoll = 0;
  }

  update(dt: number): void {
    for (const hand of this.hands) {
      hand.age += dt;
      if (hand.present) hand.steadySize = damp(hand.steadySize, hand.size, 5, dt);
    }
    this.sinceGrabMove += dt;
    const grabbing = this.grabbing;

    if (!grabbing) this.aim();
    if (!this.spanning && this.holder === null) this.radiusGoal = this.options.baseRadius;

    if (!grabbing) {
      this.x = damp(this.x, this.goalX, this.options.follow, dt);
      this.y = damp(this.y, this.goalY, this.options.follow, dt);
    }
    this.radius = damp(this.radius, this.radiusGoal, 12, dt);

    const collapsing = this.hands[0].collapsing || this.hands[1].collapsing;
    this.collapse = damp(this.collapse, collapsing ? 1 : 0, 9, dt);
    this.pulse = Math.max(0, this.pulse - dt / PULSE_SECONDS);
    this.held = damp(this.held, this.mode === 'free' ? 0 : 1, 6, dt);

    // While pinched the globe turns exactly as far as the hand moved. Released, it keeps the
    // speed it was given and eases back to its idle turn.
    this.dYaw = this.pendingYaw;
    this.dPitch = this.pendingPitch;
    this.dRoll = this.pendingRoll;
    this.pendingYaw = this.pendingPitch = this.pendingRoll = 0;
    if (!grabbing) {
      this.yawVelocity = damp(this.yawVelocity, this.options.spinSpeed, 1.4, dt);
      this.pitchVelocity = damp(this.pitchVelocity, 0, 1.4, dt);
      this.rollVelocity = damp(this.rollVelocity, 0, 2.5, dt);
      this.dYaw += this.yawVelocity * dt;
      this.dPitch += this.pitchVelocity * dt;
      this.dRoll += this.rollVelocity * dt;
    } else if (this.sinceGrabMove > 0.12) {
      // Holding still while pinched: do not fling it on release.
      this.yawVelocity = this.pitchVelocity = this.rollVelocity = 0;
    }
  }

  /** Works out where the globe should be heading. */
  private aim(): void {
    if (this.spanning && this.spanPlaced) {
      this.goalX = this.spanX;
      this.goalY = this.spanY;
      return;
    }
    if (this.holder === null) return; // stays where it was left
    const hand = this.hands[this.holder];
    const lead = Math.min(hand.age, PREDICT_SECONDS);
    const px = hand.x + hand.vx * lead;
    const py = hand.y + hand.vy * lead;
    if (hand.size <= 0) {
      // A mouse: the globe is simply under the cursor.
      this.goalX = px;
      this.goalY = py;
      return;
    }
    // Rest on the palm: straight above it on screen, the way a thing held in a hand sits
    // whichever way the hand is turned. Which way the fingers point is deliberately ignored;
    // for a palm-up hand they point at the camera and their direction on screen is noise.
    this.goalX = px;
    this.goalY = py + this.radius * this.options.hover * 2;
    if (!this.spanning) {
      // Bringing the hand nearer the camera makes the globe bigger, as a real one would look.
      const depth = this.referenceSize > 0 ? Math.sqrt(hand.steadySize / this.referenceSize) : 1;
      this.radiusGoal = clampRadius(this.options.baseRadius * clamp(depth, 0.75, 1.45));
    }
  }

  private takeHold(slot: 0 | 1 | null): void {
    this.holder = slot;
    this.rebaseHolder();
  }

  private rebaseHolder(): void {
    this.referenceSize = this.holder === null ? 0 : this.hands[this.holder].steadySize;
  }
}

const other = (slot: 0 | 1): 0 | 1 => (slot === 0 ? 1 : 0);

const clampRadius = (radius: number): number => clamp(radius, GLOBE_RADIUS_MIN, GLOBE_RADIUS_MAX);
