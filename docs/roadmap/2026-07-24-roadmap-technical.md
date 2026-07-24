# CosmicX — Implementation Roadmap (Technical)

*Dated 2026-07-24. Execution plan derived from the [technical evaluation](../evaluation/2026-07-24-system-evaluation.md).
Item codes (E#, N#, W#) refer to that document. Phases are ordered by dependency
and risk, not just value: de-risk first, then ship value on top.*

---

## Sequencing at a glance

```
Phase 0 ─ de-risk ──► Phase 1 ─ quick wins ──► Phase 2 ─ flagship + reach
  (smoke tests,          (screenshot,            (Solar save/load,
   loader dedupe)         self-host tex,           touch camera,
                          touch buttons)           shared physics)
                                                        │
                                                        ▼
                              Phase 3 ─ differentiators ──► Phase 4 ─ deep debt
                                (shareable links,             (split runtimes)
                                 presets, BB discovery)
```

Hard dependencies: **N1 (Solar save format) blocks N2 and N3.** **Phase 0 smoke
tests should land before any runtime edit.** Everything else is parallelizable.

---

## Phase 0 — De-risk foundation
*Goal: a safety net around the untested runtimes before touching them.*

| Task | Detail | Files | Done when |
|------|--------|-------|-----------|
| Boot smoke test (W6) | Headless (Playwright or `vite preview` + Puppeteer): load each of `#/`, `#/solar-system`, `#/creator`, `#/big-bang`; assert a `<canvas>` mounts and console has zero errors. Add `npm run test:e2e`. | new `tests/e2e/` + `package.json` script | Each route boots clean in CI-style run |
| Texture-loader dedupe (E4) | Extract the copy-pasted `TEX_BASE`/`texLoader`/`upgradeTexture` (`solar/runtime.js:236-249` ≡ `big-bang/runtime.js:280-293`) into `src/shared/texture-loader.js`; keep the `destroyed`-flag invalidation. | new `src/shared/texture-loader.js`; edit solar + big-bang runtimes | Both pages import one loader; 175 tests still green |

**Risk:** low. No user-facing change. **Exit:** smoke test passes on all 4 routes.

## Phase 1 — Quick wins
*Goal: visible value at low effort, no new subsystems.*

| Task | Detail | Files | Done when |
|------|--------|-------|-----------|
| Solar screenshot (E1) | Port Creator's `toDataURL` PNG-download (`creator/runtime.js:1929`) to Solar; wire a HUD/FX-tab button. | `solar/runtime.js`, `solar/template.js` | Button downloads a PNG of the canvas |
| Self-host textures (E5) | Vendor a minimal planet-texture set into `public/`; point `TEX_BASE` (`solar/config.js:50`) at the local path; keep procedural fallback. | `public/textures/*`, `solar/config.js` | No `raw.githubusercontent.com` calls at runtime |
| Touch buttons, slice 1 (E2a) | On-screen buttons for laser-fire and free-flight nudge (the keyboard-only tools), shown on coarse-pointer devices (`@media (pointer:coarse)`). | `solar/template.js`, `solar/solar.css`, `solar/runtime.js` | Laser + move usable with no keyboard |

**Risk:** low. **Exit:** all three shippable independently.

## Phase 2 — Flagship + reach
*Goal: close the biggest usability gap and unlock mobile.*

### N1 — Solar sandbox save/load (the flagship)
Mirror Creator's persistence pattern exactly — it's proven and tested.

- **New `src/pages/solar/persistence.js`** modeled on [creator/persistence.js](../../src/pages/creator/persistence.js):
  `STORE_KEY = 'cosmicx.solar.v1'`, `SAVE_VERSION`, `sanitizeState`,
  `serialize`/`deserialize`, and a `createStore(storage)` slot API
  (`listSlots/save/load/remove`).
- **Schema** (design once — N2 reuses it): `{ galaxyId, bodies:[spawned comets/
  asteroids/black holes with orbit+mass+seed], timeScale, simDate, cameraPose,
  toggles }`. Sanitize every field with clamps, like the Creator planet sanitizer.
- **Runtime hooks:** a `serializeSolarState()` reader and `applySolarState()`
  writer in `solar/runtime.js`; a Save tab UI (list/save/load/delete) mirroring
  Creator's Save panel.
- **Tests:** new `tests/solar-persistence.test.mjs` — round-trip + reject junk +
  version-guard, in the `creator.test.mjs` unit style (inject a storage stub).

### E2b — Full touch camera (W1)
- Enable + tune OrbitControls touch on all scenes; add pinch-zoom and one/two-
  finger orbit/pan. Verify Creator system-view and Big Bang free-cam too.
- Gate WASD-only paths so touch users aren't stranded.

### E3 — Shared physics substrate (W5)
- Lift gravity/collision/eclipse from `creator/system-view.js:460-604` and the
  parallel Solar logic (`solar/runtime.js:5145-5170`) into `src/shared/orbital-sim.js`.
- Keep the pure math dependency-injected so it's unit-testable (follow
  `solar/dynamics.js` precedent).

**Risk:** N1 low (proven pattern), E2b/E3 medium. **Exit:** save→reload→load
restores an identical scene; camera responds to touch; one physics module drives
both scenes with tests green.

## Phase 3 — Differentiators
*Goal: audience growth. All depend on N1's format existing.*

| Task | Detail | Depends on |
|------|--------|-----------|
| N2 shareable links | Encode `sanitizeSolarState` output (compact JSON → base64 or LZ) into a URL hash `#/solar-system?s=…`; on boot, decode + `applySolarState`. Reuse the Creator "URL as source of truth" idiom. Add a Copy-Link + Import-Code UI. | N1 schema |
| N3 preset scenarios | Ship a handful of prebuilt state blobs ("Chicxulub impact", "total eclipse", "rogue black hole") as a picker that loads via `applySolarState`. Pure content on shipped mechanics. | N1 apply path |
| N4 Big Bang discovery (W4) | Populate the empty stubs `big-bang/systems.js` + `camera.js`; add a Raycaster over the galaxy point cloud; clickable epoch objects → info cards, matching Creator's Scan/Codex idiom. | none (independent) |

**Risk:** N2 medium (encoding/versioning care), N4 higher (new interaction
layer). **Exit:** a link round-trips a scene between two browsers; presets load;
at least one Big Bang epoch has discoverable objects.

## Phase 4 — Deep debt (optional, ongoing)
*Goal: keep the big runtimes maintainable — do behind the Phase-0 net.*

- Split `solar/runtime.js` (5443 lines, W3) into cohesive sub-modules: scene
  setup, per-frame update, camera modes, UI binding, effects. Extract behind the
  smoke tests so regressions surface immediately.
- Same treatment for `creator/runtime.js` (2881) and `big-bang/runtime.js` (1829)
  if churn warrants. Finish the abandoned big-bang module extraction.

**Risk:** medium-high (large surface). Only do when a phase actually needs to
edit these files — don't refactor for its own sake.

---

## Global acceptance gates (every phase)
- `npm test` stays green (currently 175); new pure logic gets matching unit tests.
- Phase-0 smoke test passes on all 4 routes.
- No new runtime dependency added without justification (current count: 1).
- `destroy()` remains idempotent; no console errors on route swap.

## Verification workflow (per increment)
1. `npm run dev`, open the affected route in the Browser preview.
2. Check console clean; use `window.solar.step()` / `render()` for synchronous
   probes (backgrounded preview tabs freeze the animation loop).
3. For save/load: build → save → reload page → load slot → assert scene matches.
4. For touch: `resize_window` mobile preset, confirm pointer/drag camera response.
5. Screenshot the result as proof before marking done.
