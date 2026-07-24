# Objective
## Preserve the Selected Galaxy During Mode Transition and Correct Creator Mode Background Behavior

---

## Description
Update the mode selection behavior in **As the Gods Will** so the simulation starts in the galaxy currently displayed as the dynamic background instead of always defaulting to the Milky Way. The selected background galaxy should be treated as the initial galaxy when the user enters the simulation, creating a smooth and visually consistent transition between the mode selection screen and the simulation. Since galaxy selection is already handled within the mode itself, this change should integrate with the existing selection flow without introducing conflicts or affecting other functionality.

Additionally, correct the background preview behavior for **Become the Creator**. It should no longer reuse the **As the Gods Will** background when the user hovers over the mode. Instead, the preview should reflect the user's own creation state: if the user has already created a custom galaxy, display that galaxy as the hover background; otherwise, display an empty universe containing only a basic galaxy environment with no user-created content.

Finally, improve the visual consistency of **Become the Creator** by removing all emojis from the interface, especially within the controller panel and related controls. Replace emoji-based indicators with clean text labels or appropriate UI elements to maintain a professional and cohesive design.

---

## Primary Objective
Ensure that each mode displays and transitions into the correct galaxy while improving the consistency and professionalism of the **Become the Creator** experience.

---

## Context & Dependencies
- The mode selection screen already uses real, dynamic galaxy backgrounds.
- Galaxy selection is already managed within the mode, allowing the currently displayed background galaxy to be used as the initial simulation state without affecting the existing galaxy selection logic.
- **Become the Creator** supports user-created galaxies, which should determine the hover background when available.

---

## Success Criteria
- Starting **As the Gods Will** loads the galaxy currently displayed on the mode selection background instead of always loading the Milky Way.
- The transition from the mode selection screen to the simulation is seamless and visually consistent.
- Hovering over **Become the Creator** no longer displays the **As the Gods Will** background.
- If the user has an existing custom galaxy, it is displayed as the **Become the Creator** hover background.
- If the user has not created a galaxy yet, the hover background displays an empty universe with only a basic galaxy environment and no user-created objects.
- All emojis are removed from the **Become the Creator** interface, particularly within the controller panel and its controls, while preserving functionality and clarity.
- Existing galaxy selection and creator functionality continue to work without conflicts or regressions.

---

## Supporting Tasks

### As the Gods Will Transition Logic
- Update the start flow to pass the currently displayed background galaxy as the initial simulation galaxy.
- Replace the hardcoded Milky Way startup behavior with the currently active background galaxy while preserving all existing simulation logic.

### Become the Creator Background Logic
- Remove the dependency on the **As the Gods Will** background for the hover preview.
- Display the user's custom galaxy as the hover background when one exists.
- Display a clean, empty galaxy/universe as the default hover background when no custom galaxy has been created.

### Become the Creator UI Refinement
- Remove all emojis from the **Become the Creator** interface.
- Replace emoji-based labels and indicators, especially within the controller panel, with clean text or appropriate UI components while maintaining usability.

### Transition Consistency
- Ensure all mode previews accurately represent their respective experiences and maintain smooth, visually consistent transitions into their corresponding simulations.