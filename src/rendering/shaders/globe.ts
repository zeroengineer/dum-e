// Holo Globe shaders. Everything that moves is driven by uniforms; no buffer is touched per frame.

/**
 * Hologram scan, shared by everything drawn on the sphere. `h` is how high a point is on the
 * globe as seen on screen (-1 bottom, 1 top), so the bands stay level however the globe turns.
 */
const SCAN = /* glsl */ `
uniform float uScan;
uniform float uScanTime;
uniform float uGlitch;
uniform float uGlitchY;
uniform float uFlicker;

float heightOnScreen(vec3 unitPosition) {
  return (modelViewMatrix * vec4(unitPosition, 0.0)).y / length(modelMatrix[0].xyz);
}

/** Brightness multiplier at height h. */
float scanLight(float h) {
  float bands = 0.5 + 0.5 * sin(h * 46.0 - uScanTime * 5.0);
  float sweepAt = fract(uScanTime * 0.22) * 2.6 - 1.3;
  float sweep = smoothstep(0.16, 0.0, abs(h - sweepAt));
  return (mix(1.0, 0.45 + 0.75 * bands, uScan) + sweep * uScan * 1.6) * uFlicker;
}

/** Sideways jump, in clip units, of the slice a glitch has hold of. */
float glitchShift(float h) {
  return smoothstep(0.12, 0.0, abs(h - uGlitchY)) * uGlitch * 0.06;
}
`;

/**
 * Explode: each dot belongs to one of four layers. Apart, two layers sink inside the sphere and
 * two rise outside it, neighbours turning opposite ways, with every dot bobbing a little.
 * The whole stays about the size of the globe, so it never leaves the picture or reaches the
 * viewer. uExplode is 0 for a sphere and 1 for fully apart.
 */
const EXPLODE = /* glsl */ `
uniform float uExplode;

vec3 explodeDot(vec3 unitPosition, vec4 seed, float time) {
  float layer = floor(seed.z * 4.0) - 1.5; // -1.5, -0.5, 0.5, 1.5
  float turn = uExplode * layer * (0.55 + time * 0.1);
  float c = cos(turn);
  float s = sin(turn);
  vec3 p = vec3(
    unitPosition.x * c + unitPosition.z * s,
    unitPosition.y,
    unitPosition.z * c - unitPosition.x * s
  );
  p *= 1.0 + uExplode * (layer * 0.2 + (seed.w - 0.5) * 0.07);
  p += (seed.yzw - 0.5) * uExplode * 0.09 * sin(time * 0.9 + seed.w * 6.2831853);
  return p;
}
`;

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
${FACING}${SCAN}${EXPLODE}
void main() {
  vec3 p = explodeDot(position, aSeed, uTime);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float h = heightOnScreen(p);
  gl_Position.x += glitchShift(h) * gl_Position.w;

  // The far side of the globe shows through, dimmer, as it would in a projection.
  float front = smoothstep(-0.2, 0.45, facingOf(normalize(p), mv));

  float land = aSeed.x;
  // With the map on, the sea keeps only a sprinkling of faint dots to suggest the sphere.
  // Blown apart, the whole sphere is shown: the sea's dots are part of the cloud.
  float keep = mix(1.0, step(aSeed.y, mix(0.22, 0.6, uExplode)), (1.0 - land) * uLand);
  float level = mix(0.5, mix(0.2, 1.0, land), uLand);
  float twinkle = 0.86 + 0.14 * sin(uTime * 2.1 + aSeed.w * 6.2831853);

  // Dots are sized against their own spacing, so the globe looks equally dense at any size.
  float radius = length(modelMatrix[0].xyz);
  float spacing = uSpacing * radius * projectionMatrix[1][1] / max(0.1, -mv.z) * uViewportHeight * 0.5;
  float size = uDot * spacing * (0.75 + 0.5 * aSeed.z) * mix(0.8, 1.0, land * uLand);
  gl_PointSize = clamp(size, 1.5, uMaxPointSize);

  vColor = mix(uColor, uAccent, land * uLand * 0.65) * level * twinkle * uBoost * scanLight(h);
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
varying float vScan;
uniform float uExplode;
${FACING}${SCAN}
void main() {
  // The grid swells a little and thins out as the dots leave it behind.
  vec4 mv = modelViewMatrix * vec4(position * (1.0 + uExplode * 0.12), 1.0);
  gl_Position = projectionMatrix * mv;
  float h = heightOnScreen(position);
  gl_Position.x += glitchShift(h) * gl_Position.w;
  vFront = smoothstep(-0.2, 0.45, facingOf(position, mv));
  vScan = scanLight(h);
}
`;

export const globeLinesFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uBoost;
uniform float uExplode;
varying float vFront;
varying float vScan;

void main() {
  gl_FragColor = vec4(uColor * uBoost * vScan, uOpacity * mix(0.14, 1.0, vFront) * (1.0 - uExplode * 0.75));
  #include <colorspace_fragment>
}
`;

export const globeShellVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying float vScan;
${SCAN}
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vScan = scanLight(heightOnScreen(position));
}
`;

export const globeShellFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uRim;
uniform float uFill;
uniform float uBoost;
uniform float uScan;
uniform float uExplode;
varying vec3 vNormal;
varying vec3 vView;
varying float vScan;

void main() {
  // Bright at the edge, nearly clear in the middle: a ball of light, not a solid.
  float fresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.6);
  // Scanning fills the body of the globe with fine raster lines, like a projected image.
  float raster = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.7);
  float fill = uFill * mix(1.0, 1.5 + 3.0 * raster, uScan);
  float strength = (fresnel * uRim + fill) * uBoost * vScan * (1.0 - uExplode * 0.85);
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

export const globePlasmaVertexShader = /* glsl */ `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vPosition = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
}
`;

export const globePlasmaFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform float uPulse;
uniform float uBoost;
uniform vec3 uColor;
uniform vec3 uAccent;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vView;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float amplitude = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 3; i++) {
    sum += amplitude * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  if (uStrength <= 0.0) discard;
  // One field of noise pushes another around, so the surface churns instead of sliding.
  vec3 p = vPosition * 2.4;
  float flow = fbm(p + vec3(0.0, uTime * 0.35, uTime * 0.2));
  float n = fbm(p * 1.3 + flow * 1.6 - vec3(uTime * 0.15));
  // Where the noise crosses its middle value there is a thin bright vein.
  float vein = pow(1.0 - abs(2.0 * n - 1.0), 7.0);
  float cloud = smoothstep(0.4, 0.85, n) * 0.3;
  float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 1.5);

  // A pulse is a ring of light running from the top of the globe to the bottom.
  float latitude = acos(clamp(normalize(vPosition).y, -1.0, 1.0)) / 3.14159265;
  float ripple = smoothstep(0.09, 0.0, abs(latitude - (1.0 - uPulse))) * uPulse * 2.2;

  float energy = (vein * 1.4 + cloud) * (0.4 + 0.95 * rim) + ripple;
  float strength = energy * uStrength * uBoost;
  gl_FragColor = vec4(mix(uColor, uAccent, clamp(vein * 0.75 + ripple * 0.5, 0.0, 1.0)) * strength, strength);
  #include <colorspace_fragment>
}
`;

/** Ten arcs: one per fingertip, from the nearest point of the globe's surface out to the tip. */
export const globeArcsVertexShader = /* glsl */ `
/** Fingertips relative to the globe's centre, in globe radii. */
uniform vec3 uTips[10];
uniform float uTipOn[10];
uniform float uTime;
uniform float uStrength;

attribute float aArc;
attribute float aAlong;
attribute float aStrand;

varying float vAlpha;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  int index = int(aArc + 0.5);
  vec3 tip = uTips[index];
  float distance = max(length(tip), 0.0001);
  vec3 outward = tip / distance;
  vec3 p = mix(outward, tip, aAlong);

  // Lightning is redrawn many times a second, each time with a new kink at every joint.
  vec3 side = normalize(cross(outward, vec3(0.0, 0.0, 1.0)) + vec3(0.0001));
  vec3 lift = cross(outward, side);
  float tick = floor(uTime * 16.0) + aStrand * 7.0;
  float kinkSide = hash(vec2(aArc * 3.7 + tick, aAlong * 31.0)) - 0.5;
  float kinkLift = hash(vec2(aArc * 5.3 + tick * 1.3, aAlong * 17.0)) - 0.5;
  float bow = sin(aAlong * 3.14159265);
  p += (side * kinkSide + lift * kinkLift) * bow * (0.05 + 0.09 * max(distance - 1.0, 0.0));

  // No arc to a fingertip inside the globe or too far to reach; arcs also come and go.
  float reach = smoothstep(1.03, 1.2, distance) * (1.0 - smoothstep(2.4, 3.4, distance));
  float alive = step(0.3, hash(vec2(aArc * 9.1 + aStrand, floor(uTime * 7.0))));
  vAlpha = uTipOn[index] * reach * alive * uStrength;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const globeArcsFragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  if (vAlpha <= 0.001) discard;
  gl_FragColor = vec4(uColor * 1.7, vAlpha);
  #include <colorspace_fragment>
}
`;

/** A ring in its own flat plane; the vertices only carry their angle around it. */
export const globeRingVertexShader = /* glsl */ `
uniform float uRadius;
attribute float aAngle;
varying float vTurn;

void main() {
  vTurn = aAngle / 6.2831853;
  vec3 p = vec3(cos(aAngle), 0.0, sin(aAngle)) * uRadius;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const globeRingFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSpeed;
uniform float uDashes;
uniform float uStrength;
varying float vTurn;

void main() {
  // Dashes creep round the ring; a bright head with a fading tail laps it.
  float dash = step(0.38, fract(vTurn * uDashes - uTime * uSpeed * 0.35));
  float head = pow(fract(vTurn - uTime * uSpeed * 0.07), 7.0);
  float strength = (0.34 * dash + head * 0.95) * uStrength;
  gl_FragColor = vec4(uColor * (0.8 + head * 1.2), strength);
  #include <colorspace_fragment>
}
`;

/** Satellites ride a ring; each is only a starting place round it and derives the rest. */
export const globeSatelliteVertexShader = /* glsl */ `
uniform float uRadius;
uniform float uTime;
uniform float uSpeed;
uniform float uSize;
attribute float aPhase;

void main() {
  float pace = 0.6 + 0.8 * fract(aPhase * 7.31);
  float angle = aPhase * 6.2831853 + uTime * uSpeed * pace;
  vec3 p = vec3(cos(angle), 0.0, sin(angle)) * uRadius;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + 0.7 * fract(aPhase * 3.17));
}
`;

export const globeSatelliteFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - d;
  gl_FragColor = vec4(uColor * (0.7 + core), pow(core, 1.4) * uStrength);
  #include <colorspace_fragment>
}
`;

/** Plain lines of one colour, for tick marks and leader lines. */
export const globeFlatVertexShader = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const globeFlatFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;

void main() {
  gl_FragColor = vec4(uColor, uStrength);
  #include <colorspace_fragment>
}
`;
