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
import * as bigBangTimeline from '../src/pages/big-bang/timeline.js';

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

test('Big Bang timeline matches the eleven Task 24 chapters', () => {
  const { EPOCHS } = createEpochModel();

  assert.deepEqual(EPOCHS.map(({ id, label, timeLabel, span }) => ({ id, label, timeLabel, span })), [
    { id: 'bigbang', label: 'The Big Bang', timeLabel: '0 seconds', span: 9 },
    { id: 'primordial', label: 'The Primordial Universe', timeLabel: 'The first few minutes', span: 10 },
    { id: 'recombination', label: 'Recombination and the First Light', timeLabel: 'Approximately 380,000 years after the Big Bang', span: 8 },
    { id: 'darkages', label: 'The Cosmic Dark Ages', timeLabel: 'Approximately 380,000 to 200 million years after the Big Bang', span: 9 },
    { id: 'firststars', label: 'The First Stars', timeLabel: 'Approximately 200 million years after the Big Bang', span: 9 },
    { id: 'firstgalaxies', label: 'The First Galaxies', timeLabel: 'Approximately 400 million years after the Big Bang', span: 9 },
    { id: 'galaxyevolution', label: 'Galaxy Evolution', timeLabel: 'Approximately 1 to 5 billion years after the Big Bang', span: 10 },
    { id: 'solar', label: 'Birth of the Solar System', timeLabel: 'Approximately 9.2 billion years after the Big Bang, or 4.6 billion years ago', span: 10 },
    { id: 'life', label: 'Earth and the Rise of Life', timeLabel: 'Approximately 4.5 to 3.5 billion years ago', span: 8 },
    { id: 'modern', label: 'The Modern Universe', timeLabel: 'Present day, approximately 13.8 billion years after the Big Bang', span: 7 },
    { id: 'future', label: 'The Distant Future', timeLabel: 'Trillions to more than 10¹⁰⁰ years into the future', span: 11 },
  ]);
  assert.equal(EPOCHS.reduce((sum, epoch) => sum + epoch.span, 0), 100);
  assert.deepEqual([...EPOCHS.map(epoch => epoch.u0), EPOCHS.at(-1).u1], [
    0, 0.09, 0.19, 0.27, 0.36, 0.45, 0.54, 0.64, 0.74, 0.82, 0.89, 1,
  ]);
});

test('Big Bang dossier badges use compact presentation copy', () => {
  const { EPOCHS } = createEpochModel();
  assert.deepEqual(EPOCHS.map(epoch => epoch.badgeLabel), [
    'Instant zero', 'First minutes', '380,000 years', '380,000–200M years',
    '200M years', '400M years', '1–5B years', '9.2B years',
    '4.5–3.5B years ago', 'Present day', 'Trillions+',
  ]);
  assert.deepEqual(EPOCHS.at(-1).beats.map(beat => beat.badgeLabel), [
    '≤10¹⁴ years', '10¹⁴–10⁴⁰ years', '10⁴⁰–10¹⁰⁰ years', 'Beyond 10¹⁰⁰ years',
  ]);
  for (const record of EPOCHS.flatMap(epoch => [epoch, ...(epoch.beats || [])])) {
    assert.ok(record.badgeLabel.length <= 24);
  }
  const solar = EPOCHS.find(epoch => epoch.id === 'solar');
  assert.deepEqual(
    { badgeLabel: solar.badgeLabel, badgeDetail: solar.badgeDetail },
    { badgeLabel: '9.2B years', badgeDetail: '4.6B years ago' },
  );
});

test('Big Bang camera rail and environment stay continuous and finite', () => {
  const model = createEpochModel();

  for (let index = 0; index < model.EPOCHS.length - 1; index++) {
    assert.deepEqual(model.EPOCHS[index].cam.to, model.EPOCHS[index + 1].cam.from);
  }
  for (let step = 0; step <= 100; step++) {
    const env = model.envAt(step / 100);
    for (const value of Object.values(env).flat()) assert.ok(Number.isFinite(value));
  }
});

test('Distant Future contains the four ordered scientific eras', () => {
  const future = createEpochModel().EPOCHS.at(-1);
  assert.deepEqual(future.beats?.map(beat => beat.label), [
    'Stelliferous Era',
    'Degenerate Era',
    'Black Hole Era',
    'Dark Era / Heat Death',
  ]);
});

test('Big Bang timeline glides are distance-aware, bounded, and motion-safe', () => {
  assert.equal(typeof bigBangTimeline.glideDuration, 'function');
  if (typeof bigBangTimeline.glideDuration !== 'function') return;

  assert.equal(bigBangTimeline.glideDuration(0.5, 0.5), 0.8);
  assert.equal(bigBangTimeline.glideDuration(0, 0.25), 1.4);
  assert.equal(bigBangTimeline.glideDuration(0, 1), 2.4);
  assert.equal(bigBangTimeline.glideDuration(0, 1, true), 0);
});

test('Big Bang Phase 1 holds for three seconds before visual expansion', () => {
  const { EPOCHS } = createEpochModel();
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, 0), 0);
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, 3 / 90), 0);
  assert.ok(bigBangTimeline.openingVisualAt(EPOCHS, 4 / 90) > 0);
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, EPOCHS[0].u1), EPOCHS[0].u1);
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, EPOCHS[1].u0), EPOCHS[1].u0);
});

test('Distant Future presentation advances through its four eras', () => {
  assert.equal(typeof bigBangTimeline.epochPresentationAt, 'function');
  if (typeof bigBangTimeline.epochPresentationAt !== 'function') return;

  const { EPOCHS } = createEpochModel();
  const future = EPOCHS.at(-1);
  const at = progress => future.u0 + (future.u1 - future.u0) * progress;
  assert.deepEqual([0.05, 0.3, 0.55, 0.8].map(progress =>
    bigBangTimeline.epochPresentationAt(EPOCHS, at(progress)).beatLabel), [
    'Stelliferous Era',
    'Degenerate Era',
    'Black Hole Era',
    'Dark Era / Heat Death',
  ]);
  assert.equal(bigBangTimeline.epochPresentationAt(EPOCHS, EPOCHS[9].u0).beatLabel, '');
});
