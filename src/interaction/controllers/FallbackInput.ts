import { GESTURES, createGestureEvent } from '../../gestures/events/types';
import type {
  BuiltinGesture,
  GestureEvent,
  GesturePhase,
  GestureSink,
  SwipeDirection,
} from '../../gestures/events/types';
import { clamp } from '../../utils/math';

type Pose =
  typeof GESTURES.PINCH | typeof GESTURES.FIST | typeof GESTURES.OPEN_PALM | typeof GESTURES.POINT;

/** Keys that hold a pose while pressed. */
export const POSE_KEYS: Record<string, Pose> = {
  o: GESTURES.OPEN_PALM,
  f: GESTURES.FIST,
  p: GESTURES.POINT,
};

export const SWIPE_KEYS: Record<string, SwipeDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const WHEEL_SCALE = 0.0016;
const WHEEL_ROLL = 0.004;
const WHEEL_IDLE_MS = 220;

/**
 * Mouse and keyboard as a virtual right hand. It publishes the same gesture events the camera
 * pipeline does (marked `source: 'fallback'`), so environments and the HUD need no second code path.
 *
 * - Move: the hand. Left drag: pinch. Right drag: fist.
 * - Hold O: open palm. Hold F: fist. Hold P: point.
 * - Wheel: two-hand spread (zoom or scale). Shift + wheel while dragging: wrist roll.
 * - Arrow keys: swipe.
 */
export class FallbackInput {
  private enabled = true;
  private inside = false;
  private x = 0.5;
  private y = 0.5;
  private readonly buttons = new Set<number>();
  private readonly keys = new Set<string>();
  private pose: Pose | null = null;
  private spreading = false;
  private spread = 1;
  private wheelTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly sink: GestureSink,
    private readonly keyTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  ) {
    element.addEventListener('pointerenter', this.onPointerMove);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerLeave);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
    keyTarget.addEventListener('keydown', this.onKeyDown as EventListener);
    keyTarget.addEventListener('keyup', this.onKeyUp as EventListener);
    keyTarget.addEventListener('blur', this.onBlur);
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    if (!enabled) this.releaseAll();
    this.enabled = enabled;
  }

  dispose(): void {
    this.releaseAll();
    const el = this.element;
    el.removeEventListener('pointerenter', this.onPointerMove);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerLeave);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    this.keyTarget.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.keyTarget.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.keyTarget.removeEventListener('blur', this.onBlur);
  }

  // --- pointer -------------------------------------------------------------------------------

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const rect = this.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const dx = this.inside ? x - this.x : 0;
    const dy = this.inside ? y - this.y : 0;
    this.x = x;
    this.y = y;
    if (!this.inside) {
      this.inside = true;
      this.emit(GESTURES.HAND, 'start');
      this.syncPose();
      return;
    }
    this.emit(GESTURES.HAND, 'update', { dx, dy });
    if (this.pose) this.emit(this.pose, 'update', { dx, dy });
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.onPointerMove(event);
    this.buttons.add(event.button);
    // Keep receiving the drag even if the pointer strays over a panel or off the window.
    this.element.setPointerCapture?.(event.pointerId);
    this.syncPose();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.buttons.delete(event.button);
    if (this.element.hasPointerCapture?.(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.syncPose();
  };

  private readonly onPointerLeave = (): void => {
    if (this.buttons.size > 0) return; // a captured drag is still in progress
    this.leave();
  };

  private readonly onContextMenu = (event: Event): void => {
    if (this.enabled) event.preventDefault(); // right drag is the fist
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    event.preventDefault();
    if (event.shiftKey && this.pose === GESTURES.PINCH) {
      // Browsers report shift + wheel on either axis.
      const delta = event.deltaY || event.deltaX;
      this.emit(GESTURES.PINCH, 'update', { dRoll: delta * WHEEL_ROLL });
      return;
    }
    const step = Math.exp(-clamp(event.deltaY, -240, 240) * WHEEL_SCALE);
    if (!this.spreading) {
      this.spreading = true;
      this.spread = 1;
      this.emit(GESTURES.TWO_HAND, 'start', { hand: 'Both' });
    }
    this.spread *= step;
    this.emit(GESTURES.TWO_HAND, 'update', { hand: 'Both', scale: this.spread, dScale: step });
    if (this.wheelTimer !== null) clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(this.endSpread, WHEEL_IDLE_MS);
  };

  private readonly endSpread = (): void => {
    if (this.wheelTimer !== null) clearTimeout(this.wheelTimer);
    this.wheelTimer = null;
    if (!this.spreading) return;
    this.spreading = false;
    this.emit(GESTURES.TWO_HAND, 'end', { hand: 'Both', scale: this.spread });
  };

  // --- keyboard ------------------------------------------------------------------------------

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) return;
    const direction = SWIPE_KEYS[event.key];
    if (direction) {
      event.preventDefault();
      this.emit(GESTURES.SWIPE, 'start', { direction });
      this.emit(GESTURES.SWIPE, 'end', { direction });
      return;
    }
    const key = event.key.toLowerCase();
    if (key in POSE_KEYS) {
      this.keys.add(key);
      this.syncPose();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.keys.delete(event.key.toLowerCase())) this.syncPose();
  };

  private readonly onBlur = (): void => {
    this.buttons.clear();
    this.keys.clear();
    this.leave();
  };

  // --- state ---------------------------------------------------------------------------------

  /** Mouse buttons win over keys; the pose ends before a different one starts. */
  private wantedPose(): Pose | null {
    if (!this.inside) return null;
    if (this.buttons.has(0)) return GESTURES.PINCH;
    if (this.buttons.has(2)) return GESTURES.FIST;
    for (const key of this.keys) return POSE_KEYS[key];
    return null;
  }

  private syncPose(): void {
    const wanted = this.enabled ? this.wantedPose() : null;
    if (wanted === this.pose) return;
    if (this.pose) this.emit(this.pose, 'end');
    this.pose = wanted;
    if (wanted) this.emit(wanted, 'start');
  }

  private leave(): void {
    this.endSpread();
    if (this.pose) {
      this.emit(this.pose, 'end');
      this.pose = null;
    }
    if (this.inside) {
      this.inside = false;
      this.emit(GESTURES.HAND, 'end');
    }
  }

  private releaseAll(): void {
    this.buttons.clear();
    this.keys.clear();
    this.leave();
  }

  private emit(
    gesture: BuiltinGesture,
    phase: GesturePhase,
    extra: Partial<GestureEvent> = {},
  ): void {
    this.sink(
      createGestureEvent({
        gesture,
        phase,
        hand: 'Right',
        timestamp: performance.now(),
        x: this.x,
        y: this.y,
        source: 'fallback',
        ...extra,
      }),
    );
  }
}

function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return (target as Element).closest('input, select, textarea, [contenteditable="true"]') !== null;
}
