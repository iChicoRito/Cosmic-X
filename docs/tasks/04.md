# Objective

## Redesign the Title Screen and Mode Selection UI Based on Reference Assets

---

## Role

You are a UI/UX implementation specialist. Approach this objective with the mindset, vocabulary, and priorities of a designer and front-end interface developer, ensuring the implementation closely matches the provided visual references.

---

## Description

Update the system's user interface using the reference images located in the `assets\img` folder as the primary design source. The implementation should closely replicate the visual appearance, layout, and interaction behavior shown in the provided assets while preserving the existing functionality. Focus on modernizing the title screen and mode selection interface by matching the specified hover states, button styling, and overall visual presentation.

---

## Primary Objective

Implement the title screen and mode selection UI so that it accurately matches the provided reference assets, including all specified visual states and hover interactions.

---

## Supporting Tasks

### Title Screen

* Use `assets\img\TITLESCREEN-NORMAL-STATE.jpg` as the default visual reference for the title screen.
* Use `assets\img\TITLESCREEN-HOVER-STATE.jpg` as the hover-state reference.
* Implement the title screen button so that hovering over it displays the filled-color appearance shown in the hover-state reference image.

### Mode Selection Screen

* After the **Start** button is clicked, redesign the mode selection screen to match the new UI shown in the reference assets.
* When no mode is selected or hovered, display the interface based on `assets\img\MODE-SELECTION-NORMAL-STATE.jpg`.
* Replace the existing buttons with the new modern, minimalist design shown in the reference.
* Position the mode selection buttons at the bottom of the screen with full-width layouts.
* Display each button with both its title and subtitle.
* Ensure each button provides visual feedback when hovered.

### Button Hover Interactions

* Implement the hover behavior shown in:

  * `assets\img\MODE-SELECTION-HOVER-STATE-01.jpg`
  * `assets\img\MODE-SELECTION-HOVER-STATE-01-1.jpg`
* On hover, the button should:

  * Transition to a white filled background.
  * Change its text color to a dark color.
  * Display a **"Play"** label on the far-right side of the button.
* Apply the same hover behavior and functionality consistently to both mode selection buttons.

---

## Success Criteria

* The title screen matches the provided normal and hover-state reference images.
* Hovering over the title screen button displays the specified filled-color effect.
* Clicking **Start** transitions to the redesigned mode selection interface.
* The default mode selection screen matches `MODE-SELECTION-NORMAL-STATE.jpg`.
* Both mode selection buttons use the new modern full-width layout with titles and subtitles.
* Both buttons implement the hover behavior shown in the provided hover-state reference images, including the white fill, dark text, and right-aligned **"Play"** label.

---

## Context & Dependencies

* All UI changes must be based on the reference images located in the `assets\img` directory.
* The existing application flow remains unchanged, with the UI redesign occurring after the **Start** button is clicked.
