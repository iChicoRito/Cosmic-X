# Big Bang Opening Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold Phase 1 on one small, round particle in total darkness for three timeline seconds before the existing explosion begins.

**Architecture:** Add one pure helper that remaps only Phase 1 visual time while leaving transport time unchanged. Feed the remapped value into the existing environment, camera, flash, shockwave, and scene systems so scrubbing and reverse playback remain deterministic.

**Tech Stack:** Vite, native ES modules, Three.js, Node's built-in test runner

## Global Constraints

- Keep the full journey approximately 90 seconds at 1×.
- Add no timer, scene, route, dependency, asset, state machine, or gameplay control.
- Preserve chapter weights, transport controls, reverse playback, scrubbing, replay, and reduced-motion behavior.
- Do not commit or push unless requested separately.

---

### Task 1: Delay Phase 1 Visual Progress

**Files:**
- Modify: `src/pages/big-bang/timeline.js`
- Modify: `src/pages/big-bang/runtime.js`
- Test: `tests/pure-helpers.test.mjs`
- Test: `tests/bigbang.test.mjs`

**Interfaces:**
- Consumes: `createEpochModel()` and the existing normalized `u` timeline value.
- Produces: `openingVisualAt(epochs, u): number`, returning deterministic visual timeline position.

- [ ] **Step 1: Write the failing pure-helper test**

```js
test('Big Bang Phase 1 holds for three seconds before visual expansion', () => {
  const { EPOCHS } = createEpochModel();
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, 0), 0);
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, 3 / 90), 0);
  assert.ok(bigBangTimeline.openingVisualAt(EPOCHS, 4 / 90) > 0);
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, EPOCHS[0].u1), EPOCHS[0].u1);
  assert.equal(bigBangTimeline.openingVisualAt(EPOCHS, EPOCHS[1].u0), EPOCHS[1].u0);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/pure-helpers.test.mjs`

Expected: FAIL because `openingVisualAt` is not defined.

- [ ] **Step 3: Implement the pure visual-time remap**

Add to `src/pages/big-bang/timeline.js`:

```js
const OPENING_HOLD_U = 3 / 90;

export function openingVisualAt(epochs, u) {
  const bounded = MathUtils.clamp(u, 0, 1);
  const first = epochs[0];
  const holdEnd = first.u0 + OPENING_HOLD_U;
  if (bounded <= holdEnd) return first.u0;
  if (bounded >= first.u1) return bounded;
  return first.u0 + (bounded - holdEnd) / (first.u1 - holdEnd) * (first.u1 - first.u0);
}
```

- [ ] **Step 4: Wire the existing runtime to visual time**

In `src/pages/big-bang/runtime.js`, import `openingVisualAt`, compute `visualU` at the start of `applyEpoch`, and use it for `envAt`, all visual systems, and `camPoseAt`:

```js
const visualU = openingVisualAt(EPOCHS, u);
const env = envAt(visualU);
for (const system of systems) system.apply(visualU, env);
const fov = camPoseAt(visualU, _camPos, _camLook);
```

Keep dossier, audio, transport, ending, and active chapter calculations on the original `u` value. Suppress the flash at exact visual progress zero:

```js
const openingPulse = u > EPOCHS[0].u0 && epochAt(u) === 0
  ? env.flashA * (1 - smooth(epochProgress(u), 0.02, 0.28))
  : 0;
```

Set Phase 1's starting `gridA`, `plasmaA`, and `particleA` values to zero in `timeline.js`. In `buildQuantumFoam`, suppress `foamA` only while visual progress equals the held Phase 1 origin, then let the existing foam return with the explosion. During the hold, hide the square flash sprite and show a small `THREE.Mesh` using `THREE.SphereGeometry` and `THREE.MeshBasicMaterial`. In `applyEpoch`, force the held background to RGB zero and disable bloom; restore both existing values as soon as the visual timeline advances.

- [ ] **Step 5: Add the runtime source-contract check**

Extend the existing opening test in `tests/bigbang.test.mjs`:

```js
assert.match(runtime, /openingVisualAt/);
assert.match(functionSource('applyEpoch'), /envAt\(visualU\)/);
assert.match(functionSource('applyEpoch'), /system\.apply\(visualU, env\)/);
assert.match(functionSource('buildFlash'), /u > EPOCHS\[0\]\.u0/);
assert.match(functionSource('buildFlash'), /new THREE\.SphereGeometry/);
assert.match(functionSource('applyEpoch'), /openingHold \? 0 : Math\.min/);
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `node --test tests/pure-helpers.test.mjs tests/bigbang.test.mjs`

Expected: all focused tests pass.

- [ ] **Step 7: Run final verification**

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `npm run build`

Expected: build succeeds; the existing chunk-size warning is acceptable.

Browser-check Begin at 1×: one small round particle remains clearly visible on total black for approximately three seconds with no sprite bloom or surrounding foam, then the bounded flash, shockwave, foam, particles, and expansion begin without a fade cut.
