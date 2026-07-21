// Pure stellar-system / planet math + placeable-object catalog + encyclopedia
// for the Creator mode. No THREE, no DOM.

export const STAR_TYPES = [
  { id: 'O', name: 'O — Blue Giant', tempK: 35000, luminosity: 60000, massSuns: 30, lifeYr: 5e6, color: '#9db4ff' },
  { id: 'B', name: 'B — Blue-White', tempK: 18000, luminosity: 1200, massSuns: 8, lifeYr: 8e7, color: '#aac4ff' },
  { id: 'A', name: 'A — White', tempK: 8500, luminosity: 22, massSuns: 2, lifeYr: 1.5e9, color: '#d3ddff' },
  { id: 'F', name: 'F — Yellow-White', tempK: 6800, luminosity: 3.6, massSuns: 1.3, lifeYr: 4e9, color: '#f5f1e8' },
  { id: 'G', name: 'G — Yellow Dwarf', tempK: 5700, luminosity: 1, massSuns: 1, lifeYr: 1e10, color: '#ffe9b8' },
  { id: 'K', name: 'K — Orange Dwarf', tempK: 4400, luminosity: 0.28, massSuns: 0.7, lifeYr: 3e10, color: '#ffc78a' },
  { id: 'M', name: 'M — Red Dwarf', tempK: 3100, luminosity: 0.04, massSuns: 0.3, lifeYr: 1e12, color: '#ff9d6e' },
];

export const PLANET_CLASSES = [
  { id: 'rocky', name: 'Rocky', radius: 1, mass: 1 },
  { id: 'super-earth', name: 'Super-Earth', radius: 1.6, mass: 3.5 },
  { id: 'ocean', name: 'Ocean World', radius: 1.2, mass: 1.4 },
  { id: 'lava', name: 'Lava World', radius: 0.9, mass: 0.8 },
  { id: 'ice-giant', name: 'Ice Giant', radius: 3.9, mass: 15 },
  { id: 'gas-giant', name: 'Gas Giant', radius: 10.5, mass: 250 },
  { id: 'dwarf', name: 'Dwarf Planet', radius: 0.2, mass: 0.01 },
];

export const ATMOSPHERES = ['none', 'thin', 'earthlike', 'thick', 'toxic'];

export function starByType(id) {
  return STAR_TYPES.find(s => s.id === id) || STAR_TYPES[4];
}

/* Conservative habitable-zone bounds in AU for a total luminosity (Suns). */
export function habitableZone(luminosity) {
  const L = Math.max(luminosity, 1e-6);
  return { in: Math.sqrt(L / 1.1), out: Math.sqrt(L / 0.53) };
}

export function orbitalPeriodDays(aAU, starMassSuns) {
  return 365.25 * Math.sqrt(Math.pow(Math.max(aAU, 1e-4), 3) / Math.max(starMassSuns, 0.05));
}

export function surfaceGravity(massEarths, radiusEarths) {
  return massEarths / Math.pow(Math.max(radiusEarths, 0.05), 2);
}

const GREENHOUSE = { none: 0, thin: 8, earthlike: 33, thick: 90, toxic: 460 };

export function planetTempK(luminosity, aAU, atmosphere = 'none') {
  const eq = 278 * Math.pow(Math.max(luminosity, 1e-6), 0.25) / Math.sqrt(Math.max(aAU, 1e-4));
  return eq + (GREENHOUSE[atmosphere] ?? 0);
}

export function climateFor(tempK, atmosphere) {
  if (atmosphere === 'none') return tempK > 400 ? 'Scorched airless rock' : 'Airless cratered wastes';
  if (atmosphere === 'toxic') return 'Runaway greenhouse inferno';
  if (tempK < 200) return 'Frozen glacial world';
  if (tempK < 245) return 'Cold tundra bands';
  if (tempK < 290) return 'Temperate and mild';
  if (tempK < 330) return 'Hot tropical extremes';
  if (tempK < 450) return 'Searing desert winds';
  return 'Molten hellscape';
}

export function isHabitable(planet, hz) {
  const rockyLike = ['rocky', 'super-earth', 'ocean'].includes(planet.class);
  const airOk = ['thin', 'earthlike'].includes(planet.atmosphere);
  return rockyLike && airOk && planet.orbitAU >= hz.in && planet.orbitAU <= hz.out
    && planet.surfaceTemp > 240 && planet.surfaceTemp < 330;
}

/* Rough gas mix per atmosphere class, for the dossier's composition bar.
   Each list sums to 1. */
export const ATMOSPHERE_COMPOSITION = {
  none: [['Vacuum', 1]],
  thin: [['Carbon dioxide', 0.95], ['Nitrogen', 0.03], ['Argon', 0.02]],
  earthlike: [['Nitrogen', 0.78], ['Oxygen', 0.21], ['Argon', 0.01]],
  thick: [['Nitrogen', 0.62], ['Carbon dioxide', 0.3], ['Methane', 0.08]],
  toxic: [['Carbon dioxide', 0.96], ['Sulfur dioxide', 0.03], ['Nitrogen', 0.01]],
};

export const ATMOSPHERE_COLORS = {
  Vacuum: '#3a4152',
  Nitrogen: '#6d8fd6',
  Oxygen: '#6fc8a8',
  Argon: '#b98fd6',
  'Carbon dioxide': '#d69a6f',
  Methane: '#7fd0d6',
  'Sulfur dioxide': '#d6cf6f',
};

export function atmosphereComposition(atmosphere) {
  return ATMOSPHERE_COMPOSITION[atmosphere] || ATMOSPHERE_COMPOSITION.none;
}

/* Continuous 0-1 habitability for the dossier meter. Deliberately gated on the
   same four conditions as isHabitable, so the meter reads above zero exactly
   when the boolean says yes — the two can never contradict each other. */
export function habitabilityScore(planet, hz) {
  if (!isHabitable(planet, hz)) return 0;
  const t = planet.surfaceTemp;
  const temp = 1 - Math.abs(t - 288) / (t > 288 ? 42 : 48);
  const mid = (hz.in + hz.out) / 2;
  const orbit = 1 - Math.abs(planet.orbitAU - mid) / Math.max((hz.out - hz.in) / 2, 1e-6);
  const gravity = 1 - Math.min(Math.abs((planet.gravity ?? 1) - 1) / 1.5, 1);
  const air = planet.atmosphere === 'earthlike' ? 1 : 0.75;
  const score = 0.45 * temp + 0.25 * orbit + 0.15 * gravity + 0.15 * air;
  return Math.min(Math.max(score, 0.01), 1);
}

/* Deterministic rng from a string key, so a body's generated detail is stable
   across rebuilds without threading a seed through every caller. */
export function seededRng(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Long enough to name every moon generatePlanets can produce (max 9), so the
// roster length always equals the planet's moon count — no silent truncation.
const MOON_LETTERS = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ'];

/* Named moons with ordered, non-overlapping orbits. Planets only carry a moon
   count; the dossier and the scene both need individuals. */
export function generateMoons(planet, rng = Math.random) {
  const count = Math.min(Math.max(planet.moons | 0, 0), MOON_LETTERS.length);
  const moons = [];
  let distance = 2.6;                    // in planet radii
  for (let i = 0; i < count; i++) {
    distance *= 1.35 + rng() * 0.5;      // strictly increasing, always separated
    moons.push({
      name: `${planet.name} ${MOON_LETTERS[i]}`,
      distance: Number(distance.toFixed(3)),
      radius: Number((0.08 + rng() * 0.22).toFixed(3)),
      periodDays: Number((0.35 * Math.pow(distance, 1.5)).toFixed(2)),
      phase: Number((rng() * Math.PI * 2).toFixed(4)),
    });
  }
  return moons;
}

/* Recompute every derived planet field from its configurable ones. */
export function derivePlanet(planet, system) {
  const lum = systemLuminosity(system);
  const massSuns = systemMassSuns(system);
  const out = { ...planet };
  out.surfaceTemp = Math.round(planetTempK(lum, out.orbitAU, out.atmosphere));
  out.gravity = Number(surfaceGravity(out.mass, out.radius).toFixed(2));
  out.periodDays = Math.round(orbitalPeriodDays(out.orbitAU, massSuns));
  out.climate = climateFor(out.surfaceTemp, out.atmosphere);
  out.habitable = isHabitable(out, habitableZone(lum));
  return out;
}

export function systemLuminosity(system) {
  return system.stars.reduce((sum, s) => sum + s.luminosity, 0);
}

export function systemMassSuns(system) {
  return system.stars.reduce((sum, s) => sum + s.massSuns, 0);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function generatePlanets(system, rng, count = null) {
  const n = count ?? 2 + Math.floor(rng() * 5);
  const hz = habitableZone(systemLuminosity(system));
  const planets = [];
  let a = 0.35 + rng() * 0.25;
  for (let i = 0; i < n; i++) {
    const inner = a < hz.out * 1.4;
    const cls = inner
      ? PLANET_CLASSES[Math.floor(rng() * 4)]
      : PLANET_CLASSES[3 + Math.floor(rng() * 3)];
    const atmosphere = cls.id === 'gas-giant' || cls.id === 'ice-giant'
      ? 'thick'
      : ATMOSPHERES[Math.floor(rng() * ATMOSPHERES.length)];
    planets.push(derivePlanet({
      name: `${system.name} ${ROMAN[i] || i + 1}`,
      class: cls.id,
      radius: Number((cls.radius * (0.75 + rng() * 0.5)).toFixed(2)),
      mass: Number((cls.mass * (0.6 + rng() * 0.9)).toFixed(2)),
      atmosphere,
      rotationHours: Math.round(8 + rng() * 60),
      orbitAU: Number(a.toFixed(2)),
      rings: cls.id === 'gas-giant' ? rng() < 0.6 : rng() < 0.08,
      moons: cls.id === 'gas-giant' || cls.id === 'ice-giant'
        ? 2 + Math.floor(rng() * 8)
        : Math.floor(rng() * 3),
    }, system));
    a *= 1.55 + rng() * 0.45;
  }
  return planets;
}

/* Build a full stellar system. opts.stars = [{type, ageYr?}...]; everything
   dependent (HZ, orbits, belt, comets, moons) is auto-generated. */
export function createSystem(opts, rng = Math.random) {
  const stars = (opts.stars && opts.stars.length ? opts.stars : [{ type: 'G' }]).slice(0, 3).map(s => {
    const base = starByType(s.type);
    return {
      type: base.id,
      name: base.name,
      tempK: Math.round(s.tempK ?? base.tempK),
      luminosity: Number((s.luminosity ?? base.luminosity).toFixed(3)),
      massSuns: base.massSuns,
      ageYr: s.ageYr ?? Math.min(base.lifeYr * 0.4, 4.6e9),
      lifeYr: base.lifeYr,
      color: base.color,
    };
  });
  const system = {
    id: opts.id || `sys-${Math.floor(rng() * 1e9).toString(36)}-${Math.floor(rng() * 1e6)}`,
    name: opts.name || 'Unnamed System',
    pos: opts.pos || [0, 0, 0],
    stars,
    planets: [],
    belt: rng() < 0.55,
    comets: 2 + Math.floor(rng() * 6),
  };
  system.habitableZone = habitableZone(systemLuminosity(system));
  system.planets = generatePlanets(system, rng, opts.planetCount ?? null);
  return system;
}

/* URL slug for a system name. Names like "Andromeda A-1" are unique within a
   galaxy, so the slug is unique per save. Used by the /#/creator/{slug} route. */
export function systemSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function findSystemBySlug(systems, slug) {
  return systems.find(s => systemSlug(s.name) === slug) || null;
}

export function planetColor(planet) {
  switch (planet.class) {
    case 'gas-giant': return 0xd8b28a;
    case 'ice-giant': return 0x9fd4e8;
    case 'ocean': return 0x3f7fd4;
    case 'lava': return 0xe86840;
    case 'super-earth': return 0x7fae6f;
    case 'dwarf': return 0xa9a29a;
    default: return planet.habitable ? 0x5f9e63 : 0xb0876a;
  }
}

/* Display geometry for the dedicated system view — the scene you fly into,
   not the thumbnail-sized detail meshes drawn inside the galaxy. Pure so the
   framing and ordering guarantees can be unit tested. */
export function systemViewLayout(system) {
  const stars = system.stars.map((star, i) => ({
    color: star.color,
    radius: 1.2 + Math.log10(Math.max(star.luminosity, 0.01) + 1.2) * 0.9,
    offset: i * 3.4,
  }));
  const starRadius = Math.max(...stars.map(s => s.radius));
  // Orbits are log-compressed: a 0.4 AU lava world and a 40 AU ice giant both
  // stay reachable without the inner system collapsing onto the star.
  const orbitOf = au => starRadius * 2.2 + Math.log10(1 + Math.max(au, 0) * 9) * 11;
  // Bodies are deliberately oversized against their orbits. At true scale a
  // whole system in frame renders every planet sub-pixel.
  const planets = system.planets.map(planet => {
    // Seeded off the ids so a world keeps the same moons across rebuilds.
    const moonList = generateMoons(planet, seededRng(`${system.id}:${planet.name}`));
    return {
      name: planet.name,
      class: planet.class,
      atmosphere: planet.atmosphere,
      radius: Math.min(0.5 + planet.radius * 0.35, starRadius * 0.9),
      orbit: orbitOf(planet.orbitAU),
      periodDays: Math.max(planet.periodDays, 10),
      moons: moonList.length,        // the roster is the only moon count
      moonList,
      rings: !!planet.rings,
      habitable: !!planet.habitable,
      color: planetColor(planet),
    };
  });
  const hz = system.habitableZone;
  const belt = system.belt ? orbitOf(hz.out * 2.4) : null;
  const edge = Math.max(planets.length ? planets[planets.length - 1].orbit : orbitOf(hz.out), belt ?? 0);
  return {
    stars,
    starRadius,
    planets,
    belt,
    comets: system.comets,
    habitableZone: { in: orbitOf(hz.in), out: orbitOf(hz.out) },
    edge,
    // Far enough back that the outermost orbit clears the frustum with margin.
    framing: edge * 1.5 + starRadius * 4,
  };
}

export const OBJECT_KINDS = [
  { id: 'nebula', name: 'Nebula', desc: 'A luminous cradle of gas and dust where stars ignite.', color: '#e88ad2', scale: 8 },
  { id: 'blackHole', name: 'Black Hole', desc: 'Collapsed spacetime; nothing that crosses the horizon returns.', color: '#7fb2ff', scale: 3 },
  { id: 'pulsar', name: 'Pulsar', desc: 'A spinning neutron star sweeping lighthouse beams across space.', color: '#9fe8ff', scale: 2.4 },
  { id: 'neutronStar', name: 'Neutron Star', desc: 'A city-sized stellar corpse denser than an atomic nucleus.', color: '#cfe4ff', scale: 2 },
  { id: 'whiteDwarf', name: 'White Dwarf', desc: 'The slowly cooling ember of a sun-like star.', color: '#f2f4ff', scale: 1.8 },
  { id: 'globularCluster', name: 'Globular Cluster', desc: 'Hundreds of thousands of ancient stars bound in a sphere.', color: '#ffd9a8', scale: 6 },
  { id: 'openCluster', name: 'Open Cluster', desc: 'A loose family of young stars drifting apart.', color: '#bcd6ff', scale: 5 },
  { id: 'snRemnant', name: 'Supernova Remnant', desc: 'The expanding shockwave of a star that died in fire.', color: '#ffb3a0', scale: 7 },
  { id: 'quasar', name: 'Quasar', desc: 'A feeding supermassive black hole outshining its whole galaxy.', color: '#d3b6ff', scale: 4 },
];

export function objectKind(id) {
  return OBJECT_KINDS.find(k => k.id === id) || null;
}

/* Encyclopedia — entries unlock when the matching thing is created, placed,
   scanned, or witnessed. */
export const ENCYCLOPEDIA = [
  { id: 'galaxy-spiral', title: 'Spiral Galaxy', body: 'Rotating disks whose density waves shepherd stars into luminous arms. Most bright galaxies, like the Milky Way, are spirals.' },
  { id: 'galaxy-barred', title: 'Barred Spiral Galaxy', body: 'A stellar bar funnels gas through the core, feeding starbirth and the central black hole.' },
  { id: 'galaxy-elliptical', title: 'Elliptical Galaxy', body: 'Smooth spheroids of ancient stars on chaotic orbits, usually built by galactic mergers.' },
  { id: 'galaxy-lenticular', title: 'Lenticular Galaxy', body: 'A disk galaxy that spent its gas: armless, quiet, halfway to elliptical.' },
  { id: 'galaxy-irregular', title: 'Irregular Galaxy', body: 'Shapeless and gas-rich, often distorted by neighbors, ablaze with young blue stars.' },
  { id: 'galaxy-ring', title: 'Ring Galaxy', body: 'Born when a compact galaxy punches through a disk, splashing stars into a ring.' },
  { id: 'star-O', title: 'O-Type Star', body: 'The rarest, hottest stars — blue, colossal, and doomed to explode within a few million years.' },
  { id: 'star-G', title: 'G-Type Star', body: 'Yellow dwarfs like the Sun: stable ten-billion-year engines that can nurture life.' },
  { id: 'star-M', title: 'M-Type Star', body: 'Dim red dwarfs; the most common stars, burning for trillions of years.' },
  { id: 'habitable', title: 'Habitable World', body: 'A rocky planet with air and liquid water, orbiting inside its star’s temperate zone.' },
  { id: 'nebula', title: 'Nebula', body: 'Clouds of gas and dust: stellar nurseries lit from within by newborn suns.' },
  { id: 'blackHole', title: 'Black Hole', body: 'Gravity’s endpoint. Stellar black holes come from supernovae; supermassive ones anchor galaxies.' },
  { id: 'pulsar', title: 'Pulsar', body: 'A magnetized neutron star spinning up to hundreds of times a second, ticking like a cosmic clock.' },
  { id: 'neutronStar', title: 'Neutron Star', body: 'A sun’s worth of matter crushed into a sphere the size of a city.' },
  { id: 'whiteDwarf', title: 'White Dwarf', body: 'The exposed core of a dead star, held up by quantum pressure alone.' },
  { id: 'globularCluster', title: 'Globular Cluster', body: 'Ancient spherical swarms of stars orbiting the galactic halo since before the disk formed.' },
  { id: 'openCluster', title: 'Open Cluster', body: 'Young stars born together that will scatter around the galaxy within a few hundred million years.' },
  { id: 'snRemnant', title: 'Supernova Remnant', body: 'Debris of a stellar explosion, seeding space with the heavy elements life requires.' },
  { id: 'quasar', title: 'Quasar', body: 'An accreting supermassive black hole so bright it is visible across the universe.' },
  { id: 'event-supernova', title: 'Supernova', body: 'The core-collapse death of a massive star, briefly outshining its entire galaxy.' },
  { id: 'event-grb', title: 'Gamma-Ray Burst', body: 'The most violent explosions known: collapsing hypergiants firing relativistic jets.' },
  { id: 'event-bhMerger', title: 'Black Hole Merger', body: 'Two black holes spiraling together, shaking spacetime with gravitational waves.' },
  { id: 'event-collision', title: 'Galaxy Collision', body: 'Galaxies pass through each other, tides shredding arms until a single elliptical remains.' },
  { id: 'event-cometShower', title: 'Comet Shower', body: 'A gravitational nudge sends icy bodies raining through a stellar system.' },
];

export function encyclopediaEntry(id) {
  return ENCYCLOPEDIA.find(e => e.id === id) || null;
}
