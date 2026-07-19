# Clickable Zodiac Information Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visible zodiac stars and connecting lines open the existing celestial-object information panel without moving the camera.

**Architecture:** Extend the existing `pickTargets`/`byMesh` raycasting path with one record per rendered constellation. Reuse `openInfoPanel()`, `selectedRecord`, and the bottom information bar, adding only constellation-specific display branches and suppressing inapplicable metric rows.

**Tech Stack:** JavaScript ES modules, Three.js 0.170.0, Node.js built-in test runner, Vite.

## Global Constraints

- Keep the existing interface and control scheme unchanged.
- Add no dependencies or new UI.
- Clicking either a constellation's visible stars or connecting lines must open the dossier.
- Constellation selection must not target, focus, or fly the camera.
- Show name and symbol, element, date range, brightest star, and lore.
- Keep all implementation work in the existing `worktree-task-11` worktree.

---

### Task 1: Connect Zodiac Rendering to the Existing Information Flow

**Files:**
- Modify: `src/pages/solar/runtime.js:828`
- Modify: `src/pages/solar/runtime.js:2207`
- Modify: `src/pages/solar/runtime.js:2494`
- Modify: `src/pages/solar/runtime.js:2599`
- Modify: `src/pages/solar/runtime.js:2862`
- Modify: `src/pages/solar/runtime.js:2897`
- Modify: `src/pages/solar/runtime.js:3388`
- Test: `tests/simulator.test.mjs`

**Interfaces:**
- Consumes: `pickZodiac()`, `pickTargets`, `byMesh`, `selectRecord(record)`, `openInfoPanel(record)`, `stat(label, value)`.
- Produces: constellation records shaped as `{ name, isConstellation, sign, anchor, visible, alive }`.
- Produces: `buildObjectSummary()` result property `showMetrics: boolean`.

- [ ] **Step 1: Write the failing interaction contract test**

Add this test to `tests/simulator.test.mjs`:

```js
test('opens zodiac dossiers from stars and lines without moving the camera', () => {
  const constellations = functionSource('createConstellations');
  assertContracts(constellations, {
    record: /isConstellation\s*:\s*true/,
    catalogData: /sign\s*:\s*p\.sign/,
    starTarget: /pickTargets\.push\(\s*stars\s*\)/,
    lineTarget: /pickTargets\.push\(\s*links\s*\)/,
    starRecord: /byMesh\.set\(\s*stars\s*,\s*record\s*\)/,
    lineRecord: /byMesh\.set\(\s*links\s*,\s*record\s*\)/,
  });

  assert.match(runtime, /raycaster\.params\.Points\.threshold\s*=\s*8/);
  assert.match(runtime, /raycaster\.params\.Line\.threshold\s*=\s*8/);

  const picking = functionSource('setupPicking');
  assert.match(
    picking,
    /if\s*\(\s*!record\.isConstellation\s*\)\s*\{[\s\S]*?cameraState\.target\s*=\s*record[\s\S]*?\}/,
  );
  assert.match(picking, /openInfoPanel\(\s*record\s*\)/);

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
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="opens zodiac dossiers" tests/simulator.test.mjs
```

Expected: `FAIL` with missing contracts for `isConstellation`, pick registration, or constellation dossier handling.

- [ ] **Step 3: Register constellation stars and lines as shared pick targets**

In `createConstellations()`, after constructing `stars`, `links`, and `label`, add one anchor and record, then register both rendered geometries:

```js
    const anchor = new THREE.Object3D();
    anchor.position.copy(center).multiplyScalar(1400);
    const record = {
      name: p.sign.name,
      isConstellation: true,
      sign: p.sign,
      anchor,
      visible: true,
      alive: true,
    };
    pickTargets.push(stars);
    pickTargets.push(links);
    byMesh.set(stars, record);
    byMesh.set(links, record);
    galaxyGroup.add(anchor);
```

Keep the existing `galaxyGroup.add(stars)`, `galaxyGroup.add(links)`, and
`galaxyGroup.add(label)` calls. Replace the outdated “purely decorative”
comment with a short note that stars and lines share one dossier record.

Immediately after creating the shared raycaster, make the thin geometry
practical to click:

```js
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 8;
raycaster.params.Line.threshold = 8;
```

- [ ] **Step 4: Skip camera targeting for constellation hits**

In `setupPicking()`, retain selection and dossier opening for every hit but
wrap only the existing camera-targeting block:

```js
      selectRecord(record);
      if (!record.isConstellation) {
        cameraState.target = record;
        syncCameraTargetSelect();
        if (cameraState.mode === 'orbit') flyTo(record);
        else if (cameraState.mode !== 'free') setCameraMode(cameraState.mode);
      }
      openInfoPanel(record);
```

- [ ] **Step 5: Render the constellation dossier**

Add the constellation type before the existing type checks in
`bodyTypeLabel()`:

```js
  if (record.isConstellation) return 'Zodiac constellation';
```

Add this first branch in `openInfoPanel()` before the planet branch:

```js
  if (record.isConstellation) {
    const { sign } = record;
    body.innerHTML = '<div class="stat-grid">'
      + stat('Symbol', sign.symbol)
      + stat('Element', sign.element)
      + stat('Traditional dates', sign.dates)
      + stat('Brightest star', sign.brightest)
      + '</div><div class="note">' + sign.lore + '</div>';
  } else if (record.def && !record.isMoon) {
```

The existing `ipName` assignment supplies the constellation name and the
existing `ipType` assignment supplies “Zodiac constellation.”

- [ ] **Step 6: Keep the bottom information bar accurate**

Add this branch in `buildObjectSummary()` immediately before the star branch:

```js
  } else if (record.isConstellation) {
    source = 'Traditional zodiac reference';
    status = record.sign.element + ' · ' + record.sign.dates;
    velocity = 0;
    orbitalSpeed = 0;
```

Add this property to its returned object:

```js
    showMetrics: !record?.isConstellation,
```

In `refreshBottomInfoBar()`, replace the direct metric assignment with:

```js
  const metricHost = ui('barSelectedMetric');
  metricHost.hidden = !summary.showMetrics;
  metricHost.innerHTML = summary.showMetrics
    ? SUMMARY_METRIC_KEYS.map(key => {
        const metric = summary.metrics[key];
        const value = Math.abs(metric.value) >= 1e6
          ? metric.value.toExponential(3)
          : Number(metric.value.toFixed(3)).toLocaleString();
        const coordinates = key === 'coordinates'
          ? ' [' + metric.x.toFixed(2) + ', ' + metric.y.toFixed(2) + ', ' + metric.z.toFixed(2) + ']'
          : '';
        return '<span><small>' + labels[key] + '</small><b>' + value + coordinates + ' ' + metric.unit
          + '</b>' + (metric.qualifier ? '<em>' + metric.qualifier + '</em>' : '') + '</span>';
      }).join('')
    : '';
```

- [ ] **Step 7: Verify GREEN with focused and full automated checks**

Run:

```powershell
node --test --test-name-pattern="opens zodiac dossiers" tests/simulator.test.mjs
npm test
npm run build
```

Expected:

- Focused test: `PASS`.
- Full test suite: all tests pass with zero failures.
- Vite build: exits successfully and creates `dist`.

- [ ] **Step 8: Browser-check the real interaction**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

In the solar simulator:

1. Enter a galaxy where zodiac visuals appear.
2. Click a constellation star and confirm the existing dossier opens.
3. Confirm name, symbol, element, dates, brightest star, and lore are present.
4. Close the dossier, click a connecting line, and confirm the same record opens.
5. Confirm neither click changes the camera target or starts a camera flight.
6. Confirm the bottom bar identifies the constellation and hides planetary metrics.
7. Click a planet and confirm its normal camera flight, dossier, and metrics still work.
8. Run `window.solar.selfCheck()` and confirm `{ ok: true }`.

- [ ] **Step 9: Commit the verified feature**

```powershell
git add -- src/pages/solar/runtime.js tests/simulator.test.mjs
git diff --cached --name-status
git commit -m "feat(solar): open information for zodiac constellations"
```

Expected staged files:

```text
M  src/pages/solar/runtime.js
M  tests/simulator.test.mjs
```
