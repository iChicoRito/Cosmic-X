# Task 18 — Per-system "Sim" tab (Solar-parity simulation)

## Context

Task 17 gave created stellar systems their own `#/creator/{slug}` page with a
Solar-grade HUD, but the scene is a **kinematic rail model** (planets/moons on
fixed orbits, no physics) and the god tools were removed. This task adds a **Sim
tab** to that stellar page, matching the Solar System Simulation's Sim tab:
simulation status, controls (speed / gravity / planet-size / distances), display
options (trails / labels), automatic events (collisions / eclipses / resident
asteroids), and a manual **Trigger eclipse** event — a real working simulation,
scoped to the selected system and its characteristics.

## Approved decisions

- **Full working simulation.** Resident asteroids are free bodies under the host
  star(s) gravity; collisions absorb them into a planet/star; eclipses cast real
  shadows. Planets/moons stay on their stable rails (never break off).
- **Fold the existing "View" tab into the new "Sim" tab** — Solar has no View
  tab; its trails/labels/size/distance live in Sim.
- **Manual events: "Trigger eclipse" only** (adapts to the system; hidden when
  there is no moon/planet to eclipse or transit).

## ⚠ Decision to confirm at review

The creator's HUD uses plain `cr-check` checkboxes for every toggle (View, FX,
Cam). Solar uses a track/thumb `.switch`. The Sim tab will **reuse the creator's
`cr-check` toggles** and follow Solar's **layout / grouping / typography** — this
keeps the Sim tab consistent with the creator's other tabs and avoids restyling
unrelated panels (which the task says not to do). If you'd rather have Solar's
exact track/thumb switches, say so and I'll add that switch component (and can
optionally roll it across the other creator tabs for consistency).

## Tab & HUD changes

- **template.js** — replace the `View` tab button + `crViewPanel` with a `Sim`
  tab (`data-panel="sim"`) + `crSimPanel`. Group order mirrors Solar's Sim page:
  Status → Simulation controls → Display options → Automatic events → Manual
  events. Reuse `cr-field` / `cr-check` / `cr-sliders`; use the creator's `h4`
  sub-headers for the "Automatic events" / "Manual events" groups.
- **runtime.js** — PANELS `view` → `sim`
  (`{ el: 'crSimPanel', title: 'Simulation', where: 'system' }`); update the
  `systemPanelMemory` default; `openPanel('sim')` rebuilds the manual-events list
  for the current system.

## Sim tab contents

- **Simulation status** — `Playing` toggle; reads/writes `state.sim.playing`,
  kept in sync with the transport bar's pause button.
- **Simulation controls** (sliders via existing `sliderRow`, live value + unit):
  - `Speed` — days/second, drives `simScale`; shares one value with the
    transport `SYSTEM_SPEEDS` pips (moving either updates the other).
  - `Gravity` — `0–5×`, scales the asteroid gravity field.
  - `Planet size` — `0.5–4×` (existing `setPlanetScale`).
  - `Distances` — orbit spacing (existing `setOrbitScale`), Solar-style label.
- **Display options** — `Orbit trails` (`setTrailsVisible`), `Labels`
  (`setLabelsVisible`); moved out of the old View tab.
- **Automatic events** — `Collisions`, `Eclipses`, `Resident asteroids` toggles.
- **Manual events** — `Trigger eclipse` button, built only when supported.

## Physics substrate (new, in system-view.js)

A lightweight free-body layer, gated by the Sim toggles. Planets/moons never
leave their rails; asteroids are the only free bodies.

- **Attractors**: host star(s), reusing the star mesh positions; one GM each,
  scaled by star mass and by the `Gravity` slider. Binary/trinary sums naturally.
- **Resident asteroids**: when the toggle is on, spawn N (~8–14, scaled by system
  size) small rock bodies on near-circular orbits in/near the belt zone and
  integrate them under gravity each sim step (fixed sub-stepping like the old
  substrate). Toggling off disposes them.
- **Collisions**: when on, an asteroid inside a planet/star radius is absorbed
  with a small flash and removed (passive — **no planet destruction**). When off,
  asteroids pass through bodies.
- Bodies live in a `dynGroup` at scene root, disposed on `clearGroup`/`destroy`,
  reusing the shared rock geometry/material pattern. **No** spawn-from-camera,
  impact weapons, laser, or black holes.

## Eclipses (shadows)

- Gated by the `Eclipses` toggle (off by default, like Solar's "High — shadows &
  eclipses"). On: `renderer.shadowMap.enabled = true`, primary star
  `PointLight.castShadow = true` (mapSize 1024, near/far tuned to system size),
  planets + moons `castShadow` / `receiveShadow`. Off: disable to save cost.
- **Manual "Trigger eclipse"**: enable shadows if needed, then align a moon (or
  the planet) onto the star→planet line so a shadow transit occurs, and briefly
  frame it. Label adapts: "Trigger lunar eclipse" (moon present) vs "Trigger
  transit" (planet only); button hidden if the system has neither.

## Adaptation per stellar object

- Manual-events list built from system contents: eclipse/transit only when the
  system has a qualifying planet/moon.
- Resident-asteroid count and orbit band scale with the system `layout` size.
- Multi-star systems: gravity sums all stars (attractors already per-star).

## Files

- `src/pages/creator/template.js` — Sim tab button + `crSimPanel` markup.
- `src/pages/creator/runtime.js` — PANELS, `buildPanels` Sim wiring, manual-events
  builder, Speed↔transport sync, remove View wiring.
- `src/pages/creator/system-view.js` — free-body substrate (asteroids / gravity /
  collisions), eclipse shadow enable/disable + `triggerEclipse`, resident-asteroid
  toggle, `update()` reads the new opts.
- `src/pages/creator/creator.css` — only if a sub-header spacing tweak is needed
  (prefer reusing existing rules).
- `tests/creator.test.mjs` — Sim tab ids/structure, PANELS `sim` entry, substrate
  functions present, eclipse toggle, View tab removed.

## Verification

- `npm test` green.
- Browser (preview `solar`, port 8123): enter a system → tabs read
  Bodies / **Sim** / Cam / Stats / Codex / Save / FX (no View); Playing / Speed /
  Gravity / Planet size / Distances / Trails / Labels all work and live-update;
  Resident asteroids spawn and orbit; Collisions absorb them; Eclipses cast
  shadows; Trigger eclipse produces a visible shadow; style matches the creator
  HUD. (Screenshot capture stalls on the lens-flare occlusion query — verify via
  pixel sampling / DOM probes, per prior note.)

## Non-goals

- No god tools (spawn-from-camera, impact weapons, laser, black holes) — passive
  simulation only.
- No changes to Bodies / Cam / Stats / Codex / Save / FX beyond removing View.
- No restyle of the creator's existing toggles unless approved at review.
