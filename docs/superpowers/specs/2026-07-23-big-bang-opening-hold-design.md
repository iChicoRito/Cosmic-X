# Big Bang Opening Hold Design

## Scope

Add a three-second lead-in to Phase 1 without changing the approximately
90-second journey, transport controls, chapter weights, or lifecycle.

## Design

- Keep the universe compressed during the first three seconds after Begin.
- Show exactly one small but clearly visible spherical particle at the
  compressed origin against total black.
- Disable opening bloom and keep the square flash sprite hidden during the
  hold so the particle has a clean circular silhouette.
- Keep the surrounding quantum foam hidden during the hold; restore it as part
  of the explosion after the hold.
- Keep the flash, shockwave, plasma release, particles, and rapid expansion
  dormant until the hold ends.
- At three seconds, trigger the existing bounded explosion and smoothly use
  the rest of Phase 1 to reach the Primordial Universe state.
- Derive the hold from normalized timeline position so scrubbing, reverse
  playback, replay, and speed controls remain deterministic. Do not add a
  timer, new scene, or parallel playback state.

## Minimal Approach

Remap only the visual progress inside Phase 1: timeline positions in the first
three seconds display the Phase 1 starting state, then the remaining Phase 1
range maps continuously from zero to one. This keeps the existing systems and
camera rail intact. Delaying only the flash was rejected because expansion
would occur before the explosion; pausing transport was rejected because it
would break deterministic scrubbing and speed behavior.

## Verification

- Add a focused helper test proving the first three seconds remain at visual
  progress zero and the end of Phase 1 still reaches visual progress one.
- Retain source-contract coverage for the delayed flash and shockwave.
- Browser-check a pure-black hold with a visibly round particle and the normal
  flash, foam, shockwave, and particles immediately after the hold.
- Run `npm test` and `npm run build`.
