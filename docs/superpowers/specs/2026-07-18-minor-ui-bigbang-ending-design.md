# Minor UI Fixes and Big Bang Ending Design

## Scope

Update the existing sandbox and Big Bang pages without adding dependencies or
new runtime modules. Preserve the current simulator state machines, camera
paths, controls, and settings persistence.

## Sandbox UI

- Close the native Settings dialog before applying a display-mode change. This
  removes the modal top layer before entering or leaving fullscreen, so title
  and settings controls are interactive immediately after the transition.
- Move the existing creator credit outside the title-only container. Keep the
  exact copy, center it near the bottom edge, style it like the subtitle, raise
  it above bottom gameplay controls, and hide it only with Hide UI.
- Change only the title action buttons' black background alpha from 25% to 15%.
- Add a keyboard-accessible "Back to Title Screen" button to mode selection.
  Reuse the existing title state, restore the default title and subtitle, clear
  the Big Bang preview, and allow Start to enter mode selection again.

## Big Bang Page

- Add the same bottom-center creator credit to the title and normal timeline
  experience. Keep it clear of the timeline bar and hide it with Hide UI.
- Add one pointer-inert ending overlay containing:
  - `The Beginning Was Never the End`
  - `The night sky is more than a collection of stars—it is the story of where you came from.`
- Reveal the ending only when forward playback naturally reaches the end of
  the timeline. Hide it when playback rewinds or the timeline moves away from
  the endpoint.
- Project a fixed world-space anchor near the final camera look target through
  the active Three.js camera each frame. Apply the projected screen position
  and distance-based scale to the DOM overlay so it subtly follows the final
  camera drift instead of behaving as a static screen layer.
- Use an opacity transition for the cinematic entrance. Under reduced-motion
  preferences, retain the content with a simple immediate presentation.

## Accessibility and Failure Handling

- Keep new navigation controls as native buttons.
- Make the ending copy available as a polite status announcement without
  accepting pointer input.
- Keep fullscreen failures non-blocking and retain the saved mode synchronized
  with the actual fullscreen state.
- Ensure credits and the ending remain readable on mobile without covering
  primary controls.

## Verification

- Extend the dependency-free Node contract tests for dialog release,
  credit placement and visibility, 15% title-button background, reversible
  title navigation, ending copy, completion gating, camera projection, rewind
  reset, and reduced-motion handling.
- Run both Node suites.
- Browser-check fullscreen toggling followed immediately by title/settings
  interactions, title-to-mode-to-title navigation, desktop/mobile credit
  placement, and the Big Bang ending at the forward endpoint and after rewind.
