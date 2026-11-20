import { describe, expect, it } from 'vitest';
import type { GestureEvent } from '../../src/gestures/events/types';
import { FallbackInput } from '../../src/interaction/controllers/FallbackInput';

/** A stand-in for the canvas: a real EventTarget with a fixed 200 x 100 box. */
function createRig() {
  const element = new EventTarget() as EventTarget & Record<string, unknown>;
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  const keys = new EventTarget();
  const events: GestureEvent[] = [];
  const input = new FallbackInput(
    element as unknown as HTMLElement,
    (event) => events.push(event),
    keys as unknown as Window,
  );
  const fire = (target: EventTarget, type: string, props: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    target.dispatchEvent(event);
    return event;
  };
  return {
    input,
    events,
    log: () => events.map((e) => `${e.gesture}:${e.phase}`),
    clear: () => (events.length = 0),
    pointer: (type: string, x: number, y: number, button = 0) =>
      fire(element, type, { clientX: x, clientY: y, button, pointerId: 1 }),
    wheel: (deltaY: number, shiftKey = false) => fire(element, 'wheel', { deltaY, shiftKey }),
    key: (type: 'keydown' | 'keyup', key: string) => fire(keys, type, { key }),
    blur: () => fire(keys, 'blur'),
    contextMenu: () => fire(element, 'contextmenu'),
  };
}

describe('FallbackInput', () => {
  it('reports the pointer as a hand in 0..1 screen coordinates', () => {
    const rig = createRig();
    rig.pointer('pointermove', 50, 25);
    rig.pointer('pointermove', 100, 50);
    expect(rig.log()).toEqual(['hand:start', 'hand:update']);
    const update = rig.events[1];
    expect(update).toMatchObject({ x: 0.5, y: 0.5, hand: 'Right', source: 'fallback' });
    expect(update.dx).toBeCloseTo(0.25);
    expect(update.dy).toBeCloseTo(0.25);
  });

  it('turns a left drag into a pinch', () => {
    const rig = createRig();
    rig.pointer('pointermove', 20, 20);
    rig.clear();
    rig.pointer('pointerdown', 20, 20, 0);
    rig.pointer('pointermove', 60, 20, 0);
    rig.pointer('pointerup', 60, 20, 0);
    expect(rig.log()).toEqual([
      'hand:update',
      'pinch:start',
      'hand:update',
      'pinch:update',
      'pinch:end',
    ]);
    expect(rig.events[3].dx).toBeCloseTo(0.2);
  });

  it('turns a right drag into a fist and suppresses the context menu', () => {
    const rig = createRig();
    rig.pointer('pointermove', 20, 20);
    rig.pointer('pointerdown', 20, 20, 2);
    rig.pointer('pointerup', 20, 20, 2);
    expect(rig.log()).toContain('fist:start');
    expect(rig.log()).toContain('fist:end');
    expect(rig.contextMenu().defaultPrevented).toBe(true);
  });

  it('holds a pose while its key is down', () => {
    const rig = createRig();
    rig.pointer('pointermove', 20, 20);
    rig.clear();
    rig.key('keydown', 'o');
    rig.key('keyup', 'o');
    rig.key('keydown', 'P');
    rig.key('keyup', 'P');
    expect(rig.log()).toEqual(['open_palm:start', 'open_palm:end', 'point:start', 'point:end']);
  });

  it('ends one pose before starting another', () => {
    const rig = createRig();
    rig.pointer('pointermove', 20, 20);
    rig.key('keydown', 'f');
    rig.clear();
    rig.pointer('pointerdown', 20, 20, 0);
    expect(rig.log()).toEqual(['hand:update', 'fist:update', 'fist:end', 'pinch:start']);
  });

  it('turns arrow keys into swipes', () => {
    const rig = createRig();
    rig.key('keydown', 'ArrowLeft');
    expect(rig.log()).toEqual(['swipe:start', 'swipe:end']);
    expect(rig.events[0].direction).toBe('left');
  });

  it('turns the wheel into a two-hand spread', () => {
    const rig = createRig();
    rig.pointer('pointermove', 20, 20);
    rig.clear();
    rig.wheel(-100);
    rig.wheel(-100);
    expect(rig.log()).toEqual(['two_hand:start', 'two_hand:update', 'two_hand:update']);
    expect(rig.events[1].hand).toBe('Both');
    expect(rig.events[1].dScale).toBeGreaterThan(1);
    expect(rig.events[2].scale).toBeCloseTo(rig.events[1].dScale * rig.events[2].dScale);
    rig.wheel(100);
    expect(rig.events[3].dScale).toBeLessThan(1);
  });

  it('rolls a held object with shift + wheel', () => {
    const rig = createRig();
    rig.pointer('pointerdown', 20, 20, 0);
    rig.clear();
    rig.wheel(50, true);
    expect(rig.log()).toEqual(['pinch:update']);
    expect(rig.events[0].dRoll).toBeCloseTo(0.2);
  });

  it('lets go of everything when the pointer leaves or the window loses focus', () => {
    const rig = createRig();
    rig.pointer('pointermove', 20, 20);
    rig.key('keydown', 'o');
    rig.clear();
    rig.pointer('pointerleave', 0, 0);
    expect(rig.log()).toEqual(['open_palm:end', 'hand:end']);

    rig.pointer('pointerdown', 20, 20, 0);
    rig.clear();
    rig.blur();
    expect(rig.log()).toEqual(['pinch:end', 'hand:end']);
  });

  it('keeps a drag alive when the pointer leaves mid-drag', () => {
    const rig = createRig();
    rig.pointer('pointerdown', 20, 20, 0);
    rig.clear();
    rig.pointer('pointerleave', 0, 0);
    expect(rig.log()).toEqual([]);
  });

  it('goes quiet when disabled and releases what was held', () => {
    const rig = createRig();
    rig.pointer('pointerdown', 20, 20, 0);
    rig.clear();
    rig.input.setEnabled(false);
    expect(rig.log()).toEqual(['pinch:end', 'hand:end']);
    rig.clear();
    rig.pointer('pointermove', 80, 80);
    rig.key('keydown', 'ArrowUp');
    rig.wheel(100);
    expect(rig.log()).toEqual([]);
    expect(rig.contextMenu().defaultPrevented).toBe(false);
  });
});
