// Save/load/export plumbing for the Creator mode. Pure — storage is injected
// so node tests can pass a stub. Pattern follows solar/settings.js
// (versioned key, try/catch, sanitize on load).

import { sanitizeParams } from './galaxy-model.js';
import { SPEEDS } from './evolution.js';
import { OBJECT_KINDS, derivePlanet, habitableZone, systemLuminosity, starByType, ATMOSPHERES, PLANET_CLASSES } from './systems.js';

export const STORE_KEY = 'cosmicx.creator.v1';
export const SAVE_VERSION = 1;

const num = (v, def, lo = -Infinity, hi = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const str = (v, def = '', max = 60) => (typeof v === 'string' ? v.slice(0, max) : def);
const vec3 = v => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map(Number) : [0, 0, 0]);

function sanitizeStar(raw) {
  const base = starByType(raw && raw.type);
  return {
    type: base.id,
    name: base.name,
    tempK: num(raw?.tempK, base.tempK, 500, 60000),
    luminosity: num(raw?.luminosity, base.luminosity, 1e-5, 1e6),
    massSuns: base.massSuns,
    ageYr: num(raw?.ageYr, 4.6e9, 0, 1e13),
    lifeYr: base.lifeYr,
    color: base.color,
  };
}

function sanitizePlanet(raw, system) {
  const cls = PLANET_CLASSES.some(c => c.id === raw?.class) ? raw.class : 'rocky';
  const planet = {
    name: str(raw?.name, 'Planet', 40),
    class: cls,
    radius: num(raw?.radius, 1, 0.05, 30),
    mass: num(raw?.mass, 1, 0.001, 5000),
    atmosphere: ATMOSPHERES.includes(raw?.atmosphere) ? raw.atmosphere : 'none',
    rotationHours: num(raw?.rotationHours, 24, 0.5, 5000),
    orbitAU: num(raw?.orbitAU, 1, 0.05, 200),
    rings: !!raw?.rings,
    moons: Math.round(num(raw?.moons, 0, 0, 30)),
  };
  return derivePlanet(planet, system);
}

function sanitizeSystem(raw) {
  const stars = (Array.isArray(raw?.stars) && raw.stars.length ? raw.stars : [{}]).slice(0, 3).map(sanitizeStar);
  const system = {
    id: str(raw?.id, `sys-${Math.random().toString(36).slice(2, 10)}`, 40),
    name: str(raw?.name, 'Unnamed System', 40),
    pos: vec3(raw?.pos),
    stars,
    planets: [],
    belt: !!raw?.belt,
    comets: Math.round(num(raw?.comets, 3, 0, 30)),
  };
  system.habitableZone = habitableZone(systemLuminosity(system));
  system.planets = (Array.isArray(raw?.planets) ? raw.planets : []).slice(0, 12)
    .map(p => sanitizePlanet(p, system));
  return system;
}

function sanitizeObject(raw) {
  if (!OBJECT_KINDS.some(k => k.id === raw?.kind)) return null;
  return {
    id: str(raw?.id, `obj-${Math.random().toString(36).slice(2, 10)}`, 40),
    kind: raw.kind,
    pos: vec3(raw?.pos),
    scale: num(raw?.scale, 1, 0.1, 40),
    seed: Math.round(num(raw?.seed, 1, 0, 2 ** 31)),
  };
}

/* Full state -> plain serializable object (also validates shape). */
export function sanitizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const stats = src.stats && typeof src.stats === 'object' ? src.stats : {};
  const cleanStats = {};
  for (const [k, v] of Object.entries(stats)) if (Number.isFinite(Number(v))) cleanStats[k] = Number(v);
  return {
    version: SAVE_VERSION,
    savedAt: num(src.savedAt, Date.now(), 0),
    params: sanitizeParams(src.params),
    sim: {
      years: num(src.sim?.years, 0, 0, 1e15),
      speedIdx: Math.round(num(src.sim?.speedIdx, 0, 0, SPEEDS.length - 1)),
      playing: src.sim?.playing !== false,
    },
    stats: cleanStats,
    systems: (Array.isArray(src.systems) ? src.systems : []).slice(0, 60).map(sanitizeSystem),
    objects: (Array.isArray(src.objects) ? src.objects : []).slice(0, 120).map(sanitizeObject).filter(Boolean),
    discoveries: (Array.isArray(src.discoveries) ? src.discoveries : [])
      .filter(d => typeof d === 'string').slice(0, 200),
  };
}

export function serializeState(state) {
  return JSON.stringify(sanitizeState(state));
}

export function deserializeState(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid save data');
  if (Number(parsed.version) > SAVE_VERSION) throw new Error('Save is from a newer version');
  if (!parsed.params || typeof parsed.params !== 'object') throw new Error('Save has no galaxy parameters');
  return sanitizeState(parsed);
}

/* Named save slots inside one localStorage key. */
export function createStore(storage) {
  const readAll = () => {
    try {
      const raw = storage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const writeAll = slots => {
    try {
      storage.setItem(STORE_KEY, JSON.stringify(slots));
      return true;
    } catch {
      return false;
    }
  };
  return {
    listSlots() {
      return Object.entries(readAll())
        .map(([name, state]) => ({ name, savedAt: Number(state?.savedAt) || 0, galaxyName: state?.params?.name || name }))
        .sort((a, b) => b.savedAt - a.savedAt);
    },
    save(name, state) {
      const slots = readAll();
      slots[String(name).slice(0, 40)] = sanitizeState(state);
      return writeAll(slots);
    },
    load(name) {
      const slot = readAll()[name];
      return slot ? sanitizeState(slot) : null;
    },
    remove(name) {
      const slots = readAll();
      delete slots[name];
      return writeAll(slots);
    },
  };
}
