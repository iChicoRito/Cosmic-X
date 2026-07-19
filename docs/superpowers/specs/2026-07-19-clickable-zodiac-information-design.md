# Clickable Zodiac Information Design

## Scope

Make each rendered zodiac constellation inspectable without changing the
existing interface, camera position, or control scheme. Reuse the current
planet dossier and bottom information bar. Add no dependencies or new UI.

## Interaction and Data Flow

- Give each rendered constellation one record backed by its existing `ZODIAC`
  catalog entry.
- Register both the constellation's visible stars and connecting lines with
  the existing raycaster maps.
- On a hit, use the shared selection and `openInfoPanel()` flow while skipping
  camera targeting and flight for constellation records.
- Render the existing catalog fields in the dossier: name and symbol, element,
  date range, brightest star, and lore.
- Identify the selected item as a constellation in the bottom information bar
  and avoid presenting planetary measurements as constellation facts.

## Lifecycle and Failure Handling

- Create constellation records only when the existing 50% galaxy roll produces
  zodiac visuals.
- Keep records owned by the current galaxy group so the existing galaxy rebuild
  clears their visuals and pick registrations.
- Treat missing, hidden, or stale constellation records like other invalid
  selections: do not open the dossier.
- Preserve the current click-drag threshold so orbit gestures do not open the
  panel accidentally.

## Verification

- Add a focused Node regression test proving constellation stars and lines are
  registered to one constellation record, the dossier uses all five catalog
  fields, and constellation clicks do not trigger camera movement.
- Run the complete Node test suite and production build.
- Browser-check that clicking a visible constellation star or line opens the
  existing information panel, leaves the camera stationary, updates the bottom
  bar accurately, and still allows planet clicks to behave unchanged.
