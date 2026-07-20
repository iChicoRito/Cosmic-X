import * as THREE from 'three';
import { fbm, hash2, makeCanvas, tileFbm } from '../../shared/procedural-canvas.js';

/* ================================================================
   PROCEDURAL SURFACES FOR CREATED WORLDS

   Ported from the As the Gods Will planet textures, but keyed to the
   Creator's PLANET_CLASSES instead of hand-authored per-planet defs.
   Everything is generated offline — these are invented worlds, so
   pasting a photograph of Jupiter onto one would undercut the whole
   premise (and add a network dependency the page does not need).
   ================================================================ */

const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();

// Palette per class: [base, mid, highlight]. Ramps are walked in order for
// banded worlds and used as sea/land/peak for surfaced ones.
const CLASS_PALETTE = {
  'gas-giant': { style: 'banded', colors: ['#c9a37a', '#e6cfae', '#9c7550', '#d8b28a'] },
  'ice-giant': { style: 'banded', colors: ['#6fb6d6', '#9fd4e8', '#4d8fb5', '#bce6f2'] },
  ocean: { style: 'surface', colors: ['#2b5fa8', '#3f7fd4', '#7fc4d8'] },
  'super-earth': { style: 'surface', colors: ['#2f6f5a', '#7fae6f', '#c8b98a'] },
  rocky: { style: 'surface', colors: ['#3a5f8a', '#8a7a5e', '#c0b49a'] },
  lava: { style: 'molten', colors: ['#3a1208', '#e86840', '#ffc26a'] },
  dwarf: { style: 'cratered', colors: ['#6e6a63', '#a9a29a', '#cfc9c0'] },
};

function paletteFor(classId) {
  return CLASS_PALETTE[classId] || CLASS_PALETTE.rocky;
}

function canvasTexture(canvas, anisotropy) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (anisotropy) tex.anisotropy = anisotropy;
  return tex;
}

/* Surface map for one planet. `seed` keeps a given world stable across
   rebuilds; two planets of the same class never look identical. */
export function createPlanetSurface(classId, seed, { anisotropy = 0 } = {}) {
  const W = 512, H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const { style, colors } = paletteFor(classId);
  const ramp = colors.map(c => new THREE.Color(c));
  const img = ctx.createImageData(W, H);
  const px = img.data;

  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / H - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const col = cC;

      if (style === 'banded') {
        const warp = (tileFbm(x, y, 60, seed, 4, W) - 0.5) * 0.35;
        const band = (y / H + warp) * ramp.length * 2.4;
        const i0 = ((Math.floor(band) % ramp.length) + ramp.length) % ramp.length;
        const i1 = (i0 + 1) % ramp.length;
        col.copy(ramp[i0]).lerp(ramp[i1], THREE.MathUtils.smoothstep(band - Math.floor(band), 0.35, 0.65));
        col.multiplyScalar(0.9 + tileFbm(x, y, 18, seed + 7, 3, W) * 0.25);
      } else if (style === 'surface') {
        const n = tileFbm(x, y, 55, seed, 5, W);
        if (n > 0.52) {
          const n2 = tileFbm(x, y, 22, seed + 3, 3, W);
          col.copy(ramp[1]).lerp(cA.copy(ramp[2]), THREE.MathUtils.clamp((n2 - 0.35) * 2, 0, 1));
        } else {
          col.copy(ramp[0]).multiplyScalar(0.7 + n * 0.7);
        }
        if (lat > 0.82) col.lerp(cA.set('#eef2f5'), THREE.MathUtils.clamp((lat - 0.82) / 0.1, 0, 1));
        const cloud = tileFbm(x + 137, y, 30, seed + 9, 4, W);
        if (cloud > 0.6) col.lerp(cA.set('#ffffff'), (cloud - 0.6) * 1.6);
      } else if (style === 'molten') {
        const swirl = tileFbm(x, y, 90, seed, 3, W);
        const n = tileFbm(x + swirl * 80, y + swirl * 30, 45, seed + 5, 4, W);
        col.copy(ramp[0]).lerp(cA.copy(ramp[1]), n);
        col.lerp(cB.copy(ramp[2]), Math.max(0, (swirl - 0.55) * 1.4));
      } else {
        const n = tileFbm(x, y, 40, seed, 5, W);
        col.copy(ramp[1]).lerp(cA.copy(ramp[0]), n);
        const spots = tileFbm(x, y, 9, seed + 11, 3, W);
        if (spots > 0.68) col.lerp(cB.copy(ramp[2]), 0.5);
        if (spots < 0.34) col.multiplyScalar(0.75);
      }

      px[i] = col.r * 255; px[i + 1] = col.g * 255; px[i + 2] = col.b * 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  if (style === 'cratered') {
    for (let k = 0; k < 60; k++) {
      const r = 2 + hash2(k, 1, seed) * 7;
      const cx = hash2(k, 2, seed) * W;
      const cy = H * 0.1 + hash2(k, 3, seed) * H * 0.8;
      ctx.globalAlpha = 0.1 + hash2(k, 4, seed) * 0.12;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // lit rim arc — sells the crater as a depression rather than a dot
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx - 1, cy - 1, r, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  return canvasTexture(canvas, anisotropy);
}

/* Photosphere granulation. Colour comes from the star's own tint so an M dwarf
   reads red and an O giant blue-white. */
export function createStarSurface(color, seed, { anisotropy = 0 } = {}) {
  const W = 512, H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const hot = cA.set(color).clone();
  const cool = hot.clone().multiplyScalar(0.55);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = tileFbm(x, y, 14, seed, 5, W);
      cC.copy(cool).lerp(hot, Math.min(n * n * 1.4, 1));
      px[i] = cC.r * 255; px[i + 1] = cC.g * 255; px[i + 2] = cC.b * 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas, anisotropy);
}

/* Ring strip, sampled across the ring's width. The gap at t 0.60-0.67 is a
   Cassini-style division; the feathered ends stop the ring from ending on a
   hard edge. */
export function createRingTexture(colorA = '#b8a888', colorB = '#efe6cf') {
  const W = 512, H = 32;
  const [canvas, ctx] = makeCanvas(W, H);
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    let alpha = 0.12 + fbm(t * 26, 0.5, 77, 4) * 0.8;
    if (t > 0.60 && t < 0.67) alpha *= 0.12;
    if (t < 0.06) alpha *= t / 0.06;
    if (t > 0.94) alpha *= (1 - t) / 0.06;
    cA.set(colorA).lerp(cB.set(colorB), fbm(t * 9, 3.5, 78, 3));
    ctx.fillStyle = `rgba(${cA.r * 255 | 0}, ${cA.g * 255 | 0}, ${cA.b * 255 | 0}, ${alpha.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, H);
  }
  return canvasTexture(canvas);
}

/* Back-side fresnel shell. Only the rim lights up, which is what reads as an
   atmosphere rather than a slightly larger sphere. */
export function makeAtmosphere(radius, color, intensity) {
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

/* Atmosphere shell strength per class. `none` gets nothing at all. */
export const ATMOSPHERE_SHELL = {
  none: null,
  thin: { color: '#9fc4e8', intensity: 0.35 },
  earthlike: { color: '#7fb2ff', intensity: 0.85 },
  thick: { color: '#c8b48a', intensity: 1.1 },
  toxic: { color: '#d8c46a', intensity: 1.25 },
};
