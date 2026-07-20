import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const template = read('../src/pages/creator/template.js');
const runtime = read('../src/pages/creator/runtime.js');
const css = read('../src/pages/creator/creator.css');
const page = read('../src/pages/creator/page.js');
const router = read('../src/router.js');
const main = read('../src/main.js');

function startTagById(source, id) {
  const tag = new RegExp(`<[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(source);
  assert.ok(tag, `Missing element with id: ${id}`);
  return tag[0];
}

test('creator runtime module is syntactically valid', async () => {
  // page.js imports creator.css?inline, which node cannot resolve; the runtime
  // is the substantive module and is verified by import here (matches bigbang.test).
  const rt = await import('../src/pages/creator/runtime.js');
  assert.equal(typeof rt.createCreatorRuntime, 'function');
  assert.match(page, /export function mount\(/);
});

test('registers the /creator route and lazy page loader', () => {
  assert.match(router, /\['\/creator',\s*\{\s*page:\s*'creator'/);
  assert.match(main, /creator:\s*\(\)\s*=>\s*import\('\.\/pages\/creator\/page\.js'\)/);
});

test('title screen offers the creation entry point and a Modes back link', () => {
  startTagById(template, 'crTitle');
  startTagById(template, 'crCreateBtn');
  const back = startTagById(template, 'creatorBackLink');
  assert.match(back, /href=["']#\/modes["']/);
});

test('wizard exposes type, structure, population and physics steps', () => {
  for (const id of ['crWizard', 'crTypeGrid', 'crStepStructure', 'crStepPopulation',
    'crStepPhysics', 'crNameInput', 'crGenerateBtn']) {
    startTagById(template, id);
  }
});

test('HUD covers transport, tool panels, inspector and save controls', () => {
  for (const id of ['crHud', 'crTransport', 'crPauseBtn', 'crSpeeds', 'crYears',
    'crToolbar', 'crPanel', 'crStatsList', 'crEncList', 'crInspector', 'crScanBtn',
    'crSaveBtn', 'crExportBtn', 'crImportFile', 'crShotBtn']) {
    startTagById(template, id);
  }
});

test('FX tab exposes live graphics controls like the As the Gods Will FX tab', () => {
  assert.match(template, /data-panel="fx"/);
  for (const id of ['crFxPanel', 'crFxQuality', 'crFxSliders', 'crFxNebulae', 'crFxClusters', 'crFxTwinkle']) {
    startTagById(template, id);
  }
  // controls drive the renderer/scene through applyFx
  assert.match(runtime, /function applyFx\(\)/);
  assert.match(runtime, /bloomPass\.strength = fx\.bloom/);
  assert.match(runtime, /renderer\.setPixelRatio/);
});

test('the six galaxy types are defined with encyclopedia entries', () => {
  const model = read('../src/pages/creator/galaxy-model.js');
  const systems = read('../src/pages/creator/systems.js');
  for (const id of ['spiral', 'barred', 'elliptical', 'lenticular', 'irregular', 'ring']) {
    assert.match(model, new RegExp(`id:\\s*'${id}'`), `galaxy type ${id} defined`);
    assert.match(systems, new RegExp(`galaxy-${id}`), `encyclopedia entry galaxy-${id}`);
  }
});

test('exposes the seven simulation speeds up to one million', () => {
  const evolution = read('../src/pages/creator/evolution.js');
  assert.match(evolution, /SPEEDS\s*=\s*\[1,\s*2,\s*10,\s*100,\s*1000,\s*1000000\]/);
});

test('publishes the headless debug handle with step and render', () => {
  assert.match(runtime, /window\.creator\s*=\s*\{[\s\S]*?step:[\s\S]*?render:/);
  // task 15 additions — the verification surface for the system view and codex
  for (const member of ['enterSystem', 'exitSystem', 'focusCodex']) {
    assert.match(runtime, new RegExp(`window\\.creator\\s*=\\s*\\{[\\s\\S]*?${member}`), member);
  }
});

test('entering a stellar system swaps to a dedicated lit scene', () => {
  const view = read('../src/pages/creator/system-view.js');
  assert.match(view, /export function createSystemView\(/);
  // its own scene, camera and controls — never borrowing the galaxy's
  assert.match(view, /new THREE\.Scene\(\)/);
  assert.match(view, /new THREE\.PerspectiveCamera\(/);
  assert.match(view, /new OrbitControls\(camera, renderer\.domElement\)/);
  // lit spheres are what make it read as a solar system rather than sprites
  assert.match(view, /new THREE\.PointLight\(/);
  assert.match(view, /MeshStandardMaterial/);
  assert.match(view, /systemViewLayout/);
  // one composer, one render pass, retargeted — not a second post chain
  assert.match(view, /renderPass\.scene = scene/);
  assert.match(view, /renderPass\.scene = galaxyScene/);

  // the runtime owns the transition and the fourth view state
  assert.match(runtime, /function enterSystem\(/);
  assert.match(runtime, /function exitSystem\(/);
  assert.match(runtime, /state\.view === 'system'/);
  assert.match(runtime, /const renderPass = new RenderPass\(scene, camera\)/);
  assert.match(runtime, /createSystemView\(\{[\s\S]*?renderPass/);
  assert.match(runtime, /'dblclick'/, 'double-click enters a system');
  // the pre-entry camera pose is restored on the way out
  assert.match(runtime, /galaxyReturnPose/);
  // teardown must reach the second scene before the shared disposal helper
  assert.match(runtime, /systemView\.destroy\(\)[\s\S]*?disposeThreeRuntime/);
});

test('the placement tool stays armed and highlighted across placements', () => {
  assert.match(runtime, /function setPlacing\(/);
  assert.match(runtime, /classList\.toggle\('on', btn\.dataset\.kind === kind\)/);
  assert.match(runtime, /function bumpPlacingHint\(/);
  // the old one-shot disarm must be gone from the placement branch
  const place = /if \(state\.placing\) \{[\s\S]*?\n  \}/.exec(runtime);
  assert.ok(place, 'placement branch present');
  assert.doesNotMatch(place[0], /state\.placing = null/, 'placement no longer disarms the tool');
  assert.match(css, /\.cr-btn\.on\s*\{/);
});

test('codex entries stay clickable but never hide their descriptions', () => {
  assert.match(runtime, /function focusCodexEntry\(/);
  assert.match(runtime, /createElement\('button'\)[\s\S]*?cr-enc-entry/);
  assert.match(runtime, /dataset\.entry = entry\.id/);
  assert.match(runtime, /scrollIntoView/);
  assert.match(runtime, /state\.codexFocus/);
  // Task 16 reverted the accordion: the collapse rule must stay gone, or the
  // wall-of-text fix silently turns back into hidden content.
  assert.doesNotMatch(css, /\.cr-enc-entry[^{]*:not\(\.on\)[^{]*p\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(runtime, /btn\.setAttribute\('aria-expanded'/);
  // both title and body are always emitted for an unlocked entry
  assert.match(runtime, /<b>\$\{entry\.title\}<\/b><p>\$\{entry\.body\}<\/p>/);
});

test('the HUD swaps tool sets when you step inside a system', () => {
  for (const id of ['crBodiesPanel', 'crViewPanel', 'crCamPanel', 'crBodyList', 'crCamGrid', 'crCamTarget']) {
    startTagById(template, id);
  }
  for (const panel of ['bodies', 'view', 'cam']) {
    assert.match(template, new RegExp(`data-panel="${panel}"`), `${panel} tab`);
  }
  // every panel declares the context it belongs to, and tabs are hidden rather
  // than merely disabled when they do not apply
  assert.match(runtime, /where: 'galaxy'/);
  assert.match(runtime, /where: 'system'/);
  assert.match(runtime, /where: 'both'/);
  assert.match(runtime, /function panelInContext\(/);
  assert.match(runtime, /tab\.hidden = !panelInContext/);
  // the galaxy-side tab is remembered across a visit
  assert.match(runtime, /galaxyPanelMemory/);
});

test('system exploration offers Solar-style camera modes and body controls', () => {
  const view = read('../src/pages/creator/system-view.js');
  assert.match(view, /export const CAMERA_MODES/);
  for (const mode of ['orbit', 'free', 'follow', 'cinematic']) {
    assert.match(view, new RegExp(`id: '${mode}'`), `camera mode ${mode}`);
  }
  assert.match(view, /function updateFree\(/);
  assert.match(view, /function updateCinematic\(/);
  assert.match(view, /function setCameraMode\(/);
  assert.match(view, /listTargets\(\)/);
  assert.match(view, /setBodyVisible\(/);
  assert.match(view, /setPlanetScale\(/);
  assert.match(view, /setOrbitScale\(/);
  // moons are individually pickable, not decoration
  assert.match(view, /type: 'moon'/);
  assert.match(runtime, /function moonFacts\(/);
  assert.match(runtime, /function buildPlanetExtras\(/);
  assert.match(css, /\.cr-hab-thumb/);
  assert.match(css, /\.cr-atmo-bar/);
});

test('created worlds get procedural surfaces, atmospheres and dusty orbits', () => {
  const textures = read('../src/pages/creator/planet-textures.js');
  const view = read('../src/pages/creator/system-view.js');
  assert.match(textures, /export function createPlanetSurface\(/);
  assert.match(textures, /export function createStarSurface\(/);
  assert.match(textures, /export function createRingTexture\(/);
  assert.match(textures, /export function makeAtmosphere\(/);
  // seamless wrap comes from the shared helper, not a page-local copy
  assert.match(textures, /tileFbm/);
  assert.match(read('../src/shared/procedural-canvas.js'), /export function tileFbm\(/);
  assert.doesNotMatch(read('../src/pages/solar/runtime.js'), /^function tileFbm\(/m);
  // orbits are Points with jitter, not a bare LineLoop
  assert.match(view, /function orbitTrail\(/);
  assert.match(view, /new THREE\.Points\(/);
  assert.doesNotMatch(view, /LineLoop/);
  assert.match(view, /makeAtmosphere\(/);
});

test('labels ride a CSS2D layer that never eats canvas clicks', () => {
  assert.match(runtime, /CSS2DRenderer/);
  assert.match(runtime, /CSS2DObject/);
  assert.match(runtime, /domElement\.id = 'crLabels'/);
  assert.match(runtime, /function makeLabel\(/);
  // systems and placed objects both get a plate
  assert.match(runtime, /makeLabel\(system\.name/);
  assert.match(runtime, /makeLabel\(objectLabelFor\(obj\)/);
  assert.match(runtime, /function objectLabelFor\(/);
  // the layer follows whichever scene is live
  assert.match(runtime, /labelRenderer\.render\(systemView\.scene, systemView\.camera\)/);
  assert.match(runtime, /labelRenderer\.domElement\.remove\(\)/);
  assert.match(css, /#crLabels[^}]*pointer-events: none/);
  assert.match(css, /\.cr-label[^}]*pointer-events: none/);
});

test('glow is dialled back so planetary detail survives the bloom pass', () => {
  // threshold well above the old 0.18, which bloomed essentially every pixel
  const bloom = /new UnrealBloomPass\(\s*new THREE\.Vector2\([^)]*\), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(runtime);
  assert.ok(bloom, 'bloom pass constructed with explicit constants');
  const [, strength, , threshold] = bloom;
  assert.ok(Number(strength) <= 0.7, `bloom strength ${strength} stays modest`);
  assert.ok(Number(threshold) >= 0.4, `bloom threshold ${threshold} spares midtones`);
  assert.match(runtime, /bloom: 0\.62/, 'the FX slider default matches the pass');
  // highlights are compressed per-page; the shared shader default is untouched
  assert.match(runtime, /clampPass\.uniforms\.uCap\.value = 1\.6/);
  assert.doesNotMatch(read('../src/shared/postprocessing-shaders.js'), /uCap:\s*\{\s*value:\s*1\.6/);
  // the star halo no longer swallows its inner planets
  assert.match(runtime, /glow\.scale\.setScalar\(size \* 3\)/);
});

test('the entered system gets a layered environment, flare pass and tails', () => {
  const fx = read('../src/pages/creator/system-fx.js');
  const view = read('../src/pages/creator/system-view.js');
  for (const fn of ['createSystemSky', 'createDustFields', 'createStarAura',
    'createCometTail', 'createWakeMaterial', 'createLensFlareShader',
    'createShockwave', 'disposeFxTextures']) {
    assert.match(fx, new RegExp(`export function ${fn}\\(`), `fx export ${fn}`);
  }
  // layers animate via GPU uniforms, not per-particle CPU writes
  assert.match(fx, /uTime/);
  assert.match(fx, /gl_PointSize/);
  // the star aura stays rim-only so a transiting planet is never washed out
  assert.match(fx, /side: THREE\.BackSide/);
  // the view builds env per system and drops the old flat backdrop
  assert.match(view, /buildEnv\(target\)/);
  assert.match(view, /createDustFields\(\{ edge: layout\.edge/);
  assert.doesNotMatch(view, /function buildBackdrop\(/);
  // comet tails aim anti-starward every frame, spawned comets included
  assert.match(view, /createCometTail\(/);
  assert.match(view, /tail\.aim\(/);
  assert.match(view, /body\.tail/);
  // orbit lanes carry the wake shader with a per-frame head angle
  assert.match(view, /createWakeMaterial\(\)/);
  assert.match(view, /uniforms\.uHead\.value/);
  // flare: occlusion raycast + edge fade drive the composer pass uniforms
  assert.match(view, /function updateFlare\(/);
  assert.match(view, /raycaster\.intersectObjects\(planetNodes, false\)/);
  assert.match(view, /flarePass\.uniforms\.uStrength\.value/);
  // runtime inserts the pass before lensing and gates it on view + quality
  assert.match(runtime, /createLensFlareShader/);
  assert.match(runtime, /flarePass\.enabled = state\.view === 'system' && fx\.quality > 1/);
  assert.match(runtime, /systemView\.setFx\(\{/);
  // moons trade flat grey for cached cratered surfaces
  assert.match(view, /createPlanetSurface\('dwarf'/);
  // impacts ride an expanding shockwave ring
  assert.match(view, /createShockwave\(at, size \* 2\.2, dynGroup\)/);
  // destroy() clears the module-level fx texture singletons
  assert.match(view, /disposeFxTextures\(\)/);
});

test('destroy disposes Three.js resources and the resource scope', () => {
  assert.match(runtime, /function destroy\(\)/);
  assert.match(runtime, /scope\.destroy\(\)/);
  assert.match(runtime, /disposeThreeRuntime\(\{\s*scene,\s*controls,\s*composer,\s*renderer\s*\}\)/);
  assert.match(runtime, /delete window\.creator/);
});

test('the screenshot uses a synchronous canvas capture, not an async API', () => {
  assert.match(runtime, /renderer\.domElement\.toDataURL\('image\/png'\)/);
});

test('creator styles reuse the shared glass tokens and hide chrome in preview', () => {
  assert.match(css, /--glass-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.60\)/);
  assert.match(css, /--font-display:\s*'Space Grotesk'/);
  assert.match(css, /\.preview[^{]*#crHud/);
});

test('page injects a route-scoped stylesheet and delegates to the runtime', () => {
  assert.match(page, /data-route-style="creator"/);
  assert.match(page, /createCreatorRuntime/);
  assert.match(page, /runtime\.destroy\(\)/);
});

test('the god-mode tools show up as system-only Spawn / Impact / Laser panels', () => {
  for (const id of ['crSpawnPanel', 'crImpactPanel', 'crLaserPanel',
    'crSpawnAsteroid', 'crSpawnComet', 'crSpawnBH', 'crClearSpawned',
    'crImpactTarget', 'crLaunchBtn', 'crLaserTarget', 'crFireLaser']) {
    startTagById(template, id);
  }
  for (const panel of ['spawn', 'impact', 'laser']) {
    assert.match(template, new RegExp(`data-panel="${panel}"`), `${panel} tab`);
    assert.match(runtime, new RegExp(`${panel}: \\{ el: 'cr${panel[0].toUpperCase()}${panel.slice(1)}Panel', title: '[^']+', where: 'system' \\}`), `${panel} PANELS entry`);
  }
  // the transport's speed pips are re-mapped to gentle in-system rates
  assert.match(runtime, /const SYSTEM_SPEEDS = \[/);
  assert.match(runtime, /systemView\.update\(dt, \{ simScale/);
  // F fires the laser, and the button shares one code path with the key
  assert.match(runtime, /function fireLaserFromUI\(/);
  assert.match(runtime, /event\.key === 'f' \|\| event\.key === 'F'\) && systemView\.active/);
});

test('the system scene carries a full gravity + spawn + impact + laser substrate', () => {
  const view = read('../src/pages/creator/system-view.js');
  for (const fn of ['gravityAt', 'integrate', 'collide', 'impactPlanet', 'destroyPlanetNode',
    'spawnAsteroid', 'spawnComet', 'spawnBlackHole', 'launchImpactor', 'fireLaser', 'makeDynamic', 'clearSpawned']) {
    assert.match(view, new RegExp(`function ${fn}\\(`), `substrate fn ${fn}`);
  }
  // spawned bodies live outside `group` so a system rebuild never wipes the shared rock assets
  assert.match(view, /const dynGroup = new THREE\.Group\(\)/);
  assert.match(view, /rockGeo\.dispose\(\);/);
  assert.match(view, /rockMat\.dispose\(\);/);
  // gravity owns a converted planet; rails skip it
  assert.match(view, /if \(node\.userData\.dyn\) continue;/);
  // the update signature takes sim context (pause/speed/gravity/collisions)
  assert.match(view, /update\(dt, opts = \{\}\)/);
});

test('galaxy nameplates are hidden on entry and the system tab is remembered', () => {
  assert.match(runtime, /function setGalaxyLabelsHidden\(/);
  assert.match(runtime, /setGalaxyLabelsHidden\(true\)/);
  assert.match(runtime, /setGalaxyLabelsHidden\(false\)/);
  assert.match(runtime, /systemPanelMemory/);
  // lensing is a galaxy-only warp; it must not leak into the system view
  assert.match(runtime, /lensingPass\.enabled = false;\s*\/\/ sim-only/);
});
