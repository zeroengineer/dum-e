import { describe, expect, it, vi } from 'vitest';
import { GESTURES, createGestureEvent } from '../../src/gestures/events/types';
import type { GestureEvent } from '../../src/gestures/events/types';
import type { EnvironmentAction } from '../../src/interaction/actions';
import {
  InteractionController,
  toPointer,
} from '../../src/interaction/controllers/InteractionController';
import { GestureEventBus } from '../../src/interaction/dispatcher/GestureEventBus';
import {
  DEFAULT_MAPPINGS,
  galaxyMapping,
  objectsMapping,
  particlesMapping,
} from '../../src/interaction/mappings';
import type { GestureMapping } from '../../src/interaction/mappings';

const event = (
  gesture: string,
  phase: GestureEvent['phase'] = 'update',
  extra: Partial<GestureEvent> = {},
): GestureEvent => createGestureEvent({ gesture, phase, hand: 'Right', ...extra });

/** Runs one event through a mapping table and returns the actions as a list. */
function map(mapping: GestureMapping, e: GestureEvent): EnvironmentAction[] {
  const result = mapping[e.gesture]?.(e, toPointer(e, 1)) ?? null;
  return result === null ? [] : Array.isArray(result) ? result : [result];
}

const types = (actions: EnvironmentAction[]): string[] => actions.map((a) => a.type);

describe('GestureEventBus', () => {
  it('delivers to general and per-gesture subscribers', () => {
    const bus = new GestureEventBus();
    const all = vi.fn();
    const pinches = vi.fn();
    bus.subscribe(all);
    bus.on(GESTURES.PINCH, pinches);
    bus.publish(event(GESTURES.PINCH));
    bus.publish(event(GESTURES.FIST));
    expect(all).toHaveBeenCalledTimes(2);
    expect(pinches).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new GestureEventBus();
    const listener = vi.fn();
    const off = bus.subscribe(listener);
    const offPinch = bus.on(GESTURES.PINCH, listener);
    off();
    offPinch();
    bus.publish(event(GESTURES.PINCH));
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps going when a listener throws', () => {
    const bus = new GestureEventBus();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    bus.subscribe(() => {
      throw new Error('broken');
    });
    bus.subscribe(after);
    bus.publish(event(GESTURES.FIST));
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('toPointer', () => {
  it('converts mirrored screen coordinates to NDC with y up', () => {
    const p = toPointer(
      event(GESTURES.HAND, 'update', { x: 0.75, y: 0.25, source: 'fallback' }),
      1,
    );
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });

  it('assigns hand slots', () => {
    expect(toPointer(event(GESTURES.HAND, 'update', { hand: 'Left' }), 1).hand).toBe(0);
    expect(toPointer(event(GESTURES.HAND, 'update', { hand: 'Right' }), 1).hand).toBe(1);
    expect(toPointer(event(GESTURES.TWO_HAND, 'update', { hand: 'Both' }), 1).hand).toBe(0);
  });

  it('stretches the middle of the camera image over the whole screen', () => {
    const e = event(GESTURES.HAND, 'update', { x: 0.9, y: 0.5, dx: 0.1, dy: 0.1 });
    const p = toPointer(e, 0.8);
    expect(p.x).toBeCloseTo(1); // 0.9 is the edge of the central 80%
    expect(p.dx).toBeCloseTo(0.25);
    expect(p.dy).toBeCloseTo(-0.25);
    expect(toPointer(event(GESTURES.HAND, 'update', { x: 1, y: 0 }), 0.8)).toMatchObject({
      x: 1,
      y: 1,
    });
  });

  it('does not stretch mouse input', () => {
    const e = event(GESTURES.HAND, 'update', { x: 0.9, source: 'fallback' });
    expect(toPointer(e, 0.8).x).toBeCloseTo(0.8);
  });
});

describe('particles mapping', () => {
  it('maps each gesture to its force', () => {
    expect(types(map(particlesMapping, event(GESTURES.HAND)))).toEqual(['hover']);
    expect(types(map(particlesMapping, event(GESTURES.OPEN_PALM)))).toEqual(['expand']);
    expect(types(map(particlesMapping, event(GESTURES.FIST)))).toEqual(['attract']);
    expect(types(map(particlesMapping, event(GESTURES.PINCH)))).toEqual(['grab']);
    expect(map(particlesMapping, event(GESTURES.POINT))).toEqual([]);
  });

  it('carries phase, position and movement', () => {
    const [action] = map(
      particlesMapping,
      event(GESTURES.PINCH, 'start', { x: 0.5, y: 0.5, dx: 0.1, dRoll: 0.2, source: 'fallback' }),
    );
    expect(action).toMatchObject({ type: 'grab', phase: 'start', hand: 1, x: 0, dRoll: 0.2 });
    expect(action.type === 'grab' && action.dx).toBeCloseTo(0.2);
  });

  it('turns two-hand distance into scale steps and ignores no-change frames', () => {
    const grow = map(particlesMapping, event(GESTURES.TWO_HAND, 'update', { dScale: 1.1 }));
    expect(grow).toEqual([{ type: 'scale', phase: 'update', hand: 0, factor: 1.1 }]);
    expect(map(particlesMapping, event(GESTURES.TWO_HAND, 'update', { dScale: 1 }))).toEqual([]);
    expect(map(particlesMapping, event(GESTURES.TWO_HAND, 'start', { dScale: 1.1 }))).toEqual([]);
    expect(map(particlesMapping, event(GESTURES.TWO_HAND, 'update', { dScale: 0 }))).toEqual([]);
  });

  it('maps swipes to next and previous', () => {
    const swipe = (direction: GestureEvent['direction']) =>
      map(particlesMapping, event(GESTURES.SWIPE, 'start', { direction }))[0];
    expect(swipe('left')).toMatchObject({ type: 'next', direction: 1 });
    expect(swipe('up')).toMatchObject({ type: 'next', direction: 1 });
    expect(swipe('right')).toMatchObject({ type: 'next', direction: -1 });
    expect(swipe('down')).toMatchObject({ type: 'next', direction: -1 });
    expect(map(particlesMapping, event(GESTURES.SWIPE, 'end', { direction: 'left' }))).toEqual([]);
  });
});

describe('objects mapping', () => {
  it('maps each gesture to a hand action', () => {
    expect(types(map(objectsMapping, event(GESTURES.HAND)))).toEqual(['hover']);
    expect(types(map(objectsMapping, event(GESTURES.POINT)))).toEqual(['point']);
    expect(types(map(objectsMapping, event(GESTURES.PINCH)))).toEqual(['grab']);
    expect(types(map(objectsMapping, event(GESTURES.OPEN_PALM, 'start')))).toEqual(['release']);
    expect(types(map(objectsMapping, event(GESTURES.FIST, 'start')))).toEqual(['special']);
    expect(types(map(objectsMapping, event(GESTURES.TWO_HAND, 'update', { dScale: 0.9 })))).toEqual(
      ['scale'],
    );
  });

  it('ignores swipes', () => {
    expect(map(objectsMapping, event(GESTURES.SWIPE, 'start', { direction: 'left' }))).toEqual([]);
  });
});

describe('galaxy mapping', () => {
  it('turns the galaxy when a tracked hand moves', () => {
    const moved = map(galaxyMapping, event(GESTURES.HAND, 'update', { dx: 0.05, dy: 0.02 }));
    expect(types(moved)).toEqual(['hover', 'rotate']);
    const rotate = moved[1];
    expect(rotate.type === 'rotate' && rotate.dx).toBeCloseTo(0.1);
    expect(rotate.type === 'rotate' && rotate.dy).toBeCloseTo(-0.04);
    expect(types(map(galaxyMapping, event(GESTURES.HAND, 'update')))).toEqual(['hover']);
    expect(types(map(galaxyMapping, event(GESTURES.HAND, 'end', { dx: 0.05 })))).toEqual(['hover']);
  });

  it('only turns with the mouse while dragging', () => {
    const fallback = { source: 'fallback' as const, dx: 0.05 };
    expect(types(map(galaxyMapping, event(GESTURES.HAND, 'update', fallback)))).toEqual(['hover']);
    expect(types(map(galaxyMapping, event(GESTURES.PINCH, 'update', fallback)))).toEqual(['grab']);
    expect(map(galaxyMapping, event(GESTURES.PINCH, 'update', { dx: 0.05 }))).toEqual([]);
  });

  it('maps poses, zoom and swipe', () => {
    expect(types(map(galaxyMapping, event(GESTURES.OPEN_PALM)))).toEqual(['expand']);
    expect(types(map(galaxyMapping, event(GESTURES.FIST)))).toEqual(['attract']);
    expect(map(galaxyMapping, event(GESTURES.TWO_HAND, 'update', { dScale: 1.2 }))).toEqual([
      { type: 'zoom', phase: 'update', hand: 0, factor: 1.2 },
    ]);
    expect(
      types(map(galaxyMapping, event(GESTURES.SWIPE, 'start', { direction: 'right' }))),
    ).toEqual(['next']);
  });
});

describe('InteractionController', () => {
  const setup = () => {
    const bus = new GestureEventBus();
    const controller = new InteractionController(bus, DEFAULT_MAPPINGS);
    const actions: EnvironmentAction[] = [];
    const target = { handleAction: (action: EnvironmentAction) => actions.push(action) };
    return { bus, controller, actions, target };
  };

  it('does nothing without a target', () => {
    const { bus, actions } = setup();
    bus.publish(event(GESTURES.FIST));
    expect(actions).toEqual([]);
  });

  it('uses the mapping of the active environment', () => {
    const { bus, controller, actions, target } = setup();
    controller.setTarget('particles', target);
    bus.publish(event(GESTURES.FIST, 'start'));
    controller.setTarget('objects', target);
    bus.publish(event(GESTURES.FIST, 'start'));
    controller.setTarget('unknown', target);
    bus.publish(event(GESTURES.FIST, 'start'));
    controller.setTarget(null, null);
    bus.publish(event(GESTURES.FIST, 'start'));
    expect(types(actions)).toEqual(['attract', 'special']);
  });

  it('mutes a disabled source but still delivers endings', () => {
    const { bus, controller, actions, target } = setup();
    controller.setTarget('particles', target);
    controller.setSourceEnabled('fallback', false);
    bus.publish(event(GESTURES.PINCH, 'update', { source: 'fallback' }));
    bus.publish(event(GESTURES.PINCH, 'update'));
    bus.publish(event(GESTURES.PINCH, 'end', { source: 'fallback' }));
    expect(actions.map((a) => a.phase)).toEqual(['update', 'end']);
  });

  it('reports dispatched actions to observers and stops after dispose', () => {
    const { bus, controller, actions, target } = setup();
    const seen = vi.fn();
    controller.setTarget('galaxy', target);
    controller.onAction(seen);
    bus.publish(event(GESTURES.HAND, 'update', { dx: 0.1 }));
    expect(seen).toHaveBeenCalledTimes(2);
    controller.dispose();
    bus.publish(event(GESTURES.HAND, 'update', { dx: 0.1 }));
    expect(actions).toHaveLength(2);
  });
});
