// Holo Globe shaders. Everything that moves is driven by uniforms; no buffer is touched per frame.

/** Shared by the dots and the grid: how squarely a point on the sphere faces the viewer. */
const FACING = /* glsl */ `
float facingOf(vec3 unitPosition, vec4 viewPosition) {
  vec3 viewNormal = normalize(normalMatrix * unitPosition);
  return dot(viewNormal, normalize(-viewPosition.xyz));
}
`;

export const globeDotsVertexShader = /* glsl */ `
uniform float uTime;
uniform float uDot;
uniform float uSpacing;
uniform float uViewportHeight;
uniform float uMaxPointSize;
uniform float uLand;
uniform float uBoost;
uniform vec3 uColor;
uniform vec3 uAccent;

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;
${FACING}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  // The far side of the globe shows through, dimmer, as it would in a projection.
  float front = smoothstep(-0.2, 0.45, facingOf(position, mv));

  float land = aSeed.x;
  // With the map on, the sea keeps only a sprinkling of faint dots to suggest the sphere.
  float keep = mix(1.0, step(aSeed.y, 0.22), (1.0 - land) * uLand);
  float level = mix(0.5, mix(0.2, 1.0, land), uLand);
  float twinkle = 0.86 + 0.14 * sin(uTime * 2.1 + aSeed.w * 6.2831853);

  // Dots are sized against their own spacing, so the globe looks equally dense at any size.
  float radius = length(modelMatrix[0].xyz);
  float spacing = uSpacing * radius * projectionMatrix[1][1] / max(0.1, -mv.z) * uViewportHeight * 0.5;
  float size = uDot * spacing * (0.75 + 0.5 * aSeed.z) * mix(0.8, 1.0, land * uLand);
  gl_PointSize = clamp(size, 1.5, uMaxPointSize);

  vColor = mix(uColor, uAccent, land * uLand * 0.65) * level * twinkle * uBoost;
  vAlpha = keep * mix(0.16, 1.0, front);
}
`;

export const globeDotsFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  float core = 1.0 - d;
  gl_FragColor = vec4(vColor * (0.55 + core * 0.9), pow(core, 1.6) * vAlpha);
  #include <colorspace_fragment>
}
`;

export const globeLinesVertexShader = /* glsl */ `
varying float vFront;
${FACING}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFront = smoothstep(-0.2, 0.45, facingOf(position, mv));
}
`;

export const globeLinesFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uBoost;
varying float vFront;

void main() {
  gl_FragColor = vec4(uColor * uBoost, uOpacity * mix(0.14, 1.0, vFront));
  #include <colorspace_fragment>
}
`;

export const globeShellVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
}
`;

export const globeShellFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uRim;
uniform float uFill;
uniform float uBoost;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  // Bright at the edge, nearly clear in the middle: a ball of light, not a solid.
  float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.6);
  float strength = (fresnel * uRim + uFill) * uBoost;
  gl_FragColor = vec4(uColor * strength, strength);
  #include <colorspace_fragment>
}
`;

export const globeHaloVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const globeHaloFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGlow;
uniform float uPulse;
/** The globe's edge, in the same units as the distance from the centre of this quad. */
uniform float uEdge;
varying vec2 vUv;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float soft = pow(1.0 - d, 2.2) * 0.55 * uGlow;
  // A pulse is a ring that leaves the surface and fades as it travels outward.
  float ringAt = mix(uEdge, 0.96, 1.0 - uPulse);
  float ring = smoothstep(0.07, 0.0, abs(d - ringAt)) * uPulse * 1.4;
  float strength = soft + ring;
  gl_FragColor = vec4(uColor * strength, strength);
  #include <colorspace_fragment>
}
`;

export const cameraBackdropVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const cameraBackdropFragmentShader = /* glsl */ `
uniform sampler2D uVideo;
/** Fraction of the picture visible along each axis when it covers the screen. */
uniform vec2 uVisible;
uniform float uDim;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  vec2 uv = vec2(0.5) + (vUv - 0.5) * uVisible;
  uv.x = 1.0 - uv.x; // a mirror, like every selfie view
  vec3 color = texture2D(uVideo, uv).rgb;

  // Dimming takes the room down and cools it slightly so projected light stands out.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, vec3(luma), uDim * 0.55);
  color = mix(color, color * uTint, uDim);
  color *= 1.0 - uDim * 0.75;
  float edge = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.5);
  color *= mix(1.0, edge, uDim * 0.8);

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;
