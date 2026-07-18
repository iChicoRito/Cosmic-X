# Minor UI Fixes and Big Bang Ending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix fullscreen interaction, improve title navigation and credits, soften title actions, and add a camera-tracked Big Bang ending.

**Architecture:** Reuse the sandbox's existing modal, title-state, immersive-UI, and fullscreen functions. Add one DOM ending overlay to `bigbang.html`; project a fixed Three.js world anchor through the existing camera each frame so no new renderer or dependency is needed.

**Tech Stack:** Native HTML/CSS/JavaScript, Three.js 0.170.0, Node's built-in test runner, Playwright CLI.

## Global Constraints

- Add no dependencies or runtime modules.
- Preserve existing simulator state machines, controls, camera paths, and persisted settings.
- Keep the exact creator copy: `Developed by Mark Adrianne Salunga`.
- Hide credits only when Hide UI is active.
- Keep the ending pointer-inert, responsive, and reduced-motion compatible.
- Preserve the user's existing untracked task documents and reference images.

---

### Task 1: Sandbox Interaction and Navigation

**Files:**
- Modify: `index.html`
- Test: `tests/simulator.test.mjs`

**Interfaces:**
- Consumes: existing `setDisplayMode(mode)`, `setupTitleScreen()`, `typeMenuTitle()`, `hideTitlePreview()`, and `body.ui-hidden`.
- Produces: `#titleBackBtn`, `#appCredit`, and a display transition that releases `#settingsDialog` before requesting or exiting fullscreen.

- [ ] **Step 1: Write failing sandbox contract tests**

Add assertions that:

```js
test('releases the modal before changing fullscreen so controls remain interactive', () => {
  const display = functionSource('setDisplayMode');
  assert.match(display, /settingsDialog/);
  assert.ok(display.indexOf('.close()') < display.indexOf('requestFullscreen()'));
});

test('keeps credits and title navigation available across sandbox states', () => {
  startTagById('appCredit');
  startTagById('titleBackBtn');
  assert.match(html, /Developed by Mark Adrianne Salunga/);
  assert.match(styles, /\.app-credit\s*\{[^}]*left:\s*50%[^}]*translate:/s);
  assert.match(styles, /body\.ui-hidden[\s\S]*#appCredit/);
  const title = functionSource('setupTitleScreen');
  assert.match(title, /titleBackBtn/);
  assert.match(title, /classList\.remove\(\s*['"]modes['"]\s*\)/);
  assert.doesNotMatch(listenerWindow(title, 'enterBtn', 'click'), /once:\s*true/);
});
```

Update the title-action assertion to require
`background: rgba(0, 0, 0, .15)`.

- [ ] **Step 2: Run the sandbox suite and verify RED**

Run:

```powershell
node --test tests/simulator.test.mjs
```

Expected: the new dialog-release, credit/navigation, and 15%-background assertions fail because the current dialog stays open, the credit remains inside `#title`, no title-back control exists, and the alpha is `.25`.

- [ ] **Step 3: Implement the minimal sandbox changes**

In `setDisplayMode(mode)`, close the open native dialog before the first fullscreen operation:

```js
const dialog = ui('settingsDialog');
if (dialog?.open) dialog.close();
```

Move the creator paragraph immediately after `#title`, rename its class/id to
`app-credit`/`appCredit`, center it with fixed CSS, offset it above gameplay UI
when `#title.hidden`, and add `#appCredit` to the existing `body.ui-hidden`
selector.

Change `.title-actions .menu-btn` to:

```css
background: rgba(0, 0, 0, .15);
```

Add this native control to `.mode-bar`:

```html
<button id="titleBackBtn" class="mode-back" type="button">&larr; Back to Title Screen</button>
```

Keep the `enterBtn` click listener reusable. On `titleBackBtn` click, call
`hideTitlePreview()`, restore the default title/tagline through the existing
helpers, and remove `modes` from `#title`.

- [ ] **Step 4: Run the sandbox suite and verify GREEN**

Run:

```powershell
node --test tests/simulator.test.mjs
```

Expected: all sandbox tests pass.

---

### Task 2: Big Bang Credits and Camera-Tracked Ending

**Files:**
- Modify: `bigbang.html`
- Test: `tests/bigbang.test.mjs`

**Interfaces:**
- Consumes: existing `camera`, `T`, `stepTimeline(dt)`, `applyEpoch(u)`, `update(dt)`, `body.ui-hidden`, and the area near the final camera look target `[600, 0, 0]`.
- Produces: `#bbCredit`, `#bbEnding`, `setEndingVisible(visible)`, and `updateEndingTracking()`.

- [ ] **Step 1: Write failing Big Bang contract tests**

Add:

```js
test('shows the shared credit throughout Big Bang except immersive mode', () => {
  startTagById('bbCredit');
  assert.match(html, /Developed by Mark Adrianne Salunga/);
  assert.match(html, /body\.ui-hidden[\s\S]*#bbCredit/);
});

test('reveals a camera-tracked ending only after forward completion', () => {
  startTagById('bbEnding');
  assert.match(html, /The Beginning Was Never the End/);
  assert.match(html, /The night sky is more than a collection of stars—it is the story of where you came from\./);
  assert.ok(functionSource('setEndingVisible'));
  const tracking = functionSource('updateEndingTracking');
  assert.match(tracking, /\.project\(\s*camera\s*\)/);
  assert.match(tracking, /--ending-x/);
  assert.match(tracking, /--ending-y/);
  assert.match(tracking, /--ending-scale/);
  const timeline = functionSource('stepTimeline');
  assert.match(timeline, /setEndingVisible\(\s*T\.dir\s*>\s*0\s*\)/);
  assert.match(html, /u\s*<\s*1[\s\S]*setEndingVisible\(\s*false\s*\)/);
  assert.match(html, /prefers-reduced-motion[\s\S]*#bbEnding/);
});
```

- [ ] **Step 2: Run the Big Bang suite and verify RED**

Run:

```powershell
node --test tests/bigbang.test.mjs
```

Expected: both tests fail because the credit and ending overlay do not exist.

- [ ] **Step 3: Implement the minimal Big Bang DOM and CSS**

Add `#bbCredit` outside `#bbTitle` with the exact creator copy. Center it near
the bottom edge, offset it above `#bbBar.visible`, and include it in the current
immersive selector.

Add:

```html
<div id="bbEnding" role="status" aria-live="polite" aria-hidden="true">
  <h2>The Beginning Was Never the End</h2>
  <p>The night sky is more than a collection of stars—it is the story of where you came from.</p>
</div>
```

Style it as a fixed, pointer-inert overlay whose transform consumes
`--ending-x`, `--ending-y`, and `--ending-scale`; `.visible` fades opacity to
one. Under `prefers-reduced-motion`, remove its movement transition.

- [ ] **Step 4: Implement completion gating and camera projection**

Use one fixed anchor and one scratch vector:

```js
const endingAnchor = new THREE.Vector3(600, 14, 0);
const endingScreen = new THREE.Vector3();
```

`setEndingVisible(visible)` toggles `.visible` and `aria-hidden`.
`updateEndingTracking()` projects `endingAnchor` through `camera`, converts
normalized device coordinates to viewport pixels, clamps a distance-based
scale, and updates the three CSS custom properties.

At forward completion in `stepTimeline(dt)`, call
`setEndingVisible(T.dir > 0)`. In `applyEpoch(u)`, hide it whenever `u < 1`.
Call `updateEndingTracking()` after the active camera has been updated each
frame.

- [ ] **Step 5: Run the Big Bang suite and verify GREEN**

Run:

```powershell
node --test tests/bigbang.test.mjs
```

Expected: all Big Bang tests pass.

---

### Task 3: Integrated Browser Verification

**Files:**
- Verify: `index.html`
- Verify: `bigbang.html`
- Verify: `tests/simulator.test.mjs`
- Verify: `tests/bigbang.test.mjs`

**Interfaces:**
- Consumes: completed sandbox and Big Bang behavior.
- Produces: browser evidence and a clean four-file runtime/test diff plus the approved design/plan documents.

- [ ] **Step 1: Run both complete test suites**

Run:

```powershell
node --test tests/simulator.test.mjs tests/bigbang.test.mjs
git diff --check
```

Expected: zero failed tests and no whitespace errors.

- [ ] **Step 2: Verify sandbox desktop and mobile flows**

Serve with:

```powershell
npx --yes http-server . -p 8123 -c-1 -a 127.0.0.1
```

In a headed browser:

1. Open Settings and change Windowed to Fullscreen.
2. Immediately close/reopen Settings and activate Start.
3. Use Back to Title Screen, then activate Start again.
4. Confirm centered credits on title, mode selection, and gameplay.
5. Confirm Hide UI hides the credit and Show UI restores it.
6. Repeat layout checks at 390×844.

Expected: every action responds without reload and the credit avoids primary controls.

- [ ] **Step 3: Verify the Big Bang ending**

In `bigbang.html`:

1. Begin the timeline and set it just below the endpoint through `window.bang`.
2. Advance forward to completion.
3. Confirm the exact ending copy fades in and its transform changes with camera motion.
4. Rewind and confirm the ending hides.
5. Confirm the creator credit is visible normally and hidden by Hide UI.
6. Repeat the ending layout at 390×844.

Expected: the ending appears only on forward completion, tracks the camera, and produces no console errors.

- [ ] **Step 4: Confirm final scope**

Run:

```powershell
git status --short
git diff --name-only
```

Expected: runtime/test changes are limited to `index.html`,
`bigbang.html`, `tests/simulator.test.mjs`, and `tests/bigbang.test.mjs`;
approved specification/plan documents are present; pre-existing untracked task
documents and reference images are unchanged.
