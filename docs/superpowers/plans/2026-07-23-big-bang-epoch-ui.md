# Big Bang Epoch UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use short, natural-case dossier badges and stack each right-panel epoch title above its full time description.

**Architecture:** Retain the current markup and runtime-generated buttons. Correct the two existing CSS selectors and protect them with the existing source-contract test suite.

**Tech Stack:** CSS, native ES modules, Node's built-in test runner

## Global Constraints

- Change no timeline data, copy, runtime behavior, control, or responsive visibility.
- Add no route, dependency, component, or duplicate layout system.
- Do not commit or push unless requested separately.

---

### Task 1: Refine Epoch Metadata Layout

**Files:**
- Modify: `src/pages/big-bang/big-bang.css`
- Test: `tests/bigbang.test.mjs`

**Interfaces:**
- Consumes: existing `.chip`, `.epoch-btn`, and `.epoch-btn small` markup.
- Produces: natural-case badges and vertically stacked epoch button content.

- [ ] **Step 1: Write the failing style-contract test**

```js
test('organizes epoch metadata with natural-case badges and stacked panel rows', () => {
  const chip = /\.chip\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  const epochButton = /\.epoch-btn\s*\{[^}]*\}/s.exec(styles)?.[0] || '';
  assert.match(chip, /text-transform:\s*none/);
  assert.match(epochButton, /flex-direction:\s*column/);
  assert.match(epochButton, /align-items:\s*flex-start/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/bigbang.test.mjs`

Expected: FAIL because badges are uppercase and epoch buttons are horizontal.

- [ ] **Step 3: Apply the minimal CSS change**

```css
.chip { letter-spacing: .02em; text-transform: none; }
.epoch-btn {
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 2px;
}
.epoch-btn small { display: block; width: 100%; line-height: 1.35; }
```

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/bigbang.test.mjs`

Expected: all Big Bang tests pass.

- [ ] **Step 5: Run final verification**

Run `npm test` and `npm run build`. Browser-check the bottom-left badges and
right epoch panel at desktop width; confirm an empty warning/error console.

### Task 2: Add Compact Badge Copy

**Files:**
- Modify: `src/pages/big-bang/timeline.js`
- Modify: `src/pages/big-bang/runtime.js`
- Test: `tests/pure-helpers.test.mjs`
- Test: `tests/bigbang.test.mjs`

**Interfaces:**
- Consumes: existing epoch and future-beat presentation records.
- Produces: `badgeLabel` and `badgeDetail` strings used only by the dossier chips.

- [ ] **Step 1: Write failing compact-copy tests**

```js
test('Big Bang dossier badges use compact presentation copy', () => {
  const { EPOCHS } = createEpochModel();
  const records = EPOCHS.flatMap(epoch => [epoch, ...(epoch.beats || [])]);
  assert.ok(records.every(record => record.badgeLabel.length <= 24));
  const solar = EPOCHS.find(epoch => epoch.id === 'solar');
  assert.deepEqual(
    { badgeLabel: solar.badgeLabel, badgeDetail: solar.badgeDetail },
    { badgeLabel: '9.2B years', badgeDetail: '4.6B years ago' },
  );
});
```

In `tests/bigbang.test.mjs`, assert `applyEpoch` writes
`presentation.badgeLabel` and `presentation.badgeDetail` to the two chips.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/pure-helpers.test.mjs tests/bigbang.test.mjs`

Expected: FAIL because presentation records do not expose compact badge copy.

- [ ] **Step 3: Add explicit compact labels**

Add these exact epoch `badgeLabel` values: `Instant zero`, `First minutes`,
`380,000 years`, `380,000–200M years`, `200M years`, `400M years`,
`1–5B years`, `9.2B years`, `4.5–3.5B years ago`, `Present day`, and
`Trillions+`. Add `badgeDetail` only where the second chip is useful:
`Extremely hot`, `Billions K`, `3,000 K`, `4.6B years ago`, `2.7 K`, and
`Near 0 K`.

Add these future-beat `badgeLabel` values in order: `≤10¹⁴ years`,
`10¹⁴–10⁴⁰ years`, `10⁴⁰–10¹⁰⁰ years`, and `Beyond 10¹⁰⁰ years`.
Return the resolved fields from `epochPresentationAt`; do not derive them by
truncating `timeLabel`:

```js
badgeLabel: beat?.badgeLabel || epoch.badgeLabel,
badgeDetail: beat?.badgeDetail ?? epoch.badgeDetail ?? '',
```

- [ ] **Step 4: Render only compact labels in chips**

Set `#epochTime` from `presentation.badgeLabel` and `#epochTemp` from
`presentation.badgeDetail`. Preserve full `timeLabel` usage everywhere else.

- [ ] **Step 5: Verify GREEN and final behavior**

Run focused tests, `npm test`, and `npm run build`. Browser-check Solar and all
four Distant Future beats for short chips while full time descriptions remain.
