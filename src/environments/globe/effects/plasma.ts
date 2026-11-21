import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  Mesh,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three';
import type { QualityLevel } from '../../../core/scene/Environment';
import {
  createGlobeArcsMaterial,
  createGlobePlasmaMaterial,
} from '../../../rendering/materials/globeMaterial';
import { smoothstep } from '../../../utils/math';
import type { GlobeEffect, GlobeFrame, GlobeParts } from './types';

const TIPS = 10;
/** Each arc is drawn as this many strands, each a chain of this many pieces. */
const STRANDS = 2;
const PIECES = 14;

/**
 * How strongly an arc reaches a fingertip `distance` globe radii from the centre: nothing while
 * the tip is inside or touching the globe, full strength a little way out, fading with distance.
 * The arc shader applies the same rule.
 */
export function arcReach(distance: number): number {
  return smoothstep(1.03, 1.2, distance) * (1 - smoothstep(2.4, 3.4, distance));
}

/** Arc geometry: per vertex, which fingertip, how far along (0 surface, 1 tip) and which strand. */
export function buildArcAttributes(
  tips: number,
  strands: number,
  pieces: number,
): { arc: Float32Array; along: Float32Array; strand: Float32Array } {
  const vertices = tips * strands * pieces * 2;
  const arc = new Float32Array(vertices);
  const along = new Float32Array(vertices);
  const strand = new Float32Array(vertices);
  let v = 0;
  // Strand by strand, so drawing only the first part of the buffer drops whole strands.
  for (let s = 0; s < strands; s++) {
    for (let t = 0; t < tips; t++) {
      for (let piece = 0; piece < pieces; piece++) {
        for (const end of [piece, piece + 1]) {
          arc[v] = t;
          along[v] = end / pieces;
          strand[v] = s;
          v++;
        }
      }
    }
  }
  return { arc, along, strand };
}

/**
 * Energy and plasma: a churning skin of light over the globe, a ring that runs down it when an
 * open palm pulses, and arcs that jump between its surface and any fingertip near it.
 */
export function createPlasmaEffect(parts: GlobeParts): GlobeEffect {
  const plasmaMaterial = parts.resources.track(createGlobePlasmaMaterial());
  // Just outside the globe's own rim so the two do not fight.
  const plasma = new Mesh(parts.resources.track(new SphereGeometry(1.025, 48, 32)), plasmaMaterial);
  plasma.frustumCulled = false;
  plasma.renderOrder = 5;
  plasma.visible = false;
  parts.turning.add(plasma);

  const attributes = buildArcAttributes(TIPS, STRANDS, PIECES);
  const arcGeometry = parts.resources.track(new BufferGeometry());
  // The shader places every vertex; position only has to exist.
  arcGeometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(attributes.arc.length * 3), 3),
  );
  arcGeometry.setAttribute('aArc', new BufferAttribute(attributes.arc, 1));
  arcGeometry.setAttribute('aAlong', new BufferAttribute(attributes.along, 1));
  arcGeometry.setAttribute('aStrand', new BufferAttribute(attributes.strand, 1));
  arcGeometry.boundingSphere = new Sphere(new Vector3(), 4);
  const arcMaterial = parts.resources.track(createGlobeArcsMaterial(TIPS));
  const arcs = new LineSegments(arcGeometry, arcMaterial);
  arcs.frustumCulled = false;
  arcs.renderOrder = 6;
  arcs.visible = false;
  parts.fixed.add(arcs);

  const perStrand = TIPS * PIECES * 2;
  const setQuality = (quality: QualityLevel): void => {
    arcGeometry.setDrawRange(0, quality === 'low' ? perStrand : perStrand * STRANDS);
  };
  setQuality(parts.quality);

  let reaching = 0;
  const tint = new Color();

  return {
    setQuality,
    setColour(main: string, accent: string): void {
      (plasmaMaterial.uniforms.uColor.value as Color).set(main);
      (plasmaMaterial.uniforms.uAccent.value as Color).set(accent);
      // Arcs are hotter than the globe but still its colour.
      (arcMaterial.uniforms.uColor.value as Color).set(main).lerp(tint.set(accent), 0.45);
    },
    update(frame: GlobeFrame): void {
      const on = frame.strength > 0;
      plasma.visible = on;
      arcs.visible = on;
      reaching = 0;
      if (!on) return;

      const p = plasmaMaterial.uniforms;
      p.uTime.value = frame.time;
      p.uStrength.value = frame.strength;
      p.uPulse.value = frame.state.pulse;
      p.uBoost.value = 0.75 + 0.35 * frame.state.held + frame.state.collapse * 1.2;

      const a = arcMaterial.uniforms;
      a.uTime.value = frame.time;
      a.uStrength.value = frame.strength;
      const tips = a.uTips.value as Vector3[];
      const tipOn = a.uTipOn.value as number[];
      const radius = Math.max(frame.radius, 1e-4);
      for (let i = 0; i < TIPS; i++) {
        tipOn[i] = frame.tipsPresent[i] ? 1 : 0;
        if (!frame.tipsPresent[i]) continue;
        tips[i].copy(frame.tips[i]).divideScalar(radius);
        if (arcReach(tips[i].length()) > 0.5) reaching++;
      }
    },
    inspect: () => ({ arcs: reaching }),
  };
}
