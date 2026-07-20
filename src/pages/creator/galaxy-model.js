// Pure galaxy math for the Creator mode — no THREE, no DOM, node-testable.
// Positions are cylindrical (radius, angle, y) so the renderer can spin each
// star in the vertex shader by angle + omega(radius) * simTime.

export const GALAXY_TYPES = [
  { id: 'spiral', name: 'Spiral Galaxy', desc: 'Grand-design arms winding around a bright core.' },
  { id: 'barred', name: 'Barred Spiral Galaxy', desc: 'Arms unwinding from a luminous central bar.' },
  { id: 'elliptical', name: 'Elliptical Galaxy', desc: 'A smooth, ancient spheroid of amber suns.' },
  { id: 'lenticular', name: 'Lenticular Galaxy', desc: 'A lens-shaped disk, armless and serene.' },
  { id: 'irregular', name: 'Irregular Galaxy', desc: 'Chaotic clumps of violent star formation.' },
  { id: 'ring', name: 'Ring Galaxy', desc: 'A halo of fire around a lonely core.' },
];

export const PARAM_DEFS = {
  diameter: { group: 'structure', label: 'Diameter', min: 40, max: 200, step: 1, def: 110, unit: ' kly' },
  arms: { group: 'structure', label: 'Spiral arms', min: 2, max: 7, step: 1, def: 4, unit: '' },
  curvature: { group: 'structure', label: 'Arm curvature', min: 0.12, max: 0.6, step: 0.01, def: 0.3, unit: '' },
  coreSize: { group: 'structure', label: 'Core size', min: 0.08, max: 0.5, step: 0.01, def: 0.22, unit: '' },
  diskThickness: { group: 'structure', label: 'Disk thickness', min: 0.02, max: 0.3, step: 0.01, def: 0.08, unit: '' },
  starDensity: { group: 'population', label: 'Star density', min: 0.2, max: 2, step: 0.05, def: 1, unit: '×' },
  nebulaFrequency: { group: 'population', label: 'Nebula frequency', min: 0, max: 2, step: 0.05, def: 1, unit: '×' },
  dustAmount: { group: 'population', label: 'Dust amount', min: 0, max: 2, step: 0.05, def: 1, unit: '×' },
  clusterCount: { group: 'population', label: 'Star clusters', min: 0, max: 40, step: 1, def: 14, unit: '' },
  rotationSpeed: { group: 'physics', label: 'Rotation speed', min: 0, max: 3, step: 0.05, def: 1, unit: '×' },
  mass: { group: 'physics', label: 'Total mass', min: 0.1, max: 10, step: 0.1, def: 1.2, unit: ' ×10¹¹ M☉' },
  darkMatter: { group: 'physics', label: 'Dark matter', min: 0, max: 95, step: 1, def: 84, unit: '%' },
  starFormationRate: { group: 'physics', label: 'Star formation', min: 0, max: 10, step: 0.1, def: 2, unit: ' M☉/yr' },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_A = ['Aeon', 'Vela', 'Orion', 'Lyra', 'Nyx', 'Sol', 'Thea', 'Kaon', 'Mira', 'Zephy'];
const NAME_B = ['ara', 'ion', 'is', 'ette', 'os', 'ium', 'era', 'antis', 'ova', 'yx'];

export function randomGalaxyName(rng = Math.random) {
  return NAME_A[Math.floor(rng() * NAME_A.length)] + NAME_B[Math.floor(rng() * NAME_B.length)];
}

export function defaultParams(type = 'spiral') {
  const params = { seed: Math.floor(Math.random() * 0x7fffffff), type, name: randomGalaxyName() };
  for (const [key, def] of Object.entries(PARAM_DEFS)) params[key] = def.def;
  return params;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function sanitizeParams(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = defaultParams();
  if (GALAXY_TYPES.some(t => t.id === src.type)) out.type = src.type;
  if (typeof src.name === 'string' && src.name.trim()) out.name = src.name.trim().slice(0, 24);
  const seed = Number(src.seed);
  if (Number.isFinite(seed)) out.seed = Math.floor(Math.abs(seed)) % 0x7fffffff;
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    const v = Number(src[key]);
    if (Number.isFinite(v)) out[key] = clamp(v, def.min, def.max);
  }
  out.arms = Math.round(out.arms);
  out.clusterCount = Math.round(out.clusterCount);
  return out;
}

/* Rotation curve: blend of a Keplerian falloff (little dark matter) and a
   flat curve (dark-matter halo). Returns scene-units per Myr. */
export function rotationVelocity(r, params) {
  const R = params.diameter / 2;
  const rc = Math.max(R * 0.14, 1e-3);
  const x = Math.max(r, 1e-3);
  const flat = x / Math.sqrt(x * x + rc * rc);
  const kep = Math.sqrt(rc / Math.max(x, rc));
  const dm = clamp(params.darkMatter / 100, 0, 1);
  const vMax = 0.02 * params.rotationSpeed * Math.sqrt(Math.max(params.mass, 0.05));
  return vMax * (kep * (1 - dm) + flat * dm) * R;
}

export function angularVelocity(r, params) {
  return rotationVelocity(r, params) / Math.max(r, 1e-3);
}

/* Star-count bookkeeping: the point cloud is a sampled impression, the stats
   number is the "real" astrophysical estimate. */
export function renderStarCount(params) {
  const n = Math.round(26000 * params.starDensity * (0.5 + 0.5 * (params.diameter / 200)));
  return clamp(n, 6000, 60000);
}

export function estimateTotalStars(params) {
  const area = (params.diameter / 100) ** 2;
  return Math.round(1.8e11 * params.starDensity * area * (0.7 + 0.3 * Math.min(params.mass, 4)));
}

const TAU = Math.PI * 2;
const gauss = rng => (rng() + rng() + rng()) / 1.5 - 1; // ~triangular, [-1,1]

/* Population palettes (r,g,b in 0..1). blueBias comes from star-formation rate. */
function starColor(pop, t, rng, blueBias) {
  const jitter = 0.9 + rng() * 0.2;
  if (pop === 'bulge' || pop === 'bar') return [1 * jitter, 0.86 * jitter, 0.66 * jitter];
  if (pop === 'halo') return [0.72 * jitter, 0.6 * jitter, 0.52 * jitter];
  if (pop === 'arm' || pop === 'clump' || pop === 'ring') {
    if (rng() < 0.06 + blueBias * 0.03) return [1, 0.55, 0.75];        // HII pink
    const blue = rng() < 0.35 + blueBias * 0.4;
    return blue
      ? [0.62 * jitter, 0.78 * jitter, 1 * jitter]
      : [0.95 * jitter, 0.93 * jitter, 0.88 * jitter];
  }
  return [0.85 * jitter, 0.85 * jitter, 0.9 * jitter];                 // smooth disk
}

/* Sample one star position for a galaxy type. Returns {r, theta, y, pop}. */
export function samplePosition(params, rng, clumps) {
  const R = params.diameter / 2;
  const coreR = Math.max(params.coreSize * R * 0.5, R * 0.03);
  const thick = params.diskThickness * R * 0.5;
  const type = params.type;
  const z = rng();

  const bulge = (radius, squash = 0.55) => {
    const rr = radius * Math.pow(rng(), 1.6);
    const phi = Math.acos(2 * rng() - 1), th = rng() * TAU;
    return {
      r: Math.abs(rr * Math.sin(phi)),
      theta: th,
      y: rr * Math.cos(phi) * squash,
      pop: 'bulge',
    };
  };
  const halo = () => {
    const rr = R * (0.35 + 0.75 * Math.pow(rng(), 0.7));
    const phi = Math.acos(2 * rng() - 1), th = rng() * TAU;
    return { r: Math.abs(rr * Math.sin(phi)), theta: th, y: rr * Math.cos(phi) * 0.8, pop: 'halo' };
  };
  const armPoint = (rInner) => {
    const t = rng();
    const r = rInner + (R - rInner) * Math.sqrt(t);
    const wind = Math.log(1 + (r - rInner) / (R * 0.1)) / params.curvature;
    const arm = Math.floor(rng() * params.arms);
    const spread = 0.16 + 0.4 * t;
    return {
      r,
      theta: wind + arm * (TAU / params.arms) + gauss(rng) * spread,
      y: gauss(rng) * thick * (1 - 0.5 * t),
      pop: 'arm',
      t,
    };
  };

  if (type === 'elliptical') {
    const rr = R * 0.95 * Math.pow(rng(), 1.5);
    const phi = Math.acos(2 * rng() - 1), th = rng() * TAU;
    const x = rr * Math.sin(phi) * Math.cos(th);
    const zz = rr * Math.sin(phi) * Math.sin(th) * 0.8;
    return { r: Math.hypot(x, zz), theta: Math.atan2(zz, x), y: rr * Math.cos(phi) * 0.65, pop: 'bulge' };
  }

  if (type === 'lenticular') {
    if (z < 0.32) return bulge(coreR * 1.5, 0.7);
    if (z > 0.96) return halo();
    const r = coreR + (R - coreR) * (1 - Math.pow(1 - rng(), 1.9));
    return { r, theta: rng() * TAU, y: gauss(rng) * thick * 0.55, pop: 'disk' };
  }

  if (type === 'irregular') {
    if (z > 0.9) return halo();
    const c = clumps[Math.floor(rng() * clumps.length)];
    const spread = c.spread;
    return {
      r: 0, theta: 0,
      x: c.x + gauss(rng) * spread,
      zz: c.z + gauss(rng) * spread,
      y: c.y + gauss(rng) * spread * 0.55,
      pop: 'clump',
      cartesian: true,
    };
  }

  if (type === 'ring') {
    if (z < 0.24) return bulge(coreR, 0.6);
    if (z < 0.86) {
      const ringR = R * 0.78, width = R * 0.09;
      return { r: ringR + gauss(rng) * width, theta: rng() * TAU, y: gauss(rng) * thick, pop: 'ring' };
    }
    if (z < 0.95) {
      const r = coreR + (R * 0.6 - coreR) * rng();
      return { r, theta: rng() * TAU, y: gauss(rng) * thick, pop: 'disk' };
    }
    return halo();
  }

  if (type === 'barred') {
    const barHalf = R * 0.32;
    if (z < 0.16) return bulge(coreR * 0.9, 0.6);
    if (z < 0.34) {
      const along = (rng() * 2 - 1) * barHalf;
      const off = gauss(rng) * barHalf * 0.18;
      return { r: Math.hypot(along, off), theta: Math.atan2(off, along), y: gauss(rng) * thick * 0.8, pop: 'bar' };
    }
    if (z < 0.86) return armPoint(barHalf * 0.95); // arms unwind from the bar tips

    if (z < 0.95) return { r: coreR + (R - coreR) * Math.sqrt(rng()), theta: rng() * TAU, y: gauss(rng) * thick, pop: 'disk' };
    return halo();
  }

  // spiral (default)
  const bulgeW = clamp(params.coreSize * 0.9, 0.1, 0.42);
  if (z < bulgeW) return bulge(coreR * 1.15);
  if (z < bulgeW + 0.52) return armPoint(coreR * 0.7);
  if (z < 0.94) return { r: coreR + (R - coreR) * Math.sqrt(rng()), theta: rng() * TAU, y: gauss(rng) * thick, pop: 'disk' };
  return halo();
}

function makeClumps(params, rng) {
  const R = params.diameter / 2;
  const n = 3 + Math.floor(rng() * 3);
  const clumps = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = R * 0.55 * Math.sqrt(rng());
    clumps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: (rng() - 0.5) * R * 0.14, spread: R * (0.14 + rng() * 0.16) });
  }
  return clumps;
}

/* Full deterministic sample of a galaxy: star attribute arrays + sprite
   placement lists for nebulas, dust and clusters. */
export function sampleGalaxy(params) {
  const rng = mulberry32(params.seed);
  const count = renderStarCount(params);
  const R = params.diameter / 2;
  const blueBias = clamp(params.starFormationRate / 10, 0, 1);
  const clumps = makeClumps(params, rng);

  const radius = new Float32Array(count);
  const angle = new Float32Array(count);
  const height = new Float32Array(count);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const phase = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const p = samplePosition(params, rng, clumps);
    let r = p.r, theta = p.theta;
    if (p.cartesian) { r = Math.hypot(p.x, p.zz); theta = Math.atan2(p.zz, p.x); }
    radius[i] = r;
    angle[i] = theta;
    height[i] = p.y;
    const core = 1 - clamp(r / R, 0, 1);
    size[i] = (p.pop === 'bulge' ? 1.5 : p.pop === 'halo' ? 0.8 : 1.1) * (0.7 + rng() * 1.4) * (1 + core * 0.8);
    const [cr, cg, cb] = starColor(p.pop, p.t || 0, rng, blueBias);
    color[i * 3] = cr; color[i * 3 + 1] = cg; color[i * 3 + 2] = cb;
    phase[i] = rng() * TAU;
  }

  const diskTypes = params.type !== 'elliptical';
  const nebulas = [];
  const nNeb = Math.round((params.type === 'elliptical' ? 3 : 16) * params.nebulaFrequency);
  for (let i = 0; i < nNeb; i++) {
    const p = samplePosition(params, rng, clumps);
    let r = p.r, theta = p.theta;
    if (p.cartesian) { r = Math.hypot(p.x, p.zz); theta = Math.atan2(p.zz, p.x); }
    if (p.pop === 'halo') { r *= 0.5; }
    nebulas.push({ r, theta, y: p.y * 0.5, scale: R * (0.1 + rng() * 0.16), hue: rng(), seed: Math.floor(rng() * 1e9) });
  }

  const dust = [];
  const nDust = diskTypes ? Math.round(22 * params.dustAmount) : Math.round(4 * params.dustAmount);
  for (let i = 0; i < nDust; i++) {
    const p = samplePosition(params, rng, clumps);
    let r = p.r, theta = p.theta;
    if (p.cartesian) { r = Math.hypot(p.x, p.zz); theta = Math.atan2(p.zz, p.x); }
    dust.push({ r: r * 0.9, theta, y: p.y * 0.3, scale: R * (0.12 + rng() * 0.2), seed: Math.floor(rng() * 1e9) });
  }

  const clusters = [];
  for (let i = 0; i < params.clusterCount; i++) {
    const globular = rng() < 0.45;
    if (globular || !diskTypes) {
      const rr = R * (0.4 + 0.75 * rng());
      const phi = Math.acos(2 * rng() - 1), th = rng() * TAU;
      clusters.push({ r: Math.abs(rr * Math.sin(phi)), theta: th, y: rr * Math.cos(phi) * 0.8, scale: R * 0.035, kind: 'globular' });
    } else {
      const p = samplePosition(params, rng, clumps);
      let r = p.r, theta = p.theta;
      if (p.cartesian) { r = Math.hypot(p.x, p.zz); theta = Math.atan2(p.zz, p.x); }
      clusters.push({ r, theta, y: p.y, scale: R * 0.028, kind: 'open' });
    }
  }

  return { count, radius, angle, height, size, color, phase, nebulas, dust, clusters, R };
}
