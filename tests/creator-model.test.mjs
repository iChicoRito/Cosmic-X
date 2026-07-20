import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GALAXY_TYPES,
  PARAM_DEFS,
  defaultParams,
  sanitizeParams,
  sampleGalaxy,
  renderStarCount,
  estimateTotalStars,
  rotationVelocity,
  angularVelocity,
  mulberry32,
} from '../src/pages/creator/galaxy-model.js';
import {
  SPEEDS,
  BASE_YEARS_PER_SECOND,
  createStats,
  stepEvolution,
  agingTint,
  mergeStats,
  formatYears,
  formatCount,
  speedLabel,
} from '../src/pages/creator/evolution.js';
import {
  STAR_TYPES,
  ATMOSPHERES,
  habitableZone,
  orbitalPeriodDays,
  surfaceGravity,
  planetTempK,
  climateFor,
  isHabitable,
  createSystem,
  derivePlanet,
  OBJECT_KINDS,
  ENCYCLOPEDIA,
  encyclopediaEntry,
  planetColor,
  systemViewLayout,
  ATMOSPHERE_COMPOSITION,
  atmosphereComposition,
  habitabilityScore,
  generateMoons,
  seededRng,
} from '../src/pages/creator/systems.js';
import { tileFbm, fbm } from '../src/shared/procedural-canvas.js';
import {
  STORE_KEY,
  sanitizeState,
  serializeState,
  deserializeState,
  createStore,
} from '../src/pages/creator/persistence.js';

test('galaxy params: defaults are in range and sanitize clamps garbage', () => {
  assert.equal(GALAXY_TYPES.length, 6);
  const params = defaultParams('barred');
  assert.equal(params.type, 'barred');
  for (const [key, def] of Object.entries(PARAM_DEFS)) {
    assert.ok(params[key] >= def.min && params[key] <= def.max, `${key} default in range`);
  }
  const dirty = sanitizeParams({
    type: 'nonsense', name: '   ', seed: -12.7,
    diameter: 99999, arms: 2.6, darkMatter: -50, starDensity: 'NaN',
  });
  assert.equal(dirty.type, 'spiral');
  assert.ok(dirty.name.length > 0);
  assert.equal(dirty.seed, 12);
  assert.equal(dirty.diameter, PARAM_DEFS.diameter.max);
  assert.equal(dirty.arms, 3);
  assert.equal(dirty.darkMatter, PARAM_DEFS.darkMatter.min);
  assert.equal(dirty.starDensity, PARAM_DEFS.starDensity.def);
});

test('sampleGalaxy is deterministic per seed and scales with density', () => {
  const params = { ...defaultParams('spiral'), seed: 12345 };
  const a = sampleGalaxy(params);
  const b = sampleGalaxy(params);
  assert.equal(a.count, b.count);
  assert.deepEqual(Array.from(a.radius.slice(0, 32)), Array.from(b.radius.slice(0, 32)));
  assert.deepEqual(Array.from(a.color.slice(0, 32)), Array.from(b.color.slice(0, 32)));

  const sparse = renderStarCount({ ...params, starDensity: 0.2 });
  const dense = renderStarCount({ ...params, starDensity: 2 });
  assert.ok(dense > sparse * 3);

  const other = sampleGalaxy({ ...params, seed: 54321 });
  assert.notDeepEqual(Array.from(a.radius.slice(0, 32)), Array.from(other.radius.slice(0, 32)));
});

test('sampleGalaxy respects the diameter and type morphology', () => {
  const params = { ...defaultParams('spiral'), seed: 7, diameter: 120 };
  const R = params.diameter / 2;
  const g = sampleGalaxy(params);
  assert.equal(g.R, R);
  let maxR = 0;
  for (let i = 0; i < g.count; i++) maxR = Math.max(maxR, g.radius[i]);
  assert.ok(maxR <= R * 1.35, `halo stays near the disk (${maxR} vs ${R})`);

  // elliptical is thick; spiral disk is thin
  const flatY = [], roundY = [];
  const disk = sampleGalaxy({ ...params, type: 'spiral' });
  const ell = sampleGalaxy({ ...params, type: 'elliptical' });
  for (let i = 0; i < disk.count; i++) flatY.push(Math.abs(disk.height[i]));
  for (let i = 0; i < ell.count; i++) roundY.push(Math.abs(ell.height[i]));
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  assert.ok(mean(roundY) > mean(flatY) * 2.5, 'elliptical is far thicker than a spiral disk');

  // ring type leaves a gap between core and ring
  const ring = sampleGalaxy({ ...params, type: 'ring', coreSize: 0.12 });
  const ringR = R * 0.78;
  let inGap = 0;
  for (let i = 0; i < ring.count; i++) {
    const r = ring.radius[i];
    if (r > R * 0.3 && r < R * 0.55) inGap++;
  }
  assert.ok(inGap / ring.count < 0.12, `ring gap is sparse (${(inGap / ring.count).toFixed(3)})`);
});

test('rotation curve: dark matter flattens, mass and spin raise speeds', () => {
  const base = defaultParams('spiral');
  const R = base.diameter / 2;
  const dmHeavy = { ...base, darkMatter: 95 };
  const dmNone = { ...base, darkMatter: 0 };
  const outer = rotationVelocity(R * 0.95, dmHeavy) / rotationVelocity(R * 0.95, dmNone);
  assert.ok(outer > 1.5, 'dark matter keeps outer stars fast');
  assert.ok(rotationVelocity(R * 0.5, { ...base, mass: 8 }) > rotationVelocity(R * 0.5, { ...base, mass: 0.5 }));
  assert.equal(rotationVelocity(R * 0.5, { ...base, rotationSpeed: 0 }), 0);
  assert.ok(angularVelocity(R * 0.2, base) > angularVelocity(R * 0.9, base), 'inner stars sweep faster');
});

test('evolution: births, deaths, remnants and aging behave', () => {
  const params = defaultParams('spiral');
  const stats = createStats(params);
  assert.ok(stats.totalStars > 1e10);
  assert.equal(stats.years, 0);
  const before = { ...stats };

  const rng = mulberry32(9);
  stepEvolution(stats, params, 1e9, rng);
  assert.equal(stats.years, 1e9);
  assert.ok(stats.supernovae > 0, 'a Gyr produces supernovae');
  assert.ok(stats.blackHoles > before.blackHoles, 'supernovae leave black holes');
  assert.ok(stats.neutronStars > before.neutronStars);
  assert.ok(stats.bhMassSuns > before.bhMassSuns, 'central black hole accretes');
  assert.ok(stats.avgStellarAgeYr > before.avgStellarAgeYr, 'population ages');
  assert.ok(stats.gasSupply <= before.gasSupply, 'star formation consumes gas');

  // dead galaxy: zero SFR still ages, star count declines
  const quiet = createStats({ ...params, starFormationRate: 0 });
  const starsBefore = quiet.totalStars;
  stepEvolution(quiet, { ...params, starFormationRate: 0 }, 1e9, rng);
  assert.ok(quiet.totalStars < starsBefore);

  assert.equal(stepEvolution(stats, params, 0, rng).length, 0);
  assert.ok(agingTint(stats) >= 0 && agingTint(stats) <= 1);

  const merged = mergeStats(stats, quiet);
  assert.equal(merged.totalStars, Math.round(stats.totalStars + quiet.totalStars));
  assert.ok(merged.bhMassSuns > stats.bhMassSuns);
});

test('evolution formatting + speed table match the task spec', () => {
  assert.deepEqual(SPEEDS, [1, 2, 10, 100, 1000, 1000000]);
  assert.equal(BASE_YEARS_PER_SECOND, 100);
  assert.equal(speedLabel(1000000), '×1,000,000');
  assert.equal(formatYears(500), '500 yr');
  assert.equal(formatYears(2.5e6), '2.5 Myr');
  assert.equal(formatYears(1.37e10), '13.7 Gyr');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(2.5e11), '250.0B');
});

test('stellar systems: habitable zone, orbits and derived planet physics', () => {
  assert.equal(STAR_TYPES.length, 7);
  const hz = habitableZone(1);
  assert.ok(Math.abs(hz.in - 0.953) < 0.01);
  assert.ok(Math.abs(hz.out - 1.373) < 0.01);
  assert.ok(Math.abs(orbitalPeriodDays(1, 1) - 365.25) < 0.01);
  assert.ok(Math.abs(surfaceGravity(1, 1) - 1) < 1e-9);
  assert.ok(planetTempK(1, 1, 'earthlike') > planetTempK(1, 1, 'none'));
  assert.equal(climateFor(275, 'earthlike'), 'Temperate and mild');

  const rng = mulberry32(42);
  const system = createSystem({ name: 'Testis', pos: [1, 2, 3], stars: [{ type: 'G' }] }, rng);
  assert.equal(system.stars[0].type, 'G');
  assert.ok(system.planets.length >= 2);
  assert.ok(system.habitableZone.out > system.habitableZone.in);
  for (let i = 1; i < system.planets.length; i++) {
    assert.ok(system.planets[i].orbitAU > system.planets[i - 1].orbitAU, 'orbits are ordered');
  }
  for (const p of system.planets) {
    assert.ok(p.periodDays > 0 && p.gravity > 0 && Number.isFinite(p.surfaceTemp));
    assert.equal(typeof p.climate, 'string');
  }

  const earthLike = derivePlanet({
    name: 'Eden', class: 'rocky', radius: 1, mass: 1, atmosphere: 'earthlike',
    rotationHours: 24, orbitAU: 1.1, rings: false, moons: 1,
  }, system);
  assert.equal(earthLike.habitable, true);
  const frozen = derivePlanet({ ...earthLike, orbitAU: 30 }, system);
  assert.equal(frozen.habitable, false);
  assert.equal(isHabitable(frozen, system.habitableZone), false);
});

test('system view layout frames every orbit outside the star', () => {
  const rng = mulberry32(9);
  const system = createSystem({ name: 'Vista', pos: [0, 0, 0], stars: [{ type: 'G' }] }, rng);
  const layout = systemViewLayout(system);

  assert.equal(layout.planets.length, system.planets.length);
  assert.ok(layout.starRadius > 0);

  for (const planet of layout.planets) {
    assert.ok(planet.orbit > layout.starRadius, `${planet.name} orbits outside the star`);
    assert.ok(planet.radius < layout.starRadius, `${planet.name} is smaller than its star`);
    assert.ok(Number.isFinite(planet.color));
  }
  for (let i = 1; i < layout.planets.length; i++) {
    assert.ok(layout.planets[i].orbit > layout.planets[i - 1].orbit, 'orbits stay ordered');
  }

  assert.ok(layout.habitableZone.out > layout.habitableZone.in);
  // The camera must sit back far enough to hold the whole system in frame.
  assert.ok(layout.framing > layout.edge, 'framing distance clears the outermost orbit');
  for (const planet of layout.planets) assert.ok(layout.edge >= planet.orbit);

  // Brighter stars read bigger, and a multi-star system frames wider.
  const bright = systemViewLayout(createSystem(
    { name: 'Blaze', pos: [0, 0, 0], stars: [{ type: 'O' }] }, mulberry32(9)));
  assert.ok(bright.starRadius > layout.starRadius);
  assert.equal(systemViewLayout(createSystem(
    { name: 'Pair', pos: [0, 0, 0], stars: [{ type: 'G' }, { type: 'G' }] }, mulberry32(9))).stars.length, 2);
});

test('planet colors are stable per class and fall back on habitability', () => {
  assert.equal(planetColor({ class: 'ocean' }), 0x3f7fd4);
  assert.equal(planetColor({ class: 'lava' }), 0xe86840);
  assert.equal(planetColor({ class: 'gas-giant' }), planetColor({ class: 'gas-giant' }));
  assert.notEqual(planetColor({ class: 'rocky', habitable: true }), planetColor({ class: 'rocky', habitable: false }));
});

test('tileFbm wraps without a seam so sphere textures have no visible join', () => {
  const W = 512;
  for (const y of [0, 60, 128, 200]) {
    // the left and right edges of the map meet around the back of the planet
    const left = tileFbm(0, y, 40, 7, 4, W);
    const right = tileFbm(W, y, 40, 7, 4, W);
    assert.ok(Math.abs(left - right) < 1e-9, `seam at y=${y}: ${left} vs ${right}`);
  }
  // at x=0 it degenerates to plain fbm, so it is still noise and not a constant
  assert.equal(tileFbm(0, 10, 40, 7, 4, W), fbm(0, 10 / 40, 7, 4));
  assert.notEqual(tileFbm(100, 10, 40, 7, 4, W), tileFbm(220, 10, 40, 7, 4, W));
});

test('atmosphere mixes are complete for every class', () => {
  for (const atmo of ATMOSPHERES) {
    const mix = atmosphereComposition(atmo);
    assert.ok(mix.length >= 1, `${atmo} has gases`);
    const total = mix.reduce((sum, [, fraction]) => sum + fraction, 0);
    assert.ok(Math.abs(total - 1) < 1e-6, `${atmo} sums to 1, got ${total}`);
    for (const [gas, fraction] of mix) {
      assert.equal(typeof gas, 'string');
      assert.ok(fraction > 0 && fraction <= 1);
    }
  }
  assert.equal(Object.keys(ATMOSPHERE_COMPOSITION).length, ATMOSPHERES.length);
  // unknown classes fall back rather than throwing
  assert.deepEqual(atmosphereComposition('nonsense'), ATMOSPHERE_COMPOSITION.none);
});

test('habitability score never contradicts the habitable flag', () => {
  const rng = mulberry32(11);
  const system = createSystem({ name: 'Meter', pos: [0, 0, 0], stars: [{ type: 'G' }] }, rng);
  const hz = system.habitableZone;

  const eden = derivePlanet({
    name: 'Eden', class: 'rocky', radius: 1, mass: 1, atmosphere: 'earthlike',
    rotationHours: 24, orbitAU: (hz.in + hz.out) / 2, rings: false, moons: 1,
  }, system);
  assert.equal(eden.habitable, true);
  const best = habitabilityScore(eden, hz);
  assert.ok(best > 0 && best <= 1, `score in range, got ${best}`);

  // the boolean and the meter agree in both directions
  for (const planet of [
    derivePlanet({ ...eden, orbitAU: 40 }, system),                    // too far
    derivePlanet({ ...eden, atmosphere: 'toxic' }, system),            // wrong air
    derivePlanet({ ...eden, class: 'gas-giant' }, system),             // wrong class
  ]) {
    assert.equal(planet.habitable, false);
    assert.equal(habitabilityScore(planet, hz), 0);
  }

  // a mid-zone world scores at least as well as one scraping the inner edge
  const edge = derivePlanet({ ...eden, orbitAU: hz.in }, system);
  if (edge.habitable) assert.ok(best >= habitabilityScore(edge, hz));
});

test('generated moons are deterministic, ordered and separated', () => {
  const planet = { name: 'Kepler II', moons: 4 };
  const a = generateMoons(planet, seededRng('sys-1:Kepler II'));
  const b = generateMoons(planet, seededRng('sys-1:Kepler II'));
  assert.deepEqual(a, b, 'same key yields the same moons');
  assert.notDeepEqual(a, generateMoons(planet, seededRng('sys-2:Kepler II')));

  assert.equal(a.length, 4);
  assert.equal(new Set(a.map(m => m.name)).size, 4, 'names are distinct');
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i].distance > a[i - 1].distance, 'orbits are ordered outward');
    assert.ok(a[i].distance - a[i - 1].distance > a[i].radius + a[i - 1].radius, 'orbits do not overlap');
  }
  for (const moon of a) {
    assert.ok(moon.name.startsWith('Kepler II '));
    assert.ok(moon.distance > 2 && moon.radius > 0 && moon.periodDays > 0);
    assert.ok(moon.phase >= 0 && moon.phase < Math.PI * 2);
  }
  // every moon generatePlanets can produce (max 9) gets a name
  assert.equal(generateMoons({ name: 'Giant', moons: 9 }, seededRng('x')).length, 9);
  assert.ok(generateMoons({ name: 'Many', moons: 99 }, seededRng('x')).length <= 10);
  assert.deepEqual(generateMoons({ name: 'None', moons: 0 }, seededRng('x')), []);
});

test('system view layout carries what the scene needs to dress a world', () => {
  const system = createSystem({ name: 'Dress', pos: [0, 0, 0], stars: [{ type: 'K' }] }, mulberry32(3));
  const layout = systemViewLayout(system);
  for (const planet of layout.planets) {
    assert.ok(ATMOSPHERES.includes(planet.atmosphere), 'atmosphere class is passed through');
    assert.equal(typeof planet.class, 'string');
    assert.ok(Array.isArray(planet.moonList));
    assert.equal(planet.moonList.length, planet.moons, 'roster length is the moon count');
  }
  // stable across repeated layout calls for the same system
  assert.deepEqual(systemViewLayout(system).planets.map(p => p.moonList),
    layout.planets.map(p => p.moonList));
});

test('object catalog + encyclopedia cover the task list', () => {
  const kinds = OBJECT_KINDS.map(k => k.id);
  for (const required of ['nebula', 'blackHole', 'pulsar', 'neutronStar', 'whiteDwarf',
    'globularCluster', 'openCluster', 'snRemnant', 'quasar']) {
    assert.ok(kinds.includes(required), `object kind ${required}`);
  }
  for (const kind of kinds) assert.ok(encyclopediaEntry(kind), `encyclopedia entry for ${kind}`);
  assert.ok(ENCYCLOPEDIA.length >= 20);
  for (const entry of ENCYCLOPEDIA) {
    assert.ok(entry.id && entry.title && entry.body.length > 20);
  }
});

test('persistence: round-trip, sanitization and slot store', () => {
  assert.equal(STORE_KEY, 'cosmicx.creator.v1');
  const rng = mulberry32(5);
  const state = {
    savedAt: 1700000000000,
    params: { ...defaultParams('ring'), name: 'Halo of Fire', seed: 99 },
    sim: { years: 4.2e9, speedIdx: 3, playing: false },
    stats: createStats(defaultParams('ring')),
    systems: [createSystem({ name: 'Home', pos: [10, 0, -4] }, rng)],
    objects: [{ id: 'obj-1', kind: 'quasar', pos: [5, 1, 2], scale: 2, seed: 7 }],
    discoveries: ['galaxy-ring', 'quasar'],
  };
  const json = serializeState(state);
  const back = deserializeState(json);
  assert.equal(back.params.name, 'Halo of Fire');
  assert.equal(back.params.type, 'ring');
  assert.equal(back.sim.years, 4.2e9);
  assert.equal(back.sim.playing, false);
  assert.equal(back.systems[0].name, 'Home');
  assert.deepEqual(back.systems[0].pos, [10, 0, -4]);
  assert.equal(back.objects[0].kind, 'quasar');
  assert.deepEqual(back.discoveries, ['galaxy-ring', 'quasar']);

  assert.throws(() => deserializeState('not json'));
  assert.throws(() => deserializeState('{"version": 99, "params": {}}'));
  assert.throws(() => deserializeState('{"version": 1}'));
  const cleaned = sanitizeState({ params: { type: 'spiral' }, objects: [{ kind: 'bogus' }] });
  assert.equal(cleaned.objects.length, 0, 'unknown object kinds are dropped');

  const memory = new Map();
  const storage = {
    getItem: k => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
  };
  const store = createStore(storage);
  assert.deepEqual(store.listSlots(), []);
  assert.ok(store.save('slot one', state));
  assert.equal(store.listSlots()[0].galaxyName, 'Halo of Fire');
  assert.equal(store.load('slot one').params.seed, 99);
  assert.equal(store.load('missing'), null);
  store.remove('slot one');
  assert.deepEqual(store.listSlots(), []);

  const broken = createStore({ getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } });
  assert.deepEqual(broken.listSlots(), []);
  assert.equal(broken.save('x', state), false);
});
