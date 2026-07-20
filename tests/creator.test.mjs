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
