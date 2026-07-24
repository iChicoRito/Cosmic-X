// Import smoke test: loads every node-safe pure/shared module so a syntax error
// or broken import anywhere in that layer fails CI immediately. The WebGL
// runtimes (solar/creator/big-bang runtime.js) need a browser and are verified
// via the preview pane, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('pure + shared modules import and expose their entry points', async () => {
  const mods = await Promise.all([
    import('../src/pages/solar/persistence.js'),
    import('../src/pages/solar/presets.js'),
    import('../src/pages/solar/dynamics.js'),
    import('../src/pages/solar/zodiac.js'),
    import('../src/pages/solar/timeline.js'),
    import('../src/pages/solar/config.js'),
    import('../src/pages/creator/galaxy-model.js'),
    import('../src/pages/creator/systems.js'),
    import('../src/pages/creator/evolution.js'),
    import('../src/pages/creator/persistence.js'),
    import('../src/pages/big-bang/timeline.js'),
    import('../src/shared/texture-loader.js'),
    import('../src/shared/procedural-canvas.js'),
    import('../src/shared/range.js'),
    import('../src/shared/resource-scope.js'),
    import('../src/shared/dispose-three.js'),
  ]);
  // every module resolved to an object with at least one export
  for (const m of mods) assert.ok(m && Object.keys(m).length > 0);
});

test('shared texture upgrader is a factory returning a function', async () => {
  const { createTextureUpgrader } = await import('../src/shared/texture-loader.js');
  const fakeTHREE = { TextureLoader: class { setCrossOrigin() {} load() {} } };
  const up = createTextureUpgrader(fakeTHREE, { baseUrl: '', getRenderer: () => ({}), isDestroyed: () => false });
  assert.equal(typeof up, 'function');
  assert.doesNotThrow(() => up(null, '')); // no file → no-op
});

test('every solar preset sanitizes into a valid, applyable state', async () => {
  const { SOLAR_PRESETS } = await import('../src/pages/solar/presets.js');
  const { sanitizeState } = await import('../src/pages/solar/persistence.js');
  assert.ok(SOLAR_PRESETS.length >= 1);
  for (const p of SOLAR_PRESETS) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.name, 'string');
    const s = sanitizeState(p.state);
    assert.ok(Number.isFinite(s.galaxy) && s.galaxy >= 0);
    assert.ok(Array.isArray(s.cam.pos) && s.cam.pos.length === 3);
    assert.ok(Array.isArray(s.log));
  }
});
