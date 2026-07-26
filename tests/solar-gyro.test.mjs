import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGyroTracker, gyroSupported, orientationToYawPitch, wrapAngle } from '../src/pages/solar/gyro.js';

const stubWindow = (hasEvent, coarse) => ({
  ...(hasEvent ? { DeviceOrientationEvent: function () {} } : {}),
  matchMedia: (q) => ({ matches: coarse && q === '(pointer: coarse)' }),
});

test('gyroSupported needs both the API and a coarse pointer', () => {
  assert.equal(gyroSupported(stubWindow(true, true)), true);
  assert.equal(gyroSupported(stubWindow(true, false)), false, 'desktop Chrome has the API, no sensor');
  assert.equal(gyroSupported(stubWindow(false, true)), false);
  assert.equal(gyroSupported({}), false);
  assert.equal(gyroSupported(null), false);
});

test('wrapAngle normalizes into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(0)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 2)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
  // the whole point: crossing the seam must take the short way round
  assert.ok(Math.abs(wrapAngle(Math.PI - 0.1 - (-Math.PI + 0.1)) - (-0.2)) < 1e-9);
  for (const a of [-7, -3.5, -0.2, 0.4, 3.5, 12]) {
    const w = wrapAngle(a);
    assert.ok(w > -Math.PI - 1e-9 && w <= Math.PI + 1e-9, `${a} -> ${w}`);
    assert.ok(Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9 && Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9);
  }
});

test('a pure compass sweep turns yaw and leaves pitch alone', () => {
  const upright = { alpha: 0, beta: 90, gamma: 0 }; // phone held vertical, facing forward
  const base = orientationToYawPitch(upright);
  const turned = orientationToYawPitch({ ...upright, alpha: 40 });
  assert.ok(Math.abs(turned.pitch - base.pitch) < 1e-6, 'pitch must not drift on a compass turn');
  const dYaw = Math.abs(wrapAngle(turned.yaw - base.yaw));
  assert.ok(Math.abs(dYaw - 40 * Math.PI / 180) < 1e-6, `expected a 40deg yaw change, got ${dYaw}`);
});

test('tilting the phone back and forth moves pitch', () => {
  const up = orientationToYawPitch({ alpha: 0, beta: 120, gamma: 0 });
  const level = orientationToYawPitch({ alpha: 0, beta: 90, gamma: 0 });
  const down = orientationToYawPitch({ alpha: 0, beta: 60, gamma: 0 });
  assert.ok(up.pitch > level.pitch && level.pitch > down.pitch, `${up.pitch} > ${level.pitch} > ${down.pitch}`);
  assert.ok(Math.abs(level.pitch) < 1e-6, 'a vertical phone is the neutral pitch');
  assert.ok(Math.abs(down.pitch + 30 * Math.PI / 180) < 1e-6, `expected -30deg, got ${down.pitch}`);
});

test('holding the same pose in landscape gives the same view (roll is irrelevant)', () => {
  // Same heading, same aim, phone rolled 90deg onto its side. Because roll is dropped,
  // no screen-orientation correction is needed for the look direction to agree.
  const portrait = orientationToYawPitch({ alpha: 30, beta: 90, gamma: 0 });
  const landscape = orientationToYawPitch({ alpha: 120, beta: 0, gamma: -90 });
  assert.ok(Math.abs(wrapAngle(landscape.yaw - portrait.yaw)) < 1e-6, `${landscape.yaw} vs ${portrait.yaw}`);
  assert.ok(Math.abs(landscape.pitch - portrait.pitch) < 1e-6);
});

test('every reading yields finite angles, even a garbage one', () => {
  for (const reading of [{}, null, undefined, { alpha: null, beta: undefined, gamma: 'x' }]) {
    const r = orientationToYawPitch(reading);
    assert.ok(Number.isFinite(r.yaw) && Number.isFinite(r.pitch), JSON.stringify(r));
  }
});

test('the tracker zeroes on the first reading, then reports deltas', () => {
  const tracker = createGyroTracker();
  assert.equal(tracker.samples, 0);

  const first = tracker.feed({ alpha: 137, beta: 71, gamma: 0 });
  assert.equal(tracker.samples, 1);
  assert.ok(Math.abs(first.yaw) < 1e-9 && Math.abs(first.pitch) < 1e-9, 'enabling must not snap the view');

  const second = tracker.feed({ alpha: 167, beta: 71, gamma: 0 });
  assert.equal(tracker.samples, 2);
  assert.ok(Math.abs(Math.abs(second.yaw) - 30 * Math.PI / 180) < 1e-6, `got ${second.yaw}`);
  assert.ok(Math.abs(second.pitch) < 1e-6);
});

test('a drag nudge re-aims the rest pose instead of fighting the sensor', () => {
  const tracker = createGyroTracker();
  const reading = { alpha: 10, beta: 80, gamma: 0 };
  tracker.feed(reading);

  tracker.nudge(0.5, 0.25);
  assert.ok(Math.abs(tracker.target.yaw - 0.5) < 1e-9);
  assert.ok(Math.abs(tracker.target.pitch - 0.25) < 1e-9);

  // the same reading now resolves to the nudged pose, not back to zero
  const after = tracker.feed(reading);
  assert.ok(Math.abs(after.yaw - 0.5) < 1e-6, `got ${after.yaw}`);
  assert.ok(Math.abs(after.pitch - 0.25) < 1e-6, `got ${after.pitch}`);
});

test('tracker yaw stays wrapped across the +/-PI seam', () => {
  const tracker = createGyroTracker();
  tracker.feed({ alpha: 0, beta: 90, gamma: 0 });
  for (const alpha of [45, 90, 135, 180, 225, 270, 315, 359]) {
    const t = tracker.feed({ alpha, beta: 90, gamma: 0 });
    assert.ok(t.yaw > -Math.PI - 1e-9 && t.yaw <= Math.PI + 1e-9, `alpha ${alpha} -> ${t.yaw}`);
  }
});

test('the smoothing law converges without overshooting', () => {
  // mirrors the free-flight lerp in runtime.js: k = 1 - exp(-dt * 12)
  const step = (current, target, dt) => current + wrapAngle(target - current) * (1 - Math.exp(-dt * 12));
  let yaw = 0;
  const target = 1;
  const path = [];
  for (let i = 0; i < 40; i += 1) { yaw = step(yaw, target, 1 / 60); path.push(yaw); }
  assert.ok(path[0] > 0 && path[0] < 0.25, `first step must be partial, got ${path[0]}`);
  for (let i = 1; i < path.length; i += 1) assert.ok(path[i] > path[i - 1] && path[i] <= target);
  assert.ok(target - yaw < 0.01, `should have converged, ${yaw}`);
});
