import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import { galaxyFragmentShader, galaxyVertexShader } from '../shaders/galaxy';

export interface GalaxyMaterialOptions {
  pixelRatio: number;
  maxPointSize: number;
}

export function createGalaxyMaterial(options: GalaxyMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: galaxyVertexShader,
    fragmentShader: galaxyFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uExpand: { value: 1 },
      uReveal: { value: 0 },
      uSize: { value: 2.2 },
      uPixelRatio: { value: options.pixelRatio },
      uMaxPointSize: { value: options.maxPointSize },
      uOpacity: { value: 0.6 },
      uCoreColor: { value: new Color('#ffe2a8') },
      uArmColor: { value: new Color('#7fb4ff') },
      uAccentColor: { value: new Color('#ff7bd5') },
    },
  });
}
