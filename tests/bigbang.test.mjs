import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../bigbang.html', import.meta.url), 'utf8');

function functionSource(name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(html);
  assert.ok(match, `Missing function: ${name}`);
  const open = html.indexOf('{', match.index);
  assert.notEqual(open, -1, `Missing function body: ${name}`);
  let depth = 0;
  let quote = null;
  for (let i = open; i < html.length; i++) {
    const char = html[i];
    const next = html[i + 1];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { i = html.indexOf('\n', i + 2); continue; }
    if (char === '/' && next === '*') { i = html.indexOf('*/', i + 2) + 1; continue; }
    if (`'\"\``.includes(char)) { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return html.slice(match.index, i + 1);
  }
  assert.fail(`Unclosed function body: ${name}`);
}

function startTagById(id) {
  const tag = new RegExp(`<[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(html);
  assert.ok(tag, `Missing start tag: ${id}`);
  return tag[0];
}

function assertAttributes(tag, attributes) {
  for (const [name, pattern = /.+/] of Object.entries(attributes)) {
    const match = new RegExp(`\\s${name}(?:\\s*=\\s*["']([^"']*)["'])?`, 'i').exec(tag);
    assert.ok(match, `Missing ${name} on ${tag}`);
    if (pattern) assert.match(match[1] ?? '', pattern, `Unexpected ${name} on ${tag}`);
  }
}

test('keeps the inline Big Bang module syntactically valid', () => {
  const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(moduleMatch, 'Missing inline module script');
  const source = moduleMatch[1].replace(/^\s*import .*;$/gm, '');
  assert.doesNotThrow(() => new Function(source));
});

test('covers all eleven cosmic epochs in chronological order', () => {
  const ids = [
    'singularity', 'planck', 'inflation', 'particles', 'atoms',
    'firststars', 'galaxies', 'milkyway', 'solar', 'present', 'future',
  ];
  const epochs = html.slice(html.indexOf('const EPOCHS = ['), html.indexOf('const ENV_END'));
  let cursor = 0;
  for (const id of ids) {
    const at = epochs.indexOf(`id: '${id}'`, cursor);
    assert.ok(at !== -1, `Missing or out-of-order epoch: ${id}`);
    cursor = at;
  }
});

test('exposes the full transport surface', () => {
  for (const id of ['bbPlay', 'bbReverse', 'bbSpeedDown', 'bbSpeedUp', 'bbSpeedVal',
    'epochList', 'epochCard', 'bbEpochLabel', 'bbTimeLabel', 'bbTicks', 'bbCamBtn']) {
    startTagById(id);
  }
  assertAttributes(startTagById('bbScrubber'), { min: /^0$/, max: /^1000$/, 'aria-label': /\S/ });
  assertAttributes(startTagById('expansionRate'), { min: /^0\.2$/, max: /^3$/ });
});

test('keeps applyEpoch a pure function of u so scrubbing is deterministic', () => {
  const source = functionSource('applyEpoch');
  assert.doesNotMatch(source, /Date\.now|performance\.now|Math\.random/);
});

test('publishes the headless debug handle', () => {
  assert.match(html, /window\.bang\s*=\s*\{[\s\S]*?step:[\s\S]*?render:/);
});

test('anchors toasts to the bottom, clear of the Modes link', () => {
  const toastRule = /#toasts\s*\{[^}]*\}/s.exec(html)?.[0] || '';
  assert.match(toastRule, /bottom:/);
  assert.doesNotMatch(toastRule, /\btop:/);
});

test('offers an immersive Hide UI toggle', () => {
  startTagById('bbUiToggle');
  assert.match(html, /body\.ui-hidden/);
  assert.ok(functionSource('toggleImmersiveUI'));
});

test('drifts through the formed galaxies behind the title, then rewinds to t = 0 on Begin', () => {
  assert.match(html, /bbTitleMode/);
  assert.match(html, /BB_TITLE_U/);
  assert.ok(functionSource('driftTitleCamera'));
  const begin = functionSource('setupBBTitle');
  assert.match(begin, /fadeDip\(/);
  assert.match(begin, /T\.u = 0/);
});

test('bends the black-hole shot through a lensing pass ahead of output', () => {
  assert.match(html, /const LensingShader = \{/);
  const lensAdd = html.indexOf('composer.addPass(lensingPass)');
  const outputAdd = html.indexOf('composer.addPass(new OutputPass())');
  assert.ok(lensAdd !== -1, 'lensingPass never added to the composer');
  assert.ok(lensAdd < outputAdd, 'lensingPass must run before OutputPass');
  assert.ok(functionSource('updateBBLensing'));
});

test('rides a spline camera and an inflation shockwave', () => {
  assert.ok(functionSource('buildCameraPath'));
  assert.match(functionSource('camPoseAt'), /CatmullRom|CAM_CHAINS/);
  assert.ok(functionSource('buildShockwave'));
});

test('expands the galaxy sequence with Andromeda and Messier heroes', () => {
  assert.ok(/function\s+buildHeroGalaxy\s*\(/.test(html), 'Missing buildHeroGalaxy');
  const heroes = html.slice(html.indexOf('const HERO_GALAXIES'), html.indexOf('function buildHeroGalaxies'));
  assert.match(heroes, /Milky Way/);
  assert.match(heroes, /Andromeda/);
  assert.match(heroes, /Messier/);
});

test('forms the sandbox solar system: all eight planets with the shared pipeline', () => {
  const source = functionSource('buildSolarForm');
  for (const name of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    assert.ok(source.includes(`name: '${name}'`), `Missing planet: ${name}`);
  }
  assert.match(source, /createPlanetTexture\(/);
  assert.match(source, /makeAtmosphere\(/);
  assert.match(source, /createRingTexture\(/);
  assert.match(source, /upgradeTexture\(/);
});

test('requests fullscreen from Begin with the same non-blocking fallback as the sandbox', () => {
  const source = functionSource('setupBBTitle');
  assert.match(source, /document\.fullscreenEnabled/);
  assert.match(source, /requestFullscreen\(\)[\s\S]*\.catch\(\(\)\s*=>\s*toast\(/);
  assert.match(source, /Fullscreen unavailable — continuing in this window/);
});

test('matches the landing Start button treatment while retaining Begin', () => {
  assert.match(html, /id=["']beginBtn["'][^>]*>\s*Begin\s*</i);
  const base = /#beginBtn\s*\{[^}]*\}/s.exec(html)?.[0] || '';
  assert.match(base, /background:\s*rgba\(\s*28\s*,\s*29\s*,\s*32\s*,\s*0\.92\s*\)/);
  assert.match(base, /border-color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.28\s*\)/);
  const active = /#beginBtn:hover,\s*#beginBtn:focus-visible\s*\{[^}]*\}/s.exec(html)?.[0] || '';
  assert.match(active, /background:\s*#fff/);
  assert.match(active, /color:\s*#101216/);
  assert.match(active, /border-color:\s*#fff/);
});

test('adds visible title-scene activity with a reduced-motion fallback', () => {
  assert.match(html, /#bbTitle::before\s*\{[^}]*animation:\s*bb-star-drift/s);
  assert.match(html, /#bbTitle::after\s*\{[^}]*animation:\s*bb-shooting-star/s);
  assert.match(html, /@keyframes\s+bb-star-drift/);
  assert.match(html, /@keyframes\s+bb-shooting-star/);
  assert.match(
    html,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?#bbTitle::before,\s*#bbTitle::after\s*\{[^}]*animation:\s*none/,
  );
});
