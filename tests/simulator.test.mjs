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
    spawnNEA: /ui\(\s*['"]spawnNEA['"]\s*\)\s*\.addEventListener\(\s*['"]click['"]\s*,\s*\(\s*\)\s*=>\s*spawnNEA\(\s*\)\s*\)/,
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
