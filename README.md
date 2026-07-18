# CosmicX

CosmicX is a Vite-powered Vanilla JavaScript SPA containing the Solar System sandbox and the Big Bang timeline. Three.js drives both simulations; no UI framework, router package, or state library is used.

## Requirements and commands

Use Node.js 20.19+, 22.12+, or a newer supported release.

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

`npm run build` writes the static production site to `dist/`. Use `npm run preview` to verify that exact build locally.

## Routes

CosmicX uses hashes so every route works on a static host without rewrite rules:

- `#/` — title screen
- `#/modes` — mode selection
- `#/solar-system` — Solar System sandbox
- `#/big-bang` — Big Bang title and timeline

The legacy `#modes` hash is normalized to `#/modes`; unknown hashes return to `#/`. Title, modes, and sandbox are views of one mounted Solar page, so moving among them does not rebuild its Three.js scene.

## Module responsibilities

- `src/main.js` starts the application and lazy-loads route pages.
- `src/router.js` resolves hashes, serializes transitions, and enforces destroy-before-mount ordering.
- `src/pages/solar/` owns Solar markup, styles, configuration, astronomical data, camera metadata, dynamics, settings, time helpers, graphics orchestration, and lifecycle.
- `src/pages/big-bang/` owns Big Bang markup, styles, configuration, epoch playback, camera rails, system registry, UI navigation, rendering orchestration, and lifecycle.
- `src/shared/` contains only behavior used by both simulations: procedural canvas noise, post-processing shader factories, range painting, lifecycle resource tracking, and deduplicated Three.js disposal.
- `src/styles/global.css` styles only the persistent SPA shell and route fade.

Mutable simulation state is created inside each page mount or a factory called by it. Cached ES modules therefore remain safe across repeated remounts.

## Lifecycle contract

Route pages implement:

```js
mount({ root, route, navigate, replaceRoute }) => ({
  setView?,
  pause?,
  resume?,
  destroy,
})
```

Each mount owns one resource scope for listeners, animation frames, timers, observers, and guarded asynchronous work. `destroy()` is idempotent: it stops animation, invalidates browser work, disposes route-owned Three.js resources and the WebGL context, removes generated DOM and body state, clears the route root, and deletes the active `window.solar` or `window.bang` debug handle.

The mode-selection hover preview uses `?preview=1#/big-bang`. Parent messages pause its renderer while hidden, and leaving Solar removes the iframe.

## Deployment and remote assets

Vite is configured with `base: './'`, hashed production assets, minification, and disabled source maps. Upload the contents of `dist/` to any static host; hash routing needs no fallback configuration.

Google Fonts and the existing remote planet textures remain network resources. Procedural texture fallbacks keep the simulations usable when texture requests are unavailable.
