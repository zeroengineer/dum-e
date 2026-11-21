import { AdditiveBlending, Color, DoubleSide, FrontSide, ShaderMaterial, Vector3 } from 'three';
import {
  globeArcsFragmentShader,
  globeArcsVertexShader,
  globeDotsFragmentShader,
  globeDotsVertexShader,
  globeFlatFragmentShader,
  globeFlatVertexShader,
  globeHaloFragmentShader,
  globeHaloVertexShader,
  globeLinesFragmentShader,
  globeLinesVertexShader,
  globePlasmaFragmentShader,
  globePlasmaVertexShader,
  globeRingFragmentShader,
  globeRingVertexShader,
  globeSatelliteFragmentShader,
  globeSatelliteVertexShader,
  globeShellFragmentShader,
  globeShellVertexShader,
} from '../shaders/globe';

/** Light added on top of whatever is behind it, never hiding it and never tone mapped. */
const LIGHT = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
  toneMapped: false,
} as const;

export function createGlobeDotsMaterial(maxPointSize: number): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    vertexShader: globeDotsVertexShader,
    fragmentShader: globeDotsFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uDot: { value: 0.85 },
      uSpacing: { value: 0.03 },
      uViewportHeight: { value: 800 },
      uMaxPointSize: { value: maxPointSize },
      uLand: { value: 1 },
      uBoost: { value: 1 },
      uColor: { value: new Color() },
      uAccent: { value: new Color() },
      uScan: { value: 0 },
      uScanTime: { value: 0 },
      uGlitch: { value: 0 },
      uGlitchY: { value: 0 },
      uFlicker: { value: 1 },
      uExplode: { value: 0 },
    },
  });
}

export function createGlobeLinesMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    vertexShader: globeLinesVertexShader,
    fragmentShader: globeLinesFragmentShader,
    uniforms: {
      uColor: { value: new Color() },
      uOpacity: { value: 0.25 },
      uBoost: { value: 1 },
      uScan: { value: 0 },
      uScanTime: { value: 0 },
      uGlitch: { value: 0 },
      uGlitchY: { value: 0 },
      uFlicker: { value: 1 },
      uExplode: { value: 0 },
    },
  });
}

export function createGlobeShellMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    side: FrontSide,
    vertexShader: globeShellVertexShader,
    fragmentShader: globeShellFragmentShader,
    uniforms: {
      uColor: { value: new Color() },
      uRim: { value: 0.85 },
      uFill: { value: 0.035 },
      uBoost: { value: 1 },
      uScan: { value: 0 },
      uScanTime: { value: 0 },
      uGlitch: { value: 0 },
      uGlitchY: { value: 0 },
      uFlicker: { value: 1 },
      uExplode: { value: 0 },
    },
  });
}

export function createGlobeHaloMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    side: DoubleSide,
    vertexShader: globeHaloVertexShader,
    fragmentShader: globeHaloFragmentShader,
    uniforms: {
      uColor: { value: new Color() },
      uGlow: { value: 1 },
      uPulse: { value: 0 },
      uEdge: { value: 0.35 },
    },
  });
}

export function createGlobePlasmaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    side: FrontSide,
    vertexShader: globePlasmaVertexShader,
    fragmentShader: globePlasmaFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uPulse: { value: 0 },
      uBoost: { value: 1 },
      uColor: { value: new Color() },
      uAccent: { value: new Color() },
    },
  });
}

/** `tips` is how many fingertips the arcs reach for; the shader is written for ten. */
export function createGlobeArcsMaterial(tips: number): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    vertexShader: globeArcsVertexShader,
    fragmentShader: globeArcsFragmentShader,
    uniforms: {
      uTips: { value: Array.from({ length: tips }, () => new Vector3()) },
      uTipOn: { value: new Array<number>(tips).fill(0) },
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uColor: { value: new Color() },
    },
  });
}

export function createGlobeRingMaterial(
  radius: number,
  speed: number,
  dashes: number,
): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    vertexShader: globeRingVertexShader,
    fragmentShader: globeRingFragmentShader,
    uniforms: {
      uRadius: { value: radius },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uDashes: { value: dashes },
      uStrength: { value: 0 },
      uColor: { value: new Color() },
    },
  });
}

export function createGlobeSatelliteMaterial(radius: number, speed: number): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    vertexShader: globeSatelliteVertexShader,
    fragmentShader: globeSatelliteFragmentShader,
    uniforms: {
      uRadius: { value: radius },
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uSize: { value: 8 },
      uStrength: { value: 0 },
      uColor: { value: new Color() },
    },
  });
}

export function createGlobeFlatMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    ...LIGHT,
    vertexShader: globeFlatVertexShader,
    fragmentShader: globeFlatFragmentShader,
    uniforms: {
      uStrength: { value: 0 },
      uColor: { value: new Color() },
    },
  });
}
