import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const shell = read('../index.html');
const styles = read('../src/pages/big-bang/big-bang.css');
const template = read('../src/pages/big-bang/template.js');
const runtime = read('../src/pages/big-bang/runtime.js');
const modules = [
  '../src/pages/big-bang/config.js',
  '../src/pages/big-bang/timeline.js',
  '../src/pages/big-bang/camera.js',
  '../src/pages/big-bang/systems.js',
  '../src/pages/big-bang/ui.js',
  '../src/shared/postprocessing-shaders.js',
  '../src/shared/procedural-canvas.js',
  '../src/shared/range.js',
].map(read).join('\n');
const html = `${shell}\n<style>\n${styles}\n</style>\n${template}\n${runtime}\n${modules}`;

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

test('keeps the modular Big Bang runtime syntactically valid', async () => {
  const module = await import('../src/pages/big-bang/runtime.js');
  assert.equal(typeof module.createBigBangRuntime, 'function');
});

test('uses CosmicX.png as the application favicon', () => {
  assert.match(html, /<link\s+rel=["']icon["'][^>]*href=["']\.\/CosmicX\.png["'][^>]*>/i);
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

test('keeps the creator credit exclusive to the CosmicX title screen', () => {
  assert.doesNotMatch(html, /id=["']bbCredit["']/);
  assert.doesNotMatch(html, /Developed by Mark Adrianne Salunga/);
});

test('reveals a camera-tracked ending only after forward completion', () => {
  assertAttributes(startTagById('bbEnding'), {
    role: /status/,
    'aria-live': /polite/,
    'aria-hidden': /true/,
  });
  assert.match(html, /The Beginning Was Never the End/);
  assert.match(html, /The night sky is more than a collection of stars—it is the story of where you came from\./);

  const styles = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const ending = /#bbEnding\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(ending, /pointer-events:\s*none/);
  assert.match(styles, /#bbEnding\.visible\s*\{[^}]*opacity:\s*1/);
  assert.match(styles, /body\.ending[\s\S]*#bbPanel/);
  assert.match(styles, /body\.ending[\s\S]*#epochCard/);
  assert.match(styles, /prefers-reduced-motion[\s\S]*#bbEnding/);

  assert.match(functionSource('setEndingVisible'), /document\.body\.classList\.toggle\(\s*['"]ending['"]/);
  const tracking = functionSource('updateEndingTracking');
  assert.match(tracking, /\.project\(\s*camera\s*\)/);
  assert.match(tracking, /--ending-x/);
  assert.match(tracking, /--ending-y/);
  assert.match(tracking, /--ending-scale/);
  assert.match(functionSource('stepTimeline'), /setEndingVisible\(\s*T\.dir\s*>\s*0\s*\)/);
  assert.match(functionSource('applyEpoch'), /u\s*<\s*1[\s\S]*setEndingVisible\(\s*false\s*\)/);
  assert.match(functionSource('update'), /applyEpoch\(\s*T\.u\s*\)[\s\S]*updateEndingTracking\(\)/);
});

test('offers accessible replay and mode-selection actions beneath the ending quote', () => {
  assertAttributes(startTagById('bbEnding'), { inert: null });
  assertAttributes(startTagById('bbReplayBtn'), { type: /button/ });
  assertAttributes(startTagById('bbEndingBack'), { href: /#\/modes/ });
  assert.match(html, /Play Again/);
  assert.match(html, /Back to Menu/);
  assert.ok(
    html.indexOf('id="bbReplayBtn"') > html.indexOf('The night sky is more than a collection of stars'),
    'Ending actions must follow the quote',
  );

  const replay = functionSource('replayTimeline');
  assert.match(replay, /fadeDip\(/);
  assert.match(replay, /setEndingVisible\(\s*false\s*\)/);
  assert.match(replay, /uTween\.active\s*=\s*false/);
  assert.match(replay, /T\.dir\s*=\s*1/);
  assert.match(replay, /T\.u\s*=\s*0/);
  assert.match(replay, /setCinematic\(\s*true\s*\)/);
  assert.match(replay, /setPlaying\(\s*true\s*\)/);
  assert.match(functionSource('setupBBUI'), /bbReplayBtn[\s\S]*replayTimeline/);
  assert.match(functionSource('setEndingVisible'), /ending\.inert\s*=\s*!visible/);
});

test('supports a chrome-free live title preview and routes Modes to mode selection', () => {
  assert.match(html, /URLSearchParams\(\s*location\.search\s*\)[\s\S]*has\(\s*['"]preview['"]\s*\)/);
  assert.match(html, /document\.documentElement\.classList\.add\(\s*['"]preview['"]\s*\)/);
  const styles = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.match(styles, /\.preview\s+:is\([^)]*#bbTitle[^)]*#backLink[^)]*\)\s*\{[^}]*display:\s*none/s);
  assertAttributes(startTagById('backLink'), { href: /#\/modes/ });
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

test('uses balanced black glass panels while preserving backdrop blur', () => {
  const styles = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const glass = /\.glass\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(styles, /--glass-bg:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.60\s*\)\s*;/);
  assert.match(glass, /background:\s*var\(--glass-bg\)/);
  assert.match(glass, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(glass, /backdrop-filter:\s*blur\(/);
});

test('matches the sandbox glass treatment on the Modes link', () => {
  const rule = /#backLink\s*\{[^}]*\}/s.exec(html)?.[0] || '';
  assert.match(rule, /background:\s*var\(--glass-bg\)/);
  assert.match(rule, /border:\s*1px solid var\(--glass-border\)/);
  assert.match(rule, /backdrop-filter/);
  assert.match(rule, /text-transform:\s*uppercase/);
});
