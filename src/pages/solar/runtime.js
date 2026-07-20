import { createPostprocessingShaders } from '../../shared/postprocessing-shaders.js';
import { fbm, hash2, makeCanvas, tileFbm, valueNoise } from '../../shared/procedural-canvas.js';
import { paintRangeFill } from '../../shared/range.js';
import { createSolarConfig, GM_SUN, QUALITY, TEX_BASE } from './config.js';
import { createSolarData } from './data.js';
import { closestApproach } from './dynamics.js';
import { pickZodiac } from './zodiac.js';
import { createCameraMetadata } from './camera.js';
import { createSolarSettings } from './settings.js';
import {
  J2000_MS, SIM_DAY_LIMIT, TIME_SCALE_PRESETS, clampSimDays,
  formatElapsedDays, formatUtcDate, formatUtcTime, sessionStartMs,
  simDateFromDays, simDaysFromDate,
} from './timeline.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { disposeThreeRuntime } from '../../shared/dispose-three.js';
import { createResourceScope } from '../../shared/resource-scope.js';

export function createSolarRuntime({ root, navigate, replaceRoute, initialView = 'title' }) {
const scope = createResourceScope(window);
const requestAnimationFrame = scope.requestAnimationFrame;
const cancelAnimationFrame = scope.cancelAnimationFrame;
const setTimeout = scope.setTimeout;
const clearTimeout = scope.clearTimeout;
const setInterval = scope.setInterval;
const clearInterval = scope.clearInterval;
let frameId = 0;
let paused = false;
let destroyed = false;
let routeActivation = false;
const { BloomClampShader, LensingShader } = createPostprocessingShaders(THREE);

/* ================================================================
   CONFIG
   ================================================================ */

const CONFIG = createSolarConfig();
const { loadSettings, saveSettings } = createSolarSettings(CONFIG);

const SESSION_START_MS = sessionStartMs();

function simulationTimeMs(days = simDays) {
  return J2000_MS + clampSimDays(days) * 86400000;
}

function julianEpoch(ms = simulationTimeMs()) {
  return 2000 + (ms - J2000_MS) / (365.25 * 86400000);
}

const {
  GALAXIES, PLANET_FACTS, factsFor, typeFor, sci,
  TRAIL_POINTS, BELT_COUNT, BELT_PERIOD_DAYS,
  scaledDist, geoRadius, density, orbitPos,
} = createSolarData(CONFIG, QUALITY);

/* ================================================================
   PROCEDURAL TEXTURES (canvas value-noise — instant + offline fallback)
   ================================================================ */

const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createPlanetTexture(def, seed) {
  const W = 512, H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const colors = (def.colors || ['#888', '#666', '#aaa']).map(c => new THREE.Color(c));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let col = cC;
      if (def.tex === 'gas') {
        const warp = (tileFbm(x, y, 60, seed, 4, W) - 0.5) * 0.35;
        const band = (y / H + warp) * colors.length * 2.4;
        const i0 = ((Math.floor(band) % colors.length) + colors.length) % colors.length;
        const i1 = (i0 + 1) % colors.length;
        const frac = band - Math.floor(band);
        col.copy(colors[i0]).lerp(colors[i1], THREE.MathUtils.smoothstep(frac, 0.35, 0.65));
        const detail = tileFbm(x, y, 18, seed + 7, 3, W);
        col.multiplyScalar(0.9 + detail * 0.25);
      } else if (def.tex === 'earth') {
        const n = tileFbm(x, y, 55, seed, 5, W);
        const lat = Math.abs(y / H - 0.5) * 2;
        if (n > 0.52) {
          const n2 = tileFbm(x, y, 22, seed + 3, 3, W);
          col.copy(colors[1]).lerp(cA.set(colors[2]), THREE.MathUtils.clamp((n2 - 0.35) * 2, 0, 1));
        } else {
          col.copy(colors[0]).multiplyScalar(0.7 + n * 0.7);
        }
        if (lat > 0.82) col.lerp(cA.set('#eef2f5'), THREE.MathUtils.clamp((lat - 0.82) / 0.1, 0, 1));
        const cloud = tileFbm(x + 137, y, 30, seed + 9, 4, W);
        if (cloud > 0.6) col.lerp(cA.set('#ffffff'), (cloud - 0.6) * 1.6);
      } else if (def.tex === 'venus') {
        const swirl = tileFbm(x, y, 90, seed, 3, W);
        const n = tileFbm(x + swirl * 80, y + swirl * 30, 45, seed + 5, 4, W);
        col.copy(colors[0]).lerp(cA.set(colors[1]), n);
        col.lerp(cB.set(colors[2]), Math.max(0, (swirl - 0.55) * 1.4));
      } else if (def.tex === 'sun') {
        const n = tileFbm(x, y, 14, seed, 5, W);
        col.set(def.colorA || '#ff8c1a').lerp(cA.set(def.colorB || '#ffe6a3'), n * n * 1.4);
      } else {
        const n = tileFbm(x, y, 40, seed, 5, W);
        col.copy(colors[1]).lerp(cA.set(colors[0]), n);
        const spots = tileFbm(x, y, 9, seed + 11, 3, W);
        if (spots > 0.68) col.lerp(cB.set(colors[2]), 0.5);
        if (spots < 0.34) col.multiplyScalar(0.75);
      }
      px[i] = col.r * 255; px[i + 1] = col.g * 255; px[i + 2] = col.b * 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (def.tex === 'rocky') {
    for (let k = 0; k < 60; k++) {
      const r = 2 + hash2(k, 1, seed) * 7;
      const cx = hash2(k, 2, seed) * W, cy = H * 0.1 + hash2(k, 3, seed) * H * 0.8;
      ctx.globalAlpha = 0.1 + hash2(k, 4, seed) * 0.12;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx - 1, cy - 1, r, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (def.name === 'Jupiter') {
    ctx.fillStyle = 'rgba(193, 68, 14, 0.55)';
    ctx.beginPath(); ctx.ellipse(W * 0.68, H * 0.62, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(226, 130, 80, 0.5)';
    ctx.beginPath(); ctx.ellipse(W * 0.68, H * 0.62, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  return canvasTexture(canvas);
}

function createRingTexture(colorA = '#b8a888', colorB = '#efe6cf') {
  const W = 512, H = 32;
  const [canvas, ctx] = makeCanvas(W, H);
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const n = fbm(t * 26, 0.5, 77, 4);
    let alpha = 0.12 + n * 0.8;
    if (t > 0.60 && t < 0.67) alpha *= 0.12;
    if (t < 0.06) alpha *= t / 0.06;
    if (t > 0.94) alpha *= (1 - t) / 0.06;
    cA.set(colorA).lerp(cB.set(colorB), fbm(t * 9, 3.5, 78, 3));
    ctx.fillStyle = `rgba(${cA.r * 255 | 0}, ${cA.g * 255 | 0}, ${cA.b * 255 | 0}, ${alpha.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, H);
  }
  return canvasTexture(canvas);
}

let pointSpriteTex;
function createPointSpriteTexture() {
  if (pointSpriteTex) return pointSpriteTex;
  const S = 64;
  const [canvas, ctx] = makeCanvas(S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  pointSpriteTex = new THREE.CanvasTexture(canvas);
  return pointSpriteTex;
}

function createGlowTexture(inner, mid, outer) {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, mid);
  grad.addColorStop(0.6, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}

// Soft blotchy nebula sprite texture (fbm alpha).
function createNebulaTexture(seed) {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const dx = x / S - 0.5, dy = y / S - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = fbm(x / 42, y / 42, seed, 5);
      const a = Math.max(0, (n - 0.32) * 1.6) * Math.max(0, 1 - d * d);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function createShockTexture() {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(0.75, 'rgba(255,220,170,0.9)');
  grad.addColorStop(0.9, 'rgba(255,150,80,0.4)');
  grad.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(canvas);
}

/* ================================================================
   REMOTE TEXTURES (progressive: procedural shows instantly, real map
   swaps in when the CDN answers; offline just keeps the procedural)
   ================================================================ */

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');

function upgradeTexture(material, file, slot = 'map', asColor = true) {
  if (!file) return;
  texLoader.load(TEX_BASE + file, (tex) => {
    if (destroyed) { tex.dispose(); return; }
    if (asColor) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material[slot] = tex;
    if (slot === 'bumpMap') material.bumpScale = 0.05;
    material.needsUpdate = true;
  }, undefined, () => { /* offline / 404 → keep procedural fallback */ });
}

/* ================================================================
   SCENE, POST-PROCESSING
   ================================================================ */

let renderer, scene, camera, controls, composer, labelRenderer;
let bloomPass, fxaaPass, lensingPass, sunLight, ambientLight;

// Screen-space gravitational lensing for the black hole.
// ponytail: a UV pinch around the hole's screen position — real ray-traced
// lensing needs a full GR shader; this reads right at a glance.
// Soft-clamps HDR color before the bloom pass. Unbounded emissives (sun,
// photon rings) saturate UnrealBloom's low-res mips so hard that the blur
// kernel's cutoff shows as a square plateau at high strength; bounding the
// input keeps the Gaussian falloff smooth at every intensity.
function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[CONFIG.quality].pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = QUALITY[CONFIG.quality].shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 9000);
  camera.position.copy(CONFIG.homeCam);
  scene.add(camera);   // camera children (title-screen mode preview) must render

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2;
  controls.maxDistance = 1500;
  controls.rotateSpeed = CONFIG.rotationSpeed;
  controls.panSpeed = CONFIG.panSpeed;
  controls.zoomSpeed = CONFIG.zoomSpeed;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.screenSpacePanning = true;

  ambientLight = new THREE.AmbientLight(0x8899bb, 0.55);
  scene.add(ambientLight);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.id = 'labels';
  root.appendChild(labelRenderer.domElement);

  scope.listen(window, 'resize', onResize);
}

function setupPostFX() {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY[CONFIG.quality].pixelRatio));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(BloomClampShader));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
  composer.addPass(bloomPass);
  lensingPass = new ShaderPass(LensingShader);
  composer.addPass(lensingPass);
  composer.addPass(new OutputPass());
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.enabled = CONFIG.antialiasing;
  composer.addPass(fxaaPass);
  setFXAASize();
}

function setFXAASize() {
  const pr = Math.min(window.devicePixelRatio, QUALITY[CONFIG.quality].pixelRatio);
  fxaaPass.material.uniforms.resolution.value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  setFXAASize();
}

function applyQuality() {
  const q = QUALITY[CONFIG.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  composer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  fxaaPass.enabled = CONFIG.antialiasing;
  if (sunLight) sunLight.castShadow = q.shadows;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  setFXAASize();
  onResize();
}

/* ================================================================
   ATMOSPHERE SHADER (fresnel rim glow shell)
   ================================================================ */

function makeAtmosphere(radius, color, intensity) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
        gl_FragColor = vec4(uColor, rim * uIntensity);
      }`,
    transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.BackSide, depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 48, 24), mat);
}

/* ================================================================
   GALAXY STATE
   ================================================================ */

let galaxyGroup = null;        // everything owned by the current galaxy
let currentGalaxy = 0;
let planets = [];              // rail or dynamic planet records
let dynBodies = [];            // comets / asteroids / debris / projectiles
let blackHoles = [];
let effects = [];              // transient visual effects
let trailsGroup, belt, beltDust, sunRec, sunMesh, sunGroup, coronaSprites = [];
const starLayers = [];
let nebulaGroup, dustField;
const pickTargets = [];
const byMesh = new Map();
let distantGalaxies = [];               // far imposters of the OTHER galaxies
const discoveredGalaxies = new Set();   // names already toasted this session
let simDays = simDaysFromDate(SESSION_START_MS);
let playbackDirection = 1;
let selectedRecord = null;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const pointerPar = new THREE.Vector2();

const STAR_LAYER_DEFS = [
  { count: 3600, rMin: 1150, rMax: 1750, size: 2.6, bright: 1.0,  parallax: 30 },
  { count: 3200, rMin: 1850, rMax: 2550, size: 1.9, bright: 0.78, parallax: 13 },
  { count: 2800, rMin: 2650, rMax: 3400, size: 1.4, bright: 0.6,  parallax: 5 },
];

/* ================================================================
   BODIES
   ================================================================ */

function makeLabel(text, offsetY) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.set(0, offsetY, 0);
  return label;
}

function createStar(starDef) {
  sunGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: createPlanetTexture({ tex: 'sun', name: 'Star', colorA: starDef.colorA, colorB: starDef.colorB, colors: [] }, 999),
  });
  mat.color.setRGB(...starDef.boost);
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(starDef.radius, 48, 24), mat);
  sunGroup.add(sunMesh);

  const coronaTex = createGlowTexture('rgba(255,220,160,1)', 'rgba(255,160,60,0.45)', 'rgba(255,100,30,0.12)');
  coronaSprites = [];
  for (const [scale, opacity, tint] of [[starDef.radius * 5.2, 0.7, 0xffb45e], [starDef.radius * 8.7, 0.32, 0xff7a2a]]) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex, color: tint, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.scale.setScalar(scale);
    sprite.userData.baseScale = scale;
    sunGroup.add(sprite);
    coronaSprites.push(sprite);
  }

  // sunlight — decay 0 so the outer planets stay lit; shadows give eclipses
  sunLight = new THREE.PointLight(starDef.light, 2.6, 0, 0);
  sunLight.castShadow = QUALITY[CONFIG.quality].shadows;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = starDef.radius * 1.2;
  sunLight.shadow.camera.far = 900;
  sunLight.shadow.bias = -0.002;
  sunGroup.add(sunLight);

  // lens flare on the star
  const flare = new Lensflare();
  flare.addElement(new LensflareElement(createGlowTexture('rgba(255,240,200,1)', 'rgba(255,180,90,0.35)', 'rgba(255,120,40,0.08)'), 380, 0));
  flare.addElement(new LensflareElement(createGlowTexture('rgba(180,210,255,0.6)', 'rgba(140,180,255,0.2)', 'rgba(100,140,255,0.04)'), 90, 0.35));
  flare.addElement(new LensflareElement(createGlowTexture('rgba(255,200,150,0.5)', 'rgba(255,170,110,0.15)', 'rgba(255,140,80,0.03)'), 130, 0.62));
  flare.addElement(new LensflareElement(createGlowTexture('rgba(200,220,255,0.4)', 'rgba(170,200,255,0.12)', 'rgba(140,170,255,0.02)'), 60, 0.9));
  sunLight.add(flare);

  sunGroup.add(makeLabel('Star', starDef.radius + 5));
  galaxyGroup.add(sunGroup);
  return { name: 'Star', isSun: true, anchor: sunGroup, geoR: starDef.radius, visible: true, GM: GM_SUN };
}

function createPlanet(def, index) {
  const anchor = new THREE.Group();
  const tiltG = new THREE.Group();
  tiltG.rotation.z = THREE.MathUtils.degToRad(def.tiltDeg || 0);
  tiltG.scale.setScalar(CONFIG.planetScale);
  anchor.add(tiltG);

  const geoR = geoRadius(def.radiusE);
  const mat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture(def, index * 37 + 5),
    roughness: 0.92, metalness: 0.02,
  });
  upgradeTexture(mat, def.map, 'map', true);
  upgradeTexture(mat, def.bump, 'bumpMap', false);

  // LOD: full sphere near, light sphere far
  const hi = new THREE.Mesh(new THREE.SphereGeometry(geoR, 48, 24), mat);
  const lo = new THREE.Mesh(new THREE.SphereGeometry(geoR, 16, 8), mat);
  hi.castShadow = hi.receiveShadow = true;
  const lod = new THREE.LOD();
  lod.addLevel(hi, 0);
  lod.addLevel(lo, 380);
  tiltG.add(lod);

  const rec = {
    def, anchor, tiltG, mesh: hi, lod, geoR,
    theta0: index * 2.39996,
    visible: true,
    mode: 'rail',                    // 'rail' | 'dynamic'
    vel: new THREE.Vector3(),
    GM: def.radiusE * 0.012,         // small mass so projectiles feel planets
    craters: [],
  };

  if (def.atmo) {
    tiltG.add(makeAtmosphere(geoR, def.atmo.color, def.atmo.intensity));
  }
  if (def.clouds) {
    const cloudMat = new THREE.MeshStandardMaterial({
      map: createPlanetTexture({ tex: 'venus', colors: ['#ffffff', '#f0f4f8', '#e8f0f8'] }, 777),
      transparent: true, opacity: 0.32, roughness: 1, depthWrite: false,
    });
    upgradeTexture(cloudMat, 'earthcloudmap.jpg', 'alphaMap', false);
    rec.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(geoR * 1.02, 48, 24), cloudMat);
    tiltG.add(rec.cloudMesh);
  }
  if (def.ring) {
    const inner = geoR * def.ring.inner, outer = geoR * def.ring.outer;
    const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
    const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    const ringMat = new THREE.MeshStandardMaterial({
      map: createRingTexture(), transparent: true, side: THREE.DoubleSide,
      depthWrite: false, roughness: 1, metalness: 0, alphaTest: 0.05,
    });
    if (def.ring.map) upgradeTexture(ringMat, def.ring.map, 'map', true);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.receiveShadow = true;
    ring.rotation.x = Math.PI / 2;
    tiltG.add(ring);
  }
  rec.moons = [];
  for (const mdef of def.moons || []) addMoon(rec, mdef);

  rec.label = makeLabel(def.name, geoR * CONFIG.planetScale + 2.5);
  anchor.add(rec.label);
  galaxyGroup.add(anchor);
  return rec;
}

// Natural satellite. The mesh is fixed in the pivot frame, so the same face
// points at the planet all orbit long — tidal locking for free.
function addMoon(rec, mdef) {
  const pivot = new THREE.Group();
  pivot.rotation.x = THREE.MathUtils.degToRad(mdef.inc || 0);
  const phase0 = [...(rec.def.name + '/' + mdef.name)]
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) / 4294967296 * Math.PI * 2;
  pivot.rotation.y = phase0;
  const moonMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture({ tex: 'rocky', name: mdef.name, colors: mdef.colors || ['#9c9890', '#6e6a64', '#c4bfb6'] }, 500 + Math.floor(mdef.dist * 31)),
    roughness: 1, metalness: 0,
  });
  upgradeTexture(moonMat, mdef.map, 'map', true);
  upgradeTexture(moonMat, mdef.bump, 'bumpMap', false);
  const geoR = geoRadius(mdef.radiusE);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(geoR, 24, 12), moonMat);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.scale.setScalar(CONFIG.planetScale);
  mesh.position.x = mdef.dist;
  pivot.add(mesh);
  rec.anchor.add(pivot);
  const m = {
    def: mdef, host: rec, pivot, mesh, geoR, craters: [],
    alive: true, visible: true, name: mdef.name, isMoon: true, anchor: mesh, phase0,
  };
  rec.moons.push(m);
  pickTargets.push(mesh);
  byMesh.set(mesh, m);
  camTargetsDirty = true;
  return m;
}

// Illumination fraction + waxing/waning, from the sun–planet–moon geometry.
function moonPhase(m) {
  if (!sunRec) return { f: 0.5, waxing: true, name: 'Half-lit' };
  m.mesh.getWorldPosition(_v1);
  const toSun = _v2.copy(m.host.anchor.position).negate().normalize();
  const toMoon = _v3.copy(_v1).sub(m.host.anchor.position).normalize();
  const cos = toMoon.dot(toSun);
  const f = (1 - cos) / 2; // 0 = new (moon sunward), 1 = full
  const waxing = toSun.cross(toMoon).y < 0;
  const name =
    f < 0.04 ? 'New' :
    f > 0.96 ? 'Full' :
    f > 0.45 && f < 0.55 ? (waxing ? 'First quarter' : 'Last quarter') :
    f < 0.5 ? (waxing ? 'Waxing crescent' : 'Waning crescent')
            : (waxing ? 'Waxing gibbous' : 'Waning gibbous');
  return { f, waxing, name };
}

// Eclipse events: moon crossing the sun–planet line raises a toast; at high
// quality the shadow itself is already rendered by the shadow map.
const eclipseCooldowns = new Map();
function checkEclipses(force = false) {
  if (!sunRec || (!force && !CONFIG.eclipses)) return;
  // At game timescales alignments happen constantly (a dozen moons, some
  // crossing the sun line many times per second), so automatic reporting
  // gets one global toast per 45 s, and each pair stays quiet for 5 min.
  // A forced (manual) check reports everything unconditionally.
  const now = Date.now();
  let budget = force || (toastCooldowns.get('ecl-global') || 0) <= now;
  const report = (key, message, color) => {
    if (force) { toast(message, color); return; }
    if (!budget) return;
    if (toastOnce(key, message, color, 300000)) {
      budget = false;
      toastCooldowns.set('ecl-global', now + 45000);
    }
  };
  for (const rec of planets) {
    if (!rec.visible || rec.destroyed || !rec.moons.length) continue;
    const planetPos = rec.anchor.position;
    const dPlanet = planetPos.length();
    if (dPlanet < 1) continue;
    _v2.copy(planetPos).divideScalar(dPlanet); // unit sun→planet
    for (const m of rec.moons) {
      if (!m.alive) continue;
      m.mesh.getWorldPosition(_v1);
      const proj = _v1.dot(_v2);
      const lateral = _v3.copy(_v1).addScaledVector(_v2, -proj).length();
      if (lateral > rec.geoR * CONFIG.planetScale * 0.85) continue;
      if (proj < dPlanet) {
        report('ecl-s-' + rec.def.name + m.name, 'Solar eclipse — ' + m.name + '’s shadow is crossing ' + rec.def.name, '#e8c87a');
      } else {
        report('ecl-l-' + rec.def.name + m.name, 'Lunar eclipse — ' + m.name + ' has entered ' + rec.def.name + '’s shadow', '#c9a0ff');
      }
    }
  }
}

// Manual eclipse: park a living moon on the sun→planet line so a real
// eclipse happens (shadow included at high quality), then report it.
function triggerSolarEclipse() {
  if (!sunRec) {
    toast('No star in this galaxy — eclipses need sunlight', '#ff9a6a');
    return;
  }
  const candidates = planets.filter(rec =>
    rec.visible && !rec.destroyed && rec.moons.some(m => m.alive));
  const rec = candidates.find(r => r === cameraState.target)
    || candidates.find(r => r.def.name === 'Earth')
    || candidates[0];
  if (!rec) {
    toast('No living moon available to cast an eclipse', '#ff9a6a');
    return;
  }
  const moon = rec.moons.find(m => m.alive);
  const dir = _v1.copy(rec.anchor.position).multiplyScalar(-1).normalize(); // planet → sun
  moon.pivot.rotation.y = Math.atan2(-dir.z, dir.x);
  checkEclipses(true); // force the report even while automatic eclipses are off
  flyTo(rec);
}

/* ================================================================
   PARTICLE SYSTEMS
   ================================================================ */

function fillTrailPositions(arr, def) {
  const v = new THREE.Vector3();
  const n = arr.length / 3;
  for (let i = 0; i < n; i++) {
    orbitPos(def, (i / n) * Math.PI * 2, v);
    arr[i * 3]     = v.x + (Math.random() - 0.5) * 0.35;
    arr[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
    arr[i * 3 + 2] = v.z + (Math.random() - 0.5) * 0.35;
  }
}

function createOrbitTrail(def) {
  const n = Math.floor(TRAIL_POINTS * density());
  const positions = new Float32Array(n * 3);
  fillTrailPositions(positions, def);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: def.trail || '#8899aa', size: 0.5,
    transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
}

function createStarfieldFor(g) {
  starLayers.length = 0;
  for (const L of STAR_LAYER_DEFS) {
    const count = Math.floor(L.count * density() * g.starDensity);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = L.rMin + Math.random() * (L.rMax - L.rMin);
      pos[i * 3] = s * Math.cos(phi) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(phi) * r;
      const warm = Math.random();
      cA.setRGB((0.75 + warm * 0.25) * g.starTint[0], 0.8 * g.starTint[1], (1.0 - warm * 0.3) * g.starTint[2]);
      const brightness = Math.random() < 0.03 * L.bright ? 1.8 : (0.5 + Math.random() * 0.7) * L.bright;
      col[i * 3] = cA.r * brightness;
      col[i * 3 + 1] = cA.g * brightness;
      col[i * 3 + 2] = cA.b * brightness;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const layer = new THREE.Points(geo, new THREE.PointsMaterial({
      map: createPointSpriteTexture(), size: L.size, sizeAttenuation: false,
      vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    layer.userData.parallax = L.parallax;
    galaxyGroup.add(layer);
    starLayers.push(layer);
  }
}

function createNebulas(g) {
  nebulaGroup = new THREE.Group();
  let seed = 40;
  for (const [color, opacity] of g.nebulas) {
    for (let k = 0; k < 4; k++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createNebulaTexture(seed += 13), color,
        transparent: true, opacity: opacity * (0.7 + Math.random() * 0.5),
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const u = Math.random() * 2 - 1, phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u), r = 900 + Math.random() * 900;
      sprite.position.set(s * Math.cos(phi) * r, u * r * 0.7, s * Math.sin(phi) * r);
      sprite.scale.setScalar(500 + Math.random() * 700);
      nebulaGroup.add(sprite);
    }
  }
  // cosmic dust: sparse slow-drifting near-field motes
  const n = Math.floor(1000 * density());
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 700;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 200;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 700;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustField = new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: 0x8899bb, size: 0.7,
    transparent: true, opacity: 0.28, depthWrite: false, sizeAttenuation: true,
  }));
  nebulaGroup.add(dustField);

  // far dust shell: faint mid-distance motes between the system and the stars
  const nFar = Math.floor(700 * density());
  const posFar = new Float32Array(nFar * 3);
  for (let i = 0; i < nFar; i++) {
    const u = Math.random() * 2 - 1, phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u), r = 500 + Math.random() * 600;
    posFar[i * 3] = s * Math.cos(phi) * r;
    posFar[i * 3 + 1] = u * r * 0.5;
    posFar[i * 3 + 2] = s * Math.sin(phi) * r;
  }
  const geoFar = new THREE.BufferGeometry();
  geoFar.setAttribute('position', new THREE.BufferAttribute(posFar, 3));
  nebulaGroup.add(new THREE.Points(geoFar, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: 0x7788aa, size: 2.2,
    transparent: true, opacity: 0.16, depthWrite: false, sizeAttenuation: true,
  })));
  nebulaGroup.visible = CONFIG.showNebulas;
  galaxyGroup.add(nebulaGroup);
}

// Flat log-spiral star sheet — the "billions of stars" band seen from inside
// a spiral galaxy. Gated on g.spiral so other galaxies render exactly as before.
function createSpiralArms(g) {
  const s = g.spiral;
  const count = Math.floor(s.count * density());
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const rim = new THREE.Color(s.color);
  const core = new THREE.Color('#fff6e8');
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const r = s.rMin + (s.rMax - s.rMin) * Math.pow(t, 0.75);
    const theta = Math.log(r / s.rMin) / s.pitch
      + (i % s.arms) * (Math.PI * 2 / s.arms)
      + (Math.random() - 0.5) * (0.25 + t * 0.55); // ragged, loose arms (M33 look)
    pos[i * 3] = Math.cos(theta) * r;
    pos[i * 3 + 1] = (Math.random() - 0.5) * (30 + t * 60); // thin disk, flaring outward
    pos[i * 3 + 2] = Math.sin(theta) * r;
    c.lerpColors(core, rim, Math.min(1, t * 1.3)).multiplyScalar(0.55 + Math.random() * 0.45);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), size: 1.6, sizeAttenuation: false,
    vertexColors: true, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pts.rotation.x = s.tilt; // band crosses the sky instead of sitting table-flat
  galaxyGroup.add(pts);
}

// Named deep-sky landmarks (NGC 604) as oversized glowing regions on the far
// sky, labeled like the distant-galaxy imposters. Non-pickable.
function createLandmarks(g) {
  for (const lm of g.landmarks) {
    const group = new THREE.Group();
    group.position.fromArray(lm.dir).normalize().multiplyScalar(1350);
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createNebulaTexture(lm.seed), color: lm.color,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    cloud.scale.setScalar(lm.scale);
    group.add(cloud);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createPointSpriteTexture(), color: 0xfff0f6,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    core.scale.setScalar(lm.scale * 0.25);
    group.add(core);
    group.add(makeLabel(lm.name, lm.scale * 0.35));
    galaxyGroup.add(group);
  }
}

// Zodiac overlay: each galaxy build has a 50% chance of scattering 2-4 random
// zodiac constellations across the far sky (r=1400, just inside the distant-
// galaxy imposters at 1500). Stars and lines share one dossier record.
function createConstellations() {
  const picks = pickZodiac();
  if (!picks) return;
  for (const p of picks) {
    const center = new THREE.Vector3(
      Math.cos(p.pitch) * Math.cos(p.yaw),
      Math.sin(p.pitch),
      Math.cos(p.pitch) * Math.sin(p.yaw),
    );
    const right = _v1.set(0, 1, 0).cross(center).normalize();
    const up = _v2.copy(center).cross(right).normalize();
    const cosR = Math.cos(p.roll), sinR = Math.sin(p.roll);
    const world = p.sign.points.map(([x, y]) => {
      const rx = x * cosR - y * sinR, ry = x * sinR + y * cosR;
      return center.clone().multiplyScalar(1400)
        .addScaledVector(right, rx * p.scale)
        .addScaledVector(up, ry * p.scale);
    });
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(world),
      new THREE.PointsMaterial({
        map: createPointSpriteTexture(), size: 5.5, sizeAttenuation: false,
        color: 0xffffff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    const links = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(p.sign.links.flatMap(([a, b]) => [world[a], world[b]])),
      new THREE.LineBasicMaterial({
        color: 0xaac4f0, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    const label = makeLabel(p.sign.name, 0);
    label.position.copy(center).multiplyScalar(1400).addScaledVector(up, -1.3 * p.scale);
    const anchor = new THREE.Object3D();
    anchor.position.copy(center).multiplyScalar(1400);
    const record = {
      name: p.sign.name,
      isConstellation: true,
      sign: p.sign,
      geoR: p.scale,
      anchor,
      visible: true,
      alive: true,
    };
    pickTargets.push(stars);
    pickTargets.push(links);
    byMesh.set(stars, record);
    byMesh.set(links, record);
    galaxyGroup.add(anchor);
    galaxyGroup.add(stars);
    galaxyGroup.add(links);
    galaxyGroup.add(label);
  }
}

// The OTHER galaxies as far imposters: visible while exploring, pickable for
// the dossier/bottom-bar, and part of the camera targets (so the cinematic
// tour discovers them too). Fixed sky positions so each one is a landmark.
const DISTANT_GALAXY_POSES = [
  { dir: [0.55, 0.30, -0.78], tint: 0xffe6c4 },   // Milky Way seen from afar
  { dir: [-0.72, 0.22, 0.66], tint: 0xbcd0ff },   // Andromeda
  { dir: [0.28, -0.30, 0.91], tint: 0xffd9a8 },   // Messier 87
  { dir: [-0.30, -0.34, -0.89], tint: 0xa8e8de }, // Triangulum
];

function buildDistantGalaxies() {
  distantGalaxies = [];
  GALAXIES.forEach((g, i) => {
    if (i === currentGalaxy) return;
    const pose = DISTANT_GALAXY_POSES[i % DISTANT_GALAXY_POSES.length];
    const group = new THREE.Group();
    group.position.fromArray(pose.dir).normalize().multiplyScalar(1500);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture('rgba(255,244,224,1)', 'rgba(255,220,170,0.45)', 'rgba(160,170,255,0.1)'),
      color: pose.tint, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(g.type.startsWith('Elliptical') ? 150 : 120);
    group.add(glow);
    const haze = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createNebulaTexture(200 + i * 17), color: pose.tint,
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    haze.scale.set(g.type.startsWith('Elliptical') ? 230 : 320, 200, 1);
    group.add(haze);
    const record = {
      name: g.name, isGalaxy: true, galaxyIndex: i,
      mesh: glow, anchor: group, geoR: 70, visible: true, alive: true,
    };
    record.label = makeLabel(g.name, 95);
    group.add(record.label);
    galaxyGroup.add(group);
    pickTargets.push(glow);
    byMesh.set(glow, record);
    distantGalaxies.push(record);
  });
  camTargetsDirty = true;
}

// Asteroid belt: GPU-instanced rocks + a dust point layer.
function createAsteroidBelt() {
  const count = Math.floor(BELT_COUNT * density());
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8f7f, roughness: 1, metalness: 0 });
  belt = new THREE.InstancedMesh(rockGeo, rockMat, count);
  belt.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const au = new Float32Array(count), ang = new Float32Array(count), yy = new Float32Array(count), sc = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    au[i] = 2.1 + (Math.random() + Math.random()) * 0.6;
    ang[i] = Math.random() * Math.PI * 2;
    yy[i] = (Math.random() + Math.random() - 1) * 1.6;
    sc[i] = 0.1 + Math.random() * 0.32;
  }
  belt.userData = { au, ang, yy, sc };
  fillBeltMatrices();
  belt.visible = CONFIG.showBelt;
  galaxyGroup.add(belt);
}

function fillBeltMatrices() {
  const { au, ang, yy, sc } = belt.userData;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  for (let i = 0; i < au.length; i++) {
    const r = scaledDist(au[i]);
    e.set(ang[i] * 3, ang[i] * 5, 0);
    q.setFromEuler(e);
    s.setScalar(sc[i]);
    m.compose(_v1.set(Math.cos(ang[i]) * r, yy[i], Math.sin(ang[i]) * r), q, s);
    belt.setMatrixAt(i, m);
  }
  belt.instanceMatrix.needsUpdate = true;
  belt.computeBoundingSphere();
}

// Trojan swarms riding the L4/L5 points of the biggest outer planet.
let trojans = [];
function createTrojans(g) {
  trojans = [];
  if (!g.star) return;
  let host = null;
  for (const rec of planets) {
    if (rec.def.au >= 3 && (!host || rec.def.radiusE > host.def.radiusE)) host = rec;
  }
  if (!host) return;
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8574, roughness: 1, metalness: 0 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const side of [1, -1]) {
    const count = Math.floor(90 * density());
    const inst = new THREE.InstancedMesh(rockGeo, rockMat, count);
    inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < count; i++) {
      const ang = (Math.random() + Math.random() - 1) * 0.3;
      const rr = scaledDist(host.def.au + (Math.random() + Math.random() - 1) * 0.4);
      e.set(i * 2.1, i * 3.7, 0);
      q.setFromEuler(e);
      m.compose(_v1.set(Math.cos(ang) * rr, (Math.random() + Math.random() - 1) * 1.8, Math.sin(ang) * rr), q, _v3.setScalar(0.08 + Math.random() * 0.24));
      inst.setMatrixAt(i, m);
    }
    const group = new THREE.Group();
    group.add(inst);
    group.visible = CONFIG.showBelt;
    galaxyGroup.add(group);
    trojans.push({ group, host, offset: side * Math.PI / 3 });
  }
}

function updateTrojans() {
  for (const t of trojans) {
    if (t.host.destroyed || !t.host.visible) { t.group.visible = false; continue; }
    t.group.visible = CONFIG.showBelt;
    const p = t.host.anchor.position;
    t.group.rotation.y = -Math.atan2(p.z, p.x) - t.offset;
  }
}

/* ================================================================
   PHYSICS — free bodies under gravity (comets, asteroids, debris)
   ================================================================ */

function attractors() {
  const list = [];
  if (sunRec) list.push({ pos: _v1.set(0, 0, 0), GM: GM_SUN });
  for (const bh of blackHoles) list.push({ pos: bh.mesh.position, GM: bh.GM });
  return list;
}

const _acc = new THREE.Vector3(), _d = new THREE.Vector3();

function gravityAt(p, out) {
  out.set(0, 0, 0);
  if (sunRec) {
    _d.copy(p).negate();
    const r2 = Math.max(_d.lengthSq(), 4);
    out.addScaledVector(_d.normalize(), GM_SUN * CONFIG.gravityMult / r2);
  }
  for (const bh of blackHoles) {
    _d.copy(bh.mesh.position).sub(p);
    const r2 = Math.max(_d.lengthSq(), 1);
    out.addScaledVector(_d.normalize(), bh.GM * CONFIG.gravityMult / r2);
  }
  for (const rec of planets) {
    if (!rec.visible) continue;
    _d.copy(rec.anchor.position).sub(p);
    const r2 = _d.lengthSq();
    if (r2 < 1 || r2 > 3600) continue; // planets only matter close by
    out.addScaledVector(_d.normalize(), rec.GM * CONFIG.gravityMult / r2);
  }
  return out;
}

// Semi-implicit Euler with substepping so perihelion whips stay stable.
function integrate(pos, vel, dDays) {
  let steps = Math.min(40, Math.max(1, Math.ceil(dDays / 0.2)));
  const h = dDays / steps;
  for (let s = 0; s < steps; s++) {
    gravityAt(pos, _acc);
    vel.addScaledVector(_acc, h);
    pos.addScaledVector(vel, h);
  }
}

// Convert a rail planet to a free dynamic body (rail velocity preserved).
function makeDynamic(rec) {
  if (rec.mode === 'dynamic') return;
  const w = Math.PI * 2 / rec.def.periodDays;
  const th = rec.theta0 + Math.PI * 2 * simDays / rec.def.periodDays;
  orbitPos(rec.def, th, _v1);
  orbitPos(rec.def, th + w * 0.1, _v2);
  rec.vel.copy(_v2).sub(_v1).divideScalar(0.1);
  rec.anchor.position.copy(_v1);
  rec.mode = 'dynamic';
  if (rec.trail) rec.trail.visible = false; // rail path no longer meaningful
}

/* ================================================================
   COMETS & SPAWNED ASTEROIDS
   ================================================================ */

// Lumpy potato rock: icosahedron with position-hashed radial displacement.
// Non-indexed verts share positions, and the noise is a pure function of the
// direction, so the surface stays watertight; unshared verts give free
// flat-shaded facets. Shared by asteroids, meteors, debris, and fragments.
function makeRockGeometry(seed = 7) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n1 = fbm(v.x * 2.3 + 11, v.y * 2.3 + 17, seed, 4);
    const n2 = fbm(v.y * 2.3 + 29, v.z * 2.3 + 5, seed + 3, 4);
    const bump = 0.72 + (n1 + n2) * 0.5;
    pos.setXYZ(i, v.x * bump * 1.15, v.y * bump * 0.82, v.z * bump);
  }
  geo.computeVertexNormals();
  return geo;
}
const rockGeoShared = makeRockGeometry();
let lastComet = null;

const COMET_STYLES = {
  blue:  { emissive: 0x335577, glow: ['rgba(210,235,255,0.9)', 'rgba(150,200,255,0.35)', 'rgba(90,150,255,0.08)'],  tail: 0x9fd0ff, crumbs: 0x7fb8ff },
  green: { emissive: 0x2a5540, glow: ['rgba(215,255,230,0.9)', 'rgba(140,235,180,0.35)', 'rgba(70,215,130,0.08)'], tail: 0x8fe8b0, crumbs: 0x7fe0a0 },
};

// Breadcrumb trail: ring buffer of past positions, shared by every free body.
function attachTrail(body, color, rate = 0.12) {
  const n = 260;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setDrawRange(0, 0);
  body.breadcrumbs = new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color, size: 0.45,
    transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
    depthWrite: false, sizeAttenuation: true,
  }));
  body.crumbIdx = 0; body.crumbCount = 0; body.crumbTimer = 0; body.crumbRate = rate;
  galaxyGroup.add(body.breadcrumbs);
}

/* Path-history trails: a ring buffer of past positions lets tail particles
   follow the exact curve the body traveled instead of a straight line. */

function attachPathHistory(body, capacity = 96) {
  body.hist = new Float32Array(capacity * 3);
  body.histHead = 0;   // index of the newest sample
  body.histCount = 0;
  body.histStep = 0.5; // min distance between samples; tail updaters retune it
}

function recordPath(body) {
  const p = body.mesh.position;
  const h = body.hist;
  const cap = h.length / 3;
  if (body.histCount) {
    const j = body.histHead * 3;
    const dx = p.x - h[j], dy = p.y - h[j + 1], dz = p.z - h[j + 2];
    if (dx * dx + dy * dy + dz * dz < body.histStep * body.histStep) return;
    body.histHead = (body.histHead + 1) % cap;
  }
  const j = body.histHead * 3;
  h[j] = p.x; h[j + 1] = p.y; h[j + 2] = p.z;
  body.histCount = Math.min(body.histCount + 1, cap);
}

// Write `count` particles into `arr`, each at arc distance dFor(i) back along
// the recorded path (newest → oldest), jittered by spreadFor(i). Past the
// oldest sample it extrapolates straight, so fresh spawns still get a full
// tail. dFor(i) must be non-decreasing in i. O(samples + particles).
function placeAlongPath(body, arr, count, dFor, spreadFor) {
  const h = body.hist, cap = h.length / 3;
  const p = body.mesh.position;
  let ax = p.x, ay = p.y, az = p.z;                  // current segment start
  let idx = body.histHead, samples = body.histCount;
  let bx = 0, by = 0, bz = 0, ux = 0, uy = 0, uz = 0;
  let segLen = 0, acc = 0, exhausted = false;

  const nextSeg = () => {
    while (samples > 0) {
      const j = idx * 3;
      bx = h[j]; by = h[j + 1]; bz = h[j + 2];
      idx = (idx - 1 + cap) % cap;
      samples--;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const l = Math.hypot(dx, dy, dz);
      if (l < 1e-6) continue;
      segLen = l; ux = dx / l; uy = dy / l; uz = dz / l;
      return;
    }
    exhausted = true;
    if (ux === 0 && uy === 0 && uz === 0) {          // no history yet: -vel
      const inv = -1 / Math.max(body.vel.length(), 1e-4);
      ux = body.vel.x * inv; uy = body.vel.y * inv; uz = body.vel.z * inv;
    }
    segLen = Infinity;                               // extrapolate straight
  };
  nextSeg();

  for (let i = 0; i < count; i++) {
    const d = dFor(i), spread = spreadFor(i);
    while (!exhausted && acc + segLen < d) {
      acc += segLen;
      ax = bx; ay = by; az = bz;
      nextSeg();
    }
    const rem = d - acc;
    arr[i * 3]     = ax + ux * rem + (Math.random() - 0.5) * spread;
    arr[i * 3 + 1] = ay + uy * rem + (Math.random() - 0.5) * spread;
    arr[i * 3 + 2] = az + uz * rem + (Math.random() - 0.5) * spread;
  }
}

// Registers a body as clickable (follow camera + dossier + mining).
let camTargetsDirty = true;
function registerBody(body, name) {
  body.name = name;
  body.isBody = true;
  body.anchor = body.mesh;
  body.geoR = body.radius;
  body.visible = true;
  dynBodies.push(body);
  pickTargets.push(body.mesh);
  byMesh.set(body.mesh, body);
  camTargetsDirty = true;
}

// Forward-integrated orbit prediction, redrawn every couple of seconds.
function makePredictLine(body) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
  geo.setDrawRange(0, 0);
  body.predict = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0x7fb8ff, transparent: true, opacity: 0.26, depthWrite: false,
  }));
  body.predictTimer = 99;
  galaxyGroup.add(body.predict);
}

function updatePredictLine(body) {
  const arr = body.predict.geometry.attributes.position.array;
  const N = arr.length / 3;
  _v1.copy(body.mesh.position);
  _v2.copy(body.vel);
  const T = Math.PI * 2 * Math.sqrt(Math.pow(body.a || 120, 3) / GM_SUN);
  const h = T / N;
  let count = 0;
  for (let i = 0; i < N; i++) {
    // substep near the star or the perihelion whip smears the line
    const steps = THREE.MathUtils.clamp(Math.ceil(h / (0.02 * _v1.length())), 1, 30);
    const hs = h / steps;
    for (let s = 0; s < steps; s++) {
      gravityAt(_v1, _acc);
      _v2.addScaledVector(_acc, hs);
      _v1.addScaledVector(_v2, hs);
    }
    arr[i * 3] = _v1.x; arr[i * 3 + 1] = _v1.y; arr[i * 3 + 2] = _v1.z;
    count++;
    if (_v1.lengthSq() > 4e6) break;
  }
  body.predict.geometry.setDrawRange(0, count);
  body.predict.geometry.attributes.position.needsUpdate = true;
  body.predict.geometry.computeBoundingSphere();
}

function spawnComet(a = 60 + Math.random() * 160, e = 0.75 + Math.random() * 0.2, color) {
  const style = COMET_STYLES[color || uiParams.cometColor] || COMET_STYLES.blue;
  const nucleus = new THREE.Mesh(rockGeoShared, new THREE.MeshStandardMaterial({
    color: 0xcfe0ee, roughness: 0.6, metalness: 0.1,
    emissive: style.emissive, emissiveIntensity: 0.4,
  }));
  nucleus.scale.setScalar(0.7);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture(...style.glow),
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(4);
  nucleus.add(glow);

  // tail: particle cone re-aimed away from the star every frame
  const n = Math.floor(320 * density());
  const tpos = new Float32Array(n * 3);
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  const tail = new THREE.Points(tgeo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: style.tail, size: 1.2,
    transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    depthWrite: false, sizeAttenuation: true,
  }));

  // start near aphelion with the correct vis-viva speed for the ellipse
  const th = Math.PI + (Math.random() - 0.5) * 1.2;
  const rA = a * (1 + e) * 0.92;
  const pos = new THREE.Vector3(Math.cos(th) * rA, (Math.random() - 0.5) * 14, Math.sin(th) * rA);
  const vMag = Math.sqrt(Math.max(0.0001, GM_SUN * (2 / rA - 1 / a)));
  const vel = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(vMag);

  nucleus.position.copy(pos);
  galaxyGroup.add(nucleus, tail);
  const body = {
    kind: 'comet', mesh: nucleus, vel, radius: 0.7, mass: 1,
    tail, tailPos: tpos, a, e, ice: 1, alive: true,
  };
  attachTrail(body, style.crumbs);
  attachPathHistory(body);
  makePredictLine(body);
  registerBody(body, 'Comet');
  lastComet = body;
  return body;
}

// Re-derive a comet's velocity when its orbital sliders change.
function retuneComet(body, a, e) {
  body.a = a; body.e = e;
  const r = Math.max(body.mesh.position.length(), 2);
  const vMag = Math.sqrt(Math.max(0.0001, GM_SUN * Math.abs(2 / r - 1 / a)));
  body.vel.setLength(vMag * (1 + (e - 0.7) * 0.2));
}

function updateCometTail(body) {
  const p = body.mesh.position;
  const r = Math.max(p.length(), 1);
  // ice sublimation: tail grows near the star (∝ 1/r²), fades far away
  const strength = THREE.MathUtils.clamp(2600 / (r * r), 0.02, 1);
  const len = 6 + strength * 46;
  const n = body.tailPos.length / 3;
  body.histStep = len / 64; // keep the recorded path spanning the whole tail
  placeAlongPath(body, body.tailPos, n,
    i => (i / n) ** 1.4 * len,
    i => 0.15 + (i / n) ** 1.4 * len * 0.13);
  body.tail.geometry.attributes.position.needsUpdate = true;
  body.tail.geometry.computeBoundingSphere();
  body.tail.material.opacity = 0.12 + strength * 0.55;
}

// Fire trail for asteroids: same particle-cone idea as the comet tail, but
// streaming opposite the velocity vector and colored like ablation heat —
// near-white at the head cooling to dark ember at the tail (additive
// blending makes the dark end fade out for free).
function attachFireTail(body) {
  attachPathHistory(body);
  const n = Math.floor(320 * density());
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    cA.set('#ffe2b0').lerp(cB.set('#ff3c00'), Math.min(1, t * 1.35));
    col[i * 3] = cA.r; col[i * 3 + 1] = cA.g; col[i * 3 + 2] = cA.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  body.fireTail = new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), vertexColors: true,
    size: 0.4 + body.radius * 0.2,
    transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
    depthWrite: false, sizeAttenuation: true,
  }));
  body.fireTailPos = pos;
  galaxyGroup.add(body.fireTail);

  // smoke plume past the burn: dim gray puffs, normal blending so they read
  // as soot rather than light
  const m = Math.floor(140 * density());
  const spos = new Float32Array(m * 3);
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  body.smokeTail = new THREE.Points(sgeo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: 0x8d867f, size: 1.4,
    transparent: true, opacity: 0.14, depthWrite: false, sizeAttenuation: true,
  }));
  body.smokeTailPos = spos;
  galaxyGroup.add(body.smokeTail);
}

function updateFireTail(body) {
  const speed = body.vel.length();
  // everything below is proportional to the rock's live visual radius, so
  // the whole trail rescales with the mesh (spawn size, impact overrides,
  // mining shrink, manual rescaling) and keeps the same trail-to-rock ratio
  const R = Math.max(0.15, body.mesh.scale.x);
  const visR = R * 1.3; // rock geometry spans ~0.8–1.6 u at scale 1
  const len = (3 + Math.min(speed * 6, 24)) * Math.max(0.8, visR);
  // the recorded path must span the smoke's far end (~1.65 × len)
  body.histStep = (1.65 * len + visR * 0.4) / 64;
  body.fireTail.material.size = 0.35 + visR * 0.45;
  const n = body.fireTailPos.length / 3;
  // fire starts at the trailing face, not the center, and sheds off the
  // whole body width, flaring toward the ember end
  placeAlongPath(body, body.fireTailPos, n,
    i => (i / n) ** 1.4 * len + visR * 0.4,
    i => visR * (0.7 + (i / n) ** 1.4 * 1.2));
  body.fireTail.geometry.attributes.position.needsUpdate = true;
  body.fireTail.geometry.computeBoundingSphere();
  body.fireTail.material.opacity = THREE.MathUtils.clamp(0.18 + speed * 0.3, 0.18, 0.65);

  // smoke rides beyond the fire, wider and lazier
  const sarr = body.smokeTailPos;
  const m = sarr.length / 3;
  placeAlongPath(body, sarr, m,
    i => (0.55 + (i / m) * 1.1) * len + visR * 0.4,
    i => visR * (1.1 + (i / m) * 1.5));
  body.smokeTail.geometry.attributes.position.needsUpdate = true;
  body.smokeTail.geometry.computeBoundingSphere();
  body.smokeTail.material.size = 0.8 + visR * 0.8;
  body.smokeTail.material.opacity = THREE.MathUtils.clamp(0.05 + speed * 0.08, 0.05, 0.18);
}

function spawnAsteroid(fromCamera) {
  const size = uiParams.astSize, mass = uiParams.astMass, speed = uiParams.astVel;
  const mesh = new THREE.Mesh(rockGeoShared, new THREE.MeshStandardMaterial({
    color: 0xa89880, roughness: 1, metalness: 0,
  }));
  mesh.scale.setScalar(size);
  mesh.castShadow = true;
  let pos, vel;
  if (fromCamera) {
    const dir = camera.getWorldDirection(new THREE.Vector3());
    pos = camera.position.clone().addScaledVector(dir, 25);
    vel = dir.multiplyScalar(speed);
  } else {
    const ang = Math.random() * Math.PI * 2;
    const r = scaledDist(2.1 + Math.random() * 1.2);
    pos = new THREE.Vector3(Math.cos(ang) * r, (Math.random() - 0.5) * 3, Math.sin(ang) * r);
    const vMag = Math.sqrt(GM_SUN / r);
    vel = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(vMag * (0.9 + Math.random() * 0.2));
  }
  mesh.position.copy(pos);
  galaxyGroup.add(mesh);
  const body = { kind: 'asteroid', mesh, vel, radius: size, mass, alive: true };
  attachTrail(body, 0xc9b48a);
  attachFireTail(body);
  registerBody(body, 'Asteroid');
  return body;
}

// Near-Earth asteroid: an eccentric orbit hugging the third planet's lane —
// prime fodder for the impact-warning system.
let neaCounter = 0;
function spawnNEA() {
  const aS = scaledDist(1) * (0.88 + Math.random() * 0.42);
  const e = 0.12 + Math.random() * 0.25;
  const th = Math.random() * Math.PI * 2;
  const r = aS * (1 + e);
  const size = 0.25 + Math.random() * 0.3;
  const mesh = new THREE.Mesh(rockGeoShared, new THREE.MeshStandardMaterial({ color: 0xb09a78, roughness: 1 }));
  mesh.scale.setScalar(size);
  mesh.castShadow = true;
  mesh.position.set(Math.cos(th) * r, (Math.random() - 0.5) * 4, Math.sin(th) * r);
  const vMag = Math.sqrt(Math.max(0.0001, GM_SUN * (2 / r - 1 / aS)));
  const vel = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)).multiplyScalar(vMag);
  galaxyGroup.add(mesh);
  const body = { kind: 'asteroid', isNEA: true, mesh, vel, radius: size, mass: 1 + Math.random() * 2, alive: true };
  attachTrail(body, 0xd8b48a);
  attachFireTail(body);
  registerBody(body, 'NEA-' + (++neaCounter));
  return body;
}

/* ================================================================
   ASTEROID MINING
   ================================================================ */

const stats = { ore: 0 };

function startMining(body) {
  if (!body || body.mining || body.mined || body.kind !== 'asteroid') return;
  const n = 90;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: 0xffd27a, size: 0.5,
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
    depthWrite: false, sizeAttenuation: true,
  }));
  galaxyGroup.add(pts);
  body.mining = {
    t: 0, dur: 12, yield: Math.round(40 + body.mass * 30),
    pts, seeds: Array.from({ length: n }, () => Math.random()),
  };
  toast('Mining operation started — extraction plume active', '#ffd27a');
}

function updateMining(body, dt) {
  const mn = body.mining;
  mn.t += dt;
  const prog = Math.min(1, mn.t / mn.dur);
  body.mesh.scale.setScalar(Math.max(0.05, body.radius * (1 - prog * 0.6)));
  const arr = mn.pts.geometry.attributes.position.array;
  const p = body.mesh.position;
  for (let i = 0; i < mn.seeds.length; i++) {
    const ph = (mn.seeds[i] + mn.t * 0.22) % 1;
    const ang = mn.seeds[i] * 40 + mn.t * 1.5;
    const rr = body.radius * 0.4 + ph * 1.4;
    arr[i * 3]     = p.x + Math.cos(ang) * rr * 0.5;
    arr[i * 3 + 1] = p.y + ph * 3.4;
    arr[i * 3 + 2] = p.z + Math.sin(ang) * rr * 0.5;
  }
  mn.pts.geometry.attributes.position.needsUpdate = true;
  mn.pts.geometry.computeBoundingSphere();
  if (prog >= 1) {
    stats.ore += mn.yield;
    galaxyGroup.remove(mn.pts);
    mn.pts.geometry.dispose();
    mn.pts.material.dispose();
    body.mining = null;
    body.mined = true;
    toast('Asteroid depleted — ' + mn.yield + ' t of ore recovered (total ' + stats.ore + ' t)', '#ffd27a');
  }
}

/* ================================================================
   METEORS — atmospheric entry, ablation, craters
   ================================================================ */

function spawnMeteorShower(rec, count = 12) {
  if (!rec || rec.destroyed || !rec.visible) return;
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3().randomDirection();
    dir.y = Math.abs(dir.y) * 0.6 + 0.2;
    dir.normalize();
    const dist = 26 + Math.random() * 26;
    const pos = rec.anchor.position.clone().addScaledVector(dir, dist);
    const speed = 1.8 + Math.random() * 1.6;
    let aim = rec.anchor.position.clone();
    if (rec.mode === 'rail') {
      const thF = rec.theta0 + Math.PI * 2 * (simDays + dist / speed) / rec.def.periodDays;
      aim = orbitPos(rec.def, thF, new THREE.Vector3());
    }
    aim.add(new THREE.Vector3().randomDirection().multiplyScalar(rec.geoR * CONFIG.planetScale * 0.5));
    const vel = aim.sub(pos).normalize().multiplyScalar(speed);
    const size = 0.14 + Math.random() * 0.2;
    const mesh = new THREE.Mesh(rockGeoShared, new THREE.MeshStandardMaterial({ color: 0x9a8a76, roughness: 1 }));
    mesh.scale.setScalar(size);
    mesh.position.copy(pos);
    galaxyGroup.add(mesh);
    const body = { kind: 'meteor', mesh, vel, radius: size, mass: 0.4, alive: true, ttl: 80, target: rec, homing: uiParams.lockOn, homingWeak: true };
    attachTrail(body, 0xffb060, 0.05);
    dynBodies.push(body);
  }
  toast('Meteor shower inbound toward ' + rec.def.name, '#ffb060');
}

// Entry heating: glow, ablation shrink, burn-up flash if nothing is left.
function updateMeteorEntry(body, dt) {
  const rec = body.target;
  if (!rec || rec.destroyed) return false;
  const d = body.mesh.position.distanceTo(rec.anchor.position);
  if (!rec.def.atmo || d > rec.geoR * CONFIG.planetScale * 1.6) return false;
  if (!body.burning) {
    body.burning = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createGlowTexture('rgba(255,225,170,1)', 'rgba(255,140,50,0.5)', 'rgba(255,90,30,0.1)'),
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(7);
    body.mesh.add(glow);
    if (body.breadcrumbs) {
      body.breadcrumbs.material.color.set(0xff7a40);
      body.breadcrumbs.material.opacity = 0.7;
    }
  }
  body.radius *= Math.pow(0.45, dt); // ablation
  body.mesh.scale.setScalar(Math.max(0.01, body.radius));
  if (body.radius < 0.05) {
    spawnExplosion(body.mesh.position.clone(), 0.35);
    removeBody(body);
    return true; // burned up before reaching the ground
  }
  return false;
}

/* ================================================================
   IMPACTS
   ================================================================ */

const uiParams = {
  astSize: 1, astMass: 2, astVel: 0.8,
  bhMass: 800,
  impSpeed: 2.5, impAngle: 0, impMass: 10, impSize: 1.5, lockOn: false,
  cometA: 140, cometE: 0.85, cometColor: 'blue',
  laserWidth: 0.4, laserPower: 120, laserDuration: 0.8, laserDestructive: true, laserColor: '#ff4a3a',
};
let laserCooldown = 0;

function launchProjectile() {
  const rec = planets[+ui('impactTarget').value];
  if (!rec || !rec.visible) return;
  const kind = ui('impactKind').value;
  const targetPos = rec.anchor.position.clone();
  const angle = THREE.MathUtils.degToRad(uiParams.impAngle);
  // spawn on a ring around the target, lead the target's rail motion
  const spawnDist = 130;
  const spawn = targetPos.clone().add(new THREE.Vector3(Math.cos(angle) * spawnDist, 34, Math.sin(angle) * spawnDist));
  const flightDays = spawnDist / uiParams.impSpeed;
  let aim = targetPos;
  if (rec.mode === 'rail') {
    const thF = rec.theta0 + Math.PI * 2 * (simDays + flightDays) / rec.def.periodDays;
    aim = orbitPos(rec.def, thF, new THREE.Vector3());
  }
  const vel = aim.clone().sub(spawn).normalize().multiplyScalar(uiParams.impSpeed);

  let body;
  if (kind === 'comet') {
    body = spawnComet(150, 0.85, ui('impCometColor').value);
    body.mesh.position.copy(spawn);
    body.vel.copy(vel);
  } else {
    body = spawnAsteroid(false);
    body.mesh.position.copy(spawn);
    body.vel.copy(vel);
    body.mesh.scale.setScalar(uiParams.impSize);
    body.radius = uiParams.impSize;
  }
  body.mass = uiParams.impMass;
  body.isProjectile = true;
  body.target = rec;
  body.homing = uiParams.lockOn;
  return body;
}

function handleImpact(body, rec) {
  const point = body.mesh.position.clone();
  // debris splashes down quietly — no craters, no new debris, or ejecta
  // cascades into an infinite spawn loop inside a single tick
  if (body.kind === 'debris') {
    removeBody(body);
    return;
  }
  const speed = body.vel.length();
  const energy = body.mass * speed * speed * (body.radius || 1);
  spawnExplosion(point, Math.min(3, 0.6 + energy * 0.02));

  if (rec && !rec.isSun && !rec.isBH) {
    const planetEnergy = rec.def.radiusE * 55;
    const frac = energy / planetEnergy;
    if (frac > 1) {
      destroyPlanet(rec, point);
    } else {
      addCrater(rec, point, Math.min(rec.geoR * 0.7, 0.25 + energy * 0.004));
      spawnDebris(point, rec, Math.min(1, frac));
      // violent-but-survivable hits leave more than a scar
      if (frac > 0.5 && !rec.debrisRing) addDebrisRing(rec);
      if (frac > 0.7) formMoon(rec, Math.min(0.3, 0.06 + frac * 0.08));
      // orbital aftermath: nudge the rail ellipse; dynamic planets take the impulse directly
      if (rec.mode === 'rail') {
        rec.def.e = Math.min(0.4, rec.def.e + energy * 0.00015);
        rec.theta0 += (Math.random() - 0.5) * 0.01 * energy * 0.01;
      } else {
        rec.vel.addScaledVector(body.vel, (body.mass * 0.02) / Math.max(1, rec.def.radiusE * 8));
      }
    }
  }
  removeBody(body);
}

// Impacts on moons: crater them or shatter them outright.
function handleMoonImpact(body, m) {
  if (body.kind === 'debris') { removeBody(body); return; }
  const point = body.mesh.position.clone();
  const speed = body.vel.length();
  const energy = body.mass * speed * speed * (body.radius || 1);
  spawnExplosion(point, Math.min(2, 0.4 + energy * 0.02));
  if (energy > Math.max(4, m.def.radiusE * 160)) destroyMoon(m, point);
  else addCrater(m, point, Math.min(m.geoR * 0.6, 0.1 + energy * 0.003));
  removeBody(body);
}

function destroyMoon(m, point) {
  if (!m.alive) return;
  m.alive = false;
  m.destroyed = true;
  m.visible = false;
  m.pivot.visible = false;
  const pi = pickTargets.indexOf(m.mesh);
  if (pi >= 0) pickTargets.splice(pi, 1);
  byMesh.delete(m.mesh);
  spawnDebris(point || m.mesh.getWorldPosition(new THREE.Vector3()), m.host, 0.5);
  toast(m.name + ' destroyed — debris scattered around ' + m.host.def.name, '#ff9a6a');
  if (focused === m || flight.focus === m) flyTo(null);
  if (infoTarget === m) closeInfoPanel();
  camTargetsDirty = true;
}

// Shared planet-death bookkeeping (fragmentation, star plunge, BH consumption).
function killPlanet(rec) {
  setPlanetVisible(rec, false, true);
  rec.destroyed = true;
  const planetPickIndex = pickTargets.indexOf(rec.mesh);
  if (planetPickIndex >= 0) pickTargets.splice(planetPickIndex, 1);
  byMesh.delete(rec.mesh);
  for (const m of rec.moons) {
    if (m.alive) {
      m.alive = false;
      m.destroyed = true;
      m.visible = false;
      m.pivot.visible = false;
    }
    const pi = pickTargets.indexOf(m.mesh);
    if (pi >= 0) pickTargets.splice(pi, 1);
    byMesh.delete(m.mesh);
    if (focused === m || (flight.active && flight.focus === m)) flyTo(null);
    if (infoTarget === m) closeInfoPanel();
  }
  refreshImpactTargets();
  refreshPlanetGrid();
  camTargetsDirty = true;
  if (infoTarget === rec) closeInfoPanel();
}

// Debris ring left behind by a near-shattering impact.
function addDebrisRing(rec) {
  if (rec.debrisRing) return;
  const inner = rec.geoR * 1.7, outer = rec.geoR * 2.7;
  const geo = new THREE.RingGeometry(inner, outer, 96, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: createRingTexture('#6d675e', '#9b938a'), transparent: true, side: THREE.DoubleSide,
    depthWrite: false, roughness: 1, metalness: 0, opacity: 0.85, alphaTest: 0.02,
  }));
  ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  ring.scale.setScalar(0.01);
  rec.tiltG.add(ring);
  rec.debrisRing = ring;
  effects.push({ kind: 'grow', obj: ring, life: 0, maxLife: 2.5, target: 1 });
  toast('Impact debris settled into a ring around ' + rec.def.name, '#c9b48a');
}

// Ejecta coalescing into a brand-new moon.
let novaCounter = 0;
function formMoon(rec, radiusE) {
  const mdef = {
    name: 'Nova-' + (++novaCounter),
    dist: rec.geoR * CONFIG.planetScale * 2.6 + 3 + rec.moons.filter(m => m.alive).length * 1.7,
    periodDays: 18 + Math.random() * 25,
    radiusE,
    inc: (Math.random() - 0.5) * 10,
    colors: ['#8a8074', '#5f584e', '#b0a698'],
  };
  const m = addMoon(rec, mdef);
  m.mesh.scale.setScalar(0.01);
  effects.push({ kind: 'grow', obj: m.mesh, life: 0, maxLife: 2.5, target: CONFIG.planetScale });
  toast('Debris coalesced into a new moon — ' + mdef.name + ' now orbits ' + rec.def.name, '#8ab8ff');
  return m;
}

// Major-body collisions: planet↔planet, planet↔moon, moon↔moon, star↔planet.
function checkMajorCollisions() {
  const list = [];
  for (const rec of planets) {
    if (!rec.visible || rec.destroyed) continue;
    list.push({ rec, isMoon: false, pos: rec.anchor.position, r: rec.geoR * CONFIG.planetScale, host: rec });
    for (const m of rec.moons) {
      if (!m.alive) continue;
      list.push({ rec: m, isMoon: true, pos: m.mesh.getWorldPosition(new THREE.Vector3()), r: m.geoR * CONFIG.planetScale, host: rec });
    }
  }
  // ponytail: O(n²) pair scan — n stays under ~30
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      if (A.host === B.host) continue; // same system: nested circular orbits can't cross
      if (A.pos.distanceTo(B.pos) < A.r + B.r) { collideMajor(A, B); return; } // one event per tick
    }
  }
  if (sunRec) {
    for (const rec of planets) {
      if (rec.destroyed || !rec.visible || rec.mode !== 'dynamic') continue;
      if (rec.anchor.position.length() < sunRec.geoR + rec.geoR * CONFIG.planetScale) {
        spawnExplosion(rec.anchor.position.clone(), 3);
        killPlanet(rec);
        toast(rec.def.name + ' has fallen into the star', '#ffb060');
        return;
      }
    }
  }
}

function collideMajor(A, B) {
  const point = A.pos.clone().add(B.pos).multiplyScalar(0.5);
  spawnExplosion(point, Math.min(4, 1 + (A.r + B.r) * 0.35));
  if (A.isMoon && B.isMoon) {
    destroyMoon(A.rec, point);
    destroyMoon(B.rec, point);
    return;
  }
  if (A.isMoon || B.isMoon) {
    const moon = A.isMoon ? A.rec : B.rec;
    const planet = A.isMoon ? B.rec : A.rec;
    destroyMoon(moon, point);
    addCrater(planet, point, Math.min(planet.geoR * 0.6, 0.3 + moon.geoR));
    spawnDebris(point, planet, 0.6);
    toast(moon.name + ' slammed into ' + planet.def.name, '#ff9a6a');
    return;
  }
  const a = A.rec, b = B.rec;
  const big = a.def.radiusE >= b.def.radiusE ? a : b;
  const small = big === a ? b : a;
  toast(small.def.name + ' collided with ' + big.def.name, '#ff6a55');
  if (big.def.radiusE / small.def.radiusE < 1.4) {
    // comparable masses: mutual destruction
    destroyPlanet(a, point);
    destroyPlanet(b, point);
    return;
  }
  destroyPlanet(small, point);
  addCrater(big, point, Math.min(big.geoR * 0.7, 0.5 + small.geoR * 0.8));
  spawnDebris(point, big, 1);
  addDebrisRing(big);
  formMoon(big, Math.max(0.08, small.def.radiusE * 0.18));
  if (big.mode === 'rail') {
    big.def.e = Math.min(0.4, big.def.e + 0.02 + small.def.radiusE * 0.004);
  } else if (small.mode === 'dynamic') {
    big.vel.addScaledVector(_v1.copy(small.vel).sub(big.vel), small.def.radiusE / (small.def.radiusE + big.def.radiusE) * 0.5);
  }
}

function addCrater(rec, worldPoint, size) {
  const local = rec.mesh.worldToLocal(worldPoint.clone());
  local.setLength(rec.geoR * 1.001);
  const crater = new THREE.Mesh(
    new THREE.CircleGeometry(size, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  crater.position.copy(local);
  crater.lookAt(local.clone().multiplyScalar(2));
  rec.mesh.add(crater);
  rec.craters.push(crater);
}

function destroyPlanet(rec, point) {
  spawnExplosion(rec.anchor.position.clone(), 4);
  // shatter: instanced fragments inherit orbital velocity + blast
  const count = 90;
  const frag = new THREE.InstancedMesh(rockGeoShared,
    new THREE.MeshStandardMaterial({ color: 0x776655, roughness: 1 }), count);
  const vels = [], mats = [];
  const baseVel = new THREE.Vector3();
  if (rec.mode === 'dynamic') baseVel.copy(rec.vel);
  else {
    const w = Math.PI * 2 / rec.def.periodDays;
    const th = rec.theta0 + Math.PI * 2 * simDays / rec.def.periodDays;
    orbitPos(rec.def, th + w * 0.1, _v2);
    orbitPos(rec.def, th, _v1);
    baseVel.copy(_v2).sub(_v1).divideScalar(0.1);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3().randomDirection();
    const p = rec.anchor.position.clone().addScaledVector(dir, Math.random() * rec.geoR * CONFIG.planetScale);
    const s = 0.12 + Math.random() * 0.45 * rec.geoR;
    q.random();
    m.compose(p, q, _v3.setScalar(s));
    frag.setMatrixAt(i, m);
    vels.push(baseVel.clone().addScaledVector(dir, 0.15 + Math.random() * 0.5));
    mats.push({ p, q: q.clone(), s });
  }
  galaxyGroup.add(frag);
  effects.push({ kind: 'fragments', mesh: frag, vels, mats, life: 0, maxLife: 60 });
  killPlanet(rec);
}

function spawnExplosion(point, scale = 1) {
  // flash
  const light = new THREE.PointLight(0xffcc88, 30 * scale, 300, 1.4);
  light.position.copy(point);
  galaxyGroup.add(light);
  effects.push({ kind: 'flash', light, life: 0, maxLife: 0.9 });

  // fireball burst
  const n = Math.floor(240 * density() * scale);
  const pos = new Float32Array(n * 3);
  const vels = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = new THREE.Vector3().randomDirection().multiplyScalar(0.3 + Math.random() * 1.6);
    pos[i * 3] = point.x; pos[i * 3 + 1] = point.y; pos[i * 3 + 2] = point.z;
    vels[i * 3] = d.x; vels[i * 3 + 1] = d.y; vels[i * 3 + 2] = d.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: createPointSpriteTexture(), color: 0xffb060, size: 1.6 * scale,
    transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
    depthWrite: false, sizeAttenuation: true,
  }));
  galaxyGroup.add(pts);
  effects.push({ kind: 'burst', mesh: pts, vels, life: 0, maxLife: 2.2, scale });

  // shockwave ring
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createShockTexture(), color: 0xffd0a0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  ring.position.copy(point);
  ring.scale.setScalar(1);
  galaxyGroup.add(ring);
  effects.push({ kind: 'shock', mesh: ring, life: 0, maxLife: 1.6, scale });
}

function spawnDebris(point, rec, intensity) {
  const n = Math.min(Math.floor(20 + intensity * 40), Math.max(0, 600 - dynBodies.length));
  const outward = point.clone().sub(rec.anchor.position).normalize();
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(rockGeoShared, new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 1 }));
    mesh.scale.setScalar(0.08 + Math.random() * 0.28);
    // start clear of the surface so ejecta doesn't instantly re-collide
    mesh.position.copy(point).addScaledVector(outward, 0.6 + rec.geoR * CONFIG.planetScale * 0.2);
    const vel = outward.clone().multiplyScalar(0.2 + Math.random() * 0.6)
      .add(new THREE.Vector3().randomDirection().multiplyScalar(0.25));
    galaxyGroup.add(mesh);
    dynBodies.push({ kind: 'debris', mesh, vel, radius: 0.15, mass: 0.05, alive: true, ttl: 90, src: rec, born: simDays });
  }
}

// Ambient shooting star: a far-field streak sliding tangent to the sky
// sphere. Pure decoration — never a dynamic body, never collides.
function spawnShootingStar() {
  const u = Math.random() * 1.6 - 0.8, phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const r = 1300 + Math.random() * 500;
  const start = new THREE.Vector3(s * Math.cos(phi) * r, u * r, s * Math.sin(phi) * r);
  const dir = new THREE.Vector3().randomDirection().cross(start).normalize();
  const vel = dir.multiplyScalar(500 + Math.random() * 400);
  const geo = new THREE.BufferGeometry().setFromPoints([
    start, start.clone().addScaledVector(vel, -0.06),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xdfeaff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  line.frustumCulled = false; // bounding sphere goes stale as the streak moves
  galaxyGroup.add(line);
  effects.push({ kind: 'shootstar', mesh: line, vel, life: 0, maxLife: 1.1 + Math.random() * 0.5 });
}

// Beam pose shared by fire-time placement and the per-frame effect update:
// a unit cylinder (axis +Y) stretched between fx.start and fx.end.
function placeLaser(fx) {
  _v1.copy(fx.end).sub(fx.start);
  const len = Math.max(_v1.length(), 0.001);
  fx.group.position.copy(fx.start).addScaledVector(_v1, 0.5);
  fx.group.quaternion.setFromUnitVectors(_v2.set(0, 1, 0), _v1.normalize());
  fx.group.scale.set(1, len, 1);
  fx.glow.position.copy(fx.end);
}

// Instant light-speed beam from the viewpoint to the chosen planet. Damage
// lands the same frame; the beam itself is a fading effect that tracks the
// target while it lives. Timeline rebuilds do not replay laser damage (the
// laser writes nothing to the interaction log).
function fireLaser() {
  if (titleMode || laserCooldown > 0) return;
  const rec = planets[+ui('laserTarget').value];
  if (!rec || !rec.visible || rec.destroyed) return;
  laserCooldown = 0.25;

  // muzzle sits right of and below the lens so the beam reads as a beam
  const start = camera.position.clone()
    .addScaledVector(_v1.setFromMatrixColumn(camera.matrixWorld, 0), 1.5)
    .addScaledVector(_v2.setFromMatrixColumn(camera.matrixWorld, 1), -1.2);
  const dir = _v3.copy(rec.anchor.position).sub(start).normalize();
  const hit = rec.anchor.position.clone().addScaledVector(dir, -rec.geoR);

  const w = uiParams.laserWidth;
  const color = new THREE.Color(uiParams.laserColor);
  const group = new THREE.Group();
  const outerMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(w, w, 1, 10, 1, true), outerMat));
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.35, 1, 8, 1, true), coreMat));
  group.frustumCulled = false; // stretched unit cylinder: stale bounds (shootstar precedent)
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createPointSpriteTexture(), color,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(3 + w * 6);
  galaxyGroup.add(group);
  galaxyGroup.add(glow);
  const fx = {
    kind: 'laser', group, outerMat, coreMat, glow, target: rec,
    start, end: hit.clone(), life: 0, maxLife: uiParams.laserDuration,
  };
  placeLaser(fx);
  effects.push(fx);

  // damage mirrors handleImpact's ladder with energy taken straight from Power
  const energy = uiParams.laserPower;
  spawnExplosion(hit, Math.min(3, 0.6 + energy * 0.02));
  const frac = energy / (rec.def.radiusE * 55);
  if (uiParams.laserDestructive && frac > 1) {
    destroyPlanet(rec, hit);
  } else if (uiParams.laserDestructive) {
    addCrater(rec, hit, Math.min(rec.geoR * 0.7, 0.25 + energy * 0.004));
    spawnDebris(hit, rec, Math.min(1, frac));
    if (rec.mode === 'rail') rec.def.e = Math.min(0.4, rec.def.e + energy * 0.00008);
  } else {
    // non-destructive beam only scorches — no debris, no orbit change
    addCrater(rec, hit, Math.min(rec.geoR * 0.4, 0.15 + energy * 0.002));
  }
}

function removeBody(body) {
  if (!body || !body.alive) return;
  body.alive = false;
  galaxyGroup.remove(body.mesh);
  if (body.tail) galaxyGroup.remove(body.tail);
  if (body.fireTail) galaxyGroup.remove(body.fireTail);
  if (body.smokeTail) galaxyGroup.remove(body.smokeTail);
  if (body.predict) galaxyGroup.remove(body.predict);
  if (body.breadcrumbs) galaxyGroup.remove(body.breadcrumbs);
  if (body.mining && body.mining.pts) galaxyGroup.remove(body.mining.pts);
  for (const obj of [body.tail, body.fireTail, body.smokeTail, body.predict, body.breadcrumbs, body.mining && body.mining.pts]) {
    if (!obj) continue;
    obj.geometry?.dispose();
    obj.material?.dispose();
  }
  body.mesh.material?.dispose();
  const pickIndex = pickTargets.indexOf(body.mesh);
  if (pickIndex >= 0) pickTargets.splice(pickIndex, 1);
  byMesh.delete(body.mesh);
  if (selectedRecord === body) selectRecord(null);
  if (focused === body || (flight.active && flight.focus === body)) flyTo(null);
  if (infoTarget === body) closeInfoPanel();
  if (lastComet === body) lastComet = null;
  const warningCard = warningCards.get(body);
  if (warningCard) warningCard.remove();
  warningCards.delete(body);
  camTargetsDirty = true;
}

/* ================================================================
   BLACK HOLE
   ================================================================ */

function accretionDiskMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uInner; uniform float uOuter;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float ang = atan(vP.y, vP.x);
        // orbiting brightness streaks
        float streak = 0.6
          + 0.4 * sin(ang * 9.0 - uTime * 2.2 + r * 0.9)
          + 0.25 * sin(ang * 23.0 + uTime * 3.1 - r * 1.7);
        float inner = pow(1.0 - t, 2.2);
        // relativistic beaming: the approaching side glows hotter
        float doppler = 1.0 + 0.55 * sin(ang - uTime * 0.15);
        vec3 hot = vec3(1.0, 0.92, 0.75);
        vec3 cool = vec3(0.95, 0.4, 0.12);
        vec3 col = mix(cool, hot, inner) * streak * doppler * (1.5 * inner + 0.22);
        float edge = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t));
        gl_FragColor = vec4(col, edge * min(1.0, streak));
      }`,
    transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

function spawnBlackHole(massSuns, position) {
  const horizonR = Math.min(26, 2.2 + Math.pow(massSuns, 0.34) * 0.55);
  const group = new THREE.Group();
  group.position.copy(position || new THREE.Vector3(0, 0, 0));

  // event horizon
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(horizonR, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  group.add(horizon);

  // photon ring: razor-thin bright torus hugging the horizon (bloom does the glow)
  const photon = new THREE.Mesh(
    new THREE.TorusGeometry(horizonR * 1.18, horizonR * 0.035, 8, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.5) }),
  );
  photon.rotation.x = Math.PI / 2 - 0.42;
  group.add(photon);

  // accretion disk
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(horizonR * 1.35, horizonR * 4.4, 96, 1),
    accretionDiskMaterial(horizonR * 1.35, horizonR * 4.4),
  );
  disk.rotation.x = Math.PI / 2 - 0.42;
  group.add(disk);

  // dynamic glow light
  const light = new THREE.PointLight(0xff9a4a, 2.2, 600, 1.2);
  group.add(light);

  group.add(makeLabel('Black Hole', horizonR + 6));
  galaxyGroup.add(group);

  const bh = { mesh: group, disk, photon, horizonR, GM: massSuns * GM_SUN * 0.02, massSuns };
  blackHoles.push(bh);

  // gravity now owns the scene: planets leave their rails and deform naturally
  for (const rec of planets) if (!rec.destroyed) makeDynamic(rec);

  pickTargets.push(horizon);
  const record = { name: 'Black Hole', isBH: true, anchor: group, geoR: horizonR, visible: true, bh };
  bh.record = record;
  byMesh.set(horizon, record);
  camTargetsDirty = true;
  return bh;
}

function swallow(objPos, radius, onDone) {
  // objects crossing the horizon shrink and vanish
  effects.push({ kind: 'swallow', done: onDone, life: 0, maxLife: 0.5 });
  onDone();
}

/* ================================================================
   GALAXY BUILD / SWITCH
   ================================================================ */

function disposeGroup(root) {
  root.traverse(o => {
    if (o.isCSS2DObject) o.element.remove(); // orphaned label DOM would linger on screen
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k of ['map', 'bumpMap', 'alphaMap']) if (m[k] && m[k] !== pointSpriteTex) m[k].dispose();
        m.dispose();
      }
    }
  });
  scene.remove(root);
}

function buildGalaxy(index) {
  const stableSelectionKey = index === currentGalaxy ? selectionKeyFor(selectedRecord) : null;
  closeInfoPanel();
  if (galaxyGroup) disposeGroup(galaxyGroup);
  galaxyGroup = new THREE.Group();
  scene.add(galaxyGroup);

  planets = [];
  dynBodies = [];
  blackHoles = [];
  effects = [];
  coronaSprites = [];
  pickTargets.length = 0;
  byMesh.clear();
  sunRec = null; sunMesh = null; sunGroup = null; sunLight = null; lastComet = null;
  focused = null;
  // cancelling a mid-air camera flight must also restore the controls the
  // flight disabled, or orbit input stays dead after a galaxy switch
  flight.active = false;
  flight.destination = null;
  controls.enabled = !titleMode && (cameraState.mode === 'orbit' || cameraState.mode === 'follow');
  currentGalaxy = index;
  const g = GALAXIES[index];

  if (g.star) {
    sunRec = createStar(g.star);
    pickTargets.push(sunMesh);
    byMesh.set(sunMesh, sunRec);
  }

  g.planets.forEach((def, i) => {
    const rec = createPlanet(def, i);
    planets.push(rec);
    pickTargets.push(rec.mesh);
    byMesh.set(rec.mesh, rec);
  });

  trailsGroup = new THREE.Group();
  trailsGroup.visible = CONFIG.showTrails;
  for (const rec of planets) {
    if (!g.star) continue; // no rails without a central star
    rec.trail = createOrbitTrail(rec.def);
    trailsGroup.add(rec.trail);
  }
  galaxyGroup.add(trailsGroup);

  createStarfieldFor(g);
  createNebulas(g);
  if (g.spiral) createSpiralArms(g);
  if (g.landmarks) createLandmarks(g);
  buildDistantGalaxies();
  createConstellations();
  if (g.belt) createAsteroidBelt(); else belt = null;
  createTrojans(g);
  // resident near-Earth objects: opt-in via the Sim tab toggle
  if (index === 0 && CONFIG.autoNEAs) for (let i = 0; i < 5; i++) spawnNEA();

  if (g.blackHole) {
    const bh = spawnBlackHole(g.blackHole.mass, new THREE.Vector3(0, 0, 0));
    // captive planets get near-circular starting orbits around the hole
    for (const rec of planets) {
      const r = scaledDist(rec.def.au);
      const ang = rec.theta0;
      rec.anchor.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      const vMag = Math.sqrt(bh.GM / r);
      rec.vel.set(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(vMag);
      rec.mode = 'dynamic';
    }
    ambientLight.intensity = 0.35;
  } else {
    ambientLight.intensity = 0.55;
  }

  applyBaselinePose(simDays);
  restoreInteractionEvents();
  restoreSelection(stableSelectionKey);
  refreshPlanetGrid();
  refreshImpactTargets();
  refreshGalaxyInfo();
  camTargetsDirty = true;
  updateImpactWarnings();
}

function switchGalaxy(index) {
  if (index === currentGalaxy) return;
  selectRecord(null);
  setCameraMode('orbit');
  flyTo(null);
  const fade = document.getElementById('fade');
  fade.classList.add('on');
  setTimeout(() => {
    buildGalaxy(index);
    camera.position.copy(CONFIG.homeCam);
    controls.target.set(0, 0, 0);
    refreshCameraTargets();
    fade.classList.remove('on');
  }, 520);
}

/* ================================================================
   CAMERA FLIGHT & PICKING
   ================================================================ */

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 8;
raycaster.params.Line.threshold = 8;
const pointerNDC = new THREE.Vector2();
const flight = {
  active: false, t: 0, dur: 1.4, focus: null, destination: null,
  fromPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(),
};
let zodiacReturnPose = null;
let focused = null;
const focusPrevPos = new THREE.Vector3();

function viewDistance(rec) {
  if (rec.isConstellation) return rec.geoR * 3;
  if (rec.isBH) return rec.geoR * 6;
  return rec.isSun ? rec.geoR * 4 : rec.geoR * CONFIG.planetScale * 5 + 3;
}

function flyTo(rec, dur = 1.4) {
  if (cameraState.mode !== 'orbit') setCameraMode('orbit');
  flight.active = true;
  flight.t = 0;
  flight.dur = dur;
  flight.focus = rec;
  flight.destination = null;
  flight.fromPos.copy(camera.position);
  flight.fromTgt.copy(controls.target);
  focused = null;
  controls.enabled = false;
}

function flyToPose(pose, dur = 1.4) {
  if (cameraState.mode !== 'orbit') setCameraMode('orbit');
  flight.active = true;
  flight.t = 0;
  flight.dur = dur;
  flight.focus = null;
  flight.destination = pose;
  flight.fromPos.copy(camera.position);
  flight.fromTgt.copy(controls.target);
  focused = null;
  controls.enabled = false;
}

function updateFlight(dt) {
  if (flight.active) {
    flight.t = Math.min(flight.t + dt / flight.dur, 1);
    const k = THREE.MathUtils.smoothstep(flight.t, 0, 1);
    const endTgt = _v1, endPos = _v2;
    const destination = flight.destination;
    if (destination) {
      endPos.copy(destination.position);
      endTgt.copy(destination.target);
    } else if (flight.focus) {
      flight.focus.anchor.getWorldPosition(endTgt);
      const dir = _v3.copy(camera.position).sub(endTgt);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
      dir.normalize();
      if (!flight.focus.isSun && !flight.focus.isBH && endTgt.lengthSq() > 1e-6) {
        dir.multiplyScalar(0.45).addScaledVector(endTgt.clone().normalize(), -0.75);
      }
      dir.y = Math.max(dir.y, 0.25);
      dir.normalize();
      endPos.copy(endTgt).addScaledVector(dir, viewDistance(flight.focus));
    } else {
      endTgt.set(0, 0, 0);
      endPos.copy(CONFIG.homeCam);
    }
    camera.position.lerpVectors(flight.fromPos, endPos, k);
    controls.target.lerpVectors(flight.fromTgt, endTgt, k);
    if (flight.t >= 1) {
      flight.active = false;
      controls.enabled = cameraState.mode === 'orbit' || cameraState.mode === 'follow';
      flight.destination = null;
      focused = flight.focus;
      if (destination) {
        if (destination.mode !== cameraState.mode) setCameraMode(destination.mode);
        controls.target.copy(destination.target);
      } else if (focused) {
        focused.anchor.getWorldPosition(focusPrevPos);
      }
    }
  } else if (focused) {
    focused.anchor.getWorldPosition(_v1);
    camera.position.add(_v2.copy(_v1).sub(focusPrevPos));
    controls.target.copy(_v1);
    focusPrevPos.copy(_v1);
  }
}

const { CAMERA_MODES, CAMERA_MODE_LABELS, CAMERA_HINTS } = createCameraMetadata();

const cameraState = {
  mode: 'orbit',
  targets: [],
  target: null,
  targetInvalidated: false,
  keys: new Set(),
  elapsed: 0,
  cinematicIndex: 0,
  cinematicTimer: 0,
  cineLook: new THREE.Vector3(),
  zoom: 7.8,
  yaw: 0,
  pitch: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  followLast: new THREE.Vector3(),
};

function isCameraTargetLive(record) {
  if (!record || record.destroyed || record.alive === false || record.visible === false) return false;
  if (record.isSun) return record === sunRec;
  if (record.isBH) return !!record.bh && blackHoles.includes(record.bh);
  if (record.isMoon) {
    return !!record.host && !record.host.destroyed && record.host.visible && record.host.moons.includes(record);
  }
  if (record.isGalaxy) return distantGalaxies.includes(record);
  if (record.kind) return dynBodies.includes(record);
  return planets.includes(record);
}

function cameraTargetRadius(record) {
  if (!record) return 1;
  if (record.isSun || record.isBH || record.kind) {
    return Math.max(0.15, record.geoR || record.radius || 1);
  }
  return Math.max(0.15, (record.geoR || 1) * CONFIG.planetScale);
}

function cameraTargetPosition(record, out = new THREE.Vector3()) {
  if (!record?.anchor) return out.set(0, 0, 0);
  return record.anchor.getWorldPosition(out);
}

function syncCameraTargetSelect() {
  const select = ui('camTarget');
  if (!select) return;
  const index = cameraState.targets.indexOf(cameraState.target);
  if (index >= 0) select.value = String(index);
}

function refreshCameraTargets() {
  const previous = cameraState.target;
  const targets = [];
  const add = record => {
    if (isCameraTargetLive(record) && !targets.includes(record)) targets.push(record);
  };

  add(sunRec);
  for (const planet of planets) {
    add(planet);
    for (const moon of planet.moons || []) add(moon);
  }
  for (const body of dynBodies) {
    if (body.isBody) add(body);
  }
  for (const record of byMesh.values()) {
    if (record.isBH) add(record);
  }
  for (const record of distantGalaxies) add(record);

  cameraState.targets = targets;
  cameraState.targetInvalidated =
    cameraState.mode !== 'orbit' && cameraState.mode !== 'free'
    && !!previous && !targets.includes(previous);
  cameraState.target = targets.includes(previous)
    ? previous
    : targets.find(record => record.def?.name === 'Earth')
      || targets.find(record => planets.includes(record))
      || targets[0] || null;

  const select = ui('camTarget');
  if (select) {
    select.replaceChildren();
    targets.forEach((record, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = bodyDisplayName(record) + ' · ' + bodyTypeLabel(record);
      select.appendChild(option);
    });
    select.disabled = targets.length === 0;
    syncCameraTargetSelect();
  }
  camTargetsDirty = false;
  return targets;
}

function setCameraMode(mode) {
  if (!CAMERA_MODES.has(mode)) return false;
  if (camTargetsDirty) refreshCameraTargets();

  const selected = cameraState.targets[Number(ui('camTarget')?.value)];
  if (isCameraTargetLive(selected)) cameraState.target = selected;

  if (mode !== 'orbit' && mode !== 'free' && !isCameraTargetLive(cameraState.target)) {
    toast('This camera mode needs a living target', '#ff9a6a');
    mode = 'orbit';
  }

  flight.active = false;
  flight.destination = null;
  focused = null;
  cameraState.mode = mode;
  cameraState.targetInvalidated = false;
  cameraState.dragging = false;
  cameraState.keys.clear();
  cameraState.elapsed = 0;
  cameraState.cinematicTimer = 0;
  camera.up.set(0, 1, 0);
  camera.fov = 55;
  camera.updateProjectionMatrix();

  const targetPos = cameraTargetPosition(cameraState.target, _v1);
  if (mode === 'orbit') {
    controls.target.copy(isCameraTargetLive(cameraState.target) ? targetPos : _v1.set(0, 0, 0));
  } else if (mode === 'follow') {
    cameraState.followLast.copy(targetPos);
    controls.target.copy(targetPos);
  } else if (mode === 'free') {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    cameraState.pitch = euler.x;
    cameraState.yaw = euler.y;
  } else if (mode === 'cinematic') {
    // seed the damped look point from the current view so entry doesn't snap
    camera.getWorldDirection(_v2);
    cameraState.cineLook.copy(camera.position).addScaledVector(_v2, 30);
  }

  controls.enabled = !titleMode && (mode === 'orbit' || mode === 'follow');
  ui('teleOverlay').classList.toggle('on', mode === 'telescope');
  ui('cinebars').classList.toggle('on', mode === 'cinematic');
  ui('teleZoomRow').hidden = mode !== 'telescope';
  ui('modeChip').classList.toggle('on', mode !== 'orbit');
  ui('modeChipLabel').textContent = CAMERA_MODE_LABELS[mode];
  ui('camHint').textContent = CAMERA_HINTS[mode];
  for (const button of document.querySelectorAll('.cam-btn')) {
    const active = button.dataset.cam === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (mode !== 'telescope') ui('teleReadout').textContent = '';
  return true;
}

function updateCameraMode(dt) {
  if (titleMode || cameraState.mode === 'orbit') return;
  if (camTargetsDirty) refreshCameraTargets();

  if (cameraState.targetInvalidated || (cameraState.mode !== 'free' && !isCameraTargetLive(cameraState.target))) {
    setCameraMode('orbit');
    toast('Camera target is no longer available', '#ff9a6a');
    return;
  }

  cameraState.elapsed += dt;
  let targetPos = cameraTargetPosition(cameraState.target, _v1);
  let radius = cameraTargetRadius(cameraState.target);

  if (cameraState.mode === 'free') {
    const speed = (cameraState.keys.has('ShiftLeft') || cameraState.keys.has('ShiftRight') ? 75 : 32)
      * CONFIG.cameraSpeed * dt;
    const forward = camera.getWorldDirection(_v2);
    const right = _v3.crossVectors(forward, camera.up).normalize();
    if (cameraState.keys.has('KeyW')) camera.position.addScaledVector(forward, speed);
    if (cameraState.keys.has('KeyS')) camera.position.addScaledVector(forward, -speed);
    if (cameraState.keys.has('KeyA')) camera.position.addScaledVector(right, -speed);
    if (cameraState.keys.has('KeyD')) camera.position.addScaledVector(right, speed);
    if (cameraState.keys.has('Space')) camera.position.y += speed;
    if (cameraState.keys.has('ControlLeft') || cameraState.keys.has('ControlRight')) camera.position.y -= speed;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(cameraState.pitch, cameraState.yaw, 0);
  } else if (cameraState.mode === 'follow') {
    const delta = _v2.copy(targetPos).sub(cameraState.followLast);
    camera.position.add(delta);
    controls.target.copy(targetPos);
    cameraState.followLast.copy(targetPos);
  } else if (cameraState.mode === 'cinematic') {
    cameraState.cinematicTimer += dt;
    if (cameraState.cinematicTimer > 8 && cameraState.targets.length > 1) {
      cameraState.cinematicTimer = 0;
      cameraState.cinematicIndex = (cameraState.targets.indexOf(cameraState.target) + 1) % cameraState.targets.length;
      cameraState.target = cameraState.targets[cameraState.cinematicIndex];
      syncCameraTargetSelect();
      targetPos = cameraTargetPosition(cameraState.target, _v1);
      radius = cameraTargetRadius(cameraState.target);
    }
    const distance = Math.max(radius * 6, 9);
    const angle = cameraState.elapsed * 0.18;
    _v2.set(
      targetPos.x + Math.cos(angle) * distance,
      targetPos.y + distance * (0.25 + Math.sin(angle * 0.7) * 0.12),
      targetPos.z + Math.sin(angle) * distance,
    );
    // damped travel: target swaps sweep over ~2 s instead of teleporting
    const k = 1 - Math.exp(-dt * 1.6);
    camera.position.lerp(_v2, k);
    cameraState.cineLook.lerp(targetPos, k);
    camera.lookAt(cameraState.cineLook);
  } else if (cameraState.mode === 'drone') {
    const distance = Math.max(radius * 3.2, 4);
    const angle = cameraState.elapsed * 0.42;
    camera.position.set(
      targetPos.x + Math.cos(angle) * distance,
      targetPos.y + distance * (0.22 + Math.sin(cameraState.elapsed * 1.7) * 0.035),
      targetPos.z + Math.sin(angle) * distance,
    );
    camera.lookAt(targetPos);
  } else if (cameraState.mode === 'telescope') {
    camera.fov = THREE.MathUtils.clamp(34 / cameraState.zoom, 2, 45);
    camera.updateProjectionMatrix();
    camera.lookAt(targetPos);
    ui('teleReadout').textContent =
      bodyDisplayName(cameraState.target) + '  ·  ' + cameraState.zoom.toFixed(1) + '×  ·  '
      + camera.position.distanceTo(targetPos).toFixed(1) + ' u';
  }
}

function setupPicking() {
  let downX = 0, downY = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downX = e.clientX; downY = e.clientY;
    if (e.button === 0 && cameraState.mode === 'free') {
      cameraState.dragging = true;
      cameraState.lastX = e.clientX;
      cameraState.lastY = e.clientY;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    }
    if (e.button === 2 && focused) focused = null;
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    cameraState.dragging = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
    if (e.button !== 0) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    pointerNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)
      .find(h => { const r = byMesh.get(h.object); return r && r.visible; });
    if (hit) {
      const record = byMesh.get(hit.object);
      selectRecord(record);
      if (record.isConstellation) {
        if (!zodiacReturnPose) {
          zodiacReturnPose = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            mode: cameraState.mode,
          };
        }
        flyTo(record);
      } else {
        zodiacReturnPose = null;
        cameraState.target = record;
        syncCameraTargetSelect();
        if (cameraState.mode === 'orbit') flyTo(record);
        else if (cameraState.mode !== 'free') setCameraMode(cameraState.mode);
      }
      openInfoPanel(record);
    }
  });
  scope.listen(window, 'pointermove', (e) => {
    pointerPar.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    if (!cameraState.dragging) return;
    const dx = e.clientX - cameraState.lastX;
    const dy = e.clientY - cameraState.lastY;
    cameraState.lastX = e.clientX;
    cameraState.lastY = e.clientY;
    if (cameraState.mode === 'free') {
      cameraState.yaw -= dx * 0.003 * CONFIG.mouseSensitivity;
      cameraState.pitch = THREE.MathUtils.clamp(
        cameraState.pitch - dy * 0.003 * CONFIG.mouseSensitivity,
        -1.45,
        1.45,
      );
    }
  });
}

/* ================================================================
   UI
   ================================================================ */

const ui = (id) => document.getElementById(id);
let infoTarget = null;
let infoReturnFocus = null;
let infoRefreshTimer = 0;
const toastCooldowns = new Map();
const warningCards = new Map();
const ATMO_COLORS = ['#8ab8ff', '#9fd8a0', '#e8c87a', '#c9a0ff', '#ff9a6a'];
const SUMMARY_METRIC_KEYS = [
  'cameraDistance', 'parentDistance', 'velocity', 'orbitalSpeed',
  'rotationSpeed', 'temperature', 'mass', 'radius', 'gravity',
  'orbitalPeriod', 'coordinates',
];
const STAR_SUMMARY_PROFILES = {
  MilkyWay: { massSolar: 1, radiusKm: 695700, tempK: 5772, rotationDays: 25.4 },
  Andromeda: { massSolar: 2, radiusSolar: 1.7, tempK: 9000, rotationDays: 1.5 },
  Triangulum: { massSolar: 1.3, radiusSolar: 1.35, tempK: 6600, rotationDays: 9 },
};

function finiteMetric(value, unit, qualifier) {
  const metric = { value: Number.isFinite(Number(value)) ? Number(value) : 0, unit: String(unit || '') };
  if (qualifier) metric.qualifier = qualifier;
  return metric;
}

function selectionKeyFor(record) {
  if (!record) return null;
  if (record.isSun) return 'star';
  if (record.isMoon && record.host) return 'moon:' + record.host.def.name + '/' + record.def.name;
  if (record.def?.name) return 'planet:' + record.def.name;
  if (record.isBH && GALAXIES[currentGalaxy].blackHole && record.bh === blackHoles[0]) return 'black-hole:resident';
  return null;
}

function selectRecord(record) {
  selectedRecord = record || null;
  refreshBottomInfoBar(true);
  return selectedRecord;
}

function restoreSelection(key) {
  const liveRecords = [
    sunRec,
    ...planets,
    ...planets.flatMap(planet => planet.moons || []),
    ...byMesh.values(),
    ...blackHoles.map(blackHole => blackHole.record),
  ].filter(Boolean);
  const fallback = null;
  const restored = key ? liveRecords.find(record => selectionKeyFor(record) === key) : fallback;
  return selectRecord(restored || fallback);
}

function buildObjectSummary(record, galaxy = GALAXIES[currentGalaxy]) {
  const coordinateDescriptor = { unit: 'scene u', qualifier: 'simulator modeled estimate' };
  const units = {
    cameraDistance: 'scene u', parentDistance: 'scene u', velocity: 'u/day',
    orbitalSpeed: 'u/day', rotationSpeed: 'deg/day', temperature: '°C',
    mass: 'kg', radius: 'km', gravity: 'm/s²', orbitalPeriod: 'days',
    coordinates: 'scene u',
  };
  const position = record?.anchor
    ? cameraTargetPosition(record, new THREE.Vector3())
    : new THREE.Vector3();
  const cameraDistance = camera?.position ? camera.position.distanceTo(position) : 0;
  let parentDistance = position.length();
  let velocity = record?.vel?.length?.() || 0;
  let orbitalSpeed = velocity;
  let rotationDays = 0;
  let temperature = -270;
  let temperatureUnit = units.temperature;
  let mass = 0;
  let radius = 0;
  let radiusUnit = units.radius;
  let gravity = 0;
  let orbitalPeriod = 0;
  let source = 'Simulator modeled estimate';
  let status = 'Active';
  const qualifier = 'simulator modeled estimate';
  let factQualifier = qualifier;
  const unboundTrajectory = { periodDays: 0, status: 'Unbound' };

  if (!record) {
    const profile = galaxy.star ? STAR_SUMMARY_PROFILES[galaxy.starProfile] : null;
    const outer = galaxy.planets[galaxy.planets.length - 1];
    const planetTemps = galaxy.planets.map(def => factsFor(def, !!galaxy.star).tempC);
    mass = profile ? profile.massSolar * 1.98847e30 : (galaxy.blackHole?.mass || 0) * 1.98847e30;
    radius = outer ? scaledDist(outer.au) : 0;
    radiusUnit = 'scene u';
    orbitalPeriod = outer?.periodDays || 0;
    temperature = planetTemps.length ? planetTemps.reduce((sum, value) => sum + value, 0) / planetTemps.length : -270;
    status = 'Current system';
    source = 'Current-system simulator model';
    parentDistance = 0;
    velocity = 0;
    orbitalSpeed = 0;
  } else if (record.isConstellation) {
    source = 'Traditional zodiac reference';
    status = record.sign.element + ' · ' + record.sign.dates;
    velocity = 0;
    orbitalSpeed = 0;
  } else if (record.isSun) {
    const profile = STAR_SUMMARY_PROFILES[galaxy.starProfile];
    mass = profile.massSolar * 1.98847e30;
    radius = profile.radiusKm || profile.radiusSolar * 695700;
    temperature = profile.tempK;
    temperatureUnit = 'K';
    rotationDays = profile.rotationDays;
    parentDistance = 0;
    source = 'Stellar profile';
    if (galaxy === GALAXIES[0]) factQualifier = 'measured reference';
  } else if (record.isGalaxy) {
    const g = GALAXIES[record.galaxyIndex];
    mass = (g.blackHole?.mass || 1e11) * 1.98847e30;
    radius = 1500;
    radiusUnit = 'scene u';
    source = g.desc;
    status = g.type + ' · ' + g.stars;
    velocity = 0;
    orbitalSpeed = 0;
  } else if (record.isBH) {
    const massSolar = record.bh?.massSuns || 0;
    mass = massSolar * 1.98847e30;
    radius = 2.953339382 * massSolar;
    temperature = massSolar > 0 ? 6.17e-8 / massSolar : 0;
    temperatureUnit = 'K';
    gravity = radius > 0 ? 299792458 ** 4 / (4 * 6.6743e-11 * mass) : 0;
    rotationDays = 360 / (0.05 * 180 / Math.PI);
    parentDistance = position.length();
    source = 'Relativistic formulas; accretion-disk visual-model rate';
  } else if (record.isMoon) {
    const densityKgM3 = 3300;
    radius = record.def.radiusE * 6371;
    mass = densityKgM3 * 4 / 3 * Math.PI * (radius * 1000) ** 3;
    gravity = radius > 0 ? 6.6743e-11 * mass / (radius * 1000) ** 2 : 0;
    orbitalPeriod = Math.abs(record.def.periodDays);
    rotationDays = orbitalPeriod;
    parentDistance = position.distanceTo(cameraTargetPosition(record.host, new THREE.Vector3()));
    orbitalSpeed = orbitalPeriod ? Math.PI * 2 * Math.abs(record.def.dist) / orbitalPeriod : 0;
    velocity = (record.host.vel?.length?.() || 0) + orbitalSpeed;
    temperature = sunRec ? 278 / Math.sqrt(Math.max(record.host.def.au, .001)) - 273.15 : -270;
    source = 'Host-relative tidal simulator model; density 3300 kg/m3';
  } else if (record.kind === 'asteroid' || record.kind === 'comet') {
    const comet = record.kind === 'comet';
    const densityKgM3 = comet ? 600 : 2500;
    radius = Math.max(0, record.radius || 0);
    mass = densityKgM3 * 4 / 3 * Math.PI * (radius * 1000) ** 3;
    gravity = radius > 0 ? 6.6743e-11 * mass / (radius * 1000) ** 2 : 0;
    rotationDays = comet ? .5 : 8 / 24;
    const centralGM = sunRec ? GM_SUN : (blackHoles[0]?.GM || 0);
    const energy = centralGM > 0 ? velocity * velocity / 2 - centralGM / Math.max(position.length(), .001) : 0;
    let orbit = unboundTrajectory;
    if (comet && Number.isFinite(record.a) && record.a > 0) {
      orbit = { periodDays: Math.PI * 2 * Math.sqrt(record.a ** 3 / GM_SUN), status: 'Bound' };
    } else if (centralGM > 0 && energy < 0) {
      const a = -centralGM / (2 * energy);
      orbit = { periodDays: Math.PI * 2 * Math.sqrt(a ** 3 / centralGM), status: 'Bound' };
    }
    orbitalPeriod = orbit.periodDays;
    orbitalSpeed = velocity;
    if (orbit.status === 'Unbound') status = unboundTrajectory.status;
    const au = sunRec
      ? Math.pow(Math.max(position.length(), .001) / CONFIG.distanceScale, 1 / CONFIG.distanceExp)
      : 0;
    temperature = sunRec ? 278 / Math.sqrt(Math.max(au, .001)) - 273.15 : -270;
    source = comet
      ? 'Dynamic comet model; density 600 kg/m3; 12 h rotation'
      : 'Dynamic asteroid estimate; density 2500 kg/m3; 1 scene u = 1 km';
  } else if (record.def) {
    const facts = factsFor(record.def, !!galaxy.star);
    radius = facts.radiusKm;
    mass = facts.massKg;
    gravity = facts.gravity;
    temperature = facts.tempC;
    rotationDays = Math.abs(record.def.rotHours) / 24;
    orbitalPeriod = record.def.periodDays;
    orbitalSpeed = orbitalPeriod ? Math.PI * 2 * position.length() / orbitalPeriod : 0;
    velocity = record.mode === 'dynamic' ? record.vel.length() : orbitalSpeed;
    source = PLANET_FACTS[record.def.name]
      ? 'Measured reference facts with live simulator state'
      : 'Modeled fictional-world facts with live simulator state';
    if (PLANET_FACTS[record.def.name]) factQualifier = 'measured reference';
  }

  if (record?.destroyed) status = 'Destroyed';
  else if (record?.visible === false) status = 'Hidden';
  else if (record?.mining) status = 'Mining';
  else if (record?.mined) status = 'Depleted';
  else if (record?.isProjectile) status = 'Inbound projectile';
  else if (record?.isNEA) status = 'Near-Earth';
  else if (status !== 'Unbound' && (record?.kind || record?.mode === 'dynamic')) status = 'Dynamic';
  else if (record?.mode === 'rail') status = 'Rail';

  const coordinateMetric = Object.assign(
    finiteMetric(position.length(), coordinateDescriptor.unit, coordinateDescriptor.qualifier),
    {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0,
      z: Number.isFinite(position.z) ? position.z : 0,
    },
  );
  const metrics = {
    cameraDistance: finiteMetric(cameraDistance, units.cameraDistance, qualifier),
    parentDistance: finiteMetric(parentDistance, units.parentDistance, qualifier),
    velocity: finiteMetric(velocity, units.velocity, qualifier),
    orbitalSpeed: finiteMetric(orbitalSpeed, units.orbitalSpeed, qualifier),
    rotationSpeed: finiteMetric(rotationDays ? 360 / rotationDays : 0, units.rotationSpeed, factQualifier),
    temperature: finiteMetric(temperature, temperatureUnit, factQualifier),
    mass: finiteMetric(mass, units.mass, factQualifier),
    radius: finiteMetric(radius, radiusUnit, factQualifier),
    gravity: finiteMetric(gravity, units.gravity, factQualifier),
    orbitalPeriod: finiteMetric(orbitalPeriod, units.orbitalPeriod, factQualifier),
    coordinates: coordinateMetric,
  };
  return {
    name: record ? bodyDisplayName(record) : galaxy.name + ' system',
    type: record ? bodyTypeLabel(record) : galaxy.type,
    source,
    status,
    showMetrics: !record?.isConstellation,
    metrics: SUMMARY_METRIC_KEYS.reduce((result, key) => {
      result[key] = metrics[key] || finiteMetric(0, '', 'modeled estimate');
      return result;
    }, {}),
  };
}

function setHudVisible(visible, persist = true) {
  CONFIG.showHUD = !!visible;
  const hidden = !CONFIG.showHUD;
  document.body.classList.toggle('ui-hidden', hidden);
  const btn = ui('uiToggle');
  if (btn) {
    btn.textContent = hidden ? 'Show UI' : 'Hide UI';
    btn.setAttribute('aria-pressed', String(hidden));
    btn.title = hidden ? 'Show interface (H)' : 'Hide interface (H)';
  }
  if (persist) saveSettings();
  syncSettingsControls();
}

// Immersive view: one body class hides every overlay; the dimmed toggle chip
// (and the H key) restores the exact same interface.
function toggleImmersiveUI() {
  setHudVisible(!CONFIG.showHUD);
}

function setTimelineVisible(visible, persist = true) {
  CONFIG.showTimeline = !!visible;
  const bar = ui('bottomBar');
  if (bar) {
    bar.hidden = !CONFIG.showTimeline;
    bar.classList.toggle('visible', CONFIG.showTimeline && !titleMode);
  }
  if (persist) saveSettings();
  syncSettingsControls();
}

async function setDisplayMode(mode) {
  const dialog = ui('settingsDialog');
  if (dialog?.open) dialog.close();
  CONFIG.displayMode = mode === 'fullscreen' ? 'fullscreen' : 'windowed';
  try {
    if (CONFIG.displayMode === 'fullscreen') {
      if (!document.fullscreenElement && document.fullscreenEnabled) {
        await document.documentElement.requestFullscreen();
      } else if (!document.fullscreenEnabled) {
        CONFIG.displayMode = 'windowed';
        toast('Fullscreen unavailable — continuing in this window');
      }
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    CONFIG.displayMode = document.fullscreenElement ? 'fullscreen' : 'windowed';
    toast('Fullscreen unavailable — continuing in this window');
  }
  saveSettings();
  syncSettingsControls();
}

function armToastDismiss(item) {
  clearTimeout(item.dismissTimer);
  item.dismissTimer = setTimeout(() => {
    item.classList.add('out');
    setTimeout(() => item.remove(), 450);
  }, 4200);
}

function toast(message, color = '#8ab8ff') {
  const host = ui('toasts');
  // repeated message: keep the existing toast alive instead of stacking a twin
  const dup = [...host.children].find(t => t.textContent === message && !t.classList.contains('out'));
  if (dup) { armToastDismiss(dup); return; }
  while (host.children.length >= 5) host.firstChild.remove();
  const item = document.createElement('div');
  item.className = 'toast';
  item.style.setProperty('--toast-accent', color);
  item.textContent = message;
  host.appendChild(item);
  armToastDismiss(item);
}

function toastOnce(key, message, color, cooldownMs = 12000) {
  const now = Date.now();
  const quietUntil = toastCooldowns.get(key) || 0;
  // sliding cooldown: a condition observed continuously (eclipses are checked
  // every 0.5 s) toasts once and stays quiet until it ends for cooldownMs
  toastCooldowns.set(key, now + cooldownMs);
  if (quietUntil > now) return false;
  toast(message, color);
  return true;
}

function bodyDisplayName(record) {
  if (!record) return 'Unknown body';
  if (record.name) return record.name;
  if (record.def?.name) return record.def.name;
  if (record.isSun) return 'Star';
  if (record.isBH) return 'Black hole';
  return record.kind ? record.kind[0].toUpperCase() + record.kind.slice(1) : 'Celestial body';
}

function bodyTypeLabel(record) {
  if (record.isConstellation) return 'Zodiac constellation';
  if (record.isGalaxy) return 'Galaxy';
  if (record.isSun) return 'Star';
  if (record.isBH) return 'Black hole';
  if (record.isMoon) return 'Natural satellite';
  if (record.kind === 'comet') return 'Comet';
  if (record.kind === 'asteroid') return record.isNEA ? 'Near-Earth asteroid' : 'Asteroid';
  return record.def ? typeFor(record.def) : 'Celestial body';
}

function stat(label, value) {
  return '<div class="stat"><b>' + label + '</b><span>' + value + '</span></div>';
}

function periodLabel(days) {
  if (!Number.isFinite(days)) return '—';
  return Math.abs(days) >= 730
    ? (Math.abs(days) / 365.25).toFixed(1) + ' years'
    : Math.abs(days).toFixed(2) + ' days';
}

function atmosphereMarkup(atmo) {
  if (!atmo?.length) return '<div class="note">No substantial atmosphere</div>';
  const bars = atmo.map(([name, amount], i) =>
    '<span class="atmo-seg" style="width:' + amount + '%;background:' + ATMO_COLORS[i % ATMO_COLORS.length]
      + '" title="' + name + ' ' + amount + '%"></span>'
  ).join('');
  const legend = atmo.map(([name, amount], i) =>
    '<span><i class="atmo-dot" style="background:' + ATMO_COLORS[i % ATMO_COLORS.length] + '"></i>'
      + name + ' ' + amount + '%</span>'
  ).join('');
  return '<div class="atmo-bar">' + bars + '</div><div class="atmo-legend">' + legend + '</div>';
}

function openInfoPanel(record) {
  if (!record || record.destroyed || record.alive === false || record.visible === false) {
    closeInfoPanel();
    return;
  }
  selectRecord(record);
  infoTarget = record;
  const panel = ui('infoPanel');
  if (!panel.contains(document.activeElement)) infoReturnFocus = document.activeElement;
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  ui('ipName').textContent = bodyDisplayName(record);
  ui('ipType').textContent = bodyTypeLabel(record);
  const body = ui('ipBody');

  if (record.isConstellation) {
    const { sign } = record;
    body.innerHTML = '<div class="stat-grid">'
      + stat('Symbol', sign.symbol)
      + stat('Element', sign.element)
      + stat('Traditional dates', sign.dates)
      + stat('Brightest star', sign.brightest)
      + '</div><div class="note">' + sign.lore + '</div>';
  } else if (record.def && !record.isMoon) {
    const def = record.def;
    const facts = factsFor(def, !!sunRec);
    const modeled = !Object.prototype.hasOwnProperty.call(PLANET_FACTS, def.name);
    const sourceLabel = modeled
      ? 'Modeled fictional-world values · not observations'
      : 'NASA/JPL reference values · rounded for display · moon census checked 17 Jul 2026';
    const rotationLabel = Number.isFinite(def.rotHours)
      ? Math.abs(def.rotHours).toFixed(2) + ' hours' + ((def.tiltDeg || 0) > 90 ? ' · retrograde' : '')
      : '—';
    const atmosphereLabel = def.name === 'Mercury' ? 'Approximate exosphere' : 'Approximate atmosphere';
    const moonRows = record.moons?.length
      ? record.moons.map((moon, index) => {
          const phase = moon.alive ? moonPhase(moon) : { f: 0, name: 'Destroyed' };
          return '<div class="moon-row' + (moon.alive ? '' : ' dead') + '">'
            + '<button class="body-link m-name" data-moon="' + index + '"' + (moon.alive ? '' : ' disabled') + '>'
            + moon.name + '</button><span class="m-phase">' + phase.name + ' · ' + Math.round(phase.f * 100)
            + '% lit</span></div>';
        }).join('')
      : '<div class="note">No simulated moons</div>';
    body.innerHTML =
      '<div class="note">' + sourceLabel + '</div>'
      + '<div class="stat-grid">'
      + stat('Radius', facts.radiusKm.toLocaleString() + ' km')
      + stat('Diameter', (facts.radiusKm * 2).toLocaleString() + ' km')
      + stat('Mass', sci(facts.massKg) + ' kg')
      + stat('Gravity', facts.gravity + ' m/s²')
      + stat('Density', facts.density + ' g/cm³')
      + stat('Representative mean temperature', facts.tempC + ' °C')
      + stat('Escape velocity', facts.escape + ' km/s')
      + stat('Rotation period', rotationLabel)
      + stat('Orbital period', periodLabel(def.periodDays))
      + stat('Distance from star', Number.isFinite(def.au) && sunRec ? def.au.toFixed(3) + ' AU' : 'Not applicable')
      + stat(modeled ? 'Modeled moons' : 'Known moons', facts.moons.toLocaleString())
      + '</div>'
      + '<div><div class="section-label">' + atmosphereLabel + '</div>' + atmosphereMarkup(facts.atmo) + '</div>'
      + '<div class="hab-wrap"><div class="row"><span>Habitability · simulator estimate</span><span class="value">'
      + Math.round(facts.hab * 100) + '%</span></div><div class="hab-track"><span class="hab-thumb" style="left:'
      + Math.round(facts.hab * 100) + '%"></span></div></div>'
      + '<div><div class="section-label">Moon system</div>' + moonRows + '</div>';
    body.querySelectorAll('[data-moon]').forEach(button => {
      button.addEventListener('click', () => {
        const moon = record.moons[+button.dataset.moon];
        if (!moon?.alive) return;
        flyTo(moon);
        openInfoPanel(moon);
      });
    });
  } else if (record.isMoon) {
    const phase = moonPhase(record);
    body.innerHTML = '<div class="stat-grid">'
      + stat('Host planet', bodyDisplayName(record.host))
      + stat('Orbital period', periodLabel(record.def.periodDays))
      + stat('Orbit distance', Math.abs(record.def.dist).toFixed(1) + ' scene units')
      + stat('Phase', phase.name)
      + stat('Illumination', Math.round(phase.f * 100) + '%')
      + stat('Tidal state', 'Tidally locked')
      + '</div><button class="btn" id="viewHost">View ' + bodyDisplayName(record.host) + '</button>';
    ui('viewHost').addEventListener('click', () => {
      flyTo(record.host);
      openInfoPanel(record.host);
    });
  } else if (record.kind === 'asteroid' || record.kind === 'comet') {
    const comet = record.kind === 'comet';
    const mining = record.mining
      ? 'Mining · ' + Math.min(100, Math.round(record.mining.t / record.mining.dur * 100)) + '%'
      : record.mined ? 'Depleted' : 'Available';
    body.innerHTML = '<div class="stat-grid">'
      + stat('Speed', record.vel.length().toFixed(2) + ' u/day')
      + stat('Scene mass', record.mass.toFixed(1))
      + stat('Scene radius', record.radius.toFixed(2) + ' u')
      + (comet ? stat('Ice remaining', Math.max(0, record.ice * 100).toFixed(0) + '%') : stat('Mining', mining))
      + '</div>'
      + (comet
        ? '<div class="note">Blue line: predicted path · particles: dynamic tail and trail</div>'
        : '<button class="btn accent" id="mineAsteroid"' + (record.mining || record.mined ? ' disabled' : '') + '>'
          + (record.mining ? 'Mining in progress' : record.mined ? 'Asteroid depleted' : 'Begin mining') + '</button>');
    const mine = ui('mineAsteroid');
    if (mine) mine.addEventListener('click', () => {
      startMining(record);
      openInfoPanel(record);
    });
  } else if (record.isGalaxy) {
    const g = GALAXIES[record.galaxyIndex];
    body.innerHTML = '<div class="stat-grid">'
      + stat('Type', g.type)
      + stat('Stars', g.stars)
      + stat('Worlds modeled', String(g.planets.length))
      + stat('Resident black hole', g.blackHole ? 'Yes' : 'No')
      + '</div><div class="note">' + g.desc + '</div>'
      + '<button class="btn accent" id="travelGalaxy">Travel to ' + g.name + '</button>';
    ui('travelGalaxy').addEventListener('click', () => {
      closeInfoPanel();
      switchGalaxy(record.galaxyIndex);
    });
  } else {
    body.innerHTML = '<div class="stat-grid">'
      + stat('Type', bodyTypeLabel(record))
      + stat('Scene radius', (record.geoR || record.horizonR || 0).toFixed(2) + ' u')
      + (record.isBH ? stat('Mass', (record.bh?.massSuns || record.massSuns || 0).toLocaleString() + ' suns') : '')
      + '</div>';
  }
  panel.classList.add('visible');
}

function closeInfoPanel() {
  const panel = ui('infoPanel');
  const restoreFocus = panel.contains(document.activeElement);
  zodiacReturnPose = null;
  infoTarget = null;
  panel.classList.remove('visible');
  panel.inert = true;
  panel.setAttribute('aria-hidden', 'true');
  if (restoreFocus) {
    const target = infoReturnFocus?.isConnected ? infoReturnFocus : ui('collapseBtn');
    queueMicrotask(() => target?.focus());
  }
}

// User-initiated close restores a zodiac's saved pose; other focused objects
// return home. Automatic closes never move the camera.
function exitInfoPanel() {
  const returnPose = infoTarget?.isConstellation ? zodiacReturnPose : null;
  closeInfoPanel();
  if (titleMode) return;
  if (returnPose) {
    flyToPose(returnPose);
    return;
  }
  if (focused || (flight.active && flight.focus)) flyTo(null);
}

function refreshInfoPanel(dt) {
  if (!infoTarget) return;
  if (infoTarget.destroyed || infoTarget.alive === false || infoTarget.visible === false) {
    closeInfoPanel();
    return;
  }
  infoRefreshTimer += dt;
  if (infoRefreshTimer < 0.5) return;
  if (ui('infoPanel').contains(document.activeElement)) return;
  infoRefreshTimer = 0;
  openInfoPanel(infoTarget);
}

// Linear closest-point-of-approach math in scene units and simulated days.
// Kept independent of Three.js so the safety boundary can be regression-tested.

function warningPlanetVelocity(record, out) {
  if (record.mode === 'dynamic') return out.copy(record.vel);
  if (!Number.isFinite(record.def.periodDays) || !sunRec) return out.set(0, 0, 0);
  const stepDays = 0.05;
  const theta = record.theta0 + Math.PI * 2 * simDays / record.def.periodDays;
  orbitPos(record.def, theta + Math.PI * 2 * stepDays / record.def.periodDays, out);
  return out.sub(record.anchor.position).divideScalar(stepDays);
}

function warningTargetState(record) {
  const position = cameraTargetPosition(record, new THREE.Vector3());
  const velocity = new THREE.Vector3();
  if (record.isMoon) {
    warningPlanetVelocity(record.host, velocity);
    const hostPosition = cameraTargetPosition(record.host, new THREE.Vector3());
    const relative = position.clone().sub(hostPosition);
    const planeNormal = new THREE.Vector3(
      0,
      Math.cos(record.pivot.rotation.x),
      Math.sin(record.pivot.rotation.x),
    );
    const angularSpeed = Math.PI * 2 / record.def.periodDays;
    velocity.add(planeNormal.cross(relative).multiplyScalar(angularSpeed));
  } else {
    warningPlanetVelocity(record, velocity);
  }
  return {
    record,
    position,
    velocity,
    radius: cameraTargetRadius(record),
  };
}

function formatImpactEta(days) {
  if (days < 1 / 24) return Math.max(1, Math.round(days * 24 * 60)) + ' sim min';
  if (days < 2) return (days * 24).toFixed(days < 0.25 ? 1 : 0) + ' sim hr';
  return days.toFixed(days < 10 ? 1 : 0) + ' sim days';
}

function clearImpactWarnings() {
  for (const card of warningCards.values()) card.remove();
  warningCards.clear();
  const announcer = ui('warningAnnouncer');
  if (announcer) announcer.textContent = '';
}

function updateImpactWarnings() {
  const container = ui('warnings');
  if (titleMode || !CONFIG.collisions || !CONFIG.showWarnings) {
    clearImpactWarnings();
    return [];
  }

  const targetStates = [];
  for (const planet of planets) {
    if (!planet.visible || planet.destroyed) continue;
    targetStates.push(warningTargetState(planet));
    for (const moon of planet.moons) {
      if (moon.alive && moon.visible) targetStates.push(warningTargetState(moon));
    }
  }

  const warnings = dynBodies.filter(body => body.alive).map(body => {
    const bodyState = {
      position: body.mesh.position,
      velocity: body.vel,
      radius: Math.max(0.05, body.radius || 0.1),
    };
    let earliest = null;
    for (const targetState of targetStates) {
      const sourceHost = targetState.record.isMoon ? targetState.record.host : targetState.record;
      if (body.src === sourceHost && simDays - body.born < 6) continue;
      const approach = closestApproach(bodyState, targetState, 120);
      if (!approach || (earliest && earliest.eta <= approach.eta)) continue;
      earliest = { body, target: targetState.record, ...approach };
    }
    return earliest;
  }).filter(Boolean).sort((a, b) => a.eta - b.eta).slice(0, 3);

  const activeBodies = new Set(warnings.map(warning => warning.body));
  for (const [body, card] of warningCards) {
    if (!activeBodies.has(body)) {
      card.remove();
      warningCards.delete(body);
    }
  }

  const announcements = [];
  warnings.forEach((warning, order) => {
    let card = warningCards.get(warning.body);
    const previousTarget = card?.warningTarget;
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = 'warning-card';
      card.innerHTML =
        '<span class="w-icon" aria-hidden="true">⚠</span>'
        + '<span><b class="w-title"></b><span class="w-detail"></span></span>';
      card.addEventListener('click', () => {
        const target = card.warningTarget;
        if (!isCameraTargetLive(target)) return;
        selectRecord(target);
        setCameraMode('orbit');
        flyTo(target);
        openInfoPanel(target);
      });
      warningCards.set(warning.body, card);
      container.appendChild(card);
    }
    card.warningTarget = warning.target;
    card.style.order = String(order);
    const threatName = bodyDisplayName(warning.body);
    const targetName = bodyDisplayName(warning.target);
    const etaLabel = formatImpactEta(warning.eta);
    card.querySelector('.w-title').textContent = 'Incoming impact';
    card.querySelector('.w-detail').textContent =
      threatName + ' → ' + targetName + ' · ' + etaLabel;
    card.setAttribute('aria-label',
      'Incoming impact: ' + threatName + ' approaching ' + targetName + ' in ' + etaLabel);
    if (!previousTarget || previousTarget !== warning.target) {
      announcements.push(threatName + ' is approaching ' + targetName + ' in ' + etaLabel);
    }
  });
  ui('warningAnnouncer').textContent = announcements.join('. ');
  return warnings;
}

function setPlanetVisible(rec, v, skipRefresh) {
  rec.visible = v;
  rec.anchor.visible = v;
  camTargetsDirty = true;
  if (rec.trail) rec.trail.visible = v && rec.mode === 'rail';
  if (focused === rec || (flight.active && flight.focus === rec)) flyTo(null);
  if (!skipRefresh) refreshImpactTargets();
}

function applyPlanetScale() {
  for (const rec of planets) {
    rec.tiltG.scale.setScalar(CONFIG.planetScale);
    rec.label.position.y = rec.geoR * CONFIG.planetScale + 2.5;
    for (const m of rec.moons) m.mesh.scale.setScalar(CONFIG.planetScale);
  }
}

function applyDistanceScale() {
  for (const rec of planets) {
    if (!rec.trail) continue;
    fillTrailPositions(rec.trail.geometry.attributes.position.array, rec.def);
    rec.trail.geometry.attributes.position.needsUpdate = true;
    rec.trail.geometry.computeBoundingSphere();
  }
  if (belt) fillBeltMatrices();
}

function applyBaselinePose(targetDays) {
  const days = clampSimDays(targetDays);
  for (const rec of planets) {
    const def = rec.def;
    const angle = rec.theta0 + Math.PI * 2 * days / def.periodDays;
    orbitPos(def, angle, rec.anchor.position);
    rec.mesh.rotation.y = Math.PI * 2 * days * 24 / (def.rotHours || 24);
    if (rec.cloudMesh) rec.cloudMesh.rotation.y = rec.mesh.rotation.y * 1.25;
    for (const moon of rec.moons) {
      moon.pivot.rotation.y = moon.phase0 + Math.PI * 2 * days / moon.def.periodDays;
    }
    if (rec.mode === 'dynamic' && blackHoles[0]) {
      const r = Math.max(rec.anchor.position.length(), .001);
      const speed = Math.sqrt(blackHoles[0].GM / r);
      rec.vel.set(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(speed);
    }
  }
  if (sunMesh) {
    const profile = STAR_SUMMARY_PROFILES[GALAXIES[currentGalaxy].starProfile];
    sunMesh.rotation.y = Math.PI * 2 * days / profile.rotationDays;
  }
  if (belt) belt.rotation.y = -Math.PI * 2 * days / BELT_PERIOD_DAYS;
  for (const blackHole of blackHoles) blackHole.disk.rotation.z = days * .05;
}

function rebuildSimulationAt(targetDays, reason) {
  simDays = clampSimDays(targetDays);
  buildGalaxy(currentGalaxy);
  if (ui('bottomBar')) ui('bottomBar').dataset.lastRebuild = reason || 'timeline';
}

function seekSimulationTime(targetMs, reason) {
  const target = clampSimDays((targetMs - J2000_MS) / 86400000);
  setPlayback('paused');
  simDays = target;
  rebuildSimulationAt(target, reason);
  refreshBottomInfoBar(true);
}

/* ================================================================
   INTERACTION EVENT LOG
   User spawns (Spawn/Impact tabs) are recorded with their simulation
   timestamp so timeline playback reproduces them: rewinding past an
   event despawns its body, playing forward across the timestamp (or
   rebuilding at a later date) re-fires it from the recorded state.
   ================================================================ */
const interactionLog = []; // { day, galaxy, type: 'spawn'|'blackhole', props, handle }
let replayingInteraction = false;

function recordInteraction(type, props, handle) {
  if (replayingInteraction) return;
  interactionLog.push({ day: simDays, galaxy: currentGalaxy, type, props, handle: handle || null });
  interactionLog.sort((a, b) => a.day - b.day);
}

function interactionLive(event) {
  if (!event.handle) return false;
  if (event.type === 'blackhole') return blackHoles.includes(event.handle);
  return event.handle.alive !== false && dynBodies.includes(event.handle);
}

// ponytail: bodies re-enter at their recorded spawn state; no trajectory
// fast-forward when seeking past an event. Integrate headless catch-up if
// positional accuracy after long seeks starts to matter.
function replayInteraction(event) {
  const p = event.props;
  replayingInteraction = true;
  try {
    if (event.type === 'blackhole') {
      event.handle = spawnBlackHole(p.massSuns, new THREE.Vector3().fromArray(p.pos));
      return;
    }
    const body = p.comet ? spawnComet(p.a, p.e, p.color) : spawnAsteroid(false);
    body.mesh.position.fromArray(p.pos);
    body.vel.fromArray(p.vel);
    if (p.size) { body.mesh.scale.setScalar(p.size); body.radius = p.size; }
    if (p.mass) body.mass = p.mass;
    if (p.nea) body.isNEA = true;
    if (p.projectile) {
      body.isProjectile = true;
      body.target = planets[p.targetIndex] || null;
      body.homing = !!p.lockOn;
    }
    event.handle = body;
  } finally {
    replayingInteraction = false;
  }
}

// Called every tick with the sim-day interval just traversed.
function syncInteractionEvents(prevDays, nowDays) {
  if (nowDays > prevDays) {
    for (const event of interactionLog) {
      if (event.galaxy !== currentGalaxy || interactionLive(event)) continue;
      if (event.day > prevDays && event.day <= nowDays) replayInteraction(event);
    }
  } else if (nowDays < prevDays) {
    for (const event of interactionLog) {
      if (event.galaxy !== currentGalaxy || event.day <= nowDays || event.day > prevDays) continue;
      if (!interactionLive(event)) continue;
      if (event.type === 'blackhole') {
        // a hole pulled every planet off its rails — only a rebuild undoes that
        rebuildSimulationAt(nowDays, 'event-rewind');
        return;
      }
      removeBody(event.handle);
      event.handle = null;
    }
  }
}

// After a rebuild wipes all dynamic bodies, re-fire every event at or
// before the current date; later events re-arm for the next crossing.
function restoreInteractionEvents() {
  for (const event of interactionLog) {
    event.handle = null;
    if (event.galaxy === currentGalaxy && event.day <= simDays) replayInteraction(event);
  }
}

function setPlayback(mode) {
  if (!['forward', 'reverse', 'paused'].includes(mode)) return;
  const nextDirection = mode === 'reverse' ? -1 : 1;
  if (mode !== 'paused' && nextDirection !== playbackDirection) {
    playbackDirection = nextDirection;
    rebuildSimulationAt(simDays, 'direction-change');
  }
  CONFIG.playing = mode !== 'paused';
  const playing = ui('playing');
  if (playing) playing.checked = CONFIG.playing;
  for (const [id, active] of [
    ['barPlay', CONFIG.playing && playbackDirection > 0],
    ['barPause', !CONFIG.playing],
    ['barReverse', CONFIG.playing && playbackDirection < 0],
  ]) {
    const button = ui(id);
    if (button) button.setAttribute('aria-pressed', String(active));
  }
  refreshBottomInfoBar(true);
}

// Paint a range input's filled-track gradient. The fill stop is anchored to
// the thumb CENTER (thumb travel spans width minus one 14px thumb), so track
// and thumb stay aligned at every value and width — plain percentages drift
// near the ends.

function setTimeScale(value) {
  const requested = Number(value);
  CONFIG.timeScale = TIME_SCALE_PRESETS.reduce((best, preset) =>
    Math.abs(preset - requested) < Math.abs(best - requested) ? preset : best,
  TIME_SCALE_PRESETS[0]);
  const index = TIME_SCALE_PRESETS.indexOf(CONFIG.timeScale);
  const speed = ui('speed');
  const barTimeScale = ui('barTimeScale');
  if (speed) { speed.value = String(index); paintRangeFill(speed); }
  if (barTimeScale) { barTimeScale.value = String(index); paintRangeFill(barTimeScale); }
  if (ui('speedVal')) ui('speedVal').textContent = CONFIG.timeScale + ' d/s';
  if (ui('barTimeScaleValue')) ui('barTimeScaleValue').textContent = CONFIG.timeScale + ' d/s';
  refreshBottomInfoBar(true);
}

function stepTimeScale(direction) {
  const index = TIME_SCALE_PRESETS.indexOf(CONFIG.timeScale);
  setTimeScale(TIME_SCALE_PRESETS[Math.max(0, Math.min(TIME_SCALE_PRESETS.length - 1, index + direction))]);
}

function updateTimelinePreview(targetDays) {
  const date = simDateFromDays(targetDays);
  ui('barUtcDate').textContent = formatUtcDate(date);
  ui('barUtcTime').textContent = formatUtcTime(date);
  ui('barElapsed').textContent = formatElapsedDays(clampSimDays(targetDays));
  ui('timelineScrubber').setAttribute(
    'aria-valuetext',
    formatUtcDate(date) + ' ' + formatUtcTime(date),
  );
}

let bottomBarRefreshAt = -Infinity;
function refreshBottomInfoBar(force = false) {
  const bar = ui('bottomBar');
  if (!bar) return;
  const now = performance.now();
  if (!force && now - bottomBarRefreshAt < 250) return;
  bottomBarRefreshAt = now;
  const date = simDateFromDays(simDays);
  const summary = buildObjectSummary(selectedRecord, GALAXIES[currentGalaxy]);
  ui('barUtcDate').textContent = formatUtcDate(date);
  ui('barUtcTime').textContent = formatUtcTime(date);
  ui('barDay').textContent = String(date.getUTCDate()).padStart(2, '0');
  ui('barMonth').textContent = date.toLocaleString('en', { month: 'long', timeZone: 'UTC' });
  ui('barYear').textContent = String(date.getUTCFullYear());
  ui('barElapsed').textContent = formatElapsedDays(simDays);
  ui('barUniverseAge').textContent = (13.8 + simDays / (365.25e9)).toFixed(9) + ' billion years';
  ui('barEpoch').textContent = 'J' + julianEpoch().toFixed(3);
  ui('barSelectedName').textContent = summary.name;
  ui('barSelectedType').textContent = summary.type;
  ui('barSelectedSource').textContent = summary.source;
  ui('barSelectedStatus').textContent = summary.status;
  const labels = {
    cameraDistance: 'Camera', parentDistance: 'Parent', velocity: 'Velocity',
    orbitalSpeed: 'Orbital speed', rotationSpeed: 'Rotation', temperature: 'Temperature',
    mass: 'Mass', radius: 'Radius', gravity: 'Gravity', orbitalPeriod: 'Period',
    coordinates: 'Coordinates',
  };
  const metricHost = ui('barSelectedMetric');
  metricHost.hidden = !summary.showMetrics;
  metricHost.innerHTML = summary.showMetrics
    ? SUMMARY_METRIC_KEYS.map(key => {
        const metric = summary.metrics[key];
        const value = Math.abs(metric.value) >= 1e6
          ? metric.value.toExponential(3)
          : Number(metric.value.toFixed(3)).toLocaleString();
        const coordinates = key === 'coordinates'
          ? ' [' + metric.x.toFixed(2) + ', ' + metric.y.toFixed(2) + ', ' + metric.z.toFixed(2) + ']'
          : '';
        return '<span><small>' + labels[key] + '</small><b>' + value + coordinates + ' ' + metric.unit
          + '</b>' + (metric.qualifier ? '<em>' + metric.qualifier + '</em>' : '') + '</span>';
      }).join('')
    : '';
  const scrubber = ui('timelineScrubber');
  scrubber.value = String(simDays);
  paintRangeFill(scrubber);
  scrubber.setAttribute('aria-valuetext', formatUtcDate(date) + ' ' + formatUtcTime(date));
  ui('timelinePrev').disabled = simDays <= -SIM_DAY_LIMIT;
  ui('timelineNext').disabled = simDays >= SIM_DAY_LIMIT;
  setTimeScaleDisplayOnly();
}

function setTimeScaleDisplayOnly() {
  const index = Math.max(0, TIME_SCALE_PRESETS.indexOf(CONFIG.timeScale));
  ui('barTimeScale').value = String(index);
  paintRangeFill(ui('barTimeScale'));
  ui('barTimeScaleValue').textContent = CONFIG.timeScale + ' d/s';
}

function refreshPlanetGrid() {
  const grid = ui('planetGrid');
  grid.innerHTML = '';
  for (const rec of planets) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span>' + rec.def.name + '</span>'
      + '<label class="switch"><input type="checkbox"' + (rec.visible && !rec.destroyed ? ' checked' : '') + (rec.destroyed ? ' disabled' : '') + '>'
      + '<span class="track"></span><span class="thumb"></span></label>';
    const toggle = row.querySelector('input');
    toggle.setAttribute('aria-label', 'Toggle ' + rec.def.name + ' visibility');
    toggle.addEventListener('change', (e) => setPlanetVisible(rec, e.target.checked));
    grid.appendChild(row);
  }
}

function refreshImpactTargets() {
  for (const id of ['impactTarget', 'laserTarget']) {
    const sel = ui(id);
    const prev = sel.value;
    sel.innerHTML = '';
    planets.forEach((rec, i) => {
      if (!rec.visible || rec.destroyed) return;
      const o = document.createElement('option');
      o.value = i; o.textContent = rec.def.name;
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
}

function refreshGalaxyInfo() {
  const g = GALAXIES[currentGalaxy];
  ui('galaxyInfo').innerHTML =
    '<b>' + g.name + '</b> — ' + g.type + ' · ' + g.stars + '<br>' + g.desc;
  [...document.querySelectorAll('.galaxy-card')].forEach((el, i) =>
    el.classList.toggle('active', i === currentGalaxy));
}

function applyCameraSettings() {
  if (!controls) return;
  controls.rotateSpeed = CONFIG.rotationSpeed;
  controls.panSpeed = CONFIG.panSpeed;
  controls.zoomSpeed = CONFIG.zoomSpeed;
}

function syncSettingsControls() {
  if (!ui('settingsDialog')) return;
  const values = {
    settingsDisplay: CONFIG.displayMode,
    settingsQuality: CONFIG.quality,
    settingsBloom: CONFIG.bloom.strength,
    settingsDensity: CONFIG.particleDensity,
    settingsMouseSensitivity: CONFIG.mouseSensitivity,
    settingsCameraSpeed: CONFIG.cameraSpeed,
    settingsRotationSpeed: CONFIG.rotationSpeed,
    settingsPanSpeed: CONFIG.panSpeed,
    settingsZoomSpeed: CONFIG.zoomSpeed,
  };
  for (const [id, value] of Object.entries(values)) {
    const el = ui(id);
    el.value = String(value);
    if (el.type === 'range') paintRangeFill(el);
  }
  for (const [id, value] of Object.entries({
    settingsAntialiasing: CONFIG.antialiasing,
    settingsBelt: CONFIG.showBelt,
    settingsNebulas: CONFIG.showNebulas,
    settingsHUD: CONFIG.showHUD,
    settingsTimeline: CONFIG.showTimeline,
    settingsLabels: CONFIG.showLabels,
    settingsWarnings: CONFIG.showWarnings,
  })) {
    ui(id).checked = value;
  }
  ui('settingsBloomVal').textContent = CONFIG.bloom.strength.toFixed(2);
  ui('settingsDensityVal').textContent = CONFIG.particleDensity.toFixed(1) + '×';
  for (const [id, value] of [
    ['settingsMouseSensitivityVal', CONFIG.mouseSensitivity],
    ['settingsCameraSpeedVal', CONFIG.cameraSpeed],
    ['settingsRotationSpeedVal', CONFIG.rotationSpeed],
    ['settingsPanSpeedVal', CONFIG.panSpeed],
    ['settingsZoomSpeedVal', CONFIG.zoomSpeed],
  ]) {
    ui(id).textContent = value.toFixed(2) + '×';
  }
}

function setupSettings() {
  const dialog = ui('settingsDialog');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const panels = [...dialog.querySelectorAll('[role="tabpanel"]')];
  const activateTab = tab => {
    for (const candidate of tabs) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activateTab(tabs[next]);
      tabs[next].focus();
    });
  });

  ui('settingsBtn').addEventListener('click', () => {
    syncSettingsControls();
    dialog.showModal();
  });
  ui('settingsClose').addEventListener('click', () => dialog.close());

  const bridge = (settingsId, controlId, eventName) => {
    const setting = ui(settingsId), control = ui(controlId);
    setting.addEventListener(eventName, () => {
      if (setting.type === 'checkbox') control.checked = setting.checked;
      else control.value = setting.value;
      control.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
    control.addEventListener(eventName, () => {
      syncSettingsControls();
      saveSettings();
    });
  };
  bridge('settingsQuality', 'quality', 'change');
  bridge('settingsBloom', 'bloomI', 'input');
  bridge('settingsDensity', 'density', 'input');
  bridge('settingsBelt', 'belt-toggle', 'change');
  bridge('settingsNebulas', 'nebula-toggle', 'change');
  bridge('settingsLabels', 'labels-toggle', 'change');
  ui('settingsDensity').addEventListener('change', () =>
    ui('density').dispatchEvent(new Event('change', { bubbles: true })));

  ui('settingsDisplay').addEventListener('change', () => setDisplayMode(ui('settingsDisplay').value));
  ui('settingsAntialiasing').addEventListener('change', () => {
    CONFIG.antialiasing = ui('settingsAntialiasing').checked;
    applyQuality();
    saveSettings();
    syncSettingsControls();
  });
  for (const [id, key] of [
    ['settingsMouseSensitivity', 'mouseSensitivity'],
    ['settingsCameraSpeed', 'cameraSpeed'],
    ['settingsRotationSpeed', 'rotationSpeed'],
    ['settingsPanSpeed', 'panSpeed'],
    ['settingsZoomSpeed', 'zoomSpeed'],
  ]) {
    ui(id).addEventListener('input', () => {
      CONFIG[key] = Number(ui(id).value);
      applyCameraSettings();
      saveSettings();
      syncSettingsControls();
    });
  }
  ui('settingsHUD').addEventListener('change', () => setHudVisible(ui('settingsHUD').checked));
  ui('settingsTimeline').addEventListener('change', () => setTimelineVisible(ui('settingsTimeline').checked));
  ui('settingsWarnings').addEventListener('change', () => {
    CONFIG.showWarnings = ui('settingsWarnings').checked;
    updateImpactWarnings();
    saveSettings();
    syncSettingsControls();
  });
  scope.listen(document, 'fullscreenchange', () => {
    CONFIG.displayMode = document.fullscreenElement ? 'fullscreen' : 'windowed';
    saveSettings();
    syncSettingsControls();
  });

  applyCameraSettings();
  setHudVisible(CONFIG.showHUD, false);
  setTimelineVisible(CONFIG.showTimeline, false);
  syncSettingsControls();

  // Audio controls drive the shell-level music singleton (created in main.js).
  window.cosmicX?.audio?.bindSettingsPanel?.(dialog);
}

function setupUI() {
  // tabs
  const tabs = [...document.querySelectorAll('.tab')];
  const pages = [...document.querySelectorAll('.tab-page')];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      pages.forEach(p => p.classList.toggle('active', p.dataset.page === tab.dataset.tab));
    });
  }

  const bindSwitch = (id, obj, key, onChange) => {
    const el = ui(id);
    el.checked = obj[key];
    el.addEventListener('change', () => { obj[key] = el.checked; if (onChange) onChange(el.checked); });
  };
  const bindSlider = (id, valId, obj, key, fmt, onChange) => {
    const el = ui(id), val = ui(valId);
    const paint = () => {
      val.textContent = fmt(obj[key]);
      paintRangeFill(el);
    };
    el.value = obj[key];
    el.addEventListener('input', () => { obj[key] = parseFloat(el.value); paint(); if (onChange) onChange(); });
    paint();
  };

  // World
  const list = ui('galaxyList');
  GALAXIES.forEach((g, i) => {
    const card = document.createElement('button');
    card.className = 'galaxy-card' + (i === 0 ? ' active' : '');
    card.innerHTML = g.name + '<small>' + g.type + ' · ' + g.stars + '</small>';
    card.addEventListener('click', () => switchGalaxy(i));
    list.appendChild(card);
  });
  ui('resetBtn').addEventListener('click', () => {
    setCameraMode('orbit');
    flyTo(null);
  });

  // Sim
  ui('playing').checked = CONFIG.playing;
  ui('playing').addEventListener('change', () => {
    setPlayback(ui('playing').checked ? (playbackDirection < 0 ? 'reverse' : 'forward') : 'paused');
  });
  ui('speed').addEventListener('input', () => {
    setTimeScale(TIME_SCALE_PRESETS[Number(ui('speed').value)]);
  });
  setTimeScale(CONFIG.timeScale);
  bindSlider('gravity', 'gravityVal', CONFIG, 'gravityMult', v => v.toFixed(1) + '×');
  bindSlider('size', 'sizeVal', CONFIG, 'planetScale', v => v.toFixed(2) + '×', applyPlanetScale);
  bindSlider('dist', 'distVal', CONFIG, 'distanceScale', v => v.toFixed(0), applyDistanceScale);
  bindSwitch('trails', CONFIG, 'showTrails', v => trailsGroup.visible = v);
  bindSwitch('labels-toggle', CONFIG, 'showLabels', v => {
    labelRenderer.domElement.style.display = v ? '' : 'none';
    saveSettings();
    syncSettingsControls();
  });
  bindSwitch('collisions', CONFIG, 'collisions', v => {
    updateImpactWarnings();
    toast('Collision physics ' + (v ? 'enabled' : 'disabled'));
  });
  bindSwitch('eclipses', CONFIG, 'eclipses', v =>
    toast('Automatic eclipse events ' + (v ? 'enabled' : 'disabled'), '#e8c87a'));
  bindSwitch('neas-toggle', CONFIG, 'autoNEAs', v => {
    if (v) {
      if (currentGalaxy === 0 && !dynBodies.some(b => b.isNEA)) {
        for (let i = 0; i < 5; i++) spawnNEA();
      }
      toast('Resident near-Earth asteroids enabled', '#d8b48a');
    } else {
      for (const b of [...dynBodies]) if (b.isNEA) removeBody(b);
      dynBodies = dynBodies.filter(b => b.alive);
      toast('Resident near-Earth asteroids removed', '#d8b48a');
    }
  });
  ui('eclipseBtn').addEventListener('click', triggerSolarEclipse);

  // Spawn
  ui('cometColor').addEventListener('change', () => { uiParams.cometColor = ui('cometColor').value; });
  const recordSpawnedBody = (body, extra) => recordInteraction('spawn', Object.assign({
    pos: body.mesh.position.toArray(), vel: body.vel.toArray(),
    size: body.radius, mass: body.mass,
  }, extra), body);
  ui('spawnComet').addEventListener('click', () => {
    const body = spawnComet(uiParams.cometA, uiParams.cometE);
    recordSpawnedBody(body, { comet: true, a: uiParams.cometA, e: uiParams.cometE, color: uiParams.cometColor });
  });
  ui('spawnNEA').addEventListener('click', () => recordSpawnedBody(spawnNEA(), { nea: true }));
  bindSlider('cometA', 'cometAVal', uiParams, 'cometA', v => v.toFixed(0) + ' u', () => { if (lastComet) retuneComet(lastComet, uiParams.cometA, uiParams.cometE); });
  bindSlider('cometE', 'cometEVal', uiParams, 'cometE', v => v.toFixed(2), () => { if (lastComet) retuneComet(lastComet, uiParams.cometA, uiParams.cometE); });
  bindSlider('astSize', 'astSizeVal', uiParams, 'astSize', v => v.toFixed(1) + ' u');
  bindSlider('astMass', 'astMassVal', uiParams, 'astMass', v => v.toFixed(1));
  bindSlider('astVel', 'astVelVal', uiParams, 'astVel', v => v.toFixed(2) + ' u/d');
  ui('spawnAsteroid').addEventListener('click', () => recordSpawnedBody(spawnAsteroid(true), {}));
  ui('spawnAstBelt').addEventListener('click', () => recordSpawnedBody(spawnAsteroid(false), {}));
  bindSlider('bhMass', 'bhMassVal', uiParams, 'bhMass', v => v.toFixed(0));
  ui('spawnBH').addEventListener('click', () => {
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const pos = camera.position.clone().addScaledVector(dir, 220);
    pos.y *= 0.3;
    const bh = spawnBlackHole(uiParams.bhMass, pos);
    recordInteraction('blackhole', { massSuns: uiParams.bhMass, pos: pos.toArray() }, bh);
  });
  ui('clearSpawned').addEventListener('click', clearSpawned);

  // Impact
  ui('impactKind').addEventListener('change', () => {
    ui('impCometColor').hidden = ui('impactKind').value !== 'comet';
  });
  ui('launchBtn').addEventListener('click', () => {
    const body = launchProjectile();
    if (body) recordSpawnedBody(body, {
      comet: body.kind === 'comet', a: body.a, e: body.e, color: ui('impCometColor').value,
      projectile: true, targetIndex: +ui('impactTarget').value, lockOn: body.homing,
    });
  });
  ui('meteorBtn').addEventListener('click', () => spawnMeteorShower(planets[+ui('impactTarget').value]));
  bindSlider('impSpeed', 'impSpeedVal', uiParams, 'impSpeed', v => v.toFixed(1) + ' u/d');
  bindSlider('impAngle', 'impAngleVal', uiParams, 'impAngle', v => v.toFixed(0) + '°');
  bindSlider('impMass', 'impMassVal', uiParams, 'impMass', v => v.toFixed(1));
  bindSlider('impSize', 'impSizeVal', uiParams, 'impSize', v => v.toFixed(1) + ' u');
  bindSwitch('impLockOn', uiParams, 'lockOn');

  // Laser
  bindSlider('laserWidth', 'laserWidthVal', uiParams, 'laserWidth', v => v.toFixed(2) + ' u');
  bindSlider('laserPower', 'laserPowerVal', uiParams, 'laserPower', v => v.toFixed(0));
  bindSlider('laserDuration', 'laserDurationVal', uiParams, 'laserDuration', v => v.toFixed(1) + ' s');
  bindSwitch('laserDestructive', uiParams, 'laserDestructive');
  ui('laserColor').addEventListener('input', () => { uiParams.laserColor = ui('laserColor').value; });
  ui('fireLaser').addEventListener('click', fireLaser);

  // Camera
  for (const button of document.querySelectorAll('.cam-btn')) {
    button.addEventListener('click', () => setCameraMode(button.dataset.cam));
  }
  ui('camTarget').addEventListener('change', () => {
    const target = cameraState.targets[Number(ui('camTarget').value)];
    if (!isCameraTargetLive(target)) return;
    cameraState.target = target;
    selectRecord(target);
    if (cameraState.mode === 'orbit') flyTo(target);
    else if (cameraState.mode !== 'free') setCameraMode(cameraState.mode);
  });
  bindSlider('teleZoom', 'teleZoomVal', cameraState, 'zoom', v => v.toFixed(1) + '×', () => {
    if (cameraState.mode === 'telescope') {
      camera.fov = THREE.MathUtils.clamp(34 / cameraState.zoom, 2, 45);
      camera.updateProjectionMatrix();
    }
  });
  scope.listen(window, 'keydown', event => {
    if (event.key === 'Escape') {
      if (infoTarget) exitInfoPanel();
      if (cameraState.mode !== 'orbit') setCameraMode('orbit');
      return;
    }
    if (event.code === 'KeyH' && !titleMode
        && !/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) {
      toggleImmersiveUI();
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target?.tagName || '')) return;
    if (event.code === 'KeyF' && !titleMode) { fireLaser(); return; }
    cameraState.keys.add(event.code);
    if (event.code === 'Space' && cameraState.mode === 'free') {
      event.preventDefault();
    }
  });
  scope.listen(window, 'keyup', event => cameraState.keys.delete(event.code));
  scope.listen(window, 'blur', () => {
    cameraState.keys.clear();
    cameraState.dragging = false;
  });
  refreshCameraTargets();
  setCameraMode('orbit');
  controls.target.set(0, 0, 0);

  // FX
  ui('quality').value = CONFIG.quality;
  ui('quality').addEventListener('change', () => {
    CONFIG.quality = ui('quality').value;
    applyQuality();
    rebuildSimulationAt(simDays, 'quality');
    saveSettings();
    syncSettingsControls();
  });
  bindSlider('bloomI', 'bloomVal', CONFIG.bloom, 'strength', v => v.toFixed(2), () => {
    bloomPass.strength = CONFIG.bloom.strength;
    saveSettings();
    syncSettingsControls();
  });
  bindSlider('density', 'densityVal', CONFIG, 'particleDensity', v => v.toFixed(1) + '×', () => {
    saveSettings();
    syncSettingsControls();
  });
  ui('density').addEventListener('change', () => rebuildSimulationAt(simDays, 'particle-density'));
  bindSwitch('belt-toggle', CONFIG, 'showBelt', v => {
    if (belt) belt.visible = v;
    saveSettings();
    syncSettingsControls();
  });
  bindSwitch('nebula-toggle', CONFIG, 'showNebulas', v => {
    if (nebulaGroup) nebulaGroup.visible = v;
    saveSettings();
    syncSettingsControls();
  });
  ui('resetSim').addEventListener('click', () => {
    // restore pristine defs (eccentricity nudges etc. mutate them)
    GALAXIES[currentGalaxy].planets.forEach(def => { if (def._e0 !== undefined) def.e = def._e0; });
    // a reset is a full wipe: forget spawned bodies AND their recorded events,
    // otherwise buildGalaxy's restoreInteractionEvents resurrects every spawn
    clearSpawned();
    seekSimulationTime(SESSION_START_MS, 'session-start');   // rebuilds the galaxy fresh
    flyTo(null);
    toast('Simulation reset to its initial state');
  });
  GALAXIES.forEach(g => g.planets.forEach(def => { if (def._e0 === undefined) def._e0 = def.e; }));

  ui('collapseBtn').addEventListener('click', () => {
    const collapsed = ui('ui').classList.toggle('collapsed');
    const label = collapsed ? 'Expand panel' : 'Collapse panel';
    ui('collapseBtn').innerHTML = collapsed ? '+' : '&#8722;';
    ui('collapseBtn').setAttribute('aria-expanded', String(!collapsed));
    ui('collapseBtn').setAttribute('aria-label', label);
    ui('collapseBtn').title = label;
  });
  ui('uiToggle').addEventListener('click', toggleImmersiveUI);
  ui('ipClose').addEventListener('click', exitInfoPanel);

  ui('barPlay').addEventListener('click', () => setPlayback('forward'));
  ui('barPause').addEventListener('click', () => setPlayback('paused'));
  ui('barReverse').addEventListener('click', () => setPlayback('reverse'));
  ui('barTimeScale').addEventListener('input', () => {
    setTimeScale(TIME_SCALE_PRESETS[Number(ui('barTimeScale').value)]);
  });
  ui('barSpeedDown').addEventListener('click', () => stepTimeScale(-1));
  ui('barSpeedUp').addEventListener('click', () => stepTimeScale(1));
  const timelineStops = [-SIM_DAY_LIMIT, 0, SIM_DAY_LIMIT];
  ui('timelinePrev').disabled = simDays <= -SIM_DAY_LIMIT;
  ui('timelineNext').disabled = simDays >= SIM_DAY_LIMIT;
  ui('timelinePrev').addEventListener('click', () => {
    const target = [...timelineStops].reverse().find(stop => stop < simDays - .00001);
    seekSimulationTime(simulationTimeMs(target ?? -SIM_DAY_LIMIT), 'previous-stop');
  });
  ui('timelineNext').addEventListener('click', () => {
    const target = timelineStops.find(stop => stop > simDays + .00001);
    seekSimulationTime(simulationTimeMs(target ?? SIM_DAY_LIMIT), 'next-stop');
  });
  ui('timelineReset').addEventListener('click', () => {
    seekSimulationTime(SESSION_START_MS, 'session-start');
  });
  ui('timelinePresent').addEventListener('click', () => {
    seekSimulationTime(Date.now(), 'present');
  });
  ui('timelineScrubber').addEventListener('input', () => {
    const previewDays = Number(ui('timelineScrubber').value);
    setPlayback('paused');
    ui('timelineScrubber').value = String(previewDays);
    paintRangeFill(ui('timelineScrubber'));
    updateTimelinePreview(previewDays);
  });
  ui('timelineScrubber').addEventListener('change', () => {
    seekSimulationTime(simulationTimeMs(Number(ui('timelineScrubber').value)), 'scrubber');
  });
  ui('timelineScrubber').setAttribute(
    'aria-valuetext',
    formatUtcDate(simDateFromDays(simDays)) + ' ' + formatUtcTime(simDateFromDays(simDays)),
  );

  const mobileTimeline = window.matchMedia('(max-width: 720px)');
  const syncTimelineDetails = () => {
    const panel = ui('timelineDetailsPanel');
    const expanded = mobileTimeline.matches && ui('timelineDetails').getAttribute('aria-expanded') === 'true';
    panel.hidden = mobileTimeline.matches && !expanded;
    panel.setAttribute('aria-hidden', String(mobileTimeline.matches && !expanded));
  };
  ui('timelineDetails').addEventListener('click', () => {
    const expanded = ui('timelineDetails').getAttribute('aria-expanded') !== 'true';
    ui('timelineDetails').setAttribute('aria-expanded', String(expanded));
    ui('timelineDetailsPanel').hidden = !expanded;
    ui('timelineDetailsPanel').setAttribute('aria-hidden', String(!expanded));
  });
  ui('barCollapse').addEventListener('click', () => {
    const collapsed = ui('bottomBar').classList.toggle('collapsed');
    ui('barCollapse').setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Show timeline panel' : 'Hide timeline panel';
    ui('barCollapse').setAttribute('aria-label', label);
    ui('barCollapse').title = label;
    ui('barCollapse').innerHTML = collapsed ? '&#9652;' : '&#9662;';
  });
  if (mobileTimeline.matches) {
    ui('collapseBtn').click();
    ui('barCollapse').click();
  }
  scope.listen(mobileTimeline, 'change', syncTimelineDetails);
  syncTimelineDetails();

  const updateBottomOffset = () => {
    const height = Math.ceil(ui('bottomBar').getBoundingClientRect().height) + 24;
    document.documentElement.style.setProperty(
      '--bottom-bar-offset',
      'calc(' + height + 'px + env(safe-area-inset-bottom))',
    );
  };
  scope.observe(new window.ResizeObserver(updateBottomOffset)).observe(ui('bottomBar'));
  updateBottomOffset();
  setPlayback('forward');
  refreshBottomInfoBar(true);
}

function clearSpawned() {
  // a deliberate wipe also forgets the events, or the timeline would resurrect them
  for (let i = interactionLog.length - 1; i >= 0; i--) {
    if (interactionLog[i].galaxy === currentGalaxy) interactionLog.splice(i, 1);
  }
  for (const b of dynBodies) removeBody(b);
  dynBodies = [];
  // remove spawned holes (galaxy-resident hole in M87 stays)
  const resident = GALAXIES[currentGalaxy].blackHole;
  blackHoles = blackHoles.filter((bh, i) => {
    const keep = resident && i === 0;
    if (!keep) {
      galaxyGroup.remove(bh.mesh);
      const rec = [...byMesh.entries()].find(([, r]) => r.bh === bh);
      if (rec) {
        const [, bodyRec] = rec;
        if (selectedRecord === bodyRec) selectRecord(null);
        if (infoTarget === bodyRec) closeInfoPanel();
        if (focused === bodyRec || (flight.active && flight.focus === bodyRec)) flyTo(null);
        byMesh.delete(rec[0]);
        const pickIndex = pickTargets.indexOf(rec[0]);
        if (pickIndex >= 0) pickTargets.splice(pickIndex, 1);
      }
      disposeGroup(bh.mesh);
    }
    return keep;
  });
  camTargetsDirty = true;
  updateImpactWarnings();
}

/* ================================================================
   TITLE SCREEN
   ================================================================ */

let titleMode = true;
let titleAngle = 2.2;
let titlePan = 0;
let menuTitleRun = 0;
let introUiTimer = 0;
let launching = false;
const titleAim = new THREE.Vector3();

function typeMenuTitle(text) {
  const titleText = document.getElementById('titleText');
  const heroH1 = titleText.closest('h1');
  const run = ++menuTitleRun;
  heroH1.classList.toggle('long', text.length > 10);
  titleText.classList.remove('typing');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    titleText.textContent = text;
    return;
  }
  titleText.textContent = '';
  titleText.classList.add('typing');
  let index = 0;
  const tick = () => {
    if (run !== menuTitleRun) return;
    titleText.textContent = text.slice(0, ++index);
    if (index < text.length) setTimeout(tick, 22);
    else titleText.classList.remove('typing');
  };
  tick();
}

function setupFullscreenNotice() {
  const notice = document.getElementById('fullscreenNotice');
  document.getElementById('fullscreenNoticeDismiss').addEventListener('click', () => {
    notice.close();
    // enter fullscreen right off the acknowledging click; Escape still
    // declines quietly and the launch buttons keep their own guard
    if (CONFIG.displayMode === 'fullscreen' && !document.fullscreenElement && document.fullscreenEnabled) {
      document.documentElement.requestFullscreen()
        .catch(() => toast('Fullscreen unavailable — continuing in this window'));
    }
  });
  notice.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      notice.close();
      CONFIG.displayMode = 'windowed';
      saveSettings();
      syncSettingsControls();
    }
  });
  if (CONFIG.displayMode !== 'fullscreen') return;
  notice.showModal();
}

// Lazy live preview reuses the actual Big Bang title scene.
function showBigBangPreview() {
  const preview = document.getElementById('bigbangPreview');
  if (!preview.src) preview.src = preview.dataset.src;
  preview.classList.add('active');
  preview.contentWindow?.postMessage('cosmicx:preview:resume', location.origin);
}

function hideBigBangPreview() {
  const preview = document.getElementById('bigbangPreview');
  preview.classList.remove('active');
  preview.contentWindow?.postMessage('cosmicx:preview:pause', location.origin);
}

// Sandbox -> menu without a reload: dip through #fade (z-15, under the
// z-20 title) so the camera snap back to the drift path is never seen.
// The sim world is preserved on purpose — the drift renders it as backdrop.
function returnToMenu(view = 'modes') {
  clearTimeout(introUiTimer);
  for (const id of ['ui', 'bottomBar', 'uiToggle', 'simBackLink'])
    document.getElementById(id).classList.remove('visible');
  const fade = document.getElementById('fade');
  fade.classList.add('on');
  setTimeout(() => {
    selectRecord(null);
    closeInfoPanel();
    titleMode = true;          // before setCameraMode: it latches controls.enabled = !titleMode && …
    setCameraMode('orbit');    // cancels flight, clears focused, fov 55, hides chip/cinebars
    labelRenderer.domElement.style.visibility = 'hidden';
    const titleEl = document.getElementById('title');
    titleEl.inert = false;
    titleEl.classList.toggle('modes', view === 'modes');
    titleEl.classList.remove('hidden');
    fade.classList.remove('on');
  }, 520);
}

// Idle title backdrop tour across every galaxy environment, reusing the
// switchGalaxy fade-dip. Self-gates outside the title (and while the Big
// Bang preview is up or any other fade owns the screen).
function cycleTitleGalaxy() {
  const fade = document.getElementById('fade');
  if (!titleMode || launching || document.getElementById('bigbangPreview').classList.contains('active') || fade.classList.contains('on')) return;
  fade.classList.add('on');
  setTimeout(() => {
    if (titleMode && !launching) buildGalaxy((currentGalaxy + 1) % GALAXIES.length);
    if (!launching) fade.classList.remove('on');   // a mid-dip launch owns the fade now
  }, 520);
}

function setupTitleScreen() {
  controls.enabled = false;
  labelRenderer.domElement.style.visibility = 'hidden';
  const title = document.getElementById('title');
  if (initialView === 'modes') title.classList.add('modes');
  // stage 1 -> stage 2: reveal the mode cards, keep title/tagline in place
  document.getElementById('enterBtn').addEventListener('click', () => {
    title.classList.add('modes');
    navigate('/modes');
  });
  document.getElementById('startBtn').addEventListener('click', () => {
    if (!titleMode || launching) return;   // re-armed after every menu return
    if (!routeActivation && CONFIG.displayMode === 'fullscreen' && !document.fullscreenElement) {
      if (document.fullscreenEnabled) {
        document.documentElement.requestFullscreen()
          .catch(() => toast('Fullscreen unavailable — continuing in this window'));
      } else {
        toast('Fullscreen unavailable — continuing in this window');
      }
    }
    hideBigBangPreview();
    const launch = () => {
      titleMode = false;
      const titleEl = document.getElementById('title');
      titleEl.classList.add('hidden');
      titleEl.inert = true;   // no stray keyboard activation of the hidden menu
      labelRenderer.domElement.style.visibility = '';
      // hand off without a snap: restore the fov and start the flight's look
      // target from where the drifting camera is already aimed
      camera.fov = 55;
      camera.updateProjectionMatrix();
      controls.target.copy(titleAim);
      flyTo(null, CONFIG.introDur);
      introUiTimer = setTimeout(() => {
        document.getElementById('ui').classList.add('visible');
        document.getElementById('bottomBar').classList.add('visible');
        document.getElementById('uiToggle').classList.add('visible');
        document.getElementById('simBackLink').classList.add('visible');
      }, CONFIG.introDur * 1000 - 500);
    };
    if (!routeActivation) replaceRoute('/solar-system');
    if (currentGalaxy !== 0) {
      // the title tour drifted elsewhere: the Creator always starts in the
      // Milky Way, so rebuild it under a black dip ahead of the intro flight
      launching = true;
      const fade = document.getElementById('fade');
      fade.classList.add('on');
      setTimeout(() => {
        buildGalaxy(0);
        launch();
        fade.classList.remove('on');
        launching = false;
      }, 520);
    } else {
      launch();
    }
  });
  // Galaxy creation mode is its own page; fade to black, then navigate
  document.getElementById('creatorBtn').addEventListener('click', () => {
    if (launching) return;
    document.getElementById('fade').classList.add('on');
    setTimeout(() => navigate('/creator'), 520);
  });
  // Big Bang mode is its own page; fade to black, then navigate
  document.getElementById('bigbangBtn').addEventListener('click', () => {
    if (launching) return;
    document.getElementById('fade').classList.add('on');
    setTimeout(() => navigate('/big-bang'), 520);
  });
  // hovering (or keyboard-focusing) a mode card retitles the screen; the
  // revert hangs off the whole grid so card-to-card moves never flash back
  const taglineText = document.getElementById('taglineText');
  const swapText = (el, text) => {
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('swap');
    void el.offsetWidth;   // restart the crossfade animation
    el.classList.add('swap');
  };
  const setMenuTitle = (title, tag) => {
    typeMenuTitle(title);
    swapText(taglineText, tag);
  };
  const DEFAULT_HERO = ['CosmicX', 'A live model of our cosmic neighborhood'];
  document.getElementById('titleBackBtn').addEventListener('click', () => {
    hideBigBangPreview();
    setMenuTitle(...DEFAULT_HERO);
    title.classList.remove('modes');
    navigate('/');
    document.getElementById('enterBtn').focus();
  });
  for (const [id, title, tag] of [
    ['startBtn', 'As the Gods Will', 'An immersive journey through the planets and beyond.'],
    ['creatorBtn', 'Become the Creator', 'Design, evolve, and rule your own galaxy.'],
    ['bigbangBtn', 'Before the Stars', 'A Journey from the Big Bang to the Modern Universe'],
  ]) {
    const card = document.getElementById(id);
    for (const on of ['mouseenter', 'focus']) card.addEventListener(on, () => setMenuTitle(title, tag));
  }
  const grid = document.querySelector('#title .mode-grid');
  grid.addEventListener('mouseleave', () => setMenuTitle(...DEFAULT_HERO));
  grid.addEventListener('focusout', (event) => {
    if (!grid.contains(event.relatedTarget)) setMenuTitle(...DEFAULT_HERO);
  });
  // hover and keyboard focus reveal the actual Big Bang title scene
  const bb = document.getElementById('bigbangBtn');
  for (const on of ['mouseenter', 'focus']) bb.addEventListener(on, showBigBangPreview);
  for (const off of ['mouseleave', 'blur']) bb.addEventListener(off, hideBigBangPreview);
  // sandbox -> menu without a reload; the href stays as a no-JS fallback
  document.getElementById('simBackLink').addEventListener('click', event => {
    event.preventDefault();
    navigate('/modes');
  });
  // idle backdrop tour; cycleTitleGalaxy self-gates outside the title
  setInterval(cycleTitleGalaxy, 25000);
}

/* ================================================================
   ANIMATION LOOP
   ================================================================ */

const clock = new THREE.Clock();
const bhScreen = new THREE.Vector3();
let systemUpdateTimer = 0;
let warningUpdateTimer = 0;
let shootingStarTimer = 3;

function updateDynamics(dDays, dt) {
  // free bodies
  for (const body of dynBodies) {
    if (!body.alive) continue;
    integrate(body.mesh.position, body.vel, dDays);
    // ponytail: gentle homing, opt-in via Lock-on — sun gravity bends slow
    // shots off the lead point otherwise; real ballistics would need a Lambert solver
    if (body.homing && body.target && !body.target.destroyed) {
      _d.copy(body.target.anchor.position).sub(body.mesh.position);
      const dist = _d.length();
      _d.normalize();
      const speed = body.vel.length();
      // terminal guidance stiffens near the target, else the shot orbits it
      let k = Math.min(0.6, dDays * (0.12 + 10 / (dist + 2)));
      if (body.homingWeak) k *= 0.35;
      body.vel.lerp(_d.multiplyScalar(speed), k).setLength(speed);
    }
    body.mesh.rotation.x += dt * 0.7;
    body.mesh.rotation.y += dt * 0.4;
    if (body.hist) recordPath(body);
    if (body.fireTail) updateFireTail(body);
    if (body.kind === 'comet') {
      updateCometTail(body);
      // ice sublimation: each perihelion pass costs mass; dry comets die
      const r = Math.max(body.mesh.position.length(), 1);
      body.ice -= dDays * THREE.MathUtils.clamp(2600 / (r * r), 0, 1) * 0.0015;
      body.mesh.scale.setScalar(0.7 * (0.35 + 0.65 * Math.max(0, body.ice)));
      if (body.ice <= 0) {
        spawnExplosion(body.mesh.position.clone(), 0.6);
        toast('A comet exhausted its ice and disintegrated', '#7fb8ff');
        removeBody(body);
        continue;
      }
    }
    if (body.predict) {
      body.predictTimer += dt;
      if (body.predictTimer > 2) { body.predictTimer = 0; updatePredictLine(body); }
    }
    if (body.breadcrumbs) {
      body.crumbTimer += dt;
      if (body.crumbTimer > body.crumbRate) {
        body.crumbTimer = 0;
        const arr = body.breadcrumbs.geometry.attributes.position.array;
        arr[body.crumbIdx * 3] = body.mesh.position.x;
        arr[body.crumbIdx * 3 + 1] = body.mesh.position.y;
        arr[body.crumbIdx * 3 + 2] = body.mesh.position.z;
        body.crumbIdx = (body.crumbIdx + 1) % (arr.length / 3);
        body.crumbCount = Math.min(body.crumbCount + 1, arr.length / 3);
        body.breadcrumbs.geometry.setDrawRange(0, body.crumbCount);
        body.breadcrumbs.geometry.attributes.position.needsUpdate = true;
        body.breadcrumbs.geometry.computeBoundingSphere();
      }
    }
    if (body.kind === 'meteor' && updateMeteorEntry(body, dt)) continue;
    if (body.mining) updateMining(body, dt);
    if (body.ttl !== undefined && (body.ttl -= dDays) < 0) removeBody(body);
    if (body.mesh.position.lengthSq() > 4e6) removeBody(body); // escaped
  }

  // collisions
  if (CONFIG.collisions) {
    for (const body of dynBodies) {
      if (!body.alive) continue;
      const p = body.mesh.position;
      if (sunRec && p.length() < sunRec.geoR + body.radius) { spawnExplosion(p.clone(), 1); removeBody(body); continue; }
      for (const bh of blackHoles) {
        if (p.distanceTo(bh.mesh.position) < bh.horizonR * 1.05) { removeBody(body); break; }
      }
      if (!body.alive) continue;
      for (const rec of planets) {
        if (!rec.visible || rec.destroyed) continue;
        if (body.src === rec && simDays - body.born < 6) continue; // fresh ejecta clears its source
        for (const m of rec.moons) {
          if (!m.alive) continue;
          m.mesh.getWorldPosition(_v1);
          if (p.distanceTo(_v1) < m.geoR * CONFIG.planetScale + body.radius) {
            handleMoonImpact(body, m);
            break;
          }
        }
        if (!body.alive) break;
        const pr = rec.geoR * CONFIG.planetScale;
        if (p.distanceTo(rec.anchor.position) < pr + body.radius) { handleImpact(body, rec); break; }
      }
    }
  }
  dynBodies = dynBodies.filter(b => b.alive);

  // dynamic planets (post-black-hole physics)
  for (const rec of planets) {
    if (rec.mode !== 'dynamic' || rec.destroyed || !rec.visible) continue;
    integrate(rec.anchor.position, rec.vel, dDays);
    for (const bh of blackHoles) {
      if (rec.anchor.position.distanceTo(bh.mesh.position) < bh.horizonR + rec.geoR * CONFIG.planetScale * 0.5) {
        // consumed by the hole
        spawnExplosion(rec.anchor.position.clone(), 2);
        killPlanet(rec);
        break;
      }
    }
  }
}

function updateEffects(dt, dDays) {
  for (const fx of effects) {
    fx.life += dt;
    const t = fx.life / fx.maxLife;
    if (fx.kind === 'grow') {
      fx.obj.scale.setScalar(THREE.MathUtils.lerp(0.01, fx.target, THREE.MathUtils.smoothstep(t, 0, 1)));
    } else if (fx.kind === 'flash') {
      fx.light.intensity = Math.max(0, 30 * (1 - t));
      if (t >= 1) galaxyGroup.remove(fx.light);
    } else if (fx.kind === 'burst') {
      const arr = fx.mesh.geometry.attributes.position.array;
      for (let i = 0; i < fx.vels.length; i += 3) {
        arr[i] += fx.vels[i] * dt * 30;
        arr[i + 1] += fx.vels[i + 1] * dt * 30;
        arr[i + 2] += fx.vels[i + 2] * dt * 30;
      }
      fx.mesh.geometry.attributes.position.needsUpdate = true;
      fx.mesh.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) galaxyGroup.remove(fx.mesh);
    } else if (fx.kind === 'shock') {
      fx.mesh.scale.setScalar(1 + t * 55 * fx.scale);
      fx.mesh.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (t >= 1) galaxyGroup.remove(fx.mesh);
    } else if (fx.kind === 'fragments') {
      const m = new THREE.Matrix4();
      for (let i = 0; i < fx.mats.length; i++) {
        const f = fx.mats[i];
        gravityAt(f.p, _acc);
        fx.vels[i].addScaledVector(_acc, dDays);
        f.p.addScaledVector(fx.vels[i], dDays);
        m.compose(f.p, f.q, _v3.setScalar(f.s * Math.max(0.05, 1 - t * 0.3)));
        fx.mesh.setMatrixAt(i, m);
      }
      fx.mesh.instanceMatrix.needsUpdate = true;
      if (t >= 1) galaxyGroup.remove(fx.mesh);
    } else if (fx.kind === 'shootstar') {
      const arr = fx.mesh.geometry.attributes.position.array;
      for (let i = 0; i < 6; i += 3) {
        arr[i] += fx.vel.x * dt;
        arr[i + 1] += fx.vel.y * dt;
        arr[i + 2] += fx.vel.z * dt;
      }
      fx.mesh.geometry.attributes.position.needsUpdate = true;
      fx.mesh.material.opacity = Math.sin(Math.min(t, 1) * Math.PI) * 0.9;
      if (t >= 1) {
        galaxyGroup.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        fx.mesh.material.dispose();
      }
    } else if (fx.kind === 'laser') {
      const rec = fx.target;
      if (rec && rec.visible && !rec.destroyed) {
        // endpoint tracks the living target; freezes where it died otherwise
        _v1.copy(rec.anchor.position).sub(fx.start).normalize();
        fx.end.copy(rec.anchor.position).addScaledVector(_v1, -rec.geoR);
      }
      placeLaser(fx);
      const fade = Math.max(0, 1 - t);
      fx.outerMat.opacity = 0.45 * fade;
      fx.coreMat.opacity = 0.9 * fade;
      fx.glow.material.opacity = 0.9 * fade;
      if (t >= 1) {
        galaxyGroup.remove(fx.group);
        galaxyGroup.remove(fx.glow);
        for (const mesh of fx.group.children) mesh.geometry.dispose();
        fx.outerMat.dispose();
        fx.coreMat.dispose();
        fx.glow.material.dispose(); // its map is the shared point-sprite texture — keep it
      }
    }
  }
  effects = effects.filter(fx => fx.life < fx.maxLife);
}

function updateLensing() {
  let strongest = 0, cx = 0.5, cy = 0.5;
  for (const bh of blackHoles) {
    bhScreen.copy(bh.mesh.position).project(camera);
    if (bhScreen.z > 1 || Math.abs(bhScreen.x) > 1.4 || Math.abs(bhScreen.y) > 1.4) continue;
    const dist = camera.position.distanceTo(bh.mesh.position);
    const s = THREE.MathUtils.clamp(bh.horizonR * 3.2 / Math.max(dist, 1), 0, 0.5);
    if (s > strongest) {
      strongest = s;
      cx = bhScreen.x * 0.5 + 0.5;
      cy = bhScreen.y * 0.5 + 0.5;
    }
  }
  lensingPass.uniforms.uCenter.value.set(cx, cy);
  lensingPass.uniforms.uStrength.value += (strongest - lensingPass.uniforms.uStrength.value) * 0.15;
  lensingPass.uniforms.uAspect.value = camera.aspect;
  lensingPass.enabled = lensingPass.uniforms.uStrength.value > 0.002;
}

function animate() {
  if (paused || destroyed) return;
  frameId = requestAnimationFrame(animate);
  update(Math.min(clock.getDelta(), 0.1));
  composer.render();
  labelRenderer.render(scene, camera);
}

// One simulation tick, separated from rendering so it can also be driven
// headlessly (tests, background catch-up).
function update(dt) {
  const dDays = CONFIG.playing ? dt * CONFIG.timeScale * playbackDirection : 0;
  const prevSimDays = simDays;
  simDays += dDays;
  simDays = clampSimDays(simDays);
  if (dDays && (simDays <= -SIM_DAY_LIMIT || simDays >= SIM_DAY_LIMIT)) setPlayback('paused');
  if (dDays) syncInteractionEvents(prevSimDays, simDays);
  const t = clock.elapsedTime;

  // rail planets
  for (const rec of planets) {
    if (rec.destroyed) continue;
    const def = rec.def;
    if (rec.mode === 'rail') {
      orbitPos(def, rec.theta0 + Math.PI * 2 * simDays / def.periodDays, rec.anchor.position);
    }
    rec.mesh.rotation.y = Math.PI * 2 * simDays * 24 / (def.rotHours || 24);
    if (rec.cloudMesh) rec.cloudMesh.rotation.y = rec.mesh.rotation.y * 1.25;
    for (const m of rec.moons) if (m.alive) {
      m.pivot.rotation.y = m.phase0 + Math.PI * 2 * simDays / m.def.periodDays;
    }
    rec.lod.update(camera);
  }

  if (dDays < 0) applyBaselinePose(simDays);
  if (sunMesh) {
    const profile = STAR_SUMMARY_PROFILES[GALAXIES[currentGalaxy].starProfile];
    sunMesh.rotation.y = Math.PI * 2 * simDays / profile.rotationDays;
  }
  if (belt) belt.rotation.y = -Math.PI * 2 * simDays / BELT_PERIOD_DAYS;
  for (const sprite of coronaSprites) {
    sprite.scale.setScalar(sprite.userData.baseScale * (1 + 0.04 * Math.sin(t * 0.7 + sprite.userData.baseScale)));
  }
  for (const bh of blackHoles) {
    bh.disk.material.uniforms.uTime.value = t;
    bh.disk.rotation.z = simDays * .05;
  }
  if (dustField && dDays >= 0) dustField.rotation.y += dt * 0.004;

  if (dDays > 0) updateDynamics(dDays, dt);
  updateTrojans();
  if (laserCooldown > 0) laserCooldown = Math.max(0, laserCooldown - dt); // real time: ticks while paused
  warningUpdateTimer += dt;
  if (warningUpdateTimer >= 0.5) {
    warningUpdateTimer %= 0.5;
    updateImpactWarnings();
    // exploration discovery: first close approach to a distant galaxy names it
    for (const g of distantGalaxies) {
      if (discoveredGalaxies.has(g.name)) continue;
      if (camera.position.distanceTo(g.anchor.position) < 700) {
        discoveredGalaxies.add(g.name);
        toast('Discovered ' + g.name + ' — ' + GALAXIES[g.galaxyIndex].type, '#c9a8ff');
      }
    }
  }
  if (dDays > 0) {
    systemUpdateTimer += dt;
    if (systemUpdateTimer >= 0.5) {
      systemUpdateTimer %= 0.5;
      checkEclipses();
      if (CONFIG.collisions) checkMajorCollisions();
    }
  }
  if (dDays > 0) {
    shootingStarTimer -= dt;
    if (shootingStarTimer <= 0) {
      shootingStarTimer = 4 + Math.random() * 5;
      spawnShootingStar();
    }
  }
  if (dDays >= 0) updateEffects(dt, dDays);
  updateLensing();

  for (const layer of starLayers) {
    const p = layer.userData.parallax;
    layer.position.x += (-pointerPar.x * p - layer.position.x) * 0.04;
    layer.position.y += (pointerPar.y * p * 0.6 - layer.position.y) * 0.04;
  }

  if (titleMode) {
    // free cinematic drift: layered slow sinusoids (Lissajous path + roaming
    // aim point + fov breathing). Nothing is tracked; all terms are continuous
    // so the motion is seamless, and the combined period is long enough that
    // repetition never reads.
    // cinematic pacing: the travel speed itself breathes slow↔fast on an
    // eased (sinusoidal, so C∞-smooth) tempo curve — squared so the shot
    // lingers in slow beats and surges briefly. The aim point pans on its
    // own constant clock, so slow-dolly beats read as pan shots and fast
    // beats as flybys.
    titlePan += dt * 0.05;
    const P = titlePan;
    const tempo = 0.3 + ((Math.sin(P * 2.4) + 1) / 2) ** 2 * 1.6;
    titleAngle += dt * CONFIG.titleOrbit.rate * tempo;
    const T = titleAngle;
    // cruise INSIDE the system: weave across the orbital lanes (planets live
    // at ~20–221 u) while skimming just above the ecliptic, so worlds drift
    // past close by without the camera ever clipping one (planet radii ≤ ~5 u)
    const r = 150 + Math.sin(T * 0.7) * 90;
    camera.position.set(
      Math.cos(T) * r,
      34 + Math.sin(T * 0.5) * 22,
      Math.sin(T * 0.9) * r,
    );
    titleAim.set(
      Math.sin(P * 1.2) * 80,
      Math.sin(P * 1.6) * 26,
      Math.cos(P * 0.9) * 80,
    );
    // keep the aim comfortably ahead: a close pass over the aim point at
    // speed would otherwise whip the pan
    _v2.copy(titleAim).sub(camera.position);
    const dAim = _v2.length();
    if (dAim < 70) titleAim.copy(camera.position).addScaledVector(_v2, 70 / Math.max(dAim, 1e-4));
    camera.lookAt(titleAim);
    camera.fov = 55 + Math.sin(P * 0.7) * 4;
    camera.updateProjectionMatrix();
  }

  if (camTargetsDirty) refreshCameraTargets();
  updateFlight(dt);
  updateCameraMode(dt);
  refreshInfoPanel(dt);
  refreshBottomInfoBar();
  // during the title the drift owns the camera; OrbitControls would force it
  // to look at its target and re-lock the view
  if (!titleMode && (cameraState.mode === 'orbit' || cameraState.mode === 'follow')) controls.update();
}

function runSelfCheck() {
  const checks = {};
  const requiredDomIds = [
    'startBtn', 'settingsBtn', 'settingsDialog', 'settingsClose',
    'settingsTabDisplay', 'settingsTabGraphics', 'settingsTabCamera', 'settingsTabInterface',
    'settingsDisplay', 'settingsQuality', 'settingsAntialiasing', 'settingsBloom',
    'settingsDensity', 'settingsBelt', 'settingsNebulas', 'settingsMouseSensitivity',
    'settingsCameraSpeed', 'settingsRotationSpeed', 'settingsPanSpeed', 'settingsZoomSpeed',
    'settingsHUD', 'settingsTimeline', 'settingsLabels', 'settingsWarnings',
    'ui', 'planetGrid', 'infoPanel', 'ipBody', 'warnings',
    'warningAnnouncer', 'toasts', 'spawnComet', 'spawnNEA', 'launchBtn',
    'meteorBtn', 'camGrid', 'camTarget', 'teleZoom', 'bottomBar',
    'barUtcDate', 'barUtcTime', 'barDay', 'barMonth', 'barYear', 'barElapsed',
    'barUniverseAge', 'barEpoch', 'barTimeScale', 'barSelectedName',
    'barSelectedType', 'barSelectedSource', 'barSelectedStatus', 'barSelectedMetric',
    'barPlay', 'barPause', 'barReverse', 'timelinePrev', 'timelineNext',
    'barSpeedDown', 'barSpeedUp', 'timelineReset', 'timelinePresent',
    'timelineScrubber', 'timelineDetails', 'timelineDetailsPanel',
    'laserTarget', 'fireLaser',
  ];
  checks.dom = requiredDomIds.every(id => !!document.getElementById(id));
  checks.settings = CONFIG.displayMode === 'windowed' || CONFIG.displayMode === 'fullscreen';
  checks.settings &&= ['low', 'medium', 'high'].includes(CONFIG.quality)
    && CONFIG.bloom.strength >= 0 && CONFIG.bloom.strength <= 3
    && CONFIG.particleDensity >= 0.3 && CONFIG.particleDensity <= 2
    && CONFIG.mouseSensitivity >= 0.25 && CONFIG.mouseSensitivity <= 2
    && CONFIG.cameraSpeed >= 0.25 && CONFIG.cameraSpeed <= 3;

  const cameraModeControls = [...document.querySelectorAll('.cam-btn')]
    .map(button => button.dataset.cam);
  checks.cameraModes = CAMERA_MODES.size === 6
    && cameraModeControls.length === 6
    && new Set(cameraModeControls).size === 6
    && cameraModeControls.every(mode => CAMERA_MODES.has(mode));

  const factFields = ['radiusKm', 'massKg', 'gravity', 'density', 'tempC', 'escape', 'moons', 'hab'];
  checks.planetFacts = GALAXIES.every(galaxy =>
    galaxy.planets.every(def => {
      const facts = factsFor(def, !!galaxy.star);
      return factFields.every(field => Number.isFinite(facts[field]))
        && Number.isFinite(def.rotHours)
        && Number.isFinite(def.periodDays)
        && Number.isFinite(def.au)
        && facts.hab >= 0 && facts.hab <= 1
        && Array.isArray(facts.atmo) && facts.atmo.length > 0
        && facts.atmo.every(entry =>
          Array.isArray(entry) && typeof entry[0] === 'string'
          && Number.isFinite(entry[1]) && entry[1] >= 0
        );
    })
  );

  const expectedTargets = [];
  if (isCameraTargetLive(sunRec)) expectedTargets.push(sunRec);
  for (const planet of planets) {
    if (!isCameraTargetLive(planet)) continue;
    expectedTargets.push(planet);
    for (const moon of planet.moons) {
      if (isCameraTargetLive(moon)) expectedTargets.push(moon);
    }
  }
  for (const body of dynBodies) {
    if (body.isBody && isCameraTargetLive(body)) expectedTargets.push(body);
  }
  let blackHoleTargetsValid = true;
  const registeredRecords = [...byMesh.values()];
  for (const blackHole of blackHoles) {
    const matches = registeredRecords.filter(record =>
      record.isBH && record.bh === blackHole && isCameraTargetLive(record)
    );
    blackHoleTargetsValid &&= matches.length === 1;
    if (matches[0]) expectedTargets.push(matches[0]);
  }
  const registeredSet = new Set(registeredRecords);
  checks.liveTargets = expectedTargets.length > 0
    && new Set(expectedTargets).size === expectedTargets.length
    && expectedTargets.every(record => registeredSet.has(record))
    && blackHoleTargetsValid;

  checks.timeline = clampSimDays(-SIM_DAY_LIMIT - 1) === -SIM_DAY_LIMIT
    && clampSimDays(SIM_DAY_LIMIT + 1) === SIM_DAY_LIMIT
    && Math.abs(simDaysFromDate(simDateFromDays(simDays)) - simDays) < 2 / 86400000
    && TIME_SCALE_PRESETS.includes(CONFIG.timeScale);
  checks.bottomBar = requiredDomIds.slice(16).every(id => !!document.getElementById(id))
    && ui('timelineDetails').getAttribute('aria-controls') === 'timelineDetailsPanel'
    && !!getComputedStyle(document.documentElement).getPropertyValue('--bottom-bar-offset').trim();
  const stableSelection = selectionKeyFor(selectedRecord);
  checks.selection = selectedRecord === null
    || stableSelection !== null
    || dynBodies.includes(selectedRecord)
    || (selectedRecord?.isConstellation && registeredSet.has(selectedRecord));
  const summary = buildObjectSummary(selectedRecord, GALAXIES[currentGalaxy]);
  checks.summaryMetrics = SUMMARY_METRIC_KEYS.every(key => {
    const metric = summary.metrics[key];
    return metric && Number.isFinite(metric.value) && typeof metric.unit === 'string';
  });

  checks.integrations = [
    toast, toastOnce, openInfoPanel, closeInfoPanel,
    refreshCameraTargets, setCameraMode, updateCameraMode,
    closestApproach, updateImpactWarnings,
    checkEclipses, updateTrojans, checkMajorCollisions,
    setPlayback, setTimeScale, seekSimulationTime, rebuildSimulationAt,
    applyBaselinePose, selectRecord, restoreSelection,
    buildObjectSummary, refreshBottomInfoBar,
  ].every(fn => typeof fn === 'function');

  return { ok: Object.values(checks).every(Boolean), checks };
}

/* ================================================================
   BOOT
   ================================================================ */

loadSettings();
initScene();
setupPostFX();
buildGalaxy(0);
setupPicking();
setupUI();
setupSettings();
setupFullscreenNotice();
setupTitleScreen();
labelRenderer.domElement.style.display = CONFIG.showLabels ? '' : 'none';
animate();

// Console/debug handle
window.solar = {
  THREE, camera, controls, CONFIG, flyTo, spawnComet, spawnAsteroid: () => spawnAsteroid(true),
  spawnBlackHole, switchGalaxy, launchProjectile, fireLaser, selfCheck: runSelfCheck,
  get planets() { return planets; },
  get dynBodies() { return dynBodies; },
  get blackHoles() { return blackHoles; },
  get sunRec() { return sunRec; },
  get starLayers() { return starLayers; },
  step: (dt) => update(dt), // headless simulation tick
  render: () => composer.render(), // headless frame render (verification)
  get lensingPass() { return lensingPass; },
  get bloomPass() { return bloomPass; },
};

const debugHandle = window.solar;

function setView(view) {
  if (destroyed) return;
  const title = document.getElementById('title');
  if (view === 'simulation') {
    if (titleMode) {
      title.classList.add('modes');
      routeActivation = true;
      document.getElementById('startBtn').click();
      routeActivation = false;
    }
    return;
  }
  if (!titleMode) {
    returnToMenu(view);
    return;
  }
  hideBigBangPreview();
  title.inert = false;
  title.classList.remove('hidden');
  title.classList.toggle('modes', view === 'modes');
}

function pause() {
  if (paused || destroyed) return;
  paused = true;
  cancelAnimationFrame(frameId);
  clock.stop();
}

function resume() {
  if (!paused || destroyed) return;
  paused = false;
  clock.start();
  animate();
}

function destroy() {
  if (destroyed) return;
  paused = true;
  cancelAnimationFrame(frameId);
  clock.stop();
  destroyed = true;
  scope.destroy();
  disposeThreeRuntime({ scene, controls, composer, renderer });
  labelRenderer?.domElement?.remove();
  document.documentElement.style.removeProperty('--bottom-bar-offset');
  document.body.classList.remove('ui-hidden');
  if (window.solar === debugHandle) delete window.solar;
}

setView(initialView);
return { setView, pause, resume, destroy };
}
