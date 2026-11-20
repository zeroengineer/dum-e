import { AdditiveBlending, Color, ShaderMaterial, Vector3 } from 'three';
import { particleFragmentShader, particleVertexShader } from '../shaders/particles';

export interface ParticleMaterialOptions {
  pixelRatio: number;
  maxPointSize: number;
}

export function createParticleMaterial(options: ParticleMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 1 },
      uSize: { value: 3 },
      uScale: { value: 1 },
      uPixelRatio: { value: options.pixelRatio },
      uMaxPointSize: { value: options.maxPointSize },
      uWave: { value: 0 },
      uDrift: { value: 0.05 },
      uOpacity: { value: 0.6 },
      uColorA: { value: new Color('#3df5ff') },
      uColorB: { value: new Color('#7a5cff') },
      uHandPos: { value: [new Vector3(), new Vector3()] },
      uHandForce: { value: [0, 0] },
      uHandRadius: { value: 1.1 },
      uGrabCenter: { value: new Vector3() },
      uGrabOffset: { value: new Vector3() },
      uGrabRadius: { value: 0.95 },
    },
  });
}
