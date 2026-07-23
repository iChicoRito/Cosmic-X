# Big Bang Epoch UI Design

## Scope

Refine the existing Big Bang overlays without changing content, controls,
runtime behavior, responsive visibility, or timeline data.

## Design

- Display the bottom-left time and temperature badges in their authored case.
- Reduce badge letter spacing so sentences remain readable.
- Give each epoch and future beat a dedicated compact badge label; keep full
  scientific time text everywhere outside the badges.
- Keep every badge value at 24 characters or fewer and avoid prose such as
  "approximately" and "after the Big Bang".
- Stack every right-panel epoch title above its time description.
- Keep the existing button markup, active state, focus behavior, and panel scroll.
- Make the change only in the existing Big Bang stylesheet.

## Verification

- Add a style-contract test for natural-case badges and vertical epoch rows.
- Add timeline coverage for compact epoch and future-beat badge labels.
- Run the Big Bang tests, full suite, production build, and desktop browser check.
