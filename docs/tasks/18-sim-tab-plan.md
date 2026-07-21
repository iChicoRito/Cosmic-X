# Per-system "Sim" tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, this session). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a Solar-parity "Sim" tab to the creator's `#/creator/{slug}` stellar page — status, controls (speed/gravity/planet-size/distances), display (trails/labels), automatic events (collisions/eclipses/resident asteroids), and a manual Trigger-eclipse — backed by real asteroid physics and real eclipse shadows.

**Architecture:** Fold the existing "View" tab into a new "Sim" tab. Planets/moons stay on kinematic rails; a new free-body substrate in `system-view.js` gives resident asteroids gravity + collisions. Eclipses enable Three.js shadow maps behind a toggle. All controls reuse the creator's existing `cr-slider` / `cr-check` components and Solar's grouping/typography.

**Tech Stack:** Vanilla JS, Three.js (PointLight shadows, IcosahedronGeometry rocks), the creator's `sliderRow` / `PANELS` / `systemView` API.

## Global Constraints

- Node 20.19+/22.12+; `npm test` = `node --test tests/*.test.mjs`; dev server launch name `solar`, port 8123.
- Creator toggles use existing `cr-check` checkboxes (approved) — do NOT add Solar's track/thumb switch.
- Passive simulation only: no spawn-from-camera, impact weapons, laser, or black holes; asteroids are absorbed on collision, planets are never destroyed.
- Planets/moons never leave their rails; asteroids are the only free bodies.
- Mutable state created inside `mount()`/factory scope, never at module scope.
- Reuse `sliderRow(key, def, value, onInput)`, `setPlanetScale`/`setOrbitScale`/`setTrailsVisible`/`setLabelsVisible`, `SYSTEM_SPEEDS`, `state.sim.playing`, `syncTransport()`.

---

### Task 1: Fold View → Sim tab (UI shell + existing controls)

**Files:**
- Modify: `src/pages/creator/template.js` (View tab button + `crViewPanel` → Sim)
- Modify: `src/pages/creator/runtime.js` (PANELS, buildPanels wiring, transport sync)
- Test: `tests/creator.test.mjs`

**Interfaces:**
- Produces: `#crSimPanel` with ids `crSimPlaying`, `crSimSliders`, `crSimTrails`, `crSimLabels`, `crSimCollisions`, `crSimEclipses`, `crSimAsteroids`, `crSimManual`; PANELS key `sim` `{ el:'crSimPanel', title:'Simulation', where:'system' }`; `buildSimPanel()`, `syncSimPanel()` in runtime.
- Consumes: existing `sliderRow`, `setPlanetScale/setOrbitScale/setTrailsVisible/setLabelsVisible`, `SYSTEM_SPEEDS`, `state.sim`, `syncTransport`.

- [ ] **Step 1 — Failing test.** In `tests/creator.test.mjs`, replace the View-tab test (`'the HUD swaps tool sets…'` currently checks `crViewPanel`) and add a Sim-tab test:

```js
test('the per-system Sim tab mirrors the Solar Sim page', () => {
  for (const id of ['crSimPanel', 'crSimPlaying', 'crSimSliders', 'crSimTrails',
    'crSimLabels', 'crSimCollisions', 'crSimEclipses', 'crSimAsteroids', 'crSimManual']) {
    startTagById(template, id);
  }
  assert.match(template, /data-panel="sim"/);
  assert.doesNotMatch(template, /data-panel="view"/);
  assert.doesNotMatch(template, /id=["']crViewPanel["']/);
  assert.match(runtime, /sim: \{ el: 'crSimPanel', title: 'Simulation', where: 'system' \}/);
  assert.match(runtime, /function buildSimPanel\(/);
  // Speed shares the transport's system speeds
  assert.match(runtime, /SYSTEM_SPEEDS/);
});
```
Also update the existing context-swap test (`'the HUD swaps tool sets when you step inside a system'`) and the camera-modes test that reference `crViewPanel`/`view` → `crSimPanel`/`sim`.

- [ ] **Step 2 — Run, expect FAIL.** `node --test tests/creator.test.mjs` → fails (crSimPanel missing).

- [ ] **Step 3 — Implement markup.** In `template.js`, change the tab button `data-panel="view">View` → `data-panel="sim">Sim`, and replace the `crViewPanel` body with:

```html
<div class="cr-panel-body" id="crSimPanel" hidden>
  <div class="cr-field cr-check"><label for="crSimPlaying">Playing</label><input type="checkbox" id="crSimPlaying" checked></div>
  <div id="crSimSliders" class="cr-sliders"></div>
  <div class="cr-field cr-check"><label for="crSimTrails">Orbit trails</label><input type="checkbox" id="crSimTrails" checked></div>
  <div class="cr-field cr-check"><label for="crSimLabels">Labels</label><input type="checkbox" id="crSimLabels" checked></div>
  <h4 class="cr-gap">Automatic events</h4>
  <div class="cr-field cr-check"><label for="crSimCollisions">Collisions</label><input type="checkbox" id="crSimCollisions"></div>
  <div class="cr-field cr-check"><label for="crSimEclipses">Eclipses</label><input type="checkbox" id="crSimEclipses"></div>
  <div class="cr-field cr-check"><label for="crSimAsteroids">Resident asteroids</label><input type="checkbox" id="crSimAsteroids"></div>
  <h4 class="cr-gap">Manual events</h4>
  <div id="crSimManual" class="cr-sliders"></div>
</div>
```

- [ ] **Step 4 — Implement wiring.** In `runtime.js`: PANELS `view` entry → `sim` entry above; rename the View-panel builder to `buildSimPanel()` and (a) keep the labels/trails/planetScale/orbitScale wiring against the new ids, (b) build `crSimSliders` with four `sliderRow`s in order — `speed` (d/s, maps `simScale`; on input set nearest `SYSTEM_SPEEDS` + mark `state.sim.playing` and `syncTransport`), `gravity` (0–5×), `planetScale` (World size 0.5–4×), `orbitScale` (Distances). Wire `crSimPlaying` ↔ `state.sim.playing` + `syncTransport`; keep `syncSimPanel()` to reflect transport-driven speed/playing back into the tab. Update `systemPanelMemory` default `'bodies'` (unchanged) and any `openPanel` refresh branch `view` → `sim`. Remove the old View builder.

- [ ] **Step 5 — Run tests, expect PASS.** `node --test tests/creator.test.mjs`.

- [ ] **Step 6 — Browser verify.** preview_start `solar`; enter a system; confirm tabs read Bodies/Sim/Cam/…, no View; Playing/Speed/Planet-size/Distances/Trails/Labels change the scene; Speed slider and transport pips stay in sync.

---

### Task 2: Free-body substrate — resident asteroids, gravity, collisions

**Files:**
- Modify: `src/pages/creator/system-view.js` (substrate)
- Modify: `src/pages/creator/runtime.js` (toggle/slider wiring, update opts)
- Test: `tests/creator.test.mjs`

**Interfaces:**
- Produces (system-view public API): `setResidentAsteroids(on)`, `setGravity(mult)`, `setCollisions(on)`; `update(dt, { simScale, gravity, collisions })`; internal `dynGroup`, `attractors`, `spawnResidents()`, `clearResidents()`, `integrateAsteroid()`, `absorbAsteroid()`.
- Consumes: `layout` (framing/edge/starRadius), `starNodes`/`planetNodes` positions.

- [ ] **Step 1 — Failing test.** Extend the Sim test (or add `'the Sim tab runs a resident-asteroid gravity substrate'`):

```js
test('the Sim tab runs a resident-asteroid gravity substrate', () => {
  const view = read('../src/pages/creator/system-view.js');
  for (const fn of ['spawnResidents', 'integrateAsteroid', 'absorbAsteroid']) {
    assert.match(view, new RegExp(`function ${fn}\\(`), `substrate fn ${fn}`);
  }
  assert.match(view, /const dynGroup = new THREE\.Group\(\)/);
  assert.match(view, /setResidentAsteroids\(/);
  assert.match(view, /setCollisions\(/);
  assert.match(view, /setGravity\(/);
  // planets are never destroyed — absorb removes the asteroid only
  assert.doesNotMatch(view, /destroyPlanetNode/);
  assert.match(runtime, /systemView\.update\(dt, \{ simScale, gravity:/);
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement substrate** in `system-view.js`. Add at factory scope: `const dynGroup = new THREE.Group(); scene.add(dynGroup);`, `const asteroids = []`, `const attractors = []`, `let gravityMult = 1, collisionsOn = false, residentsOn = false`, shared `rockGeo`/`rockMat`, temp vectors. Seed `attractors` per star inside `build()` (pos ref + GM scaled by star mass). Functions:

```js
const GM_UNIT = 6000;
function gravityAt(pos, out) {
  out.set(0, 0, 0);
  for (const a of attractors) {
    _dir.copy(a.pos).sub(pos);
    const d2 = Math.max(_dir.lengthSq(), a.soft);
    out.addScaledVector(_dir.normalize(), gravityMult * a.gm / d2);
  }
  return out;
}
function spawnResidents() {
  clearResidents();
  const n = Math.min(14, 8 + Math.round((layout?.edge || 40) / 20));
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.scale.setScalar(0.25 + Math.random() * 0.5);
    const a = Math.random() * TAU, r = (layout.belt || layout.edge) * (0.7 + Math.random() * 0.5);
    mesh.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 2, Math.sin(a) * r);
    dynGroup.add(mesh);
    const body = { mesh, vel: new THREE.Vector3(), r: mesh.scale.x };
    seedCircular(body);          // tangential velocity for a near-circular orbit
    asteroids.push(body);
  }
}
function integrateAsteroid(body, sdt) {
  const steps = Math.min(24, 1 + Math.floor(sdt / 0.02)), h = sdt / steps;
  for (let s = 0; s < steps; s++) {
    gravityAt(body.mesh.position, _acc);
    body.vel.addScaledVector(_acc, h);
    body.mesh.position.addScaledVector(body.vel, h);
  }
  body.mesh.rotation.x += sdt; body.mesh.rotation.y += sdt * 0.7;
}
function absorbAsteroid(body, at, color) {
  flashAt(at, color, body.r * 3 + 1);         // small additive flash, no destruction
  removeAsteroid(body);
}
```
Collision scan each step: asteroid within `star.radius`/`planet.radius` → `absorbAsteroid`; escaped past `framing*6` → remove. Add `stepAsteroids(sdt)` (only when `residentsOn && sdt>0`) into `update()`, and read `opts.gravity`/`opts.collisions`. Public API: `setResidentAsteroids/setGravity/setCollisions`. `clearGroup`/`destroy` dispose `dynGroup`, `rockGeo`, `rockMat`.

- [ ] **Step 4 — Wire runtime.** In `buildSimPanel`, bind `crSimAsteroids`→`systemView.setResidentAsteroids`, `crSimCollisions`→`systemView.setCollisions`, and the `gravity` slider→`systemView.setGravity`. Change the update call: `systemView.update(dt, { simScale, gravity: simGravity, collisions: simCollisions })` (hold `simGravity`/`simCollisions` at factory scope, defaults `1`/`false`).

- [ ] **Step 5 — Run tests PASS.**

- [ ] **Step 6 — Browser verify.** Enter system, toggle Resident asteroids → rocks appear and orbit; raise Gravity → orbits tighten; toggle Collisions → asteroids absorbed on contact with a flash; planets stay intact. Verify via `window.creator.systemView` counts + pixel/DOM probes (screenshot stalls on lens flare).

---

### Task 3: Eclipses — shadow maps + Trigger eclipse

**Files:**
- Modify: `src/pages/creator/system-view.js` (shadows + trigger)
- Modify: `src/pages/creator/runtime.js` (Eclipses toggle, manual button builder)
- Test: `tests/creator.test.mjs`

**Interfaces:**
- Produces: system-view `setEclipses(on)`, `triggerEclipse()` (returns `{ ok, label }` or `null`), `eclipseSupport()` → `{ kind: 'lunar'|'transit'|null }`; runtime `buildManualEvents()`.
- Consumes: `renderer`, primary star light, `planetNodes`/`moonNodes`.

- [ ] **Step 1 — Failing test.**

```js
test('the Sim tab casts real eclipse shadows and adapts the manual event', () => {
  const view = read('../src/pages/creator/system-view.js');
  assert.match(view, /function setEclipses\(/);
  assert.match(view, /function triggerEclipse\(/);
  assert.match(view, /castShadow = true/);
  assert.match(view, /shadowMap\.enabled/);
  assert.match(runtime, /function buildManualEvents\(/);
  assert.match(runtime, /systemView\.triggerEclipse\(/);
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement shadows** in `system-view.js`. In `build()`, keep the primary star light ref. `setEclipses(on)`: `renderer.shadowMap.enabled = on` (`THREE.PCFSoftShadowMap`); primary `light.castShadow = on` (shadow cam near `starRadius*1.2`, far `framing*4`, mapSize 1024); planets+moons `castShadow = receiveShadow = on`. `eclipseSupport()`: `moonNodes.length ? 'lunar' : planetNodes.length ? 'transit' : null`. `triggerEclipse()`: if unsupported return null; enable shadows if off; pick the first planet with a moon (lunar) else innermost planet (transit); set the moon's/planet's orbit `angle` so it sits on the star→body line (compute from the body's current angle vs star at origin); frame it via `flyTo`; return `{ ok:true, label }`.

- [ ] **Step 4 — Wire runtime.** `crSimEclipses`→`systemView.setEclipses`. `buildManualEvents()` (called from `openPanel('sim')` and on system change): read `systemView.eclipseSupport()`; if non-null, append a `cr-btn` labelled `Trigger lunar eclipse`/`Trigger transit` to `#crSimManual` that calls `systemView.triggerEclipse()` and toasts the result; if null, leave `#crSimManual` empty.

- [ ] **Step 5 — Run tests PASS.**

- [ ] **Step 6 — Browser verify.** Toggle Eclipses on → shadows appear as bodies align; click Trigger eclipse → a visible shadow transit; button label matches the system (lunar vs transit); absent when no planet/moon.

---

### Task 4: Adaptation, speed↔transport polish, full verification

**Files:**
- Modify: `src/pages/creator/runtime.js` (sync polish)
- Test: `tests/creator.test.mjs`; browser

- [ ] **Step 1 — Sync test.**

```js
test('the Sim Speed slider and transport share one speed', () => {
  assert.match(runtime, /function syncSimPanel\(/);
  assert.match(runtime, /syncSimPanel\(\)/);   // called from syncTransport path
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** Ensure `syncTransport()` (and the transport pip clicks / Space pause) call `syncSimPanel()` so the Sim tab's Playing checkbox + Speed value reflect changes made from the bottom bar. `buildManualEvents()` re-runs on `syncSystemChrome()` so the manual event matches the entered system.

- [ ] **Step 4 — Run full suite.** `node --test tests/*.test.mjs` (or `npm test`) → all green. `npm run build` → clean.

- [ ] **Step 5 — Browser sweep.** Fresh galaxy → enter system: Sim tab complete, all controls live, asteroids+gravity+collisions work, eclipse shadows + trigger work, no console errors; exit/re-enter and system-to-system switch keep the tab correct; a binary system sums gravity from both stars.

---

## Self-Review

- **Spec coverage:** Status/Controls/Display/Auto-events/Manual-events → Task 1+2+3. Full physics → Task 2. Eclipses+trigger → Task 3. Fold View → Task 1. Adaptation → Task 3 (`eclipseSupport`) + Task 4. Style (cr-check) → Task 1 markup. All covered.
- **Placeholders:** none — code shown for substrate, shadows, markup.
- **Type consistency:** `setResidentAsteroids/setGravity/setCollisions/setEclipses/triggerEclipse/eclipseSupport` used identically in system-view (produce) and runtime (consume); `update(dt,{simScale,gravity,collisions})` matches Task 2 wiring.
- **Non-goals honored:** no destroyPlanetNode / spawn-from-camera / laser / black hole; cr-check toggles only.
