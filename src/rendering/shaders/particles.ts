// Particle Universe shaders. All per-particle motion happens here; the CPU only sets uniforms.

export const particleVertexShader = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform float uSize;
uniform float uScale;
uniform float uPixelRatio;
uniform float uMaxPointSize;
uniform float uWave;
uniform float uDrift;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uHandPos[2];
uniform float uHandForce[2];
uniform float uHandRadius;
uniform vec3 uGrabCenter;
uniform vec3 uGrabOffset;
uniform float uGrabRadius;

attribute vec3 aTarget;
attribute vec4 aRandom;

varying vec3 vColor;
varying float vGlow;

const float STAGGER = 0.6;

void main() {
  // Each particle starts its transition at a slightly different time.
  float t = clamp(uMorph * (1.0 + STAGGER) - aRandom.w * STAGGER, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(position, aTarget, t);
  // Bow outward mid-flight so shapes dissolve and re-form instead of sliding.
  p += (aRandom.xyz - 0.5) * sin(t * 3.14159265) * 1.3;

  float radial = length(p);
  p *= uScale;
  p.y += uWave * sin(p.x * 1.8 + uTime * 1.6) * cos(p.z * 1.4 + uTime * 1.1);

  vec3 phase = aRandom.xyz * 6.2831853;
  p += vec3(
    sin(uTime * 0.9 + phase.x),
    cos(uTime * 0.7 + phase.y),
    sin(uTime * 0.8 + phase.z)
  ) * uDrift * (0.4 + aRandom.w);

  // Grabbed group: particles near the grab point follow the hand, with a soft edge.
  vec3 gd = p - uGrabCenter;
  float grab = exp(-dot(gd, gd) / (uGrabRadius * uGrabRadius));
  p += uGrabOffset * grab;
  float energy = grab * min(length(uGrabOffset), 2.0) * 0.35;

  for (int i = 0; i < 2; i++) {
    float force = uHandForce[i];
    vec3 d = p - uHandPos[i];
    float dist = length(d) + 0.0001;
    float near = exp(-dist * dist / (uHandRadius * uHandRadius));
    float wide = exp(-dist * dist / (uHandRadius * uHandRadius * 5.0));
    float push = max(force, 0.0);
    float pull = clamp(-force, 0.0, 1.0);
    // Repel: shove outward. Attract: travel part of the way to the hand and swirl around it.
    p += (d / dist) * push * near * 1.5;
    p -= d * pull * wide * 0.82;
    p += cross(d, vec3(0.0, 0.0, 1.0)) * pull * wide * 0.35;
    energy += push * near + pull * wide * 0.6;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * (0.55 + aRandom.y * 0.9) * (1.0 + energy * 0.7);
  gl_PointSize = min(size * uPixelRatio * (7.0 / max(0.1, -mv.z)), uMaxPointSize);

  float blend = clamp(aRandom.x * 0.55 + (radial / 2.6) * 0.6, 0.0, 1.0);
  vColor = mix(uColorA, uColorB, blend) * (0.65 + 0.7 * aRandom.z);
  vGlow = energy;
}
`;

export const particleFragmentShader = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vGlow;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - d;
  float alpha = pow(core, 1.7) * uOpacity;
  vec3 color = vColor * (0.55 + core * 0.9) + vec3(vGlow * 0.18);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;
