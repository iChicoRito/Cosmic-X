# Objective
## Refactor the Existing Simulation Project into a Modular Vanilla JavaScript SPA Using Vite

---

## Role

You are a senior frontend architect specializing in Vanilla JavaScript, native ES Modules, WebGL-based simulations, SPA architecture, performance optimization, and Vite build systems. Approach this objective with a strong focus on behavior preservation, lifecycle safety, maintainability, and production readiness.

---

## Description

Refactor the existing frontend-only simulation project into a clean, modular Vanilla JavaScript Single Page Application powered by Vite. The current project consists primarily of two large standalone files: `index.html`, containing more than 5,000 lines for the Solar System simulation, and `bigbang.html`, containing more than 2,000 lines for the Big Bang simulation. Separate the existing HTML, CSS, JavaScript, assets, controls, UI components, state, animations, utilities, and simulation-specific code into logical, maintainable modules using native ES Module syntax.

Convert the two standalone pages into SPA routes so users can navigate instantly between the Solar System and Big Bang simulations without triggering a full browser reload. Introduce reliable page and simulation lifecycle management to ensure each mode initializes only when entered and fully disposes of its active resources when exited. Preserve the current visual design, animations, controls, responsiveness, simulation behavior, features, and overall user experience while maintaining or improving runtime performance.

---

## Primary Objective

Reorganize the existing Solar System and Big Bang simulations into a modular Vanilla JavaScript SPA built with Vite without changing their existing behavior, simulation logic, physics, calculations, rendering output, or application features.

---

## Secondary Objectives

- Replace the two standalone page architecture with client-side routing between the Solar System and Big Bang simulations.
- Separate the current monolithic HTML, CSS, and JavaScript into logical and reusable modules.
- Implement explicit initialization and disposal lifecycles for every simulation page.
- Prevent duplicate event listeners, orphaned animation loops, memory leaks, and unnecessary CPU or GPU activity during navigation.
- Configure Vite for local development, optimized production builds, and static deployment.
- Preserve the existing design, responsiveness, controls, transitions, animations, and user experience.
- Maintain or improve the application's current loading and runtime performance.

---

## Success Criteria

- The project runs through Vite during development.
- A Vite production build completes successfully.
- The project remains entirely within Vanilla JavaScript and native browser technologies.
- `index.html` becomes the SPA entry point rather than containing the complete Solar System implementation.
- The former `bigbang.html` page is integrated into the SPA instead of remaining a separately loaded document.
- Navigation between the Solar System and Big Bang simulations occurs without a full page reload.
- Browser navigation controls, including Back and Forward, work correctly with the selected routing strategy.
- Each simulation initializes only when its route becomes active.
- Leaving a simulation stops its active animation frames, timers, listeners, observers, workers, audio, and other runtime resources where applicable.
- Repeatedly switching between routes does not create duplicate controls, repeated handlers, overlapping animation loops, or degraded performance.
- Existing simulation physics, calculations, rendering behavior, interactions, features, and visual output remain functionally unchanged.
- Existing UI layouts, animations, controls, responsive behavior, and styling remain visually consistent.
- Production assets are bundled and minified.
- Production output uses hashed asset filenames.
- Production source maps are disabled.
- The generated production build is suitable for static hosting.
- Runtime performance is maintained or improved after refactoring.

---

## Constraints

- Use Vanilla JavaScript only.
- Use native ES Modules through `import` and `export`.
- Use Vite as the development server and production build tool.
- Do not migrate the project to React, Vue, Angular, Svelte, or any other frontend framework.
- Do not rewrite or redesign the existing simulation systems.
- Do not alter physics formulas, calculations, rendering behavior, timings, controls, application features, or user-facing behavior unless a minimal change is strictly required for modularization.
- Do not remove existing functionality.
- Preserve the current visual design and overall user experience.
- Disable source maps for production builds.
- Ensure the final project remains compatible with static deployment.

---

## Priority Level

- Preserving the existing simulation logic, behavior, features, and rendering output is the highest priority.
- Structural improvements must not introduce functional regressions.
- Lifecycle safety and prevention of resource leaks are critical requirements.

---

## Out of Scope

- Migrating to a component framework such as React, Vue, Angular, or Svelte.
- Rewriting the simulations from scratch.
- Replacing the current physics or rendering architecture.
- Introducing new simulation features unrelated to modularization.
- Redesigning the existing interface.
- Changing established interactions, controls, calculations, or visual behavior.
- Performing broad feature optimizations that would alter application behavior.

---

## Context & Dependencies

- The current Solar System simulation is contained primarily in `index.html`, which exceeds 5,000 lines.
- The current Big Bang simulation is contained primarily in `bigbang.html`, which exceeds 2,000 lines.
- Both simulations currently operate as standalone frontend pages.
- The project already contains existing simulation logic, visual effects, controls, styling, assets, animations, and application features that must be preserved.
- The refactor depends on carefully extracting existing code without changing execution order or behavior.
- Static hosting must support the selected routing strategy or provide the required SPA fallback configuration.

---

## Supporting Tasks

### Project Audit and Dependency Mapping
- **[Sequential]** Review `index.html`, `bigbang.html`, existing stylesheets, scripts, assets, and supporting files before moving any code.
- **[Sequential]** Identify global variables, shared dependencies, script execution order, DOM assumptions, event listeners, timers, animation loops, rendering contexts, and cross-feature dependencies.
- **[Sequential]** Map which code belongs to the Solar System simulation, Big Bang simulation, shared UI, shared utilities, routing, state, assets, controls, and animations.
- Document behavior-sensitive dependencies that must preserve their current initialization order.

### Vite Project Setup
- **[Parallel]** Add the required Vite project configuration and package scripts.
- Configure commands for development, production build, and local production preview.
- Configure the production build to bundle and minify assets.
- Ensure generated production assets use hashed filenames.
- Disable production source maps.
- Configure asset paths so the project works correctly after static deployment.
- Preserve access to all existing images, fonts, textures, models, audio files, and other static resources.

### SPA Entry Point
- **[Sequential]** Convert the root `index.html` into a lightweight Vite-compatible SPA shell.
- Add a single application mount container for route content.
- Move Solar System-specific markup out of the root document and into its page structure.
- Move Big Bang-specific markup out of `bigbang.html` and into its SPA page structure.
- Keep only truly global metadata, shared loading elements, and root-level application markup in the SPA entry file.

### Module Architecture
- **[Parallel]** Separate JavaScript into native ES Modules organized by responsibility.
- Create dedicated modules for pages, simulation systems, rendering, controls, UI behavior, animations, state, routing, utilities, and shared services.
- Separate CSS into global, shared, page-specific, component-specific, responsive, and animation styles where appropriate.
- Avoid creating oversized replacement modules that reproduce the original monolithic structure.
- Keep Solar System-specific and Big Bang-specific implementation details isolated from one another.
- Extract shared functionality only when behavior is genuinely shared.

### Suggested Project Structure
- Organize the project using a clear structure similar to:

```text
project-root/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── assets/
├── src/
│   ├── main.js
│   ├── app.js
│   ├── router/
│   │   ├── router.js
│   │   └── routes.js
│   ├── pages/
│   │   ├── solar-system/
│   │   │   ├── solarSystemPage.js
│   │   │   ├── solarSystemTemplate.js
│   │   │   ├── solarSystemLifecycle.js
│   │   │   └── solarSystem.css
│   │   └── big-bang/
│   │       ├── bigBangPage.js
│   │       ├── bigBangTemplate.js
│   │       ├── bigBangLifecycle.js
│   │       └── bigBang.css
│   ├── simulation/
│   │   ├── solar-system/
│   │   ├── big-bang/
│   │   └── shared/
│   ├── ui/
│   │   ├── components/
│   │   ├── panels/
│   │   ├── modals/
│   │   └── navigation/
│   ├── controls/
│   ├── state/
│   ├── animations/
│   ├── utils/
│   ├── styles/
│   │   ├── global.css
│   │   ├── variables.css
│   │   ├── responsive.css
│   │   └── animations.css
│   └── assets/
└── dist/
```

- Adapt the exact structure to the existing codebase rather than forcing unnecessary folders or abstractions.

### Client-Side Routing
- **[Sequential]** Implement client-side routing using either the History API or hash routing based on deployment compatibility and existing navigation requirements.
- Define routes for the Solar System simulation and Big Bang simulation.
- Replace navigation that currently loads `index.html` or `bigbang.html` with SPA route transitions.
- Ensure route changes update the displayed page without reloading the browser document.
- Support direct route access where permitted by the deployment environment.
- Ensure browser Back and Forward navigation correctly activates and disposes of simulation pages.
- Provide graceful handling for unknown routes.

### Page Lifecycle Management
- **[Sequential]** Define a consistent lifecycle contract for every route, such as `mount`, `start`, `pause`, `resume`, and `destroy`, using only the methods required by the existing project.
- Initialize page-specific DOM references only after the route markup has been mounted.
- Start simulation rendering and animation loops only when the corresponding page is active.
- Stop and cancel `requestAnimationFrame` loops when leaving a page.
- Remove page-specific event listeners during disposal.
- Clear intervals, timeouts, and delayed callbacks.
- Disconnect `ResizeObserver`, `MutationObserver`, and other observers where used.
- Release or pause audio resources where applicable.
- Terminate Web Workers where applicable.
- Dispose of renderer resources, geometries, materials, textures, framebuffers, and contexts only where the existing rendering system supports safe disposal.
- Reset page-specific state only when required to preserve current behavior.
- Prevent asynchronous callbacks from modifying a page after it has been unmounted.

### Event Listener Management
- **[Parallel]** Replace anonymous or untracked event bindings with lifecycle-managed handlers where necessary.
- Store handler references so they can be removed reliably.
- Use `AbortController`-based event cleanup where suitable.
- Prevent repeated route visits from registering duplicate keyboard, mouse, touch, resize, visibility, and control listeners.
- Keep truly global listeners centralized and initialized only once.

### Animation Loop Management
- **[Parallel]** Identify every `requestAnimationFrame` loop used by both simulations and shared UI effects.
- Ensure only the active simulation's primary loop runs.
- Cancel inactive simulation loops during route transitions.
- Prevent multiple loop instances from being created after repeated navigation.
- Preserve the original timing, delta calculations, interpolation, physics stepping, and rendering order.

### State Management
- **[Parallel]** Introduce lightweight Vanilla JavaScript state management only where required to remove unsafe global dependencies.
- Separate global application state from Solar System-specific and Big Bang-specific state.
- Preserve existing default values and state transitions.
- Avoid introducing a complex external state library.
- Ensure route transitions do not unintentionally reset or duplicate state unless the current application behavior requires a reset.

### HTML and Template Extraction
- **[Parallel]** Extract Solar System markup into a dedicated page template or rendering module.
- Extract Big Bang markup into a dedicated page template or rendering module.
- Preserve all IDs, classes, data attributes, accessibility attributes, and element hierarchy required by existing JavaScript and CSS.
- Avoid renaming selectors unless necessary, and update every dependency when a rename is unavoidable.
- Preserve the existing DOM initialization order where simulation logic depends on it.

### CSS Modularization
- **[Parallel]** Move inline and embedded CSS into dedicated stylesheet modules.
- Separate shared styles from simulation-specific styles.
- Preserve current specificity, responsive breakpoints, transitions, animations, layouts, z-index behavior, and visual output.
- Prevent page-specific styles from leaking into the other simulation.
- Avoid changing visual values unless required to preserve the original design after extraction.

### JavaScript Modularization
- **[Parallel]** Extract existing scripts into focused modules without rewriting the underlying logic.
- Replace global references with explicit imports, exports, or scoped dependencies.
- Preserve initialization order and side effects that are required by the current implementation.
- Avoid circular dependencies.
- Avoid broad abstraction changes that could alter simulation behavior.
- Keep calculations, constants, update functions, rendering functions, and interaction logic intact unless minimal dependency injection is required.

### Asset Handling
- **[Parallel]** Organize existing images, textures, models, audio, icons, and other assets for Vite.
- Use `public` for resources that must retain stable public paths.
- Use imported source assets where Vite processing and hashed output are appropriate.
- Update asset references without changing the assets themselves.
- Verify all assets load correctly in both development and production builds.

### Performance Preservation
- **[Parallel]** Ensure both simulations are not initialized simultaneously unless the current experience explicitly requires it.
- Avoid loading or executing Big Bang-specific code while only the Solar System route is active, and vice versa, where safe to do so.
- Use dynamic imports for route-level modules when they do not affect existing behavior.
- Prevent hidden canvases, inactive simulations, or abandoned effects from consuming resources.
- Preserve current rendering quality, frame timing, and feature behavior.
- Do not introduce optimizations that modify physics precision or simulation results.

### Navigation Transition Integration
- **[Sequential]** Preserve or reimplement the current visual transition behavior within SPA navigation.
- Ensure transitions complete before destroying resources that remain visible during the animation.
- Prevent user interaction from triggering overlapping route transitions.
- Keep route changes responsive while avoiding visible flashes, blank frames, or duplicated scenes.

### Production Build and Static Deployment
- **[Parallel]** Generate a production-ready Vite build.
- Confirm that the `dist` output contains optimized HTML, JavaScript, CSS, and assets.
- Verify hashed filenames are generated for bundled assets.
- Confirm source maps are not produced in production.
- Ensure all routes and assets work under the intended static deployment path.
- Document any rewrite or fallback rule required when using History API routing.
- Prefer hash routing when the target static host cannot provide an SPA fallback and preserving direct navigation is required.

### Regression Validation
- **[Sequential]** Compare the refactored application against the original Solar System and Big Bang pages.
- Test all controls, panels, modals, menus, keyboard shortcuts, pointer interactions, touch interactions, camera controls, transitions, and responsive layouts.
- Verify all simulation calculations and visible outcomes remain consistent.
- Test repeated navigation between both routes.
- Confirm no duplicate UI elements or handlers appear.
- Monitor console errors, memory consumption, active timers, animation frames, and CPU or GPU activity.
- Verify that inactive simulations stop consuming resources.
- Test both the Vite development server and the generated production build.

### Documentation
- **[Parallel]** Add concise setup and deployment documentation.
- Document the module structure and responsibility of each major directory.
- Explain how to run development, build production files, and preview the build.
- Document the route lifecycle contract.
- Identify where future UI, control, simulation, animation, utility, and state modules should be added.

---

## Multi-Agent Feasibility Assessment

**Assessment:** **YES.** The refactor contains several distinct and parallelizable work streams, including Vite configuration, Solar System extraction, Big Bang extraction, CSS modularization, lifecycle design, routing, asset migration, and regression validation. These work streams can proceed concurrently after a shared dependency audit establishes module boundaries and behavior-sensitive initialization order.

**Parallelization Opportunities:**

- Audit and extract the Solar System page, styles, controls, and simulation modules.
- Audit and extract the Big Bang page, styles, controls, and simulation modules.
- Configure Vite development, build, asset handling, and production settings.
- Design and implement the SPA router and route lifecycle contract.
- Modularize shared UI components, navigation, utilities, animations, and state.
- Organize and update asset references for Vite.
- Build regression tests and lifecycle leak validation procedures.
- Prepare setup, architecture, and deployment documentation.

**Dependencies to Manage:**

- The initial dependency audit must establish which globals, assets, utilities, CSS rules, and runtime services are shared between both simulations.
- The router must use a lifecycle interface supported consistently by both page implementations.
- Solar System and Big Bang agents must preserve existing DOM selectors and script execution order.
- Shared modules must be extracted carefully to avoid circular imports or behavior changes.
- Route transitions must coordinate with simulation disposal so visible animations are not terminated prematurely.
- Asset path decisions must remain consistent across both simulations and the Vite production build.
- Final integration must verify that only one active simulation loop exists after navigation.
- All agents must avoid modifying simulation formulas, physics, calculations, rendering behavior, or features.

**Named Sub-Agent Assignments:**

- **Architecture and Audit Agent** (Frontend Architecture Specialist): Inspect the current project, map dependencies, identify global state, document initialization order, and define safe module boundaries.
- **Solar System Refactor Agent** (Vanilla JavaScript Simulation Engineer): Extract and modularize the Solar System page while preserving its complete behavior and rendering logic.
- **Big Bang Refactor Agent** (Vanilla JavaScript Simulation Engineer): Extract and modularize the Big Bang page while preserving its complete behavior and rendering logic.
- **Routing and Lifecycle Agent** (SPA Architecture Engineer): Implement client-side routing, page mounting, initialization, disposal, browser history behavior, and route transition coordination.
- **Vite and Build Agent** (Frontend Build Engineer): Configure Vite, package scripts, asset processing, hashed production output, minification, disabled source maps, and static deployment readiness.
- **Shared UI and Styling Agent** (Frontend UI Engineer): Extract shared panels, modals, navigation, controls, animations, and CSS while preserving the existing visual design.
- **Resource Management Agent** (Web Performance Engineer): Audit listeners, timers, animation frames, observers, workers, rendering resources, and inactive-page CPU or GPU usage.
- **Regression Validation Agent** (Frontend QA Engineer): Compare the original and refactored applications, test repeated navigation, verify functional parity, and identify lifecycle or performance regressions.
- **Documentation Agent** (Technical Documentation Specialist): Document setup, architecture, lifecycle conventions, development commands, production builds, and deployment requirements.

---

## Detailed Breakdown

### Behavior-Preserving Refactor Strategy

Treat the existing implementation as the source of truth. Begin by extracting code into modules with the smallest possible behavioral changes rather than redesigning or rewriting it. Preserve existing function bodies, constants, update order, DOM selectors, control behavior, and rendering sequences wherever possible. Structural cleanup must remain separate from feature changes.

### SPA Routing Strategy

Select either History API routing or hash routing according to the target static deployment environment. Use History API routing when the host can redirect unknown routes to `index.html`. Use hash routing when the deployment environment cannot provide fallback rewrites. The routing implementation must provide instant navigation, browser history support, unknown-route handling, and coordinated page lifecycle execution.

### Simulation Lifecycle Contract

Each simulation page must expose a predictable lifecycle interface. Mounting should insert the required markup, initialization should resolve DOM dependencies and create runtime resources, and destruction should stop all page-specific activity. The lifecycle design must prevent a simulation from continuing to render or respond to input after the user has navigated away.

### Solar System Isolation

Move Solar System markup, styles, controls, state, animation management, and simulation-specific logic into dedicated modules. Preserve existing calculations, physics, celestial object behavior, camera movement, interaction controls, animation timing, and visual effects. Avoid initializing Solar System resources while the Big Bang route is active.

### Big Bang Isolation

Move Big Bang markup, styles, controls, state, animation management, and simulation-specific logic into dedicated modules. Preserve all current stages, calculations, particle behavior, rendering logic, timeline behavior, controls, transitions, and visual effects. Avoid initializing Big Bang resources while the Solar System route is active.

### Shared Modules

Extract only genuinely shared behavior into reusable modules. Suitable candidates may include global navigation, modal helpers, common UI controls, formatting utilities, animation helpers, event cleanup utilities, asset loaders, and application-level state. Do not force unrelated simulation systems into generalized abstractions.

### Safe Global Removal

Replace global variables gradually with module-scoped variables, explicit exports, imported dependencies, or page-local state. Preserve mutable relationships that are required by the current code. Do not rename or restructure important data models unless necessary to remove unsafe global coupling.

### Resource Disposal

Track all long-running browser resources created by a route. These may include animation frame identifiers, intervals, timeouts, global listeners, observers, workers, audio, dynamically created DOM nodes, canvases, renderers, geometries, materials, textures, controls, and asynchronous loading callbacks. Disposal must be safe, repeatable, and limited to resources owned by the route being destroyed.

### Production Optimization

Use Vite's production pipeline to bundle modules, minify JavaScript and CSS, process referenced assets, and generate cache-friendly hashed filenames. Disable production source maps. Apply route-level code splitting where it can be introduced without changing application behavior or delaying critical interactions.

### Static Hosting Compatibility

Ensure the generated `dist` directory can be deployed to a static hosting provider. When using History API routing, include documentation for the required fallback rule that serves `index.html` for route requests. When such a rule is unavailable, use hash routing so direct navigation and browser refreshes continue to function.

### Functional Parity Requirement

The refactor is complete only when both simulations behave as they did before modularization. Visual similarity alone is insufficient. Controls, physics, calculations, input handling, animation timing, rendering order, responsiveness, state changes, transitions, and all existing features must remain intact.

### Performance and Leak Validation

Repeatedly navigate between the Solar System and Big Bang routes while monitoring frame rate, active event listeners, animation frames, timers, memory growth, console output, and CPU or GPU utilization. Resource usage should stabilize after route changes rather than increasing continuously. Only the currently active simulation should continue performing simulation and rendering work.