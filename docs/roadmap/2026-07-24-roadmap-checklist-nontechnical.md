# CosmicX — Roadmap Checklist (Non-Technical)

*Plain-language progress tracker, companion to the
[non-technical roadmap](2026-07-24-roadmap-nontechnical.md).
Legend: ✅ done · 🟡 partly done · ⬜ not started · ⏸️ deferred (on purpose, with a reason).
Detailed version: [checklist (technical)](2026-07-24-roadmap-checklist-technical.md).*

Last updated 2026-07-24.

---

## Stage 1 — Quiet groundwork
- ✅ **Automatic safety checks.** A quick test now loads every core piece of the
  app so an accidental break shows up immediately.
- ✅ **Fewer moving parts.** Two copies of the planet-image loading code were
  merged into one shared piece — same behaviour, less to maintain.

## Stage 2 — Quick wins
- ✅ **"Save Image" button.** Capture the current view of the Solar sandbox as a
  picture.
- ⏸️ **Host our own planet images.** Deferred: would add ~15 image files to the
  project for a problem the app already handles gracefully when the outside
  source is down.
- ✅ **On-screen tool buttons.** The laser already has an on-screen "Fire" button,
  so touch users aren't blocked. (A full on-screen movement pad was skipped — big
  effort, little payoff.)

## Stage 3 — Keep your work + mobile (the big one)
- ✅ **Save your scenes.** ⭐ The Solar sandbox now remembers what you build —
  name a scene, come back to it later, keep several. Fully tested: build a scene,
  leave, reload, load it back, and everything (galaxy, camera, objects) returns.
- ✅ **Works by touch.** Finger drag and pinch now move the camera in all three
  experiences instead of scrolling the page.
- ⏸️ **Tidy shared physics.** Deferred: merging two large behind-the-scenes
  physics engines is risky to do before the automatic checks are stronger. It's a
  maintenance clean-up, not something users would see.

## Stage 4 — Share & explore
- ✅ **Shareable links.** Copy a link that reopens your exact scene in any
  browser, or paste one someone sent you. Tested end-to-end.
- ✅ **Ready-made scenarios.** One-click setups — Grand Tour, Rogue Black Hole,
  Eclipse Watch, Andromeda Approach.
- ⏸️ **Explorable Big Bang journey.** Deferred: making objects in the universe
  journey clickable is a full feature of its own and needs its own design pass to
  do well. Recommended as a focused next project.

## Stage 5 — Ongoing polish
- ⏸️ **Tidy the biggest files.** Deferred: safest to do once the stronger
  automatic checks are in place. No user-visible change either way.

## Extra polish (done alongside)
- ✅ **Fixed the Save panel layout.** The name box and its button were squished;
  now the text field fills the row neatly with the button beside it, matching the
  rest of the panel.

---

## Where things stand
| Stage | Done | Deferred (on purpose) |
|-------|:----:|:---------------------:|
| 1. Groundwork | 2 | 0 |
| 2. Quick wins | 2 | 1 |
| 3. Keep your work + mobile | 2 | 1 |
| 4. Share & explore | 2 | 1 |
| 5. Ongoing polish | 0 | 1 |

**Shipped and working:** save your scenes, shareable links, ready-made scenarios,
save-image button, touch controls, plus behind-the-scenes tidying and the Save
panel fix.

**Deferred on purpose:** self-hosting images (not worth the bloat) and three
larger clean-ups / features (shared physics, file tidying, the explorable Big
Bang journey) that are safer or better done as their own focused efforts.
