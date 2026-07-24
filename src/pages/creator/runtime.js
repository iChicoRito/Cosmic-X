import { createPostprocessingShaders } from '../../shared/postprocessing-shaders.js';
import { fbm, makeCanvas } from '../../shared/procedural-canvas.js';
import { paintRangeFill } from '../../shared/range.js';
import { disposeThreeRuntime } from '../../shared/dispose-three.js';
import { createResourceScope } from '../../shared/resource-scope.js';
import { ONBOARDING_KEYS, startOnboardingTour } from '../../shared/onboarding-tour.js';
import {
  GALAXY_TYPES, PARAM_DEFS, defaultParams, sanitizeParams, sampleGalaxy,
  randomGalaxyName, angularVelocity, mulberry32,
} from './galaxy-model.js';
import {
  SPEEDS, BASE_YEARS_PER_SECOND, createStats, stepEvolution, agingTint,
  mergeStats, formatYears, formatCount, speedLabel,
} from './evolution.js';
import {
  STAR_TYPES, PLANET_CLASSES, ATMOSPHERES, starByType, createSystem,
  derivePlanet, generatePlanets, habitableZone, systemLuminosity, OBJECT_KINDS,
  objectKind, ENCYCLOPEDIA, encyclopediaEntry, planetColor,
  atmosphereComposition, ATMOSPHERE_COLORS, habitabilityScore, systemViewLayout,
  systemSlug, findSystemBySlug,
} from './systems.js';
import { CAMERA_MODES, createSystemView } from './system-view.js';
import { createStore, sanitizeState, serializeState, deserializeState } from './persistence.js';
import { ICONS } from '../../shared/icons.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export function createCreatorRuntime({ root, route, navigate, replaceRoute = () => {} }) {
const scope = createResourceScope(window);
const requestAnimationFrame = scope.requestAnimationFrame;
const cancelAnimationFrame = scope.cancelAnimationFrame;
const setTimeout = scope.setTimeout;
let frameId = 0;
let paused = false;
let destroyed = false;
let onboardingTour = null;
const { BloomClampShader, LensingShader } = createPostprocessingShaders(THREE);
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const previewMode = document.documentElement.classList.contains('preview');

/* ================================================================
   STATE
   ================================================================ */

const state = {
  view: 'title',              // 'title' | 'wizard' | 'sim' | 'system'
  wizardStep: 0,
  params: null,               // sanitized galaxy params once wizard opens
  stats: null,
  sim: { years: 0, speedIdx: 1, playing: true, dps: 10 },   // dps = sim days/second inside a system
  systems: [],                // created stellar systems (data)
  objects: [],                // placed celestial objects (data)
  discoveries: new Set(),
  placing: null,              // { mode: 'system' | 'object', kind? }
  selection: null,            // { type, system?, planet?, object?, sprite? }
  focusSystemId: null,
  uiHidden: false,
  fx: { quality: 2, bloom: 0.62, starBrightness: 1, showNebulae: true, showClusters: true, twinkle: true, showLabels: true },
  codexFocus: null,           // encyclopedia entry id expanded in the Codex panel
};
const store = createStore(window.localStorage);
const evolveRng = mulberry32((Math.random() * 0x7fffffff) | 0);

// The transport's speed pips mean galaxy-years in the galaxy; inside a system
// each pip is a simulated-days-per-second preset (capped at the Speed slider's
// 200 d/s max, so the pip highlight and the slider thumb always agree).
const SYSTEM_SPEEDS = [1, 10, 50, 100, 150, 200];
// Sim-tab god-free simulation settings, read by the system update loop.
let simGravity = 1;
let simCollisions = false;

/* ================================================================
   SCENE & POST-PROCESSING
   ================================================================ */

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.domElement.classList.add('cr-canvas');
root.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 6000);
camera.position.set(0, 70, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.5;
controls.maxDistance = 900;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Kept as a handle: entering a stellar system swaps this pass over to the
// dedicated system scene and camera, so the rest of the chain is shared.
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
// Highlights are compressed before bloom sees them. The shared default cap (4.0)
// lets nearly everything through, which is what buried planet surfaces in haze.
const clampPass = new ShaderPass(BloomClampShader);
clampPass.uniforms.uCap.value = 1.6;
composer.addPass(clampPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.5, 0.55);
composer.addPass(bloomPass);
const lensingPass = new ShaderPass(LensingShader);
lensingPass.enabled = false;
composer.addPass(lensingPass);
composer.addPass(new OutputPass());

// Name plates for created systems and placed objects. Same CSS2D approach the
// As the Gods Will sandbox uses, so the shared disposer already knows how to
// clean the DOM nodes up.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.id = 'crLabels';
root.appendChild(labelRenderer.domElement);

function makeLabel(text, offsetY = 0) {
  const el = document.createElement('div');
  el.className = 'cr-label';
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.set(0, offsetY, 0);
  return label;
}

const systemView = createSystemView({
  renderer, renderPass, scope, makeLabel,
  galaxyScene: scene, galaxyCamera: camera, galaxyControls: controls,
  onToast: toast,
  // Hiding a body reshapes the Bodies list and the camera target list at once.
  onBodiesChanged: () => { refreshBodyList(); refreshCamTargets(); },
  onPick: (pick) => {
    if (pick) {
      selectPick(pick);
      syncCamTargetTo(pick.type === 'moon' ? `moon:${pick.moonName}`
        : pick.type === 'planet' ? `planet:${pick.planetName}` : 'star:0');
    } else {
      state.selection = null;
      $('crInspector').hidden = true;
    }
  },
});

scope.listen(window, 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  systemView.resize();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================================================================
   TEXTURES (procedural, cached, disposed on destroy)
   ================================================================ */

const textureCache = new Map();
function cachedTexture(key, make) {
  if (!textureCache.has(key)) textureCache.set(key, make());
  return textureCache.get(key);
}

function pointTexture() {
  return cachedTexture('point', () => {
    const S = 64;
    const [canvas, ctx] = makeCanvas(S, S);
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(canvas);
  });
}

function glowTexture(inner, mid, outer) {
  return cachedTexture(`glow:${inner}:${mid}:${outer}`, () => {
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
  });
}

function nebulaTexture(seed, hue) {
  return cachedTexture(`nebula:${seed}:${hue.toFixed(2)}`, () => {
    const S = 128;
    const [canvas, ctx] = makeCanvas(S, S);
    const img = ctx.createImageData(S, S);
    const [r1, g1, b1] = hueRgb(hue);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x / S - 0.5, dy = y / S - 0.5;
        const fall = Math.max(0, 1 - Math.hypot(dx, dy) * 2.15);
        const n = fbm(x / 26, y / 26, seed, 4);
        const a = Math.pow(fall, 1.6) * Math.max(0, n - 0.28) * 2.2;
        const i = (y * S + x) * 4;
        img.data[i] = r1 * 255; img.data[i + 1] = g1 * 255; img.data[i + 2] = b1 * 255;
        img.data[i + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(canvas);
  });
}

function ringTexture() {
  return cachedTexture('ring', () => {
    const S = 128;
    const [canvas, ctx] = makeCanvas(S, S);
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0.55, 'rgba(255,255,255,0)');
    grad.addColorStop(0.72, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.85, 'rgba(255,220,190,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(canvas);
  });
}

function hueRgb(h) {
  // pink → cyan → violet nebula palette
  if (h < 0.4) return [0.95, 0.5, 0.75];
  if (h < 0.7) return [0.45, 0.85, 0.9];
  return [0.66, 0.5, 0.95];
}

/* ================================================================
   GALAXY POINT CLOUD (rotates in the vertex shader)
   ================================================================ */

const galaxyGroup = new THREE.Group();     // the created galaxy + everything riding it
const guestGroup = new THREE.Group();      // title-screen apparitions
const fxGroup = new THREE.Group();         // transient effect visuals
scene.add(galaxyGroup, guestGroup, fxGroup);

function makeGalaxyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: pointTexture() },
      uTime: { value: 0 },                 // sim Myr — drives differential rotation
      uClock: { value: 0 },                // real seconds — twinkle only
      uAge: { value: 0 },                  // 0 young/blue → 1 gas-starved amber
      uOpacity: { value: 1 },
      uTwinkle: { value: 1 },              // FX toggle: 1 = shimmer, 0 = steady
      uPx: { value: renderer.getPixelRatio() },
    },
    vertexShader: `
      attribute float aRadius; attribute float aAngle; attribute float aY;
      attribute float aSize; attribute float aOmega; attribute float aPhase;
      uniform float uTime; uniform float uAge; uniform float uPx;
      varying vec3 vColor; varying float vPhase;
      void main() {
        float ang = aAngle + aOmega * uTime;
        vec3 p = vec3(cos(ang) * aRadius, aY, sin(ang) * aRadius);
        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        vColor = mix(color, vec3(1.0, 0.74, 0.45) * lum, uAge * 0.6);
        vPhase = aPhase;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(aSize * uPx * (150.0 / -mv.z), 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOpacity; uniform float uClock; uniform float uTwinkle;
      varying vec3 vColor; varying float vPhase;
      void main() {
        float amp = 0.18 * uTwinkle;
        float tw = (1.0 - amp) + amp * sin(uClock * 1.7 + vPhase);
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vColor * tw, 1.0) * a * uOpacity;
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}

function buildGalaxyPoints(params, { stride = 1, opacity = 1 } = {}) {
  const sample = sampleGalaxy(params);
  const n = Math.floor(sample.count / stride);
  const geo = new THREE.BufferGeometry();
  const pick = (src, comps) => {
    if (stride === 1) return src;
    const out = new Float32Array(n * comps);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < comps; c++) out[i * comps + c] = src[i * stride * comps + c];
    }
    return out;
  };
  const radius = pick(sample.radius, 1);
  const omega = new Float32Array(n);
  for (let i = 0; i < n; i++) omega[i] = angularVelocity(radius[i], params);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); // unused; shader rebuilds
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(pick(sample.angle, 1), 1));
  geo.setAttribute('aY', new THREE.BufferAttribute(pick(sample.height, 1), 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(pick(sample.size, 1), 1));
  geo.setAttribute('aOmega', new THREE.BufferAttribute(omega, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(pick(sample.phase, 1), 1));
  geo.setAttribute('color', new THREE.BufferAttribute(pick(sample.color, 3), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), sample.R * 1.4);
  const mat = makeGalaxyMaterial();
  mat.uniforms.uOpacity.value = opacity;
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, sample };
}

let galaxy = null;   // { points, sample, sprites: [], coreGlow }

function disposeObject3D(obj) {
  obj.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) m.dispose();   // textures live in textureCache, disposed once at destroy
    }
  });
  obj.parent?.remove(obj);
}

function rebuildGalaxy(params) {
  if (galaxy) {
    disposeObject3D(galaxy.points);
    for (const s of galaxy.sprites) disposeObject3D(s);
    if (galaxy.coreGlow) disposeObject3D(galaxy.coreGlow);
    galaxy = null;
  }
  const { points, sample } = buildGalaxyPoints(params);
  galaxyGroup.add(points);
  const sprites = [];

  const addRotSprite = (mat, item, kind, scaleMul = 1, pickName = null) => {
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(item.scale * scaleMul);
    sprite.userData.rot = { r: item.r, theta: item.theta, y: item.y, omega: angularVelocity(item.r, params) };
    sprite.userData.kind = kind;
    if (pickName) sprite.userData.pick = { type: kind, name: pickName };
    placeRotSprite(sprite, 0);
    galaxyGroup.add(sprite);
    sprites.push(sprite);
    return sprite;
  };

  sample.nebulas.forEach((neb, i) => {
    const mat = new THREE.SpriteMaterial({
      map: nebulaTexture(neb.seed % 7, neb.hue),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85,
    });
    addRotSprite(mat, neb, 'nebula-bg', 2.1, `Nebula ${i + 1}`);
  });
  sample.dust.forEach(d => {
    const mat = new THREE.SpriteMaterial({
      map: nebulaTexture(d.seed % 5, 0.9),
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      color: 0x0a0a12, opacity: Math.min(0.6, 0.34 * params.dustAmount),
    });
    addRotSprite(mat, d, 'dust-bg', 2.4);
  });
  sample.clusters.forEach((c, i) => {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,0.95)', c.kind === 'globular' ? 'rgba(255,220,170,0.5)' : 'rgba(180,210,255,0.5)', 'rgba(120,140,255,0.12)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const label = c.kind === 'globular' ? `Globular Cluster ${i + 1}` : `Open Cluster ${i + 1}`;
    addRotSprite(mat, c, 'cluster-bg', 2.6, label);
  });

  let coreGlow = null;
  if (params.type !== 'irregular') {
    coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,244,220,1)', 'rgba(255,214,150,0.55)', 'rgba(255,170,90,0.14)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    coreGlow.scale.setScalar(sample.R * params.coreSize * 1.6);
    galaxyGroup.add(coreGlow);
  }
  galaxy = { points, sample, sprites, coreGlow };
  syncAging();
  applyFx();
}

// FX / graphics settings applied to the live scene (render quality, bloom,
// star brightness, and per-layer visibility). Re-run after every rebuild.
function applyFx() {
  const fx = state.fx;
  const px = Math.min(window.devicePixelRatio, fx.quality);
  renderer.setPixelRatio(px);
  composer.setPixelRatio(px);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.strength = fx.bloom;
  // Inside a system the star should glow like the As the Gods Will sun: run a
  // solar-grade bloom and lift the highlight clamp so the corona and lens flare
  // survive to bloom. The galaxy view keeps the tighter budget that stops fat
  // marker halos from burying everything.
  if (state.view === 'system') {
    bloomPass.strength = Math.max(fx.bloom * 1.8, 1.1);
    clampPass.uniforms.uCap.value = 3.2;
  } else {
    clampPass.uniforms.uCap.value = 1.6;
  }
  // System-scene environment: quality tier scales particle density, and the
  // nebula/twinkle toggles carry over.
  systemView.setFx({
    density: fx.quality >= 2 ? 1 : fx.quality >= 1.5 ? 0.75 : 0.45,
    nebulae: fx.showNebulae,
    twinkle: fx.twinkle,
  });
  if (galaxy) {
    const u = galaxy.points.material.uniforms;
    u.uOpacity.value = fx.starBrightness;
    u.uTwinkle.value = fx.twinkle ? 1 : 0;
    u.uPx.value = renderer.getPixelRatio();
    for (const s of galaxy.sprites) {
      const k = s.userData.kind;
      if (k === 'nebula-bg' || k === 'dust-bg') s.visible = fx.showNebulae;
      else if (k === 'cluster-bg') s.visible = fx.showClusters;
    }
  }
}

function placeRotSprite(sprite, simMyr) {
  const { r, theta, y, omega } = sprite.userData.rot;
  const ang = theta + omega * simMyr;
  sprite.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
}

function syncAging() {
  if (!galaxy) return;
  galaxy.points.material.uniforms.uAge.value = state.stats ? agingTint(state.stats) : 0;
}

/* ================================================================
   TITLE BACKDROP — empty space where galaxies periodically appear
   ================================================================ */

function buildBackdropStars() {
  const n = 1600;
  const pos = new Float32Array(n * 3);
  const rng = mulberry32(77);
  for (let i = 0; i < n; i++) {
    const r = 1400 + rng() * 1800;
    const phi = Math.acos(2 * rng() - 1), th = rng() * TAU;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: pointTexture(), size: 3.4, sizeAttenuation: false, transparent: true,
    depthWrite: false, opacity: 0.6, color: 0xbfd0ff, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);
}

const guests = [];   // { points, t, dur, group }

function spawnGuestGalaxy() {
  if (state.view !== 'title' || guests.length >= 2) return;
  const type = GALAXY_TYPES[Math.floor(Math.random() * GALAXY_TYPES.length)].id;
  const params = { ...defaultParams(type), seed: (Math.random() * 0x7fffffff) | 0, starDensity: 0.3, diameter: 60 + Math.random() * 80 };
  const { points } = buildGalaxyPoints(params, { stride: 3, opacity: 0 });
  const holder = new THREE.Group();
  holder.add(points);
  const a = Math.random() * TAU;
  holder.position.set(Math.cos(a) * 320, (Math.random() - 0.5) * 160, Math.sin(a) * 320 - 140);
  holder.rotation.set((Math.random() - 0.5) * 1.2, Math.random() * TAU, (Math.random() - 0.5) * 0.6);
  guestGroup.add(holder);
  guests.push({ points, group: holder, t: 0, dur: 16 + Math.random() * 6, spin: 0.02 + Math.random() * 0.05 });
}

function updateGuests(dt) {
  for (let i = guests.length - 1; i >= 0; i--) {
    const g = guests[i];
    g.t += dt;
    g.group.rotation.y += dt * g.spin;
    const u = g.t / g.dur;
    const fade = u < 0.25 ? u / 0.25 : u > 0.75 ? (1 - u) / 0.25 : 1;
    g.points.material.uniforms.uOpacity.value = Math.max(0, fade) * 0.9;
    g.points.material.uniforms.uClock.value = clock.elapsedTime;
    if (u >= 1) {
      disposeObject3D(g.group);
      guests.splice(i, 1);
    }
  }
}

/* ================================================================
   SYSTEM MARKERS + DETAIL (LOD: sprite far, mini-system near)
   ================================================================ */

const systemVisuals = new Map();   // id -> { rootObj, marker, detail? }
const objectVisuals = new Map();   // id -> { rootObj, tick? }
const pickables = [];

function addSystemVisual(system) {
  const rootObj = new THREE.Group();
  rootObj.position.fromArray(system.pos);
  const color = system.stars[0].color;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.4)', 'rgba(160,190,255,0.1)'),
    color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  marker.scale.setScalar(3.2);
  marker.userData.pick = { type: 'system', id: system.id };
  rootObj.add(marker);
  const label = makeLabel(system.name, 2.6);
  label.visible = state.fx.showLabels;
  rootObj.add(label);
  galaxyGroup.add(rootObj);
  pickables.push(marker);
  systemVisuals.set(system.id, { rootObj, marker, detail: null, label });
}

function buildSystemDetail(system) {
  const vis = systemVisuals.get(system.id);
  if (!vis || vis.detail) return;
  const detail = new THREE.Group();
  const AU = 1.1;                     // scene units per AU inside the detail view
  const starColor = new THREE.Color(system.stars[0].color);

  system.stars.forEach((star, i) => {
    const size = 0.5 + Math.log10(Math.max(star.luminosity, 0.01) + 1.2) * 0.45;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 20, 20),
      new THREE.MeshBasicMaterial({ color: star.color }));
    mesh.position.x = i * 1.6;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.06)'),
      color: star.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    // Halo stays close to the photosphere — at 6x it swallowed the inner planets.
    glow.scale.setScalar(size * 3);
    mesh.add(glow);
    detail.add(mesh);
  });

  // habitable zone annulus
  const hz = system.habitableZone;
  const hzMesh = new THREE.Mesh(
    new THREE.RingGeometry(hz.in * AU, hz.out * AU, 48),
    new THREE.MeshBasicMaterial({ color: 0x39d98a, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  hzMesh.rotation.x = -Math.PI / 2;
  detail.add(hzMesh);

  for (const planet of system.planets) {
    const r = Math.min(planet.orbitAU * AU, 30);
    const ring = new THREE.LineLoop(
      orbitGeometry(r),
      new THREE.LineBasicMaterial({ color: 0x4a5a7a, transparent: true, opacity: 0.45 }));
    detail.add(ring);
    const pr = Math.min(0.16 + planet.radius * 0.05, 0.62);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(pr, 14, 14),
      new THREE.MeshBasicMaterial({ color: planetColor(planet) }));
    mesh.userData.pick = { type: 'planet', systemId: system.id, planetName: planet.name };
    mesh.userData.orbit = { r, angle: Math.random() * TAU, period: Math.max(planet.periodDays, 20) };
    if (planet.rings) {
      const rg = new THREE.Mesh(
        new THREE.RingGeometry(pr * 1.4, pr * 2.2, 24),
        new THREE.MeshBasicMaterial({ color: 0xcbb692, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      rg.rotation.x = -Math.PI / 2.6;
      mesh.add(rg);
    }
    for (let m = 0; m < Math.min(planet.moons, 4); m++) {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(pr * 0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x9aa0ad }));
      const ma = (m / Math.min(planet.moons, 4)) * TAU;
      moon.position.set(Math.cos(ma) * pr * 3, 0, Math.sin(ma) * pr * 3);
      mesh.add(moon);
    }
    detail.add(mesh);
    pickables.push(mesh);
  }

  if (system.belt) {
    const beltPts = new Float32Array(240 * 3);
    const beltR = (system.habitableZone.out * 2.4) * AU;
    const rng = mulberry32(1234);
    for (let i = 0; i < 240; i++) {
      const a = rng() * TAU, rr = beltR + (rng() - 0.5) * 1.2;
      beltPts[i * 3] = Math.cos(a) * rr;
      beltPts[i * 3 + 1] = (rng() - 0.5) * 0.3;
      beltPts[i * 3 + 2] = Math.sin(a) * rr;
    }
    const beltGeo = new THREE.BufferGeometry();
    beltGeo.setAttribute('position', new THREE.BufferAttribute(beltPts, 3));
    detail.add(new THREE.Points(beltGeo, new THREE.PointsMaterial({
      map: pointTexture(), color: 0x8d8574, size: 0.5, transparent: true, depthWrite: false,
    })));
  }
  for (let c = 0; c < system.comets; c++) {
    const comet = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(220,240,255,1)', 'rgba(160,200,255,0.4)', 'rgba(120,160,255,0.05)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    comet.scale.setScalar(0.5);
    comet.userData.orbit = { r: 8 + c * 2.4, angle: Math.random() * TAU, period: 900 + c * 500, comet: true };
    detail.add(comet);
  }
  detail.visible = false;
  vis.rootObj.add(detail);
  vis.detail = detail;
  vis.starColor = starColor;
}

function orbitGeometry(r) {
  const pts = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function removeSystemVisual(id) {
  const vis = systemVisuals.get(id);
  if (!vis) return;
  removePickablesOf(vis.rootObj);
  disposeObject3D(vis.rootObj);
  systemVisuals.delete(id);
}

function removePickablesOf(rootObj) {
  for (let i = pickables.length - 1; i >= 0; i--) {
    let node = pickables[i];
    while (node) {
      if (node === rootObj) { pickables.splice(i, 1); break; }
      node = node.parent;
    }
  }
}

/* ================================================================
   PLACED OBJECT VISUALS
   ================================================================ */

function addObjectVisual(obj) {
  const kind = objectKind(obj.kind);
  const rootObj = new THREE.Group();
  rootObj.position.fromArray(obj.pos);
  let tick = null;
  const spr = (map, color, scale, blending = THREE.AdditiveBlending) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color, transparent: true, depthWrite: false, blending,
    }));
    sprite.scale.setScalar(scale);
    rootObj.add(sprite);
    return sprite;
  };
  const S = kind.scale * obj.scale;

  switch (obj.kind) {
    case 'nebula':
      spr(nebulaTexture(obj.seed % 9, (obj.seed % 100) / 100), 0xffffff, S * 2);
      break;
    case 'blackHole': {
      const hole = new THREE.Mesh(new THREE.SphereGeometry(S * 0.16, 20, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      rootObj.add(hole);
      const disk = spr(ringTexture(), 0xffb26b, S * 0.9);
      tick = dt => { disk.material.rotation += dt * 0.8; };
      break;
    }
    case 'pulsar': {
      spr(glowTexture('rgba(230,245,255,1)', 'rgba(160,220,255,0.5)', 'rgba(90,140,255,0.1)'), 0xffffff, S * 0.7);
      const beams = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045 * S, 0.045 * S, S * 6, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      beams.rotation.z = 0.6;
      rootObj.add(beams);
      tick = dt => { beams.rotation.y += dt * 9; };
      break;
    }
    case 'neutronStar':
      spr(glowTexture('rgba(235,240,255,1)', 'rgba(190,210,255,0.5)', 'rgba(120,150,255,0.1)'), 0xffffff, S * 0.8);
      break;
    case 'whiteDwarf':
      spr(glowTexture('rgba(255,255,255,1)', 'rgba(235,235,255,0.45)', 'rgba(200,200,255,0.08)'), 0xf4f4ff, S * 0.8);
      break;
    case 'globularCluster':
    case 'openCluster': {
      const n = obj.kind === 'globularCluster' ? 260 : 90;
      const rng = mulberry32(obj.seed || 1);
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const rr = S * (obj.kind === 'globularCluster' ? 0.5 * Math.pow(rng(), 1.6) : 0.7 * rng());
        const phi = Math.acos(2 * rng() - 1), th = rng() * TAU;
        pos[i * 3] = rr * Math.sin(phi) * Math.cos(th);
        pos[i * 3 + 1] = rr * Math.cos(phi) * (obj.kind === 'globularCluster' ? 1 : 0.4);
        pos[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(th);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rootObj.add(new THREE.Points(geo, new THREE.PointsMaterial({
        map: pointTexture(), color: obj.kind === 'globularCluster' ? 0xffe0b0 : 0xcfe0ff,
        size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })));
      break;
    }
    case 'snRemnant': {
      const shell = spr(ringTexture(), 0xff9d80, S);
      tick = dt => {
        shell.scale.addScalar(dt * 0.12 * S);
        if (shell.scale.x > S * 2.2) shell.scale.setScalar(S);
        shell.material.opacity = 1.4 - shell.scale.x / (S * 2.2);
      };
      break;
    }
    case 'quasar': {
      spr(glowTexture('rgba(255,255,255,1)', 'rgba(210,180,255,0.6)', 'rgba(150,110,255,0.15)'), 0xffffff, S * 1.6);
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * S, 0.16 * S, S * 7, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xc9b1ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      rootObj.add(jet);
      tick = dt => { jet.rotation.y += dt * 0.6; };
      break;
    }
  }

  const pickSprite = rootObj.children.find(c => c.isSprite) || rootObj.children[0];
  if (pickSprite) {
    pickSprite.userData.pick = { type: 'object', id: obj.id };
    pickables.push(pickSprite);
  }
  const label = makeLabel(objectLabelFor(obj), S * 0.9);
  label.visible = state.fx.showLabels;
  rootObj.add(label);
  galaxyGroup.add(rootObj);
  objectVisuals.set(obj.id, { rootObj, tick, label });
}

// "Pulsar 3" — the kind plus its ordinal among placed objects of that kind, so
// a field of nine nebulae is still individually identifiable. Always numbered:
// labels are written once at placement, so an unnumbered first object would be
// stranded next to a "Pulsar 2" the moment a second one lands.
function objectLabelFor(obj) {
  const ordinal = state.objects.filter(o => o.kind === obj.kind).indexOf(obj) + 1;
  return `${objectKind(obj.kind)?.name || 'Object'} ${ordinal}`;
}

function setLabelsVisible(visible) {
  state.fx.showLabels = visible;
  labelRenderer.domElement.style.display = visible ? '' : 'none';
  systemView.setLabelsVisible(visible);
}

// Galaxy nameplates and system nameplates share the one #crLabels layer. While
// inside a system only the system scene is rendered, so the galaxy CSS2DObjects
// would hang frozen at their last screen position — hide their DOM on entry and
// restore it on exit. (When labels are globally off the whole layer is already
// display:none, so this is a no-op in that case.)
function setGalaxyLabelsHidden(hidden) {
  scene.traverse(node => {
    if (node.isCSS2DObject) {
      node.visible = !hidden;
      node.element.style.display = hidden ? 'none' : '';
    }
  });
}

function removeObjectVisual(id) {
  const vis = objectVisuals.get(id);
  if (!vis) return;
  removePickablesOf(vis.rootObj);
  disposeObject3D(vis.rootObj);
  objectVisuals.delete(id);
}

/* ================================================================
   TRANSIENT EFFECTS
   ================================================================ */

const effects = [];

function addEffect(build) {
  const fx = build();
  effects.push(fx);
  return fx;
}

function flashAt(worldPos, { color = 0xfff2dc, size = 26, dur = 2.4 } = {}) {
  return addEffect(() => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.08)'),
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.position.copy(worldPos);
    sprite.scale.setScalar(size * 0.2);
    fxGroup.add(sprite);
    return {
      t: 0, dur,
      tick(fx, dt) {
        fx.t += dt;
        const u = fx.t / fx.dur;
        sprite.scale.setScalar(size * (0.2 + u * 1.3));
        sprite.material.opacity = Math.max(0, 1 - u);
      },
      dispose() { disposeObject3D(sprite); },
    };
  });
}

function randomDiskPoint() {
  if (!galaxy) return new THREE.Vector3();
  const R = galaxy.sample.R;
  const a = Math.random() * TAU;
  const r = R * (0.25 + Math.random() * 0.65);
  const local = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * R * 0.05, Math.sin(a) * r);
  return galaxyGroup.localToWorld(local);
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.tick(fx, dt);
    if (fx.t >= fx.dur) {
      fx.dispose();
      effects.splice(i, 1);
    }
  }
}

/* ================================================================
   UI PLUMBING — toasts, hint, fade
   ================================================================ */

function toast(message) {
  const host = $('crToasts');
  if (!host) return;
  const el = document.createElement('p');
  el.className = 'cr-toast';
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), 4200);
  while (host.children.length > 4) host.firstChild.remove();
}

function hint(text) {
  const el = $('crHint');
  el.hidden = !text;
  el.textContent = text || '';
}

function fadeDip(fn) {
  const fade = $('crFade');
  fade.classList.add('on');
  setTimeout(() => {
    fn();
    fade.classList.remove('on');
  }, 520);
}

function unlock(id, quiet = false) {
  if (!id || state.discoveries.has(id)) return;
  const entry = encyclopediaEntry(id);
  if (!entry) return;
  state.discoveries.add(id);
  if (!quiet) toast(`Codex unlocked — ${entry.title}`);
  state.codexFocus = id;          // a fresh discovery opens itself in the Codex
  refreshEncyclopedia();
}

/* ================================================================
   WIZARD
   ================================================================ */

const WIZARD_STEPS = [
  { id: 'crStepType', title: 'Choose a Galaxy Type' },
  { id: 'crStepStructure', title: 'Shape the Structure' },
  { id: 'crStepPopulation', title: 'Seed the Population' },
  { id: 'crStepPhysics', title: 'Tune the Physics' },
];
let regenTimer = 0;

function scheduleRegen() {
  clearTimeout(regenTimer);
  regenTimer = setTimeout(() => rebuildGalaxy(state.params), 150);
}

function sliderRow(key, def, value, onInput) {
  const wrap = document.createElement('div');
  wrap.className = 'cr-slider';
  const label = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = def.label;
  const out = document.createElement('output');
  label.append(name, out);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = def.min; input.max = def.max; input.step = def.step; input.value = value;
  input.id = `cr-param-${key}`;
  const paint = () => {
    out.textContent = `${input.value}${def.unit || ''}`;
    paintRangeFill(input);
  };
  input.addEventListener('input', () => {
    paint();
    onInput(Number(input.value));
  });
  paint();
  wrap.append(label, input);
  return wrap;
}

function buildWizard() {
  const grid = $('crTypeGrid');
  grid.replaceChildren();
  for (const type of GALAXY_TYPES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'cr-type-card';
    card.dataset.type = type.id;
    card.innerHTML = `<b>${type.name}</b><span>${type.desc}</span>`;
    card.addEventListener('click', () => {
      state.params.type = type.id;
      syncTypeCards();
      scheduleRegen();
    });
    grid.append(card);
  }
  for (const [group, hostId] of [
    ['structure', 'crStructureSliders'], ['population', 'crPopulationSliders'], ['physics', 'crPhysicsSliders'],
  ]) {
    const host = $(hostId);
    host.replaceChildren();
    for (const [key, def] of Object.entries(PARAM_DEFS)) {
      if (def.group !== group) continue;
      host.append(sliderRow(key, def, state.params[key], v => {
        state.params[key] = key === 'arms' || key === 'clusterCount' ? Math.round(v) : v;
        scheduleRegen();
      }));
    }
  }
  $('crNameInput').value = state.params.name;
}

function syncTypeCards() {
  for (const card of document.querySelectorAll('.cr-type-card')) {
    card.classList.toggle('on', card.dataset.type === state.params.type);
  }
}

function showWizardStep(i) {
  state.wizardStep = i;
  WIZARD_STEPS.forEach((step, idx) => { $(step.id).hidden = idx !== i; });
  $('crWizardTitle').textContent = WIZARD_STEPS[i].title;
  [...$('crStepDots').children].forEach((dot, idx) => dot.classList.toggle('on', idx <= i));
  $('crPrevBtn').disabled = i === 0;
  $('crNextBtn').hidden = i === WIZARD_STEPS.length - 1;
  $('crGenerateBtn').hidden = i !== WIZARD_STEPS.length - 1;
}

function enterWizard() {
  state.view = 'wizard';
  state.params = state.params || defaultParams('spiral');
  $('crTitle').classList.add('hidden');
  $('crWizard').hidden = false;
  $('crHud').hidden = true;
  buildWizard();
  syncTypeCards();
  showWizardStep(0);
  clearGuests();
  rebuildGalaxy(state.params);
  flyTo(new THREE.Vector3(0, state.params.diameter * 0.62, state.params.diameter * 1.05), new THREE.Vector3());
}

function clearGuests() {
  for (const g of guests) disposeObject3D(g.group);
  guests.length = 0;
}

/* ================================================================
   SIM VIEW + TRANSPORT
   ================================================================ */

function buildTransport() {
  const host = $('crSpeeds');
  host.replaceChildren();
  SPEEDS.forEach((mult, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cr-speed';
    btn.dataset.idx = idx;
    btn.textContent = speedLabel(mult);
    btn.title = idx === 0 ? 'Play' : `Play at ${speedLabel(mult)}`;
    btn.addEventListener('click', () => {
      state.sim.speedIdx = idx;
      state.sim.playing = true;
      if (systemView.active) state.sim.dps = SYSTEM_SPEEDS[idx];   // pip picks a d/s preset
      syncTransport();
    });
    host.append(btn);
  });
  $('crPauseBtn').addEventListener('click', () => {
    state.sim.playing = false;
    syncTransport();
  });
}

function syncTransport() {
  $('crPauseBtn').setAttribute('aria-pressed', String(!state.sim.playing));
  for (const btn of $('crSpeeds').children) {
    btn.setAttribute('aria-pressed', String(state.sim.playing && Number(btn.dataset.idx) === state.sim.speedIdx));
  }
  $('crYears').textContent = formatYears(state.sim.years);
  // Inside a system the bar names the system, not its parent galaxy.
  $('crGalaxyName').textContent = systemView.active && systemView.system
    ? systemView.system.name
    : (state.params ? state.params.name : '');
  syncGlance();
  syncSimPanel();
}

// Reflect transport-driven speed/playing back into the Sim tab controls.
// Repaint directly — dispatching 'input' would re-fire setSystemDps and loop.
function syncSimPanel() {
  const playing = document.getElementById('crSimPlaying');
  if (playing) playing.checked = state.sim.playing;
  const speed = document.getElementById('cr-param-speed');
  if (speed && Number(speed.value) !== state.sim.dps) {
    speed.value = state.sim.dps;
    const out = speed.previousElementSibling?.querySelector('output');
    if (out) out.textContent = `${state.sim.dps} d/s`;
    paintRangeFill(speed);
  }
}

// Sim tab — status, controls, display and automatic/manual events for the
// entered system. Mirrors the As the Gods Will Sim page; toggles reuse the
// creator's cr-check style (kept consistent with the other creator tabs).
function buildSimPanel() {
  const playing = $('crSimPlaying');
  playing.checked = state.sim.playing;
  playing.addEventListener('change', () => { state.sim.playing = playing.checked; syncTransport(); });

  const sliders = $('crSimSliders');
  sliders.append(sliderRow('speed',
    { label: 'Speed', min: 1, max: 200, step: 1, unit: ' d/s' }, state.sim.dps, setSystemDps));
  sliders.append(sliderRow('gravity',
    { label: 'Gravity', min: 0, max: 5, step: 0.1, unit: '×' }, simGravity,
    v => { simGravity = v; systemView.setGravity(v); }));
  sliders.append(sliderRow('planetScale',
    { label: 'Planet size', min: 0.5, max: 4, step: 0.05, unit: '×' }, 1, v => systemView.setPlanetScale(v)));
  sliders.append(sliderRow('orbitScale',
    { label: 'Distances', min: 0.6, max: 2, step: 0.05, unit: '×' }, 1, v => systemView.setOrbitScale(v)));

  const trails = $('crSimTrails');
  trails.addEventListener('change', () => systemView.setTrailsVisible(trails.checked));
  const labels = $('crSimLabels');
  labels.checked = state.fx.showLabels;
  labels.addEventListener('change', () => setLabelsVisible(labels.checked));

  const collisions = $('crSimCollisions');
  collisions.addEventListener('change', () => { simCollisions = collisions.checked; systemView.setCollisions(collisions.checked); });
  const eclipses = $('crSimEclipses');
  eclipses.addEventListener('change', () => systemView.setEclipses(eclipses.checked));
  const asteroids = $('crSimAsteroids');
  asteroids.addEventListener('change', () => systemView.setResidentAsteroids(asteroids.checked));
}

// Speed slider is the source of truth for the in-system day-rate; snap the
// transport pip highlight to the nearest preset.
function setSystemDps(v) {
  state.sim.dps = v;
  state.sim.playing = true;
  let best = 0, bd = Infinity;
  SYSTEM_SPEEDS.forEach((s, i) => { const d = Math.abs(s - v); if (d < bd) { bd = d; best = i; } });
  state.sim.speedIdx = best;
  syncTransport();
}

// Manual events adapt to the entered system: an eclipse button appears only
// when a moon (lunar) or a planet (transit) can produce one. Rebuilt per system.
function buildManualEvents() {
  const host = $('crSimManual');
  if (!host) return;
  host.replaceChildren();
  const kind = systemView.active ? systemView.eclipseSupport() : null;
  if (!kind) {
    const note = document.createElement('p');
    note.className = 'cr-dim';
    note.textContent = 'No eclipse-capable bodies in this system.';
    host.append(note);
    return;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cr-btn wide';
  btn.textContent = kind === 'lunar' ? 'Trigger lunar eclipse' : 'Trigger transit';
  btn.addEventListener('click', () => {
    const res = systemView.triggerEclipse();
    if (res?.ok) {
      toast(`Aligned a ${res.label}`);
      $('crSimEclipses').checked = true;   // triggering forces shadows on
    }
  });
  host.append(btn);
}

// The three glance slots read galaxy stats out in the galaxy, and the entered
// system's own census (worlds / moons / comets) once you step inside one.
function syncGlance() {
  const sys = systemView.active ? systemView.system : null;
  let labels, values;
  if (sys) {
    const moons = sys.planets.reduce((n, p) => n + (p.moons | 0), 0);
    labels = ['Worlds', 'Moons', 'Comets'];
    values = [String(sys.planets.length), String(moons), String(sys.comets)];
  } else {
    if (!state.stats) return;
    labels = ['Stars', 'Gas', 'Systems'];
    values = [formatCount(state.stats.totalStars), `${Math.round(state.stats.gasSupply * 100)}%`, String(state.systems.length)];
  }
  ['crGlanceStars', 'crGlanceGas', 'crGlanceSystems'].forEach((id, i) => {
    const value = $(id);
    if (!value) return;
    value.textContent = values[i];
    if (value.previousElementSibling) value.previousElementSibling.textContent = labels[i];
  });
}

function finalizeGalaxy() {
  state.params = sanitizeParams({ ...state.params, name: $('crNameInput')?.value || state.params.name });
  state.stats = createStats(state.params);
  state.sim = { years: 0, speedIdx: 1, playing: true, dps: 10 };
  enterSim(true);
  unlock(`galaxy-${state.params.type}`, true);
  toast(`${state.params.name} ignites. You are its creator.`);
}

function startCreatorOnboarding() {
  if (previewMode) return;
  if (onboardingTour) return;
  let wasPlaying = false;
  let panelCollapsed = false;
  onboardingTour = startOnboardingTour({
    appRoot: root,
    storageKey: ONBOARDING_KEYS.creator,
    steps: [
      {
        target: renderer.domElement,
        title: 'Navigate Your Galaxy',
        description: 'Drag to orbit, right-drag to pan, use the mouse wheel to zoom, click objects to inspect them, and double-click a stellar system to enter it.',
      },
      {
        target: '#crPanel',
        title: 'Creator Controls',
        description: 'Use Build, Place, Events, Stats, Codex, Save, and FX to shape and manage the galaxy. System views add Bodies, Sim, and Cam.',
      },
      {
        target: '#crTransport',
        title: 'Cosmic Time',
        description: 'Pause the simulation or choose how quickly your galaxy evolves.',
      },
      {
        target: '#creatorBackLink',
        title: 'Back to Modes',
        description: 'Return to mode selection, or return from a stellar system to its galaxy.',
      },
    ],
    onStart: () => {
      wasPlaying = state.sim.playing;
      panelCollapsed = $('crPanel').classList.contains('collapsed');
      if (panelCollapsed) $('crPanelCollapse').click();
      state.sim.playing = false;
      syncTransport();
    },
    onEnd: () => {
      onboardingTour = null;
      if (destroyed) return;
      if (panelCollapsed && !$('crPanel').classList.contains('collapsed')) $('crPanelCollapse').click();
      state.sim.playing = wasPlaying;
      syncTransport();
    },
  });
}

function stopCreatorOnboarding() {
  onboardingTour?.destroy();
  onboardingTour = null;
}

function enterSim(regen) {
  state.view = 'sim';
  $('crTitle').classList.add('hidden');
  $('crWizard').hidden = true;
  $('crHud').hidden = false;
  clearGuests();                 // title apparitions must never bleed into the sim
  if (regen) rebuildGalaxy(state.params);
  syncAging();
  syncTransport();
  syncSystemChrome();          // first entry establishes the galaxy tool set
  refreshStats();
  refreshEncyclopedia();
  refreshSlots();
  const R = state.params.diameter / 2;
  flyTo(new THREE.Vector3(R * 0.4, R * 0.75, R * 1.5), new THREE.Vector3());
  startCreatorOnboarding();
}

/* camera tween */
let camTween = null;
function flyTo(pos, target, dur = 1.6) {
  camTween = {
    t: 0, dur,
    fromPos: camera.position.clone(), toPos: pos.clone(),
    fromTarget: controls.target.clone(), toTarget: target.clone(),
  };
}

function updateCamTween(dt) {
  if (!camTween) return;
  camTween.t += dt;
  const u = Math.min(camTween.t / camTween.dur, 1);
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
  controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
  if (u >= 1) camTween = null;
}

/* ================================================================
   ENTERING A STELLAR SYSTEM

   Galaxy view punches in toward the marker, the screen dips to black
   mid-flight, and the dedicated system scene picks the same motion up
   on the other side. The cut lands inside the dip, so it reads as one
   continuous zoom rather than a scene swap.
   ================================================================ */

let galaxyReturnPose = null;
let transitionTimer = 0;
// The entered system is a route (/#/creator/{slug}); the URL is the source of
// truth. `routeSystemSlug` mirrors the slug the router last asked for, and
// `pendingSystemSlug` queues a switch that has to wait for an exit to finish.
let routeSystemSlug = route?.view === 'system' ? route.system : null;
let pendingSystemSlug = null;

// Entry triggers navigate to the slug URL rather than entering directly; the
// router bounces back through setView, which runs the real choreography.
function requestEnterSystem(systemId) {
  const system = state.systems.find(s => s.id === systemId);
  if (!system) return false;
  navigate(`/creator/${systemSlug(system.name)}`);
  return true;
}

function enterSystemBySlug(slug) {
  const system = findSystemBySlug(state.systems, slug);
  return system ? enterSystem(system.id) : false;
}

// Router hook: the creator page is one mount whose galaxy and system are views.
function setView(view, routeArg) {
  const slug = view === 'system' ? (routeArg?.system || null) : null;
  routeSystemSlug = slug;
  if (slug) {
    if (systemView.active) {
      if (systemView.system && systemSlug(systemView.system.name) === slug) return;
      pendingSystemSlug = slug;      // switch systems: exit first, tail re-enters
      exitSystem();
      return;
    }
    if (enterSystemBySlug(slug)) return;
    if (state.view === 'title') { deepEnter(slug); return; }
    replaceRoute('/creator');        // galaxy live but has no such system
    return;
  }
  // Any non-system creator URL: cancel a mid-flight entry and leave a system.
  pendingSystemSlug = null;
  clearTimeout(transitionTimer);
  if (systemView.active) exitSystem();
  else state.focusSystemId = null;
}

// Cold boot deep link: no galaxy is loaded yet, so find a save that contains
// the requested system, restore it, then enter. Nothing matches -> title.
function deepEnter(slug) {
  for (const info of store.listSlots()) {
    const data = store.load(info.name);
    if (data && findSystemBySlug(data.systems, slug)) {
      applyState(data);
      enterSystemBySlug(slug);
      return;
    }
  }
  replaceRoute('/creator');
}

function enterSystem(systemId) {
  if (systemView.active || state.view !== 'sim') return false;
  const system = state.systems.find(s => s.id === systemId);
  const vis = systemVisuals.get(systemId);
  if (!system || !vis) return false;

  galaxyReturnPose = { position: camera.position.clone(), target: controls.target.clone() };
  setPlacing(null);                       // placement tools are galaxy-only
  state.focusSystemId = systemId;

  const worldPos = vis.rootObj.getWorldPosition(new THREE.Vector3());
  flyTo(worldPos.clone().add(new THREE.Vector3(3, 4, 7)), worldPos, 0.85);

  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    fadeDip(() => {
      state.view = 'system';
      camTween = null;
      systemView.enter(system);
      setGalaxyLabelsHidden(true);        // galaxy plates would freeze over the system
      lensingPass.enabled = false;        // sim-only; leaving it on strands a stale warp
      applyFx();                          // system view runs a gentler bloom
      syncSystemChrome();
      selectPick({ type: 'system', id: system.id });
    });
  }, 620);
  return true;
}

function exitSystem() {
  if (!systemView.active) return false;
  clearTimeout(transitionTimer);
  fadeDip(() => {
    systemView.exit();
    setGalaxyLabelsHidden(false);       // hand the galaxy its nameplates back
    state.view = 'sim';
    state.focusSystemId = null;
    applyFx();
    syncSystemChrome();
    if (galaxyReturnPose) {
      camera.position.copy(galaxyReturnPose.position);
      controls.target.copy(galaxyReturnPose.target);
      controls.update();
      galaxyReturnPose = null;
    }
    if (pendingSystemSlug) {         // a system-to-system switch waited on this exit
      const next = pendingSystemSlug;
      pendingSystemSlug = null;
      enterSystemBySlug(next);
    }
  });
  return true;
}

// Galaxy tools have no meaning inside a system and exploration tools have none
// outside one, so the toolbar swaps wholesale rather than greying things out.
// The tab you were last using in each context is remembered and restored.
function syncSystemChrome() {
  const inSystem = state.view === 'system';
  const context = inSystem ? 'system' : 'galaxy';

  for (const tab of document.querySelectorAll('.cr-tab')) {
    tab.hidden = !panelInContext(tab.dataset.panel, context);
  }

  if (!panelInContext(activePanel, context)) {
    if (inSystem) {
      galaxyPanelMemory = activePanel;
      openPanel(panelInContext(systemPanelMemory, 'system') ? systemPanelMemory : 'bodies');
    } else {
      systemPanelMemory = activePanel;
      openPanel(panelInContext(galaxyPanelMemory, 'galaxy') ? galaxyPanelMemory : 'stats');
    }
  } else {
    openPanel(activePanel);          // re-run so context-sensitive bodies refill
  }

  // Both system lists are rebuilt on every transition, not just when their tab
  // happens to be open — the Cam select must be populated before it is shown.
  refreshBodyList();
  refreshCamTargets();
  buildManualEvents();          // the eclipse event adapts to the entered system
  syncTransport();

  // The back control returns to the galaxy from inside a system, and to the
  // mode menu from the galaxy itself.
  const back = $('creatorBackLink');
  if (back) {
    back.innerHTML = ICONS.back + '<span>' + (inSystem ? 'Back to Galaxy' : 'Back to Modes') + '</span>';
    back.setAttribute('href', inSystem ? '#/creator' : '#/modes');
  }
  hint(inSystem ? 'Click a body to inspect it · Esc returns to the galaxy' : '');
}

/* ================================================================
   PANELS
   ================================================================ */

// `where` decides which context a tab belongs to: 'galaxy' tools shape the
// galaxy, 'system' tools explore one, and 'both' follow you everywhere.
const PANELS = {
  build: { el: 'crBuildPanel', title: 'Build', where: 'galaxy' },
  place: { el: 'crPlacePanel', title: 'Place Objects', where: 'galaxy' },
  events: { el: 'crEventsPanel', title: 'Cosmic Events', where: 'galaxy' },
  bodies: { el: 'crBodiesPanel', title: 'Bodies', where: 'system' },
  sim: { el: 'crSimPanel', title: 'Simulation', where: 'system' },
  cam: { el: 'crCamPanel', title: 'Camera', where: 'system' },
  stats: { el: 'crStatsPanel', title: 'Galaxy Statistics', where: 'both' },
  encyclopedia: { el: 'crEncPanel', title: 'Cosmic Codex', where: 'both' },
  save: { el: 'crSavePanel', title: 'Save & Share', where: 'both' },
  fx: { el: 'crFxPanel', title: 'Graphics', where: 'both' },
};
let activePanel = 'stats';
let galaxyPanelMemory = 'stats';    // tab to restore when leaving a system
let systemPanelMemory = 'bodies';   // tab to restore when re-entering a system

function panelInContext(name, context) {
  const where = PANELS[name]?.where;
  return where === 'both' || where === context;
}

// The panel is a persistent right-hand rail (like the As the Gods Will #ui);
// selecting a tab swaps the active body rather than opening/closing the panel.
function openPanel(name) {
  activePanel = name;
  for (const [key, def] of Object.entries(PANELS)) {
    $(def.el).hidden = key !== name;
  }
  for (const tab of document.querySelectorAll('.cr-tab')) {
    tab.classList.toggle('on', tab.dataset.panel === name);
    tab.setAttribute('aria-selected', String(tab.dataset.panel === name));
  }
  if (name === 'stats') refreshStats(true);
  if (name === 'encyclopedia') refreshEncyclopedia();
  if (name === 'save') refreshSlots();
  if (name === 'bodies') refreshBodyList();
  if (name === 'cam') refreshCamTargets();
  if (name === 'sim') { buildManualEvents(); syncSimPanel(); }
}

/* ================================================================
   SYSTEM-CONTEXT PANELS
   ================================================================ */

function refreshBodyList() {
  const host = $('crBodyList');
  if (!host) return;
  host.replaceChildren();
  if (!systemView.active) {
    const empty = document.createElement('p');
    empty.className = 'cr-dim';
    empty.textContent = 'Enter a stellar system to inspect its worlds.';
    host.append(empty);
    return;
  }
  for (const body of systemView.listTargets()) {
    const row = document.createElement('div');
    row.className = 'cr-body-row';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = body.visible;
    toggle.title = `Show ${body.name}`;
    toggle.addEventListener('change', () => systemView.setBodyVisible(body.id, toggle.checked));

    const name = document.createElement('span');
    name.className = 'cr-body-name';
    name.textContent = body.name;

    const kind = document.createElement('span');
    kind.className = 'cr-body-kind';
    kind.textContent = body.kind;

    const fly = document.createElement('button');
    fly.type = 'button';
    fly.className = 'cr-btn small';
    fly.textContent = 'Fly to';
    fly.addEventListener('click', () => {
      systemView.focusTarget(body.id);
      syncCamTargetTo(body.id);
    });

    row.append(toggle, name, kind, fly);
    host.append(row);
  }
}

function refreshCamTargets() {
  const select = $('crCamTarget');
  if (!select) return;
  const previous = select.value;
  select.replaceChildren();
  const targets = systemView.active ? systemView.listTargets() : [];
  for (const body of targets) {
    const option = document.createElement('option');
    option.value = body.id;
    option.textContent = `${body.name} · ${body.kind}`;
    select.append(option);
  }
  if (targets.some(t => t.id === previous)) select.value = previous;
  syncCamButtons();
}

// Impact and Laser aim at a star or planet (moons are too small to lock), so
// their target selects are refilled whenever the roster of bodies changes.
// Whatever moved the camera — a click in the scene, a Bodies row, a moon row —
// the Target select has to agree, or it silently lies about where you are.
function syncCamTargetTo(id) {
  const select = $('crCamTarget');
  if (select && [...select.options].some(o => o.value === id)) select.value = id;
}

function syncCamButtons() {
  const mode = systemView.cameraMode;
  for (const btn of document.querySelectorAll('.cr-cam-btn')) {
    btn.classList.toggle('on', btn.dataset.cam === mode);
    btn.setAttribute('aria-pressed', String(btn.dataset.cam === mode));
  }
  const meta = CAMERA_MODES.find(m => m.id === mode);
  if (meta) $('crCamHint').textContent = meta.hint;
}

function buildPanels() {
  for (const tab of document.querySelectorAll('.cr-tab')) {
    tab.addEventListener('click', () => openPanel(tab.dataset.panel));
  }
  $('crPanelCollapse').addEventListener('click', () => {
    const collapsed = $('crPanel').classList.toggle('collapsed');
    $('crPanelCollapse').setAttribute('aria-expanded', String(!collapsed));
  });

  // Build panel — stars
  const starSel = $('crStarType');
  for (const s of STAR_TYPES) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    starSel.append(opt);
  }
  starSel.value = 'G';
  const starSliders = $('crStarSliders');
  const starCfg = { ageGyr: 4.6, tempK: 5700, lumExp: 0 };
  const starDefs = {
    ageGyr: { label: 'Stellar age', min: 0.1, max: 13, step: 0.1, unit: ' Gyr' },
    tempK: { label: 'Temperature', min: 2500, max: 40000, step: 100, unit: ' K' },
    lumExp: { label: 'Luminosity (log₁₀ L☉)', min: -2, max: 4.8, step: 0.1, unit: '' },
  };
  const syncStarSliders = () => {
    starSliders.replaceChildren();
    for (const [key, def] of Object.entries(starDefs)) {
      starSliders.append(sliderRow(key, def, starCfg[key], v => { starCfg[key] = v; }));
    }
  };
  starSel.addEventListener('change', () => {
    const base = starByType(starSel.value);
    starCfg.tempK = base.tempK;
    starCfg.lumExp = Number(Math.log10(base.luminosity).toFixed(1));
    starCfg.ageGyr = Math.min(base.lifeYr / 2e9, 4.6);
    syncStarSliders();
  });
  syncStarSliders();

  $('crAddSystemBtn').addEventListener('click', () => {
    if (state.placing?.mode === 'system') {
      setPlacing(null);
      return;
    }
    setPlacing({
      mode: 'system',
      config: {
        type: starSel.value,
        count: Number($('crStarCount').value),
        ageYr: starCfg.ageGyr * 1e9,
        tempK: starCfg.tempK,
        luminosity: Number((10 ** starCfg.lumExp).toFixed(3)),
      },
    });
  });

  // Build panel — planets
  const classSel = $('crPlanetClass');
  for (const c of PLANET_CLASSES) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    classSel.append(opt);
  }
  const atmoSel = $('crPlanetAtmo');
  for (const a of ATMOSPHERES) {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a[0].toUpperCase() + a.slice(1);
    atmoSel.append(opt);
  }
  atmoSel.value = 'thin';
  const planetCfg = { radius: 1, mass: 1, orbitAU: 1, rotationHours: 24, moons: 1 };
  const planetDefs = {
    radius: { label: 'Radius', min: 0.1, max: 12, step: 0.1, unit: ' R⊕' },
    mass: { label: 'Mass', min: 0.01, max: 300, step: 0.01, unit: ' M⊕' },
    orbitAU: { label: 'Orbital distance', min: 0.1, max: 40, step: 0.1, unit: ' AU' },
    rotationHours: { label: 'Rotation', min: 1, max: 120, step: 1, unit: ' h' },
    moons: { label: 'Moons', min: 0, max: 12, step: 1, unit: '' },
  };
  const planetSliders = $('crPlanetSliders');
  for (const [key, def] of Object.entries(planetDefs)) {
    planetSliders.append(sliderRow(key, def, planetCfg[key], v => { planetCfg[key] = v; }));
  }
  $('crAddPlanetBtn').addEventListener('click', () => {
    const system = state.systems.find(s => s.id === state.focusSystemId)
      || (state.selection?.type === 'system' ? state.selection.system : null);
    if (!system) return;
    const planet = derivePlanet({
      name: `${system.name} ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][system.planets.length] || system.planets.length + 1}`,
      class: classSel.value,
      radius: planetCfg.radius,
      mass: planetCfg.mass,
      atmosphere: atmoSel.value,
      rotationHours: Math.round(planetCfg.rotationHours),
      orbitAU: planetCfg.orbitAU,
      rings: $('crPlanetRings').checked,
      moons: Math.round(planetCfg.moons),
    }, system);
    system.planets.push(planet);
    system.planets.sort((a, b) => a.orbitAU - b.orbitAU);
    state.stats.totalPlanets += 1;
    if (planet.habitable) {
      state.stats.habitablePlanets += 1;
      unlock('habitable');
    }
    rebuildSystemDetail(system);
    toast(`${planet.name} formed — ${planet.climate.toLowerCase()}`);
    refreshStats();
  });

  // Place panel
  const placeGrid = $('crPlaceGrid');
  for (const kind of OBJECT_KINDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cr-choice';
    btn.dataset.kind = kind.id;
    btn.innerHTML = `${kind.name}<small>${kind.desc}</small>`;
    btn.addEventListener('click', () => {
      const armed = state.placing?.mode === 'object' && state.placing.kind === kind.id;
      setPlacing(armed ? null : { mode: 'object', kind: kind.id });
    });
    placeGrid.append(btn);
  }

  // Events panel
  const eventGrid = $('crEventGrid');
  for (const ev of COSMIC_EVENTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cr-choice';
    btn.dataset.event = ev.id;
    btn.innerHTML = `${ev.name}<small>${ev.desc}</small>`;
    btn.addEventListener('click', () => triggerEvent(ev.id));
    eventGrid.append(btn);
  }

  // Save panel
  $('crSaveBtn').addEventListener('click', () => {
    const name = $('crSaveName').value.trim() || state.params.name;
    store.save(name, snapshotState());
    toast(`Saved “${name}”`);
    refreshSlots();
  });
  $('crExportBtn').addEventListener('click', exportGalaxy);
  $('crImportBtn').addEventListener('click', () => $('crImportFile').click());
  $('crImportFile').addEventListener('change', importGalaxyFile);
  $('crShotBtn').addEventListener('click', captureScreenshot);

  // FX panel — live graphics controls (mirrors the As the Gods Will FX tab)
  const fxQuality = $('crFxQuality');
  fxQuality.value = String(state.fx.quality);
  fxQuality.addEventListener('change', () => { state.fx.quality = Number(fxQuality.value); applyFx(); });
  const fxSliders = $('crFxSliders');
  const fxDefs = {
    bloom: { label: 'Bloom glow', min: 0, max: 3, step: 0.05, unit: '' },
    starBrightness: { label: 'Star brightness', min: 0.3, max: 1.6, step: 0.05, unit: '×' },
  };
  for (const [key, def] of Object.entries(fxDefs)) {
    fxSliders.append(sliderRow(key, def, state.fx[key], v => { state.fx[key] = v; applyFx(); }));
  }
  const bindFxToggle = (id, key) => {
    const el = $(id);
    el.checked = state.fx[key];
    el.addEventListener('change', () => { state.fx[key] = el.checked; applyFx(); });
  };
  bindFxToggle('crFxNebulae', 'showNebulae');
  bindFxToggle('crFxClusters', 'showClusters');
  bindFxToggle('crFxTwinkle', 'twinkle');

  buildSimPanel();

  // Cam panel — the exploration camera modes
  const camGrid = $('crCamGrid');
  for (const mode of CAMERA_MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cr-cam-btn';
    btn.dataset.cam = mode.id;
    btn.textContent = mode.label;
    btn.addEventListener('click', () => {
      systemView.setCameraMode(mode.id);
      syncCamButtons();
    });
    camGrid.append(btn);
  }
  $('crCamTarget').addEventListener('change', event => {
    systemView.focusTarget(event.target.value);
  });
}

function rebuildSystemDetail(system) {
  const vis = systemVisuals.get(system.id);
  if (vis?.detail) {
    removePickablesOf(vis.detail);
    disposeObject3D(vis.detail);
    vis.detail = null;
  }
  buildSystemDetail(system);
  if (vis) vis.detail.visible = state.focusSystemId === system.id;
  if (systemView.active && systemView.system?.id === system.id) systemView.rebuild(system);
}

/* ================================================================
   STATS / ENCYCLOPEDIA / SAVE PANELS
   ================================================================ */

let statsTimer = 0;

function refreshStats(force) {
  if (!state.stats) return;
  const host = $('crStatsList');
  if (!force && ($('crStatsPanel').hidden || !host)) return;
  const s = state.stats;
  const rows = [
    ['Total stars', formatCount(s.totalStars)],
    ['Total planets', formatCount(s.totalPlanets)],
    ['Habitable planets', formatCount(s.habitablePlanets), s.habitablePlanets > 0],
    ['Black holes', formatCount(s.blackHoles)],
    ['Nebulae', formatCount(s.nebulae)],
    ['Star clusters', formatCount(s.clusters)],
    ['Avg stellar age', formatYears(s.avgStellarAgeYr)],
    ['Galaxy mass', `${formatCount(s.galaxyMassSuns)} M☉`],
    ['Central black hole', `${formatCount(s.bhMassSuns)} M☉`],
    ['Supernovae witnessed', formatCount(s.supernovae)],
    ['Gas supply', `${Math.round(s.gasSupply * 100)}%`],
    ['Systems founded', String(state.systems.length)],
    ['Objects placed', String(state.objects.length)],
  ];
  host.replaceChildren();
  for (const [label, value, good] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (good) dd.className = 'good';
    host.append(dt, dd);
  }
}

function refreshEncyclopedia() {
  const host = $('crEncList');
  if (!host) return;
  $('crEncProgress').textContent = `${state.discoveries.size} of ${ENCYCLOPEDIA.length} entries discovered`;
  host.replaceChildren();
  let focused = null;
  for (const entry of ENCYCLOPEDIA) {
    const unlocked = state.discoveries.has(entry.id);
    const active = unlocked && state.codexFocus === entry.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cr-enc-entry${unlocked ? '' : ' locked'}${active ? ' on' : ''}`;
    btn.dataset.entry = entry.id;
    btn.disabled = !unlocked;
    btn.innerHTML = unlocked
      ? `<b>${entry.title}</b><p>${entry.body}</p>`
      : `<b>???</b><p>Discover this phenomenon to decode the entry.</p>`;
    btn.addEventListener('click', () => focusCodexEntry(entry.id));
    host.append(btn);
    if (active) focused = btn;
  }
  if (focused) focused.scrollIntoView({ block: 'nearest' });
}

// Highlights an entry and scrolls it into view. Bodies stay visible either
// way — clicking points you at an entry, it never hides the others.
function focusCodexEntry(id) {
  if (!state.discoveries.has(id)) return;
  state.codexFocus = state.codexFocus === id ? null : id;
  refreshEncyclopedia();
}

function refreshSlots() {
  const host = $('crSlotList');
  if (!host) return;
  host.replaceChildren();
  for (const slot of store.listSlots()) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'cr-slot-name';
    name.textContent = `${slot.name} — ${slot.galaxyName}`;
    const when = document.createElement('time');
    when.textContent = slot.savedAt ? new Date(slot.savedAt).toLocaleDateString() : '';
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'cr-btn small';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      const data = store.load(slot.name);
      if (data) loadGalaxy(data);
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'cr-btn small danger';
    delBtn.textContent = 'Delete';
    delBtn.title = 'Delete save';
    delBtn.addEventListener('click', () => {
      store.remove(slot.name);
      refreshSlots();
    });
    li.append(name, when, loadBtn, delBtn);
    host.append(li);
  }
  $('crLoadBtn').hidden = store.listSlots().length === 0;
}

/* ================================================================
   SNAPSHOT / RESTORE / EXPORT / SCREENSHOT
   ================================================================ */

function snapshotState() {
  return {
    version: 1,
    savedAt: Date.now(),
    params: state.params,
    sim: state.sim,
    stats: state.stats,
    systems: state.systems,
    objects: state.objects,
    discoveries: [...state.discoveries],
  };
}

function clearWorld() {
  for (const id of [...systemVisuals.keys()]) removeSystemVisual(id);
  for (const id of [...objectVisuals.keys()]) removeObjectVisual(id);
  state.systems = [];
  state.objects = [];
  state.focusSystemId = null;
  state.selection = null;
  $('crInspector').hidden = true;
}

// User-initiated galaxy load (slot / import). applyState itself stays routing-
// free (deep entry calls it directly); this wrapper resyncs the URL when the
// old galaxy's stellar sub-route no longer applies.
function loadGalaxy(data) {
  fadeDip(() => {
    applyState(data);
    if (routeSystemSlug) replaceRoute('/creator');
  });
}

function applyState(data) {
  const clean = sanitizeState(data);
  if (systemView.active) {          // the entered system is about to be replaced
    systemView.exit();
    state.view = 'sim';
    galaxyReturnPose = null;
    syncSystemChrome();
    applyFx();                      // re-arm galaxy bloom, drop the flare pass
  }
  clearWorld();
  state.params = clean.params;
  state.sim = { ...clean.sim, dps: clean.sim.dps ?? 10 };   // persistence omits dps; default it
  state.stats = { ...createStats(clean.params), ...clean.stats };
  state.discoveries = new Set(clean.discoveries);
  state.systems = clean.systems;
  state.objects = clean.objects;
  for (const system of state.systems) addSystemVisual(system);
  for (const obj of state.objects) addObjectVisual(obj);
  enterSim(true);
  toast(`Welcome back to ${state.params.name}`);
}

function exportGalaxy() {
  const blob = new Blob([serializeState(snapshotState())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(state.params.name || 'galaxy').replace(/[^\w-]+/g, '_')}.cosmicx.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Galaxy exported as JSON');
}

function importGalaxyFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = deserializeState(String(reader.result));
      loadGalaxy(data);
    } catch {
      toast('Import failed — not a valid galaxy file');
    }
  };
  reader.readAsText(file);
}

function captureScreenshot() {
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(state.params?.name || 'cosmicx').replace(/[^\w-]+/g, '_')}.png`;
  a.click();
  toast('Cinematic screenshot captured');
}

/* ================================================================
   PLACEMENT + PICKING
   ================================================================ */

const raycaster = new THREE.Raycaster();
raycaster.params.Sprite = { threshold: 1 };
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let downAt = null;

function pointerToRay(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}

// The armed tool survives a successful drop, so a field of nebulae costs one
// palette click plus N canvas clicks instead of 2N. `null` disarms.
function setPlacing(next) {
  state.placing = next;
  const kind = next?.mode === 'object' ? next.kind : null;
  for (const btn of document.querySelectorAll('#crPlaceGrid .cr-choice')) {
    btn.classList.toggle('on', btn.dataset.kind === kind);
  }
  $('crAddSystemBtn').classList.toggle('on', next?.mode === 'system');
  if (!next) hint('');
  else if (next.mode === 'system') hint('Click anywhere in the galaxy to found a stellar system (Esc cancels)');
  else hint(`Click the galaxy to place: ${objectKind(kind).name} (Esc cancels)`);
}

function bumpPlacingHint() {
  const placing = state.placing;
  if (!placing) return;
  placing.count = (placing.count || 0) + 1;
  const label = placing.mode === 'system' ? 'Stellar system' : objectKind(placing.kind).name;
  hint(`${label} ×${placing.count} placed — click to add another (Esc to stop)`);
}

function handleCanvasClick(event) {
  if (state.view === 'system') {
    systemView.pick(event);
    return;
  }
  if (state.view !== 'sim') return;
  pointerToRay(event);

  if (state.placing) {
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
    const local = galaxyGroup.worldToLocal(hit.clone());
    const R = state.params.diameter / 2;
    if (local.length() > R * 1.2) local.setLength(R * 1.2);
    if (state.placing.mode === 'system') placeSystemAt(local);
    else placeObjectAt(local, state.placing.kind);
    bumpPlacingHint();
    return;
  }

  const hits = raycaster.intersectObjects(pickables, true);
  for (const h of hits) {
    let node = h.object;
    while (node && !node.userData.pick) node = node.parent;
    if (node?.userData.pick) {
      selectPick(node.userData.pick, node);
      return;
    }
  }
  // clicking empty space clears the selection
  state.selection = null;
  $('crInspector').hidden = true;
}

function placeSystemAt(local) {
  const cfg = state.placing.config;
  const stars = [];
  for (let i = 0; i < cfg.count; i++) {
    stars.push({ type: cfg.type, ageYr: cfg.ageYr, tempK: cfg.tempK, luminosity: cfg.luminosity });
  }
  const system = createSystem({
    name: `${state.params.name} ${String.fromCharCode(65 + (state.systems.length % 26))}-${state.systems.length + 1}`,
    pos: [local.x, local.y, local.z],
    stars,
  }, evolveRng);
  state.systems.push(system);
  addSystemVisual(system);
  state.stats.totalStars += cfg.count;
  state.stats.totalPlanets += system.planets.length;
  const habitable = system.planets.filter(p => p.habitable).length;
  state.stats.habitablePlanets += habitable;
  if (habitable) unlock('habitable');
  unlock(`star-${cfg.type}`, true);
  if (['star-O', 'star-G', 'star-M'].includes(`star-${cfg.type}`)) unlock(`star-${cfg.type}`);
  toast(`${system.name} founded — ${system.planets.length} worlds formed`);
  refreshStats();
  selectPick({ type: 'system', id: system.id });
}

function placeObjectAt(local, kindId) {
  const kind = objectKind(kindId);
  const obj = {
    id: `obj-${Math.floor(Math.random() * 1e9).toString(36)}`,
    kind: kindId,
    pos: [local.x, local.y, local.z],
    scale: 1,
    seed: (Math.random() * 1e9) | 0,
  };
  state.objects.push(obj);
  addObjectVisual(obj);
  const s = state.stats;
  if (kindId === 'nebula' || kindId === 'snRemnant') s.nebulae += 1;
  if (kindId === 'blackHole' || kindId === 'quasar') s.blackHoles += 1;
  if (kindId === 'pulsar' || kindId === 'neutronStar') s.neutronStars += 1;
  if (kindId === 'globularCluster' || kindId === 'openCluster') s.clusters += 1;
  unlock(kindId);
  toast(`${kind.name} placed`);
  refreshStats();
}

function selectPick(pick, node = null) {
  if (pick.type === 'system') {
    const system = state.systems.find(s => s.id === pick.id);
    if (!system) return;
    state.selection = { type: 'system', system };
    showInspector(system.name, `${system.stars.length > 1 ? 'Multiple' : starByType(system.stars[0].type).name} stellar system`, systemFacts(system), { removable: true, enterable: true });
    $('crPlanetTarget').textContent = `→ ${system.name}`;
    $('crAddPlanetBtn').disabled = false;
  } else if (pick.type === 'planet') {
    const system = state.systems.find(s => s.id === pick.systemId);
    const planet = system?.planets.find(p => p.name === pick.planetName);
    if (!planet) return;
    state.selection = { type: 'planet', system, planet };
    showInspector(planet.name, `${PLANET_CLASSES.find(c => c.id === planet.class)?.name || planet.class} planet`, planetFacts(planet), {
      removable: false, enterable: true, extras: buildPlanetExtras(planet, system),
    });
  } else if (pick.type === 'moon') {
    const system = state.systems.find(s => s.id === pick.systemId);
    const planet = system?.planets.find(p => p.name === pick.planetName);
    const moon = layoutForSystem(system)?.planets
      .find(p => p.name === pick.planetName)?.moonList.find(m => m.name === pick.moonName);
    if (!moon) return;
    state.selection = { type: 'moon', system, planet, moon };
    showInspector(moon.name, `Moon of ${planet.name}`, moonFacts(moon, planet), { removable: false });
  } else if (pick.type === 'object') {
    const obj = state.objects.find(o => o.id === pick.id);
    if (!obj) return;
    const kind = objectKind(obj.kind);
    state.selection = { type: 'object', object: obj };
    showInspector(kind.name, kind.desc, objectFacts(obj), { removable: true });
  } else if (pick.type === 'nebula-bg' || pick.type === 'cluster-bg') {
    state.selection = { type: pick.type, name: pick.name, sprite: node };
    const isNeb = pick.type === 'nebula-bg';
    showInspector(pick.name, isNeb ? 'Star-forming region' : 'Stellar cluster', [
      ['Composition', isNeb ? 'Hydrogen, helium, dust' : 'Gravitationally bound stars'],
      ['Origin', 'Formed with the galaxy'],
    ], { removable: false });
  }
}

function systemFacts(system) {
  const lum = systemLuminosity(system);
  return [
    ['Stars', system.stars.map(s => s.type).join(' + ')],
    ['Temperature', `${system.stars[0].tempK.toLocaleString('en-US')} K`],
    ['Luminosity', `${lum >= 100 ? formatCount(lum) : lum.toFixed(2)} L☉`],
    ['Stellar age', formatYears(system.stars[0].ageYr)],
    ['Habitable zone', `${system.habitableZone.in.toFixed(2)}–${system.habitableZone.out.toFixed(2)} AU`],
    ['Planets', String(system.planets.length)],
    ['Asteroid belt', system.belt ? 'Yes' : 'No'],
    ['Comets', String(system.comets)],
  ];
}

function planetFacts(planet) {
  return [
    ['Radius', `${planet.radius} R⊕`],
    ['Mass', `${planet.mass} M⊕`],
    ['Gravity', `${planet.gravity} g`],
    ['Orbit', `${planet.orbitAU} AU`],
    ['Year', `${planet.periodDays.toLocaleString('en-US')} days`],
    ['Day', `${planet.rotationHours} h`],
    ['Surface temp', `${planet.surfaceTemp} K`],
    ['Atmosphere', planet.atmosphere],
    ['Climate', planet.climate],
    ['Moons', String(planet.moons)],
    ['Rings', planet.rings ? 'Yes' : 'No'],
    ['Habitable', planet.habitable ? 'YES' : 'No'],
  ];
}

function moonFacts(moon, planet) {
  return [
    ['Host', planet.name],
    ['Radius', `${moon.radius} R⊕`],
    ['Orbit', `${moon.distance} planet radii`],
    ['Period', `${moon.periodDays} days`],
    ['Rotation', 'Tidally locked'],
  ];
}

function objectFacts(obj) {
  const kind = objectKind(obj.kind);
  return [
    ['Class', kind.name],
    ['Position', obj.pos.map(v => v.toFixed(0)).join(', ')],
  ];
}

function showInspector(name, kindLine, facts, { removable, enterable = false, extras = null }) {
  $('crFocusBtn').textContent = enterable && !systemView.active ? 'Enter System' : 'Focus';
  $('crInspName').textContent = name;
  $('crInspKind').textContent = kindLine;
  const dl = $('crInspFacts');
  dl.replaceChildren();
  for (const [label, value] of facts) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (value === 'YES') dd.className = 'good';
    dl.append(dt, dd);
  }
  $('crInspExtra').replaceChildren(...(extras ? [extras] : []));
  $('crRemoveBtn').hidden = !removable;
  $('crInspector').hidden = false;
}

/* ================================================================
   DOSSIER EXTRAS — atmosphere mix, habitability, moon roster.
   Mirrors the As the Gods Will planet dossier so a created world is
   presented with the same depth as a real one.
   ================================================================ */

function layoutForSystem(system) {
  return systemView.active && systemView.system?.id === system.id
    ? systemView.layout
    : systemViewLayout(system);
}

function section(label) {
  const el = document.createElement('p');
  el.className = 'cr-insp-section';
  el.textContent = label;
  return el;
}

function buildPlanetExtras(planet, system) {
  const frag = document.createDocumentFragment();

  frag.append(section('Atmosphere'));
  const bar = document.createElement('div');
  bar.className = 'cr-atmo-bar';
  const key = document.createElement('div');
  key.className = 'cr-atmo-key';
  for (const [gas, fraction] of atmosphereComposition(planet.atmosphere)) {
    const colour = ATMOSPHERE_COLORS[gas] || '#6d8fd6';
    const slice = document.createElement('span');
    slice.style.width = `${(fraction * 100).toFixed(1)}%`;
    slice.style.background = colour;
    slice.title = `${gas} ${(fraction * 100).toFixed(0)}%`;
    bar.append(slice);

    const entry = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = colour;
    entry.append(swatch, `${gas} ${(fraction * 100).toFixed(0)}%`);
    key.append(entry);
  }
  frag.append(bar, key);

  const score = habitabilityScore(planet, system.habitableZone);
  frag.append(section(`Habitability — ${(score * 100).toFixed(0)}%`));
  const track = document.createElement('div');
  track.className = 'cr-hab-track';
  const thumb = document.createElement('div');
  thumb.className = 'cr-hab-thumb';
  thumb.style.width = `${(score * 100).toFixed(1)}%`;
  track.append(thumb);
  frag.append(track);

  const moons = layoutForSystem(system)?.planets.find(p => p.name === planet.name)?.moonList ?? [];
  if (moons.length) {
    frag.append(section(`Moons — ${moons.length}`));
    const list = document.createElement('div');
    list.className = 'cr-moons';
    // Fly-to only means something once you are standing in the scene. From the
    // galaxy dossier the rows are static readouts, not dead-looking buttons.
    const flyable = systemView.active;
    for (const moon of moons) {
      const row = document.createElement(flyable ? 'button' : 'div');
      if (flyable) row.type = 'button';
      row.className = `cr-moon-row${flyable ? '' : ' static'}`;
      row.innerHTML = `${moon.name}<br><small>${moon.distance.toFixed(1)} planet radii · ${moon.periodDays.toFixed(1)} d</small>`;
      if (flyable) {
        row.addEventListener('click', () => {
          systemView.focusTarget(`moon:${moon.name}`);
          syncCamTargetTo(`moon:${moon.name}`);
          selectPick({ type: 'moon', systemId: system.id, planetName: planet.name, moonName: moon.name });
        });
      }
      list.append(row);
    }
    frag.append(list);
  }
  return frag;
}

function scanSelection() {
  const sel = state.selection;
  if (!sel) return;
  if (sel.type === 'system') {
    unlock(`star-${sel.system.stars[0].type}`);
    if (sel.system.planets.some(p => p.habitable)) unlock('habitable');
  } else if (sel.type === 'planet') {
    if (sel.planet.habitable) unlock('habitable');
    unlock(`star-${sel.system.stars[0].type}`, true);
  } else if (sel.type === 'object') {
    unlock(sel.object.kind);
  } else if (sel.type === 'nebula-bg') {
    unlock('nebula');
  } else if (sel.type === 'cluster-bg') {
    unlock(sel.name?.startsWith('Globular') ? 'globularCluster' : 'openCluster');
  }
  toast('Scan complete — codex updated');
}

function focusSelection() {
  const sel = state.selection;
  if (!sel) return;
  let worldPos = null;
  if (sel.type === 'system' || sel.type === 'planet') {
    const vis = systemVisuals.get((sel.system || sel.system).id);
    if (!vis) return;
    state.focusSystemId = sel.system.id;
    buildSystemDetail(sel.system);
    worldPos = vis.rootObj.getWorldPosition(new THREE.Vector3());
    flyTo(worldPos.clone().add(new THREE.Vector3(6, 9, 14)), worldPos);
  } else if (sel.type === 'object') {
    const vis = objectVisuals.get(sel.object.id);
    if (!vis) return;
    worldPos = vis.rootObj.getWorldPosition(new THREE.Vector3());
    flyTo(worldPos.clone().add(new THREE.Vector3(5, 6, 12)), worldPos);
  } else if (sel.sprite) {
    worldPos = sel.sprite.getWorldPosition(new THREE.Vector3());
    flyTo(worldPos.clone().add(new THREE.Vector3(6, 8, 16)), worldPos);
  }
}

function removeSelection() {
  const sel = state.selection;
  if (!sel) return;
  if (sel.type === 'system') {
    state.systems = state.systems.filter(s => s.id !== sel.system.id);
    removeSystemVisual(sel.system.id);
    if (state.focusSystemId === sel.system.id) state.focusSystemId = null;
    toast(`${sel.system.name} dismantled`);
  } else if (sel.type === 'object') {
    state.objects = state.objects.filter(o => o.id !== sel.object.id);
    removeObjectVisual(sel.object.id);
    toast('Object removed');
  }
  state.selection = null;
  $('crInspector').hidden = true;
  $('crAddPlanetBtn').disabled = true;
  $('crPlanetTarget').textContent = '— select a system first';
  refreshStats();
}

/* ================================================================
   COSMIC EVENTS
   ================================================================ */

const COSMIC_EVENTS = [
  { id: 'supernova', name: 'Supernova', desc: 'Detonate a massive star' },
  { id: 'grb', name: 'Gamma-Ray Burst', desc: 'Fire relativistic jets' },
  { id: 'bhMerger', name: 'Black Hole Merger', desc: 'Collide two singularities' },
  { id: 'asteroidImpact', name: 'Asteroid Impact', desc: 'Strike a created planet' },
  { id: 'starCollision', name: 'Star Collision', desc: 'Fuse two suns into one' },
  { id: 'galaxyCollision', name: 'Galaxy Collision', desc: 'Summon an intruder galaxy' },
  { id: 'starFormation', name: 'New Star Formation', desc: 'Ignite a stellar nursery' },
  { id: 'cometShower', name: 'Comet Shower', desc: 'Rain ice through the disk' },
];
let collider = null;   // incoming galaxy during a collision event

function triggerEvent(id) {
  if (state.view !== 'sim') return;
  const s = state.stats;
  switch (id) {
    case 'supernova': {
      const pos = randomDiskPoint();
      flashAt(pos, { color: 0xfff0d0, size: 30 });
      s.supernovae += 1;
      s.neutronStars += 1;
      s.nebulae += 1;
      unlock('event-supernova');
      toast('A star detonates — its ashes will seed new worlds');
      break;
    }
    case 'grb': {
      const pos = randomDiskPoint();
      addEffect(() => {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.9, 240, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xd8ffe8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.copy(pos);
        fxGroup.add(beam);
        return {
          t: 0, dur: 2.2,
          tick(fx, dt) { fx.t += dt; beam.material.opacity = 0.85 * (1 - fx.t / fx.dur); beam.rotation.y += dt * 2; },
          dispose() { disposeObject3D(beam); },
        };
      });
      flashAt(pos, { color: 0xd0ffe0, size: 44, dur: 1.6 });
      unlock('event-grb');
      toast('Gamma-ray burst — the brightest event since the Big Bang');
      break;
    }
    case 'bhMerger': {
      const center = randomDiskPoint();
      addEffect(() => {
        const mk = () => {
          const bh = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture('rgba(200,220,255,1)', 'rgba(120,150,255,0.4)', 'rgba(60,80,255,0.08)'),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          }));
          bh.scale.setScalar(5);
          fxGroup.add(bh);
          return bh;
        };
        const a = mk(), b = mk();
        return {
          t: 0, dur: 5,
          tick(fx, dt) {
            fx.t += dt;
            const u = Math.min(fx.t / 4, 1);
            const r = 10 * (1 - u * u);
            const ang = fx.t * (2 + u * 9);
            a.position.set(center.x + Math.cos(ang) * r, center.y, center.z + Math.sin(ang) * r);
            b.position.set(center.x - Math.cos(ang) * r, center.y, center.z - Math.sin(ang) * r);
            if (u >= 1 && !fx.flashed) {
              fx.flashed = true;
              flashAt(center, { color: 0xcfd8ff, size: 40, dur: 2 });
              state.stats.blackHoles = Math.max(0, state.stats.blackHoles - 1);
              state.stats.bhMassSuns += 60;
              toast('Spacetime rings — the black holes are one');
            }
          },
          dispose() { disposeObject3D(a); disposeObject3D(b); },
        };
      });
      unlock('event-bhMerger');
      break;
    }
    case 'asteroidImpact': {
      const target = state.systems.find(sys => sys.planets.length);
      if (!target) {
        toast('Create a stellar system with planets first');
        return;
      }
      const vis = systemVisuals.get(target.id);
      const pos = vis.rootObj.getWorldPosition(new THREE.Vector3());
      flashAt(pos, { color: 0xffc9a0, size: 10, dur: 1.8 });
      const victim = target.planets[0];
      toast(`An asteroid slams into ${victim.name} — the skies darken`);
      unlock('event-supernova', true);
      break;
    }
    case 'starCollision': {
      const pos = randomDiskPoint();
      flashAt(pos, { color: 0xbfe0ff, size: 24, dur: 2.6 });
      s.totalStars = Math.max(1, s.totalStars - 1);
      toast('Two suns merge into a blue straggler');
      break;
    }
    case 'galaxyCollision': {
      if (collider) {
        toast('A collision is already underway');
        return;
      }
      startGalaxyCollision();
      break;
    }
    case 'starFormation': {
      const pos = randomDiskPoint();
      flashAt(pos, { color: 0x9fc4ff, size: 20, dur: 3 });
      s.totalStars += 1e4;
      s.nebulae = Math.max(20, s.nebulae - 1);
      s.gasSupply = Math.max(0.02, s.gasSupply - 0.001);
      unlock('nebula', true);
      toast('A nursery ignites — ten thousand stars are born');
      break;
    }
    case 'cometShower': {
      addEffect(() => {
        const sprites = [];
        for (let i = 0; i < 14; i++) {
          const c = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture('rgba(220,242,255,1)', 'rgba(170,210,255,0.5)', 'rgba(120,170,255,0.06)'),
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          }));
          c.scale.setScalar(1.6);
          const a = Math.random() * TAU;
          c.position.set(Math.cos(a) * 120, 40 + Math.random() * 30, Math.sin(a) * 120);
          c.userData.v = c.position.clone().multiplyScalar(-0.016);
          c.userData.v.y = -0.5 - Math.random();
          fxGroup.add(c);
          sprites.push(c);
        }
        return {
          t: 0, dur: 4.5,
          tick(fx, dt) {
            fx.t += dt;
            for (const c of sprites) c.position.addScaledVector(c.userData.v, dt * 32);
          },
          dispose() { for (const c of sprites) disposeObject3D(c); },
        };
      });
      unlock('event-cometShower');
      toast('Comets streak through the disk');
      break;
    }
  }
  refreshStats();
}

function startGalaxyCollision() {
  const type = ['spiral', 'irregular', 'elliptical'][(Math.random() * 3) | 0];
  const params = {
    ...defaultParams(type),
    seed: (Math.random() * 0x7fffffff) | 0,
    diameter: state.params.diameter * (0.45 + Math.random() * 0.25),
    starDensity: 0.5,
  };
  const { points } = buildGalaxyPoints(params, { stride: 2 });
  const holder = new THREE.Group();
  holder.add(points);
  const a = Math.random() * TAU;
  const dist = state.params.diameter * 1.6;
  holder.position.set(Math.cos(a) * dist, 30, Math.sin(a) * dist);
  holder.rotation.x = (Math.random() - 0.5) * 0.9;
  scene.add(holder);
  collider = { holder, points, params, t: 0, dur: 14 };
  unlock('event-collision');
  toast(`${params.name} approaches — brace for the merger`);
}

function updateCollider(dt) {
  if (!collider) return;
  collider.t += dt;
  const u = Math.min(collider.t / collider.dur, 1);
  const e = u * u * (3 - 2 * u);
  collider.holder.position.multiplyScalar(Math.max(1 - e - dt * 0.2, 0.001) / Math.max(1 - (e - dt * 0.02), 0.001));
  collider.holder.position.lerp(new THREE.Vector3(0, 0, 0), dt * (0.05 + u * 0.25));
  collider.holder.rotation.y += dt * 0.2;
  collider.points.material.uniforms.uClock.value = clock.elapsedTime;
  if (u >= 1) {
    const other = collider;
    collider = null;
    fadeDip(() => {
      disposeObject3D(other.holder);
      state.params = sanitizeParams({
        ...state.params,
        type: 'elliptical',
        mass: Math.min(state.params.mass + other.params.mass, PARAM_DEFS.mass.max),
        diameter: Math.min(state.params.diameter * 1.18, PARAM_DEFS.diameter.max),
        starFormationRate: Math.min(state.params.starFormationRate + 2, PARAM_DEFS.starFormationRate.max),
      });
      state.stats = mergeStats(state.stats, createStats(other.params));
      rebuildGalaxy(state.params);
      syncTransport();
      refreshStats();
      toast(`The galaxies are one — ${state.params.name} is reborn as an elliptical`);
    });
  }
}

/* ================================================================
   SPONTANEOUS EVOLUTION VISUALS + DISCOVERY SWEEP
   ================================================================ */

function handleEvolutionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'supernova') {
      flashAt(randomDiskPoint(), { color: 0xffe9c8, size: 18, dur: 2 });
      unlock('event-supernova', true);
    } else if (ev.type === 'starburst') {
      flashAt(randomDiskPoint(), { color: 0xa8ccff, size: 26, dur: 3 });
      toast('A starburst ripples through the arms');
    }
  }
}

let discoveryTimer = 0;
function sweepDiscoveries(dt) {
  discoveryTimer += dt;
  if (discoveryTimer < 0.5 || !galaxy || state.view !== 'sim') return;
  discoveryTimer = 0;
  const camPos = camera.position;
  const tmp = new THREE.Vector3();
  for (const sprite of galaxy.sprites) {
    const kind = sprite.userData.kind;
    if (kind !== 'nebula-bg' && kind !== 'cluster-bg') continue;
    if (sprite.userData.found) continue;
    sprite.getWorldPosition(tmp);
    if (camPos.distanceTo(tmp) < 18) {
      sprite.userData.found = true;
      const name = sprite.userData.pick?.name || 'a structure';
      toast(`Discovered ${name}`);
      unlock(kind === 'nebula-bg' ? 'nebula' : (name.startsWith('Globular') ? 'globularCluster' : 'openCluster'), true);
    }
  }
}

/* ================================================================
   INPUT WIRING
   ================================================================ */

function setupUI() {
  $('crCreateBtn').addEventListener('click', enterWizard);
  $('crLoadBtn').addEventListener('click', () => {
    const slots = store.listSlots();
    if (!slots.length) return;
    const data = store.load(slots[0].name);
    if (data) loadGalaxy(data);
  });
  $('crPrevBtn').addEventListener('click', () => showWizardStep(Math.max(0, state.wizardStep - 1)));
  $('crNextBtn').addEventListener('click', () => showWizardStep(Math.min(WIZARD_STEPS.length - 1, state.wizardStep + 1)));
  $('crGenerateBtn').addEventListener('click', finalizeGalaxy);
  $('crNameInput').addEventListener('input', () => { state.params.name = $('crNameInput').value; });
  $('crSeedBtn').addEventListener('click', () => {
    state.params.seed = (Math.random() * 0x7fffffff) | 0;
    state.params.name = randomGalaxyName();
    $('crNameInput').value = state.params.name;
    scheduleRegen();
  });
  $('crInspClose').addEventListener('click', () => { $('crInspector').hidden = true; });
  $('crScanBtn').addEventListener('click', scanSelection);
  $('crFocusBtn').addEventListener('click', () => {
    const sel = state.selection;
    if (systemView.active) {
      if (sel?.type === 'moon') systemView.focusTarget(`moon:${sel.moon.name}`);
      else if (sel?.type === 'planet') systemView.focusPlanet(sel.planet.name);
      else systemView.frameSystem();
    } else if (sel?.type === 'system' || sel?.type === 'planet') {
      requestEnterSystem(sel.system.id);
    } else {
      focusSelection();
    }
  });
  $('crRemoveBtn').addEventListener('click', removeSelection);

  scope.listen(root.querySelector('#creatorBackLink'), 'click', event => {
    event.preventDefault();
    // Inside a system the URL owns the exit (exitSystem runs its own dip); from
    // the galaxy, dip then leave to the mode menu.
    if (systemView.active || routeSystemSlug) navigate('/creator');
    else fadeDip(() => navigate('/modes'));
  });

  scope.listen(renderer.domElement, 'pointerdown', event => {
    downAt = { x: event.clientX, y: event.clientY };
  });
  scope.listen(renderer.domElement, 'pointerup', event => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved < 6) handleCanvasClick(event);
  });

  // Double-clicking a system (or one of its planets) flies all the way in.
  scope.listen(renderer.domElement, 'dblclick', event => {
    if (state.view !== 'sim') return;
    pointerToRay(event);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      let node = hit.object;
      while (node && !node.userData.pick) node = node.parent;
      const pick = node?.userData.pick;
      if (!pick) continue;
      if (pick.type === 'system') requestEnterSystem(pick.id);
      else if (pick.type === 'planet') requestEnterSystem(pick.systemId);
      return;
    }
  });

  scope.listen(window, 'keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space' && (state.view === 'sim' || state.view === 'system')) {
      event.preventDefault();
      state.sim.playing = !state.sim.playing;
      syncTransport();
    } else if (event.key === 'h' || event.key === 'H') {
      state.uiHidden = !state.uiHidden;
      document.body.classList.toggle('cr-ui-hidden', state.uiHidden);
    } else if (event.key === 'Escape') {
      if (state.placing) {
        setPlacing(null);
      } else if (systemView.active || routeSystemSlug) {
        navigate('/creator');              // URL owns the exit; also cancels a mid-flight entry
      } else if (!$('crInspector').hidden) {
        $('crInspector').hidden = true;
      } else if (state.focusSystemId) {
        state.focusSystemId = null;
        const R = state.params.diameter / 2;
        flyTo(new THREE.Vector3(R * 0.4, R * 0.75, R * 1.5), new THREE.Vector3());
      }
    }
  });

  buildTransport();
  buildPanels();
  refreshSlots();
}

/* ================================================================
   MAIN LOOP
   ================================================================ */

const clock = new THREE.Clock();

// Simulated time keeps running wherever the camera is — stepping into a system
// should not silently pause the galaxy's evolution behind you.
function advanceSimClock(dt) {
  if (state.sim.playing) {
    const dtYears = dt * SPEEDS[state.sim.speedIdx] * BASE_YEARS_PER_SECOND;
    state.sim.years += dtYears;
    handleEvolutionEvents(stepEvolution(state.stats, state.params, dtYears, evolveRng));
    syncAging();
  }
  statsTimer += dt;
  if (statsTimer > 0.25) {
    statsTimer = 0;
    $('crYears').textContent = formatYears(state.sim.years);
    syncGlance();
    if (activePanel === 'stats') refreshStats(true);
  }
}

function update(dt) {
  if (state.view === 'system') {
    // The galaxy scene is not on screen; its LOD, lensing and sprite work would
    // all be wasted, so only the clock and the system scene tick.
    // dps is simulated days/second; layoutOrbits already carries a ×90 visual
    // gain, so divide it out to make the Speed slider read as honest d/s.
    const simScale = state.sim.playing ? state.sim.dps / 90 : 0;
    systemView.update(dt, { simScale, gravity: simGravity, collisions: simCollisions });
    if (state.stats) advanceSimClock(dt);
    updateEffects(dt);
    return;
  }

  updateCamTween(dt);
  controls.update();

  const simMyr = state.sim.years / 1e6;
  if (galaxy) {
    // ambient cinematic spin (rigid) + physical differential rotation (shader)
    galaxyGroup.rotation.y += dt * 0.004 * (state.params ? state.params.rotationSpeed : 1);
    const uni = galaxy.points.material.uniforms;
    uni.uTime.value = simMyr;
    uni.uClock.value = clock.elapsedTime;
    for (const sprite of galaxy.sprites) placeRotSprite(sprite, simMyr);
  }

  if (state.view === 'title') {
    updateGuests(dt);
    camera.position.x = Math.sin(clock.elapsedTime * 0.05) * 30;
    camera.position.y = 24 + Math.sin(clock.elapsedTime * 0.037) * 8;
    controls.target.set(0, 0, -80);
  }

  if (state.view === 'sim' && state.stats) {
    advanceSimClock(dt);
    updateCollider(dt);
    sweepDiscoveries(dt);

    // system detail LOD + orbital motion
    for (const system of state.systems) {
      const vis = systemVisuals.get(system.id);
      if (!vis) continue;
      const worldPos = vis.rootObj.getWorldPosition(new THREE.Vector3());
      const dist = camera.position.distanceTo(worldPos);
      const near = dist < 45 || state.focusSystemId === system.id;
      if (near && !vis.detail) buildSystemDetail(system);
      if (vis.detail) {
        vis.detail.visible = near;
        vis.marker.material.opacity = near ? 0.25 : 1;
        if (near) {
          for (const child of vis.detail.children) {
            const orbit = child.userData.orbit;
            if (!orbit) continue;
            orbit.angle += dt * (TAU / orbit.period) * (6 + state.sim.speedIdx * 10);
            child.position.set(Math.cos(orbit.angle) * orbit.r, child.position.y, Math.sin(orbit.angle) * orbit.r);
          }
        }
      }
    }
    for (const vis of objectVisuals.values()) if (vis.tick) vis.tick(dt);
    updateLensing();
  }

  updateEffects(dt);
}

function updateLensing() {
  const bh = state.objects.find(o => o.kind === 'blackHole' || o.kind === 'quasar');
  if (!bh) {
    lensingPass.enabled = false;
    return;
  }
  const vis = objectVisuals.get(bh.id);
  if (!vis) { lensingPass.enabled = false; return; }
  const world = vis.rootObj.getWorldPosition(new THREE.Vector3());
  const dist = camera.position.distanceTo(world);
  const proj = world.clone().project(camera);
  const onScreen = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
  lensingPass.enabled = onScreen && dist < 90;
  if (lensingPass.enabled) {
    lensingPass.material.uniforms.uCenter.value.set((proj.x + 1) / 2, (proj.y + 1) / 2);
    lensingPass.material.uniforms.uStrength.value = Math.min(0.16, 6 / (dist + 4));
    lensingPass.material.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  }
}

function animate() {
  if (paused || destroyed) return;
  frameId = requestAnimationFrame(animate);
  update(Math.min(clock.getDelta(), 0.1));
  renderFrame();
}

// Two scenes share one composer and one label layer; both must be pointed at
// whichever pair is live or the labels belong to the scene you just left.
function renderFrame() {
  composer.render();
  if (systemView.active) labelRenderer.render(systemView.scene, systemView.camera);
  else labelRenderer.render(scene, camera);
}

/* ================================================================
   BOOT
   ================================================================ */

buildBackdropStars();
setupUI();
controls.target.set(0, 0, -80);
if (previewMode) {
  const latest = store.listSlots()[0];
  const saved = latest ? store.load(latest.name) : null;
  if (saved) {
    applyState(saved);
  } else {
    state.params = defaultParams('spiral');
    state.stats = createStats(state.params);
    rebuildGalaxy(state.params);
  }
}
if (!previewMode) {
  spawnGuestGalaxy();
  scope.setInterval(spawnGuestGalaxy, 7000);
}
animate();

// Deep link straight to a stellar system (/#/creator/{slug}). Deferred one tick
// so it runs after mount() returns and the router has recorded this instance — a
// synchronous replaceRoute during mount would destroy the fresh page.
if (route?.view === 'system') setTimeout(() => setView('system', route), 0);

window.creator = {
  THREE, camera, controls, renderer, scene, state,
  step: dt => update(dt),                    // headless simulation tick
  render: () => renderFrame(),               // headless frame render (verification)
  generate(type = 'spiral') {                // skip the wizard from the console/tests
    state.params = defaultParams(type);
    state.stats = createStats(state.params);
    state.sim = { years: 0, speedIdx: 1, playing: true, dps: 10 };
    enterSim(true);
    unlock(`galaxy-${type}`, true);
  },
  enterWizard,
  triggerEvent,
  enterSystem: requestEnterSystem,           // navigate to a system's route by id
  exitSystem,
  focusCodex: focusCodexEntry,
  get systemView() { return systemView; },
  setSpeed(idx) {
    state.sim.speedIdx = Math.min(Math.max(idx, 0), SPEEDS.length - 1);
    state.sim.playing = true;
    syncTransport();
  },
  get params() { return state.params; },
  get stats() { return state.stats; },
  get systems() { return state.systems; },
  get objects() { return state.objects; },
  get discoveries() { return [...state.discoveries]; },
  get bloomPass() { return bloomPass; },
  get lensingPass() { return lensingPass; },
  // Programmatic placement is one-shot; only the palette arms the sticky tool.
  placeSystemAt: local => {
    state.placing = { mode: 'system', config: { type: 'G', count: 1, ageYr: 4.6e9, tempK: 5700, luminosity: 1 } };
    placeSystemAt(local);
    setPlacing(null);
  },
  placeObjectAt: (local, kind) => placeObjectAt(local, kind),
  snapshotState, applyState, store,
};
const debugHandle = window.creator;

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
  stopCreatorOnboarding();
  paused = true;
  cancelAnimationFrame(frameId);
  clock.stop();
  destroyed = true;
  scope.destroy();
  for (const fx of effects) fx.dispose();
  effects.length = 0;
  clearGuests();
  clearTimeout(transitionTimer);
  if (collider) disposeObject3D(collider.holder);
  for (const tex of textureCache.values()) tex.dispose();
  textureCache.clear();
  systemView.destroy();
  labelRenderer.domElement.remove();
  disposeThreeRuntime({ scene, controls, composer, renderer });
  document.body.classList.remove('cr-ui-hidden');
  if (window.creator === debugHandle) delete window.creator;
}

return { pause, resume, destroy, setView };
}
