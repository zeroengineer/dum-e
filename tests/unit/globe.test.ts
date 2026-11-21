import { describe, expect, it } from 'vitest';
import {
  generateGlobeDots,
  generateGraticule,
  latLonToUnit,
} from '../../src/environments/globe/geometry';
import {
  GLOBE_RADIUS_DEFAULT,
  GLOBE_RADIUS_MAX,
  GLOBE_RADIUS_MIN,
  GlobeState,
} from '../../src/environments/globe/globeState';
import { isLand } from '../../src/environments/globe/landMask';

describe('land mask', () => {
  it('knows land from sea at well-known places', () => {
    const land: Array<[string, number, number]> = [
      ['Sahara', 23, 10],
      ['Amazon basin', -5, -60],
      ['Siberia', 62, 100],
      ['central Australia', -25, 134],
      ['Kansas', 38.5, -98],
      ['Deccan plateau', 17, 77],
      ['Antarctica', -82, 60],
      ['Greenland', 72, -40],
    ];
    const sea: Array<[string, number, number]> = [
      ['mid Pacific', 0, -150],
      ['mid Atlantic', 30, -40],
      ['Indian Ocean', -30, 80],
      ['Southern Ocean', -58, -120],
      ['Arctic Ocean', 88, 0],
      ['Gulf of Guinea', 0, 0],
    ];
    for (const [name, lat, lon] of land) expect(isLand(lat, lon), name).toBe(true);
    for (const [name, lat, lon] of sea) expect(isLand(lat, lon), name).toBe(false);
  });

  it('wraps longitude and tolerates the poles and the date line', () => {
    expect(isLand(23, 10 + 360)).toBe(true);
    expect(isLand(23, 10 - 360)).toBe(true);
    expect(isLand(0, 180)).toBe(isLand(0, -180));
    expect(() => isLand(90, 0)).not.toThrow();
    expect(() => isLand(-90, 179.999)).not.toThrow();
    expect(isLand(-90, 0)).toBe(true);
  });
});

describe('globe geometry', () => {
  it('faces longitude 0 toward the viewer with east on the right and north up', () => {
    const out = new Float32Array(9);
    latLonToUnit(0, 0, out, 0);
    latLonToUnit(0, 90, out, 3);
    latLonToUnit(90, 0, out, 6);
    expect([...out.subarray(0, 3)].map((v) => Math.round(v))).toEqual([0, 0, 1]);
    expect([...out.subarray(3, 6)].map((v) => Math.round(v))).toEqual([1, 0, 0]);
    expect([...out.subarray(6, 9)].map((v) => Math.round(v))).toEqual([0, 1, 0]);
  });

  it('puts every dot on the unit sphere', () => {
    const { count, positions } = generateGlobeDots(4000);
    expect(count).toBe(4000);
    for (let i = 0; i < count; i++) {
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      expect(r).toBeCloseTo(1, 5);
    }
  });

  it('marks about the right share of dots as land', () => {
    const { count, seeds } = generateGlobeDots(20000);
    let land = 0;
    for (let i = 0; i < count; i++) land += seeds[i * 4];
    // Dots are equal-area, so this is the Earth's land fraction: about 29%.
    expect(land / count).toBeGreaterThan(0.26);
    expect(land / count).toBeLessThan(0.32);
  });

  it('covers the whole sphere with any prefix of the dots', () => {
    const { positions } = generateGlobeDots(20000);
    const prefix = 2000;
    const octants = new Array<number>(8).fill(0);
    for (let i = 0; i < prefix; i++) {
      const octant =
        (positions[i * 3] > 0 ? 1 : 0) +
        (positions[i * 3 + 1] > 0 ? 2 : 0) +
        (positions[i * 3 + 2] > 0 ? 4 : 0);
      octants[octant]++;
    }
    // An unshuffled lattice would put the whole prefix near one pole.
    for (const share of octants) {
      expect(share).toBeGreaterThan(prefix / 8 - 70);
      expect(share).toBeLessThan(prefix / 8 + 70);
    }
  });

  it('is the same every time', () => {
    const a = generateGlobeDots(500);
    const b = generateGlobeDots(500);
    expect([...a.positions]).toEqual([...b.positions]);
    expect([...a.seeds]).toEqual([...b.seeds]);
  });

  it('draws latitude and longitude lines on the sphere', () => {
    const lines = generateGraticule(15, 5);
    // 11 parallels of 72 pieces and 24 meridians of 36 pieces, two points each.
    expect(lines.length).toBe((11 * 72 + 24 * 36) * 6);
    for (let i = 0; i < lines.length; i += 3) {
      expect(Math.hypot(lines[i], lines[i + 1], lines[i + 2])).toBeCloseTo(1, 5);
    }
  });
});

/** Advances the model at 60 frames a second. */
function run(state: GlobeState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) state.update(1 / 60);
}

/** Holds a hand still for a while, reporting it 24 times a second as the tracker does. */
function hold(
  state: GlobeState,
  seconds: number,
  hand: { slot?: 0 | 1; x: number; y: number; size?: number; roll?: number },
): void {
  for (let i = 0; i < Math.round(seconds * 24); i++) {
    state.setHand(hand.slot ?? 1, true, hand.x, hand.y, hand.size ?? 0.2, hand.roll ?? 0);
    run(state, 1 / 24);
  }
}

describe('GlobeState: resting', () => {
  it('starts free in the middle at its default size, turning idly', () => {
    const state = new GlobeState();
    run(state, 0.5);
    expect(state.mode).toBe('free');
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.radius).toBeCloseTo(GLOBE_RADIUS_DEFAULT);
    expect(state.dYaw).toBeCloseTo(state.spinSpeed / 60, 4);
    expect(state.dPitch).toBeCloseTo(0);
  });
});

describe('GlobeState: one hand', () => {
  it('rides just above an upright palm', () => {
    const state = new GlobeState();
    state.setAspect(16 / 9);
    hold(state, 1, { x: 0.3, y: -0.4 });
    expect(state.mode).toBe('held');
    expect(state.x).toBeCloseTo(0.3, 2);
    // Above the palm by more than its own radius, less than a third of the screen.
    expect(state.y).toBeGreaterThan(-0.4 + state.radius * 2 * 0.5);
    expect(state.y).toBeLessThan(-0.4 + 0.7);
    expect(state.held).toBeGreaterThan(0.9);
  });

  it('leans the way the fingers point', () => {
    const upright = new GlobeState();
    const tilted = new GlobeState();
    hold(upright, 1, { x: 0, y: 0, roll: 0 });
    hold(tilted, 1, { x: 0, y: 0, roll: Math.PI / 2 });
    expect(upright.x).toBeCloseTo(0, 2);
    expect(tilted.x).toBeGreaterThan(0.2); // clockwise quarter turn: fingers point right
    expect(tilted.y).toBeCloseTo(0, 2);
  });

  it('sits under the cursor for a mouse, which has no size', () => {
    const state = new GlobeState();
    hold(state, 1, { x: -0.5, y: 0.25, size: 0 });
    expect(state.x).toBeCloseTo(-0.5, 2);
    expect(state.y).toBeCloseTo(0.25, 2);
  });

  it('grows as the hand comes nearer and shrinks as it backs away', () => {
    const state = new GlobeState();
    hold(state, 0.5, { x: 0, y: 0, size: 0.2 });
    const resting = state.radius;
    hold(state, 1, { x: 0, y: 0, size: 0.32 });
    expect(state.radius).toBeGreaterThan(resting * 1.15);
    hold(state, 1, { x: 0, y: 0, size: 0.12 });
    expect(state.radius).toBeLessThan(resting * 0.9);
  });

  it('stays where it was left, at the size it was, when the hand goes', () => {
    const state = new GlobeState();
    hold(state, 1, { x: 0.4, y: 0.1 });
    const { x, y } = state;
    state.setHand(1, false);
    run(state, 2);
    expect(state.mode).toBe('free');
    expect(state.x).toBeCloseTo(x, 2);
    expect(state.y).toBeCloseTo(y, 2);
    expect(state.radius).toBeCloseTo(GLOBE_RADIUS_DEFAULT, 3);
    expect(state.held).toBeLessThan(0.05);
  });

  it('runs a little ahead of a moving hand between reports, but not far', () => {
    const state = new GlobeState({ follow: 60 });
    // A mouse-sized hand moving right at 1.2 units a second.
    for (let i = 0; i < 24; i++) {
      state.setHand(1, true, -0.6 + (i / 24) * 1.2, 0, 0);
      run(state, 1 / 24);
    }
    const lastReported = -0.6 + (23 / 24) * 1.2;
    expect(state.x).toBeGreaterThan(lastReported);
    run(state, 1); // the reports stop
    expect(state.x).toBeLessThan(lastReported + 1.2 * 0.1);
  });

  it('passes to the other hand when the holding hand leaves', () => {
    const state = new GlobeState();
    hold(state, 0.5, { slot: 0, x: -0.5, y: 0, size: 0 });
    state.setHand(1, true, 0.5, 0, 0);
    run(state, 0.5);
    expect(state.x).toBeCloseTo(-0.5, 1); // the first hand keeps it
    state.setHand(0, false);
    hold(state, 1, { slot: 1, x: 0.5, y: 0, size: 0 });
    expect(state.x).toBeCloseTo(0.5, 2);
  });
});

describe('GlobeState: two hands', () => {
  it('sits between the palms and fills the gap', () => {
    const state = new GlobeState();
    hold(state, 0.4, { x: 0.3, y: 0 });
    state.setSpan(true, 0, 0.1, 0.6);
    run(state, 1);
    expect(state.mode).toBe('stretched');
    expect(state.x).toBeCloseTo(0, 2);
    expect(state.y).toBeCloseTo(0.1, 2);
    expect(state.radius).toBeGreaterThan(0.6 * 0.3);
    expect(state.radius).toBeLessThan(0.6 * 0.5); // never wider than the gap
  });

  it('grows and shrinks with the gap', () => {
    const state = new GlobeState();
    state.setSpan(true, 0, 0, 0.4);
    run(state, 1);
    const small = state.radius;
    state.setSpan(true, 0, 0, 0.8);
    run(state, 1);
    expect(state.radius).toBeCloseTo(small * 2, 2);
    state.setSpan(true, 0, 0, 0.2);
    run(state, 1);
    expect(state.radius).toBeCloseTo(small / 2, 2);
  });

  it('keeps the size the hands made after they let go', () => {
    const state = new GlobeState();
    state.setSpan(true, 0, 0, 0.8);
    run(state, 1);
    const made = state.radius;
    state.setSpan(false);
    run(state, 2);
    expect(state.mode).toBe('free');
    expect(state.radius).toBeCloseTo(made, 3);
    expect(state.baseRadius).toBeCloseTo(made, 3);
  });

  it('never leaves the allowed size range', () => {
    const state = new GlobeState();
    state.setSpan(true, 0, 0, 5);
    run(state, 2);
    expect(state.radius).toBeLessThanOrEqual(GLOBE_RADIUS_MAX + 1e-6);
    state.setSpan(true, 0, 0, 0.001);
    run(state, 2);
    expect(state.radius).toBeGreaterThanOrEqual(GLOBE_RADIUS_MIN - 1e-6);
  });

  it('resizes in place from a mouse wheel, which has no gap', () => {
    const state = new GlobeState();
    hold(state, 0.5, { x: 0.4, y: 0.2, size: 0 });
    for (let i = 0; i < 5; i++) state.setSpan(true, 0, 0, 0, 1.1);
    run(state, 1);
    expect(state.radius).toBeCloseTo(GLOBE_RADIUS_DEFAULT * 1.1 ** 5, 3);
    expect(state.x).toBeCloseTo(0.4, 2); // still under the cursor, not at the span's position
    state.setSpan(false);
    run(state, 1);
    expect(state.radius).toBeCloseTo(GLOBE_RADIUS_DEFAULT * 1.1 ** 5, 3);
  });
});

describe('GlobeState: pinch to spin', () => {
  it('stays put while pinched and turns with the hand', () => {
    const state = new GlobeState({ spinSpeed: 0 });
    state.setAspect(1);
    hold(state, 0.5, { x: 0, y: 0, size: 0 });
    state.grab(1, true);
    state.setHand(1, true, 0.5, 0.3, 0);
    state.grab(1, true, 0.1, 0);
    state.update(1 / 60);
    expect(state.x).toBeCloseTo(0, 2);
    expect(state.y).toBeCloseTo(0, 2);
    // Moving the hand right by a tenth of the half-width turns the near side to the right.
    expect(state.dYaw).toBeCloseTo(0.1 / 2 / state.radius, 3);
    expect(state.dPitch).toBeCloseTo(0);
    state.grab(1, true, 0, 0.1);
    state.update(1 / 60);
    expect(state.dPitch).toBeLessThan(0); // moving up tips the near side up
  });

  it('keeps turning after release and eases back to its idle spin', () => {
    const state = new GlobeState({ spinSpeed: 0.2 });
    state.grab(1, true);
    for (let i = 0; i < 10; i++) {
      state.grab(1, true, 0.03, 0);
      state.update(1 / 60);
    }
    state.grab(1, false);
    state.update(1 / 60);
    const flung = state.dYaw * 60;
    expect(flung).toBeGreaterThan(1);
    run(state, 6);
    expect(state.dYaw * 60).toBeCloseTo(0.2, 1);
  });

  it('does not fling when the hand stops before letting go', () => {
    const state = new GlobeState({ spinSpeed: 0 });
    state.grab(1, true);
    for (let i = 0; i < 10; i++) {
      state.grab(1, true, 0.03, 0);
      state.update(1 / 60);
    }
    run(state, 0.3); // still pinched, hand at rest
    state.grab(1, false);
    state.update(1 / 60);
    expect(Math.abs(state.dYaw)).toBeLessThan(1e-3);
  });

  it('twists with the wrist', () => {
    const state = new GlobeState({ spinSpeed: 0 });
    state.grab(1, true, 0, 0, 0.2);
    state.update(1 / 60);
    expect(state.dRoll).toBeCloseTo(-0.2); // clockwise on screen is negative about the view axis
  });

  it('lets go if the hand disappears mid-pinch', () => {
    const state = new GlobeState();
    state.setHand(1, true, 0, 0, 0);
    state.grab(1, true);
    expect(state.grabbing).toBe(true);
    state.setHand(1, false);
    expect(state.grabbing).toBe(false);
  });
});

describe('GlobeState: fist, palm and reset', () => {
  it('folds up in a fist and opens again', () => {
    const state = new GlobeState();
    state.setCollapsing(0, true);
    run(state, 1);
    expect(state.collapse).toBeGreaterThan(0.95);
    state.setCollapsing(0, false);
    run(state, 1);
    expect(state.collapse).toBeLessThan(0.05);
  });

  it('pulses once and fades', () => {
    const state = new GlobeState();
    state.firePulse();
    expect(state.pulse).toBe(1);
    run(state, 0.3);
    expect(state.pulse).toBeGreaterThan(0.3);
    expect(state.pulse).toBeLessThan(1);
    run(state, 1);
    expect(state.pulse).toBe(0);
  });

  it('takes a size from the controls and keeps it within range', () => {
    const state = new GlobeState();
    state.setBaseRadius(0.3);
    run(state, 1);
    expect(state.radius).toBeCloseTo(0.3, 3);
    state.setBaseRadius(99);
    expect(state.baseRadius).toBe(GLOBE_RADIUS_MAX);
  });

  it('returns to the middle at the default size on reset', () => {
    const state = new GlobeState();
    hold(state, 0.5, { x: 0.6, y: 0.4 });
    state.setSpan(true, 0.2, 0.2, 0.9);
    state.setCollapsing(1, true);
    run(state, 0.5);
    state.reset();
    run(state, 0.1);
    expect(state.mode).toBe('free');
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.radius).toBeCloseTo(GLOBE_RADIUS_DEFAULT);
    expect(state.collapse).toBe(0);
  });
});

describe('hologram scan', () => {
  it('glitches rarely, briefly and never past full strength', async () => {
    const { glitchAt } = await import('../../src/environments/globe/effects/scan');
    let active = 0;
    const samples = 6000; // one minute at 100 samples a second
    for (let i = 0; i < samples; i++) {
      const { amount, y } = glitchAt(i / 100);
      expect(amount).toBeGreaterThanOrEqual(0);
      expect(amount).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(1);
      if (amount > 0.05) active++;
    }
    // Present, but a small part of the time: between 2% and 15%.
    expect(active / samples).toBeGreaterThan(0.02);
    expect(active / samples).toBeLessThan(0.15);
  });

  it('starts and ends each glitch at nothing, so slices do not pop', async () => {
    const { glitchAt } = await import('../../src/environments/globe/effects/scan');
    for (let slot = 0; slot < 400; slot++) {
      expect(glitchAt(slot * 0.09 + 1e-6).amount).toBeLessThan(0.01);
      expect(glitchAt((slot + 1) * 0.09 - 1e-6).amount).toBeLessThan(0.01);
    }
  });

  it('is the same every time for the same moment', async () => {
    const { glitchAt, flickerAt } = await import('../../src/environments/globe/effects/scan');
    expect(glitchAt(12.345)).toEqual(glitchAt(12.345));
    expect(flickerAt(12.345)).toBe(flickerAt(12.345));
  });

  it('flickers a little and never brightens', async () => {
    const { flickerAt } = await import('../../src/environments/globe/effects/scan');
    let lowest = 1;
    for (let i = 0; i < 3000; i++) {
      const level = flickerAt(i / 100);
      expect(level).toBeLessThanOrEqual(1);
      lowest = Math.min(lowest, level);
    }
    expect(lowest).toBeGreaterThan(0.85);
    expect(lowest).toBeLessThan(0.95);
  });
});

describe('explode and reassemble', () => {
  it('leaves the globe whole at ordinary sizes and fully apart when stretched wide', async () => {
    const { explodeTarget, EXPLODE_START, EXPLODE_FULL } =
      await import('../../src/environments/globe/effects/explode');
    expect(explodeTarget(GLOBE_RADIUS_DEFAULT)).toBe(0);
    expect(explodeTarget(EXPLODE_START)).toBe(0);
    expect(explodeTarget((EXPLODE_START + EXPLODE_FULL) / 2)).toBeCloseTo(0.5);
    expect(explodeTarget(EXPLODE_FULL)).toBe(1);
    expect(explodeTarget(GLOBE_RADIUS_MAX)).toBe(1);
    // The hands can reach it: the largest globe is past the point of coming fully apart.
    expect(GLOBE_RADIUS_MAX).toBeGreaterThan(EXPLODE_FULL);
  });

  it('springs to its target with a small overshoot and settles', async () => {
    const { Spring } = await import('../../src/environments/globe/effects/explode');
    const spring = new Spring();
    let peak = 0;
    for (let i = 0; i < 180; i++) peak = Math.max(peak, spring.step(1, 1 / 60));
    expect(peak).toBeGreaterThan(1.01); // it overshoots: that is the snap
    expect(peak).toBeLessThan(1.35);
    expect(spring.value).toBeCloseTo(1, 2);
    for (let i = 0; i < 180; i++) spring.step(0, 1 / 60);
    expect(spring.value).toBeCloseTo(0, 2);
  });

  it('stays stable through a very slow frame', async () => {
    const { Spring } = await import('../../src/environments/globe/effects/explode');
    const spring = new Spring();
    for (let i = 0; i < 40; i++) spring.step(1, 0.5);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(spring.value).toBeCloseTo(1, 1);
  });
});

describe('energy and plasma', () => {
  it('reaches for fingertips near the globe, not inside it and not far away', async () => {
    const { arcReach } = await import('../../src/environments/globe/effects/plasma');
    expect(arcReach(0.3)).toBe(0); // a fingertip inside the globe
    expect(arcReach(1)).toBe(0); // touching the surface
    expect(arcReach(1.5)).toBe(1);
    expect(arcReach(2.2)).toBe(1);
    expect(arcReach(2.9)).toBeGreaterThan(0);
    expect(arcReach(2.9)).toBeLessThan(1);
    expect(arcReach(4)).toBe(0);
  });

  it('lays arcs out strand by strand, each a chain from the surface to the fingertip', async () => {
    const { buildArcAttributes } = await import('../../src/environments/globe/effects/plasma');
    const tips = 10;
    const strands = 2;
    const pieces = 14;
    const { arc, along, strand } = buildArcAttributes(tips, strands, pieces);
    expect(arc.length).toBe(tips * strands * pieces * 2);
    const perStrand = tips * pieces * 2;
    // The first part of the buffer is exactly the first strand, so low quality can draw just that.
    expect([...strand.subarray(0, perStrand)].every((s) => s === 0)).toBe(true);
    expect([...strand.subarray(perStrand)].every((s) => s === 1)).toBe(true);
    // Every arc starts on the surface, ends at the tip, and each piece starts where the last ended.
    for (let t = 0; t < tips; t++) {
      const first = t * pieces * 2;
      expect(arc[first]).toBe(t);
      expect(along[first]).toBe(0);
      expect(along[first + pieces * 2 - 1]).toBe(1);
      for (let piece = 1; piece < pieces; piece++) {
        expect(along[first + piece * 2]).toBe(along[first + piece * 2 - 1]);
      }
    }
  });
});

describe('orbiting rings and data', () => {
  it('reads the point facing the viewer from how the globe is turned', async () => {
    const { facingLatLon } = await import('../../src/environments/globe/geometry');
    const { Quaternion, Vector3 } = await import('three');
    const near = (a: { latitude: number; longitude: number }, lat: number, lon: number) => {
      expect(a.latitude).toBeCloseTo(lat, 4);
      expect(a.longitude).toBeCloseTo(lon, 4);
    };
    // Not turned: the prime meridian on the equator faces the viewer.
    near(facingLatLon(0, 0, 0, 1), 0, 0);
    // Spinning the globe eastward (the near side moves right) brings western longitudes round.
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    near(facingLatLon(yaw.x, yaw.y, yaw.z, yaw.w), 0, -90);
    // Tipping the top toward the viewer brings the north into view.
    const tip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 6);
    near(facingLatLon(tip.x, tip.y, tip.z, tip.w), 30, 0);
  });

  it('agrees with where the dots are: the facing point really is nearest the viewer', async () => {
    const { facingLatLon, latLonToUnit } = await import('../../src/environments/globe/geometry');
    const { Quaternion, Vector3, Euler } = await import('three');
    const q = new Quaternion().setFromEuler(new Euler(0.4, -1.1, 0.3));
    const { latitude, longitude } = facingLatLon(q.x, q.y, q.z, q.w);
    const point = new Float32Array(3);
    latLonToUnit(latitude, longitude, point, 0);
    const turned = new Vector3(point[0], point[1], point[2]).applyQuaternion(q);
    expect(turned.x).toBeCloseTo(0, 4);
    expect(turned.y).toBeCloseTo(0, 4);
    expect(turned.z).toBeCloseTo(1, 4);
  });

  it('writes the readout the way a navigator would', async () => {
    const { formatReadout } = await import('../../src/environments/globe/effects/rings');
    expect(formatReadout(12.34, 77.6, 0.14)).toEqual(['LAT 12.3° N', 'LON 077.6° E', 'SIZE 28%']);
    expect(formatReadout(-33.9, -151.2, 0.48)).toEqual(['LAT 33.9° S', 'LON 151.2° W', 'SIZE 96%']);
    expect(formatReadout(0, 0, 0.04)[0]).toBe('LAT 00.0° N');
  });

  it('stands the rings off further from a bigger globe, within limits', async () => {
    const { ringSpread } = await import('../../src/environments/globe/effects/rings');
    expect(ringSpread(GLOBE_RADIUS_MIN)).toBe(1);
    expect(ringSpread(GLOBE_RADIUS_DEFAULT)).toBe(1);
    expect(ringSpread(0.3)).toBeGreaterThan(1);
    expect(ringSpread(0.3)).toBeLessThan(ringSpread(GLOBE_RADIUS_MAX));
    expect(ringSpread(GLOBE_RADIUS_MAX)).toBeCloseTo(1.22);
  });

  it('draws a bezel of ticks with every sixth one longer', async () => {
    const { generateTicks } = await import('../../src/environments/globe/geometry');
    const ticks = generateTicks(72, 6, 1.09, 0.03, 0.075);
    expect(ticks.length).toBe(72 * 6);
    const length = (i: number) =>
      Math.hypot(ticks[i * 6 + 3] - ticks[i * 6], ticks[i * 6 + 4] - ticks[i * 6 + 1]);
    expect(length(0)).toBeCloseTo(0.075);
    expect(length(1)).toBeCloseTo(0.03);
    expect(length(6)).toBeCloseTo(0.075);
    expect(Math.hypot(ticks[0], ticks[1])).toBeCloseTo(1.09);
  });
});
