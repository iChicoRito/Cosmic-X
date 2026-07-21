import * as THREE from 'three';
import { fbm, makeCanvas } from '../../shared/procedural-canvas.js';

const TAU = Math.PI * 2;

/* ================================================================
   SYSTEM-VIEW ENVIRONMENT & EFFECTS

   Everything decorative that fills the entered-system scene: the far
   sky (star shells, nebulae, a galactic band), drifting cosmic dust,
   star auras and orbital wakes. system-view.js owns the scene graph
   and the frame loop; this module only builds the pieces and exposes
   small per-frame tick hooks, so the two stay separable.

   Budget notes: every layer here is additive, depthWrite:false and
   animated on the GPU (uTime uniforms), so the per-frame CPU cost is
   a handful of uniform writes. Particle counts scale with the FX
   panel's quality tier via `density`.
   ================================================================ */

/* ---- shared soft-point texture ---------------------------------- */

let softPoint = null;
export function softPointTexture() {
  if (softPoint) return softPoint;
  const S = 64;
  const [canvas, ctx] = makeCanvas(S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  softPoint = new THREE.CanvasTexture(canvas);
  return softPoint;
}

/* fbm-alpha nebula blotch, tinted per sprite via material color. */
export function nebulaTexture(seed) {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const dx = x / S - 0.5, dy = y / S - 0.5;
      const d = Math.hypot(dx, dy) * 2;
      const n = fbm(x / 40, y / 40, seed, 5);
      const a = Math.max(0, (n - 0.3) * 1.7) * Math.max(0, 1 - d * d);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/* Four-point diffraction cross for star sprites. */
let spikeTex = null;
export function spikeTexture() {
  if (spikeTex) return spikeTex;
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, alpha] of [[S, 0.9], [S * 0.55, 0.4]]) {
    for (const rot of [0, Math.PI / 2]) {
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(rot + (w === S ? 0 : Math.PI / 4));
      const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-w / 2, -1.1, w, 2.2);
      ctx.restore();
    }
  }
  spikeTex = new THREE.CanvasTexture(canvas);
  return spikeTex;
}

/* The module-level singletons above outlive any one system; the page calls this
   once from destroy() so a remount regenerates them cleanly. */
export function disposeFxTextures() {
  softPoint?.dispose(); softPoint = null;
  spikeTex?.dispose(); spikeTex = null;
}

/* ---- far sky: star shells + nebulae + galactic band -------------- */

// Stellar tint ramp for the background field — cool reds through
// white to hot blue, weighted toward the middle like a real field.
const STAR_TINTS = [0xffc9a0, 0xffe2c4, 0xfff4e4, 0xffffff, 0xdfeaff, 0xbcd2ff];

function shellMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float aSize; attribute float aSeed; attribute vec3 aColor;
      uniform float uTime; uniform float uTwinkle; uniform float uPx;
      varying vec3 vColor; varying float vFade;
      void main() {
        float tw = 1.0 - uTwinkle * 0.45 * (0.5 + 0.5 * sin(uTime * (0.6 + fract(aSeed) * 1.8) + aSeed));
        vColor = aColor; vFade = tw;
        gl_PointSize = aSize * uPx;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vFade;
      void main() {
        float a = smoothstep(0.5, 0.06, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vColor * vFade, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

/* The whole distant environment as one group. `starColors` tints the
   nebulae so the sky answers the system that owns it. */
export function createSystemSky({ starColors = [0xfff4e4], seed = 7, density = 1, getNebulaTexture = nebulaTexture }) {
  const group = new THREE.Group();
  const disposables = [];
  const shells = [];
  let s = seed * 2654435761 >>> 0 || 991;
  const rand = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  // Three parallax shells: near/large sparse, far/small dense.
  const shellSpecs = [
    { r: 2600, n: Math.round(700 * density), size: [1.6, 3.4] },
    { r: 3600, n: Math.round(1200 * density), size: [1.2, 2.6] },
    { r: 4800, n: Math.round(1700 * density), size: [0.8, 1.9] },
  ];
  const tint = new THREE.Color();
  for (const spec of shellSpecs) {
    const pos = new Float32Array(spec.n * 3);
    const col = new Float32Array(spec.n * 3);
    const sizes = new Float32Array(spec.n);
    const seeds = new Float32Array(spec.n);
    for (let i = 0; i < spec.n; i++) {
      const u = 2 * rand() - 1, phi = rand() * TAU;
      const sq = Math.sqrt(1 - u * u);
      const r = spec.r * (0.94 + rand() * 0.12);
      pos[i * 3] = sq * Math.cos(phi) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = sq * Math.sin(phi) * r;
      tint.set(STAR_TINTS[Math.floor(Math.pow(rand(), 1.4) * STAR_TINTS.length)]);
      tint.multiplyScalar(0.55 + rand() * 0.45);
      col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
      sizes[i] = spec.size[0] + rand() * (spec.size[1] - spec.size[0]);
      seeds[i] = rand() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const mat = shellMaterial({
      uTime: { value: 0 }, uTwinkle: { value: 1 }, uPx: { value: 1 },
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    shells.push(points);
    disposables.push(geo, mat);
  }

  // Nebulae: tinted from the host stars plus a complementary drift hue,
  // so a red-dwarf system sits inside a different sky than a blue giant.
  const nebulaGroup = new THREE.Group();
  const palette = starColors.map(c => new THREE.Color(c));
  palette.push(palette[0].clone().offsetHSL(0.45, 0, 0.05));
  palette.push(new THREE.Color(0x8a6fd8));
  const nebCount = Math.max(4, Math.round(7 * density));
  for (let i = 0; i < nebCount; i++) {
    const tex = getNebulaTexture(seed * 13 + i * 29);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      color: palette[i % palette.length].clone().lerp(new THREE.Color(0xffffff), 0.2),
      transparent: true, opacity: 0.1 + rand() * 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const u = 2 * rand() - 1, phi = rand() * TAU;
    const sq = Math.sqrt(1 - u * u);
    const r = 3000 + rand() * 1500;
    sprite.position.set(sq * Math.cos(phi) * r, u * r * 0.75, sq * Math.sin(phi) * r);
    sprite.scale.setScalar(1400 + rand() * 1600);
    nebulaGroup.add(sprite);
    if (getNebulaTexture === nebulaTexture) disposables.push(tex);
    disposables.push(sprite.material);
  }

  // Galactic band: a thin tilted log-spiral sheet far out — the "inside
  // a galaxy" cue the As the Gods Will sky sells with its spiral arms.
  const bandCount = Math.round(2200 * density);
  const bandPos = new Float32Array(bandCount * 3);
  const bandCol = new Float32Array(bandCount * 3);
  const core = new THREE.Color(0xfff2dc);
  const rim = new THREE.Color(0x9fb6e8);
  for (let i = 0; i < bandCount; i++) {
    const t = rand();
    const r = 3200 + t * 1400;
    const theta = Math.log(r / 3200 + 1) * 4.2 + (i % 2) * Math.PI + (rand() - 0.5) * 0.9;
    bandPos[i * 3] = Math.cos(theta) * r;
    bandPos[i * 3 + 1] = (rand() - 0.5) * (120 + t * 260);
    bandPos[i * 3 + 2] = Math.sin(theta) * r;
    tint.lerpColors(core, rim, Math.min(1, t * 1.25)).multiplyScalar(0.4 + rand() * 0.5);
    bandCol[i * 3] = tint.r; bandCol[i * 3 + 1] = tint.g; bandCol[i * 3 + 2] = tint.b;
  }
  const bandGeo = new THREE.BufferGeometry();
  bandGeo.setAttribute('position', new THREE.BufferAttribute(bandPos, 3));
  bandGeo.setAttribute('color', new THREE.BufferAttribute(bandCol, 3));
  const bandMat = new THREE.PointsMaterial({
    map: softPointTexture(), size: 2.2, sizeAttenuation: false,
    vertexColors: true, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const band = new THREE.Points(bandGeo, bandMat);
  band.rotation.set(0.42, 0, 0.18);
  band.frustumCulled = false;
  nebulaGroup.add(band);
  disposables.push(bandGeo, bandMat);

  group.add(nebulaGroup);

  return {
    group,
    nebulaGroup,
    tick(dt, elapsed, px) {
      group.rotation.y += dt * 0.002;
      for (const shell of shells) {
        shell.material.uniforms.uTime.value = elapsed;
        shell.material.uniforms.uPx.value = px;
      }
    },
    setTwinkle(on) {
      for (const shell of shells) shell.material.uniforms.uTwinkle.value = on ? 1 : 0;
    },
    setNebulaeVisible(on) { nebulaGroup.visible = on; },
    dispose() {
      for (const d of disposables) d.dispose?.();
    },
  };
}

/* ---- cosmic dust: near motes + mid shell, GPU-swayed ------------- */

function dustMaterial(color, opacity, scale, sway) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uScale: { value: scale },
      uSway: { value: sway },
    },
    vertexShader: `
      attribute float aPhase; attribute float aSize;
      uniform float uTime; uniform float uScale; uniform float uSway;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.14 + aPhase) * uSway;
        p.y += sin(uTime * 0.10 + aPhase * 1.7) * uSway * 0.55;
        p.z += cos(uTime * 0.12 + aPhase * 2.3) * uSway;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Capped: the camera flies *through* the near field, and an uncapped
        // 1/z mote balloons to a screen-filling blob when you brush past it.
        gl_PointSize = clamp(aSize * uScale / max(-mv.z, 1.0), 1.0, 11.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

export function createDustFields({ edge, density = 1 }) {
  const group = new THREE.Group();
  const mats = [];
  const disposables = [];
  const specs = [
    // near motes drifting through the planet lanes
    { n: Math.round(900 * density), rMin: edge * 0.15, rMax: edge * 2.2, h: edge * 0.22, size: [0.9, 2.0], opacity: 0.13, sway: edge * 0.012 },
    // sparse mid-shell between the system and the sky
    { n: Math.round(500 * density), rMin: edge * 2.0, rMax: edge * 4.5, h: edge * 1.1, size: [1.6, 3.4], opacity: 0.09, sway: edge * 0.02 },
  ];
  for (const spec of specs) {
    const pos = new Float32Array(spec.n * 3);
    const phase = new Float32Array(spec.n);
    const sizes = new Float32Array(spec.n);
    for (let i = 0; i < spec.n; i++) {
      const a = Math.random() * TAU;
      const r = spec.rMin + Math.random() * (spec.rMax - spec.rMin);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spec.h * 2;
      pos[i * 3 + 2] = Math.sin(a) * r;
      phase[i] = Math.random() * TAU * 4;
      sizes[i] = spec.size[0] + Math.random() * (spec.size[1] - spec.size[0]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = dustMaterial(0x9fb2d8, spec.opacity, 190, spec.sway);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    mats.push(mat);
    disposables.push(geo, mat);
  }
  return {
    group,
    tick(dt, elapsed) {
      for (const mat of mats) mat.uniforms.uTime.value = elapsed;
    },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}

/* ---- star aura: animated fresnel shell + diffraction spikes ------ */

export function createStarAura(radius, color) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
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
      uniform vec3 uColor; uniform float uTime;
      varying vec3 vN; varying vec3 vV;
      void main() {
        // Rim-only: the shell stays transparent across the star's face so a
        // transiting planet is never washed out (the task-15 glow budget).
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.4);
        gl_FragColor = vec4(uColor, rim * 0.8 * pulse);
      }`,
    transparent: true, blending: THREE.AdditiveBlending,
    side: THREE.BackSide, depthWrite: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.32, 48, 24), mat);
  group.add(shell);

  const spikes = new THREE.Sprite(new THREE.SpriteMaterial({
    map: spikeTexture(), color,
    transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  spikes.material.userData.shared = true;   // map is the module singleton
  spikes.scale.setScalar(radius * 7);
  group.add(spikes);

  return {
    group,
    tick(elapsed) { mat.uniforms.uTime.value = elapsed; },
    dispose() {
      shell.geometry.dispose(); mat.dispose();
      spikes.material.dispose();            // not the map — it is shared
    },
  };
}

/* ---- orbital wake ------------------------------------------------ */

/* Shader for the jittered orbit-lane Points: a bright head that decays
   behind the planet's current angle. One uHead write per frame. */
export function createWakeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHead: { value: 0 },
      uBase: { value: 0.3 },
      uColor: { value: new THREE.Color(0x8a9ec4) },
      uHot: { value: new THREE.Color(0xdce8ff) },
      uScale: { value: 200 },
    },
    vertexShader: `
      attribute float aAngle;
      uniform float uHead; uniform float uBase; uniform float uScale;
      varying float vGlow;
      void main() {
        float delta = mod(uHead - aAngle, 6.2831853);
        float wake = exp(-delta * 2.4);
        vGlow = wake;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.9 + wake * 2.6) * uScale / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uBase; uniform vec3 uColor; uniform vec3 uHot;
      varying float vGlow;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        vec3 c = mix(uColor, uHot, vGlow);
        gl_FragColor = vec4(c, a * (uBase + vGlow * 0.7));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
