import { AdditiveBlending, Color, DoubleSide, FrontSide, ShaderMaterial } from 'three';
import {
  globeDotsFragmentShader,
  globeDotsVertexShader,
  globeHaloFragmentShader,
  globeHaloVertexShader,
  globeLinesFragmentShader,
  globeLinesVertexShader,
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
