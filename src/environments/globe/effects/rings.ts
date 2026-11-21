import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  LineLoop,
  LineSegments,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  SRGBColorSpace,
  Sphere,
  Vector3,
} from 'three';
import type { ShaderMaterial, WebGLRenderer, Color } from 'three';
import type { QualityLevel } from '../../../core/scene/Environment';
import {
  createGlobeFlatMaterial,
  createGlobeRingMaterial,
  createGlobeSatelliteMaterial,
} from '../../../rendering/materials/globeMaterial';
import { smoothstep } from '../../../utils/math';
import { facingLatLon, generateTicks } from '../geometry';
import { GLOBE_RADIUS_DEFAULT, GLOBE_RADIUS_MAX } from '../globeState';
import type { GlobeEffect, GlobeFrame, GlobeParts } from './types';

/** Radius in globe radii, tilt of the ring's plane, speed and dash count. */
const RINGS = [
  { radius: 1.28, tiltX: 1.25, tiltZ: 0.2, speed: 1.0, dashes: 48, satellites: 5 },
  { radius: 1.5, tiltX: 0.95, tiltZ: -0.55, speed: -0.7, dashes: 36, satellites: 4 },
  { radius: 1.74, tiltX: 1.42, tiltZ: 0.75, speed: 0.5, dashes: 60, satellites: 6 },
] as const;

const RING_SEGMENTS = 160;
const LABEL_WIDTH = 512;
const LABEL_HEIGHT = 160;

/** Rings stand off further from a bigger globe: 1 at the default size, up to this when largest. */
const SPREAD_MAX = 1.22;

export function ringSpread(radius: number): number {
  return 1 + (SPREAD_MAX - 1) * smoothstep(GLOBE_RADIUS_DEFAULT, GLOBE_RADIUS_MAX, radius);
}

/** The three lines of the readout: where the globe faces and how big it is on screen. */
export function formatReadout(latitude: number, longitude: number, radius: number): string[] {
  const lat = Math.abs(latitude).toFixed(1).padStart(4, '0');
  const lon = Math.abs(longitude).toFixed(1).padStart(5, '0');
  return [
    `LAT ${lat}° ${latitude >= 0 ? 'N' : 'S'}`,
    `LON ${lon}° ${longitude >= 0 ? 'E' : 'W'}`,
    `SIZE ${Math.round(radius * 200)}%`,
  ];
}

/**
 * Orbiting rings and data: three tilted rings with satellites riding them, a bezel of tick marks
 * facing the viewer, and a readout of the latitude and longitude facing the viewer and the
 * globe's size. The numbers are real: they come from the globe's orientation and size.
 */
export function createRingsEffect(parts: GlobeParts): GlobeEffect {
  const root = new Group();
  root.visible = false;
  parts.fixed.add(root);

  const angles = new Float32Array(RING_SEGMENTS);
  for (let i = 0; i < RING_SEGMENTS; i++) angles[i] = (i / RING_SEGMENTS) * Math.PI * 2;
  const ringGeometry = parts.resources.track(new BufferGeometry());
  ringGeometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(RING_SEGMENTS * 3), 3),
  );
  ringGeometry.setAttribute('aAngle', new BufferAttribute(angles, 1));
  ringGeometry.boundingSphere = new Sphere(new Vector3(), 3);

  const strengthMaterials: ShaderMaterial[] = [];
  const timeMaterials: ShaderMaterial[] = [];
  const mainMaterials: ShaderMaterial[] = [];
  const accentMaterials: ShaderMaterial[] = [];
  const satelliteSets: Array<{ points: Points<BufferGeometry, ShaderMaterial>; count: number }> =
    [];
  const orbits: Group[] = [];
  let pixelRatio = 1;

  RINGS.forEach((ring, index) => {
    const orbit = new Group();
    orbit.rotation.set(ring.tiltX, 0, ring.tiltZ);
    orbits.push(orbit);

    const ringMaterial = parts.resources.track(
      createGlobeRingMaterial(ring.radius, ring.speed, ring.dashes),
    );
    const loop = new LineLoop(ringGeometry, ringMaterial);
    loop.frustumCulled = false;
    loop.renderOrder = 7;

    const phases = new Float32Array(ring.satellites);
    for (let i = 0; i < ring.satellites; i++) phases[i] = (i + index * 0.37) / ring.satellites;
    const satelliteGeometry = parts.resources.track(new BufferGeometry());
    satelliteGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(ring.satellites * 3), 3),
    );
    satelliteGeometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
    satelliteGeometry.boundingSphere = new Sphere(new Vector3(), 3);
    const satelliteMaterial = parts.resources.track(
      createGlobeSatelliteMaterial(ring.radius, ring.speed),
    );
    const points = new Points(satelliteGeometry, satelliteMaterial);
    points.frustumCulled = false;
    points.renderOrder = 8;
    // Satellites are a fixed size on screen, so they need the screen's pixel ratio.
    points.onBeforeRender = (renderer: WebGLRenderer) => {
      pixelRatio = renderer.getPixelRatio();
    };
    satelliteSets.push({ points, count: ring.satellites });

    orbit.add(loop, points);
    root.add(orbit);
    strengthMaterials.push(ringMaterial, satelliteMaterial);
    timeMaterials.push(ringMaterial, satelliteMaterial);
    mainMaterials.push(ringMaterial);
    accentMaterials.push(satelliteMaterial);
  });

  // The bezel: tick marks facing the viewer, turning slowly against the globe.
  const tickGeometry = parts.resources.track(new BufferGeometry());
  tickGeometry.setAttribute(
    'position',
    new BufferAttribute(generateTicks(72, 6, 1.09, 0.03, 0.075), 3),
  );
  const tickMaterial = parts.resources.track(createGlobeFlatMaterial());
  const ticks = new LineSegments(tickGeometry, tickMaterial);
  ticks.frustumCulled = false;
  ticks.renderOrder = 7;
  root.add(ticks);
  mainMaterials.push(tickMaterial);

  // The readout, with a leader line from the globe's edge.
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const context = canvas.getContext('2d');
  const texture = parts.resources.track(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  const labelMaterial = parts.resources.track(
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    }),
  );
  const labelHeight = 0.46;
  const label = new Mesh(
    parts.resources.track(
      new PlaneGeometry((labelHeight * LABEL_WIDTH) / LABEL_HEIGHT, labelHeight),
    ),
    labelMaterial,
  );
  label.frustumCulled = false;
  label.renderOrder = 9;
  root.add(label);

  const leaderGeometry = parts.resources.track(new BufferGeometry());
  const leaderPositions = new BufferAttribute(new Float32Array(12), 3);
  leaderGeometry.setAttribute('position', leaderPositions);
  const leaderMaterial = parts.resources.track(createGlobeFlatMaterial());
  const leader = new LineSegments(leaderGeometry, leaderMaterial);
  leader.frustumCulled = false;
  leader.renderOrder = 7;
  root.add(leader);
  accentMaterials.push(leaderMaterial);

  let accentColour = '#ffffff';
  let shown = '';
  let sinceText = 1;

  const drawLabel = (lines: string[]): void => {
    if (!context) return;
    context.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    context.fillStyle = accentColour;
    context.textBaseline = 'middle';
    context.font = `500 40px 'Instrument Sans', system-ui, sans-serif`;
    lines.forEach((line, i) => context.fillText(line, 8, 30 + i * 50));
    texture.needsUpdate = true;
  };

  const setQuality = (quality: QualityLevel): void => {
    for (const set of satelliteSets) {
      set.points.geometry.setDrawRange(0, quality === 'low' ? Math.ceil(set.count / 2) : set.count);
    }
  };
  setQuality(parts.quality);

  return {
    setQuality,
    setColour(main: string, accent: string): void {
      for (const material of mainMaterials) (material.uniforms.uColor.value as Color).set(main);
      for (const material of accentMaterials) (material.uniforms.uColor.value as Color).set(accent);
      accentColour = accent;
      shown = ''; // redraw the readout in the new colour
    },
    update(frame: GlobeFrame): void {
      root.visible = frame.strength > 0;
      if (!root.visible) return;

      const spread = ringSpread(frame.state.radius);
      // Folded up in a fist, everything draws in with the globe.
      const fold = 1 - frame.state.collapse;
      for (const material of strengthMaterials)
        material.uniforms.uStrength.value = frame.strength * fold;
      for (const material of timeMaterials) material.uniforms.uTime.value = frame.time;
      tickMaterial.uniforms.uStrength.value = 0.55 * frame.strength * fold;
      leaderMaterial.uniforms.uStrength.value = 0.6 * frame.strength * fold;
      labelMaterial.opacity = frame.strength * fold;

      orbits.forEach((orbit, i) => {
        orbit.scale.setScalar(spread);
        // Each ring's plane swings slowly round, so the three never settle into one pattern.
        orbit.rotation.y = frame.time * 0.12 * (i % 2 === 0 ? 1 : -1) + i * 2.1;
      });
      for (const set of satelliteSets) set.points.material.uniforms.uSize.value = 7 * pixelRatio;
      ticks.rotation.z = -frame.time * 0.08;

      // The readout sits up and to the right, beyond the outermost ring.
      const reach = RINGS[2].radius * spread;
      const lx = reach * 0.86 + 0.75;
      const ly = reach * 0.5;
      label.position.set(lx + 0.05, ly, 0);
      const edge = Math.SQRT1_2 * 1.02;
      const elbowX = lx - 0.72;
      leaderPositions.set([
        edge,
        edge,
        0,
        elbowX - 0.12,
        ly,
        0,
        elbowX - 0.12,
        ly,
        0,
        elbowX,
        ly,
        0,
      ]);
      leaderPositions.needsUpdate = true;

      // Text is expensive to redraw; a few times a second is as fast as anyone can read it.
      sinceText += frame.dt;
      if (sinceText < 0.2) return;
      sinceText = 0;
      const q = frame.orientation;
      const facing = facingLatLon(q.x, q.y, q.z, q.w);
      const lines = formatReadout(facing.latitude, facing.longitude, frame.state.radius);
      const text = lines.join('|');
      if (text === shown) return;
      shown = text;
      drawLabel(lines);
    },
    inspect: () => ({ readout: shown }),
  };
}
