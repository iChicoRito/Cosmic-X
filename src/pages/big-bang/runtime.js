import { createPostprocessingShaders } from '../../shared/postprocessing-shaders.js';
import { fbm, hash2, makeCanvas, valueNoise } from '../../shared/procedural-canvas.js';
import { paintRangeFill } from '../../shared/range.js';
import { createBigBangConfig } from './config.js';
import { createEpochModel, epochPresentationAt, glideDuration, openingVisualAt } from './timeline.js';
import { createCameraChains } from './camera.js';
import { createSystemRegistry } from './systems.js';
import { bindBigBangNavigation } from './ui.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { disposeThreeRuntime } from '../../shared/dispose-three.js';
import { createResourceScope } from '../../shared/resource-scope.js';

export function createBigBangRuntime({ root, navigate }) {
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
const { BloomClampShader, LensingShader } = createPostprocessingShaders(THREE);

/* ================================================================
   CONFIG
   ================================================================ */

const { CONFIG, COUNTS } = createBigBangConfig();

/* ================================================================
   SHARED UTILITIES (copied from index.html — kept self-contained)
   ================================================================ */



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

// Lumpy potato rock (index.html makeRockGeometry) for planetesimals.
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

// Animated accretion disk (index.html) + uFade so the future epoch can keep
// the black hole as the last lit object while everything else dims.
function accretionDiskMaterial(inner, outer) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
      uFade: { value: 1 },
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uInner; uniform float uOuter; uniform float uFade;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float ang = atan(vP.y, vP.x);
        float streak = 0.6
          + 0.4 * sin(ang * 9.0 - uTime * 2.2 + r * 0.9)
          + 0.25 * sin(ang * 23.0 + uTime * 3.1 - r * 1.7);
        float inner = pow(1.0 - t, 2.2);
        float doppler = 1.0 + 0.55 * sin(ang - uTime * 0.15);
        vec3 hot = vec3(1.0, 0.92, 0.75);
        vec3 cool = vec3(0.95, 0.4, 0.12);
        vec3 col = mix(cool, hot, inner) * streak * doppler * (1.5 * inner + 0.22);
        float edge = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t));
        gl_FragColor = vec4(col, edge * min(1.0, streak) * uFade);
      }`,
    transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

// Soft HDR cap before bloom (index.html BloomClampShader).

function toast(message, color = '#8ab8ff') {
  const host = document.getElementById('toasts');
  while (host.children.length >= 4) host.firstChild.remove();
  const item = document.createElement('div');
  item.className = 'toast';
  item.style.setProperty('--toast-accent', color);
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => {
    item.classList.add('out');
    setTimeout(() => item.remove(), 450);
  }, 4200);
}

/* ---- planet pipeline (copied from index.html so both modes share one look) ---- */

const geoRadius = (radiusE) => Math.sqrt(radiusE);
const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();

function tileFbm(px, py, scale, seed, octaves, W) {
  const t = px / W;
  return fbm(px / scale, py / scale, seed, octaves) * (1 - t)
       + fbm((px - W) / scale, py / scale, seed, octaves) * t;
}

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

// Real maps swap in over the procedural base when the CDN answers; offline
// just keeps the procedural fallback (same behaviour as the sandbox).
const TEX_BASE = 'https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/';
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
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 32, 16), mat);
}

// Immersive view: one body class hides every overlay; the dimmed toggle chip
// (and the H key) restores the exact same interface — no other state touched.
function toggleImmersiveUI() {
  const hidden = document.body.classList.toggle('ui-hidden');
  const btn = document.getElementById('bbUiToggle');
  btn.textContent = hidden ? 'Show UI' : 'Hide UI';
  btn.setAttribute('aria-pressed', String(hidden));
  btn.title = hidden ? 'Show interface (H)' : 'Hide interface (H)';
}

const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const bump = (x, c, w) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));

/* ================================================================
   SCENE & POST-PROCESSING
   ================================================================ */

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 20000);
camera.position.set(0, 1, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enabled = false;

scene.add(new THREE.AmbientLight(0x334455, 0.4));

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatio));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(BloomClampShader));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
composer.addPass(bloomPass);
const lensingPass = new ShaderPass(LensingShader);
lensingPass.enabled = false;
composer.addPass(lensingPass);
composer.addPass(new OutputPass());
const fxaaPass = new ShaderPass(FXAAShader);
composer.addPass(fxaaPass);

function setFXAASize() {
  const pr = Math.min(window.devicePixelRatio, CONFIG.pixelRatio);
  fxaaPass.material.uniforms.resolution.value.set(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr));
}
setFXAASize();

scope.listen(window, 'resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  setFXAASize();
});

// Comoving space (scaled by a(u)) vs bound structures + backdrop.
const universeGroup = new THREE.Group();
const fixedGroup = new THREE.Group();
scene.add(universeGroup, fixedGroup);

// The solar-system set lives far from the galaxy-field origin so the two
// hero scenes never overlap; the camera travels there for the late epochs.
const SOLAR_POS = new THREE.Vector3(600, 0, 0);
let earthAnchor = null;
const earthWorld = new THREE.Vector3();
const earthCamera = new THREE.Vector3();
const earthCameraOffset = new THREE.Vector3(2.4, 1.2, 3.6);

/* ================================================================
   EPOCHS — the timeline data model
   Every env value is the state at the epoch's START; envAt() blends
   toward the next epoch's values across the span, so every transition
   is seamless in both directions. spans are screen-time weights.
   ================================================================ */

const { EPOCHS, epochAt, epochProgress, uForEpoch, envAt } = createEpochModel();

/* ================================================================
   PLAYBACK STATE
   ================================================================ */

const BB_SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const BASE_RATE = 1 / 90;   // full journey ≈ 90 s at 1×
const T = { u: 0, speedIdx: 2, dir: 1, playing: false, cinematic: true };
const uTween = { active: false, from: 0, to: 0, t: 0, dur: 0.8, resume: false };
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let expansionRate = 1;
let shimmerT = 0;           // cosmetic clock for shader shimmer + camera drift
const endingAnchor = new THREE.Vector3(600, 14, 0);
const endingScreen = new THREE.Vector3();

function setEndingVisible(visible) {
  const ending = document.getElementById('bbEnding');
  ending.classList.toggle('visible', !!visible);
  ending.setAttribute('aria-hidden', String(!visible));
  ending.inert = !visible;
  document.body.classList.toggle('ending', !!visible);
}

function updateEndingTracking() {
  const ending = document.getElementById('bbEnding');
  if (!ending.classList.contains('visible')) return;
  endingScreen.copy(endingAnchor).project(camera);
  const x = THREE.MathUtils.clamp((endingScreen.x * .5 + .5) * innerWidth, innerWidth * .15, innerWidth * .85);
  const y = THREE.MathUtils.clamp((-endingScreen.y * .5 + .5) * innerHeight, innerHeight * .25, innerHeight * .68);
  const scale = THREE.MathUtils.clamp(350 / Math.max(camera.position.distanceTo(endingAnchor), 1), .78, 1.12);
  ending.style.setProperty('--ending-x', x.toFixed(2) + 'px');
  ending.style.setProperty('--ending-y', y.toFixed(2) + 'px');
  ending.style.setProperty('--ending-scale', scale.toFixed(3));
}

// Title screen: park the timeline on the formed-galaxies era and drift the
// camera through it until Begin resets the journey beneath the title dissolve.
let bbTitleMode = true;
const BB_TITLE_U = (EPOCHS[6].u0 + EPOCHS[6].u1) * 0.5;

function driftTitleCamera() {
  // slow layered sinusoids — continuous, so the loop never visibly restarts
  const t = shimmerT;
  const r = 250 + Math.sin(t * 0.043) * 45;
  camera.position.set(
    Math.cos(t * 0.021) * r,
    75 + Math.sin(t * 0.029) * 35,
    Math.sin(t * 0.021) * r * 0.85,
  );
  camera.lookAt(Math.sin(t * 0.013) * 45, Math.sin(t * 0.017) * 18, 0);
  camera.fov = 55 + Math.sin(t * 0.024) * 3;
  camera.updateProjectionMatrix();
}

function stepTimeline(dt) {
  if (uTween.active) {
    uTween.t = Math.min(uTween.t + dt / uTween.dur, 1);
    const k = THREE.MathUtils.smoothstep(uTween.t, 0, 1);
    T.u = uTween.from + (uTween.to - uTween.from) * k;
    if (uTween.t >= 1) {
      uTween.active = false;
      if (uTween.resume) {
        uTween.resume = false;
        setPlaying(true);
      }
    }
    return;
  }
  if (!T.playing) return;
  const next = T.u + dt * T.dir * BB_SPEEDS[T.speedIdx] * BASE_RATE;
  T.u = THREE.MathUtils.clamp(next, 0, 1);
  if ((T.u >= 1 && T.dir > 0) || (T.u <= 0 && T.dir < 0)) {
    setPlaying(false);
    setEndingVisible(T.dir > 0);
    // The journey is over — fade the background music out completely.
    if (T.dir > 0) window.cosmicX?.audio?.pause?.();
    toast(T.dir > 0 ? 'The universe fades to black — journey complete' : 'Back before the beginning');
  }
}

function setPlaying(v) {
  T.playing = v;
  updateTransportUI();
}

function jumpToEpoch(i) {
  const idx = THREE.MathUtils.clamp(i, 0, EPOCHS.length - 1);
  const target = uForEpoch(idx);
  T.playing = false;
  updateTransportUI();
  startGlide(target);
}

function startGlide(target, resume = false) {
  const duration = glideDuration(T.u, target, prefersReducedMotion);
  if (!duration) {
    T.u = target;
    applyEpoch(T.u);
    if (resume) setPlaying(true);
    return;
  }
  uTween.active = true;
  uTween.from = T.u;
  uTween.to = target;
  uTween.t = 0;
  uTween.dur = duration;
  uTween.resume = resume;
}

function replayTimeline() {
  setEndingVisible(false);
  setPlaying(false);
  T.dir = 1;
  setCinematic(true);
  glide.active = false;
  controls.enabled = false;
  window.cosmicX?.audio?.play?.();
  startGlide(0, true);
}

/* ================================================================
   VISUAL SUBSYSTEMS — each is { apply(u, env), tick(dt) } and every
   apply is a pure function of u/env (dt only drives shader shimmer),
   so scrubbing either direction is always consistent.
   ================================================================ */

const systems = createSystemRegistry();
function addSystem(s) { systems.push(s); return s; }

const ATTEN = 220.0; // shared point-size attenuation factor

// Morphing additive point cloud: aStart→aEnd via uMix, per-point colors
// blended the same way, optional distance-based cosmological redshift.
function makeMorphPoints(build) {
  const { count } = build;
  const aStart = new Float32Array(count * 3), aEnd = new Float32Array(count * 3);
  const colA = new Float32Array(count * 3), colB = new Float32Array(count * 3);
  const aDist = new Float32Array(count), aPhase = new Float32Array(count), aSize = new Float32Array(count);
  build.fill(aStart, aEnd, colA, colB, aDist, aPhase, aSize);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(aStart, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 3));
  geo.setAttribute('aColA', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('aColB', new THREE.BufferAttribute(colB, 3));
  geo.setAttribute('aDist', new THREE.BufferAttribute(aDist, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: createPointSpriteTexture() },
      uTime: { value: 0 }, uMix: { value: 0 }, uA: { value: 0 }, uRedshift: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aEnd; attribute vec3 aColA; attribute vec3 aColB;
      attribute float aDist; attribute float aPhase; attribute float aSize;
      uniform float uMix; uniform float uTime; uniform float uRedshift;
      varying vec3 vCol; varying float vTw;
      void main() {
        vec3 p = mix(position, aEnd, uMix);
        vTw = 0.6 + 0.4 * sin(uTime * 2.0 + aPhase);
        vec3 col = mix(aColA, aColB, uMix);
        float red = clamp(aDist * uRedshift * 0.02, 0.0, 0.85);
        vCol = mix(col, vec3(1.0, 0.22, 0.08), red);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (${ATTEN.toFixed(1)} / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uA;
      varying vec3 vCol; varying float vTw;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vCol * vTw, a * uA);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

/* ---- 1. quantum foam ---- */
function buildQuantumFoam() {
  const n = COUNTS.foam;
  const pos = new Float32Array(n * 3), phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u0 * u0);
    const r = 2 + Math.pow(Math.random(), 1.6) * 6;
    pos[i * 3] = s * Math.cos(ph) * r;
    pos[i * 3 + 1] = u0 * r;
    pos[i * 3 + 2] = s * Math.sin(ph) * r;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: createPointSpriteTexture() }, uTime: { value: 0 }, uA: { value: 0 } },
    vertexShader: `
      attribute float aPhase; uniform float uTime;
      varying float vTw;
      void main() {
        vTw = pow(0.5 + 0.5 * sin(uTime * 5.0 + aPhase), 3.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.8 + 2.2 * vTw) * (120.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uA;
      varying float vTw;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0), a * uA * vTw * 0.8);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  fixedGroup.add(pts);
  addSystem({
    apply(u, env) {
      const opacity = u === EPOCHS[0].u0 ? 0 : env.foamA;
      mat.uniforms.uA.value = opacity;
      pts.visible = opacity > 0.004;
    },
    tick() { mat.uniforms.uTime.value = shimmerT; },
  });
}

/* ---- 2. the flash ---- */
function buildFlash() {
  const mat = new THREE.SpriteMaterial({
    map: createGlowTexture('rgba(255,255,255,1)', 'rgba(255,232,205,0.5)', 'rgba(255,185,120,0.1)'),
    color: new THREE.Color(2.6, 2.5, 2.2),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const particle = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff4e8, toneMapped: false }),
  );
  fixedGroup.add(sprite, particle);
  addSystem({
    apply(u, env) {
      const compressed = u === EPOCHS[0].u0;
      const openingPulse = u > EPOCHS[0].u0 && epochAt(u) === 0
        ? env.flashA * (1 - smooth(epochProgress(u), 0.02, 0.28))
        : 0;
      mat.opacity = Math.min(0.72, openingPulse);
      sprite.scale.setScalar(6 + openingPulse * 80);
      sprite.visible = !compressed && mat.opacity > 0.004;
      particle.visible = compressed;
    },
  });
}

/* ---- 2b. the shockwave: an energy ring racing out from the flash ---- */
function buildShockwave() {
  const tex = createShockTexture();
  const ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color: new THREE.Color(1.8, 1.5, 1.1),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  fixedGroup.add(ringSprite);
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.012, 8, 128),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 1.8, 1.3),
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  torus.rotation.x = Math.PI / 2 - 0.35;
  fixedGroup.add(torus);
  addSystem({
    apply(u, env) {
      const inf = EPOCHS[0];
      const k = smooth(u, inf.u0, inf.u0 + (inf.u1 - inf.u0) * 0.6);
      const strength = env.flashA * (1 - k) * 1.2;
      const on = k > 0.001 && strength > 0.01;
      ringSprite.visible = torus.visible = on;
      if (!on) return;
      ringSprite.scale.setScalar(6 + k * 260);
      ringSprite.material.opacity = Math.min(1, strength);
      torus.scale.setScalar(3 + k * 130);
      torus.material.opacity = Math.min(1, strength * 0.8);
    },
  });
}

/* ---- 3. expanding spacetime grid (comoving — universeGroup scale IS the expansion) ---- */
function buildSpaceGrid() {
  const N = 12, S = 8, half = N * S / 2;
  const verts = [];
  for (let a = 0; a <= N; a++) {
    for (let b = 0; b <= N; b++) {
      const p = a * S - half, q = b * S - half;
      verts.push(-half, p, q, half, p, q);
      verts.push(p, -half, q, p, half, q);
      verts.push(p, q, -half, p, q, half);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x8ab8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const grid = new THREE.LineSegments(geo, mat);
  universeGroup.add(grid);
  addSystem({
    apply(u, env) { mat.opacity = env.gridA * 0.32; grid.visible = env.gridA > 0.004; },
  });
}

/* ---- 4. cosmic plasma ---- */
function buildPlasma() {
  const n = COUNTS.plasma;
  const pos = new Float32Array(n * 3), phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u0 * u0);
    const r = 32 * Math.cbrt(Math.random());
    pos[i * 3] = s * Math.cos(ph) * r;
    pos[i * 3 + 1] = u0 * r;
    pos[i * 3 + 2] = s * Math.sin(ph) * r;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: createPointSpriteTexture() },
      uTime: { value: 0 }, uA: { value: 0 }, uHeat: { value: 1 },
    },
    vertexShader: `
      attribute float aPhase; uniform float uTime; uniform float uHeat;
      varying float vTw;
      void main() {
        vTw = 0.5 + 0.5 * sin(uTime * 2.5 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.7 + 1.3 * vTw) * (0.4 + 0.6 * uHeat) * (140.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uA; uniform float uHeat;
      varying float vTw;
      void main() {
        vec3 cold = vec3(0.45, 0.12, 0.05);
        vec3 warm = vec3(1.0, 0.58, 0.22);
        vec3 hot  = vec3(1.35, 1.5, 1.85);
        vec3 col = mix(cold, warm, clamp(uHeat * 2.0, 0.0, 1.0));
        col = mix(col, hot, clamp(uHeat * 2.0 - 1.0, 0.0, 1.0));
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(col * (0.5 + 0.5 * vTw), a * uA * 0.35);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  fixedGroup.add(pts);
  addSystem({
    apply(u, env) {
      mat.uniforms.uA.value = env.plasmaA;
      mat.uniforms.uHeat.value = env.plasmaHeat;
      pts.visible = env.plasmaA > 0.004;
    },
    tick() { mat.uniforms.uTime.value = shimmerT; },
  });
}

/* ---- 5. particle formation: quark soup → bound atoms (uMix morph) ---- */
function buildParticles() {
  const n = COUNTS.particles, nC = COUNTS.atomClusters;
  const centers = new Float32Array(nC * 3);
  const isHelium = new Uint8Array(nC);
  for (let c = 0; c < nC; c++) {
    const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u0 * u0);
    const r = 27 * Math.cbrt(Math.random());
    centers[c * 3] = s * Math.cos(ph) * r;
    centers[c * 3 + 1] = u0 * r;
    centers[c * 3 + 2] = s * Math.sin(ph) * r;
    isHelium[c] = Math.random() < 0.22 ? 1 : 0;
  }
  const KIND_COLORS = [
    [1.0, 0.78, 0.45],   // quarks — warm
    [0.85, 0.85, 0.9],   // gluons — white
    [0.5, 0.68, 1.0],    // electrons — blue
    [1.0, 0.45, 0.35],   // protons — red
    [0.7, 0.7, 0.78],    // neutrons — gray
  ];
  const pts = makeMorphPoints({
    count: n,
    fill(aStart, aEnd, colA, colB, aDist, aPhase, aSize) {
      for (let i = 0; i < n; i++) {
        const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u0 * u0);
        const r = 36 * Math.cbrt(Math.random());
        aStart[i * 3] = s * Math.cos(ph) * r;
        aStart[i * 3 + 1] = u0 * r;
        aStart[i * 3 + 2] = s * Math.sin(ph) * r;
        const c = i % nC;
        aEnd[i * 3] = centers[c * 3] + (Math.random() - 0.5) * 0.7;
        aEnd[i * 3 + 1] = centers[c * 3 + 1] + (Math.random() - 0.5) * 0.7;
        aEnd[i * 3 + 2] = centers[c * 3 + 2] + (Math.random() - 0.5) * 0.7;
        const kind = KIND_COLORS[i % KIND_COLORS.length];
        colA.set(kind, i * 3);
        colB.set(isHelium[c] ? [1.0, 0.8, 0.5] : [0.6, 0.75, 1.0], i * 3);
        aDist[i] = 0;
        aPhase[i] = Math.random() * Math.PI * 2;
        aSize[i] = 1.4 + Math.random() * 1.2;
      }
    },
  });
  fixedGroup.add(pts);
  const um = pts.material.uniforms;
  addSystem({
    apply(u, env) {
      um.uMix.value = env.particleMix;
      um.uA.value = env.particleA;
      pts.visible = env.particleA > 0.004;
    },
    tick() { um.uTime.value = shimmerT; },
  });
}

/* ---- 6. CMB shell — recombination makes the universe transparent ---- */
function buildCMB() {
  const mat = new THREE.MeshBasicMaterial({
    map: createNebulaTexture(99),
    color: 0xff8a4a,
    transparent: true, opacity: 0,
    side: THREE.BackSide, depthWrite: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  fixedGroup.add(shell);
  addSystem({
    apply(u, env) { mat.opacity = env.cmbA; shell.visible = env.cmbA > 0.004; },
  });
}

/* ---- 7. first stars: staggered collapse → ignition ---- */
function buildFirstStars() {
  const nebTex = [createNebulaTexture(7), createNebulaTexture(31), createNebulaTexture(55)];
  const glowTex = createGlowTexture('rgba(214,226,255,1)', 'rgba(150,180,255,0.4)', 'rgba(90,120,255,0.08)');
  const group = new THREE.Group();
  fixedGroup.add(group);
  const units = [];
  for (let i = 0; i < COUNTS.starUnits; i++) {
    const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u0 * u0);
    const r = 40 + Math.random() * 110;
    const p = new THREE.Vector3(s * Math.cos(ph) * r, u0 * r * 0.55, s * Math.sin(ph) * r);
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebTex[i % 3], color: 0x3a5aa8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xdfe8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    cloud.position.copy(p);
    glow.position.copy(p);
    group.add(cloud, glow);
    units.push({
      cloud,
      glow,
      base: 22 + hash2(i, 3, 17) * 22,
      h: hash2(i, 5, 91),
      supernova: i % 7 === 0,
    });
  }
  addSystem({
    apply(u, env) {
      group.visible = env.starA > 0.004;
      if (!group.visible) return;
      for (const unit of units) {
        const m = THREE.MathUtils.clamp(env.starMix * 1.5 - unit.h * 0.75, 0, 1);
        const collapse = smooth(m, 0, 0.6);
        unit.cloud.scale.setScalar(unit.base * (1 - 0.68 * collapse));
        unit.cloud.material.opacity = env.starA * 0.5 * (1 - smooth(m, 0.55, 0.8));
        const ignite = smooth(m, 0.55, 0.72);
        const supernova = unit.supernova ? bump(env.starMix, 0.78 + unit.h * 0.12, 0.025) : 0;
        unit.glow.scale.setScalar(2 + 11 * ignite + 28 * supernova);
        unit.glow.material.opacity = env.starA * Math.min(1, ignite + supernova);
      }
    },
  });
}

/* ---- 8. galaxy field (comoving → Hubble recession + redshift for free) ---- */
function buildGalaxies() {
  const nG = COUNTS.galaxies, per = COUNTS.galaxyPts;
  const centers = [], quats = [];
  for (let g = 0; g < nG; g++) {
    const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u0 * u0);
    const r = 14 + Math.random() * 48;   // comoving units
    centers.push(new THREE.Vector3(s * Math.cos(ph) * r, u0 * r * 0.6, s * Math.sin(ph) * r));
    quats.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)));
  }
  const local = new THREE.Vector3();
  const pts = makeMorphPoints({
    count: nG * per,
    fill(aStart, aEnd, colA, colB, aDist, aPhase, aSize) {
      let i = 0;
      for (let g = 0; g < nG; g++) {
        const C = centers[g], Q = quats[g];
        const arms = 2 + (g % 2), twist = 2.1 + hash2(g, 1, 5) * 1.4;
        for (let k = 0; k < per; k++, i++) {
          // protogalactic blob
          const bu = Math.random() * 2 - 1, bp = Math.random() * Math.PI * 2;
          const bs = Math.sqrt(1 - bu * bu), br = 4.5 * Math.cbrt(Math.random());
          aStart[i * 3] = C.x + bs * Math.cos(bp) * br;
          aStart[i * 3 + 1] = C.y + bu * br;
          aStart[i * 3 + 2] = C.z + bs * Math.sin(bp) * br;
          // settled spiral
          const t = Math.random();
          const rr = 4.6 * Math.sqrt(t);
          const ang = t * twist * Math.PI * 2 + (k % arms) * (Math.PI * 2 / arms) + (Math.random() - 0.5) * 0.5;
          local.set(Math.cos(ang) * rr, (Math.random() - 0.5) * 0.5 * (1 - t * 0.7), Math.sin(ang) * rr).applyQuaternion(Q);
          aEnd[i * 3] = C.x + local.x;
          aEnd[i * 3 + 1] = C.y + local.y;
          aEnd[i * 3 + 2] = C.z + local.z;
          const core = 1 - t;
          colA.set([0.7, 0.72, 0.85], i * 3);
          colB.set([0.55 + core * 0.45, 0.65 + core * 0.27, 1.0 - core * 0.2], i * 3);
          aDist[i] = C.length();
          aPhase[i] = Math.random() * Math.PI * 2;
          aSize[i] = 1.1 + Math.random() * 1.1;
        }
      }
    },
  });
  universeGroup.add(pts);
  // per-galaxy core glows, tinted by the same redshift law
  const glowTex = createGlowTexture('rgba(255,240,220,1)', 'rgba(255,205,150,0.35)', 'rgba(255,170,110,0.06)');
  const glows = centers.map(C => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.position.copy(C);
    sp.scale.setScalar(5);
    universeGroup.add(sp);
    return { sp, d: C.length() };
  });
  const um = pts.material.uniforms;
  const warm = new THREE.Color(1, 0.94, 0.86), red = new THREE.Color(1, 0.22, 0.08);
  addSystem({
    apply(u, env) {
      um.uMix.value = env.galaxyMix;
      um.uA.value = env.galaxyA;
      um.uRedshift.value = env.redshift;
      pts.visible = env.galaxyA > 0.004;
      for (const g of glows) {
        g.sp.visible = pts.visible;
        g.sp.material.opacity = env.galaxyA * 0.8;
        const k = Math.min(0.85, g.d * env.redshift * 0.02);
        g.sp.material.color.copy(warm).lerp(red, k);
      }
    },
    tick() { um.uTime.value = shimmerT; },
  });
}

/* ---- 9. Milky Way hero (bulge/arms/halo morph) + Sgr A* ---- */
let lensingTarget = null;   // the Milky Way's Sgr A* group (black-hole lensing anchor)

function buildHeroGalaxy(opts) {
  const {
    center = [0, 0, 0], scale = 1, tilt = [0, 0, 0], count = COUNTS.milkyWay,
    palette = {}, coreGlowScale = 26, blackHole = false, elliptical = false,
    delay = 0, spinRate = 0.008,
  } = opts;
  const bulgeCol = palette.bulge || [1.0, 0.85, 0.6];
  const armCol = palette.arm || [0.62, 0.74, 1.0];
  const pinkCol = palette.pink || [1.0, 0.5, 0.65];
  const haloCol = palette.halo || [0.45, 0.5, 0.65];
  const glowCols = palette.glow || ['rgba(255,238,205,1)', 'rgba(255,195,120,0.4)', 'rgba(255,150,70,0.08)'];
  const outer = new THREE.Group();
  outer.position.fromArray(center);
  outer.rotation.set(tilt[0], tilt[1], tilt[2]);
  outer.scale.setScalar(scale);
  fixedGroup.add(outer);
  const group = new THREE.Group();   // inner spinner
  outer.add(group);
  const n = count;
  // pre-assembly clumps the points collapse from
  const nClumps = 30;
  const clumps = [];
  for (let c = 0; c < nClumps; c++) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 45;
    clumps.push(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 24, Math.sin(a) * r));
  }
  const pts = makeMorphPoints({
    count: n,
    fill(aStart, aEnd, colA, colB, aDist, aPhase, aSize) {
      for (let i = 0; i < n; i++) {
        const C = clumps[i % nClumps];
        aStart[i * 3] = C.x + (Math.random() - 0.5) * 14;
        aStart[i * 3 + 1] = C.y + (Math.random() - 0.5) * 10;
        aStart[i * 3 + 2] = C.z + (Math.random() - 0.5) * 14;
        const zone = i / n;
        let x, y, z, col;
        if (zone < 0.25) {           // bulge
          const bu = Math.random() * 2 - 1, bp = Math.random() * Math.PI * 2;
          const bs = Math.sqrt(1 - bu * bu), br = 9 * Math.pow(Math.random(), 1.6);
          x = bs * Math.cos(bp) * br; y = bu * br * 0.55; z = bs * Math.sin(bp) * br;
          col = bulgeCol;
        } else if (zone < 0.85) {    // arms (or, for ellipticals, a smooth spheroid)
          if (elliptical) {
            const bu = Math.random() * 2 - 1, bp = Math.random() * Math.PI * 2;
            const bs = Math.sqrt(1 - bu * bu), br = 8 + 40 * Math.pow(Math.random(), 1.3);
            x = bs * Math.cos(bp) * br; y = bu * br * 0.62; z = bs * Math.sin(bp) * br;
            col = Math.random() < 0.5 ? bulgeCol : armCol;
          } else {
            const t = Math.random();
            const rr = 8 + 52 * Math.sqrt(t);
            const ang = Math.log(1 + rr * 0.22) * 2.6 + (i % 2) * Math.PI + (Math.random() - 0.5) * 0.42;
            x = Math.cos(ang) * rr; y = (Math.random() - 0.5) * 2.2 * (1 - t * 0.6); z = Math.sin(ang) * rr;
            const pink = Math.random() < 0.08;
            col = pink ? pinkCol : armCol;
          }
        } else {                      // halo
          const bu = Math.random() * 2 - 1, bp = Math.random() * Math.PI * 2;
          const bs = Math.sqrt(1 - bu * bu), br = 30 + Math.random() * 45;
          x = bs * Math.cos(bp) * br; y = bu * br * 0.7; z = bs * Math.sin(bp) * br;
          col = haloCol;
        }
        aEnd[i * 3] = x; aEnd[i * 3 + 1] = y; aEnd[i * 3 + 2] = z;
        colA.set([0.6, 0.62, 0.72], i * 3);
        colB.set(col, i * 3);
        aDist[i] = 0;
        aPhase[i] = Math.random() * Math.PI * 2;
        aSize[i] = 1.0 + Math.random() * 1.3;
      }
    },
  });
  group.add(pts);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture(glowCols[0], glowCols[1], glowCols[2]),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  coreGlow.scale.setScalar(coreGlowScale);
  group.add(coreGlow);
  // black-hole kit: horizon + photon ring + accretion disk (index.html pattern)
  let sgr = null, photon = null, diskMat = null;
  if (blackHole) {
    sgr = new THREE.Group();
    sgr.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    photon = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.05, 8, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.5), transparent: true, opacity: 1 }));
    photon.rotation.x = Math.PI / 2 - 0.42;
    sgr.add(photon);
    diskMat = accretionDiskMaterial(1.5, 5.2);
    const disk = new THREE.Mesh(new THREE.RingGeometry(1.5, 5.2, 96, 1), diskMat);
    disk.rotation.x = Math.PI / 2 - 0.42;
    sgr.add(disk);
    group.add(sgr);
    lensingTarget = sgr;
  }
  const um = pts.material.uniforms;
  addSystem({
    apply(u, env) {
      // delayed heroes assemble later in the sequence than the Milky Way
      const mixL = delay ? smooth(env.spiralMix, delay, 1) : env.spiralMix;
      const aL = env.spiralA * (delay ? smooth(env.spiralMix, delay * 0.5, delay * 0.5 + 0.2) : 1);
      outer.visible = aL > 0.004 || (blackHole && env.futureMix > 0.05);
      if (!outer.visible) return;
      um.uMix.value = mixL;
      um.uA.value = aL * (1 - env.futureMix * 0.9);
      coreGlow.material.opacity = aL * 0.75 * (1 - env.futureMix * 0.85);
      if (blackHole) {
        const ready = smooth(mixL, 0.5, 0.9);
        const remnant = smooth(env.futureMix, 0.25, 0.55) * (1 - smooth(env.futureMix, 0.82, 1));
        const fade = Math.max(aL * ready * (1 - env.futureMix), remnant);
        diskMat.uniforms.uFade.value = fade;
        photon.material.opacity = fade;
        sgr.visible = fade > 0.01;
        sgr.scale.setScalar(1 + env.futureMix * 2.2);
      }
    },
    tick(dt) {
      um.uTime.value = shimmerT;
      if (diskMat) diskMat.uniforms.uTime.value = shimmerT;
      group.rotation.y = shimmerT * spinRate;
    },
  });
}

const HERO_GALAXIES = [
  { name: 'Milky Way', blackHole: true },   // origin, default palette — the hero shot
  { name: 'Andromeda', center: [-170, 70, -380], scale: 1.15, tilt: [0.5, 0, 0.3], count: 9000, delay: 0.25, spinRate: 0.006,
    palette: { bulge: [1.0, 0.9, 0.75], arm: [0.7, 0.8, 1.0], halo: [0.5, 0.55, 0.7], glow: ['rgba(230,238,255,1)', 'rgba(170,195,255,0.4)', 'rgba(120,150,255,0.08)'] } },
  { name: 'Messier 87', center: [300, -40, -520], scale: 0.9, tilt: [0.2, 0.8, 0], count: 5000, delay: 0.45, elliptical: true, coreGlowScale: 34, spinRate: 0.003,
    palette: { bulge: [1.0, 0.86, 0.62], arm: [0.95, 0.8, 0.6], halo: [0.7, 0.62, 0.5], glow: ['rgba(255,240,215,1)', 'rgba(255,210,150,0.4)', 'rgba(255,170,90,0.08)'] } },
];

function buildHeroGalaxies() {
  for (const opts of HERO_GALAXIES) buildHeroGalaxy(opts);
}

/* ---- 10–12. solar system: nebula → disk → sun → planets → future ember ---- */
function buildSolarForm() {
  const group = new THREE.Group();
  group.position.copy(SOLAR_POS);
  fixedGroup.add(group);

  // collapsing nebula sprites (ball → disk)
  const nebTex = [createNebulaTexture(63), createNebulaTexture(77)];
  const nebs = [];
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebTex[i % 2], color: i % 3 ? 0x3a5aa8 : 0x7a4aa8,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u0 * u0), r = 8 + Math.random() * 30;
    const a2 = Math.random() * Math.PI * 2, r2 = 6 + Math.random() * 32;
    nebs.push({
      sp,
      ball: new THREE.Vector3(s * Math.cos(ph) * r, u0 * r, s * Math.sin(ph) * r),
      disk: new THREE.Vector3(Math.cos(a2) * r2, (Math.random() - 0.5) * 1.6, Math.sin(a2) * r2),
      scale: 14 + Math.random() * 14,
    });
    group.add(sp);
  }

  // the sun
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture('rgba(255,225,165,1)', 'rgba(255,160,60,0.45)', 'rgba(255,100,30,0.12)'),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(sunGlow);
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.75, 1.05) });
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 16), sunMat);
  group.add(sunCore);
  const sunLight = new THREE.PointLight(0xffe0b0, 0, 0, 0);
  group.add(sunLight);

  // planetesimal swarm
  const inst = new THREE.InstancedMesh(
    makeRockGeometry(5),
    new THREE.MeshStandardMaterial({ color: 0x9a8f7f, roughness: 1, metalness: 0 }),
    COUNTS.planetesimals);
  const swarm = [];
  for (let i = 0; i < COUNTS.planetesimals; i++) {
    swarm.push({
      r: 9 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
      y: (Math.random() - 0.5) * 1.4,
      s: 0.14 + Math.random() * 0.32,
      tilt: Math.random() * Math.PI,
    });
  }
  group.add(inst);

  // protoplanets → planets: the sandbox's eight worlds, compact orbits
  const BB_PLANETS = [
    { name: 'Mercury', r: 9,    radiusE: 0.38,  tiltDeg: 0.03,  tex: 'rocky', map: 'mercurymap.jpg', bump: 'mercurybump.jpg', colors: ['#8a8580', '#5f5b56', '#a89f94'] },
    { name: 'Venus',   r: 12.5, radiusE: 0.95,  tiltDeg: 177.4, tex: 'venus', map: 'venusmap.jpg',   bump: 'venusbump.jpg',   colors: ['#d9b26a', '#e8cf9a', '#b98d4f'], atmo: { color: '#e8c87a', intensity: 0.55 } },
    { name: 'Earth',   r: 16,   radiusE: 1.0,   tiltDeg: 23.44, tex: 'earth', map: 'earthmap1k.jpg', bump: 'earthbump1k.jpg', clouds: true, colors: ['#123f6b', '#2e8b57', '#c2b280'], atmo: { color: '#6fb2ff', intensity: 0.8 },
      moon: { dist: 1.7, size: 0.22, map: 'moonmap1k.jpg' } },
    { name: 'Mars',    r: 19.5, radiusE: 0.53,  tiltDeg: 25.19, tex: 'rocky', map: 'marsmap1k.jpg',  bump: 'marsbump1k.jpg',  colors: ['#b5533c', '#8f3b2a', '#d9825f'], atmo: { color: '#e2926a', intensity: 0.3 } },
    { name: 'Jupiter', r: 24,   radiusE: 11.21, tiltDeg: 3.13,  tex: 'gas',   map: 'jupitermap.jpg', colors: ['#d8b48d', '#a97c50', '#e8d9c3', '#c98d66'], atmo: { color: '#e8cfa8', intensity: 0.35 },
      moon: { dist: 3.2, size: 0.2 } },
    { name: 'Saturn',  r: 28.5, radiusE: 9.45,  tiltDeg: 26.73, tex: 'gas',   map: 'saturnmap.jpg',  colors: ['#e3d1a8', '#c9b183', '#efe3c2', '#b39d6f'], atmo: { color: '#efe0b8', intensity: 0.3 },
      ring: { inner: 1.45, outer: 2.35, map: 'saturnringcolor.jpg' }, moon: { dist: 3.4, size: 0.18 } },
    { name: 'Uranus',  r: 33,   radiusE: 4.01,  tiltDeg: 97.77, tex: 'gas',   map: 'uranusmap.jpg',  colors: ['#9fd6d9', '#7fbfc4', '#c5eef0'], atmo: { color: '#aee6e8', intensity: 0.4 } },
    { name: 'Neptune', r: 38,   radiusE: 3.88,  tiltDeg: 28.32, tex: 'gas',   map: 'neptunemap.jpg', colors: ['#3f66d4', '#2a4bb0', '#7fa3ec'], atmo: { color: '#7fa8ff', intensity: 0.5 } },
  ];
  const planets = BB_PLANETS.map((def, j) => {
    const size = geoRadius(def.radiusE) * 0.75;
    const anchor = new THREE.Group();
    const tiltG = new THREE.Group();
    tiltG.rotation.z = THREE.MathUtils.degToRad(def.tiltDeg);
    anchor.add(tiltG);
    const mat = new THREE.MeshStandardMaterial({
      map: createPlanetTexture(def, j * 37 + 5), roughness: 0.92, metalness: 0.02,
    });
    upgradeTexture(mat, def.map, 'map', true);
    upgradeTexture(mat, def.bump, 'bumpMap', false);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 16), mat);
    tiltG.add(mesh);
    if (def.atmo) tiltG.add(makeAtmosphere(size, def.atmo.color, def.atmo.intensity));
    if (def.clouds) {
      const cloudMat = new THREE.MeshStandardMaterial({
        map: createPlanetTexture({ tex: 'venus', colors: ['#ffffff', '#f0f4f8', '#e8f0f8'] }, 777),
        transparent: true, opacity: 0.32, roughness: 1, depthWrite: false,
      });
      upgradeTexture(cloudMat, 'earthcloudmap.jpg', 'alphaMap', false);
      tiltG.add(new THREE.Mesh(new THREE.SphereGeometry(size * 1.02, 32, 16), cloudMat));
    }
    if (def.ring) {
      const inner = size * def.ring.inner, outer = size * def.ring.outer;
      const ringGeo = new THREE.RingGeometry(inner, outer, 96, 1);
      const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv, rv = new THREE.Vector3();
      for (let i = 0; i < rp.count; i++) {
        rv.fromBufferAttribute(rp, i);
        ruv.setXY(i, (rv.length() - inner) / (outer - inner), 0.5);
      }
      const rMat = new THREE.MeshStandardMaterial({
        map: createRingTexture(), transparent: true, side: THREE.DoubleSide,
        depthWrite: false, roughness: 1, metalness: 0, alphaTest: 0.05,
      });
      upgradeTexture(rMat, def.ring.map, 'map', true);
      const ring = new THREE.Mesh(ringGeo, rMat);
      ring.rotation.x = Math.PI / 2;
      tiltG.add(ring);
    }
    group.add(anchor);
    return { def, mesh, anchor, tiltG, size, phase: hash2(j, 9, 33) * Math.PI * 2 };
  });

  const earth = planets.find(planet => planet.def.name === 'Earth');
  earthAnchor = earth.anchor;
  const earlyEarth = new THREE.Mesh(
    new THREE.SphereGeometry(earth.size * 1.015, 32, 16),
    new THREE.MeshStandardMaterial({
      map: createPlanetTexture({ tex: 'rocky', colors: ['#8b2f16', '#3a211c', '#e06a28'] }, 1403),
      transparent: true,
      opacity: 1,
      emissive: 0x4a1008,
      emissiveIntensity: 0.7,
      roughness: 0.95,
      depthWrite: false,
    }),
  );
  earth.tiltG.add(earlyEarth);
  const microbialGlow = makeAtmosphere(earth.size * 1.03, '#42f5c5', 0);
  microbialGlow.visible = false;
  earth.tiltG.add(microbialGlow);

  const telescope = new THREE.Group();
  const telescopeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.34, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xd9e2ee, roughness: 0.55, metalness: 0.35 }),
  );
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x254a8a, roughness: 0.7, metalness: 0.15 });
  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.48), panelMaterial);
  const rightPanel = leftPanel.clone();
  leftPanel.position.x = -0.82;
  rightPanel.position.x = 0.82;
  telescope.add(telescopeBody, leftPanel, rightPanel);
  telescope.visible = false;
  group.add(telescope);

  // moons, tucked under their host anchors so growth scales them too
  const moons = [];
  planets.forEach((p, pi) => {
    const mdef = p.def.moon;
    if (!mdef) return;
    const mMat = new THREE.MeshStandardMaterial({
      map: createPlanetTexture({ tex: 'rocky', colors: ['#9c9890', '#6e6a64', '#c4bfb6'] }, 500 + pi * 31),
      roughness: 1, metalness: 0,
    });
    upgradeTexture(mMat, mdef.map, 'map', true);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(mdef.size, 16, 8), mMat);
    group.add(mesh);
    moons.push({ pi, mesh, r: geoRadius(p.def.radiusE) * 0.75 + mdef.dist, phase: pi * 2.4 });
  });

  // orbit rings for the present-day vista
  const ringMat = new THREE.LineBasicMaterial({ color: 0x8ab8ff, transparent: true, opacity: 0, depthWrite: false });
  const rings = BB_PLANETS.map(def => {
    const pts2 = [];
    for (let a = 0; a <= 96; a++) {
      const ang = a / 96 * Math.PI * 2;
      pts2.push(new THREE.Vector3(Math.cos(ang) * def.r, 0, Math.sin(ang) * def.r));
    }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), ringMat);
    group.add(ring);
    return ring;
  });

  // deterministic accretion-impact flashes
  const flashTex = createGlowTexture('rgba(255,235,200,1)', 'rgba(255,170,80,0.5)', 'rgba(255,120,50,0.1)');
  const impacts = [0.56, 0.68, 0.8].map((center, k) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    group.add(sp);
    return { sp, center, planet: planets[(k * 2 + 1) % planets.length] };
  });

  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  addSystem({
    apply(u, env) {
      group.visible = env.solarA > 0.004;
      if (!group.visible) return;
      const m = env.solarMix;
      const spin = u * 260;

      const coll = smooth(m, 0, 0.45);
      for (const nb of nebs) {
        nb.sp.position.lerpVectors(nb.ball, nb.disk, coll);
        nb.sp.scale.setScalar(nb.scale * (1 - coll * 0.45));
        nb.sp.material.opacity = env.solarA * 0.5 * (1 - smooth(m, 0.5, 0.78));
      }

      const ignite = smooth(m, 0.38, 0.52);
      sunGlow.scale.setScalar(4 + 30 * ignite);
      sunGlow.material.opacity = env.solarA * (0.2 + 0.8 * ignite) * (1 - env.futureMix * 0.55);
      sunCore.visible = ignite > 0.02;
      sunCore.scale.setScalar(0.4 + 0.6 * ignite - env.futureMix * 0.55);
      // a sun-like star ends as a red ember
      sunMat.color.setRGB(2.2 - env.futureMix * 1.4, 1.75 - env.futureMix * 1.35, 1.05 - env.futureMix * 0.85);
      sunLight.intensity = 2.6 * env.solarA * (0.15 + ignite) * (1 - env.futureMix * 0.7);

      const swarmAlive = smooth(m, 0.16, 0.34) * (1 - smooth(m, 0.66, 0.94));
      inst.visible = swarmAlive > 0.01;
      if (inst.visible) {
        for (let i = 0; i < swarm.length; i++) {
          const b = swarm[i];
          const ang = b.phase + spin / Math.sqrt(b.r);
          e4.set(b.tilt + ang, ang * 1.7, 0);
          q4.setFromEuler(e4);
          s4.setScalar(b.s * swarmAlive);
          v4.set(Math.cos(ang) * b.r, b.y, Math.sin(ang) * b.r);
          m4.compose(v4, q4, s4);
          inst.setMatrixAt(i, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
      }

      planets.forEach((p, j) => {
        const growth = THREE.MathUtils.clamp((m - 0.45 - j * 0.04) * 4, 0, 1);
        p.anchor.visible = growth > 0.02;
        p.anchor.scale.setScalar(Math.max(growth, 1e-4));
        const ang = p.phase + spin / Math.sqrt(p.def.r);
        p.anchor.position.set(Math.cos(ang) * p.def.r, 0, Math.sin(ang) * p.def.r);
        p.mesh.rotation.y = spin * (0.6 + (j % 3) * 0.25);   // deterministic self-spin
        p.growth = growth;
      });

      const life = smooth(env.lifeMix, 0, 1);
      earlyEarth.rotation.y = earth.mesh.rotation.y;
      earlyEarth.material.opacity = 1 - smooth(life, 0.12, 0.82);
      earlyEarth.visible = earth.anchor.visible && earlyEarth.material.opacity > 0.01;
      microbialGlow.material.uniforms.uIntensity.value = 0.62 * smooth(life, 0.35, 1);
      microbialGlow.visible = earth.anchor.visible && life > 0.35;

      telescope.visible = earth.anchor.visible && env.modernA > 0.01;
      if (telescope.visible) {
        telescope.position.copy(earth.anchor.position);
        telescope.position.y += 2.4;
        telescope.rotation.set(0.25, spin * 0.18, 0.35);
        telescope.scale.setScalar(env.modernA);
      }

      for (const mo of moons) {
        const host = planets[mo.pi];
        mo.mesh.visible = m > 0.85 && host.anchor.visible;
        const ang = mo.phase + spin / 1.5;
        mo.mesh.position.copy(host.anchor.position);
        mo.mesh.position.x += Math.cos(ang) * mo.r;
        mo.mesh.position.z += Math.sin(ang) * mo.r;
      }

      ringMat.opacity = env.ringsA * 0.4;
      for (const ring of rings) ring.visible = env.ringsA > 0.01;

      for (const imp of impacts) {
        const strength = bump(m, imp.center, 0.02) * env.solarA;
        imp.sp.material.opacity = Math.min(1, strength);
        imp.sp.scale.setScalar(2 + strength * 9);
        imp.sp.position.copy(imp.planet.anchor.position);
        imp.sp.visible = strength > 0.01;
      }
    },
  });
}

/* ---- backdrop starfield ---- */
function buildStarfield() {
  const layers = [];
  COUNTS.starfield.forEach((count, L) => {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const rMin = 1600 + L * 1100, rMax = rMin + 900;
    for (let i = 0; i < count; i++) {
      const u0 = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u0 * u0);
      const r = rMin + Math.random() * (rMax - rMin);
      pos[i * 3] = s * Math.cos(ph) * r;
      pos[i * 3 + 1] = u0 * r;
      pos[i * 3 + 2] = s * Math.sin(ph) * r;
      const warm = Math.random();
      const b = 0.5 + Math.random() * 0.7;
      col[i * 3] = (0.75 + warm * 0.25) * b;
      col[i * 3 + 1] = 0.8 * b;
      col[i * 3 + 2] = (1 - warm * 0.3) * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      map: createPointSpriteTexture(), size: L ? 1.5 : 2.2, sizeAttenuation: false,
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
    });
    const layer = new THREE.Points(geo, mat);
    fixedGroup.add(layer);
    layers.push({ mat, base: L ? 0.6 : 0.9, layer });
  });
  addSystem({
    apply(u, env) {
      for (const l of layers) {
        l.mat.opacity = env.starfieldA * l.base;
        l.layer.visible = env.starfieldA > 0.004;
      }
    },
  });
}

/* ================================================================
   APPLY EPOCH — the single state function; pure in u (dt only feeds
   shimmerT-based cosmetics elsewhere).
   ================================================================ */

let lastEpochIdx = -1;
let lastPresentationKey = '';
const _camPos = new THREE.Vector3(), _camLook = new THREE.Vector3(), _camB = new THREE.Vector3();

// One centripetal Catmull-Rom documentary rail runs through every epoch pose,
// keeping position and look motion continuous across chapter boundaries.
const CAM_CHAINS = createCameraChains();

function buildCameraPath() {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  let chain = null;
  EPOCHS.forEach((e, i) => {
    const prev = i > 0 ? EPOCHS[i - 1] : null;
    if (!chain || !prev || !same(prev.cam.to.pos, e.cam.from.pos)) {
      chain = { start: i, pos: [new THREE.Vector3().fromArray(e.cam.from.pos)],
                look: [new THREE.Vector3().fromArray(e.cam.from.look)], fov: [e.cam.from.fov], segs: 0 };
      CAM_CHAINS.push(chain);
    }
    chain.pos.push(new THREE.Vector3().fromArray(e.cam.to.pos));
    chain.look.push(new THREE.Vector3().fromArray(e.cam.to.look));
    chain.fov.push(e.cam.to.fov);
    chain.segs++;
    chain.end = i;
  });
  for (const c of CAM_CHAINS) {
    c.posCurve = new THREE.CatmullRomCurve3(c.pos, false, 'centripetal');
    c.lookCurve = new THREE.CatmullRomCurve3(c.look, false, 'centripetal');
  }
}

// 1-D Catmull-Rom (fov follows the same segment parameter as position)
function cr1(p0, p1, p2, p3, t) {
  const v0 = (p2 - p0) * 0.5, v1 = (p3 - p1) * 0.5, t2 = t * t, t3 = t2 * t;
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
}

function camPoseAt(u, outPos, outLook) {
  const idx = epochAt(u);
  const c = CAM_CHAINS.find(ch => idx >= ch.start && idx <= ch.end);
  const seg = idx - c.start;
  const p = epochProgress(u);
  const t = (seg + p) / c.segs;
  c.posCurve.getPoint(t, outPos);
  c.lookCurve.getPoint(t, outLook);
  const f = c.fov;
  return cr1(f[Math.max(seg - 1, 0)], f[seg], f[seg + 1], f[Math.min(seg + 2, c.segs)], p);
}

function applyEpoch(u) {
  const visualU = openingVisualAt(EPOCHS, u);
  const openingHold = visualU === EPOCHS[0].u0;
  const env = envAt(visualU);
  const idx = epochAt(u);
  const e = EPOCHS[idx];
  const presentation = epochPresentationAt(EPOCHS, u);
  if (u < 1) setEndingVisible(false);

  // Music fades with the timeline across the Future Universe epoch: full
  // volume at its start, silence at the very end. Scrubbing back restores it.
  const future = EPOCHS[EPOCHS.length - 1];
  window.cosmicX?.audio?.setDuck?.(u <= future.u0 ? 1 : 1 - (u - future.u0) / (1 - future.u0));

  // user-adjustable expansion: scales post-opening growth + redshift
  const postOpening = smooth(u, EPOCHS[1].u0, EPOCHS[1].u0 + 0.05);
  env.scale *= 1 + (expansionRate - 1) * postOpening;
  env.redshift *= expansionRate;

  universeGroup.scale.setScalar(env.scale);
  bloomPass.strength = openingHold ? 0 : Math.min(env.bloom, 2.1);
  scene.background.setRGB(
    openingHold ? 0 : env.bg[0],
    openingHold ? 0 : env.bg[1],
    openingHold ? 0 : env.bg[2],
  );

  for (const system of systems) system.apply(visualU, env);

  // cinematic camera (a function of u, so scrubbing scrubs the film)
  if (T.cinematic && !glide.active && !bbTitleMode) {
    const fov = camPoseAt(visualU, _camPos, _camLook);
    if (earthAnchor && env.earthFocusA > 0.001) {
      earthAnchor.getWorldPosition(earthWorld);
      earthCamera.copy(earthWorld).add(earthCameraOffset);
      _camPos.lerp(earthCamera, env.earthFocusA);
      _camLook.lerp(earthWorld, env.earthFocusA);
    }
    const drift = 0.012 * _camPos.distanceTo(_camLook);
    _camPos.x += Math.sin(shimmerT * 0.23) * drift;
    _camPos.y += Math.sin(shimmerT * 0.31) * drift * 0.6;
    _camPos.z += Math.cos(shimmerT * 0.19) * drift * 0.5;
    camera.position.copy(_camPos);
    camera.lookAt(_camLook);
    camera.fov = fov + Math.sin(shimmerT * 0.2) * 1.1;
    camera.updateProjectionMatrix();
  }
  updateBBLensing();

  // HUD
  const scrubber = document.getElementById('bbScrubber');
  scrubber.value = String(Math.round(u * 1000));
  paintRangeFill(scrubber);
  scrubber.setAttribute('aria-valuetext', e.label + ' · ' + e.timeLabel);
  document.getElementById('bbEpochLabel').textContent = e.label;
  document.getElementById('bbTimeLabel').textContent = e.timeLabel;

  if (presentation.key !== lastPresentationKey) {
    if (idx !== lastEpochIdx) {
      const chips = document.querySelectorAll('.epoch-btn');
      chips.forEach((chip, i) => chip.classList.toggle('active', i === idx));
    }
    document.getElementById('epochName').textContent = presentation.label;
    document.getElementById('epochTime').textContent = presentation.badgeLabel;
    document.getElementById('epochTime').title = presentation.timeLabel;
    const temp = document.getElementById('epochTemp');
    temp.textContent = presentation.badgeDetail;
    temp.title = e.tempLabel;
    temp.hidden = !presentation.badgeDetail;
    document.getElementById('epochDesc').textContent = presentation.desc;
    const card = document.getElementById('epochCard');
    card.classList.remove('swap');
    void card.offsetWidth;   // restart the crossfade animation
    card.classList.add('swap');
    lastEpochIdx = idx;
    lastPresentationKey = presentation.key;
  }
}

// warp the frame around the Milky Way's black hole when it's on screen
const _bhScreen = new THREE.Vector3();
function updateBBLensing() {
  let target = 0, cx = 0.5, cy = 0.5;
  if (lensingTarget && lensingTarget.visible && lensingTarget.parent.parent.visible) {
    lensingTarget.getWorldPosition(_bhScreen).project(camera);
    if (_bhScreen.z < 1 && Math.abs(_bhScreen.x) < 1.4 && Math.abs(_bhScreen.y) < 1.4) {
      cx = _bhScreen.x * 0.5 + 0.5;
      cy = _bhScreen.y * 0.5 + 0.5;
      lensingTarget.getWorldPosition(_bhScreen);
      const dist = camera.position.distanceTo(_bhScreen);
      const horizonR = 1.1 * lensingTarget.scale.x;
      target = THREE.MathUtils.clamp(horizonR * 3.2 / Math.max(dist, 1), 0, 0.5);
    }
  }
  lensingPass.uniforms.uCenter.value.set(cx, cy);
  lensingPass.uniforms.uStrength.value += (target - lensingPass.uniforms.uStrength.value) * 0.15;
  lensingPass.uniforms.uAspect.value = camera.aspect;
  lensingPass.enabled = lensingPass.uniforms.uStrength.value > 0.002;
}

/* ================================================================
   FREE CAMERA & GLIDE
   ================================================================ */

const glide = { active: false, t: 0, dur: 1.2, fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(), fromFov: 55 };

function setCinematic(on) {
  if (T.cinematic === on) return;
  T.cinematic = on;
  const btn = document.getElementById('bbCamBtn');
  btn.textContent = on ? 'Camera: Cinematic' : 'Camera: Free';
  btn.setAttribute('aria-pressed', String(!on));
  document.getElementById('cinebars').classList.toggle('on', on);
  if (on) {
    // glide back onto the documentary rails — no snap
    glide.active = true;
    glide.t = 0;
    glide.fromPos.copy(camera.position);
    glide.fromLook.copy(controls.target);
    glide.fromFov = camera.fov;
    controls.enabled = false;
  } else {
    camPoseAt(T.u, _camPos, _camLook);
    controls.target.copy(_camLook);
    controls.enabled = true;
    toast('Free camera — drag to orbit, scroll to zoom. Esc returns to cinematic.');
  }
}

function updateGlide(dt) {
  if (!glide.active) return;
  glide.t = Math.min(glide.t + dt / glide.dur, 1);
  const k = smooth(glide.t, 0, 1);
  const fov = camPoseAt(T.u, _camPos, _camLook);
  camera.position.lerpVectors(glide.fromPos, _camPos, k);
  _camLook.lerpVectors(glide.fromLook, _camLook, k);
  camera.lookAt(_camLook);
  camera.fov = glide.fromFov + (fov - glide.fromFov) * k;
  camera.updateProjectionMatrix();
  if (glide.t >= 1) glide.active = false;
}

/* ================================================================
   UI
   ================================================================ */

function updateTransportUI() {
  const play = document.getElementById('bbPlay');
  play.innerHTML = T.playing ? '&#10074;&#10074;' : '&#9654;';
  play.setAttribute('aria-pressed', String(T.playing));
  document.getElementById('bbReverse').setAttribute('aria-pressed', String(T.playing && T.dir < 0));
  document.getElementById('bbSpeedVal').textContent = BB_SPEEDS[T.speedIdx] + '×';
}

function setupBBUI() {
  const list = document.getElementById('epochList');
  EPOCHS.forEach((e, i) => {
    const btn = document.createElement('button');
    btn.className = 'epoch-btn';
    btn.dataset.epoch = String(i);
    btn.innerHTML = '<span>' + e.label + '</span><small>' + e.timeLabel + '</small>';
    btn.addEventListener('click', () => jumpToEpoch(i));
    list.appendChild(btn);
  });

  const ticks = document.getElementById('bbTicks');
  EPOCHS.forEach(e => {
    const mark = document.createElement('i');
    mark.style.left = (e.u0 * 100) + '%';
    ticks.appendChild(mark);
  });

  const scrubber = document.getElementById('bbScrubber');
  scrubber.addEventListener('input', () => {
    T.playing = false;
    uTween.active = false;
    updateTransportUI();
    T.u = Number(scrubber.value) / 1000;
    applyEpoch(T.u);
  });

  document.getElementById('bbPlay').addEventListener('click', () => {
    if (!T.playing) {
      T.dir = 1;
      if (T.u >= 1) {
        T.u = 0;   // replay from the start
        window.cosmicX?.audio?.play?.();
      }
    }
    setPlaying(!T.playing);
  });
  document.getElementById('bbReplayBtn').addEventListener('click', replayTimeline);
  document.getElementById('bbReverse').addEventListener('click', () => {
    T.dir = -1;
    if (T.u <= 0) T.u = 1;
    setPlaying(true);
  });
  document.getElementById('bbSpeedDown').addEventListener('click', () => {
    T.speedIdx = Math.max(0, T.speedIdx - 1);
    updateTransportUI();
  });
  document.getElementById('bbSpeedUp').addEventListener('click', () => {
    T.speedIdx = Math.min(BB_SPEEDS.length - 1, T.speedIdx + 1);
    updateTransportUI();
  });

  const rate = document.getElementById('expansionRate');
  rate.addEventListener('input', () => {
    expansionRate = Number(rate.value);
    document.getElementById('expansionRateVal').innerHTML = expansionRate.toFixed(1) + '&times;';
    paintRangeFill(rate);
    applyEpoch(T.u);
  });
  paintRangeFill(rate);
  paintRangeFill(scrubber);

  document.getElementById('bbCamBtn').addEventListener('click', () => setCinematic(!T.cinematic));

  document.getElementById('bbUiToggle').addEventListener('click', toggleImmersiveUI);

  scope.listen(window, 'keydown', (event) => {
    if (event.code === 'KeyH' && !/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName || '')) {
      toggleImmersiveUI();
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target?.tagName || '')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      setPlaying(!T.playing);
    } else if (event.key === 'ArrowRight') {
      jumpToEpoch(epochAt(T.u) + 1);
    } else if (event.key === 'ArrowLeft') {
      jumpToEpoch(epochAt(T.u) - 1);
    } else if (event.key === 'Escape' && !T.cinematic) {
      setCinematic(true);
    }
  });

  updateTransportUI();
}

function setupBBTitle() {
  document.getElementById('beginBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (document.fullscreenEnabled) {
        document.documentElement.requestFullscreen()
          .catch(() => toast('Fullscreen unavailable — continuing in this window'));
      } else {
        toast('Fullscreen unavailable — continuing in this window');
      }
    }
    bbTitleMode = false;
    T.u = 0;
    applyEpoch(0);
    setPlaying(true);
    document.getElementById('bbTitle').classList.add('hidden');
    document.getElementById('bbBar').classList.add('visible');
    document.getElementById('bbPanel').classList.add('visible');
    document.getElementById('epochCard').classList.add('visible');
    document.getElementById('bbUiToggle').classList.add('visible');
    document.getElementById('cinebars').classList.add('on');
  }, { once: true });
}

/* ================================================================
   LOOP & BOOT
   ================================================================ */

const clock = new THREE.Clock();

function update(dt) {
  shimmerT += dt;
  if (bbTitleMode) {
    for (const s of systems) if (s.tick) s.tick(dt);   // keep shimmer/rotation alive
    applyEpoch(T.u);
    driftTitleCamera();
    return;
  }
  stepTimeline(dt);
  for (const s of systems) if (s.tick) s.tick(dt);
  applyEpoch(T.u);
  updateGlide(dt);
  if (!T.cinematic) controls.update();
  updateEndingTracking();
}

function animate() {
  if (paused || destroyed) return;
  frameId = requestAnimationFrame(animate);
  update(Math.min(clock.getDelta(), 0.1));
  composer.render();
}

buildCameraPath();
buildStarfield();
buildQuantumFoam();
buildFlash();
buildShockwave();
buildSpaceGrid();
buildPlasma();
buildParticles();
buildCMB();
buildFirstStars();
buildGalaxies();
buildHeroGalaxies();
buildSolarForm();
setupBBUI();
setupBBTitle();
T.u = BB_TITLE_U;           // title screen parks on the formed-galaxies era
applyEpoch(T.u);
animate();

// Console/debug handle (mirrors window.solar in the sandbox)
window.bang = {
  THREE, camera, controls, EPOCHS, T, systems, renderer, scene, universeGroup,
  step: (dt) => update(dt),                 // headless simulation tick
  render: () => composer.render(),          // headless frame render (verification)
  setU: (u) => { T.u = THREE.MathUtils.clamp(u, 0, 1); applyEpoch(T.u); },
  jumpToEpoch, epochAt, uForEpoch, envAt, setCinematic, camPoseAt,
  get bloomPass() { return bloomPass; },
  get lensingPass() { return lensingPass; },
  get expansionRate() { return expansionRate; },
};

bindBigBangNavigation({ root, navigate, listen: scope.listen });

const debugHandle = window.bang;

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
  document.body.classList.remove('ui-hidden', 'ending');
  if (window.bang === debugHandle) delete window.bang;
}

return { pause, resume, destroy };
}
