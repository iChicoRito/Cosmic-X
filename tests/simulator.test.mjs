import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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

test('keeps the inline simulator module syntactically valid', () => {
  const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(moduleMatch, 'Missing inline module script');
  const source = moduleMatch[1].replace(/^\s*import .*;$/gm, '');
  assert.doesNotThrow(() => new Function(source));
});

test('gives every simulation toggle an accessible name', () => {
  const ids = ['playing', 'trails', 'labels-toggle', 'collisions', 'belt-toggle', 'nebula-toggle'];
  const missing = ids.filter(id => !new RegExp(`<input[^>]*id=["']${id}["'][^>]*aria-label=["'][^"']+["']`).test(html));
  assert.deepEqual(missing, [], `Unnamed static toggles: ${missing.join(', ')}`);

  const planetGrid = section('function refreshPlanetGrid() {', 'function refreshImpactTargets() {');
  assert.match(planetGrid, /setAttribute\(\s*['"]aria-label['"]\s*,\s*['"]Toggle ['"]\s*\+\s*rec\.def\.name/);
});

test('keeps only switches, sliders, progress bars, and badges rounded', () => {
  const styles = section('<style>', '</style>');
  assert.match(styles, /--glass-bg:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)\s*;/);
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
  assert.equal((styles.match(/\bborder-radius\s*:/g) || []).length, 13);
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
  const camera = section('const CAMERA_MODES =', '/* ================================================================\n   UI');
  assertContracts(setupUI, {
    modeButtons: /\.cam-btn[\s\S]*addEventListener\(\s*['"]click['"][\s\S]*setCameraMode\(/,
    targetSelect: /ui\(\s*['"]camTarget['"]\s*\)\s*\.addEventListener\(\s*['"]change['"]/,
    telescopeZoom: /(?:bindSlider\(\s*['"]teleZoom['"]|ui\(\s*['"]teleZoom['"]\s*\)\s*\.addEventListener\(\s*['"]input['"])/,
  });
  assert.match(html, /addEventListener\(\s*['"]keydown['"]/);
  assert.match(html, /addEventListener\(\s*['"]keyup['"]/);
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

test('requests fullscreen from Start with a non-blocking fallback', () => {
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assertContracts(titleScreen, {
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
  const warningMath = section('function closestApproach(', 'function updateImpactWarnings(');
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
  const debugHandle = section('window.solar = {', '</script>');
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
  });
});

test('offers the Big Bang mode from the title screen', () => {
  const title = elementSourceById('title');
  assert.ok(/id=["']startBtn["']/.test(title), 'Missing startBtn in #title');
  assert.ok(/id=["']bigbangBtn["']/.test(title), 'Missing bigbangBtn in #title');
  assert.match(title, /Become the Creator/);
  assert.match(title, /Before the Stars/);
  const titleScreen = section('function setupTitleScreen() {', 'const clock = new THREE.Clock();');
  assertContracts(titleScreen, {
    navTarget: /bigbang\.html/,
    fadeBeforeNav: /fade['"]\)[\s\S]*?classList\.add\(\s*['"]on['"]\s*\)[\s\S]*?bigbang\.html/,
  });
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

test('isolates the menu title crossfade from the glow loop and reverts at the grid edge', () => {
  assert.ok(/id=["']titleText["']/.test(elementSourceById('title')), 'Missing titleText span');
  const styles = section('<style>', '</style>');
  assert.match(styles, /#titleText\.swap/);
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
