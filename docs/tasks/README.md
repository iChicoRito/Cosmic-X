# Task Index

One numbered brief per unit of work, newest last. Files follow `NN - Title.md`.
Related docs: [../roadmap](../roadmap) (planned + deferred work),
[../evaluation](../evaluation) (system reviews), [../summary](../summary) (project summaries),
[suggestions.md](suggestions.md) (incoming feature requests).

Status: ✅ shipped on `main` · 🟨 in progress · ⬜ open

## Foundations (01–09)

| # | Task | Outcome | |
|---|------|---------|---|
| 01 | [Big Bang Mode](01%20-%20Big%20Bang%20Mode.md) | Second simulation + mode selection between it and the Solar sandbox | ✅ |
| 02 | [Main Menu Redesign](02%20-%20Main%20Menu%20Redesign.md) | Two-stage menu with hover previews | ✅ |
| 03 | [UI Fixes](03%20-%20UI%20Fixes.md) | Assorted interface corrections | ✅ |
| 04 | [Title & Mode UI Redesign](04%20-%20Title%20&%20Mode%20UI%20Redesign.md) | Mode bar, retitled screens, no title glow | ✅ |
| 05 | [Title Screen UX](05%20-%20Title%20Screen%20UX.md) | Live animated title background instead of a static shot | ✅ |
| 06 | [Fullscreen & Transitions](06%20-%20Fullscreen%20&%20Transitions.md) | Fullscreen notice, no-reload menu return, cinematic galaxy tour | ✅ |
| 07 | [Panel Visibility](07%20-%20Panel%20Visibility.md) | Hide/show rules for the control panels | ✅ |
| 08 | [Credits & Settings Menu](08%20-%20Credits%20&%20Settings%20Menu.md) | Settings menu limited to genuinely supported options | ✅ |
| 09 | [Vite SPA Refactor](09%20-%20Vite%20SPA%20Refactor.md) | Hash-routed Vite SPA; `bigbang.html` folded into the app | ✅ |

## Simulation depth (10–18)

| # | Task | Outcome | |
|---|------|---------|---|
| 10 | [Mobile UI Layout](10%20-%20Mobile%20UI%20Layout.md) | Phone-sized control layout | ✅ |
| 11 | [Laser, Triangulum & Zodiac](11%20-%20Laser,%20Triangulum%20&%20Zodiac.md) | Laser tool, Triangulum galaxy, zodiac constellation overlay | ✅ |
| 12 | [Music System](12%20-%20Music%20System.md) | Shell-level BGM singleton + audio settings tab | ✅ |
| 13 | [Creator Mode](13%20-%20Creator%20Mode.md) | `#/creator` galaxy-creation mode | ✅ |
| 14 | [Big Bang Timeline Polish](14%20-%20Big%20Bang%20Timeline%20Polish.md) | Epoch playback and timeline pass | ✅ |
| 15 | [Navigation & Codex](15%20-%20Navigation%20&%20Codex.md) | Dedicated lit system view, sticky placement, codex | ✅ |
| 16 | [Stellar Exploration & Codex](16%20-%20Stellar%20Exploration%20&%20Codex.md) | Context-aware HUD, procedural Solar look, shared labels | ✅ |
| 17 | [Creator Stellar Redesign](17%20-%20Creator%20Stellar%20Redesign.md) | Created systems on their own `#/creator/{slug}` route | ✅ |
| 18 | [Sim Tab — design](18%20-%20Sim%20Tab%20%28Design%29.md) · [plan](18%20-%20Sim%20Tab%20%28Plan%29.md) | Per-system Sim tab with real gravity + eclipse substrate | ✅ |

## Polish & platform (19–27)

| # | Task | Outcome | |
|---|------|---------|---|
| 19 | [Onboarding Tour](19%20-%20Onboarding%20Tour.md) | First-session guided tour | ✅ |
| 20 | [Hold Laser](20%20-%20Hold%20Laser.md) | Click-and-hold beam alongside the tap laser | ✅ |
| 21 | [Laser FX](21%20-%20Laser%20FX.md) | Whip bend, re-striking arcs, retimed growth | ✅ |
| 22 | [Wormhole Galaxy](22%20-%20Wormhole%20Galaxy.md) | Wormhole galaxy with its own physics and FX | ✅ |
| 23 | [Mode Transition Fix](23%20-%20Mode%20Transition%20Fix.md) | Clean transitions between modes | ✅ |
| 24 | [Big Bang Polish](24%20-%20Big%20Bang%20Polish.md) | Second Big Bang visual/content pass | ✅ |
| 25 | [Controller Reorg & Timeline](25%20-%20Controller%20Reorg%20&%20Timeline.md) | Solar controls 8 tabs → 4; three-tier bottom-bar timeline | ✅ |
| 26 | [Mobile Gyroscope Look](26%20-%20Mobile%20Gyroscope%20Look.md) | Gyroscope free-look camera on supported phones | ✅ |
| 27 | [Nebula Orientation & Docs Cleanup](27%20-%20Nebula%20Orientation%20&%20Docs%20Cleanup.md) | Distant-galaxy haze made world-fixed; this index + suggestions rewrite | ✅ |

## Carried-over work (25–26)

Everything specified in tasks 25 and 26 shipped (`ce22002`, `9ca3bca`, `dbabe76`). What is
left is verification and optional follow-up, not unfinished scope:

1. ⬜ **Verify gyroscope look on real hardware** (task 26). Never confirmed on a physical
   phone — the browser preview pane never reports `(pointer: coarse)` and fires no
   `deviceorientation` events, so the whole path is desk-untested. The on-screen diagnostics
   line (`updateGyroHint`, [runtime.js](../../src/pages/solar/runtime.js)) exists purely for
   that check and should be trimmed back once a device confirms sane yaw/pitch.
2. ⬜ **Gyro comfort controls** (task 26, optional). No sensitivity slider and no explicit
   recentre button; drag re-aims the rest pose (`gyro.tracker.nudge`) instead. Only worth
   adding if device testing shows the fixed smoothing feels wrong.
3. ⬜ **Mobile bottom-bar detail tiers** (task 25, optional). The stat detail views are hidden
   on phones while transport stays visible; confirm on a device that nothing important
   became unreachable.

Deliberately closed, not debt: the bottom bar's separate Day / Month / Year fields were
dropped in task 25 as redundant with `barUtcDate`.

Longer-horizon deferrals (self-hosted textures, shared physics substrate, runtime file
splits, Big Bang discovery layer) are tracked in
[../roadmap/2026-07-24-roadmap-checklist-technical.md](../roadmap/2026-07-24-roadmap-checklist-technical.md)
— add new deferrals there, not here.
