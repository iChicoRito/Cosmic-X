# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CosmicX: Vite-powered Vanilla JS SPA with two Three.js simulations — a Solar System sandbox and a Big Bang timeline. No UI framework, no router package, no state library.

## Commands

```sh
npm install
npm run dev       # vite dev server
npm test          # node --test tests/*.test.mjs
npm run build     # writes static site to dist/
npm run preview   # serve the exact dist/ build locally
```

Run a single test file directly: `node --test tests/router.test.mjs`.

Node 20.19+ or 22.12+ required. No Python in this environment. Dev server launch.json config name is `solar`, port 8123.

## Routing

Hash-based, works on static hosts with no rewrite rules (`base: './'` in [vite.config.js](vite.config.js)):

- `#/` — title screen
- `#/modes` — mode selection
- `#/solar-system` — Solar System sandbox
- `#/big-bang` — Big Bang title and timeline

Legacy `#modes` normalizes to `#/modes`; unknown hashes fall back to `#/`. Title, modes, and sandbox are all views of one mounted Solar page ([src/pages/solar/page.js](src/pages/solar/page.js)) — switching between them does not rebuild the Three.js scene. Route resolution lives in [src/router.js](src/router.js) (`resolveRoute`, `createRouteManager`, `startHashRouter`); it serializes transitions and enforces destroy-before-mount ordering (each activation increments a `generation` token; stale in-flight mounts are destroyed instead of applied).

## Module layout

- `src/main.js` — entry point, wires up the hash router and lazy page loaders.
- `src/router.js` — hash parsing, route manager, transition sequencing.
- `src/pages/solar/` — Solar markup, styles, config, astronomical data, camera metadata, dynamics, settings, time helpers, graphics orchestration, lifecycle.
- `src/pages/big-bang/` — Big Bang markup, styles, config, epoch playback, camera rails, system registry, UI navigation, rendering orchestration, lifecycle.
- `src/shared/` — code used by *both* simulations only: procedural canvas noise, post-processing shader factories, range painting, lifecycle resource tracking (`resource-scope.js`), deduplicated Three.js disposal (`dispose-three.js`). Don't put single-simulation code here.
- `src/styles/global.css` — persistent SPA shell and route fade only; simulation-specific styling belongs in the page's own `.css`.

Mutable simulation state is created inside each page's `mount()` or a factory it calls — never at module scope — so cached ES modules stay safe across repeated remounts.

## Page lifecycle contract

Every route page module exports:

```js
mount({ root, route, navigate, replaceRoute }) => ({
  setView?,
  pause?,
  resume?,
  destroy,
})
```

`destroy()` must be idempotent: stop animation, invalidate in-flight async work, dispose route-owned Three.js resources and the WebGL context, remove generated DOM and body state, clear the route root, and delete the page's debug handle (`window.solar` / `window.bang`).

The mode-selection hover preview loads `?preview=1#/big-bang` in an iframe; the parent posts `cosmicx:preview:pause`/`cosmicx:preview:resume` messages, which the router forwards to `manager.pause()`/`resume()`. The iframe is removed when leaving Solar.

## Debugging

`window.solar` and `window.bang` are live debug handles exposed while their respective page is mounted (deleted on `destroy()`). Use `solar.step()` / `solar.render()` for synchronous probes — the Browser preview pane's hidden tabs freeze `requestAnimationFrame` after a few minutes, so async/rAF-based checks against a backgrounded tab will silently stall.

## Assets and deployment

Google Fonts and remote planet textures are network resources; procedural texture fallbacks keep both simulations usable when those requests fail. Production build is minified, has source maps disabled, and uses hashed filenames — upload `dist/` contents to any static host as-is.
