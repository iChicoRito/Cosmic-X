# Objective

## Redesign the "Become the Creator" Stellar Experience

---

## Description

Redesign the "Become the Creator" mode by separating the stellar simulation into its own dedicated page and simplifying the interface within that view. Replace the current experience, where users remain on the same page while entering a stellar simulation, with a dedicated route that provides a more focused environment. The new page should present the stellar simulation using a more detailed and organized layout similar to the existing solar system experience, while preserving the existing visual identity, HUD, typography, and overall interface style. Remove creator-specific god tools from this dedicated stellar view so the interface emphasizes the simulation and its information panels rather than creation controls.

---

## Primary Objective

Transform the stellar simulation experience in "Become the Creator" mode into a dedicated, detailed page that removes god tools while maintaining the existing UI and visual design.

---

## Supporting Tasks

### Navigation & Routing

* Replace the current in-page stellar experience with a dedicated route.
* Change the stellar route from `/#/creator` (while inside a stellar) to `/#/creator/{stellar-name}`.
* Ensure each stellar is accessed through its own dedicated page.

### Interface Simplification

* Remove the creator god tools from the dedicated stellar page.
* Exclude tools such as **Spawn**, **Impact**, and **Laser** from the stellar experience.

### Stellar Simulation Layout

* Design the dedicated stellar page to match the level of detail and organization found in `/#/solar-system`.
* Present planets, blooms, and other simulation elements in a clearer and more organized structure.
* Move the custom stellar simulation into the new `/#/creator/{stellar-name}` page.

### Information & UI

* Include the timeline within the dedicated stellar page.
* Include planet information panels and the other existing simulation panels.
* Preserve the existing HUD, typography, and overall UI style.
* Exclude only the god tools while keeping the remaining interface consistent with the current design.

---

## Success Criteria

* Stellar simulations are accessed through `/#/creator/{stellar-name}` instead of remaining within `/#/creator`.
* The dedicated stellar page no longer displays the **Spawn**, **Impact**, and **Laser** god tools.
* The new page provides a level of detail and organization comparable to `/#/solar-system`.
* The custom stellar simulation includes the timeline, planet information panels, and the remaining simulation interface.
* The HUD, typography, and overall visual style remain consistent with the existing UI.
