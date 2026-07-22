import test from 'node:test';
import assert from 'node:assert/strict';

import {
  J2000_MS,
  SIM_DAY_LIMIT,
  clampSimDays,
  formatElapsedDays,
  formatUtcDate,
  formatUtcTime,
  simDateFromDays,
  simDaysFromDate,
} from '../src/pages/solar/timeline.js';
import { closestApproach, wormholeTransit } from '../src/pages/solar/dynamics.js';
import {
  createEpochModel,
  epochIndexAt,
  epochProgressAt,
  epochStartAt,
} from '../src/pages/big-bang/timeline.js';

test('Solar time helpers preserve J2000 conversion and clamping', () => {
  assert.equal(simDateFromDays(0).getTime(), J2000_MS);
  assert.equal(simDaysFromDate(new Date(J2000_MS + 86400000)), 1);
  assert.equal(clampSimDays(SIM_DAY_LIMIT + 1), SIM_DAY_LIMIT);
  assert.equal(formatUtcDate(new Date(J2000_MS)), '2000-01-01');
  assert.equal(formatUtcTime(new Date(J2000_MS)), '12:00:00 UTC');
  assert.equal(formatElapsedDays(-1.25), '-1.25 days');
});

test('closest-approach helper reports impacts and ignores separating bodies', () => {
  const target = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    radius: 1,
  };
  const incoming = {
    position: { x: 10, y: 0, z: 0 },
    velocity: { x: -1, y: 0, z: 0 },
    radius: 1,
  };
  const departing = { ...incoming, velocity: { x: 1, y: 0, z: 0 } };

  assert.deepEqual(closestApproach(incoming, target, 20), {
    eta: 6.75,
    distance: 0,
    closestTime: 10,
  });
  assert.equal(closestApproach(departing, target, 20), null);
});

test('wormhole transit catches swept crossings and mirrors the exit', () => {
  const transit = wormholeTransit(
    { x: 10, y: 0, z: 0 },
    { x: -10, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    2,
    5,
    2,
  );

  assert.deepEqual(transit, {
    position: { x: -5, y: 0, z: 0 },
    velocity: { x: -2, y: 0, z: 0 },
  });
});

test('wormhole transit ignores swept paths outside the throat', () => {
  assert.equal(wormholeTransit(
    { x: 10, y: 3, z: 0 },
    { x: -10, y: 3, z: 0 },
    { x: -1, y: 0, z: 0 },
    2,
    5,
    1,
  ), null);
});

test('wormhole transit falls back to velocity at the center without invalid output', () => {
  const transit = wormholeTransit(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -2 },
    2,
    5,
    1,
  );

  assert.deepEqual(transit, {
    position: { x: 0, y: 0, z: -5 },
    velocity: { x: 0, y: 0, z: -2 },
  });
  assert.equal(wormholeTransit(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    2,
    5,
    1,
  ), null);
});

test('Big Bang epoch helpers expose normalized boundaries and fresh models', () => {
  const first = createEpochModel();
  const second = createEpochModel();

  assert.equal(first.EPOCHS.length, 11);
  assert.notEqual(first.EPOCHS, second.EPOCHS);
  assert.equal(epochIndexAt(first.EPOCHS, 0), 0);
  assert.equal(epochIndexAt(first.EPOCHS, 1), 10);
  assert.equal(epochProgressAt(first.EPOCHS, first.EPOCHS[1].u0), 0);
  assert.equal(epochStartAt(first.EPOCHS, 999), first.EPOCHS.at(-1).u0);
  assert.equal(first.envAt(0), first.envAt(0));
  assert.notEqual(first.envAt(0), second.envAt(0));
});
