// Galaxy Explorer shaders. Stars are stored in polar form (radius, angle, height) and all orbital
// motion is derived from time in the vertex shader, so the CPU never touches the star buffers.

export const galaxyVertexShader = /* glsl */ `
uniform float uTime;
uniform float uExpand;
uniform float uReveal;
uniform float uSize;
uniform float uPixelRatio;
uniform float uMaxPointSize;
uniform vec3 uCoreColor;
uniform vec3 uArmColor;
uniform vec3 uAccentColor;

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float radius = position.x;
  float kind = aSeed.z;

  // Arm stars turn rigidly so the spiral keeps its shape. Bulge and disc stars orbit
  // differentially: the closer to the centre, the faster they go round.
  float patternSpeed = 0.11;
  float orbitSpeed = 0.42 / (0.35 + radius);
  float angle = position.y + uTime * mix(patternSpeed, orbitSpeed, kind);

  // Collapse into the core and spin up while a new configuration is swapped in.
  float reveal = uReveal * uReveal * (3.0 - 2.0 * uReveal);
  angle += (1.0 - reveal) * (2.5 + aSeed.w * 2.0);
  float r = radius * uExpand * mix(0.03, 1.0, reveal);

  // Expanding puffs the disc up a little; contracting flattens it.
  float lift = mix(1.0, uExpand, 0.6) * reveal;
  vec3 p = vec3(cos(angle) * r, position.z * lift, sin(angle) * r);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float twinkle = 0.85 + 0.15 * sin(uTime * 2.4 + aSeed.w * 6.2831853);
  // A few stars are much larger than the rest.
  float size = uSize * (0.45 + aSeed.x * aSeed.x * 1.6) * twinkle;
  gl_PointSize = min(size * uPixelRatio * (9.0 / max(0.1, -mv.z)), uMaxPointSize);

  vec3 color = mix(uCoreColor, uArmColor, smoothstep(0.05, 0.75, aSeed.y));
  // Scattered bright nebula-coloured stars along the arms.
  float accent = step(0.93, aSeed.w) * (1.0 - kind) * step(0.4, aSeed.y);
  color = mix(color, uAccentColor, accent * 0.85);
  // The bulge packs many stars into few pixels; dim them so additive blending does not clip to white.
  float crowding = mix(0.28, 1.0, smoothstep(0.0, 0.4, aSeed.y));
  vColor = color * (0.6 + 0.8 * aSeed.x) * crowding;
  vAlpha = reveal;
}
`;

export const galaxyFragmentShader = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - d;
  float alpha = pow(core, 1.9) * uOpacity * vAlpha;
  gl_FragColor = vec4(vColor * (0.6 + core * 0.9), alpha);
  #include <colorspace_fragment>
}
`;
