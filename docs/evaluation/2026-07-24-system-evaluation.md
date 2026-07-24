# CosmicX — System Evaluation & High-Impact Feature Roadmap

*Dated 2026-07-24. Grounded in three parallel code sweeps (architecture, feature
inventory, technical quality). **Confirmed observations** and **recommendations**
are kept separate throughout.*

---

## 1. What the system is

CosmicX — Vite + vanilla-JS + Three.js (r170) hash-routed SPA. No framework, no
router lib, no state lib. **Two runtime-relevant deps: `three` + `vite`.** Static
build (`base:'./'`), deployable to any host. Three lazy-loaded "modes," each a
self-contained Three.js scene behind one lifecycle contract
(`mount → {setView,pause,resume,destroy}`):

- **Solar System sandbox** (`/solar-system`, "As the Gods Will") — flagship. 5
  galaxies (Milky Way with real NASA/JPL planet data + 4 fictional/exotic),
  spawn (comets/asteroids/black holes), impact simulator, laser tool, 6 camera
  modes, timeline scrubber (±100 yr), 7-tab control panel, HUD/bottom bar,
  5-tab settings.
- **Creator** (`/creator`, "Become the Creator") — 4-step galaxy wizard → place
  systems/objects/events → per-system lit scene at `#/creator/{slug}` with real
  gravity/collision/eclipse sim, codex, **named save slots + export/import/
  screenshot** (`cosmicx.creator.v1`).
- **Big Bang** (`/big-bang`, "Before the Stars") — linear cinematic, 11 epochs,
  Catmull-Rom camera rails, free-camera toggle, hide-UI. Passive documentary.

Persistence: localStorage only — `cosmicx.settings.v1`, `cosmicx.audio.v1`,
`cosmicx.creator.v1`, onboarding flags. All versioned, sanitize-on-load,
try/wrapped. Shell-level BGM singleton survives route changes.

## 2. Key strengths (keep, build on)

- **Lean + portable.** One runtime dep, route-level code splitting, static
  output. Trivial to host.
- **Robust router** ([src/router.js](../../src/router.js)) — generation-token
  guard at every async boundary kills stale mounts on fast navigation; graceful
  error screen. Genuinely unit-tested.
- **Disciplined lifecycle** — [resource-scope.js](../../src/shared/resource-scope.js)
  (AbortController-backed rAF/timers/listeners) + [dispose-three.js](../../src/shared/dispose-three.js)
  (dedup GPU teardown + `forceContextLoss`). Every page tears down cleanly.
- **Careful reliability** — idempotent `destroy()`, delta-clamped frame loops
  (`Math.min(getDelta(),0.1)`), async invalidation of late texture loads,
  graceful offline fallback (procedural canvas textures when CDN fails).
- **Real tests where it counts** — 175 tests; pure logic (router races,
  dynamics, J2000 time, epoch model) executed for real with injected stubs.
- **Creator persistence is a solved pattern** — versioned, sanitized, slot-based
  ([persistence.js](../../src/pages/creator/persistence.js)). Reusable.

## 3. Weaknesses / limitations (confirmed)

| # | Finding | Evidence |
|---|---------|----------|
| W1 | **No touch controls for 3D scenes.** Mobile users get collapsed panels but effectively can't fly the camera; laser (F) + free-flight (WASD) are keyboard-only. | No `touchstart`/`pointerType`/`maxTouchPoints` anywhere; nav is mouse-drag/wheel + keys. |
| W2 | **Solar sandbox has no save/share.** Only render/UI prefs persist. A configured scenario (galaxy, spawned bodies, time, camera) can't be saved, reloaded, or shared. Creator can; the flagship can't. | [settings.js](../../src/pages/solar/settings.js) persists flat prefs only. |
| W3 | **Monolithic runtimes.** `solar/runtime.js` **5443 lines**, `creator/runtime.js` 2881, `big-bang/runtime.js` 1829 — ~66% of source in 3 god-files, exercised only by source-text scraping, not execution. | Line counts; no DOM/WebGL harness. |
| W4 | **Big Bang interactivity never built.** `big-bang/systems.js` + `camera.js` are empty-array stubs; galaxy field is a passive point cloud, no picking. | 3-line stub files; no Raycaster. |
| W5 | **Duplicated physics + loaders.** Creator `system-view.js` re-implements Solar's gravity/collision/eclipse; texture loader copy-pasted 3×. | `system-view.js:460-604` vs `solar/runtime.js:5145-5170`; loader ≡ across solar/big-bang. |
| W6 | **No runtime test harness.** Rendering, live dynamics, persistence round-trips, mount/destroy of real pages — untested by execution. | Only pure helpers + source scraping. |
| W7 | Minor: texture CDN is 3rd-party `raw.githubusercontent.com` (availability risk); no sourcemaps/lint/CI/type-check. | [config.js:50](../../src/pages/solar/config.js); [vite.config.js](../../vite.config.js). |

## 4. Improvements to existing features (preserve behavior)

- **E1 — Solar screenshot export.** Reuse Creator's `toDataURL` PNG-download
  path (`creator/runtime.js:1929`). Solar has none. *Quick win.*
- **E2 — Touch camera + on-screen action buttons.** OrbitControls already
  supports touch; enable + tune, add on-screen buttons for laser/free-flight so
  the two keyboard-only tools reach touch. *Moderate.*
- **E3 — Extract shared physics substrate.** Lift gravity/collision/eclipse into
  `src/shared/` so Solar and Creator system-view share one implementation (W5).
  *Moderate, reduces risk of future drift.*
- **E4 — Shared texture-loader util.** Collapse the 3 copies into one shared
  factory. *Quick win.*
- **E5 — Self-host a minimal planet-texture set** (or pin CDN) to remove the
  availability risk (W7). *Quick win.*

## 5. Realistic new features (aligned to purpose)

- **N1 — Solar sandbox save/load slots.** Mirror Creator's `persistence.js`
  (versioned key `cosmicx.solar.v1`, sanitize-on-load). Save galaxy + spawned
  bodies + sim time + camera. Solves W2. Users can keep a scenario they built.
- **N2 — Shareable scenario codes / deep-link URLs.** Encode a saved sandbox
  state into a URL hash or copyable code (Creator already proves URL-as-source-
  of-truth with `#/creator/{slug}`). Turns a private toy into something people
  send each other — biggest reach multiplier.
- **N3 — Guided scenario presets.** One-click educational setups built on the
  existing spawn/impact tools — e.g. "Chicxulub impact," "total solar eclipse,"
  "rogue black hole flyby." Pure content on top of shipped mechanics.
- **N4 — Big Bang discovery layer.** Populate the empty stub registries (W4):
  Raycaster-picked epoch objects / discoverable galaxies with info cards. Fills
  an intended-but-empty seam; matches the existing "discovery" idiom in Creator.

## 6. High-impact major opportunities

1. **Solar persistence + shareable scenarios (N1+N2).** Largest usability gap,
   and the pattern already exists in Creator — feasible, low architectural risk,
   high value. **Flagship recommendation.**
2. **Full mobile/touch support (W1/E2).** Unlocks an entire device class the app
   currently locks out.
3. **Runtime smoke-test harness (W6).** Technical foundation — makes it safe to
   later split the god-files without silent breakage.

## 7. Prioritized matrix

| Item | Class | Impact | Complexity | Risk | Priority |
|------|-------|--------|-----------|------|----------|
| E1 Solar screenshot | Enhancement | Med | Low | Low | P1 quick win |
| E4 Shared texture loader | Tech foundation | Low | Low | Low | P1 quick win |
| E5 Self-host textures | Enhancement | Med | Low | Low | P1 quick win |
| Boot smoke tests (W6) | Tech foundation | High | Low-Med | Low | P1 |
| N1 Solar save/load | Major | High | Med | Low | P2 |
| E2 Touch controls (W1) | Major | High | Med | Med | P2 |
| E3 Shared physics (W5) | Tech foundation | Med | Med | Med | P2 |
| N2 Shareable scenarios | Major | High | Med-High | Med | P3 |
| N4 Big Bang discovery (W4) | Major | Med-High | High | Med | P3 |
| Split solar/runtime.js (W3) | Tech foundation | Med | High | Med-High | P4 |

## 8. Phased roadmap

- **Phase 0 — de-risk (foundation, low risk):** boot smoke test (Playwright/
  headless: load each route, assert canvas present + zero console errors) →
  guards the untested runtimes *before* touching them. E4 texture-loader dedupe.
- **Phase 1 — quick wins (value now):** E1 Solar screenshot, E5 self-host
  textures, first slice of E2 (on-screen laser/free-flight buttons).
- **Phase 2 — flagship + reach:** N1 Solar save/load slots (reuse
  `persistence.js` pattern). E2 full touch camera. E3 extract shared physics.
- **Phase 3 — differentiators:** N2 shareable scenario codes/URLs. N4 Big Bang
  discovery layer. N3 preset scenarios ride on N1's format.
- **Phase 4 — deep debt (optional):** split `solar/runtime.js` into sub-modules
  behind the smoke-test net.

## 9. Final recommendation — build first

**Ship Phase 0 + N1 (Solar save/load) as the first real increment.**

Why: (1) N1 closes the biggest usability gap (W2) — the flagship mode can't keep
what you build in it. (2) It's low-risk: Creator's `persistence.js` is a proven,
tested template to copy (versioned key, `sanitizeState`, slot store). (3) It
unblocks the highest-reach feature (N2 shareable scenarios) and the preset
content (N3), which both need a serialized sandbox format. (4) The Phase-0 smoke
test is cheap insurance that protects the 5443-line runtime while N1 touches it.

Architectural prep before N1: define a `serializeSolarState()/sanitizeSolarState()`
pair modeled on `creator/persistence.js`; decide the schema (galaxy id, spawned
bodies, `timeScale`, sim date, camera pose, active toggles). That schema is the
same artifact N2 encodes into a URL — design it once.

## Verification (per increment)

- `npm test` — keep 175 tests green; add unit tests for any new pure serializer
  (round-trip + sanitize-junk), matching the `creator.test.mjs` style.
- Phase-0 harness: `npm run dev`, load `#/solar-system` in the Browser preview,
  confirm canvas mounts and console is clean; use `window.solar.step()` /
  `render()` for synchronous probes (rAF freezes in backgrounded preview tabs).
- N1 manual: build a scenario → save → reload page → load slot → state matches.
- Touch (E2): `resize_window` mobile preset, confirm camera responds to
  pointer/drag.
