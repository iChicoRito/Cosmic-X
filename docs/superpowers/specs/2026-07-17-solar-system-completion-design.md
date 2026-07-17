# Solar System Simulator Completion Design

**Status:** Approved on 2026-07-17

## Goal

Finish the existing simulator as a scientifically inspired, interactive visual model. Keep its scaled game-style physics, preserve the polished Three.js presentation, and make every control and requested subsystem functional.

## Current State

`index.html` already renders a stable solar system and contains substantial unfinished code for scientific facts, multiple moons, eclipses, Trojans, near-Earth asteroids, mining, meteors, major collisions, camera controls, and warning UI. The main failure is integration: several helpers are undefined, many controls have no handlers, several update functions are never called, and object destruction leaves stale scene state.

`index copy.html` is a historical backup and will not be modified.

## Architecture

Keep the application in `index.html`. Reuse the existing scene objects, records, effects, OrbitControls, and UI design. Add only the shared state and functions required to connect the existing systems:

- a small notification layer for toasts and throttled events;
- a dossier renderer for planets, moons, comets, asteroids, stars, and black holes;
- one camera state object with mode, target, input, and mode-specific update behavior;
- a closest-approach predictor that feeds the warning cards;
- lifecycle cleanup that removes meshes, trails, predictions, mining effects, labels, and picking registrations together.

No new runtime dependency, framework, worker, backend, build step, or module split will be introduced.

## Scientific Data

The eight Solar System planets will display radius, diameter, mass, gravity, density, mean temperature, escape velocity, rotation period, orbital period, distance from the Sun, current known moon count, atmosphere, and habitability.

Physical and orbital values will follow NASA/JPL references. Moon counts will be updated to current NASA values. Habitability is not a standardized measured quantity, so the UI will call it a **simulator estimate**. Values for the fictional Andromeda and M87 worlds will be labeled **modeled**, not measured.

Scene distances, body sizes, gravitational parameters, impact energy, mining yield, and time remain scaled gameplay values.

## Interaction Design

Clicking any registered body will focus it and open its dossier. Asteroid dossiers will provide a mining action. The dossier will show live moon phases, moon status, comet ice, and mining state where applicable.

The existing Spawn and Impact panels will wire the dormant NEA and meteor actions. Existing controls remain visually unchanged except for small status or explanatory copy where scientific/model distinctions need to be clear.

## Simulation Behavior

The main update loop will run the existing Trojan, eclipse, moon/planet collision, dynamic-body collision, effect, warning, and camera updates at bounded intervals.

Collision routing will cover:

- planet versus planet;
- planet versus moon;
- moon versus moon;
- asteroid versus planet or moon;
- comet versus planet or moon;
- star versus planet;
- black hole versus planet.

Existing explosions, debris, shockwaves, craters, fragmentation, rings, new moons, and orbital changes will be retained. The missing growth effect will animate new rings and moons. All destruction routes will share the same cleanup bookkeeping.

## Camera Modes

One state machine will implement the existing buttons:

- **Orbit:** current OrbitControls behavior.
- **Free:** WASD plus vertical movement and drag-to-look.
- **Follow:** tracks the selected planet, moon, comet, or asteroid.
- **Cinematic:** automatically tours living targets with letterbox presentation.
- **Drone:** close, gently drifting orbit around the selected target.
- **Telescope:** narrow field of view, reticle, zoom, and target readout.
- **Landing:** animated descent to the selected planet or moon.
- **Surface:** local first-person movement constrained near the selected surface.

Escape returns to Orbit mode. Modes that need a target will use the selected body or the first available planet.

## Impact Warnings

For each live free body, compute time and distance at closest approach against live planets and moons over a short prediction horizon. Show warnings only when the predicted miss distance crosses the body radius plus a safety margin.

Each warning card will contain a blinking danger icon, threat and target names, and estimated time to impact. Clicking it focuses the target. Cards disappear when the trajectory becomes safe, the body is removed, or the collision occurs.

## Error Handling and Performance

Undefined helper calls will be replaced with real implementations. Expensive prediction work will be throttled, warning cards capped, and one major collision handled per simulation tick. The existing quality and particle-density controls remain authoritative.

Removed objects will unregister from picking and camera target lists and dispose owned geometry/materials where safe. Shared geometry will not be disposed per body.

## Verification

A dependency-free Node test will assert the required wiring and guard against the unfinished-state regressions. Browser verification will cover:

- no uncaught console errors;
- dossier open/close and complete planet fields;
- asteroid mining and meteor/NEA actions;
- every camera button and target selection;
- impact warning appearance and dismissal;
- representative planet, moon, star, and black-hole collision paths;
- desktop and mobile layouts;
- reset and galaxy-switch cleanup.

The workspace is not a Git repository, so the design and implementation cannot be committed here.
