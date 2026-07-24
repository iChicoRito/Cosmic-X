# Objective
## Improve UI Panel Visibility Across Sandbox and Big Bang Simulations

---

## Role

You are a frontend UI/UX developer specializing in immersive simulation interfaces. Approach this objective with a focus on readability, visual consistency, accessibility, and maintaining the existing glassmorphism design.

---

## Description

Improve the visibility and readability of all UI panels on both the sandbox and Big Bang simulation pages. The current panels are too transparent, causing their text, controls, and information to blend into bright or visually complex backgrounds. Add a subtle black-tinted background with sufficient opacity while preserving the existing blur effect. The updated panels should remain visually lightweight and immersive while ensuring that their contents are clearly readable across both dark and extremely bright scenes.

---

## Primary Objective

Update every UI panel in the sandbox and Big Bang simulations with a slightly opaque black background and retained backdrop blur so its contents remain visible against any background brightness.

---

## Success Criteria

- All UI panels on the sandbox and Big Bang pages use a subtle black-tinted background.
- The panels retain their existing glass-like backdrop blur effect.
- Text, labels, icons, values, buttons, progress bars, and other panel content remain clearly visible against bright and complex backgrounds.
- The panels do not become fully opaque or visually heavy.
- The updated panel styling remains consistent across both simulation modes.
- The visibility problems shown in `assets\img\UI-PANELS-VISIBILITY-01.png` and `assets\img\UI-PANELS-VISIBILITY-02.png` are resolved.

---

## Context & Dependencies

- The requested changes apply to both the sandbox simulation and the Big Bang simulation pages.
- The panels currently use transparency and blur, but their contents become difficult to see when displayed over bright backgrounds.
- The reference images are located at:
  - `assets\img\UI-PANELS-VISIBILITY-01.png`
  - `assets\img\UI-PANELS-VISIBILITY-02.png`
- The existing blur effect should be preserved rather than replaced.

---

## Supporting Tasks

### Reference Review
- Review `assets\img\UI-PANELS-VISIBILITY-01.png` and `assets\img\UI-PANELS-VISIBILITY-02.png` to identify the panels and content affected by insufficient contrast.
- Use the reference images to verify that the updated styling resolves the demonstrated visibility issues.

### Sandbox UI Panels
- Apply a subtle semi-transparent black background to every informational and interactive panel on the sandbox page.
- Preserve the existing backdrop blur and glassmorphism appearance.
- Ensure all panel contents remain readable during bright planetary, stellar, impact, glow, and space-background scenes.

### Big Bang UI Panels
- Apply the same visibility improvements to every panel on the Big Bang simulation page.
- Preserve the existing blur effect and maintain consistency with the sandbox interface.
- Ensure panel information remains readable throughout bright cosmic events, galaxy backgrounds, particle effects, and simulation stages.

### Visual Consistency
- Use a shared or consistent panel style across both pages rather than applying unrelated designs.
- Maintain the existing border radius, spacing, layout, and overall visual identity unless adjustments are required specifically to improve readability.
- Ensure nested elements such as cards, dropdowns, tooltips, controllers, information sections, and status panels receive appropriate contrast improvements.

### Readability Validation
- Verify the panels against the brightest available simulation backgrounds.
- Confirm that text, icons, inputs, buttons, values, and progress indicators remain distinguishable without requiring users to focus excessively.
- Check that the black opacity is strong enough to improve contrast but subtle enough to keep the background partially visible.

---

## Multi-Agent Feasibility Assessment

**Assessment:** **YES.** The sandbox and Big Bang panel updates are separate, parallelizable work streams that can be implemented independently before a final consistency review.

**Parallelization Opportunities:**
- Review and update all sandbox simulation panels.
- Review and update all Big Bang simulation panels.
- Validate contrast and visual consistency using the supplied reference images.

**Dependencies to Manage:**
- Both implementations should use the same shared design values for black opacity, blur strength, borders, and panel contrast.
- Any shared panel classes or reusable components must be coordinated to prevent duplicate or conflicting styles.
- Final testing should compare both pages under similarly bright backgrounds.

**Named Sub-Agent Assignments:**

- **Sandbox Panel Agent** (Frontend UI Developer): Update and validate all panels used in the sandbox simulation.
- **Big Bang Panel Agent** (Frontend UI Developer): Update and validate all panels used in the Big Bang simulation.
- **Visual Consistency Agent** (UI/UX Quality Specialist): Review the reference images, verify readability, and ensure both modes use a consistent glass-panel treatment.

---

## Detailed Breakdown

### Panel Background Treatment

Add a slight black opacity to each panel background so that bright visual elements behind the interface no longer overpower its contents. The panel should remain partially transparent, allowing the simulation environment to stay visible while creating enough separation between the background and foreground information.

### Blur Preservation

Retain the existing backdrop blur effect on all panels. The goal is to strengthen the current glassmorphism appearance with a darker translucent layer, not replace it with a flat or fully opaque background.

### Content Visibility

Ensure that all information inside the panels—including headings, labels, descriptions, numerical values, icons, controls, progress bars, and buttons—has sufficient contrast against the updated panel background. The contents should remain readable regardless of whether the simulation scene behind them is dark, colorful, or extremely bright.

### Cross-Page Consistency

Apply the visibility improvement consistently across both the sandbox and Big Bang pages. Shared panel types should have the same opacity, blur strength, border treatment, and overall visual behavior so the two simulation modes feel like parts of one unified experience.