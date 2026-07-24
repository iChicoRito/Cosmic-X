// Save/load plumbing for the Solar sandbox. Pure — storage is injected so node
// tests can pass a stub. Mirrors creator/persistence.js (versioned key, try/catch,
// sanitize on load). The snapshot is produced/consumed by the runtime; this module
// only validates shape and owns the localStorage slot store.

export const STORE_KEY = 'cosmicx.solar.v1';
export const SAVE_VERSION = 1;

const TOGGLE_KEYS = [
  'collisions', 'eclipses', 'autoNEAs',
  'showTrails', 'showLabels', 'showBelt', 'showNebulas',
];
// Whitelisted interaction-event props (see runtime replayInteraction). Anything
// else is dropped — the log is replayed into spawn calls, so keep it tight.
const NUM_PROPS = ['a', 'e', 'size', 'mass', 'massSuns', 'targetIndex'];
const BOOL_PROPS = ['comet', 'nea', 'projectile', 'lockOn'];

const num = (v, def, lo = -Infinity, hi = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const vec3 = v => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map(Number) : [0, 0, 0]);

function sanitizeProps(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const p = { pos: vec3(src.pos), vel: vec3(src.vel) };
  for (const k of NUM_PROPS) if (Number.isFinite(Number(src[k]))) p[k] = Number(src[k]);
  for (const k of BOOL_PROPS) if (typeof src[k] === 'boolean') p[k] = src[k];
  if (typeof src.color === 'string') p.color = src.color.slice(0, 16);
  return p;
}

function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'blackhole' ? 'blackhole' : 'spawn';
  return {
    day: num(raw.day, 0),
    galaxy: Math.round(num(raw.galaxy, 0, 0, 1000)),
    type,
    props: sanitizeProps(raw.props),
  };
}

/* Runtime snapshot -> plain serializable object (also validates shape). */
export function sanitizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const cam = src.cam && typeof src.cam === 'object' ? src.cam : {};
  const toggles = {};
  const rawToggles = src.toggles && typeof src.toggles === 'object' ? src.toggles : {};
  for (const k of TOGGLE_KEYS) if (typeof rawToggles[k] === 'boolean') toggles[k] = rawToggles[k];
  return {
    version: SAVE_VERSION,
    savedAt: num(src.savedAt, Date.now(), 0),
    galaxy: Math.round(num(src.galaxy, 0, 0, 1000)),
    simDays: num(src.simDays, 0),
    timeScale: num(src.timeScale, 10, 0, 1e6),
    cam: { pos: vec3(cam.pos), target: vec3(cam.target) },
    toggles,
    log: (Array.isArray(src.log) ? src.log : []).slice(0, 500).map(sanitizeEvent).filter(Boolean),
  };
}

export function serializeState(state) {
  return JSON.stringify(sanitizeState(state));
}

export function deserializeState(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid save data');
  if (Number(parsed.version) > SAVE_VERSION) throw new Error('Save is from a newer version');
  return sanitizeState(parsed);
}

// ponytail: URI-encoded JSON in the URL query. Fine for a toy; swap in base64+LZ
// if shared links start bumping browser URL length limits.
export function encodeShare(state) {
  return encodeURIComponent(serializeState(state));
}

export function decodeShare(param) {
  return deserializeState(decodeURIComponent(String(param)));
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
        .map(([name, state]) => ({ name, savedAt: Number(state?.savedAt) || 0 }))
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
