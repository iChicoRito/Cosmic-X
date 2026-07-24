import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSolarData } from '../src/pages/solar/data.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const shell = read('../index.html');
const styles = read('../src/pages/solar/solar.css');
const template = read('../src/pages/solar/template.js');
const runtime = read('../src/pages/solar/runtime.js');
const modules = [
  '../src/pages/solar/config.js',
  '../src/pages/solar/data.js',
  '../src/pages/solar/dynamics.js',
  '../src/pages/solar/camera.js',
  '../src/pages/solar/settings.js',
  '../src/pages/solar/timeline.js',
  '../src/shared/postprocessing-shaders.js',
  '../src/shared/procedural-canvas.js',
  '../src/shared/range.js',
].map(read).join('\n');
const html = `${shell}\n<style>\n${styles}\n</style>\n${template}\n${runtime}\n${modules}`;

function section(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return html.slice(from, to);
}

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

function constantSource(name) {
  const match = new RegExp(`\\b(?:const|let)\\s+${name}\\b[^;]*;`).exec(html);
  assert.ok(match, `Missing constant: ${name}`);
  return match[0];
}

function elementSourceById(id, source = html) {
  const start = new RegExp(`<([\\w-]+)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(source);
  assert.ok(start, `Missing element: ${id}`);
  const tag = start[1];
  const tags = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tags.lastIndex = start.index;
  let depth = 0;
  let match;
  while ((match = tags.exec(source))) {
    if (match[0].startsWith('</')) depth--;
    else if (!match[0].endsWith('/>')) depth++;
    if (depth === 0) return source.slice(start.index, tags.lastIndex);
  }
  assert.fail(`Unclosed element: ${id}`);
}

function startTagById(id, source = html) {
  const tag = new RegExp(`<[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(source);
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

function listenerWindow(source, id, event) {
  const marker = new RegExp(`ui\\(\\s*['"]${id}['"]\\s*\\)[\\s\\S]*?addEventListener\\(\\s*['"]${event}['"]`).exec(source);
  assert.ok(marker, `Missing ${event} listener for ${id}`);
  const end = source.indexOf('addEventListener(', marker.index + marker[0].length);
  return source.slice(marker.index, end === -1 ? source.length : end);
}

function assertContracts(source, contracts) {
  const missing = Object.entries(contracts)
    .filter(([, pattern]) => !pattern.test(source))
    .map(([name]) => name);
  assert.deepEqual(missing, [], `Missing contract: ${missing.join(', ')}`);
}

test('keeps the modular simulator runtime syntactically valid', async () => {
  const module = await import('../src/pages/solar/runtime.js');
  assert.equal(typeof module.createSolarRuntime, 'function');
});

test('exposes the scientific formatter used by planet information panels', () => {
  const data = createSolarData(
    { distanceScale: 34, distanceExp: 0.55, particleDensity: 1, quality: 'high' },
    { high: { density: 1 } },
  );

  assert.equal(typeof data.sci, 'function');
  assert.equal(data.sci(5.972e24), '5.97×10²⁴');
});

test('uses CosmicX.png as the application favicon', () => {
  assert.match(html, /<link\s+rel=["']icon["'][^>]*href=["']\.\/CosmicX\.png["'][^>]*>/i);
});

test('gives every simulation toggle an accessible name', () => {
  const ids = ['playing', 'trails', 'labels-toggle', 'collisions', 'belt-toggle', 'nebula-toggle'];
  const missing = ids.filter(id => !new RegExp(`<input[^>]*id=["']${id}["'][^>]*aria-label=["'][^"']+["']`).test(html));
  assert.deepEqual(missing, [], `Unnamed static toggles: ${missing.join(', ')}`);

  const planetGrid = section('function refreshPlanetGrid() {', 'function refreshImpactTargets() {');
  assert.match(planetGrid, /setAttribute\(\s*['"]aria-label['"]\s*,\s*['"]Toggle ['"]\s*\+\s*rec\.def\.name/);
});

test('uses balanced black glass panels while preserving backdrop blur', () => {
  const styles = section('<style>', '</style>');
  const glass = /\.glass\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(styles, /--glass-bg:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.60\s*\)\s*;/);
  assert.match(glass, /background:\s*var\(--glass-bg\)/);
  assert.match(glass, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(glass, /backdrop-filter:\s*blur\(/);
});

test('keeps only switches, sliders, progress bars, and badges rounded', () => {
  const styles = section('<style>', '</style>');
  assert.doesNotMatch(styles, /--radius-(?:lg|md)\s*:/);
  assertContracts(styles, {
    switchTrack: /\.switch \.track\s*\{[^}]*border-radius:\s*999px/,
    switchThumb: /\.switch \.thumb\s*\{[^}]*border-radius:\s*50%/,
    webkitSliderTrack: /input\[type="range"\]::-webkit-slider-runnable-track\s*\{[^}]*border-radius:\s*999px/,
    webkitSliderThumb: /input\[type="range"\]::-webkit-slider-thumb\s*\{[^}]*border-radius:\s*50%/,
    sliderFocus: /input\[type="range"\]:focus-visible\s*\{[^}]*border-radius:\s*4px/,
    mozSliderTrack: /input\[type="range"\]::-moz-range-track\s*\{[^}]*border-radius:\s*999px/,
    mozSliderProgress: /input\[type="range"\]::-moz-range-progress\s*\{[^}]*border-radius:\s*999px/,
    mozSliderThumb: /input\[type="range"\]::-moz-range-thumb\s*\{[^}]*border-radius:\s*50%/,
    badge: /\.chip\s*\{[^}]*border-radius:\s*999px/,
    habitabilityTrack: /\.hab-track\s*\{[^}]*border-radius:\s*999px/,
    habitabilityThumb: /\.hab-thumb\s*\{[^}]*border-radius:\s*50%/,
    atmosphereBar: /\.atmo-bar\s*\{[^}]*border-radius:\s*999px/,
    modeBadge: /#modeChip\s*\{[^}]*border-radius:\s*999px/,
  });
  const rounded = [...styles.matchAll(/\bborder-radius\s*:\s*([^;}]+)/g)]
    .filter(([, value]) => value.trim() !== '0');
  assert.equal(rounded.length, 13);
});

test('defines the required simulator functions', () => {
  const names = [
    'toast',
    'toastOnce',
    'openInfoPanel',
    'closeInfoPanel',
    'refreshCameraTargets',
    'setCameraMode',
    'updateCameraMode',
    'closestApproach',
    'updateImpactWarnings',
    'runSelfCheck',
  ];
  const missing = names.filter(name => !new RegExp(`\\bfunction\\s+${name}\\s*\\(`).test(html));
  assert.deepEqual(missing, [], `Missing definitions: ${missing.join(', ')}`);
});

test('wires the dormant spawn controls in setupUI', () => {
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  assertContracts(setupUI, {
    spawnNEA: /ui\(\s*['"]spawnNEA['"]\s*\)\s*\.addEventListener\(\s*['"]click['"][\s\S]*?spawnNEA\(\s*\)/,
    meteorBtn: /ui\(\s*['"]meteorBtn['"]\s*\)\s*\.addEventListener\(\s*['"]click['"]\s*,\s*\(\s*\)\s*=>\s*spawnMeteorShower\(\s*planets\[\s*\+\s*ui\(\s*['"]impactTarget['"]\s*\)\.value\s*\]\s*\)\s*\)/,
  });
});

test('runs every required subsystem from the live update loop', () => {
  const updateLoop = section('function update(dt) {', 'initScene();');
  assertContracts(updateLoop, {
    checkEclipses: /\bcheckEclipses\s*\(/,
    updateTrojans: /\bupdateTrojans\s*\(/,
    checkMajorCollisions: /\bcheckMajorCollisions\s*\(/,
    updateCameraMode: /\bupdateCameraMode\s*\(/,
    updateImpactWarnings: /\bupdateImpactWarnings\s*\(/,
  });
});

test('removeBody clears prediction, breadcrumb, and picking registrations', () => {
  const removeBody = section('function removeBody(body) {', 'function accretionDiskMaterial(');
  assertContracts(removeBody, {
    prediction: /galaxyGroup\.remove\(\s*body\.predict\s*\)/,
    breadcrumbs: /galaxyGroup\.remove\(\s*body\.breadcrumbs\s*\)/,
    pickTargets: /pickTargets\.indexOf\(\s*body\.mesh\s*\)[\s\S]*pickTargets\.splice\(/,
    byMesh: /byMesh\.delete\(\s*body\.mesh\s*\)/,
  });
});

test('keeps exactly the six supported camera mode controls', () => {
  const modes = [...html.matchAll(/data-cam\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
  assert.deepEqual(modes, ['orbit', 'free', 'follow', 'cinematic', 'drone', 'telescope']);
});

test('wires camera controls and implements every active mode', () => {
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  const camera = functionSource('createCameraMetadata');
  assertContracts(setupUI, {
    modeButtons: /\.cam-btn[\s\S]*addEventListener\(\s*['"]click['"][\s\S]*setCameraMode\(/,
    targetSelect: /ui\(\s*['"]camTarget['"]\s*\)\s*\.addEventListener\(\s*['"]change['"]/,
    telescopeZoom: /(?:bindSlider\(\s*['"]teleZoom['"]|ui\(\s*['"]teleZoom['"]\s*\)\s*\.addEventListener\(\s*['"]input['"])/,
  });
  assert.match(html, /(?:addEventListener\(\s*['"]keydown['"]|scope\.listen\(\s*window\s*,\s*['"]keydown['"])/);
  assert.match(html, /(?:addEventListener\(\s*['"]keyup['"]|scope\.listen\(\s*window\s*,\s*['"]keyup['"])/);
  assert.match(html, /['"]Escape['"]/);
  for (const mode of ['free', 'follow', 'cinematic', 'drone', 'telescope']) {
    assert.match(
      html,
      new RegExp(`cameraState\\.mode\\s*={2,3}\\s*["']${mode}["']`),
      `Missing update behavior for ${mode}`,
    );
  }
  assert.doesNotMatch(camera, /['"](?:landing|surface)['"]/);
  assert.doesNotMatch(camera, /\b(?:landingStart|landingProgress|surfaceCameraTarget|surfaceNormal|surfaceForward)\b/);
});

test('requests fullscreen from Start only when the saved display mode prefers it', () => {
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assertContracts(titleScreen, {
    preference: /CONFIG\.displayMode\s*===\s*['"]fullscreen['"]/,
    fullscreenState: /document\.fullscreenElement/,
    fullscreenSupport: /document\.fullscreenEnabled/,
    fullscreenRequest: /document\.documentElement\.requestFullscreen\(\)/,
    caughtRejection: /requestFullscreen\(\)[\s\S]*\.catch\(\(\)\s*=>\s*toast\(/,
    fallbackMessage: /Fullscreen unavailable — continuing in this window/,
  });
  assert.ok(
    titleScreen.indexOf('requestFullscreen()') < titleScreen.indexOf('titleMode = false'),
    'Fullscreen must be requested before startup consumes the user interaction',
  );
});

test('computes closing trajectories and renders capped impact warnings', () => {
  const warningMath = functionSource('closestApproach');
  const closestApproach = Function(`${warningMath}; return closestApproach;`)();
  const state = (x, y, vx, vy, radius = 1) => ({
    position: { x, y, z: 0 },
    velocity: { x: vx, y: vy, z: 0 },
    radius,
  });

  const headOn = closestApproach(state(10, 0, -1, 0), state(0, 0, 0, 0), 120);
  assert.ok(headOn, 'Head-on closing path should warn');
  assert.ok(Math.abs(headOn.eta - 6.75) < 1e-6, `Unexpected contact ETA: ${headOn.eta}`);
  assert.equal(closestApproach(state(10, 0, 1, 0), state(0, 0, 0, 0), 120), null);
  assert.equal(closestApproach(state(10, 4, -1, 0), state(0, 0, 0, 0), 120), null);
  assert.equal(closestApproach(state(200, 0, -1, 0), state(0, 0, 0, 0), 120), null);

  const warningUI = section('function updateImpactWarnings(', 'function setPlanetVisible(');
  assertContracts(warningUI, {
    liveBodies: /dynBodies\.filter\([\s\S]*body\.alive/,
    closestApproach: /\bclosestApproach\s*\(/,
    stableCards: /warningCards\.get\([\s\S]*warningCards\.set\(/,
    etaOrder: /\.sort\([\s\S]*\.eta[\s\S]*\.slice\(\s*0\s*,\s*3\s*\)/,
    warningCard: /warning-card/,
    blinkingIcon: /w-icon/,
    focusTarget: /setCameraMode\(\s*['"]orbit['"]\s*\)[\s\S]*flyTo\(/,
  });
});

test('keeps the July 2026 JPL moon census and complete modeled orbits', () => {
  const facts = section('const PLANET_FACTS = {', '// Extra natural satellites');
  const moonCounts = {
    Mercury: 0,
    Venus: 0,
    Earth: 1,
    Mars: 2,
    Jupiter: 115,
    Saturn: 293,
    Uranus: 29,
    Neptune: 16,
  };
  for (const [name, count] of Object.entries(moonCounts)) {
    assert.match(
      facts,
      new RegExp(`${name}:\\s*\\{[^\\n]*\\bmoons:\\s*${count}\\b`),
      `Stale moon count for ${name}`,
    );
  }

  const m87 = section('const M87_PLANETS = [', 'const GALAXIES = [');
  for (const name of ['Erebus', 'Nyx', 'Charon', 'Acheron']) {
    assert.match(
      m87,
      new RegExp(`name:\\s*['"]${name}['"][^\\n]*\\bperiodDays:\\s*\\d`),
      `Missing modeled period for ${name}`,
    );
  }
});

test('self-check validates the runtime contract and is exported', () => {
  const selfCheck = section('function runSelfCheck()', '/* ================================================================\n   BOOT');
  assertContracts(selfCheck, {
    dom: /checks\.dom/,
    cameraModes: /checks\.cameraModes/,
    planetFacts: /checks\.planetFacts/,
    liveTargets: /checks\.liveTargets/,
    integrations: /checks\.integrations/,
    compactResult: /return\s*\{\s*ok\s*:[\s\S]*checks\s*\}/,
  });
  const debugHandle = section('window.solar = {', 'const debugHandle = window.solar;');
  assert.match(debugHandle, /\bselfCheck\s*:\s*runSelfCheck\b/);
});

test('defines bounded J2000 UTC time helpers with signed elapsed labels', () => {
  assertContracts(html, {
    j2000: /\bJ2000_MS\s*=\s*Date\.UTC\(\s*2000\s*,\s*0\s*,\s*1\s*,\s*12\s*\)/,
    dayBound: /\bSIM_DAY_LIMIT\s*=\s*36525\b/,
    clamp: /function\s+clampSimDays\s*\([^)]+\)\s*\{[\s\S]*?(?:-SIM_DAY_LIMIT|-36525)[\s\S]*?(?:SIM_DAY_LIMIT|36525)/,
    forwardDate: /function\s+simDateFromDays\s*\([^)]+\)\s*\{[\s\S]*?J2000_MS[\s\S]*?86400000/,
    reverseDate: /function\s+simDaysFromDate\s*\([^)]+\)\s*\{[\s\S]*?J2000_MS[\s\S]*?86400000/,
    elapsed: /function\s+formatElapsedDays\s*\([^)]+\)\s*\{[\s\S]*?(?:[+\-]|sign)/,
  });

  const helpers = [
    constantSource('J2000_MS'), constantSource('SIM_DAY_LIMIT'),
    functionSource('clampSimDays'), functionSource('simDateFromDays'),
    functionSource('simDaysFromDate'), functionSource('formatElapsedDays'),
  ].join('\n');
  const time = Function(`${helpers}; return { J2000_MS, clampSimDays, simDateFromDays, simDaysFromDate, formatElapsedDays };`)();
  assert.equal(time.J2000_MS, Date.UTC(2000, 0, 1, 12));
  assert.equal(time.clampSimDays(-36526), -36525);
  assert.equal(time.clampSimDays(36526), 36525);
  assert.equal(time.simDateFromDays(0).toISOString(), '2000-01-01T12:00:00.000Z');
  assert.equal(time.simDateFromDays(-36524).toISOString(), '1900-01-01T12:00:00.000Z');
  assert.equal(time.simDateFromDays(36525).toISOString(), '2100-01-01T12:00:00.000Z');
  assert.equal(time.simDaysFromDate(time.simDateFromDays(-123.5)), -123.5);
  assert.match(time.formatElapsedDays(-1), /^-/);
  assert.match(time.formatElapsedDays(1), /^\+/);
});

test('uses shared playback modes and time-scale controls with every approved preset', () => {
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  assertContracts(html, {
    presets: /\bTIME_SCALE_PRESETS\s*=\s*\[\s*0\.5\s*,\s*1\s*,\s*2\s*,\s*5\s*,\s*10\s*,\s*20\s*,\s*50\s*,\s*100\s*,\s*200\s*\]/,
    playbackSetter: /function\s+setPlayback\s*\([^)]+\)/,
    timeScaleSetter: /function\s+setTimeScale\s*\([^)]+\)/,
  });
  const sidebarPlayback = listenerWindow(setupUI, 'playing', 'change');
  assert.match(sidebarPlayback, /setPlayback\(/);
  assertContracts(sidebarPlayback, { forward: /['"]forward['"]/, paused: /['"]paused['"]/ });
  for (const [id, mode] of [['barPlay', 'forward'], ['barPause', 'paused'], ['barReverse', 'reverse']]) {
    assert.match(listenerWindow(setupUI, id, 'click'), new RegExp(`setPlayback\\(\\s*['"]${mode}['"]\\s*\\)`));
  }
  assert.match(listenerWindow(setupUI, 'speed', 'input'), /setTimeScale\(/);
  assert.match(listenerWindow(setupUI, 'barTimeScale', 'input'), /setTimeScale\(/);
  const playback = functionSource('setPlayback');
  const scale = functionSource('setTimeScale');
  assertContracts(playback, { forward: /['"]forward['"]/, reverse: /['"]reverse['"]/, paused: /['"]paused['"]/ });
  assert.match(playback, /CONFIG\./);
  assert.match(playback, /(?:barPlay|barPause|barReverse)/);
  assert.match(playback, /ui\(\s*['"]playing['"]\s*\)/);
  assert.match(scale, /CONFIG\.timeScale/);
  assert.match(scale, /ui\(\s*['"]speed['"]\s*\)/);
  assert.match(scale, /ui\(\s*['"]barTimeScale['"]\s*\)/);
});

test('keeps simulated time running behind the title screen and makes timeline seeks deterministic', () => {
  const updateLoop = section('function update(dt) {', 'function runSelfCheck()');
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  assert.match(updateLoop, /const\s+dDays\s*=\s*CONFIG\.playing\s*\?/,
    'Simulated time must advance whenever playback is on, title screen included');
  assert.doesNotMatch(updateLoop, /dDays\s*=\s*titleMode/,
    'Title mode must not freeze the simulation clock');
  assertContracts(html, {
    seek: /function\s+seekSimulationTime\s*\([^)]+\)/,
    rebuild: /function\s+rebuildSimulationAt\s*\([^)]+\)/,
  });
  const seek = functionSource('seekSimulationTime');
  assertContracts(seek, {
    target: /(?:const|let)\s+target\s*=\s*clampSimDays\(/,
    assignment: /simDays\s*=\s*target/,
    pause: /setPlayback\(\s*['"]paused['"]\s*\)/,
    oneRebuild: /rebuildSimulationAt\(\s*target\s*,\s*(?:reason|['"][^'"]+['"])\s*\)/,
  });
  assert.equal((seek.match(/\brebuildSimulationAt\s*\(/g) || []).length, 1, 'Hard seek must rebuild exactly once');
  const input = listenerWindow(setupUI, 'timelineScrubber', 'input');
  const change = listenerWindow(setupUI, 'timelineScrubber', 'change');
  assert.match(input, /setPlayback\(\s*['"]paused['"]\s*\)/);
  assert.match(input, /(?:previewTimeline|updateTimelinePreview)\(/);
  assert.doesNotMatch(input, /(?:seekSimulationTime|rebuildSimulationAt)\(/);
  assert.match(change, /seekSimulationTime\(/);
  assert.equal((change.match(/\bseekSimulationTime\s*\(/g) || []).length, 1, 'Scrubber change must seek once');
});

test('supports reverse time without irreversible updates and rebuilds rail poses from absolute days', () => {
  const updateLoop = section('function update(dt) {', 'function runSelfCheck()');
  assert.match(html, /function\s+setTimeScale\s*\([^)]+\)/, 'Reverse playback must use the shared time-scale setter');
  assert.match(updateLoop, /const\s+dDays\s*=[\s\S]*?CONFIG\.timeScale/);
  assertContracts(updateLoop, {
    reverseGuard: /if\s*\(\s*dDays\s*>\s*0\s*\)[\s\S]*?updateDynamics\(/,
    absoluteRailPose: /orbitPos\(\s*def\s*,\s*rec\.theta0\s*\+\s*Math\.PI\s*\*\s*2\s*\*\s*simDays\s*\/\s*def\.periodDays/,
    immutableReverse: /if\s*\(\s*dDays\s*>\s*0\s*\)[\s\S]*?(?:checkEclipses|checkMajorCollisions)/,
  });
});

test('builds finite, unit-labelled summaries for planets and small bodies', () => {
  assertContracts(html, {
    summary: /function\s+buildObjectSummary\s*\([^)]+\)/,
    metricSchema: /(?:SUMMARY_METRIC_KEYS|SUMMARY_METRICS)/,
    finiteMetric: /function\s+(?:finiteMetric|metricValue)\s*\([^)]+\)/,
  });
  const summary = functionSource('buildObjectSummary');
  const metricKeys = [
    'cameraDistance', 'parentDistance', 'velocity', 'orbitalSpeed',
    'rotationSpeed', 'temperature', 'mass', 'radius', 'gravity',
    'orbitalPeriod', 'coordinates',
  ];
  assertContracts(summary, {
    objectResult: /return\s*\{/,
    metrics: /\bmetrics\s*:/,
    finite: /(?:finiteMetric|metricValue)\(/,
    units: /\bunit\s*:/,
    qualifier: /(?:estimate|modeled|simulator)/i,
    smallBody: /(?:asteroid|comet)/,
    unboundStatus: /\{\s*periodDays\s*:\s*0\s*,\s*status\s*:\s*['"]Unbound['"]\s*\}/,
    finiteFallback: /Number\.isFinite[\s\S]*?(?:\?[^:]+:[^;\n]+|\|\|\s*0)/,
  });
  for (const density of [600, 2500, 3300]) assert.match(summary, new RegExp(`\\b${density}\\b`));
  for (const key of metricKeys) assert.match(summary, new RegExp(`\\b${key}\\s*:`), `Missing summary metric: ${key}`);
  const profiles = constantSource('STAR_SUMMARY_PROFILES');
  assertContracts(profiles, {
    milkyWay: /MilkyWay\s*:\s*\{[\s\S]*?massSolar\s*:\s*1\b[\s\S]*?radiusKm\s*:\s*695700\b[\s\S]*?tempK\s*:\s*5772\b[\s\S]*?rotationDays\s*:\s*25\.4\b/,
    andromeda: /Andromeda\s*:\s*\{[\s\S]*?massSolar\s*:\s*2\b[\s\S]*?radiusSolar\s*:\s*1\.7\b[\s\S]*?tempK\s*:\s*9000\b[\s\S]*?rotationDays\s*:\s*1\.5\b/,
  });
});

test('preserves selected object identity across rebuilds and falls back safely on galaxy changes', () => {
  assertContracts(html, {
    selectionKey: /function\s+(?:selectionKeyFor|objectSelectionKey)\s*\([^)]+\)/,
    restore: /function\s+restore(?:Object)?Selection\s*\([^)]+\)/,
  });
  const key = functionSource(html.match(/function\s+(selectionKeyFor|objectSelectionKey)\s*\(/)?.[1] || 'selectionKeyFor');
  const restore = functionSource(html.match(/function\s+(restore(?:Object)?Selection)\s*\(/)?.[1] || 'restoreSelection');
  const switcher = section('function switchGalaxy(index) {', '/* ================================================================\n   CAMERA');
  assertContracts(key, { star: /isSun/, planet: /def\.name/, moon: /isMoon[\s\S]*?host/, residentBlackHole: /isBH/ });
  assertContracts(restore, { lookup: /\.find\(/, liveRecords: /(?:planets|byMesh|blackHoles)/, fallback: /\bfallback\b/ });
  assert.match(switcher, /(?:restore(?:Object)?Selection\(\s*null|selectRecord\(\s*null)/);
  assert.match(switcher, /(?:flyTo\(\s*null\s*\)|setCameraMode\(\s*['"]orbit['"]\s*\))/);
});

test('exposes an accessible bottom information bar and mobile Details disclosure', () => {
  const bar = elementSourceById('bottomBar');
  for (const id of ['barUtcDate', 'barElapsed', 'barTimeScale', 'barSelectedName', 'barSelectedType', 'barSelectedMetric']) {
    assert.match(bar, new RegExp(`\\bid=["']${id}["']`), `Missing ${id} inside bottom bar`);
  }
  for (const id of ['barPlay', 'barPause', 'barReverse']) {
    assertAttributes(startTagById(id, bar), { 'aria-label': /\S/, 'aria-pressed': /(?:true|false)/ });
  }
  assertAttributes(startTagById('timelineScrubber', bar), { type: /range/, 'aria-label': /\S/, 'aria-valuetext': /\S/ });
  assertAttributes(startTagById('timelineDetails', bar), {
    'aria-expanded': /(?:true|false)/,
    'aria-controls': /timelineDetailsPanel/,
  });
  assertAttributes(startTagById('timelineDetailsPanel', bar), { 'aria-hidden': /(?:true|false)/ });
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  const details = listenerWindow(setupUI, 'timelineDetails', 'click');
  assert.match(details, /setAttribute\(\s*['"]aria-expanded['"]/);
  assert.match(details, /(?:timelineDetailsPanel[\s\S]*?(?:\.hidden\s*=|aria-hidden)|setAttribute\(\s*['"]aria-hidden['"])/);
  assert.match(setupUI, /timelineScrubber[\s\S]*?setAttribute\(\s*['"]aria-valuetext['"]/);
  for (const id of ['timelinePrev', 'timelineNext']) {
    assertAttributes(startTagById(id, bar), { 'aria-label': /\S/ });
    assert.match(setupUI, new RegExp(`${id}[\\s\\S]*?\\.disabled\\s*=`));
  }
});

test('re-enables orbit controls when a rebuild cancels a camera flight', () => {
  const build = functionSource('buildGalaxy');
  const cancelIndex = build.indexOf('flight.active = false');
  assert.ok(cancelIndex !== -1, 'buildGalaxy must cancel any active flight');
  const enable = build.indexOf('controls.enabled', cancelIndex);
  assert.ok(enable !== -1, 'Cancelling a flight must restore the controls it disabled');
});

test('enables collision physics by default while keeping the manual toggle', () => {
  const config = section('const CONFIG = {', '};');
  assert.match(config, /collisions:\s*true/);
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  assert.match(setupUI, /bindSwitch\(\s*['"]collisions['"]\s*,\s*CONFIG\s*,\s*['"]collisions['"]/);
});

test('records user spawns and replays them across timeline traversal and rebuilds', () => {
  assertContracts(html, {
    log: /const\s+interactionLog\s*=\s*\[\]/,
    record: /function\s+recordInteraction\s*\(/,
    replay: /function\s+replayInteraction\s*\(/,
    sync: /function\s+syncInteractionEvents\s*\(/,
    restore: /function\s+restoreInteractionEvents\s*\(/,
  });
  const updateLoop = section('function update(dt) {', 'function runSelfCheck()');
  assert.match(updateLoop, /syncInteractionEvents\(\s*prevSimDays\s*,\s*simDays\s*\)/);
  assert.match(functionSource('buildGalaxy'), /restoreInteractionEvents\(\)/);
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  for (const id of ['spawnComet', 'spawnAsteroid', 'spawnAstBelt', 'spawnBH', 'launchBtn']) {
    assert.match(
      listenerWindow(setupUI, id, 'click'),
      /record(?:Interaction|SpawnedBody)\(/,
      `Unrecorded interaction: ${id}`,
    );
  }
  assert.match(functionSource('clearSpawned'), /interactionLog/);
  assert.match(functionSource('replayInteraction'), /replayingInteraction\s*=\s*true/);
});

test('replays a spawn when playback crosses its timestamp and despawns it on rewind', () => {
  const sync = functionSource('syncInteractionEvents');
  const result = Function(`
    const currentGalaxy = 0; const blackHoles = []; const dynBodies = [];
    const removed = []; const replayed = [];
    const removeBody = body => { body.alive = false; removed.push(body); };
    const rebuildSimulationAt = () => {};
    const replayInteraction = event => {
      event.handle = { alive: true };
      dynBodies.push(event.handle);
      replayed.push(event);
    };
    const interactionLive = event =>
      !!event.handle && event.handle.alive !== false && dynBodies.includes(event.handle);
    const interactionLog = [{ day: 5, galaxy: 0, type: 'spawn', props: {}, handle: null }];
    ${sync}
    syncInteractionEvents(0, 10);
    const firstReplay = replayed.length;
    syncInteractionEvents(10, 2);
    const removedCount = removed.length;
    const handleCleared = interactionLog[0].handle === null;
    syncInteractionEvents(2, 10);
    return { firstReplay, removedCount, handleCleared, secondReplay: replayed.length };
  `)();
  assert.equal(result.firstReplay, 1, 'Forward crossing must fire the event');
  assert.equal(result.removedCount, 1, 'Rewinding past the event must despawn its body');
  assert.equal(result.handleCleared, true);
  assert.equal(result.secondReplay, 2, 'The event must re-fire on the next forward crossing');
});

test('keeps range-slider fills glued to the thumb, including programmatic updates', () => {
  const paint = functionSource('paintRangeFill');
  assert.match(paint, /--fill/);
  const fake = {
    max: '100', min: '0', value: '25',
    style: { props: {}, setProperty(key, value) { this.props[key] = value; } },
  };
  Function(`${paint}; paintRangeFill(arguments[0]);`)(fake);
  assert.equal(fake.style.props['--fill'], 'calc(7px + (100% - 14px) * 0.25)');
  for (const name of ['setTimeScale', 'refreshBottomInfoBar', 'setTimeScaleDisplayOnly']) {
    assert.match(functionSource(name), /paintRangeFill\(/, `${name} must repaint slider fill`);
  }
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  assert.match(listenerWindow(setupUI, 'timelineScrubber', 'input'), /paintRangeFill\(/);
});

test('lets users collapse the bottom bar and gives timestamps visual hierarchy', () => {
  const bar = elementSourceById('bottomBar');
  assertAttributes(startTagById('barCollapse', bar), { 'aria-expanded': /(?:true|false)/, 'aria-label': /\S/ });
  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  const toggle = listenerWindow(setupUI, 'barCollapse', 'click');
  assert.match(toggle, /classList\.toggle\(\s*['"]collapsed['"]\s*\)/);
  assert.match(toggle, /aria-expanded/);
  const styles = section('<style>', '</style>');
  assert.match(styles, /#bottomBar\.collapsed [^{]*\{[^}]*display:\s*none/);
  assert.match(styles, /#barUtcTime\s*\{[^}]*font-size:\s*19px/);
  assert.match(styles, /\.bar-detail small\s*\{[^}]*text-transform:\s*uppercase/);
});

test('bounds bloom input so high intensities glow smoothly instead of squaring', () => {
  assert.match(html, /const\s+BloomClampShader\s*=\s*\{/);
  const shader = section('const BloomClampShader = {', '};');
  assert.match(shader, /uCap/);
  assert.match(shader, /min\(\s*c\.rgb/);
  const setup = functionSource('setupPostFX');
  const clampIndex = setup.indexOf('BloomClampShader');
  const bloomIndex = setup.indexOf('UnrealBloomPass(');
  assert.ok(clampIndex !== -1 && clampIndex < bloomIndex, 'Clamp pass must run before bloom');
});

test('extends the runtime self-check to timeline, selection, bar, and finite metrics', () => {
  const selfCheck = section('function runSelfCheck()', '/* ================================================================\n   BOOT');
  assertContracts(selfCheck, {
    timeline: /checks\.timeline\s*=\s*(?!true\b|false\b)[^;]+;/,
    bar: /checks\.bottomBar\s*=\s*(?!true\b|false\b)[^;]+;/,
    selection: /checks\.selection\s*=\s*(?!true\b|false\b)[^;]+;/,
    finiteMetrics: /checks\.(?:finiteMetrics|summaryMetrics)\s*=\s*(?!true\b|false\b)[^;]+;/,
    settings: /checks\.settings\s*=\s*(?!true\b|false\b)[^;]+;/,
  });
});

test('offers all three simulation modes from the title screen', () => {
  const title = elementSourceById('title');
  assert.ok(/id=["']startBtn["']/.test(title), 'Missing startBtn in #title');
  assert.ok(/id=["']creatorBtn["']/.test(title), 'Missing creatorBtn in #title');
  assert.ok(/id=["']bigbangBtn["']/.test(title), 'Missing bigbangBtn in #title');
  assert.match(title, /As the Gods Will/);
  assert.match(title, /Become the Creator/);
  assert.match(title, /Before the Stars/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assertContracts(titleScreen, {
    navTarget: /navigate\(\s*['"]\/big-bang['"]\s*\)/,
    fadeBeforeNav: /fade['"]\)[\s\S]*?classList\.add\(\s*['"]on['"]\s*\)[\s\S]*?navigate\(\s*['"]\/big-bang['"]/,
    creatorNav: /navigate\(\s*['"]\/creator['"]\s*\)/,
  });
});

  test('launches the mandatory Solar tour after the HUD intro and restores playback', () => {
    assert.match(runtime, /startOnboardingTour/);
    assert.match(runtime, /storageKey:\s*ONBOARDING_KEYS\.solar/);
  const titleScreen = functionSource('setupTitleScreen');
  assert.match(titleScreen, /introUiTimer[\s\S]*?startSolarOnboarding\(\)/);
  const tour = functionSource('startSolarOnboarding');
  assert.match(tour, /fullscreenNotice[\s\S]*?\.open[\s\S]*?addEventListener\(['"]close['"],\s*startSolarOnboarding/);
  for (const target of ['#ui', '#bottomBar', '#uiToggle', '#simBackLink']) {
    assert.match(tour, new RegExp(`target:\\s*['"]${target.replace('#', '\\#')}['"]`));
  }
  assert.match(tour, /setPlayback\(['"]paused['"]\)/);
  assert.match(tour, /onEnd[\s\S]*?setPlayback\(/);
  assert.match(functionSource('returnToMenu'), /stopSolarOnboarding\(\)/);
  assert.match(functionSource('destroy'), /stopSolarOnboarding\(\)/);
});

test('fully wipes spawned objects and their recorded events on simulation reset', () => {
  const handler = section("ui('resetSim')", "GALAXIES.forEach(g =>");
  assertContracts(handler, {
    wipe: /clearSpawned\(\)/,
    rewind: /seekSimulationTime\(SESSION_START_MS/,
  });
  assert.ok(handler.indexOf('clearSpawned()') < handler.indexOf('seekSimulationTime'),
    'clearSpawned must run before the rebuilding seek so the log cannot resurrect spawns');
});

test('keeps the hidden title screen out of the tab order so nothing navigates by accident', () => {
  const styles = section('<style>', '</style>');
  assert.match(styles, /#title\.hidden\s*\{[^}]*visibility:\s*hidden/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assert.match(titleScreen, /\.inert = true/);
});

test('isolates the menu title animation and reverts at the grid edge', () => {
  assert.ok(/id=["']titleText["']/.test(elementSourceById('title')), 'Missing titleText span');
  const styles = section('<style>', '</style>');
  assert.match(styles, /#titleText\.typing/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assert.match(titleScreen, /focusout/);
});

test('offers an immersive Hide UI toggle', () => {
  assert.ok(startTagById('uiToggle'));
  const styles = section('<style>', '</style>');
  assert.match(styles, /body\.ui-hidden/);
  assert.ok(functionSource('toggleImmersiveUI'));
});

test('places the other galaxies in the sky as discoverable camera targets', () => {
  const build = functionSource('buildDistantGalaxies');
  assert.match(build, /pickTargets\.push/);
  assert.match(build, /makeLabel\(/);
  assert.match(functionSource('refreshCameraTargets'), /distantGalaxies/);
  assert.match(functionSource('buildObjectSummary'), /isGalaxy/);
  assert.match(functionSource('isCameraTargetLive'), /isGalaxy/);
});

test('stages the title into Start and mode selection', () => {
  const title = elementSourceById('title');
  assert.ok(/id=["']enterBtn["']/.test(title), 'Missing enterBtn in #title');
  assert.match(title, /stage-wrap/);
  assert.match(title, />\s*Start\s*</);
  const styles = section('<style>', '</style>');
  assert.match(styles, /#title\.modes/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assertContracts(titleScreen, {
    stageToggle: /enterBtn['"]\)[\s\S]*?classList\.add\(\s*['"]modes['"]\s*\)/,
    hoverTitle: /mouseenter/,
    keyboardTitle: /focus/,
  });
});

test('shows the normal-weight creator credit only on the initial title screen', () => {
  const title = elementSourceById('title');
  const startIndex = title.indexOf('id="enterBtn"');
  const settingsIndex = title.indexOf('id="settingsBtn"');
  assert.ok(startIndex !== -1 && settingsIndex > startIndex, 'Settings must sit directly after Start');
  assert.match(title, /class=["'][^"']*title-actions[^"']*["']/);
  assert.doesNotMatch(title, /Developed by Mark Adrianne Salunga/);
  assert.match(elementSourceById('appCredit'), /Developed by Mark Adrianne Salunga/);

  const settingsButton = startTagById('settingsBtn', title);
  assertAttributes(settingsButton, {
    type: /button/,
    'aria-haspopup': /dialog/,
    'aria-controls': /settingsDialog/,
  });

  const styles = section('<style>', '</style>');
  const actionGroup = /\.title-actions\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  const actions = /\.title-actions \.menu-btn\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  const credit = /\.app-credit\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(actionGroup, /width:\s*min\(\s*220px\s*,\s*68vw\s*\)/);
  assert.match(actions, /padding:\s*13px 36px/);
  assert.match(actions, /font:\s*700 13px/);
  assert.match(actions, /background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*\.10\s*\)/);
  assert.match(actions, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(actions, /backdrop-filter:\s*blur\(/);
  assert.match(credit, /position:\s*fixed/);
  assert.match(credit, /left:\s*50%/);
  assert.match(credit, /translate:\s*-50%/);
  assert.match(credit, /bottom:/);
  assert.match(credit, /font:\s*400\b/);
  assert.match(styles, /#title\.modes \+ \.app-credit,\s*#title\.hidden \+ \.app-credit\s*\{[^}]*(?:visibility:\s*hidden[^}]*opacity:\s*0|opacity:\s*0[^}]*visibility:\s*hidden)/s);
});

test('releases the settings modal before changing fullscreen', () => {
  const display = functionSource('setDisplayMode');
  const closeAt = display.indexOf('dialog.close()');
  const fullscreenAt = display.indexOf('requestFullscreen()');
  assert.notEqual(closeAt, -1, 'Display changes must close the modal dialog');
  assert.ok(closeAt < fullscreenAt, 'The modal must close before the fullscreen transition');
});

test('returns from mode selection to a reusable title screen', () => {
  const title = elementSourceById('title');
  assertAttributes(startTagById('titleBackBtn', title), { type: /button/ });
  assert.match(title, /Back to Title Screen/);
  assert.ok(
    title.indexOf('id="titleBackBtn"') < title.indexOf('class="mode-bar"'),
    'The title back control must not be anchored inside the bottom mode bar',
  );

  const setup = functionSource('setupTitleScreen');
  assert.match(setup, /titleBackBtn/);
  assert.match(setup, /classList\.remove\(\s*['"]modes['"]\s*\)/);
  assert.match(setup, /navigate\(\s*['"]\/['"]\s*\)/);
  assert.match(setup, /initialView\s*===\s*['"]modes['"]/);
  assert.doesNotMatch(setup, /enterBtn[\s\S]{0,180}once:\s*true/);

  const styles = section('<style>', '</style>');
  const back = /\.mode-back\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(back, /position:\s*fixed/);
  assert.match(back, /top:\s*16px/);
  assert.match(back, /right:\s*16px/);
  assert.match(back, /height:\s*28px/);
  assert.match(back, /padding:\s*0 10px/);
  assert.match(back, /background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*\.10\s*\)/);
  assert.doesNotMatch(back, /\bleft:/);
});

test('provides accessible categorized settings without unsupported placeholders', () => {
  const dialog = elementSourceById('settingsDialog');
  assertAttributes(startTagById('settingsDialog'), { 'aria-labelledby': /settingsTitle/ });
  assertAttributes(startTagById('settingsClose', dialog), { type: /button/ });

  for (const [tab, panel] of [
    ['settingsTabDisplay', 'settingsPanelDisplay'],
    ['settingsTabGraphics', 'settingsPanelGraphics'],
    ['settingsTabCamera', 'settingsPanelCamera'],
    ['settingsTabInterface', 'settingsPanelInterface'],
  ]) {
    assertAttributes(startTagById(tab, dialog), {
      role: /tab/,
      'aria-selected': /(?:true|false)/,
      'aria-controls': new RegExp(panel),
    });
    assertAttributes(startTagById(panel, dialog), { role: /tabpanel/ });
  }

  for (const id of [
    'settingsDisplay', 'settingsQuality', 'settingsAntialiasing',
    'settingsBloom', 'settingsDensity', 'settingsBelt', 'settingsNebulas',
    'settingsMouseSensitivity', 'settingsCameraSpeed', 'settingsRotationSpeed',
    'settingsPanSpeed', 'settingsZoomSpeed', 'settingsHUD', 'settingsTimeline',
    'settingsLabels', 'settingsWarnings',
  ]) {
    assert.ok(startTagById(id, dialog), `Missing supported setting ${id}`);
  }
  assert.doesNotMatch(
    dialog,
    /Resolution|Borderless|FPS Limit|UI Scale|Brightness|Gamma|Field of View|Texture Quality|Motion Blur|Depth of Field|Screen Space Reflections|Volumetric Lighting|Cloud Quality|Minimap|Coordinates|Tooltips|Left Click|Right Click|Middle Mouse/i,
  );
});

test('sanitizes and loads persisted settings before scene creation', () => {
  assert.match(html, /const\s+SETTINGS_KEY\s*=\s*['"]cosmicx\.settings\.v1['"]/);
  const sanitize = Function(`${functionSource('sanitizeSettings')}; return sanitizeSettings;`)();
  const clean = sanitize({
    displayMode: 'windowed',
    quality: 'ultra',
    bloomStrength: -4,
    particleDensity: 99,
    antialiasing: false,
    mouseSensitivity: 0,
    cameraSpeed: 99,
    rotationSpeed: 1.5,
    panSpeed: 'fast',
    zoomSpeed: 1.25,
    showHUD: false,
    showTimeline: true,
    showLabels: false,
    showWarnings: true,
  });
  assert.equal(clean.displayMode, 'windowed');
  assert.equal('quality' in clean, false);
  assert.equal(clean.bloomStrength, 0);
  assert.equal(clean.particleDensity, 2);
  assert.equal(clean.mouseSensitivity, 0.25);
  assert.equal(clean.cameraSpeed, 3);
  assert.equal(clean.rotationSpeed, 1.5);
  assert.equal('panSpeed' in clean, false);
  assert.equal(clean.zoomSpeed, 1.25);
  assert.equal(clean.antialiasing, false);
  assert.equal(clean.showHUD, false);
  assert.equal(clean.showTimeline, true);
  assert.equal(clean.showLabels, false);
  assert.equal(clean.showWarnings, true);

  const load = functionSource('loadSettings');
  const save = functionSource('saveSettings');
  assert.match(load, /storage\.getItem\(\s*SETTINGS_KEY\s*\)/);
  assert.match(load, /JSON\.parse/);
  assert.match(load, /sanitizeSettings\(/);
  assert.match(load, /catch/);
  assert.match(save, /storage\.setItem\(\s*SETTINGS_KEY/);
  assert.match(save, /bloomStrength:\s*CONFIG\.bloom\.strength/);
  assert.match(save, /catch/);
  const boot = section('/* ================================================================\n   BOOT', 'const debugHandle = window.solar;');
  assert.ok(boot.indexOf('loadSettings();') < boot.indexOf('initScene();'));
});

test('synchronizes supported settings with existing controls and runtime paths', () => {
  const setupSettings = functionSource('setupSettings');
  assertContracts(setupSettings, {
    dialogOpen: /settingsBtn[\s\S]*?showModal\(\)/,
    dialogClose: /settingsClose[\s\S]*?\.close\(\)/,
    keyboardTabs: /ArrowLeft|ArrowRight/,
    qualityBridge: /settingsQuality[\s\S]*?quality/,
    bloomBridge: /settingsBloom[\s\S]*?bloomI/,
    densityBridge: /settingsDensity[\s\S]*?density/,
    beltBridge: /settingsBelt[\s\S]*?belt-toggle/,
    nebulaBridge: /settingsNebulas[\s\S]*?nebula-toggle/,
    labelBridge: /settingsLabels[\s\S]*?labels-toggle/,
  });

  const setupUI = section('function setupUI() {', 'function clearSpawned() {');
  assert.match(listenerWindow(setupUI, 'quality', 'change'), /rebuildSimulationAt\(\s*simDays/);
  assert.match(listenerWindow(setupUI, 'density', 'change'), /rebuildSimulationAt\(\s*simDays/);
  assert.match(setupUI, /saveSettings\(\)/);
  assert.match(functionSource('applyQuality'), /fxaaPass\.enabled\s*=\s*CONFIG\.antialiasing/);

  const camera = functionSource('updateCameraMode');
  assert.match(camera, /CONFIG\.cameraSpeed/);
  assert.match(functionSource('setupPicking'), /CONFIG\.mouseSensitivity/);
  const scene = functionSource('initScene');
  assert.match(scene, /controls\.rotateSpeed\s*=\s*CONFIG\.rotationSpeed/);
  assert.match(scene, /controls\.panSpeed\s*=\s*CONFIG\.panSpeed/);
  assert.match(scene, /controls\.zoomSpeed\s*=\s*CONFIG\.zoomSpeed/);
});

test('applies display, HUD, timeline, label, and warning preferences through shared state', () => {
  const display = functionSource('setDisplayMode');
  assert.match(display, /document\.documentElement\.requestFullscreen\(\)/);
  assert.match(display, /document\.exitFullscreen\(\)/);
  assert.match(display, /CONFIG\.displayMode/);

  const notice = functionSource('setupFullscreenNotice');
  assert.match(notice, /CONFIG\.displayMode\s*!==\s*['"]fullscreen['"]/);

  const hud = functionSource('setHudVisible');
  assert.match(hud, /classList\.toggle\(\s*['"]ui-hidden['"]/);
  assert.match(functionSource('toggleImmersiveUI'), /setHudVisible\(/);

  const timeline = functionSource('setTimelineVisible');
  assert.match(timeline, /\.hidden\s*=/);
  assert.match(timeline, /classList\.toggle\(\s*['"]visible['"]/);

  const warnings = functionSource('updateImpactWarnings');
  assert.match(warnings, /!CONFIG\.showWarnings/);
  assert.match(functionSource('setupSettings'), /settingsWarnings/);
  assert.match(functionSource('setupSettings'), /settingsTimeline/);
  assert.match(functionSource('setupSettings'), /settingsHUD/);
});

test('keeps mode labels left aligned while reserving the hidden Play affordance', () => {
  const styles = section('<style>', '</style>');
  assert.match(styles, /\.mode-card\s*\{[^}]*justify-content:\s*flex-start/);
  assert.match(styles, /\.mode-txt\s*\{[^}]*align-items:\s*flex-start[^}]*text-align:\s*left/);
  const playRule = /\.mode-play\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(playRule, /display:\s*flex/);
  assert.match(playRule, /margin-left:\s*auto/);
  assert.match(playRule, /opacity:\s*0/);
  assert.match(playRule, /visibility:\s*hidden/);
  assert.doesNotMatch(playRule, /display:\s*none/);
  assert.match(styles, /\.mode-card:hover \.mode-play[^}]*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible/);
  assert.match(styles, /\.mode-hint\s*\{[^}]*font:[^;}]*var\(--font\)/);
});

test('types menu titles quickly and cancels stale hover animations', () => {
  const typing = functionSource('typeMenuTitle');
  assert.match(html, /\blet\s+menuTitleRun\s*=/);
  assert.match(typing, /\+\+menuTitleRun/);
  assert.match(typing, /run\s*!==\s*menuTitleRun/);
  assert.match(typing, /setTimeout\([^,]+,\s*22\s*\)/);
  assert.match(typing, /prefers-reduced-motion/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assert.match(titleScreen, /typeMenuTitle\(\s*title\s*\)/);
});

test('shows an accessible fullscreen recommendation when fullscreen is preferred', () => {
  assertAttributes(startTagById('fullscreenNotice'), {
    'aria-labelledby': /fullscreenNoticeTitle/,
  });
  assertAttributes(startTagById('fullscreenNoticeDismiss'), { type: /button/ });
  const notice = elementSourceById('fullscreenNotice');
  assert.match(notice, /Fullscreen recommended/);
  assert.match(notice, /For the best experience, use fullscreen mode/);
  assert.match(notice, />\s*Got it\s*</);
  const setup = functionSource('setupFullscreenNotice');
  assert.match(setup, /CONFIG\.displayMode\s*!==\s*['"]fullscreen['"]/);
  assert.match(setup, /\.showModal\(\)/);
  assert.match(setup, /\.close\(\)/);
  assert.match(setup, /keydown/);
  assert.match(setup, /event\.key\s*===\s*['"]Escape['"][\s\S]*notice\.close\(\)/);
  assert.match(html, /\bsetupFullscreenNotice\(\)\s*;/);
});

test('adds one non-overlapping Sandbox menu link and positions the existing Hide UI control', () => {
  assert.equal((html.match(/\bid=["']uiToggle["']/g) || []).length, 1);
  assertAttributes(startTagById('simBackLink'), { href: /#\/modes/ });
  assert.match(elementSourceById('simBackLink'), /Back to Menu/);
  const styles = section('<style>', '</style>');
  assert.match(styles, /#simBackLink\s*\{[^}]*position:\s*fixed[^}]*top:\s*16px[^}]*left:\s*16px/);
  assert.match(styles, /#infoPanel\s*\{[^}]*top:\s*58px/);
  assert.match(styles, /\.ui-eye\s*\{[^}]*position:\s*fixed[^}]*top:\s*16px[^}]*right:\s*344px/);
  assert.match(styles, /@media\s*\(max-width:\s*720px\)[\s\S]*?#ui\s*\{[^}]*top:\s*52px/);
  assert.match(styles, /@media\s*\(max-width:\s*440px\)[\s\S]*?\.ui-eye\s*\{[^}]*top:\s*12px[^}]*right:\s*12px/);
  assert.match(styles, /body\.ui-hidden[^}]*#simBackLink/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assert.match(titleScreen, /simBackLink['"]\)\.classList\.add\(\s*['"]visible['"]\s*\)/);
});

test('starts Solar mobile panels collapsed and expands the controller to the available width', () => {
  assertAttributes(startTagById('collapseBtn'), {
    'aria-expanded': /true/,
    'aria-label': /Collapse panel/,
  });

  const setup = functionSource('setupUI');
  const controllerToggle = listenerWindow(setup, 'collapseBtn', 'click');
  assert.match(controllerToggle, /classList\.toggle\(\s*['"]collapsed['"]\s*\)/);
  assert.match(controllerToggle, /setAttribute\(\s*['"]aria-expanded['"]/);
  assert.match(controllerToggle, /aria-label/);
  assert.match(controllerToggle, /\.title\s*=/);
  assert.match(setup, /window\.matchMedia\(\s*['"]\(max-width:\s*720px\)['"]\s*\)/);
  assert.match(setup, /mobileTimeline\.matches[\s\S]*collapseBtn['"]\)\.click\(\)[\s\S]*barCollapse['"]\)\.click\(\)/);

  const styles = section('<style>', '</style>');
  assert.match(
    styles,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?#ui:not\(\.collapsed\)\s*\{[^}]*left:\s*8px[^}]*right:\s*8px[^}]*width:\s*auto/,
  );
  assert.match(
    styles,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?#simBackLink,\s*\.ui-eye\s*\{[^}]*height:\s*28px[^}]*background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*\.10\s*\)/,
  );
});

test('enters fullscreen straight from the Got it acknowledgement', () => {
  const setup = functionSource('setupFullscreenNotice');
  assert.match(setup, /requestFullscreen\(\)/);
  assert.ok(setup.indexOf('notice.close()') < setup.indexOf('requestFullscreen()'),
    'The dialog must close before the fullscreen request so the gesture is not consumed by a stuck modal');
});

test('returns to the mode menu in-app without a reload', () => {
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assert.match(titleScreen, /simBackLink['"]\)[\s\S]*?addEventListener\(\s*['"]click['"]/);
  assert.match(titleScreen, /preventDefault\(\)/);
  const back = functionSource('returnToMenu');
  assert.match(back, /titleMode = true/);
  assert.match(back, /classList\.(?:add|toggle)\(\s*['"]modes['"]/);
  assert.match(back, /classList\.remove\(\s*['"]hidden['"]/);
  assert.match(back, /setCameraMode\(\s*['"]orbit['"]/);
  assert.doesNotMatch(back, /toggleImmersiveUI\(\)/, 'Returning to the menu must preserve the saved HUD preference');
});

test('cycles the title backdrop across every galaxy environment', () => {
  const cycle = functionSource('cycleTitleGalaxy');
  assert.match(cycle, /buildGalaxy\(\s*\(\s*currentGalaxy\s*\+\s*1\s*\)\s*%\s*GALAXIES\.length/);
  assert.match(cycle, /titleMode/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assert.match(titleScreen, /setInterval\(\s*cycleTitleGalaxy/);
});

test('flies the camera home when the user exits the info panel', () => {
  const exit = functionSource('exitInfoPanel');
  assert.match(exit, /closeInfoPanel\(\)/);
  assert.match(exit, /flyTo\(null\)/);
  assert.match(exit, /titleMode/);   // menu return must never trigger the homing flight
  assert.match(html, /ui\(['"]ipClose['"]\)\.addEventListener\(\s*['"]click['"],\s*exitInfoPanel\s*\)/);
  assert.match(html, /if \(infoTarget\) exitInfoPanel\(\)/);
});

test('starts As the Gods Will in the galaxy already shown behind mode selection', () => {
  const titleScreen = functionSource('setupTitleScreen');
  assert.doesNotMatch(titleScreen, /buildGalaxy\(\s*0\s*\)/);
  assert.doesNotMatch(titleScreen, /currentGalaxy\s*!==\s*0/);
  assert.match(runtime, /buildGalaxy\(0\);\s*setupPicking\(\)/, 'direct Solar boot still defaults to Milky Way');
});

test('lazily previews the real Big Bang and Creator scenes on hover and keyboard focus', () => {
  for (const [id, route] of [['bigbangPreview', 'big-bang'], ['creatorPreview', 'creator']]) {
    assertAttributes(startTagById(id), {
      class: /mode-preview/,
      'data-src': new RegExp(`\\?preview=1#\\/${route}`),
      'aria-hidden': /true/,
      tabindex: /-1/,
    });
  }
  const styles = section('<style>', '</style>');
  assert.match(styles, /\.mode-preview\s*\{[^}]*pointer-events:\s*none[^}]*opacity:\s*0/s);
  assert.match(styles, /\.mode-preview\.active\s*\{[^}]*opacity:\s*1/s);

  const show = functionSource('showModePreview');
  assert.match(show, /\.dataset\.src/);
  assert.match(show, /\.src\s*=/);
  assert.match(show, /querySelectorAll\(\s*['"]\.mode-preview['"]\s*\)/);
  assert.match(show, /classList\.toggle\(\s*['"]active['"]/);
  assert.match(show, /cosmicx:preview:resume/);
  assert.match(show, /cosmicx:preview:pause/);
  assert.match(functionSource('hideModePreview'), /classList\.remove\(\s*['"]active['"]/);

  const titleScreen = functionSource('setupTitleScreen');
  for (const [buttonId, previewId] of [['bigbangBtn', 'bigbangPreview'], ['creatorBtn', 'creatorPreview']]) {
    assert.match(titleScreen, new RegExp(`\\[['"]${buttonId}['"],\\s*['"]${previewId}['"]\\]`));
  }
  assert.match(titleScreen, /\['mouseenter',\s*'focus'\][\s\S]*showModePreview\(previewId\)/);
  assert.match(titleScreen, /\['mouseleave',\s*'blur'\][\s\S]*hideModePreview\(previewId\)/);
  assert.doesNotMatch(html, /function\s+buildTitlePreview\s*\(/);
  assert.doesNotMatch(html, /function\s+updateTitlePreview\s*\(/);
});

test('registers Triangulum as a fourth deterministic explorable galaxy', () => {
  const stubConfig = { distanceScale: 34, distanceExp: 0.55, particleDensity: 1, quality: 'high' };
  const stubQuality = { high: { density: 1 } };
  const { GALAXIES } = createSolarData(stubConfig, stubQuality);

  assert.equal(GALAXIES.length, 5);
  assert.equal(GALAXIES[0].name, 'Milky Way'); // Creator flow depends on index 0
  const tri = GALAXIES[3];
  assert.equal(tri.name, 'Triangulum');
  assert.equal(tri.starProfile, 'Triangulum');
  assert.ok(tri.star, 'Triangulum has a central star');
  assert.ok(tri.spiral, 'Triangulum declares spiral arms');
  assert.equal(tri.landmarks?.[0]?.name, 'NGC 604');

  let prevAu = 0;
  for (const def of tri.planets) {
    assert.ok(Number.isFinite(def.au) && def.au > prevAu, `${def.name} au ordered`);
    assert.ok(Number.isFinite(def.periodDays) && def.periodDays > 0, `${def.name} periodDays`);
    assert.ok(Number.isFinite(def.rotHours), `${def.name} rotHours`);
    prevAu = def.au;
  }
  const again = createSolarData(stubConfig, stubQuality).GALAXIES[3];
  const signature = defs => defs.map(({ name, au, periodDays, radiusE }) => ({ name, au, periodDays, radiusE }));
  assert.deepEqual(signature(again.planets), signature(tri.planets));

  assert.match(constantSource('STAR_SUMMARY_PROFILES'), /Triangulum/);
  assert.equal((constantSource('DISTANT_GALAXY_POSES').match(/dir:/g) || []).length, 5);
  assert.ok(!runtime.includes("'MilkyWay' : 'Andromeda'"), 'no hard-coded two-galaxy star ternary');
  assert.match(functionSource('buildGalaxy'), /g\.spiral/);
  assert.match(functionSource('buildGalaxy'), /g\.landmarks/);
});

test('registers Wormhole Galaxy as the fifth isolated sandbox environment', () => {
  const stubConfig = { distanceScale: 34, distanceExp: 0.55, particleDensity: 1, quality: 'high' };
  const stubQuality = { high: { density: 1 } };
  const { GALAXIES } = createSolarData(stubConfig, stubQuality);
  const wormhole = GALAXIES[4];

  assert.equal(GALAXIES[0].name, 'Milky Way');
  assert.equal(wormhole.name, 'Wormhole Galaxy');
  assert.equal(wormhole.type, 'Fictional traversable wormhole');
  assert.equal(wormhole.stars, 'Uncharted star field');
  assert.deepEqual(wormhole.wormhole, { mass: 1800, throatRadius: 18 });
  assert.equal(wormhole.star, null);
  assert.equal(wormhole.belt, false);
  assert.deepEqual(wormhole.planets.map(planet => planet.name), [
    'Nexus-I', 'Nexus-II', 'Nexus-III', 'Nexus-IV', 'Nexus-V',
  ]);
});

test('exposes accessible Wormhole-only physics controls in the Sim tab', () => {
  assertAttributes(startTagById('wormholeControls', template), { hidden: null });
  assertAttributes(startTagById('wormholePull', template), {
    type: /range/, min: /^0\.25$/, max: /^3$/, step: /^0\.05$/,
  });
  assertAttributes(startTagById('wormholeThroat', template), {
    type: /range/, min: /^0\.5$/, max: /^2$/, step: /^0\.05$/,
  });
  assertAttributes(startTagById('wormholeExitVelocity', template), {
    type: /range/, min: /^0\.5$/, max: /^2$/, step: /^0\.05$/,
  });
  for (const id of ['wormholePull', 'wormholeThroat', 'wormholeExitVelocity']) {
    assert.match(startTagById(id, template), /aria-label=/);
  }
});

test('keeps the Wormhole physics controls on the Sim tab vertical rhythm', () => {
  const styles = section('<style>', '</style>');
  assert.match(
    styles,
    /#wormholeControls\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*gap:\s*13px/,
  );
});

test('integrates Wormhole visuals, physics, teleportation, and lifecycle without changing black holes', () => {
  const spawn = functionSource('spawnWormhole');
  const build = functionSource('buildGalaxy');
  const dynamics = functionSource('updateDynamics');
  const clear = functionSource('clearSpawned');
  const refresh = functionSource('refreshGalaxyInfo');
  const selfCheck = functionSource('runSelfCheck');

  assertContracts(spawn, {
    identity: /isWormhole\s*:\s*true/,
    baseGravity: /baseGM/,
    baseRadius: /baseHorizonR/,
    exitVelocity: /exitVelocity/,
    rings: /rings/,
    funnel: /funnel/,
  });
  assert.match(build, /g\.wormhole[\s\S]*spawnWormhole/);
  assert.match(functionSource('applyWormholePhysics'), /wormholePull[\s\S]*wormholeThroat[\s\S]*wormholeExitVelocity/);
  assert.match(refresh, /wormholeControls[\s\S]*hidden/);

  const firstTransit = dynamics.indexOf('teleportBodyThroughWormhole');
  const collisionGate = dynamics.indexOf('if (CONFIG.collisions)');
  assert.ok(firstTransit >= 0 && firstTransit < collisionGate, 'body teleportation remains independent of collisions');
  assert.match(dynamics, /teleportBodyThroughWormhole\(rec/);
  assert.match(dynamics, /bh\.isWormhole[\s\S]*continue/);
  assert.match(clear, /blackHole\s*\|\|\s*GALAXIES\[currentGalaxy\]\.wormhole/);
  assert.match(selfCheck, /wormholeControls/);
  assert.match(functionSource('bodyTypeLabel'), /isWormhole[\s\S]*Wormhole/);
  assert.match(functionSource('buildObjectSummary'), /record\.isWormhole[\s\S]*Fictional wormhole simulator model/);
});

test('opens zodiac dossiers and restores the pre-selection camera pose', () => {
  const constellations = functionSource('createConstellations');
  assertContracts(constellations, {
    record: /isConstellation\s*:\s*true/,
    catalogData: /sign\s*:\s*p\.sign/,
    scale: /geoR\s*:\s*p\.scale/,
    starTarget: /pickTargets\.push\(\s*stars\s*\)/,
    lineTarget: /pickTargets\.push\(\s*links\s*\)/,
    starRecord: /byMesh\.set\(\s*stars\s*,\s*record\s*\)/,
    lineRecord: /byMesh\.set\(\s*links\s*,\s*record\s*\)/,
  });

  assert.match(runtime, /raycaster\.params\.Points\.threshold\s*=\s*8/);
  assert.match(runtime, /raycaster\.params\.Line\.threshold\s*=\s*8/);
  assert.match(functionSource('viewDistance'), /rec\.isConstellation[\s\S]*?rec\.geoR\s*\*\s*3/);

  const picking = functionSource('setupPicking');
  assertContracts(picking, {
    oneTimePose: /if\s*\(\s*!zodiacReturnPose\s*\)/,
    position: /position\s*:\s*camera\.position\.clone\(\)/,
    target: /target\s*:\s*controls\.target\.clone\(\)/,
    mode: /mode\s*:\s*cameraState\.mode/,
    zodiacFlight: /record\.isConstellation[\s\S]*?flyTo\(\s*record\s*\)/,
    nonZodiacCleanup: /else\s*\{[\s\S]*?zodiacReturnPose\s*=\s*null[\s\S]*?cameraState\.target\s*=\s*record/,
  });

  const exactFlight = functionSource('flyToPose');
  assert.match(exactFlight, /flight\.destination\s*=\s*pose/);
  const updateFlight = functionSource('updateFlight');
  assert.match(updateFlight, /flight\.destination[\s\S]*?endPos\.copy\(\s*destination\.position\s*\)/);
  assert.match(updateFlight, /endTgt\.copy\(\s*destination\.target\s*\)/);
  assert.match(updateFlight, /setCameraMode\(\s*destination\.mode\s*\)/);

  const exit = functionSource('exitInfoPanel');
  assert.match(exit, /infoTarget\?\.isConstellation\s*\?\s*zodiacReturnPose\s*:\s*null/);
  assert.match(exit, /flyToPose\(\s*returnPose\s*\)/);
  assert.match(functionSource('closeInfoPanel'), /zodiacReturnPose\s*=\s*null/);

  const typeLabel = functionSource('bodyTypeLabel');
  assert.match(typeLabel, /record\.isConstellation[\s\S]*?Zodiac constellation/);

  const dossier = functionSource('openInfoPanel');
  assert.match(dossier, /record\.isConstellation/);
  for (const field of ['symbol', 'element', 'dates', 'brightest', 'lore']) {
    assert.match(dossier, new RegExp(`sign\\.${field}`), `Dossier uses zodiac ${field}`);
  }

  const summary = functionSource('buildObjectSummary');
  assert.match(summary, /record\.isConstellation[\s\S]*?Traditional zodiac reference/);
  assert.match(summary, /showMetrics\s*:\s*!record\?\.isConstellation/);
  assert.match(functionSource('refreshBottomInfoBar'), /summary\.showMetrics/);
  assert.match(
    functionSource('runSelfCheck'),
    /selectedRecord\?\.isConstellation[\s\S]*?registeredSet\.has\(\s*selectedRecord\s*\)/,
  );
});

test('wires the customizable laser tab into the control panel', () => {
  assert.match(html, /<div class="tool-group" data-group="laser">/);
  const page = section('<div class="tool-group" data-group="laser">', '<div class="tab-page" data-page="scene">');
  for (const id of ['laserTarget', 'laserWidth', 'laserColor', 'laserPower', 'laserDuration', 'laserDestructive', 'fireLaser']) {
    assert.ok(page.includes(`id="${id}"`), `laser page has ${id}`);
  }
  assertAttributes(startTagById('laserColor', page), { type: /^color$/, 'aria-label': /.+/ });

  const fire = functionSource('fireLaser');
  assertContracts(fire, {
    cooldownGuard: /laserCooldown > 0/,
    titleGuard: /titleMode/,
    destructive: /destroyPlanet\(/,
    scorch: /addCrater\(/,
    effect: /createLaserEffect\(/,
  });
  assert.match(functionSource('refreshImpactTargets'), /laserTarget/);
  assert.match(functionSource('updateEffects'), /'laser'/);
  assert.ok(/KeyF/.test(runtime), 'F key fires the laser');
});

test('adds cursor-tracked laser mode without changing single-shot mode', () => {
  const page = section('<div class="tool-group" data-group="laser">', '<div class="tab-page" data-page="scene">');
  const holdToggle = startTagById('cursorLaserMode', page);
  assertAttributes(holdToggle, { type: /^checkbox$/, 'aria-label': /cursor laser mode/i });
  assert.doesNotMatch(holdToggle, /\schecked(?:\s|>)/i, 'cursor mode defaults off');
  assert.match(runtime, /cursorLaserMode:\s*false/);

  const fire = functionSource('fireLaser');
  assertContracts(fire, {
    zeroArg: /function fireLaser\(\)/,
    cooldownGuard: /laserCooldown > 0/,
    titleGuard: /titleMode/,
    destructive: /destroyPlanet\(/,
    scorch: /addCrater\(/,
    effect: /createLaserEffect\(/,
  });
  assertContracts(functionSource('stopCursorLaser'), {
    releaseState: /cursorLaserActive\s*=\s*false/,
    immediateCleanup: /disposeLaserEffect\(heldLaserEffect\)/,
    clearReference: /heldLaserEffect\s*=\s*null/,
    normalCursor: /style\.cursor\s*=\s*['"]['"]/
  });
  assertContracts(functionSource('disableCursorLaserMode'), {
    stop: /stopCursorLaser\(\)/,
    unchecked: /(?:toggle|ui\(\s*['"]cursorLaserMode['"]\s*\))\.checked\s*=\s*false/,
    disarmed: /uiParams\.cursorLaserMode\s*=\s*false/,
  });
  assertContracts(functionSource('updateCursorLaserAim'), {
    raycast: /raycaster\.intersectObjects\(pickTargets/,
    point: /hit\.point/,
    range: /CURSOR_LASER_RANGE/,
    pose: /placeLaser\(heldLaserEffect\)/,
  });
  assertContracts(functionSource('isCursorLaserTarget'), {
    targetFilter: /isMoon|isBody/,
    exclusion: /isSun|isBH|isConstellation|isGalaxy/,
  });
  assert.match(runtime, /const CURSOR_LASER_RANGE\s*=\s*1600/);
  assert.match(runtime, /cursorLaserMotion[\s\S]*?velocity/);
  assertContracts(functionSource('resetCursorLaserMotion'), {
    resetPoint: /point\.set\(0,\s*0,\s*0\)/,
    resetVelocity: /velocity\.set\(0,\s*0,\s*0\)/,
  });
  assertContracts(functionSource('updateCursorLaserAim'), {
    delta: /dt\s*=\s*1\s*\/\s*60/,
    spring: /cursorLaserMotion\.velocity[\s\S]*?Math\.exp/,
    visualPoint: /cursorLaserMotion\.point/,
    trail: /cursorLaserMotion\.velocity\.length\(\)/,
  });
  assert.match(functionSource('update'), /cursorLaserActive[\s\S]*?updateCursorLaserAim\([^)]*\)/);
  assert.match(functionSource('update'), /cursorLaserActive[\s\S]*?laserCooldown\s*<=\s*0[\s\S]*?applyCursorLaserDamage/);

  const setup = functionSource('setupUI');
  assert.match(setup, /bindSwitch\(\s*['"]cursorLaserMode['"]/);
  assert.match(setup, /fireButton\.addEventListener\(\s*['"]click['"][\s\S]*?fireLaser\(\)/);
  assert.doesNotMatch(setup, /fireButton\.addEventListener\(\s*['"]pointerdown/);
  assert.match(setup, /event\.code\s*===\s*['"]KeyF['"][\s\S]*?fireLaser\(\)/);
  assert.doesNotMatch(setup, /startCursorLaser\(\)/);
  assert.match(setup, /tab\.dataset\.tab[\s\S]*?disableCursorLaserMode\(\)/);
  assert.match(setup, /collapseBtn[\s\S]*?disableCursorLaserMode\(\)/);
  assert.match(functionSource('setHudVisible'), /hidden[\s\S]*?disableCursorLaserMode\(\)/);
  const picking = functionSource('setupPicking');
  assert.match(picking, /scope\.listen\(renderer\.domElement,\s*['"]pointerdown['"][\s\S]*?capture\s*:\s*true/);
  assert.match(picking, /setPointerCapture\(/);
  assert.match(picking, /stopImmediatePropagation\(\)/);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) assert.match(picking, new RegExp(event));
  assert.match(functionSource('buildGalaxy'), /disableCursorLaserMode\(\)/);
  assert.match(functionSource('pause'), /stopCursorLaser\(\)/);
  assert.match(functionSource('destroy'), /disableCursorLaserMode\(\)/);
  assert.match(functionSource('stopCursorLaser'), /resetCursorLaserMotion\(\)/);
});

test('layers color-preserving cinematic laser visuals without changing targeting', () => {
  const create = functionSource('createLaserEffect');
  assert.match(create, /new THREE\.ShaderMaterial/);
  assert.match(create, /uColor/);
  assert.match(create, /uTime/);
  assert.match(create, /PointsMaterial/);
  assert.match(create, /LineSegments|Line\(/);
  assert.match(create, /cursorAimed/);
  assert.match(create, /velocity|trail/);

  const update = functionSource('updateLaserVisuals');
  assert.match(update, /flowMat|energyFlow/);
  assert.match(update, /visualTime/);
  assert.match(update, /particles|spark/);
  assert.match(update, /arc/);
  assert.match(update, /cursorAimed[\s\S]*?velocity|trail/);

  const dispose = functionSource('disposeLaserEffect');
  assert.match(dispose, /flowMat|energyFlow/);
  assert.match(dispose, /particle|spark/);
  assert.match(dispose, /arc/);
});

test('ramps each laser beam from the emitter before reaching its endpoint', () => {
  const create = functionSource('createLaserEffect');
  assert.match(create, /beamProgress\s*:\s*0/);
  assert.match(create, /beamEnd/);
  assert.match(create, /beamDuration/);
  assert.match(create, /cursorAimed\s*\?\s*LASER_FIRE_RAMP/);
  assert.match(runtime, /LASER_FIRE_RAMP\s*=\s*1(?:\.0)?/);
  const update = functionSource('updateEffects');
  assert.match(update, /beamProgress[\s\S]*?beamDuration/);
  assert.match(update, /ramp\s*=\s*fx\.beamProgress/);
  assert.match(update, /beamEnd[\s\S]*?fx\.end\.copy/);
  assert.match(functionSource('updateCursorLaserAim'), /beamEnd\.copy/);
});

test('wraps the beam in re-striking lightning that bends with a fast cursor', () => {
  const create = functionSource('createLaserEffect');
  // every tube layer bends off one shader uniform — no per-frame geometry rebuild
  assert.match(create, /uBend/);
  assert.match(create, /CylinderGeometry\([^)]*,\s*(?:[2-9]\d|\d{3,}),\s*true\)/);
  assert.match(create, /arcs\.push\(/);
  assert.match(create, /nextStrike/);
  assert.match(create, /muzzle/);
  assert.match(create, /bend:\s*new THREE\.Vector3\(\)/);

  const visuals = functionSource('updateLaserVisuals');
  assert.match(visuals, /for\s*\(const bolt of fx\.arcs\)/);
  assert.match(visuals, /visualTime >= bolt\.nextStrike/);
  assert.match(visuals, /bolt\.seeds\[i\] = Math\.random\(\)/);
  assert.match(visuals, /beamBendOffset\(fx/);
  // stand-off is length-relative, so a thin beam does not swallow its own bolts
  assert.match(visuals, /beamLen \* [\d.]+/);
  // geometric spacing spreads the jitter along the body instead of bunching it
  // at the impact point, where perspective crowds evenly spaced world points
  assert.match(visuals, /ARC_NEAR \* Math\.pow\(1 \/ ARC_NEAR, q\)/);
  assert.match(runtime, /const ARC_NEAR\s*=\s*0?\.\d+/);

  const bend = functionSource('updateBeamBend');
  assertContracts(bend, {
    perpendicular: /dot\(velocity\)/,
    clamped: /Math\.min\(len \* [\d.]+/,
    localFrame: /applyQuaternion/,
    noAxialStretch: /fx\.bend\.y = 0/,
    layers: /flowMat\.uniforms\.uBend/,
  });
  assert.match(functionSource('updateCursorLaserAim'), /updateBeamBend\(heldLaserEffect/);
  assert.doesNotMatch(functionSource('fireLaser'), /updateBeamBend/);

  // growth eases out of the muzzle and lands while the beam is still alive
  const update = functionSource('updateEffects');
  assert.match(update, /grow = ramp \* ramp \* \(3 - 2 \* ramp\)/);
  assert.match(update, /fx\.end\.copy\(fx\.start\)\.lerp\(fx\.beamEnd, grow\)/);
  assert.match(update, /arrivalFlash/);
  assert.match(create, /maxLife \* 0\.45/);
});
