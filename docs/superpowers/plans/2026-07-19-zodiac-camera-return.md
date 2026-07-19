# Zodiac Camera Zoom and Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smoothly zoom to a selected zodiac constellation and restore the exact pre-selection camera pose when its dossier closes.

**Architecture:** Reuse the existing `flyTo()`/`updateFlight()` animation and add one optional exact-pose destination to the shared flight state. Keep one zodiac return snapshot outside the flight, capture it only on the first zodiac selection, and clear it through existing close/rebuild paths.

**Tech Stack:** JavaScript ES modules, Three.js 0.170.0, Node.js built-in test runner, Vite.

## Global Constraints

- Preserve every non-zodiac camera and dossier behavior.
- Save the active camera position, controls target, and camera mode before zodiac flight.
- Keep the original saved pose when selecting another zodiac during the same inspection.
- Restore the saved pose smoothly when the user closes the zodiac dossier.
- Discard saved state without moving the camera during automatic cleanup.
- Add no dependencies or new UI.
- Keep implementation in `worktree-task-11`.

---

### Task 1: Extend the Existing Camera Flight for Zodiac Inspection

**Files:**
- Modify: `src/pages/solar/runtime.js:860`
- Modify: `src/pages/solar/runtime.js:2226`
- Modify: `src/pages/solar/runtime.js:2230`
- Modify: `src/pages/solar/runtime.js:2511`
- Modify: `src/pages/solar/runtime.js:3050`
- Test: `tests/simulator.test.mjs:1057`

**Interfaces:**
- Consumes: `flyTo(record, duration)`, `updateFlight(dt)`, `camera`, `controls`, `cameraState.mode`, `infoTarget`.
- Produces: `flyToPose(pose, duration)`, where `pose` is `{ position: THREE.Vector3, target: THREE.Vector3, mode: string }`.
- Produces: one nullable `zodiacReturnPose` with the same shape.

- [ ] **Step 1: Change the zodiac interaction test to require zoom and exact return**

Rename the existing test and replace its camera assertions with:

```js
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="restores the pre-selection camera pose" tests/simulator.test.mjs
```

Expected: `FAIL` because constellation scale, `zodiacReturnPose`,
`flyToPose()`, and exact-destination flight handling do not exist.

- [ ] **Step 3: Give constellation records a framing radius**

Add this property to the record created by `createConstellations()`:

```js
      geoR: p.scale,
```

Add the first branch in `viewDistance()`:

```js
  if (rec.isConstellation) return rec.geoR * 3;
```

- [ ] **Step 4: Add exact-pose support to the existing flight state**

Extend the shared flight object and add the saved zodiac pose:

```js
const flight = {
  active: false, t: 0, dur: 1.4, focus: null, destination: null,
  fromPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(),
};
let zodiacReturnPose = null;
```

Clear exact destinations whenever a normal object/home flight starts:

```js
  flight.focus = rec;
  flight.destination = null;
```

Add this sibling function after `flyTo()`:

```js
function flyToPose(pose, dur = 1.4) {
  if (cameraState.mode !== 'orbit') setCameraMode('orbit');
  flight.active = true;
  flight.t = 0;
  flight.dur = dur;
  flight.focus = null;
  flight.destination = pose;
  flight.fromPos.copy(camera.position);
  flight.fromTgt.copy(controls.target);
  focused = null;
  controls.enabled = false;
}
```

In `updateFlight()`, choose the exact destination before the normal focused
record and home branches:

```js
    const destination = flight.destination;
    if (destination) {
      endPos.copy(destination.position);
      endTgt.copy(destination.target);
    } else if (flight.focus) {
```

At flight completion, clear the destination and restore its mode and exact
target after `setCameraMode()`:

```js
      flight.destination = null;
      focused = flight.focus;
      if (destination) {
        if (destination.mode !== cameraState.mode) setCameraMode(destination.mode);
        controls.target.copy(destination.target);
      } else if (focused) {
        focused.anchor.getWorldPosition(focusPrevPos);
      }
```

Add `flight.destination = null;` next to `flight.active = false;` in
`setCameraMode()` and `buildGalaxy()` so interrupted flights cannot retain a
stale exact destination.

- [ ] **Step 5: Capture once and zoom on zodiac selection**

Replace the constellation exclusion in `setupPicking()` with:

```js
      if (record.isConstellation) {
        if (!zodiacReturnPose) {
          zodiacReturnPose = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            mode: cameraState.mode,
          };
        }
        flyTo(record);
      } else {
        zodiacReturnPose = null;
        cameraState.target = record;
        syncCameraTargetSelect();
        if (cameraState.mode === 'orbit') flyTo(record);
        else if (cameraState.mode !== 'free') setCameraMode(cameraState.mode);
      }
```

- [ ] **Step 6: Restore on user exit and discard on automatic close**

At the start of `closeInfoPanel()`, clear stale return state after callers have
had a chance to capture it:

```js
  zodiacReturnPose = null;
```

Replace `exitInfoPanel()` with:

```js
function exitInfoPanel() {
  const returnPose = infoTarget?.isConstellation ? zodiacReturnPose : null;
  closeInfoPanel();
  if (titleMode) return;
  if (returnPose) {
    flyToPose(returnPose);
    return;
  }
  if (focused || (flight.active && flight.focus)) flyTo(null);
}
```

- [ ] **Step 7: Verify GREEN with focused and full automated checks**

Run:

```powershell
node --test --test-name-pattern="restores the pre-selection camera pose" tests/simulator.test.mjs
npm test
npm run build
```

Expected:

- Focused test passes.
- Full suite passes with zero failures.
- Vite build exits successfully.

- [ ] **Step 8: Browser-check zoom, exact return, and planet regression**

Run:

```powershell
npm run dev -- --host 127.0.0.1
```

In a galaxy containing a visible zodiac:

1. Record `camera.position`, `controls.target`, and the current camera mode.
2. Click a zodiac star and wait for the flight to finish.
3. Confirm the camera position and target changed and the full pattern remains visible.
4. Close the dossier and wait for the return flight.
5. Confirm position and target match the recorded values within `0.001` per axis.
6. Confirm the original camera mode is restored.
7. Select and close a planet dossier; confirm its existing zoom and home-return behavior remains unchanged.
8. Run `window.solar.selfCheck()` and confirm `{ ok: true }`.

- [ ] **Step 9: Commit the verified feature**

```powershell
git add -- src/pages/solar/runtime.js tests/simulator.test.mjs
git diff --cached --name-status
git commit -m "feat(solar): restore camera after zodiac inspection"
```

Expected staged files:

```text
M  src/pages/solar/runtime.js
M  tests/simulator.test.mjs
```
