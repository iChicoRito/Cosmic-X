# Objective
## Implement an Interactive First-Time Player Tour Guide

---

## Role

You are a UI/UX and game onboarding designer. Approach this objective with the mindset, vocabulary, and priorities of designing an intuitive, guided onboarding experience that effectively teaches new players the game's interface and core mechanics.

---

## Description

Implement an interactive onboarding tour that automatically appears when a player starts their first session. The tour should introduce the game's controls, explain the purpose of each controller, button, and relevant interface element, and guide players through the core gameplay mechanics before they begin playing. The experience should ensure that players understand how to navigate, interact with the environment, and use the available controls. The tour should provide a structured, step-by-step learning experience that emphasizes clarity, usability, and ease of understanding.

---

## Primary Objective

Create a mandatory, interactive first-time onboarding tour that teaches players the game's controls, interface, and core gameplay mechanics before gameplay begins.

---

## Success Criteria

- The tour automatically appears only during a player's first visit.
- The tour is available in both **As the Gods Will** and **Become the Creator** modes.
- Each highlighted controller, button, or interface element includes a clear title and description explaining its purpose.
- The tour teaches the basic controls, including mouse interactions such as panning, rotating, moving, and other applicable actions.
- Players are required to complete each guided step before progressing.
- The interface includes a **Next** button to advance through the tour.
- The visual design follows the reference provided in `assets\img\tour-higlight-reference.png`.

---

## Constraints

- Display the tour only on the user's first visit, regardless of which supported mode is selected.
- Apply the tour exclusively to the **As the Gods Will** and **Become the Creator** modes.
- Prevent players from skipping or bypassing the tour.
- Use a low-opacity black overlay that keeps the highlighted interface element as the primary focus.

---

## Context & Dependencies

- The tour should follow the UI/UX design shown in `assets\img\tour-higlight-reference.png`.
- The onboarding experience must function consistently across both supported game modes.

---

## Supporting Tasks

### Tour Initialization
- [Sequential] Detect whether the player is visiting for the first time.
- [Sequential] Automatically launch the onboarding tour when the player's first session begins.
- Restrict the feature to the **As the Gods Will** and **Become the Creator** modes.

### Guided Gameplay Introduction
- [Sequential] Introduce the game's basic controls before gameplay starts.
- Teach mouse interactions, including panning, rotating, moving, and other applicable controls.
- Explain the core gameplay mechanics required to begin playing.

### Interface Walkthrough
- [Sequential] Highlight each relevant controller, button, and interactive UI element.
- Display a title and description for every highlighted element, explaining its purpose and functionality.
- Guide the player through the interface in a logical sequence.

### User Interaction
- Require the player to complete each guided step before continuing.
- Prevent the player from bypassing or skipping the tutorial.
- Add a **Next** button to allow progression through each step of the tour.

### UI/UX Design
- Apply a low-opacity black overlay that dims the background while keeping the current highlighted element in focus.
- Match the overall appearance and interaction style shown in `assets\img\tour-higlight-reference.png`.

---

## Detailed Breakdown

### First-Time Experience

The onboarding tour should launch automatically only during the player's first visit. Once completed, it should no longer appear on subsequent visits. The feature must work regardless of which supported game mode the player selects.

### Interactive Tutorial Flow

The tutorial should guide players through the interface one step at a time by highlighting the relevant controls and UI elements. Each highlighted element must include a title and description explaining its purpose. Players should interact with or acknowledge each step before they are allowed to continue.

#### Nested Details

- Teach the basic mouse controls, including panning, rotating, moving, and other applicable interactions.
- Highlight controllers, buttons, and other important interface elements.
- Use a dimmed background with a focused highlight on the active element.
- Include a **Next** button for progressing through the guided steps.
- The tour cannot be skipped or bypassed until it has been completed.