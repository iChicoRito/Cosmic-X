import { MathUtils } from 'three';

export function epochIndexAt(epochs, u) {
  for (let index = 0; index < epochs.length; index++) {
    if (u < epochs[index].u1) return index;
  }
  return epochs.length - 1;
}

export function epochProgressAt(epochs, u) {
  const epoch = epochs[epochIndexAt(epochs, u)];
  return MathUtils.clamp((u - epoch.u0) / (epoch.u1 - epoch.u0), 0, 1);
}

export function epochStartAt(epochs, index) {
  return epochs[MathUtils.clamp(index, 0, epochs.length - 1)].u0;
}

export function createEpochModel() {
  const smooth = (x, a, b) => MathUtils.smoothstep(x, a, b);
const ENV_DEFAULTS = {
  scale: 1, bloom: 1.15, bg: [0, 0, 0],
  foamA: 0, flashA: 0, gridA: 0,
  plasmaA: 0, plasmaHeat: 1,
  particleA: 0, particleMix: 0, cmbA: 0,
  starA: 0, starMix: 0,
  galaxyA: 0, galaxyMix: 0,
  spiralA: 0, spiralMix: 0,
  solarA: 0, solarMix: 0, ringsA: 0,
  futureMix: 0, redshift: 0, starfieldA: 0,
};
const E = (o) => Object.assign({}, ENV_DEFAULTS, o);

const EPOCHS = [
  {
    id: 'singularity', label: 'Singularity', timeLabel: 't = 0', tempLabel: '∞', span: 4,
    desc: 'All of space, time, matter, and energy compressed into a single point of infinite density. There is no before.',
    env: E({ scale: 0.015, bloom: 0.9, foamA: 0.12 }),
    cam: { from: { pos: [0, 1, 30], look: [0, 0, 0], fov: 55 }, to: { pos: [0, 1, 24], look: [0, 0, 0], fov: 57 } },
  },
  {
    id: 'planck', label: 'Planck Epoch', timeLabel: '10⁻⁴³ s', tempLabel: '10³² K', span: 6,
    desc: 'The earliest meaningful moment. Quantum fluctuations ripple through newborn spacetime as the known laws of physics take hold.',
    env: E({ scale: 0.02, bloom: 1.5, bg: [0.008, 0.008, 0.016], foamA: 1, flashA: 0.05, gridA: 0.08 }),
    cam: { from: { pos: [0, 1, 24], look: [0, 0, 0], fov: 57 }, to: { pos: [0, 3, 19], look: [0, 0, 0], fov: 62 } },
  },
  {
    id: 'inflation', label: 'Inflation', timeLabel: '10⁻³⁶–10⁻³² s', tempLabel: '10²⁸ K', span: 7,
    desc: 'In a brilliant flash, space itself expands faster than light, stretching quantum ripples to cosmic scale.',
    env: E({ scale: 0.06, bloom: 3.6, bg: [0.02, 0.015, 0.012], foamA: 0.35, flashA: 1, gridA: 0.5, plasmaA: 0.2, plasmaHeat: 1 }),
    cam: { from: { pos: [0, 3, 19], look: [0, 0, 0], fov: 62 }, to: { pos: [0, 8, 64], look: [0, 0, 0], fov: 72 } },
  },
  {
    id: 'particles', label: 'Particle Formation', timeLabel: '10⁻⁶ s – 3 min', tempLabel: '10¹³ K', span: 11,
    desc: 'A searing quark–gluon plasma fills the universe and cools; quarks bind into protons and neutrons — the seeds of all matter.',
    env: E({ scale: 4, bloom: 2, bg: [0.05, 0.02, 0.008], flashA: 0.1, gridA: 0.34, plasmaA: 1, plasmaHeat: 0.92, particleA: 0.85, particleMix: 0.06 }),
    cam: { from: { pos: [0, 8, 64], look: [0, 0, 0], fov: 72 }, to: { pos: [36, 12, 50], look: [0, 0, 0], fov: 60 } },
  },
  {
    id: 'atoms', label: 'Atoms Form', timeLabel: '380,000 yr', tempLabel: '3,000 K', span: 9,
    desc: 'Electrons settle around nuclei; the fog clears and light streams free. Hydrogen and helium — the first atoms — fill space.',
    env: E({ scale: 5.5, bloom: 1.35, bg: [0.035, 0.014, 0.005], gridA: 0.14, plasmaA: 0.45, plasmaHeat: 0.32, particleA: 1, particleMix: 0.8, cmbA: 0.55 }),
    cam: { from: { pos: [36, 12, 50], look: [0, 0, 0], fov: 60 }, to: { pos: [26, 16, 84], look: [0, 0, 0], fov: 58 } },
  },
  {
    id: 'firststars', label: 'First Stars', timeLabel: '200 Myr', tempLabel: '', span: 12,
    desc: 'Gravity gathers cold gas into collapsing clouds. When their cores ignite, the first starlight ends the cosmic dark ages.',
    env: E({ scale: 7, bloom: 1.6, bg: [0.004, 0.006, 0.012], plasmaHeat: 0.1, particleA: 0.22, particleMix: 1, cmbA: 0.16, starA: 1, starMix: 0.06, starfieldA: 0.12 }),
    cam: { from: { pos: [26, 16, 84], look: [0, 0, 0], fov: 58 }, to: { pos: [70, 30, 150], look: [0, 0, 0], fov: 55 } },
  },
  {
    id: 'galaxies', label: 'First Galaxies', timeLabel: '1 Gyr', tempLabel: '', span: 12,
    desc: 'Star clusters merge into protogalaxies, then great spirals and ellipticals — all carried apart by the expansion of space.',
    env: E({ scale: 9, bloom: 1.4, bg: [0.003, 0.005, 0.01], plasmaHeat: 0.1, particleMix: 1, cmbA: 0.04, starA: 0.7, starMix: 1, galaxyA: 1, galaxyMix: 0.12, redshift: 0.12, starfieldA: 0.35 }),
    cam: { from: { pos: [70, 30, 150], look: [0, 0, 0], fov: 55 }, to: { pos: [120, 60, 380], look: [0, 0, 0], fov: 55 } },
  },
  {
    id: 'milkyway', label: 'Milky Way Forms', timeLabel: '~8 Gyr ago', tempLabel: '', span: 9,
    desc: 'Our own galaxy assembles from merging clouds and clusters, settling into a barred spiral around a supermassive black hole.',
    env: E({ scale: 10.5, bloom: 1.35, bg: [0.002, 0.004, 0.009], plasmaHeat: 0.1, particleMix: 1, starA: 0.15, starMix: 1, galaxyA: 0.5, galaxyMix: 0.9, spiralA: 1, spiralMix: 0.15, redshift: 0.2, starfieldA: 0.55 }),
    cam: { from: { pos: [0, 120, 210], look: [0, 0, 0], fov: 55 }, to: { pos: [80, 45, 140], look: [0, 0, 0], fov: 52 } },
  },
  {
    id: 'solar', label: 'Solar System Forms', timeLabel: '4.6 Gyr ago', tempLabel: '', span: 13,
    desc: 'In one spiral arm a nebula collapses into a spinning disk. The Sun ignites; dust grows into planetesimals, protoplanets, and worlds.',
    env: E({ scale: 12, bloom: 1.4, bg: [0.002, 0.003, 0.007], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.2, galaxyMix: 1, spiralA: 0.45, spiralMix: 1, solarA: 1, solarMix: 0.05, redshift: 0.26, starfieldA: 0.8 }),
    cam: { from: { pos: [600, 60, 130], look: [600, 0, 0], fov: 55 }, to: { pos: [655, 26, 85], look: [600, 0, 0], fov: 52 } },
  },
  {
    id: 'present', label: 'Present Day', timeLabel: '13.8 Gyr', tempLabel: '2.7 K', span: 8,
    desc: 'A middle-aged star, eight planets, and a quiet sky. Every atom around you was forged somewhere along this story.',
    env: E({ scale: 13.5, bloom: 1.2, bg: [0.002, 0.003, 0.006], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.12, galaxyMix: 1, spiralA: 0.22, spiralMix: 1, solarA: 1, solarMix: 1, ringsA: 0.8, redshift: 0.3, starfieldA: 1 }),
    cam: { from: { pos: [655, 26, 85], look: [600, 0, 0], fov: 52 }, to: { pos: [530, 42, 118], look: [600, 0, 0], fov: 55 } },
  },
  {
    id: 'future', label: 'Future Universe', timeLabel: '10¹⁴ yr and beyond', tempLabel: '→ 0 K', span: 9,
    desc: 'Expansion accelerates. Galaxies slip beyond the horizon, stars fade to embers, and the universe drifts toward a cold, quiet dark.',
    env: E({ scale: 15, bloom: 1, bg: [0.001, 0.001, 0.003], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.08, galaxyMix: 1, spiralA: 0.15, spiralMix: 1, solarA: 0.9, solarMix: 1, ringsA: 0.25, futureMix: 0.1, redshift: 0.55, starfieldA: 0.7 }),
    cam: { from: { pos: [530, 42, 118], look: [600, 0, 0], fov: 55 }, to: { pos: [610, 190, 330], look: [600, 0, 0], fov: 50 } },
  },
];
// state at u = 1 (heat death)
const ENV_END = E({
  scale: 26, bloom: 0.5, plasmaHeat: 0.1, particleMix: 1, starMix: 1,
  galaxyA: 0, galaxyMix: 1, spiralA: 0.04, spiralMix: 1,
  solarA: 0.1, solarMix: 1, futureMix: 1, redshift: 1, starfieldA: 0.05,
});

(function normalizeEpochs() {
  const total = EPOCHS.reduce((sum, e) => sum + e.span, 0);
  let acc = 0;
  for (const e of EPOCHS) {
    e.u0 = acc / total;
    acc += e.span;
    e.u1 = acc / total;
  }
  EPOCHS[EPOCHS.length - 1].u1 = 1;
})();

function epochAt(u) {
  for (let i = 0; i < EPOCHS.length; i++) if (u < EPOCHS[i].u1) return i;
  return EPOCHS.length - 1;
}
function epochProgress(u) {
  const e = EPOCHS[epochAt(u)];
  return MathUtils.clamp((u - e.u0) / (e.u1 - e.u0), 0, 1);
}
function uForEpoch(i) {
  return EPOCHS[MathUtils.clamp(i, 0, EPOCHS.length - 1)].u0;
}

const envOut = E({});
function envAt(u) {
  const i = epochAt(u);
  const a = EPOCHS[i].env;
  const b = i + 1 < EPOCHS.length ? EPOCHS[i + 1].env : ENV_END;
  const k = smooth(epochProgress(u), 0, 1);
  for (const key in a) {
    envOut[key] = Array.isArray(a[key])
      ? [0, 1, 2].map(c => a[key][c] + (b[key][c] - a[key][c]) * k)
      : a[key] + (b[key] - a[key]) * k;
  }
  return envOut;
}
  return { EPOCHS, epochAt, epochProgress, uForEpoch, envAt };
}
