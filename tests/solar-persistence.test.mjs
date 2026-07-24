import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_KEY, SAVE_VERSION, sanitizeState, serializeState, deserializeState, createStore,
  encodeShare, decodeShare,
} from '../src/pages/solar/persistence.js';

const sample = () => ({
  savedAt: 123,
  galaxy: 2,
  simDays: 4015.5,
  timeScale: 100,
  cam: { pos: [0, 85, 235], target: [1, 2, 3] },
  toggles: { collisions: false, eclipses: true, showTrails: true },
  log: [
    { day: 10, galaxy: 2, type: 'spawn', props: { pos: [1, 0, 0], vel: [0, 1, 0], a: 60, e: 0.7, comet: true, color: '#4af' } },
    { day: 20, galaxy: 2, type: 'blackhole', props: { pos: [5, 0, 0], massSuns: 300 } },
  ],
});

test('round-trips a valid snapshot losslessly through JSON', () => {
  const s = sanitizeState(sample());
  const back = deserializeState(serializeState(s));
  assert.deepEqual(back, s);
});

test('stamps the current version and keeps whitelisted toggles only', () => {
  const s = sanitizeState({ ...sample(), toggles: { collisions: true, bogus: 'x' } });
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.toggles.collisions, true);
  assert.ok(!('bogus' in s.toggles));
});

test('coerces junk to safe defaults instead of throwing', () => {
  const s = sanitizeState({ galaxy: 'nope', simDays: NaN, timeScale: -5, cam: null, log: 'x' });
  assert.equal(s.galaxy, 0);
  assert.equal(s.simDays, 0);
  assert.equal(s.timeScale, 0); // clamped to [0,1e6]
  assert.deepEqual(s.cam, { pos: [0, 0, 0], target: [0, 0, 0] });
  assert.deepEqual(s.log, []);
});

test('sanitizes event props and drops unknown fields / bad entries', () => {
  const s = sanitizeState({ log: [
    { day: 1, type: 'spawn', props: { pos: [1, 2, 3], vel: 'bad', evil: 'drop', mass: 4 } },
    'garbage',
    null,
  ] });
  assert.equal(s.log.length, 1);
  assert.deepEqual(s.log[0].props.pos, [1, 2, 3]);
  assert.deepEqual(s.log[0].props.vel, [0, 0, 0]); // bad vel -> zero vec
  assert.equal(s.log[0].props.mass, 4);
  assert.ok(!('evil' in s.log[0].props));
});

test('caps log length at 500', () => {
  const log = Array.from({ length: 600 }, (_, i) => ({ day: i, type: 'spawn', props: {} }));
  assert.equal(sanitizeState({ log }).log.length, 500);
});

test('deserialize rejects a newer save version', () => {
  assert.throws(() => deserializeState(JSON.stringify({ version: SAVE_VERSION + 1 })), /newer version/);
});

test('createStore save/list/load/remove against a stub storage', () => {
  const mem = new Map();
  const storage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
  };
  const store = createStore(storage);

  assert.equal(store.save('Alpha', { ...sample(), savedAt: 1 }), true);
  assert.equal(store.save('Beta', { ...sample(), savedAt: 2 }), true);
  assert.ok(mem.has(STORE_KEY));

  const slots = store.listSlots();
  assert.deepEqual(slots.map(s => s.name), ['Beta', 'Alpha']); // newest first

  const loaded = store.load('Alpha');
  assert.equal(loaded.galaxy, 2);
  assert.equal(store.load('missing'), null);

  store.remove('Alpha');
  assert.deepEqual(store.listSlots().map(s => s.name), ['Beta']);
});

test('encodeShare/decodeShare round-trips through a URL-safe param', () => {
  const s = sanitizeState(sample());
  const param = encodeShare(s);
  assert.equal(typeof param, 'string');
  assert.ok(!/[#&?=]/.test(param)); // safe to drop into a query string
  assert.deepEqual(decodeShare(param), s);
});

test('decodeShare throws on corrupt input', () => {
  assert.throws(() => decodeShare('not-valid-json'));
});

test('createStore degrades to empty on unreadable storage', () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
  const store = createStore(storage);
  assert.deepEqual(store.listSlots(), []);
  assert.equal(store.load('x'), null);
});
