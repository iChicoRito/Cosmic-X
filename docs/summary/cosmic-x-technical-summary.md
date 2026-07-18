# CosmicX: Technical Summary

## System Overview

CosmicX is a frontend-only, Vite-powered Vanilla JavaScript Single-Page Application (SPA) containing two Three.js simulations:

- A route family for the title screen, mode selection, and interactive Solar sandbox.
- A separate Big Bang route covering cosmic evolution from singularity to the future universe.

The application uses native ES modules, WebGL, browser APIs, and hash-based client-side routing. It has no frontend framework, router dependency, state-management library, backend, database, authentication system, or server-side runtime.

## Technical Stack

| Area | Implementation |
| --- | --- |
| Language | Vanilla JavaScript using native ES modules |
| Build system | Vite 8.1.5 |
| 3D engine | Three.js 0.170.0 |
| Rendering | WebGL through `THREE.WebGLRenderer` |
| UI | Semantic HTML, dialogs, forms, CSS, and DOM event handling |
| Routing | Custom hash router using `location.hash` and `hashchange` |
| State | Route-local mutable state plus persisted browser settings |
| Persistence | `localStorage` for supported preferences |
| Testing | Dependency-free Node test runner through `node --test` |
| Deployment | Static `dist/` output with relative asset paths |

Vite produces minified and hashed JavaScript/CSS assets. Production source maps are disabled, and `base: './'` allows deployment below a host's root path.

## Routes and Navigation

The router supports:

| Hash route | Page family | View |
| --- | --- | --- |
| `#/` | Solar | Title screen |
| `#/modes` | Solar | Mode selection |
| `#/solar-system` | Solar | Interactive sandbox |
| `#/big-bang` | Big Bang | Title and cosmic timeline |

Legacy `#modes` navigation is normalized to `#/modes`, while unknown routes are replaced with `#/`.

Title, mode selection, and the Solar sandbox share one mounted Solar runtime. Switching among these views calls `setView()` instead of recreating the Three.js scene. Switching between Solar and Big Bang destroys the active runtime before mounting the next simulation.

Route modules are loaded with dynamic `import()`. The route manager serializes transitions and uses generation tokens to prevent delayed imports or rapid navigation from mounting stale pages. Browser Back and Forward operations are handled through hash-change activation without a document reload.

## Page Lifecycle

Each route module follows this internal contract:

```js
mount({ root, route, navigate, replaceRoute }) => ({
  setView?,
  pause?,
  resume?,
  destroy,
})
```

Each mounted simulation owns:

- One `AbortController` for route-owned event listeners.
- Tracked animation-frame identifiers.
- Tracked timeouts and intervals.
- Tracked observer instances.
- An asynchronous-generation guard for late callbacks.
- Route-owned DOM, canvases, Three.js resources, and post-processing resources.

`destroy()` is idempotent. Disposal cancels animation, aborts listeners, clears browser work, disconnects observers, invalidates late callbacks, disposes scene resources, releases the WebGL renderer context, removes generated DOM/body state, and deletes the corresponding debug handle.

The active Solar runtime exposes `window.solar`; the active Big Bang runtime exposes `window.bang`. Each handle is removed when its owner is destroyed.

## Solar Simulation

### Astronomical Content

The Solar route models three environments:

- **Milky Way** — the Sun, eight planets, representative modeled moons, an asteroid belt, and NASA/JPL-derived display facts.
- **Andromeda** — an imagined six-planet system around a blue-white star.
- **Messier 87** — an imagined four-world system orbiting a supermassive black hole.

The astronomical data model includes orbital distance, eccentricity, orbital period, rotational period, axial tilt, radius, visual materials, atmospheric treatment, rings, moons, and descriptive facts where applicable.

The Milky Way dossiers include rounded reference values for radius, mass, surface gravity, density, temperature, escape velocity, known moon count, habitability indicator, and atmospheric composition. The known-moon census is labeled with its July 2026 reference date; only a representative subset of moons is rendered as active 3D bodies.

### Orbital and Time Model

The runtime uses:

- Scaled and compressed astronomical distances for visibility.
- Elliptical orbital positions driven by each body's eccentricity and period.
- `GM_SUN` calibrated in scene units for approximately Earth-year orbital timing.
- J2000 (`2000-01-01 12:00:00 UTC`) as the deterministic time origin.
- A bounded timeline of ±36,525 days.
- Time-scale presets from 0.5 to 200 simulated days per real second.
- Absolute-day pose reconstruction for deterministic seeking and reverse playback.

Playback supports forward, pause, reverse, direct scrubbing, previous/next timeline stops, session reset, and jump-to-present. Spawn events are timestamped so timeline traversal can replay them when crossed forward and remove them when crossed backward.

### Interactive Dynamics

The Solar runtime supports:

- Free-body gravitational integration for comets, asteroids, debris, meteors, projectiles, and black holes.
- Configurable global gravity strength.
- Collision detection for dynamic objects and major celestial bodies.
- Impact craters, fragments, explosions, debris, body destruction, orbital perturbation, and debris rings.
- Atmospheric meteor entry, ablation, fire/smoke tails, and meteor showers.
- Comets with adjustable semi-major axis, eccentricity, and color treatment.
- Asteroids spawned from the camera, into random orbits, or near Earth.
- Inspectable asteroid mining with progress and depletion state.
- Black-hole attraction, event-horizon consumption, orbital-rail detachment, and screen-space gravitational lensing.
- Asteroid/comet targeting with adjustable speed, angle, mass, size, and optional lock-on guidance.
- Automatic closest-approach prediction over a bounded horizon with capped impact warnings.
- Automatic and manually triggered solar/lunar eclipse events.
- Moon phases, Trojan asteroid groups, shooting stars, orbit prediction, trails, and breadcrumbs.

These systems are interactive approximations designed for visualization, not precision ephemeris or n-body research.

### Camera System

The Solar page implements six camera modes:

1. `orbit`
2. `free`
3. `follow`
4. `cinematic`
5. `drone`
6. `telescope`

The camera layer includes selectable targets, scripted flights, reset/home behavior, orbit controls, mouse sensitivity, movement-speed settings, pan/rotation/zoom multipliers, a telescope overlay and zoom control, cinematic letterboxing, and mode-specific hints.

### UI and Settings

The control surface is divided into World, Sim, Spawn, Impact, Cam, and FX panels. A persistent bottom bar presents:

- UTC simulation date and time.
- Elapsed simulated days.
- Play, pause, reverse, and speed controls.
- Date scrubbing and timeline stops.
- Current epoch and modeled universe age.
- Selected-object identity, source, status, and finite unit-labelled metrics.

The settings dialog persists supported preferences under `cosmicx.settings.v1`. Categories include:

- Display mode.
- Graphics preset, FXAA, bloom, particle density, belt visibility, and nebula visibility.
- Free-look sensitivity and camera movement multipliers.
- HUD, timeline, label, and collision-warning visibility.

## Big Bang Simulation

### Epoch Model

The Big Bang experience uses a normalized `u` timeline from 0 to 1. Eleven chronological epochs divide that range into weighted spans:

1. Singularity
2. Planck Epoch
3. Inflation
4. Particle Formation
5. Atoms Form
6. First Stars
7. First Galaxies
8. Milky Way Forms
9. Solar System Forms
10. Present Day
11. Future Universe

Pure helper functions resolve the active epoch, local epoch progress, epoch start position, and interpolated environmental state. Applying an epoch is deterministic from the normalized timeline position, making direct scrubbing and reverse playback repeatable.

### Visual Systems

Systems are constructed in a fixed order and applied in registry order:

- Quantum foam.
- Initial flash.
- Inflation shockwave.
- Expanding space grid.
- Quark-gluon plasma.
- Particle formation.
- Cosmic microwave background.
- First stars.
- Early galaxies.
- Hero representations of the Milky Way, Andromeda, and Messier 87.
- Solar System formation with all eight planets.
- Multi-layer starfields.

The renderer uses procedural canvas textures, point sprites, morphing particle systems, additive blending, atmosphere shaders, accretion effects, post-processing bloom, FXAA, and a black-hole lensing shader. Remote planet maps upgrade procedural fallback textures when network loading succeeds.

### Playback and Camera

The complete default journey lasts approximately 90 seconds at 1× speed. Playback supports:

- Play/pause.
- Forward and reverse direction.
- 0.25×, 0.5×, 1×, 2×, 4×, and 8× speeds.
- Direct timeline scrubbing.
- Direct jumps to all epochs.
- Adjustable visual expansion rate from 0.2× to 3×.
- Replay after forward completion.

The cinematic camera follows interpolated camera rails and uses hard cuts at selected transitions. Users can disable cinematic mode and use orbit controls. The title view parks within the formed-galaxies era, then rewinds to the beginning when the user selects Begin. The final message tracks a point in the 3D scene and provides replay and mode-menu actions.

## Rendering Pipeline

Both simulations use Three.js scenes with route-owned renderers and post-processing composers. Shared rendering utilities include:

- Procedural canvas/noise helpers.
- Reusable post-processing shader factories.
- Range-input fill rendering.
- Recursive Three.js resource disposal.
- Lifecycle resource tracking.

The application preserves simulation-specific update and render order. Quality settings adjust pixel ratio, shadows, particle density, FXAA, bloom, asteroid-belt visibility, and environmental effects without replacing the simulation model.

## Performance and Resource Management

Only the active main simulation owns the primary animation loop. Route-level code splitting avoids loading the other simulation's module until it is needed.

The Big Bang hover preview is an iframe that loads the same SPA at `?preview=1#/big-bang`. Parent-to-iframe messages pause its animation while hidden and resume it when shown. The iframe is removed when the Solar runtime is destroyed.

Lifecycle cleanup prevents repeated route changes from accumulating:

- WebGL canvases and contexts.
- Animation loops.
- Event handlers.
- Timers and observers.
- Scene geometries, materials, textures, and render targets.
- Orbit controls and post-processing composers.
- Generated labels and route DOM.

## Accessibility and Responsive Behavior

The UI includes semantic buttons, labelled form controls, accessible dialogs and tabs, `aria-live` announcements, explicit panel state, keyboard-focus management, reduced-motion behavior, immersive UI toggles, and responsive/mobile layouts.

Fullscreen requests remain attached to the Start, Begin, and acknowledgement gestures because browsers require fullscreen activation from direct user interaction.

## Debugging and Verification Interfaces

`window.solar` exposes runtime references and controlled actions including:

- Scene/camera/control references.
- Body collections.
- Galaxy switching.
- Comet, asteroid, black-hole, and projectile operations.
- Headless `step()` and `render()` methods.
- Post-processing references.
- `selfCheck()` for the active runtime contract.

`window.bang` exposes:

- Scene/camera/control and epoch state.
- System registry.
- Timeline setters and epoch navigation.
- Camera-rail and environment helpers.
- Headless `step()` and `render()` methods.
- Bloom/lensing references and expansion state.

Automated Node tests cover pure time/epoch helpers, route resolution, same-family view changes, navigation ordering, stale-mount prevention, Back/Forward behavior, lifecycle idempotence, debug-handle cleanup, accessibility contracts, simulation controls, rendering features, and timeline behavior.

## Deployment Characteristics

CosmicX builds to static files and requires no application server. Hash routes allow refresh and direct access on static hosts without SPA rewrite rules. A typical deployment runs:

```sh
npm install
npm run build
```

and publishes `dist/`.

Google Fonts and remote planet textures require network access. Procedural texture fallbacks keep the simulations usable if remote planet maps fail.

## Benefits of the Architecture

- **Fast in-app navigation:** route changes do not reload the browser document.
- **Controlled GPU/CPU ownership:** inactive simulations are paused or destroyed.
- **Repeatable simulation state:** absolute timeline helpers make seeking and reverse traversal deterministic.
- **Maintainability:** Solar, Big Bang, routing, styles, data, camera, timeline, UI, and shared utilities have explicit module boundaries.
- **Static-host portability:** relative assets and hash routes avoid server rewrite requirements.
- **Low dependency surface:** only Three.js and Vite are required.
- **Testability:** pure helpers and lifecycle behavior can be validated without reconstructing monolithic HTML.
- **Progressive visual resilience:** procedural assets provide fallbacks for remote textures.

## Technical Limitations

- The system has no backend, accounts, cloud saves, collaboration, analytics, or database.
- Simulation state and user-created objects do not persist across a full page reload.
- Only supported settings are stored locally in the current browser.
- Distances, sizes, object counts, forces, and event behavior are scaled or simplified for presentation and performance.
- The application is not a precision n-body integrator, live astronomical ephemeris, spacecraft-navigation system, or authoritative cosmology calculator.
- Remote fonts and higher-quality planet texture upgrades depend on third-party network resources.

## Terminology

| Technical term | Meaning in CosmicX |
| --- | --- |
| SPA | A single loaded document whose views change through JavaScript |
| Hash routing | Navigation based on the URL fragment after `#` |
| Route family | Multiple routes sharing one mounted simulation instance |
| Dynamic import | Loading a route's JavaScript only when it is requested |
| Lifecycle | The mount, pause, resume, and destroy stages of a route |
| Resource disposal | Releasing listeners, timers, WebGL resources, and DOM owned by a route |
| Generation token | A counter used to ignore stale asynchronous navigation or loading work |
| WebGL | Browser graphics API used for hardware-accelerated 3D rendering |
| Post-processing | Visual passes applied after the main scene render |
| FXAA | Screen-space anti-aliasing used to reduce jagged edges |
| Bloom | Glow produced around bright rendered areas |
| Gravitational lensing shader | A screen effect that bends the rendered image near black holes |
| Procedural texture | An image generated by code rather than downloaded as a file |
| Ephemeris | A time-based table/model of astronomical positions; CosmicX is not a precision ephemeris |
| J2000 | The Solar timeline's reference epoch at 2000-01-01 12:00 UTC |
| Normalized timeline | Progress represented as a value from 0 to 1 |
| Deterministic seeking | Rebuilding the same state whenever the same timeline position is selected |
| Debug handle | A controlled global object used to inspect or verify the active runtime |

