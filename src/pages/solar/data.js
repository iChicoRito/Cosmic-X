export function createSolarData(CONFIG, QUALITY) {
/* ================================================================
   GALAXY & PLANET DATA
   ================================================================ */

// rotHours: sidereal day; retrograde spin (Venus, Uranus) carried by tilt > 90°.
const MILKY_WAY_PLANETS = [
  { name: 'Mercury', au: 0.387,  e: 0.206, periodDays: 88,     rotHours: 1407.6, tiltDeg: 0.03,  radiusE: 0.38,  tex: 'rocky', map: 'mercurymap.jpg', bump: 'mercurybump.jpg', colors: ['#8a8580', '#5f5b56', '#a89f94'], trail: '#9aa0a8' },
  { name: 'Venus',   au: 0.723,  e: 0.007, periodDays: 224.7,  rotHours: 5832.5, tiltDeg: 177.4, radiusE: 0.95,  tex: 'venus', map: 'venusmap.jpg',   bump: 'venusbump.jpg',   colors: ['#d9b26a', '#e8cf9a', '#b98d4f'], trail: '#e0c184', atmo: { color: '#e8c87a', intensity: 0.55 } },
  { name: 'Earth',   au: 1.0,    e: 0.017, periodDays: 365.25, rotHours: 23.93,  tiltDeg: 23.44, radiusE: 1.0,   tex: 'earth', map: 'earthmap1k.jpg', bump: 'earthbump1k.jpg', clouds: true, colors: ['#123f6b', '#2e8b57', '#c2b280'], trail: '#6fa8dc', atmo: { color: '#6fb2ff', intensity: 0.8 },
    moon: { name: 'Moon', dist: 6, periodDays: 27.32, radiusE: 0.27, map: 'moonmap1k.jpg', bump: 'moonbump1k.jpg' } },
  { name: 'Mars',    au: 1.524,  e: 0.093, periodDays: 687,    rotHours: 24.62,  tiltDeg: 25.19, radiusE: 0.53,  tex: 'rocky', map: 'marsmap1k.jpg',  bump: 'marsbump1k.jpg',  colors: ['#b5533c', '#8f3b2a', '#d9825f'], trail: '#e0795a', atmo: { color: '#e2926a', intensity: 0.3 } },
  { name: 'Jupiter', au: 5.203,  e: 0.048, periodDays: 4333,   rotHours: 9.93,   tiltDeg: 3.13,  radiusE: 11.21, tex: 'gas',   map: 'jupitermap.jpg', colors: ['#d8b48d', '#a97c50', '#e8d9c3', '#c98d66'], trail: '#e3b98a', atmo: { color: '#e8cfa8', intensity: 0.35 } },
  { name: 'Saturn',  au: 9.537,  e: 0.054, periodDays: 10759,  rotHours: 10.66,  tiltDeg: 26.73, radiusE: 9.45,  tex: 'gas',   map: 'saturnmap.jpg',  colors: ['#e3d1a8', '#c9b183', '#efe3c2', '#b39d6f'], trail: '#e8d5a5', atmo: { color: '#efe0b8', intensity: 0.3 },
    ring: { inner: 1.45, outer: 2.35, map: 'saturnringcolor.jpg' } },
  { name: 'Uranus',  au: 19.19,  e: 0.047, periodDays: 30687,  rotHours: 17.24,  tiltDeg: 97.77, radiusE: 4.01,  tex: 'gas',   map: 'uranusmap.jpg',  colors: ['#9fd6d9', '#7fbfc4', '#c5eef0'], trail: '#9fd8db', atmo: { color: '#aee6e8', intensity: 0.4 } },
  { name: 'Neptune', au: 30.07,  e: 0.009, periodDays: 60190,  rotHours: 16.11,  tiltDeg: 28.32, radiusE: 3.88,  tex: 'gas',   map: 'neptunemap.jpg', colors: ['#3f66d4', '#2a4bb0', '#7fa3ec'], trail: '#6c8fe8', atmo: { color: '#7fa8ff', intensity: 0.5 } },
];

// Fictional systems for the other galaxies (procedural textures only).
const ANDROMEDA_PLANETS = [
  { name: 'Cinder',  au: 0.45, e: 0.12, periodDays: 110,   rotHours: 40,   tiltDeg: 5,    radiusE: 0.7,  tex: 'rocky', colors: ['#8a3b28', '#5a1f12', '#e07a4a'], trail: '#e08a5a', atmo: { color: '#ff7a3a', intensity: 0.6 } },
  { name: 'Halcyon', au: 1.1,  e: 0.03, periodDays: 400,   rotHours: 30,   tiltDeg: 18,   radiusE: 1.3,  tex: 'earth', colors: ['#0d4f66', '#2aa198', '#c8d6b0'], trail: '#6fd8dc', atmo: { color: '#7fe0e8', intensity: 0.85 } },
  { name: 'Aurelia', au: 2.2,  e: 0.08, periodDays: 1100,  rotHours: 55,   tiltDeg: 31,   radiusE: 2.1,  tex: 'venus', colors: ['#d9a642', '#f0d488', '#a8762e'], trail: '#ecc26a', atmo: { color: '#f0cc6a', intensity: 0.5 } },
  { name: 'Titanus', au: 6.5,  e: 0.05, periodDays: 5800,  rotHours: 11,   tiltDeg: 12,   radiusE: 13,   tex: 'gas',   colors: ['#7a5ec8', '#5a3fa8', '#b8a0ec', '#8a6fd8'], trail: '#a88fe8', atmo: { color: '#b8a0ff', intensity: 0.45 }, ring: { inner: 1.5, outer: 2.6 } },
  { name: 'Boreas',  au: 14,   e: 0.04, periodDays: 19000, rotHours: 15,   tiltDeg: 42,   radiusE: 4.5,  tex: 'gas',   colors: ['#9fd6ec', '#6fa8cc', '#d5f2ff'], trail: '#9fd0ec', atmo: { color: '#bfe8ff', intensity: 0.5 } },
  { name: 'Umbriel', au: 26,   e: 0.14, periodDays: 48000, rotHours: 70,   tiltDeg: 8,    radiusE: 1.8,  tex: 'rocky', colors: ['#4a4a55', '#2a2a33', '#6a6a7a'], trail: '#8a8aa0' },
];

const M87_PLANETS = [
  { name: 'Erebus',  au: 3.2, e: 0, periodDays: 174.3, radiusE: 1.6,  tex: 'rocky', colors: ['#5a4a66', '#3a2a44', '#8a6fa0'], trail: '#a88fd0', rotHours: 45, tiltDeg: 15 },
  { name: 'Nyx',     au: 5.5, e: 0, periodDays: 272.5, radiusE: 3.4,  tex: 'gas',   colors: ['#a05a2a', '#7a3a18', '#e0a05a'], trail: '#e0a06a', rotHours: 18, tiltDeg: 25, atmo: { color: '#ff9a4a', intensity: 0.5 } },
  { name: 'Charon',  au: 8.5, e: 0, periodDays: 390.3, radiusE: 0.9,  tex: 'rocky', colors: ['#7a7a88', '#4a4a55', '#a8a8ba'], trail: '#a0a0b8', rotHours: 90, tiltDeg: 3 },
  { name: 'Acheron', au: 13,  e: 0, periodDays: 554.1, radiusE: 5.2,  tex: 'gas',   colors: ['#8a2a3a', '#5a1522', '#d06a7a'], trail: '#d07a8a', rotHours: 13, tiltDeg: 35, atmo: { color: '#ff6a7a', intensity: 0.45 }, ring: { inner: 1.4, outer: 2.2 } },
];

const GALAXIES = [
  {
    name: 'Milky Way', type: 'Barred spiral', stars: '250 billion stars',
    desc: 'Home. Eight planets around a middle-aged G-type star, with an asteroid belt between Mars and Jupiter.',
    planets: MILKY_WAY_PLANETS, star: { radius: 8, colorA: '#ff8c1a', colorB: '#ffe6a3', boost: [1.7, 1.4, 1.0], light: 0xffffff },
    belt: true, starTint: [0.9, 0.95, 1.05], starDensity: 1,
    nebulas: [['#3a5aa8', 0.16], ['#7a4aa8', 0.13], ['#2a7a8a', 0.1]],
  },
  {
    name: 'Andromeda', type: 'Spiral (M31)', stars: '1 trillion stars',
    desc: 'Our nearest giant neighbor, imagined here as a system of six worlds around a hot blue-white star.',
    planets: ANDROMEDA_PLANETS, star: { radius: 10, colorA: '#7ab8ff', colorB: '#e8f4ff', boost: [1.2, 1.5, 1.9], light: 0xcfe4ff },
    belt: true, starTint: [0.8, 0.9, 1.2], starDensity: 1.4,
    nebulas: [['#2a6aca', 0.2], ['#8a3aa8', 0.16], ['#3a9aaa', 0.12]],
  },
  {
    name: 'Messier 87', type: 'Elliptical', stars: '1 trillion stars',
    desc: 'A giant elliptical galaxy hosting a supermassive black hole. Four captive worlds trace decaying orbits around the void.',
    planets: M87_PLANETS, star: null, blackHole: { mass: 1500 },
    belt: false, starTint: [1.15, 1.0, 0.8], starDensity: 0.7,
    nebulas: [['#a85a2a', 0.18], ['#8a2a3a', 0.15], ['#caa04a', 0.1]],
  },
];

/* ================================================================
   SCIENTIFIC FACTS & MOON SYSTEMS
   ================================================================ */

// NASA/JPL reference values, rounded for display. Satellite census checked
// 2026-07-17 against https://ssd.jpl.nasa.gov/sats/discovery.html.
const PLANET_FACTS = {
  Mercury: { radiusKm: 2440,  massKg: 3.301e23, gravity: 3.7,  density: 5.43, tempC: 167,  escape: 4.25, moons: 0,   hab: 0.01, atmo: [['O₂', 42], ['Na', 29], ['H₂', 22], ['Other', 7]] },
  Venus:   { radiusKm: 6052,  massKg: 4.867e24, gravity: 8.87, density: 5.24, tempC: 464,  escape: 10.36, moons: 0,  hab: 0.02, atmo: [['CO₂', 96.5], ['N₂', 3.5]] },
  Earth:   { radiusKm: 6371,  massKg: 5.972e24, gravity: 9.81, density: 5.51, tempC: 15,   escape: 11.19, moons: 1,  hab: 0.95, atmo: [['N₂', 78.1], ['O₂', 20.9], ['Ar', 0.9], ['Other', 0.1]] },
  Mars:    { radiusKm: 3390,  massKg: 6.417e23, gravity: 3.71, density: 3.93, tempC: -65,  escape: 5.03, moons: 2,   hab: 0.32, atmo: [['CO₂', 95.3], ['N₂', 2.8], ['Ar', 1.9]] },
  Jupiter: { radiusKm: 69911, massKg: 1.898e27, gravity: 24.79, density: 1.33, tempC: -110, escape: 60.20, moons: 115, hab: 0.01, atmo: [['H₂', 89.8], ['He', 10.2]] },
  Saturn:  { radiusKm: 58232, massKg: 5.683e26, gravity: 10.44, density: 0.69, tempC: -140, escape: 36.09, moons: 293, hab: 0.01, atmo: [['H₂', 96.3], ['He', 3.3], ['CH₄', 0.4]] },
  Uranus:  { radiusKm: 25362, massKg: 8.681e25, gravity: 8.87, density: 1.27, tempC: -195, escape: 21.38, moons: 29,  hab: 0.01, atmo: [['H₂', 82.5], ['He', 15.2], ['CH₄', 2.3]] },
  Neptune: { radiusKm: 24622, massKg: 1.024e26, gravity: 11.15, density: 1.64, tempC: -200, escape: 23.56, moons: 16, hab: 0.01, atmo: [['H₂', 80], ['He', 19], ['CH₄', 1]] },
};

// Extra natural satellites (Earth's moon lives on its def already).
// dist is scene units from the planet anchor; negative period = retrograde.
const EXTRA_MOONS = {
  Mars:    [{ name: 'Phobos', dist: 3.2, periodDays: 0.32, radiusE: 0.09, inc: 1 },
            { name: 'Deimos', dist: 4.4, periodDays: 1.26, radiusE: 0.06, inc: 2 }],
  Jupiter: [{ name: 'Io', dist: 6.5, periodDays: 1.77, radiusE: 0.286, inc: 0, colors: ['#d8c76a', '#a8903a', '#efe0a0'] },
            { name: 'Europa', dist: 8, periodDays: 3.55, radiusE: 0.245, inc: 1, colors: ['#c8b8a0', '#98826a', '#e8ddc8'] },
            { name: 'Ganymede', dist: 10, periodDays: 7.15, radiusE: 0.413, inc: 0 },
            { name: 'Callisto', dist: 12.5, periodDays: 16.69, radiusE: 0.378, inc: 2 }],
  Saturn:  [{ name: 'Rhea', dist: 11.3, periodDays: 4.52, radiusE: 0.12, inc: 1 },
            { name: 'Titan', dist: 13.5, periodDays: 15.95, radiusE: 0.404, inc: 0, colors: ['#d8a75a', '#a87830', '#efc888'] }],
  Uranus:  [{ name: 'Titania', dist: 5, periodDays: 8.71, radiusE: 0.12, inc: 1 },
            { name: 'Oberon', dist: 6.5, periodDays: 13.46, radiusE: 0.12, inc: 2 }],
  Neptune: [{ name: 'Triton', dist: 5.5, periodDays: -5.88, radiusE: 0.21, inc: 157 - 180 }],
  Halcyon: [{ name: 'Lira', dist: 5, periodDays: 18, radiusE: 0.2, inc: 3 },
            { name: 'Vesper', dist: 7, periodDays: 34, radiusE: 0.14, inc: 6 }],
  Titanus: [{ name: 'Rukh', dist: 9.5, periodDays: 6, radiusE: 0.3, inc: 1 },
            { name: 'Sylph', dist: 12, periodDays: 13, radiusE: 0.25, inc: 4 }],
  Nyx:     [{ name: 'Umbra', dist: 5.5, periodDays: 9, radiusE: 0.2, inc: 2 }],
};

for (const g of GALAXIES) for (const def of g.planets) {
  def.moons = [...(def.moon ? [def.moon] : []), ...(EXTRA_MOONS[def.name] || [])];
}

const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(x) {
  const e = Math.floor(Math.log10(Math.abs(x)));
  const sup = String(e).split('').map(c => SUPERSCRIPT[c]).join('');
  return (x / Math.pow(10, e)).toFixed(2) + '×10' + sup;
}

// Plausible physical data for fictional worlds, derived from size and class.
function deriveFacts(def, hasStar) {
  const densities = { gas: 1.3, earth: 5.5, venus: 5.2, rocky: 4.5 };
  const density = densities[def.tex] || 4;
  const rM = def.radiusE * 6.371e6;
  const massKg = density * 1000 * (4 / 3) * Math.PI * rM * rM * rM;
  const massE = massKg / 5.972e24;
  const tempC = hasStar
    ? Math.round(278 / Math.sqrt(Math.max(def.au, 0.05)) - 273 + (def.atmo ? 20 + def.atmo.intensity * 45 : 0))
    : -222;
  const atmoByTex = {
    gas:   [['H₂', 84], ['He', 13], ['CH₄', 3]],
    earth: [['N₂', 70], ['O₂', 24], ['CO₂', 4], ['Ar', 2]],
    venus: [['CO₂', 91], ['N₂', 6], ['SO₂', 3]],
    rocky: def.atmo ? [['CO₂', 74], ['N₂', 21], ['Ar', 5]] : [['Trace', 100]],
  };
  return {
    radiusKm: Math.round(def.radiusE * 6371),
    massKg,
    gravity: +(9.81 * massE / (def.radiusE * def.radiusE)).toFixed(2),
    density,
    tempC,
    escape: +(11.19 * Math.sqrt(massE / def.radiusE)).toFixed(1),
    moons: (def.moons || []).length,
    hab: def.tex === 'earth' ? 0.82 : (def.atmo && tempC > -70 && tempC < 70 ? 0.24 : 0.03),
    atmo: atmoByTex[def.tex] || atmoByTex.rocky,
  };
}

function factsFor(def, hasStar = true) {
  return PLANET_FACTS[def.name] || deriveFacts(def, hasStar);
}

function typeFor(def) {
  if (def.tex === 'gas') return def.radiusE >= 6 ? 'Gas giant' : 'Ice giant';
  if (def.tex === 'earth') return 'Terrestrial · temperate';
  if (def.tex === 'venus') return 'Terrestrial · greenhouse';
  return 'Terrestrial';
}

const TRAIL_POINTS = 1400;
const BELT_COUNT = 2600;
const BELT_PERIOD_DAYS = 1620;

const scaledDist = (au) => CONFIG.distanceScale * Math.pow(au, CONFIG.distanceExp);
const geoRadius = (radiusE) => Math.sqrt(radiusE);
const density = () => CONFIG.particleDensity * QUALITY[CONFIG.quality].density;

// ponytail: rail planets use uniform angular velocity on the ellipse; free
// bodies (comets, asteroids, debris) get true integrated gravity instead.
function orbitPos(def, theta, out) {
  const rAU = def.au * (1 - def.e * def.e) / (1 + def.e * Math.cos(theta));
  const r = scaledDist(rAU);
  return out.set(Math.cos(theta) * r, 0, Math.sin(theta) * r);
}
  return {
    GALAXIES, PLANET_FACTS, factsFor, typeFor,
    TRAIL_POINTS, BELT_COUNT, BELT_PERIOD_DAYS,
    scaledDist, geoRadius, density, orbitPos,
  };
}
