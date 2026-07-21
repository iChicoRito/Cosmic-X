import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSolarCycle, effectiveVolume, sceneForPath } from '../src/audio-helpers.js';

test('maps route paths to music scenes', () => {
  assert.equal(sceneForPath('/'), 'lobby');
  assert.equal(sceneForPath('/modes'), 'lobby');
  assert.equal(sceneForPath('/solar-system'), 'solar');
  assert.equal(sceneForPath('/creator'), 'solar');
  assert.equal(sceneForPath('/creator/kepler-a-1'), 'solar');
  assert.equal(sceneForPath('/big-bang'), 'big-bang');
  assert.equal(sceneForPath('/whatever'), 'lobby');
});

test('master and background volumes multiply, clamped to 0..1', () => {
  assert.equal(effectiveVolume(0.5, 0.5), 0.25);
  assert.equal(effectiveVolume(1, 1), 1);
  assert.equal(effectiveVolume(2, 0.5), 0.5);
  assert.equal(effectiveVolume(-1, 0.5), 0);
  assert.equal(effectiveVolume('x', 0.5), 0);
});

test('solar cycle is a full shuffle with a random starting track', () => {
  const playlist = ['a', 'b', 'c', 'd', 'e'];
  const firsts = new Set();
  for (let i = 0; i < 50; i++) {
    const cycle = buildSolarCycle(playlist);
    assert.equal(cycle.length, 5);
    assert.deepEqual([...cycle].sort(), [...playlist].sort(), 'every track exactly once');
    firsts.add(cycle[0]);
  }
  // P(same first track 50 times) = 0.2^49 — effectively impossible
  assert.ok(firsts.size > 1, 'starting track must vary between cycles');
  assert.deepEqual(buildSolarCycle(['only']), ['only']);
  assert.deepEqual(buildSolarCycle([]), []);
});
