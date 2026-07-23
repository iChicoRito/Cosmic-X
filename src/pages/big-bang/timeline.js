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

export function glideDuration(from, to, reducedMotion = false) {
  return reducedMotion ? 0 : MathUtils.clamp(0.8 + Math.abs(to - from) * 2.4, 0.8, 2.4);
}

const OPENING_HOLD_U = 3 / 90;

export function openingVisualAt(epochs, u) {
  const bounded = MathUtils.clamp(u, 0, 1);
  const first = epochs[0];
  const holdEnd = first.u0 + OPENING_HOLD_U;
  if (bounded <= holdEnd) return first.u0;
  if (bounded >= first.u1) return bounded;
  return first.u0 + (bounded - holdEnd) / (first.u1 - holdEnd) * (first.u1 - first.u0);
}

export function epochPresentationAt(epochs, u) {
  const epoch = epochs[epochIndexAt(epochs, u)];
  const beats = epoch.beats || [];
  const beatIndex = beats.length
    ? Math.min(beats.length - 1, Math.floor(epochProgressAt(epochs, u) * beats.length))
    : -1;
  const beat = beats[beatIndex];
  return {
    key: `${epoch.id}:${beatIndex}`,
    label: beat ? `${epoch.label} · ${beat.label}` : epoch.label,
    beatLabel: beat?.label || '',
    timeLabel: beat?.timeLabel || epoch.timeLabel,
    badgeLabel: beat?.badgeLabel || epoch.badgeLabel,
    badgeDetail: beat?.badgeDetail ?? epoch.badgeDetail ?? '',
    desc: beat?.desc || epoch.desc,
  };
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
  lifeMix: 0, earthFocusA: 0, modernA: 0,
  futureMix: 0, redshift: 0, starfieldA: 0,
};
const E = (o) => Object.assign({}, ENV_DEFAULTS, o);

const EPOCHS = [
  {
    id: 'bigbang', label: 'The Big Bang', timeLabel: '0 seconds', tempLabel: 'Extremely hot', span: 9,
    badgeLabel: 'Instant zero', badgeDetail: 'Extremely hot',
    desc: 'Space and time begin as the universe expands from an extremely hot, dense state, releasing matter and energy into a rapidly growing cosmos.',
    env: E({ scale: 0.02, bloom: 2.1, bg: [0.02, 0.012, 0.008], foamA: 0.8, flashA: 0.75, gridA: 0, plasmaA: 0, plasmaHeat: 1, particleA: 0 }),
    cam: { from: { pos: [0, 1, 30], look: [0, 0, 0], fov: 55 }, to: { pos: [0, 8, 64], look: [0, 0, 0], fov: 72 } },
  },
  {
    id: 'primordial', label: 'The Primordial Universe', timeLabel: 'The first few minutes', tempLabel: 'Billions of kelvin', span: 10,
    badgeLabel: 'First minutes', badgeDetail: 'Billions K',
    desc: 'The universe cools into a dense plasma ocean. Quarks bind into protons and neutrons, then the first hydrogen and helium nuclei form.',
    env: E({ scale: 4, bloom: 1.7, bg: [0.04, 0.015, 0.006], flashA: 0.05, gridA: 0.28, plasmaA: 1, plasmaHeat: 0.92, particleA: 1, particleMix: 0.1 }),
    cam: { from: { pos: [0, 8, 64], look: [0, 0, 0], fov: 72 }, to: { pos: [36, 12, 50], look: [0, 0, 0], fov: 60 } },
  },
  {
    id: 'recombination', label: 'Recombination and the First Light', timeLabel: 'Approximately 380,000 years after the Big Bang', tempLabel: 'Approximately 3,000 K', span: 8,
    badgeLabel: '380,000 years', badgeDetail: '3,000 K',
    desc: 'Electrons join nuclei to form neutral atoms. The cosmic fog clears, light travels freely, and the cosmic microwave background is released.',
    env: E({ scale: 5.5, bloom: 1.25, bg: [0.025, 0.01, 0.004], gridA: 0.08, plasmaA: 0.35, plasmaHeat: 0.28, particleA: 1, particleMix: 1, cmbA: 0.6 }),
    cam: { from: { pos: [36, 12, 50], look: [0, 0, 0], fov: 60 }, to: { pos: [26, 16, 84], look: [0, 0, 0], fov: 58 } },
  },
  {
    id: 'darkages', label: 'The Cosmic Dark Ages', timeLabel: 'Approximately 380,000 to 200 million years after the Big Bang', tempLabel: '', span: 9,
    badgeLabel: '380,000–200M years',
    desc: 'No stars exist yet. Neutral hydrogen fills a nearly dark universe while gravity slowly gathers gas into increasingly dense clouds.',
    env: E({ scale: 6.5, bloom: 0.85, bg: [0.0015, 0.002, 0.005], plasmaHeat: 0.1, particleA: 0.1, particleMix: 1, cmbA: 0.12, starA: 0.45, starMix: 0, starfieldA: 0.08 }),
    cam: { from: { pos: [26, 16, 84], look: [0, 0, 0], fov: 58 }, to: { pos: [70, 30, 150], look: [0, 0, 0], fov: 55 } },
  },
  {
    id: 'firststars', label: 'The First Stars', timeLabel: 'Approximately 200 million years after the Big Bang', tempLabel: '', span: 9,
    badgeLabel: '200M years',
    desc: 'Gravity ignites the first massive, blue-white Population III stars. Their light ends the dark ages, and their short lives seed space through the earliest supernovae.',
    env: E({ scale: 7.5, bloom: 1.5, bg: [0.003, 0.005, 0.011], plasmaHeat: 0.1, particleMix: 1, cmbA: 0.03, starA: 1, starMix: 0.12, starfieldA: 0.16 }),
    cam: { from: { pos: [70, 30, 150], look: [0, 0, 0], fov: 55 }, to: { pos: [120, 60, 380], look: [0, 0, 0], fov: 55 } },
  },
  {
    id: 'firstgalaxies', label: 'The First Galaxies', timeLabel: 'Approximately 400 million years after the Big Bang', tempLabel: '', span: 9,
    badgeLabel: '400M years',
    desc: 'Young stars gather into the first galaxies. Mergers build larger structures while the earliest central black holes begin to grow.',
    env: E({ scale: 9, bloom: 1.35, bg: [0.003, 0.005, 0.01], plasmaHeat: 0.1, particleMix: 1, starA: 0.75, starMix: 1, galaxyA: 1, galaxyMix: 0.12, spiralA: 0.08, spiralMix: 0.05, redshift: 0.1, starfieldA: 0.35 }),
    cam: { from: { pos: [120, 60, 380], look: [0, 0, 0], fov: 55 }, to: { pos: [80, 45, 140], look: [0, 0, 0], fov: 52 } },
  },
  {
    id: 'galaxyevolution', label: 'Galaxy Evolution', timeLabel: 'Approximately 1 to 5 billion years after the Big Bang', tempLabel: '', span: 10,
    badgeLabel: '1–5B years',
    desc: 'Spiral and elliptical galaxies mature. Stellar nurseries form new generations of stars as supernovae spread heavy elements through space.',
    env: E({ scale: 10.5, bloom: 1.25, bg: [0.002, 0.004, 0.009], plasmaHeat: 0.1, particleMix: 1, starA: 0.25, starMix: 1, galaxyA: 0.65, galaxyMix: 1, spiralA: 1, spiralMix: 0.18, redshift: 0.18, starfieldA: 0.55 }),
    cam: { from: { pos: [80, 45, 140], look: [0, 0, 0], fov: 52 }, to: { pos: [300, 70, 190], look: [300, 0, 0], fov: 55 } },
  },
  {
    id: 'solar', label: 'Birth of the Solar System', timeLabel: 'Approximately 9.2 billion years after the Big Bang, or 4.6 billion years ago', tempLabel: '4.6 billion years ago', span: 10,
    badgeLabel: '9.2B years', badgeDetail: '4.6B years ago',
    desc: 'A molecular cloud collapses into the Sun and a rotating protoplanetary disk. Dust and rock gather into planets, moons, asteroids, and comets.',
    env: E({ scale: 12, bloom: 1.35, bg: [0.002, 0.003, 0.007], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.18, galaxyMix: 1, spiralA: 0.5, spiralMix: 1, solarA: 1, solarMix: 0.05, redshift: 0.25, starfieldA: 0.8 }),
    cam: { from: { pos: [300, 70, 190], look: [300, 0, 0], fov: 55 }, to: { pos: [655, 26, 85], look: [600, 0, 0], fov: 52 } },
  },
  {
    id: 'life', label: 'Earth and the Rise of Life', timeLabel: 'Approximately 4.5 to 3.5 billion years ago', tempLabel: '', span: 8,
    badgeLabel: '4.5–3.5B years ago',
    desc: 'Earth cools from a volcanic world, oceans form, and the first simple microorganisms begin the long history of biological evolution.',
    env: E({ scale: 13, bloom: 1.15, bg: [0.002, 0.003, 0.006], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.12, galaxyMix: 1, spiralA: 0.22, spiralMix: 1, solarA: 1, solarMix: 1, ringsA: 0.7, lifeMix: 0.1, earthFocusA: 1, redshift: 0.28, starfieldA: 0.9 }),
    cam: { from: { pos: [655, 26, 85], look: [600, 0, 0], fov: 52 }, to: { pos: [620, 12, 32], look: [600, 0, 0], fov: 48 } },
  },
  {
    id: 'modern', label: 'The Modern Universe', timeLabel: 'Present day, approximately 13.8 billion years after the Big Bang', tempLabel: '2.7 K', span: 7,
    badgeLabel: 'Present day', badgeDetail: '2.7 K',
    desc: 'Billions of galaxies fill the observable universe. Stars continue to form and die while humanity studies the cosmos from Earth and space.',
    env: E({ scale: 13.5, bloom: 1.1, bg: [0.002, 0.003, 0.006], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.12, galaxyMix: 1, spiralA: 0.22, spiralMix: 1, solarA: 1, solarMix: 1, ringsA: 0.8, lifeMix: 1, modernA: 1, redshift: 0.3, starfieldA: 1 }),
    cam: { from: { pos: [620, 12, 32], look: [600, 0, 0], fov: 48 }, to: { pos: [530, 42, 118], look: [600, 0, 0], fov: 55 } },
  },
  {
    id: 'future', label: 'The Distant Future', timeLabel: 'Trillions to more than 10¹⁰⁰ years into the future', tempLabel: 'Approaching 0 K', span: 11,
    badgeLabel: 'Trillions+', badgeDetail: 'Near 0 K',
    desc: 'Star formation ends, stellar remnants and black holes dominate, and the universe approaches a cold state of maximum entropy.',
    beats: [
      { label: 'Stelliferous Era', timeLabel: 'Up to approximately 10¹⁴ years', badgeLabel: '≤10¹⁴ years', desc: 'The final generations of stars shine as star formation steadily declines.' },
      { label: 'Degenerate Era', timeLabel: 'Approximately 10¹⁴–10⁴⁰ years', badgeLabel: '10¹⁴–10⁴⁰ years', desc: 'White dwarfs, neutron stars, and black holes become the dominant objects in darkened galaxies.' },
      { label: 'Black Hole Era', timeLabel: 'Approximately 10⁴⁰–10¹⁰⁰ years', badgeLabel: '10⁴⁰–10¹⁰⁰ years', desc: 'Black holes dominate an increasingly empty universe and slowly evaporate through Hawking radiation.' },
      { label: 'Dark Era / Heat Death', timeLabel: 'Beyond approximately 10¹⁰⁰ years', badgeLabel: 'Beyond 10¹⁰⁰ years', desc: 'Almost no usable energy remains as the last black holes fade into a cold, nearly empty universe.' },
    ],
    env: E({ scale: 15, bloom: 0.9, bg: [0.001, 0.001, 0.003], plasmaHeat: 0.1, particleMix: 1, starMix: 1, galaxyA: 0.08, galaxyMix: 1, spiralA: 0.15, spiralMix: 1, solarA: 0.9, solarMix: 1, ringsA: 0.25, lifeMix: 1, modernA: 0.2, futureMix: 0.1, redshift: 0.55, starfieldA: 0.7 }),
    cam: { from: { pos: [530, 42, 118], look: [600, 0, 0], fov: 55 }, to: { pos: [610, 190, 330], look: [600, 0, 0], fov: 50 } },
  },
];
// state at u = 1 (heat death)
const ENV_END = E({
  scale: 26, bloom: 0.5, plasmaHeat: 0.1, particleMix: 1, starMix: 1,
  galaxyA: 0, galaxyMix: 1, spiralA: 0.04, spiralMix: 1,
  solarA: 0.03, solarMix: 1, lifeMix: 1, futureMix: 1, redshift: 1, starfieldA: 0.01,
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
