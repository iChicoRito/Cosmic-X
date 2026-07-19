import test from 'node:test';
import assert from 'node:assert/strict';
import { ZODIAC, pickZodiac } from '../src/pages/solar/zodiac.js';

const rngFrom = values => {
  let i = 0;
  return () => {
    assert.ok(i < values.length, 'scripted rng exhausted');
    return values[i++];
  };
};

test('catalogs all twelve zodiac constellations with valid geometry', () => {
  assert.equal(ZODIAC.length, 12);
  assert.deepEqual(
    ZODIAC.map(sign => sign.name),
    ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'],
  );
  assert.equal(new Set(ZODIAC.map(sign => sign.symbol)).size, 12);

  for (const sign of ZODIAC) {
    assert.ok(sign.points.length >= 3, `${sign.name} has at least 3 stars`);
    for (const [x, y] of sign.points) {
      assert.ok(Number.isFinite(x) && Math.abs(x) <= 1, `${sign.name} x in box`);
      assert.ok(Number.isFinite(y) && Math.abs(y) <= 1, `${sign.name} y in box`);
    }
    assert.ok(sign.links.length >= 2, `${sign.name} has a drawn figure`);
    for (const [a, b] of sign.links) {
      assert.ok(Number.isInteger(a) && a >= 0 && a < sign.points.length, `${sign.name} link start valid`);
      assert.ok(Number.isInteger(b) && b >= 0 && b < sign.points.length, `${sign.name} link end valid`);
      assert.notEqual(a, b, `${sign.name} link is not degenerate`);
    }
  }
});

test('shows nothing on the low half of the 50% roll', () => {
  assert.equal(pickZodiac(rngFrom([0])), null);
  assert.equal(pickZodiac(rngFrom([0.499])), null);
});

test('picks 2-4 distinct signs with in-range sky placement on the high half', () => {
  // first value >= 0.5 passes the gate; remaining values drive count/picks
  const script = [0.5, 0.99, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.05,
    0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.02, 0.12, 0.22];
  const picks = pickZodiac(rngFrom(script));
  assert.ok(Array.isArray(picks));
  assert.ok(picks.length >= 2 && picks.length <= 4);
  assert.equal(new Set(picks.map(p => p.sign.name)).size, picks.length, 'no duplicate signs');
  for (const p of picks) {
    assert.ok(ZODIAC.includes(p.sign));
    assert.ok(p.yaw >= 0 && p.yaw < Math.PI * 2);
    assert.ok(Math.abs(p.pitch) <= 0.95, 'pitch stays clear of the poles');
    assert.ok(p.roll >= 0 && p.roll < Math.PI * 2);
    assert.ok(p.scale >= 130 && p.scale <= 220);
  }
});

test('is deterministic for identical rng sequences', () => {
  // gate + count(0.6 -> 3 picks) + 3 picks x 5 values each
  const script = [0.7, 0.6, 0.11, 0.31, 0.51, 0.71, 0.91, 0.21, 0.41, 0.61, 0.81,
    0.01, 0.33, 0.53, 0.73, 0.93, 0.13];
  assert.deepEqual(pickZodiac(rngFrom(script)), pickZodiac(rngFrom(script)));
});
