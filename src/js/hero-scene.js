// Interactive 3D Dubai Diorama Hero Scene (Three.js r160)
//
// Brings the vintage cartographic 3D Dubai relief diorama to life in real-time WebGL:
//  - Sculpted 3D relief diorama board on a bevelled sandstone & brushed-bronze drafting
//    table, textured with /assets/images/hero/dubai-diorama-map.jpg.
//  - Smooth, artifact-free 3D topographic elevation + pixel-level normal mapping derived
//    directly from the artwork luminance and landmark zones so every tower, island,
//    viaduct, and supercar catches directional golden-hour light without texture stretching.
//  - Custom GLSL shaders animate:
//      1. Turquoise Arabian Gulf, Palm Jumeirah lagoon, Burj Lake & Dubai Creek waves,
//         shimmering caustics, and shoreline foam ripples.
//      2. Synchronized Dubai Fountain water plumes & concentric lake ripples in Burj Lake.
//      3. Upward-travelling silver-gold LED facade ribbons on Burj Khalifa and twinkling
//         windows across the Downtown / Sheikh Zayed Road skyscraper cluster.
//      4. Metallic gold clearcoat sweeps across The Dubai Frame, the Compass Rose, and
//         the foreground Gold Lamborghini Aventador (with pulsing LED headlights).
//  - True 3D kinetic layers moving in 3D space above the relief board:
//      - Articulated miniature 3D Dubai Metro bullet train gliding smoothly along the
//        diagonal elevated viaduct.
//      - 3D dancing fountain spray particles in Burj Lake.
//      - Miniature 3D boulevard traffic cruising along the curved coastal road.
//      - Miniature 3D luxury yachts bobbing on the turquoise Arabian Gulf.
//      - Pulsing red aviation warning beacons on tower peaks & floating golden dust bokeh.

import * as THREE from '/assets/vendor/three.module.min.js';

const FOG_COLOR = new THREE.Color(0.96, 0.90, 0.80);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Board dimensions matching 682x1024 (2:3 aspect ratio)
const BOARD_W = 104;
const BOARD_H = 156;

// Smooth, continuous 3D relief heightfield (no steep cliffs that stretch pixels)
function reliefHeightJS(u, v) {
  const apron = (1.0 - v) * 5.0;
  // Gentle architectural mound under Downtown & Burj Khalifa
  const dt = Math.exp(-Math.pow((u - 0.58) / 0.22, 2.0) - Math.pow((v - 0.66) / 0.22, 2.0)) * 3.6;
  // Burj Khalifa vertical spine cushion
  const bk = Math.exp(-Math.pow((u - 0.548) / 0.065, 2.0) - Math.pow((v - 0.76) / 0.22, 2.0)) * 3.8;
  // Burj Al Arab island & sail cushion
  const baa = Math.exp(-Math.pow((u - 0.185) / 0.075, 2.0) - Math.pow((v - 0.62) / 0.14, 2.0)) * 2.4;
  // Palm Jumeirah & Atlantis cushion
  const palm = Math.exp(-Math.pow((u - 0.34) / 0.22, 2.0) - Math.pow((v - 0.78) / 0.09, 2.0)) * 1.5;
  // Dubai Frame cushion
  const frame = Math.exp(-Math.pow((u - 0.91) / 0.065, 2.0) - Math.pow((v - 0.75) / 0.08, 2.0)) * 2.2;
  // Gold Lamborghini cushion
  const lambo = Math.exp(-Math.pow((u - 0.795) / 0.085, 2.0) - Math.pow((v - 0.242) / 0.05, 2.0)) * 1.8;
  return apron + dt + bk + baa + palm + frame + lambo;
}

function uvToStage(u, v, zExtra = 0) {
  const x = (u - 0.5) * BOARD_W;
  const y = (v - 0.5) * BOARD_H;
  const z = reliefHeightJS(u, v) + zExtra;
  return new THREE.Vector3(x, y, z);
}

// ---- Sky & Warm Studio Backdrop Shaders ----
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    // Warm architectural parchment & champagne studio environment
    vec3 zenith = vec3(0.88, 0.80, 0.68);
    vec3 mid    = vec3(0.95, 0.89, 0.79);
    vec3 hor    = vec3(0.98, 0.94, 0.86);
    vec3 floorC = vec3(0.86, 0.78, 0.66);
    vec3 col = mix(hor, mid, smoothstep(-0.05, 0.38, y));
    col = mix(col, zenith, smoothstep(0.32, 0.85, y));
    col = mix(col, floorC, smoothstep(0.0, -0.48, y));

    vec3 sunDir = normalize(vec3(0.25, 0.32, -0.91));
    float sd = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.91, 0.70) * pow(sd, 5.0) * 0.22;

    vec2 cuv = d.xy * 2.0 + vec2(uTime * 0.012, 0.0);
    float c = vnoise(cuv * 2.5);
    col += vec3(0.03, 0.025, 0.015) * smoothstep(0.45, 0.8, c);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---- 3D Relief Diorama Shaders ----
const DIORAMA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vElev;

  float reliefAt(vec2 uv) {
    float u = uv.x;
    float v = uv.y;
    float apron = (1.0 - v) * 5.0;
    float dt = exp(-pow((u - 0.58) / 0.22, 2.0) - pow((v - 0.66) / 0.22, 2.0)) * 3.6;
    float bk = exp(-pow((u - 0.548) / 0.065, 2.0) - pow((v - 0.76) / 0.22, 2.0)) * 3.8;
    float baa = exp(-pow((u - 0.185) / 0.075, 2.0) - pow((v - 0.62) / 0.14, 2.0)) * 2.4;
    float palm = exp(-pow((u - 0.34) / 0.22, 2.0) - pow((v - 0.78) / 0.09, 2.0)) * 1.5;
    float frame = exp(-pow((u - 0.91) / 0.065, 2.0) - pow((v - 0.75) / 0.08, 2.0)) * 2.2;
    float lambo = exp(-pow((u - 0.795) / 0.085, 2.0) - pow((v - 0.242) / 0.05, 2.0)) * 1.8;
    return apron + dt + bk + baa + palm + frame + lambo;
  }

  void main() {
    vUv = uv;
    float eps = 0.008;
    float hC = reliefAt(uv);
    float hR = reliefAt(uv + vec2(eps, 0.0));
    float hU = reliefAt(uv + vec2(0.0, eps));
    vElev = hC - (1.0 - uv.y) * 5.0;

    vec3 displaced = position + vec3(0.0, 0.0, hC);
    vec3 tangX = normalize(vec3(eps * 104.0, 0.0, hR - hC));
    vec3 tangY = normalize(vec3(0.0, eps * 156.0, hU - hC));
    vec3 nLocal = normalize(cross(tangX, tangY));

    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * nLocal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const DIORAMA_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uTime;
  uniform vec2 uPointer;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vElev;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float sstep(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  void main() {
    vec2 uv = vUv;
    vec3 V = normalize(cameraPosition - vWorld);

    // Sample uploaded Dubai diorama artwork (with subtle depth-parallax UV offset on elevated landmarks!)
    vec2 parallaxUv = clamp(uv + uPointer * (vElev * 0.0014), 0.001, 0.999);
    vec3 texCol = texture2D(uMap, parallaxUv).rgb;

    // Derive fine micro-relief normal from texture luminance gradients so every carved street,
    // palm frond, facade mullion and compass line catches interactive 3D directional light!
    vec2 texel = vec2(1.0 / 682.0, 1.0 / 1024.0);
    float lC = dot(texCol, vec3(0.299, 0.587, 0.114));
    float lR = dot(texture2D(uMap, clamp(parallaxUv + vec2(texel.x, 0.0), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    float lU = dot(texture2D(uMap, clamp(parallaxUv + vec2(0.0, texel.y), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    vec3 microN = normalize(vNormalW + vec3((lC - lR) * 1.65, (lC - lU) * 1.65, 0.0));

    // Procedural parchment/lagoon fallback if texture is still decoding on frame 0
    vec3 procParchment = mix(vec3(0.90, 0.84, 0.73), vec3(0.80, 0.72, 0.60), sstep(0.15, 0.95, length(uv - 0.5)));
    float procGulf = sstep(0.55, 0.20, uv.x) * sstep(0.28, 0.42, uv.y) * sstep(0.88, 0.80, uv.y);
    vec3 fallbackCol = mix(procParchment, vec3(0.10, 0.44, 0.54), procGulf);
    vec3 col = mix(fallbackCol, texCol, uHasMap);

    // Detect turquoise water zones (Arabian Gulf, Palm Jumeirah lagoon, Burj Lake, Dubai Creek)
    float isBlueWater = sstep(0.015, 0.080, (col.b - col.r) + (col.g - col.r) * 0.65)
                      * sstep(0.20, 0.86, uv.y);

    // 1. Animated Turquoise Water Waves, Caustics & Pointer-Reactive Sun Glints
    if (isBlueWater > 0.01) {
      vec2 wuv = uv * vec2(46.0, 68.0);
      float w1 = vnoise(wuv + vec2(uTime * 0.48, -uTime * 0.30));
      float w2 = vnoise(wuv * 2.15 - vec2(uTime * 0.36, uTime * 0.54));
      float wave = (w1 + w2) * 0.5;
      float caustic = sstep(0.57, 0.78, wave);
      vec3 waterL = normalize(vec3(0.30 + uPointer.x * 0.28, 0.55 + uPointer.y * 0.22, 0.76));
      vec3 waveN = normalize(microN + vec3((w1 - 0.5) * 0.25, (w2 - 0.5) * 0.25, 0.0));
      float spec = pow(max(dot(reflect(-waterL, waveN), V), 0.0), 26.0);
      col += isBlueWater * (vec3(0.10, 0.30, 0.35) * (wave - 0.48) * 0.24
            + vec3(0.75, 0.96, 1.0) * caustic * 0.16
            + vec3(1.0, 0.94, 0.76) * spec * 0.40);
    }

    // 2. Animated Dubai Fountain Plumes & Concentric Ripples in Burj Lake
    vec2 f1 = (uv - vec2(0.425, 0.518)) * vec2(1.0, 1.5);
    vec2 f2 = (uv - vec2(0.515, 0.490)) * vec2(1.0, 1.5);
    float dF1 = length(f1);
    float dF2 = length(f2);
    float ring1 = sin(dF1 * 270.0 - uTime * 4.0) * exp(-dF1 * 30.0) * sstep(0.002, 0.012, dF1);
    float ring2 = sin(dF2 * 270.0 - uTime * 4.0 + 1.5) * exp(-dF2 * 34.0) * sstep(0.002, 0.012, dF2);
    col += vec3(0.72, 0.97, 1.0) * max(0.0, ring1 + ring2) * 0.34;

    float plumeMask1 = exp(-pow((uv.x - 0.423) / 0.035, 2.0) - pow((uv.y - 0.532) / 0.026, 2.0));
    float plumeMask2 = exp(-pow((uv.x - 0.515) / 0.024, 2.0) - pow((uv.y - 0.498) / 0.020, 2.0));
    float sprayPulse = 0.5 + 0.5 * sin(uv.x * 390.0 + uTime * 6.8) * sin(uv.y * 250.0 - uTime * 8.4);
    col += vec3(0.96, 0.99, 1.0) * (plumeMask1 + plumeMask2) * sprayPulse * 0.30;

    // 3. Burj Khalifa Animated LED Facade Ribbon & Spire Shimmer
    float bkShaft = exp(-pow((uv.x - mix(0.542, 0.554, clamp((uv.y - 0.55) / 0.42, 0.0, 1.0))) / 0.015, 2.0))
                  * sstep(0.56, 0.60, uv.y) * sstep(0.985, 0.93, uv.y);
    float bkPulse = pow(0.5 + 0.5 * sin(uv.y * 46.0 - uTime * 2.8), 4.0);
    col += vec3(1.0, 0.93, 0.74) * bkShaft * bkPulse * 0.28;

    // 4. Downtown Glass Skyscrapers Twinkling Windows
    float dtZone = sstep(0.61, 0.64, uv.x) * sstep(0.86, 0.82, uv.x)
                 * sstep(0.57, 0.61, uv.y) * sstep(0.87, 0.80, uv.y);
    if (dtZone > 0.01) {
      vec2 winId = floor(uv * vec2(260.0, 420.0));
      float wHash = hash(winId);
      float twinkle = step(0.94, wHash) * (0.5 + 0.5 * sin(uTime * 2.5 + wHash * 62.0));
      col += vec3(1.0, 0.89, 0.62) * dtZone * twinkle * 0.32;
    }

    // 5. The Dubai Frame Metallic Gold Shimmer (u=0.912, v=0.748)
    float frameMask = exp(-pow((uv.x - 0.912) / 0.036, 2.0) - pow((uv.y - 0.748) / 0.050, 2.0));
    float frameSweep = pow(0.5 + 0.5 * sin((uv.x + uv.y) * 30.0 - uTime * 2.2 + uPointer.x * 2.8), 3.0);
    col += vec3(1.0, 0.85, 0.38) * frameMask * frameSweep * 0.28;

    // 6. Elevated Metro Viaduct Moving Light Sweep
    float vTrack = 0.24 + (uv.x - 0.14) * 0.273;
    float onViaduct = sstep(0.011, 0.002, abs(uv.y - vTrack)) * sstep(0.14, 0.20, uv.x);
    float trainPos = fract(uTime * 0.075);
    float glowDist = abs((uv.x - 0.14) / 0.86 - trainPos);
    col += vec3(0.58, 0.86, 1.0) * onViaduct * exp(-glowDist * 20.0) * 0.36;

    // 7. Gold Lamborghini Aventador Clearcoat Gleam & Pulsing LED Headlights
    float lamboBody = exp(-pow((uv.x - 0.795) / 0.065, 2.0) - pow((uv.y - 0.242) / 0.032, 2.0));
    float lamboSheen = pow(0.5 + 0.5 * sin((uv.x * 1.4 - uv.y) * 34.0 - uTime * 2.4 + uPointer.x * 3.2), 4.0);
    col += vec3(1.0, 0.91, 0.58) * lamboBody * lamboSheen * 0.30;
    float hl1 = exp(-pow((uv.x - 0.724) / 0.009, 2.0) - pow((uv.y - 0.214) / 0.007, 2.0));
    float hl2 = exp(-pow((uv.x - 0.772) / 0.009, 2.0) - pow((uv.y - 0.204) / 0.007, 2.0));
    float hlPulse = 0.75 + 0.25 * sin(uTime * 3.4);
    col += vec3(1.0, 0.98, 0.86) * (hl1 + hl2) * hlPulse * 0.65;

    // 8. Interactive 3D Directional Sunlight & Specular Highlights
    vec3 L = normalize(vec3(0.35 + uPointer.x * 0.42, 0.45 + uPointer.y * 0.32, 0.82));
    float diff = clamp(dot(microN, L), 0.0, 1.0);
    col *= 0.92 + 0.16 * diff;
    float spec = pow(max(dot(reflect(-L, microN), V), 0.0), 22.0) * clamp(vElev / 3.5, 0.0, 1.0);
    col += vec3(1.0, 0.92, 0.74) * spec * 0.18;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---- 3D Dancing Fountain Spray Particles Shader ----
const FOUNTAIN_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aArc;
  attribute float aRadius;
  uniform float uTime;
  uniform float uPx;
  varying float vAlpha;

  void main() {
    float t = fract(uTime * 0.62 + aPhase);
    float lift = sin(t * 3.14159265);
    float spread = t * aRadius;
    vec3 p = position;
    p.x += cos(aArc) * spread * 0.65;
    p.y += lift * (2.4 + aRadius * 1.6);
    p.z += lift * (2.2 + aRadius * 1.4);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((2.2 + (1.0 - t) * 1.8) * uPx * 110.0 / max(-mv.z, 1.0), 1.2 * uPx, 7.5 * uPx);
    vAlpha = sin(t * 3.14159265) * 0.72;
  }
`;

const FOUNTAIN_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vAlpha;
    gl_FragColor = vec4(0.92, 0.99, 1.0, a);
  }
`;

// ---- Floating Golden Dust / Bokeh Shader ----
const DUST_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aMix;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  varying float vMix;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.32 + aPhase) * 1.5;
    p.x += cos(uTime * 0.24 + aPhase * 1.3) * 1.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 1.0);
    gl_PointSize = clamp(aSize * uPx * 190.0 / dist, 1.0, 18.0 * uPx);
    vA = (0.45 + 0.55 * sin(uTime * 0.9 + aPhase * 2.4)) * smoothstep(280.0, 60.0, dist);
    vMix = aMix;
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vA;
  varying float vMix;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    vec3 c = mix(vec3(0.99, 0.80, 0.36), vec3(1.0, 0.98, 0.92), vMix);
    gl_FragColor = vec4(c, a * vA * 0.48);
  }
`;

// ---- Aviation Beacons Shader ----
const BEACON_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(360.0 * uPx / max(-mv.z, 1.0), 2.0 * uPx, 18.0 * uPx);
    float b = smoothstep(0.45, 0.95, sin(uTime * 2.5 + aPhase));
    vA = 0.22 + 0.78 * b;
  }
`;

const BEACON_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.98, 0.22, 0.14), a * vA);
  }
`;

export function createHeroScene(canvas, { mobile = false, hold = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0xf4ead8, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 1.75);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 900);
  const rand = mulberry32(20261024);

  const uniforms = {
    uTime: { value: 0 },
    uMap: { value: new THREE.DataTexture(new Uint8Array([238, 226, 206, 255]), 1, 1) },
    uHasMap: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uFogColor: { value: FOG_COLOR },
    uPx: { value: pixelRatio },
  };
  uniforms.uMap.value.needsUpdate = true;

  // ---- 1. Studio Sky Sphere ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 28, 18),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTime: uniforms.uTime },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // ---- 2. Root 3D Diorama Stage Group ----
  const stage = new THREE.Group();
  scene.add(stage);

  const ambLight = new THREE.AmbientLight(0xfff5e4, 1.45);
  scene.add(ambLight);
  const sunLight = new THREE.DirectionalLight(0xffe1a6, 1.85);
  sunLight.position.set(45, 65, 95);
  scene.add(sunLight);

  // ---- 3. Architectural Stone & Brushed-Bronze Presentation Table Backing (Strictly behind z < 0) ----
  const tableBacking = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W + 4.4, BOARD_H + 4.4, 3.0),
    new THREE.MeshStandardMaterial({
      color: 0xd4c2a6,
      roughness: 0.62,
      metalness: 0.12,
    })
  );
  tableBacking.position.set(0, 0, -2.0);
  stage.add(tableBacking);

  const goldBezel = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W + 1.4, BOARD_H + 1.4, 2.6),
    new THREE.MeshStandardMaterial({
      color: 0xba9650,
      roughness: 0.32,
      metalness: 0.65,
    })
  );
  goldBezel.position.set(0, 0, -1.6);
  stage.add(goldBezel);

  // ---- 4. Sculpted 3D Relief Diorama Surface ----
  const segX = mobile ? 72 : 120;
  const segY = mobile ? 108 : 180;
  const dioramaGeo = new THREE.PlaneGeometry(BOARD_W, BOARD_H, segX, segY);
  const dioramaMat = new THREE.ShaderMaterial({
    vertexShader: DIORAMA_VERT,
    fragmentShader: DIORAMA_FRAG,
    uniforms: {
      uMap: uniforms.uMap,
      uHasMap: uniforms.uHasMap,
      uTime: uniforms.uTime,
      uPointer: uniforms.uPointer,
    },
  });
  const dioramaMesh = new THREE.Mesh(dioramaGeo, dioramaMat);
  stage.add(dioramaMesh);

  let mapTexture = null;
  let textureReady = false;
  const loader = new THREE.TextureLoader();
  loader.load(
    '/assets/images/hero/dubai-diorama-map.jpg',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      mapTexture = tex;
      uniforms.uMap.value = tex;
      uniforms.uHasMap.value = 1.0;
      textureReady = true;
    },
    undefined,
    () => {
      textureReady = true;
    }
  );

  // ---- 5. Animated 3D Dubai Metro Bullet Train on the Diagonal Elevated Viaduct ----
  const metroCurve = new THREE.CatmullRomCurve3([
    uvToStage(0.14, 0.242, 0.55),
    uvToStage(0.36, 0.315, 0.65),
    uvToStage(0.57, 0.382, 0.72),
    uvToStage(0.78, 0.432, 0.65),
    uvToStage(0.98, 0.474, 0.55),
  ]);

  const metroGroup = new THREE.Group();
  stage.add(metroGroup);

  const metroBodyMat = new THREE.MeshStandardMaterial({ color: 0x1b4f78, roughness: 0.22, metalness: 0.65 });
  const metroRoofMat = new THREE.MeshStandardMaterial({ color: 0xe2ebf3, roughness: 0.25, metalness: 0.75 });
  const metroWinMat = new THREE.MeshBasicMaterial({ color: 0xffecb8 });
  const metroLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const CAR_COUNT = 5;
  const metroCars = [];
  for (let i = 0; i < CAR_COUNT; i++) {
    const car = new THREE.Group();
    const isNose = i === 0 || i === CAR_COUNT - 1;
    const len = isNose ? 2.5 : 2.25;
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 0.72, 0.72), metroBodyMat);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len * 0.96, 0.28, 0.32), metroRoofMat);
    roof.position.z = 0.32;
    const winStrip = new THREE.Mesh(new THREE.BoxGeometry(len * 0.88, 0.76, 0.22), metroWinMat);
    winStrip.position.z = 0.06;
    car.add(body, roof, winStrip);

    if (i === 0) {
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 10), metroRoofMat);
      nose.rotation.z = -Math.PI / 2;
      nose.position.set(len / 2 + 0.38, 0, -0.02);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), metroLightMat);
      hl.position.set(len / 2 + 0.68, -0.1, 0.05);
      car.add(nose, hl);
    }
    metroGroup.add(car);
    metroCars.push(car);
  }

  // ---- 6. Animated 3D Coastal Boulevard Traffic ----
  const roadCurve1 = new THREE.CatmullRomCurve3([
    uvToStage(0.34, 0.242, 0.42),
    uvToStage(0.49, 0.295, 0.45),
    uvToStage(0.64, 0.346, 0.45),
    uvToStage(0.78, 0.395, 0.42),
  ]);
  const roadCurve2 = new THREE.CatmullRomCurve3([
    uvToStage(0.79, 0.380, 0.42),
    uvToStage(0.65, 0.332, 0.45),
    uvToStage(0.50, 0.280, 0.45),
    uvToStage(0.35, 0.228, 0.42),
  ]);

  const trafficCars = [];
  const carPalette = [0xf5c230, 0xf8f9fa, 0x161b22, 0xc92a2a, 0xd0d7de, 0xe8b949];
  const carCount = mobile ? 6 : 10;
  for (let i = 0; i < carCount; i++) {
    const isBus = i === 3;
    const cGroup = new THREE.Group();
    const cLen = isBus ? 1.45 : 0.92;
    const cW = isBus ? 0.52 : 0.44;
    const cH = isBus ? 0.52 : 0.34;
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(cLen, cW, cH),
      new THREE.MeshStandardMaterial({ color: carPalette[i % carPalette.length], roughness: 0.28, metalness: 0.55 })
    );
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(cLen * 0.58, cW * 0.85, cH * 0.62),
      new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.15, metalness: 0.8 })
    );
    cabin.position.z = cH * 0.5;
    const hLight = new THREE.Mesh(new THREE.BoxGeometry(0.08, cW * 0.72, 0.12), metroLightMat);
    hLight.position.x = cLen * 0.51;
    cGroup.add(chassis, cabin, hLight);
    stage.add(cGroup);
    trafficCars.push({
      mesh: cGroup,
      curve: i % 2 === 0 ? roadCurve1 : roadCurve2,
      offset: i / carCount,
      speed: 0.044 + (i % 3) * 0.011,
    });
  }

  // ---- 7. Animated 3D Yachts on the Arabian Gulf ----
  const yachtPaths = [
    new THREE.CatmullRomCurve3([
      uvToStage(0.075, 0.47, 0.35),
      uvToStage(0.115, 0.44, 0.35),
      uvToStage(0.135, 0.42, 0.35),
      uvToStage(0.095, 0.46, 0.35),
    ], true),
    new THREE.CatmullRomCurve3([
      uvToStage(0.32, 0.70, 0.35),
      uvToStage(0.39, 0.71, 0.35),
      uvToStage(0.36, 0.685, 0.35),
    ], true),
  ];
  const vessels = [];
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.2 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x1e6b7b, roughness: 0.3, metalness: 0.4 });
  yachtPaths.forEach((curve, idx) => {
    const vGroup = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.45, 6), hullMat);
    hull.rotation.z = -Math.PI / 2;
    hull.scale.set(1, 1, 0.45);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.32, 0.28), deckMat);
    cabin.position.set(-0.12, 0, 0.16);
    vGroup.add(hull, cabin);
    stage.add(vGroup);
    vessels.push({ mesh: vGroup, curve, offset: idx * 0.45, speed: 0.022 + idx * 0.007 });
  });

  // ---- 8. 3D Dancing Dubai Fountain Particle Plumes in Burj Lake ----
  const fCount = mobile ? 140 : 260;
  const fGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(fCount * 3);
  const fPhase = new Float32Array(fCount);
  const fArc = new Float32Array(fCount);
  const fRad = new Float32Array(fCount);
  for (let i = 0; i < fCount; i++) {
    const isLeftArc = i < fCount * 0.62;
    const t = rand();
    const u = isLeftArc ? lerp(0.396, 0.454, t) : lerp(0.498, 0.532, t);
    const v = isLeftArc
      ? 0.518 + Math.sin(t * Math.PI) * 0.010
      : 0.490 + Math.sin(t * Math.PI) * 0.008;
    const p = uvToStage(u, v, 0.2);
    fPos[i * 3] = p.x;
    fPos[i * 3 + 1] = p.y;
    fPos[i * 3 + 2] = p.z;
    fPhase[i] = rand();
    fArc[i] = rand() * Math.PI * 2;
    fRad[i] = (isLeftArc ? 0.75 : 0.55) * (0.35 + Math.sin(t * Math.PI) * 0.75);
  }
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('aPhase', new THREE.BufferAttribute(fPhase, 1));
  fGeo.setAttribute('aArc', new THREE.BufferAttribute(fArc, 1));
  fGeo.setAttribute('aRadius', new THREE.BufferAttribute(fRad, 1));
  const fountains = new THREE.Points(
    fGeo,
    new THREE.ShaderMaterial({
      vertexShader: FOUNTAIN_VERT,
      fragmentShader: FOUNTAIN_FRAG,
      uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  fountains.frustumCulled = false;
  stage.add(fountains);

  // ---- 9. Aircraft Warning Beacons on Burj Khalifa & Skyscraper Peaks ----
  const beaconUVs = [
    [0.554, 0.972, 1.2, 0.2],   // Burj Khalifa spire tip
    [0.548, 0.865, 1.0, 1.4],   // Burj Khalifa upper tier
    [0.686, 0.875, 0.9, 2.1],   // Tall blue spire tower
    [0.732, 0.835, 0.9, 3.3],   // Twin spire 1
    [0.782, 0.825, 0.9, 4.2],   // Twin spire 2
    [0.154, 0.752, 0.8, 0.9],   // Burj Al Arab mast
    [0.912, 0.805, 0.8, 2.7],   // Dubai Frame crown
  ];
  const bGeo = new THREE.BufferGeometry();
  const bp = new Float32Array(beaconUVs.length * 3);
  const bph = new Float32Array(beaconUVs.length);
  beaconUVs.forEach(([u, v, zLift, ph], i) => {
    const p = uvToStage(u, v, zLift);
    bp[i * 3] = p.x;
    bp[i * 3 + 1] = p.y;
    bp[i * 3 + 2] = p.z;
    bph[i] = ph;
  });
  bGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bGeo.setAttribute('aPhase', new THREE.BufferAttribute(bph, 1));
  const beaconPts = new THREE.Points(
    bGeo,
    new THREE.ShaderMaterial({
      vertexShader: BEACON_VERT,
      fragmentShader: BEACON_FRAG,
      uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx },
      transparent: true,
      depthWrite: false,
    })
  );
  beaconPts.frustumCulled = false;
  stage.add(beaconPts);

  // ---- 10. Floating Golden-Hour Dust Bokeh Particles ----
  const dustCount = mobile ? 450 : 950;
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustCount * 3);
  const ds = new Float32Array(dustCount);
  const dph = new Float32Array(dustCount);
  const dm = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dp[i * 3] = (rand() - 0.5) * 195;
    dp[i * 3 + 1] = (rand() - 0.5) * 185;
    dp[i * 3 + 2] = 6 + rand() * 88;
    ds[i] = 0.16 + Math.pow(rand(), 2.6) * 0.65;
    dph[i] = rand() * 6.28;
    dm[i] = rand() < 0.32 ? 1 : 0;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(ds, 1));
  dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(dph, 1));
  dustGeo.setAttribute('aMix', new THREE.BufferAttribute(dm, 1));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx },
      transparent: true,
      depthWrite: false,
    })
  );
  dust.frustumCulled = false;
  stage.add(dust);

  // ---- 11. Camera & Interactive Focus Rig ----
  const FOCUS_PRESETS = {
    overview: { x: 0, y: 0, z: 232, lx: 0, ly: 0, lz: 4, rx: -0.06, ry: -0.15 },
    downtown: { x: 6, y: 12, z: 128, lx: 6, ly: 14, lz: 8, rx: -0.03, ry: -0.08 },
    palm:     { x: -16, y: 32, z: 134, lx: -18, ly: 30, lz: 6, rx: -0.05, ry: 0.11 },
    metro:    { x: 14, y: -26, z: 124, lx: 12, ly: -22, lz: 6, rx: -0.12, ry: -0.09 },
  };

  const state = { p: 0, px: 0, py: 0, focus: 'overview' };
  const cur = {
    p: 0,
    px: 0,
    py: 0,
    cx: 0,
    cy: 0,
    cz: 232,
    lx: 0,
    ly: 0,
    lz: 4,
    rx: -0.06,
    ry: -0.15,
  };

  let introT = hold ? 1 : 0;
  let running = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let frames = 0;
  let slowAcc = 0;
  let readyFired = false;
  let disposed = false;
  const api = { onReady: null, onSlow: null };

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.userData.portrait = camera.aspect < 0.92;
    camera.updateProjectionMatrix();
  }

  function updateKineticElements(t) {
    const baseT = (t * 0.068) % 1.0;
    const carSpacing = 0.028;
    for (let i = 0; i < CAR_COUNT; i++) {
      const ct = clamp(baseT - i * carSpacing, 0.001, 0.998);
      const pos = metroCurve.getPointAt(ct);
      const tan = metroCurve.getTangentAt(ct);
      const car = metroCars[i];
      car.position.copy(pos);
      car.rotation.z = Math.atan2(tan.y, tan.x);
    }

    for (let i = 0; i < trafficCars.length; i++) {
      const tc = trafficCars[i];
      const ct = (t * tc.speed + tc.offset) % 1.0;
      const pos = tc.curve.getPointAt(ct);
      const tan = tc.curve.getTangentAt(ct);
      tc.mesh.position.copy(pos);
      tc.mesh.rotation.z = Math.atan2(tan.y, tan.x);
    }

    for (let i = 0; i < vessels.length; i++) {
      const vs = vessels[i];
      const ct = (t * vs.speed + vs.offset) % 1.0;
      const pos = vs.curve.getPointAt(ct);
      const tan = vs.curve.getTangentAt(ct);
      vs.mesh.position.set(pos.x, pos.y, pos.z + Math.sin(t * 2.2 + i) * 0.12);
      vs.mesh.rotation.z = Math.atan2(tan.y, tan.x);
      vs.mesh.rotation.x = Math.sin(t * 1.8 + i) * 0.04;
    }
  }

  function placeCamera(dt) {
    const k = 1 - Math.exp(-dt * 6.5);
    const kp = 1 - Math.exp(-dt * 4.5);
    cur.p += (state.p - cur.p) * k;
    cur.px += (state.px - cur.px) * kp;
    cur.py += (state.py - cur.py) * kp;
    uniforms.uPointer.value.set(cur.px, cur.py);

    introT = Math.min(1, introT + dt / 1.8);
    const ie = easeOutCubic(introT);
    const p = clamp(cur.p, 0, 1);
    const e = easeInOutSine(p);

    const preset = FOCUS_PRESETS[state.focus] || FOCUS_PRESETS.overview;
    cur.cx += (preset.x - cur.cx) * kp;
    cur.cy += (preset.y - cur.cy) * kp;
    cur.cz += (preset.z - cur.cz) * kp;
    cur.lx += (preset.lx - cur.lx) * kp;
    cur.ly += (preset.ly - cur.ly) * kp;
    cur.lz += (preset.lz - cur.lz) * kp;
    cur.rx += (preset.rx - cur.rx) * kp;
    cur.ry += (preset.ry - cur.ry) * kp;

    const portrait = !!camera.userData.portrait;
    const desktopShiftX = portrait ? 0 : lerp(42, 12, e);
    stage.position.x = desktopShiftX + cur.px * 4.2;
    stage.position.y = (portrait ? -2 : -1) + cur.py * 2.8;

    const breatheX = Math.sin(clock * 0.45) * 0.014;
    const breatheY = Math.cos(clock * 0.35) * 0.020;
    stage.rotation.x = lerp(cur.rx, -0.20, e) - cur.py * 0.15 + breatheX;
    stage.rotation.y = lerp(cur.ry, 0.06, e) + cur.px * 0.22 + breatheY;
    stage.rotation.z = Math.sin(p * Math.PI) * -0.025 + cur.px * -0.018;

    const startZ = portrait ? cur.cz + 22 : cur.cz + 8;
    const camX = lerp(cur.cx, 12, e) + cur.px * 6.0 + Math.sin(clock * 0.28) * 0.7;
    const camY = lerp(cur.cy, 20, e) + cur.py * 4.5 - 6 * (1 - ie);
    const camZ = lerp(startZ, 88, e) + 14 * (1 - ie);
    camera.position.set(camX, camY, camZ);

    const lookX = lerp(cur.lx, 14, e) + cur.px * 3.2;
    const lookY = lerp(cur.ly, 22, e) + cur.py * 2.5;
    const lookZ = lerp(cur.lz, 12, e);
    camera.lookAt(lookX, lookY, lookZ);

    const baseFov = portrait ? 52 : 42;
    const fov = baseFov - 3 * e + 2 * (1 - ie);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    sky.position.copy(camera.position);
  }

  function frame(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    clock += dt;
    uniforms.uTime.value = clock;
    updateKineticElements(clock);
    placeCamera(dt);
    renderer.render(scene, camera);
    frames++;
    if (!readyFired) {
      readyFired = true;
      if (api.onReady) api.onReady();
    }
    if (frames > 40 && frames <= 160) {
      slowAcc += dt;
      if (frames === 160) {
        const avg = slowAcc / 120;
        if (avg > 0.034 && pixelRatio > 1) {
          pixelRatio = 1;
          uniforms.uPx.value = 1;
          renderer.setPixelRatio(1);
          resize();
          frames = 40;
          slowAcc = 0;
        } else if (avg > 0.05 && api.onSlow) {
          api.onSlow();
        }
      }
    }
  }

  api.resize = resize;
  api.setProgress = (p) => { state.p = clamp(p, 0, 1); };
  api.setPointer = (x, y) => { state.px = clamp(x, -1, 1); state.py = clamp(y, -1, 1); };
  api.setFocus = (focusKey) => {
    if (FOCUS_PRESETS[focusKey]) state.focus = focusKey;
  };
  api.start = () => {
    if (hold) {
      const drawHold = () => {
        if (!textureReady && frames < 45) {
          frames++;
          requestAnimationFrame(drawHold);
          return;
        }
        resize();
        updateKineticElements(1.2);
        placeCamera(0.016);
        renderer.render(scene, camera);
        if (!readyFired) {
          readyFired = true;
          if (api.onReady) api.onReady();
        }
      };
      requestAnimationFrame(drawHold);
      return;
    }
    if (running || disposed) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  api.stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  api.renderOnce = () => {
    resize();
    updateKineticElements(clock);
    placeCamera(0.016);
    renderer.render(scene, camera);
  };
  api.dispose = () => {
    disposed = true;
    api.stop();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    if (mapTexture) mapTexture.dispose();
    renderer.dispose();
  };
  api.stats = () => ({
    reliefVertices: (segX + 1) * (segY + 1),
    metroCars: CAR_COUNT,
    trafficCars: trafficCars.length,
    fountainParticles: fCount,
    dust: dustCount,
    beacons: beaconUVs.length,
    focus: state.focus,
    camera: camera.position.toArray(),
    fov: camera.fov,
    pixelRatio,
  });

  resize();
  return api;
}
