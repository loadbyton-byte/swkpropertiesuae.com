// Cinematic hero: a procedural Dubai skyline in golden light rendered with Three.js.
//
//  - One InstancedMesh holds every building (and the landmark tower tiers);
//    a custom shader draws lit windows, rim light, height fog and the ember
//    glow of a sunset sitting behind the skyline.
//  - A camera path is scrubbed by page scroll (see hero-cine.js): the camera
//    flies down the boulevard, weaving between towers, and rises above the roofs.
//  - Everything is procedural, so there are no model or texture downloads.
//
// Loaded lazily (dynamic import) only when WebGL is available and the visitor
// has not asked for reduced motion. If anything throws, the caller keeps the
// static photo hero.

import * as THREE from '/assets/vendor/three.module.min.js';

const FOG_COLOR = new THREE.Color(0.96, 0.85, 0.72);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const BUILDING_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSeed;
  varying vec2 vFace;
  varying float vTop;
  varying float vFogDepth;

  void main() {
    mat4 m = modelMatrix;
    vec3 sc = vec3(1.0);
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
      sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vec3 local = position * sc;
    vFace = (abs(normal.x) > 0.5) ? vec2(local.z, local.y) : vec2(local.x, local.y);
    vTop = step(0.5, normal.y);
    vSeed = aSeed;
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const BUILDING_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vSeed;
  varying vec2 vFace;
  varying float vTop;
  varying float vFogDepth;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorld);
    // vSeed is constant per instance, but interpolation leaves ULP-level error;
    // snap it so the window hashes below cannot flicker per pixel.
    float sv = floor(vSeed * 1024.0 + 0.5) / 1024.0;
    float beacon = step(5.0, sv);
    float seed = fract(sv);
    float hh = clamp(vWorld.y / 230.0, 0.0, 1.0);

    // Facade palette: pearl white, sky glass, champagne sand, aqua glass, deep blue glass.
    vec3 pearl = vec3(0.97, 0.94, 0.89);
    vec3 skyg  = vec3(0.78, 0.80, 0.92);
    vec3 sand  = vec3(0.96, 0.84, 0.62);
    vec3 aqua  = vec3(0.82, 0.64, 0.44);
    vec3 deep  = vec3(0.32, 0.42, 0.64);
    float k = seed * 5.0;
    vec3 base = pearl;
    base = mix(base, skyg, smoothstep(0.6, 1.0, k) * (1.0 - smoothstep(1.6, 2.0, k)));
    base = mix(base, sand, smoothstep(1.6, 2.0, k) * (1.0 - smoothstep(2.6, 3.0, k)));
    base = mix(base, aqua, smoothstep(2.6, 3.0, k) * (1.0 - smoothstep(3.6, 4.0, k)));
    base = mix(base, deep, smoothstep(3.6, 4.0, k));

    // Sun from the front-right; faces away from it fall into a soft blue shade.
    vec3 L = normalize(vec3(0.55, 0.62, 0.56));
    float diff = clamp(dot(N, L), 0.0, 1.0);
    vec3 shade = vec3(0.64, 0.62, 0.80);
    vec3 col = base * mix(shade, vec3(1.10, 1.02, 0.90), 0.3 + 0.7 * diff);

    if (vTop > 0.5) {
      col = mix(col, vec3(0.97, 0.98, 1.0), 0.75);
    } else {
      vec2 g = vFace / vec2(2.4, 3.8);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float win = step(0.14, f.x) * step(f.x, 0.86) * step(0.2, f.y) * step(f.y, 0.8);
      float r = hash(id + seed * 57.3);
      float r2 = hash(id.yx + seed * 13.7);
      // Glass reflects the sky: deeper blue low down, brighter with height.
      vec3 glass = mix(vec3(0.22, 0.30, 0.52), vec3(0.94, 0.74, 0.50), 0.3 + 0.7 * hh);
      glass = mix(glass, glass * vec3(1.15, 1.1, 0.95), step(0.8, r2));
      float tw = 0.5 + 0.5 * sin(uTime * (0.35 + r * 0.9) + r * 40.0);
      float glint = step(0.9, r) * (0.35 + 0.65 * tw);
      vec3 pane = mix(glass, vec3(1.0, 0.97, 0.88), glint * 0.85);
      col = mix(col, pane * (0.55 + 0.6 * diff), win * 0.82);
      float mull = step(f.x, 0.03) + step(0.97, f.x);
      col *= 1.0 - 0.12 * mull;
    }

    float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
    col += vec3(1.0, 0.84, 0.60) * 0.3 * fres * (0.4 + 0.6 * hh);
    col = mix(col, vec3(1.0, 0.82, 0.38), beacon * 0.95);

    float ff = 1.0 - exp(-pow(vFogDepth * uFogDensity, 2.0));
    float hf = exp(-max(vWorld.y, 0.0) * 0.011);
    ff = clamp(ff * (0.62 + 0.6 * hf), 0.0, 1.0);
    col = mix(col, uFogColor, ff);
    gl_FragColor = vec4(col, 1.0);
  }
`;

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
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 zenith = vec3(0.30, 0.50, 0.90);
    vec3 mid    = vec3(0.90, 0.66, 0.80);
    vec3 hor    = vec3(1.0, 0.74, 0.44);
    vec3 col = mix(hor, mid, smoothstep(0.0, 0.2, y));
    col = mix(col, zenith, smoothstep(0.16, 0.8, y));

    // Warm sun glow low in front of the camera, behind the skyline.
    vec3 sunDir = normalize(vec3(0.22, 0.16, -1.0));
    float sd = dot(d, sunDir);
    col += vec3(1.0, 0.78, 0.42) * pow(max(sd, 0.0), 6.0) * 0.36 * exp(-max(y - 0.05, 0.0) * 3.0);
    col += vec3(1.0, 0.9, 0.62) * pow(max(sd, 0.0), 60.0) * 0.8;
    col += vec3(1.0, 0.97, 0.88) * smoothstep(0.9990, 0.9997, sd) * 1.6;

    // Soft drifting cumulus on a plane above the camera.
    vec2 cuv = d.xz / (max(y, 0.0) + 0.22) * 0.9 + vec2(uTime * 0.03, uTime * 0.004);
    float c = fbm(cuv * 1.3);
    float cm = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.2, y);
    vec3 cloud = mix(vec3(1.0, 0.96, 0.92), vec3(0.93, 0.76, 0.76), smoothstep(0.55, 0.9, c));
    cloud += vec3(1.0, 0.85, 0.55) * pow(max(sd, 0.0), 4.0) * 0.25;
    col = mix(col, cloud, cm * 0.92);

    col = mix(col, vec3(0.96, 0.85, 0.72), smoothstep(0.0, -0.2, y));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GROUND_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying float vFogDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const GROUND_FRAG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying float vFogDepth;
  void main() {
    float ax = abs(vWorld.x);
    float road = 1.0 - smoothstep(7.0, 8.0, ax);
    // Warm sandstone plaza either side of a cool asphalt boulevard.
    float far = smoothstep(10.0, 150.0, ax);
    vec3 plaza = mix(vec3(0.95, 0.91, 0.83), vec3(0.88, 0.87, 0.84), far * 0.55);
    // Thin paving joints, faded with distance so they never band.
    float joint = max(smoothstep(0.0, 0.05, abs(fract(vWorld.z / 12.0) - 0.5) - 0.45),
                      smoothstep(0.0, 0.05, abs(fract(vWorld.x / 12.0) - 0.5) - 0.45));
    plaza *= 1.0 - joint * 0.05 * (1.0 - smoothstep(30.0, 160.0, vFogDepth));
    vec3 col = mix(plaza, vec3(0.56, 0.53, 0.55), road);
    float dash = step(0.5, fract(vWorld.z / 8.0)) * (1.0 - smoothstep(0.12, 0.22, ax));
    col = mix(col, vec3(1.0, 0.98, 0.92), dash * road * 0.9);
    float edge = smoothstep(6.5, 6.75, ax) * (1.0 - smoothstep(6.75, 7.0, ax));
    col = mix(col, vec3(0.95, 0.74, 0.25), edge * 0.95);
    float ff = 1.0 - exp(-pow(vFogDepth * uFogDensity, 2.0));
    col = mix(col, uFogColor, clamp(ff * 1.05, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CAR_VERT = /* glsl */ `
  attribute float aLane;
  attribute float aSpeed;
  attribute float aOff;
  attribute float aDir;
  uniform float uTime;
  uniform float uPx;
  varying float vDir;
  varying float vFade;
  void main() {
    float zFar = -520.0;
    float zNear = 96.0;
    float span = zNear - zFar;
    float z = zFar + mod(aOff + aDir * uTime * aSpeed, span);
    vec4 mv = modelViewMatrix * vec4(aLane, 0.9, z, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(520.0 * uPx / max(-mv.z, 1.0), 2.0 * uPx, 16.0 * uPx);
    vDir = aDir;
    vFade = smoothstep(0.0, 40.0, z - zFar) * smoothstep(0.0, 24.0, zNear - z);
  }
`;

const CAR_FRAG = /* glsl */ `
  varying float vDir;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.22, d);
    // Mostly pearl and navy cars with the odd gold, teal or red one.
    float k = fract(gl_FragCoord.x * 0.013 + gl_FragCoord.y * 0.007);
    vec3 c = vec3(0.96, 0.97, 0.99);
    c = mix(c, vec3(0.10, 0.20, 0.42), step(0.4, k));
    c = mix(c, vec3(0.95, 0.70, 0.18), step(0.7, k));
    c = mix(c, vec3(0.06, 0.62, 0.60), step(0.84, k));
    c = mix(c, vec3(0.86, 0.20, 0.14), step(0.94, k));
    gl_FragColor = vec4(c, a * vFade);
  }
`;

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
    p.y += sin(uTime * 0.25 + aPhase) * 1.8;
    p.x += cos(uTime * 0.2 + aPhase * 1.3) * 1.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 1.0);
    gl_PointSize = clamp(aSize * uPx * 240.0 / dist, 1.0, 26.0 * uPx);
    float near = smoothstep(2.0, 18.0, dist);
    float far = 1.0 - smoothstep(120.0, 360.0, dist);
    vA = near * far * (0.55 + 0.45 * sin(uTime * 0.8 + aPhase * 3.0));
    vMix = aMix;
  }
`;

const DUST_FRAG = /* glsl */ `
  varying float vA;
  varying float vMix;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    vec3 c = mix(vec3(0.98, 0.76, 0.28), vec3(1.0, 0.98, 0.92), vMix);
    gl_FragColor = vec4(c, a * vA * 0.55);
  }
`;

const BEACON_VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(520.0 * uPx / max(-mv.z, 1.0), 2.0 * uPx, 30.0 * uPx);
    float b = smoothstep(0.55, 0.95, sin(uTime * 2.1 + aPhase));
    vA = 0.18 + 0.82 * b;
  }
`;

const BEACON_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.92, 0.14, 0.10), a * vA);
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
  renderer.setClearColor(0xf1ddc0, 1);
  let pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1400);
  const rand = mulberry32(20160607);
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0034);

  const uniforms = {
    uTime: { value: 0 },
    uFogColor: { value: FOG_COLOR },
    uFogDensity: { value: 0.0034 },
    uPx: { value: pixelRatio },
  };

  // ---- Sky (follows the camera so it never parallaxes)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 20),
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

  // ---- Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: { uFogColor: uniforms.uFogColor, uFogDensity: uniforms.uFogDensity },
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -240);
  scene.add(ground);

  // ---- Buildings (single instanced draw call)
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const parts = [];
  const beacons = [];
  const CELL = 26;

  const push = (x, y, z, w, h, d, ry, seed) => parts.push({ x, y, z, w, h, d, ry, seed });

  const smoothstepJS = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
  for (let gx = -12; gx <= 12; gx++) {
    for (let gz = -24; gz <= 4; gz++) {
      const x = gx * CELL + (rand() - 0.5) * 4;
      const z = gz * CELL + (rand() - 0.5) * 4;
      const ax = Math.abs(x);
      // Wide open forecourt near the camera, narrowing to a boulevard downtown.
      const halfRoad = lerp(78, 15, smoothstepJS(20, 220, -z));
      if (ax < halfRoad) continue;
      const pBuild = 0.9 - 0.4 * smoothstepJS(120, 280, ax);
      if (rand() > pBuild) continue;
      const depthT = smoothstepJS(0, 540, -z);
      const lateral = 1 - clamp(ax / 260, 0, 1);
      let h = 14 + Math.pow(rand(), 2.2) * 62;
      h *= 0.55 + 2.3 * depthT * (0.4 + 0.6 * lateral);
      if (rand() < 0.07) h *= 2.0;
      const w = 9 + rand() * 10;
      const d = 9 + rand() * 10;
      const seed = rand();
      push(x, 0, z, w, h, d, 0, seed);
      if (h > 95 && rand() < 0.75) {
        const h2 = h * (0.22 + rand() * 0.18);
        push(x, h, z, w * 0.62, h2, d * 0.62, 0, fract1(seed + 0.31));
        if (h > 170) beacons.push([x, h + h2 + 1, z, rand() * 6.28]);
      } else if (h > 150) {
        beacons.push([x, h + 1, z, rand() * 6.28]);
      }
    }
  }

  // Landmark 1: a tiered, slowly twisting spire (Burj-style silhouette)
  {
    const lx = 40, lz = -300, tiers = 16;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      push(lx, i * 13.5, lz, lerp(22, 4.5, Math.pow(t, 0.9)), 14.2, lerp(22, 4.5, Math.pow(t, 0.9)), i * 0.22, 0.37);
    }
    push(lx, tiers * 13.5, lz, 1.1, 44, 1.1, 0, 5.5);
    beacons.push([lx, tiers * 13.5 + 46, lz, 0.4]);
  }
  // Landmark 2: a twisted tower
  {
    const lx = -52, lz = -210, tiers = 24;
    for (let i = 0; i < tiers; i++) {
      push(lx, i * 7, lz, 22 - i * 0.15, 7.2, 22 - i * 0.15, i * 0.075, 0.61);
    }
    beacons.push([lx, tiers * 7 + 1, lz, 2.2]);
  }
  // A hazy backdrop row that closes the far end of the boulevard (no hard gap of raw sky).
  for (let i = -4; i <= 4; i++) {
    const h = 70 + rand() * 190;
    push(i * 17 + (rand() - 0.5) * 6, 0, -650 - rand() * 50, 13 + rand() * 11, h, 14, 0, rand());
  }
  // Two slim towers that frame the opening shot
  push(-96, 0, 10, 12, 96, 12, 0, 0.18);
  push(100, 0, -20, 12, 118, 12, 0, 0.82);
  beacons.push([-96, 97, 10, 1.1], [100, 119, -20, 3.0]);

  function fract1(v) { return v - Math.floor(v); }

  const count = parts.length;
  const seeds = new Float32Array(count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const buildings = new THREE.InstancedMesh(
    unit,
    new THREE.ShaderMaterial({
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG,
      uniforms: {
        uTime: uniforms.uTime,
        uFogColor: uniforms.uFogColor,
        uFogDensity: uniforms.uFogDensity,
      },
    }),
    count
  );
  parts.forEach((p, i) => {
    quat.setFromAxisAngle(axisY, p.ry);
    pos.set(p.x, p.y, p.z);
    scl.set(p.w, p.h, p.d);
    matrix.compose(pos, quat, scl);
    buildings.setMatrixAt(i, matrix);
    seeds[i] = p.seed;
  });
  buildings.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  buildings.instanceMatrix.needsUpdate = true;
  buildings.frustumCulled = false;
  scene.add(buildings);


  // ---- Street furniture: date palms and lamp posts along the boulevard
  {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.ConeGeometry(3.3, 2.4, 7);
    crownGeo.translate(0, 1.3, 0);
    const lampGeo = new THREE.CylinderGeometry(0.12, 0.16, 1, 5);
    lampGeo.translate(0, 0.5, 0);
    const bulbGeo = new THREE.SphereGeometry(0.55, 8, 6);
    const trunkMat = new THREE.MeshBasicMaterial({ color: 0x8a6a4c });
    const crownMat = new THREE.MeshBasicMaterial({ color: 0x4f8a52 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x2b3750 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd58a });
    const N = mobile ? 26 : 44;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N * 2);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, N * 2);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, N * 2);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, N * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sv = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < N; i++) {
      for (const side of [-1, 1]) {
        const z = 70 - i * 15;
        const jitter = (rand() - 0.5) * 1.2;
        const hT = 9 + rand() * 3.5;
        q.setFromAxisAngle(axisY, rand() * 6.28);
        v.set(side * (10.5 + jitter), 0, z); sv.set(1, hT, 1);
        m.compose(v, q, sv); trunks.setMatrixAt(k, m);
        v.set(side * (10.5 + jitter), hT, z); sv.set(1, 1, 1);
        m.compose(v, q, sv); crowns.setMatrixAt(k, m);
        const lz = z - 7.5;
        v.set(side * 8.2, 0, lz); sv.set(1, 7.5, 1);
        m.compose(v, q, sv); lamps.setMatrixAt(k, m);
        v.set(side * 8.2, 7.7, lz); sv.set(1, 1, 1);
        m.compose(v, q, sv); bulbs.setMatrixAt(k, m);
        k++;
      }
    }
    [trunks, crowns, lamps, bulbs].forEach((o) => { o.frustumCulled = false; scene.add(o); });
  }

  // ---- Traffic light streaks
  const carCount = mobile ? 150 : 260;
  const carGeo = new THREE.BufferGeometry();
  const lane = new Float32Array(carCount);
  const speed = new Float32Array(carCount);
  const off = new Float32Array(carCount);
  const dir = new Float32Array(carCount);
  for (let i = 0; i < carCount; i++) {
    const d = i % 2 === 0 ? 1 : -1;
    const lanes = d > 0 ? [-2.6, -5.6] : [2.6, 5.6];
    lane[i] = lanes[(rand() * 2) | 0] + (rand() - 0.5) * 0.5;
    speed[i] = 14 + rand() * 18;
    off[i] = rand() * 620;
    dir[i] = d;
  }
  carGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(carCount * 3), 3));
  carGeo.setAttribute('aLane', new THREE.BufferAttribute(lane, 1));
  carGeo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  carGeo.setAttribute('aOff', new THREE.BufferAttribute(off, 1));
  carGeo.setAttribute('aDir', new THREE.BufferAttribute(dir, 1));
  const cars = new THREE.Points(
    carGeo,
    new THREE.ShaderMaterial({
      vertexShader: CAR_VERT,
      fragmentShader: CAR_FRAG,
      uniforms: { uTime: uniforms.uTime, uPx: uniforms.uPx },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
  );
  cars.frustumCulled = false;
  scene.add(cars);

  // ---- Floating dust / bokeh
  const dustCount = mobile ? 700 : 1500;
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustCount * 3);
  const ds = new Float32Array(dustCount);
  const dph = new Float32Array(dustCount);
  const dm = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dp[i * 3] = (rand() - 0.5) * 150;
    dp[i * 3 + 1] = 2 + Math.pow(rand(), 1.6) * 90;
    dp[i * 3 + 2] = 100 - rand() * 600;
    ds[i] = 0.16 + Math.pow(rand(), 3) * 0.7;
    dph[i] = rand() * 6.28;
    dm[i] = rand() < 0.28 ? 1 : 0;
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
      blending: THREE.NormalBlending,
    })
  );
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- Aircraft-warning beacons on the tallest towers
  const bGeo = new THREE.BufferGeometry();
  const bp = new Float32Array(beacons.length * 3);
  const bph = new Float32Array(beacons.length);
  beacons.forEach((b, i) => { bp[i * 3] = b[0]; bp[i * 3 + 1] = b[1]; bp[i * 3 + 2] = b[2]; bph[i] = b[3]; });
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
      blending: THREE.NormalBlending,
    })
  );
  beaconPts.frustumCulled = false;
  scene.add(beaconPts);

  // ---- Camera rig
  const state = { p: 0, px: 0, py: 0 };
  const cur = { p: 0, px: 0, py: 0 };
  let introT = 0;
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
    camera.userData.portrait = camera.aspect < 0.85;
    camera.updateProjectionMatrix();
  }

  function placeCamera(dt) {
    const k = 1 - Math.exp(-dt * 7.5);
    cur.p += (state.p - cur.p) * k;
    cur.px += (state.px - cur.px) * (1 - Math.exp(-dt * 3));
    cur.py += (state.py - cur.py) * (1 - Math.exp(-dt * 3));
    introT = Math.min(1, introT + dt / 2.2);
    const ie = easeOutCubic(introT);
    const p = clamp(cur.p, 0, 1);
    const e = easeInOutSine(p);
    const x = Math.sin(p * Math.PI * 1.25) * 7.5 + cur.px * 2.6 + Math.sin(clock * 0.13) * 0.9;
    const y = lerp(16, 70, Math.pow(p, 1.15)) + cur.py * 1.6 - 5 * (1 - ie) + Math.sin(clock * 0.21) * 0.35;
    const z = lerp(95, -170, e) + 48 * (1 - ie);
    camera.position.set(clamp(x, -9.5, 9.5), y, z);
    const lookY = lerp(52, 12, Math.pow(p, 0.9)) + cur.py * 2;
    camera.lookAt(clamp(x * 0.35 + cur.px * 7, -14, 14), lookY, z - 220);
    camera.rotation.z += Math.sin(p * Math.PI * 2) * 0.03 + cur.px * -0.012 + Math.sin(clock * 0.9) * 0.0025;
    const baseFov = camera.userData.portrait ? 70 : 56;
    const fov = baseFov + 12 * p - 5 * (1 - ie);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position);
  }

  function frame(now) {
    if (!running || disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    clock += dt;
    uniforms.uTime.value = clock;
    placeCamera(dt);
    renderer.render(scene, camera);
    frames++;
    if (!readyFired) {
      readyFired = true;
      if (api.onReady) api.onReady();
    }
    // Adaptive quality: after warm-up, step resolution down once, then bail out.
    if (frames > 40 && frames <= 160) {
      slowAcc += dt;
      if (frames === 160) {
        const avg = slowAcc / 120;
        if (avg > 0.034 && pixelRatio > 1) {
          pixelRatio = 1;
          uniforms.uPx.value = 1;
          renderer.setPixelRatio(1);
          resize();
          frames = 40; slowAcc = 0;
        } else if (avg > 0.05 && api.onSlow) {
          api.onSlow();
        }
      }
    }
  }

  api.resize = resize;
  api.setProgress = (p) => { state.p = clamp(p, 0, 1); };
  api.setPointer = (x, y) => { state.px = clamp(x, -1, 1); state.py = clamp(y, -1, 1); };
  api.start = () => {
    if (hold) {
      // ?hold: draw the opening frame once and stay still (used to render the poster image).
      requestAnimationFrame(() => {
        resize(); placeCamera(0.0001); renderer.render(scene, camera);
        if (!readyFired) { readyFired = true; if (api.onReady) api.onReady(); }
      });
      return;
    }
    if (running || disposed) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  api.stop = () => { running = false; cancelAnimationFrame(raf); };
  api.renderOnce = () => { resize(); placeCamera(0.016); renderer.render(scene, camera); };
  api.dispose = () => {
    disposed = true;
    api.stop();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    renderer.dispose();
  };
  api.stats = () => ({ buildings: count, cars: carCount, dust: dustCount, beacons: beacons.length, camera: camera.position.toArray(), fov: camera.fov, pixelRatio });

  resize();
  return api;
}
