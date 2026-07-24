# CosmicX — Improvement Roadmap (Non-Technical)

*Dated 2026-07-24. A plain-language plan for what to build next and in what
order. Companion to the [non-technical evaluation](../evaluation/2026-07-24-system-evaluation-nontechnical.md).
Each stage lists what changes for the people using CosmicX — no technical detail.*

---

## The Idea in One Line

Do a little quiet groundwork first, then deliver improvements in the order that
gives users the most benefit soonest: **first let people keep their work, then
make it work on phones, then let people share it.**

## How the Stages Connect

Each stage builds on the one before it. In particular, **"share your scene"
only becomes possible once "save your scene" exists** — so saving comes first,
and it makes several later features easy.

```
Groundwork ──► Quick Wins ──► Save Your Work ──► Share & Explore ──► Ongoing Polish
```

---

## Stage 1 — Quiet Groundwork
*What users notice: nothing yet — and that's the point.*

Before adding features, we put simple automatic checks in place so that future
changes don't accidentally break something that already works. We also remove a
small reliance on an outside website for planet images by hosting our own copy.

**Result:** a safer, more self-reliant app that's ready to improve quickly.
**Effort:** small. **User-visible change:** none (behind the scenes).

## Stage 2 — Quick Wins
*What users notice: small, welcome additions right away.*

- **A "Save Image" button** in the Solar sandbox, so anyone can capture a
  striking moment and keep or share the picture.
- **On-screen buttons** for the tools that currently need a keyboard (like firing
  the laser), so more people can use them.

**Result:** immediate, visible value with little effort.
**Effort:** small. **User-visible change:** yes, minor and positive.

## Stage 3 — Keep Your Work (the big one)
*What users notice: the app finally remembers what they build.*

Today, the main Solar sandbox forgets everything the moment you leave. This stage
adds **saving** — name a scene you've built, come back to it later, and keep
several different ones. This is exactly how the galaxy Creator mode already works;
we're bringing the same convenience to the flagship experience.

At the same time, we make the app **work properly on phones and tablets** —
letting people move the camera with their fingers instead of needing a keyboard
and mouse.

**Result:** the most-felt frustration ("it forgot my work") is fixed, and a whole
new group of visitors (mobile users) can finally use the best features.
**Effort:** moderate. **User-visible change:** large and positive.

## Stage 4 — Share & Explore
*What users notice: CosmicX becomes something you pass around.*

- **Shareable links.** Turn any saved scene into a link you can send to someone —
  they open it exactly as you left it. This is the feature most likely to grow the
  audience, because people share what they can send.
- **Ready-made scenarios.** One-click setups like "the asteroid that ended the
  dinosaurs," "a total solar eclipse," or "a black hole passing through" — perfect
  for teachers and curious newcomers.
- **A more explorable universe journey.** Make parts of the Big Bang experience
  clickable, so people can discover objects and read about them instead of only
  watching.

**Result:** CosmicX shifts from a private toy to a shareable, teachable
experience. **Effort:** larger. **User-visible change:** significant.

## Stage 5 — Ongoing Polish
*What users notice: the app stays fast and keeps improving smoothly.*

Quietly tidy the largest, most complex parts of the app over time so it remains
quick to load and safe to keep improving. This happens in the background,
alongside the visible work above.

**Result:** long-term health — new features keep arriving without the app getting
slower or more fragile. **Effort:** ongoing. **User-visible change:** none
directly, but faster future updates.

---

## Priority Summary

| Stage | Value to users | Effort | When |
|-------|---------------|--------|------|
| 1. Groundwork | Indirect (safety) | Small | First |
| 2. Quick wins | Small, immediate | Small | Early |
| 3. Keep your work + mobile | **Highest** | Moderate | Core focus |
| 4. Share & explore | High (growth) | Larger | After Stage 3 |
| 5. Ongoing polish | Long-term health | Ongoing | Throughout |

## The One Thing to Do First

**Add saving to the Solar sandbox.** It fixes what users notice most, it reuses
an idea that already works elsewhere in the app (so it's low-risk), and it's the
foundation that makes sharing, links, and ready-made lessons possible. Build it
once, and much of Stage 4 becomes easy.
