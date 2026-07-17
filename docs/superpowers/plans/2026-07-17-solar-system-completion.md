# Solar System Simulator Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every requested simulator subsystem by wiring and repairing the existing single-file Three.js application.

**Architecture:** Keep runtime code in `index.html`, reuse all existing objects and effects, and add only shared notification, dossier, camera, warning, and cleanup functions. Add one dependency-free Node regression test at `tests/simulator.test.mjs`.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Three.js 0.170.0, Node.js built-in test runner.

## Global Constraints

- Keep scaled, game-style physics; do not introduce an N-body rewrite.
- Do not add dependencies, a package manager, backend, framework, build step, or worker.
- Do not modify `index copy.html`.
- Preserve the current visual language and accessible focus behavior.
- Label habitability and fictional-world values as simulator estimates.
- The workspace has no Git metadata, so commit steps are unavailable.

---

### Task 1: Add the regression contract

**Files:**
- Create: `tests/simulator.test.mjs`
- Read: `index.html`

**Interfaces:**
- Consumes: the HTML source as UTF-8 text.
- Produces: `node --test tests/simulator.test.mjs`, covering required definitions, event wiring, update-loop wiring, and cleanup.

- [ ] **Step 1: Write the failing test**

Create tests that assert definitions for `toast`, `toastOnce`, `openInfoPanel`, `closeInfoPanel`, `setCameraMode`, `updateCameraMode`, `updateImpactWarnings`, and `runSelfCheck`; handlers for `spawnNEA` and `meteorBtn`; calls to `checkEclipses`, `updateTrojans`, and `checkMajorCollisions`; and cleanup for prediction lines and picking registrations.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/simulator.test.mjs`

Expected: failing assertions naming the currently missing functions and wiring.

- [ ] **Step 3: Keep the test red**

Do not weaken assertions to match the unfinished file. Production changes begin only after the expected missing-feature failures are confirmed.

### Task 2: Restore shared UI and body lifecycle

**Files:**
- Modify: `index.html:189-279`
- Modify: `index.html:723-809`
- Modify: `index.html:1661-1673`
- Modify: `index.html:2277-2283`
- Modify: `index.html:2534-2552`

**Interfaces:**
- Produces: `toast(message, color)`, `toastOnce(key, message, color)`, `openInfoPanel(record)`, `closeInfoPanel()`, `bodyDisplayName(record)`, and complete `removeBody(body)` cleanup.
- Consumes: existing `factsFor`, `typeFor`, `moonPhase`, `flyTo`, `pickTargets`, `byMesh`, and scene groups.

- [ ] **Step 1: Implement notifications**

Add a DOM toast with timed removal and a cooldown map used by eclipse and collision events.

- [ ] **Step 2: Implement the dossier**

Render all requested planetary fields, atmosphere bars, a clearly labeled simulator habitability estimate, live moon rows, and contextual comet/asteroid/mining details. Close safely when its body is destroyed or removed.

- [ ] **Step 3: Wire picking**

On a body click, call both `flyTo(record)` and `openInfoPanel(record)`. Asteroid dossiers expose one mining button that calls `startMining(record)`.

- [ ] **Step 4: Repair cleanup**

Remove owned mesh, tail, prediction, breadcrumbs, mining plume, pick target, map entry, warning, and camera target state. Keep shared geometry intact.

- [ ] **Step 5: Run the regression test**

Run: `node --test tests/simulator.test.mjs`

Expected: shared-UI assertions pass; later camera/warning assertions remain red.

### Task 3: Connect simulation mechanics and collision effects

**Files:**
- Modify: `index.html:1332-1403`
- Modify: `index.html:1538-1577`
- Modify: `index.html:1884-2223`
- Modify: `index.html:2758-2968`

**Interfaces:**
- Consumes: existing `handleImpact`, `handleMoonImpact`, `checkMajorCollisions`, `killPlanet`, `addDebrisRing`, `formMoon`, and effect records.
- Produces: reachable eclipse, Trojan, meteor, moon collision, major collision, ring growth, and shared planet-death paths.

- [ ] **Step 1: Wire dormant controls**

Bind `spawnNEA` to `spawnNEA()` and `meteorBtn` to `spawnMeteorShower(selectedPlanet)`.

- [ ] **Step 2: Route free-body impacts**

After star and black-hole checks, test live moon world positions before planet surfaces and call `handleMoonImpact` on intersection.

- [ ] **Step 3: Run bounded system updates**

Call `updateTrojans()` every frame. Call `checkEclipses()` and `checkMajorCollisions()` on throttled simulation timers.

- [ ] **Step 4: Use shared destruction bookkeeping**

Make planet fragmentation, stellar impact, and black-hole consumption use `killPlanet` so moons, picking, dossier, warnings, and targets remain consistent.

- [ ] **Step 5: Animate growth effects**

Handle `kind === 'grow'` in `updateEffects` with smooth interpolation from scale `0.01` to the stored target.

- [ ] **Step 6: Run the regression test**

Run: `node --test tests/simulator.test.mjs`

Expected: simulation-wiring and cleanup assertions pass.

### Task 4: Implement the eight camera modes

**Files:**
- Modify: `index.html:281-329`
- Modify: `index.html:537-555`
- Modify: `index.html:2472-2532`
- Modify: `index.html:2621-2713`
- Modify: `index.html:2918-2968`

**Interfaces:**
- Produces: `cameraState`, `refreshCameraTargets()`, `setCameraMode(mode)`, `updateCameraMode(dt)`, and keyboard/pointer input handlers.
- Consumes: registered body records, `camera`, `controls`, `flyTo`, and the existing overlays.

- [ ] **Step 1: Add state and target refresh**

Track mode, selected target, key state, cinematic timer/index, telescope zoom, and landing progress. Populate `camTarget` with living planets, moons, comets, asteroids, the star, and black holes.

- [ ] **Step 2: Wire mode controls**

Bind all `.cam-btn` elements, `camTarget`, `teleZoom`, Escape, and movement keys. Reject target-dependent modes only when no valid body exists.

- [ ] **Step 3: Implement mode updates**

Reuse OrbitControls for Orbit and Follow. Apply direct camera motion for Free, Cinematic, Drone, Telescope, Landing, and Surface while keeping the selected target and overlays synchronized.

- [ ] **Step 4: Add mode reset**

Galaxy switching, destroyed targets, and Reset Camera return safely to Orbit without stale overlays or field of view.

- [ ] **Step 5: Run the regression test**

Run: `node --test tests/simulator.test.mjs`

Expected: every camera-mode contract assertion passes.

### Task 5: Add incoming-impact warnings

**Files:**
- Modify: `index.html:234-258`
- Modify: `index.html:598-599`
- Modify: `index.html:2758-2850`
- Modify: `index.html:2918-2968`

**Interfaces:**
- Produces: `closestApproach(body, target, horizonDays)`, `updateImpactWarnings()`, and warning-card lifecycle.
- Consumes: live dynamic bodies, planet/moon world positions, target radii, simulation speed, and `flyTo`.

- [ ] **Step 1: Implement closest approach**

Use relative position and velocity to clamp time at closest approach to `0..horizonDays`; warn when miss distance is less than the combined radius plus a small scene-unit margin and relative motion is closing.

- [ ] **Step 2: Render capped warnings**

Show at most three cards sorted by ETA. Include the blinking danger icon, threat, target, and simulated time remaining.

- [ ] **Step 3: Wire focus and cleanup**

Clicking a card focuses the target. Remove cards when trajectories become safe or records die.

- [ ] **Step 4: Run the regression test**

Run: `node --test tests/simulator.test.mjs`

Expected: all warning contract assertions pass.

### Task 6: Scientific data, self-check, and browser verification

**Files:**
- Modify: `index.html:727-801`
- Modify: `index.html:2970-2994`
- Test: `tests/simulator.test.mjs`

**Interfaces:**
- Produces: current displayed data, `runSelfCheck()`, and `window.solar.selfCheck`.

- [ ] **Step 1: Correct and label data**

Update stale moon counts from current NASA sources. Keep the fact-source distinction visible: measured Solar System values versus modeled fictional values and simulator habitability.

- [ ] **Step 2: Add the self-check**

Validate required DOM nodes, camera modes, all requested planet fact fields, registered living targets, and absence of undefined integration functions. Return a compact `{ ok, checks }` result.

- [ ] **Step 3: Run automated verification**

Run: `node --test tests/simulator.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 4: Run browser verification**

Serve the directory locally, open the app, start the simulation, exercise each camera mode, dossier, mining, NEA, meteor shower, impact warning, collision path, reset, and galaxy switch. Verify no uncaught console errors.

- [ ] **Step 5: Check responsive behavior**

Repeat key UI checks at desktop and a narrow mobile viewport. Confirm control and dossier panels remain reachable without covering critical controls.

- [ ] **Step 6: Review against the approved spec**

Confirm every requirement in `docs/superpowers/specs/2026-07-17-solar-system-completion-design.md` is represented by code and fresh verification evidence.
