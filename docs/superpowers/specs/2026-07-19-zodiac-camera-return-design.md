# Zodiac Camera Zoom and Return Design

## Scope

Extend clickable zodiac constellations with the simulator's existing smooth
camera flight. Preserve every non-zodiac camera and dossier behavior.

## Camera Flow

- Before a zodiac flight starts, save the active camera position, controls
  target, and camera mode.
- Treat the constellation record's existing center anchor as the flight target.
- Derive its viewing distance from the rendered constellation scale so the
  complete star pattern remains visible after zooming.
- Open the existing zodiac dossier during the flight.
- When the user closes the zodiac dossier with its close button or Escape,
  smoothly restore the saved camera position and controls target, then restore
  the saved camera mode.
- Clear the saved pose after restoration so later planet exits continue using
  the existing home-camera behavior.

## Lifecycle and Failure Handling

- Save only one return pose for the active zodiac inspection. Clicking another
  zodiac while one is open keeps the original pre-inspection pose.
- Automatic dossier closes during galaxy rebuilds, menu transitions, or stale
  record cleanup discard the saved pose without starting a return flight.
- A missing saved pose falls back to the existing home-camera exit behavior.

## Verification

- Add a focused Node regression test for zodiac flight targeting, scale-based
  viewing distance, one-time pose capture, exact-pose restoration, and cleanup.
- Run the complete Node test suite and production build.
- Browser-check that a zodiac click visibly zooms in, closing restores the
  original camera position and target, and planet selection/exit remains
  unchanged.
