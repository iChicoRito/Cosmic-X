# Objective
## Refine Responsive Button Sizing and Mobile UI Layout

---

## Role

You are a frontend UI/UX developer. Approach this objective with the mindset, vocabulary, and priorities of a responsive interface designer focused on consistency, usability, and visual polish across desktop and mobile devices.

---

## Description

Refine the user interface by improving the sizing, responsiveness, and layout of interactive elements across the application while preserving the existing functionality and user experience. Reduce the size of specific buttons to create a cleaner interface and ensure their dimensions scale appropriately on both desktop and mobile devices. Improve the mobile layout by resolving spacing inconsistencies, overlapping elements, and panel behavior to provide a more balanced and intuitive experience. Maintain visual consistency by applying a unified glassmorphism appearance to all specified buttons.

---

## Primary Objective

Improve the responsiveness, consistency, and visual presentation of buttons and mobile layouts without altering the existing application logic or desktop behavior unless explicitly specified.

---

## Secondary Objectives

- Reduce the size of designated buttons throughout the application while maintaining responsive sizing across desktop and mobile devices.
- Improve mobile panel behavior by collapsing non-essential interface panels by default.
- Resolve layout inconsistencies, overlapping controls, and width alignment issues in mobile view.
- Standardize the appearance of specified buttons using a semi-transparent glassmorphism style.

---

## Success Criteria

- All specified buttons are reduced in size and remain responsive across desktop and mobile devices.
- Mobile-only layout improvements are implemented without affecting the desktop interface.
- Controller and timeline panels are collapsed by default on mobile and can be expanded manually.
- Mobile layouts no longer contain overlapping controls or inconsistent container widths.
- All specified buttons use a background with 10% black opacity to enhance the glassmorphism effect.
- Existing functionality and navigation remain unchanged.

---

## Constraints

- Do not modify existing application logic or functionality.
- Do not change desktop layouts unless explicitly requested.
- Apply responsive changes only to the specified pages and components.

---

## Out of Scope

- Do not modify desktop versions of the **Back to Menu** and **Hide UI** buttons in the Solar System page.
- Do not change any functionality beyond the UI and responsive layout adjustments described.

---

## Context & Dependencies

- The application includes the following routes:
  - `/#/` (Title Screen)
  - `/#/modes`
  - `/#/solar-system`
  - `/#/big-bang`
- Responsive behavior should adapt appropriately between desktop and mobile layouts while maintaining the current application structure.

---

## Supporting Tasks

### Global Button Styling
- Reduce the size of all specified buttons while keeping them responsive across desktop and mobile.
- Apply a consistent glassmorphism appearance using a background with **10% black opacity** to all specified buttons.

### Title Screen (`/#/`)
- Reduce the size of the **Start** button.
- Reduce the size of the **Settings** button.

### Mode Selection (`/#/modes`)
- Reduce the size of the **Back to Title Screen** button.

### Solar System (`/#/solar-system`)
- Reduce the size of the **Back to Menu** button.
- Reduce the size of the **Hide UI** button, but only in the mobile layout.
- Keep the desktop version unchanged.
- Make the controller panel collapsed by default on mobile while allowing users to expand it manually.
- Make the expanded controller panel occupy the full available width on mobile.
- Make the timeline panel collapsed by default on mobile while allowing users to expand it manually.

### Big Bang (`/#/big-bang`)
- Reduce the size of the **BEGIN** button.
- Improve the mobile timeline layout so it spans the available width consistently.
- Make the information card match the timeline width for a balanced layout.
- Prevent buttons from overlapping their containers in mobile view.
- Move the **Hide UI** button to the right side of the interface in mobile view instead of positioning it beside the **Modes** button.

### Big Bang Ending Scene
- Arrange the action buttons into a single-column layout.
- Style the **Back to Menu** button as a ghost/text button with no background or border.

---

## Detailed Breakdown

### Responsive Button Scaling

Reduce the size of all specified buttons while ensuring they remain appropriately scaled for both desktop and mobile displays. Maintain consistent spacing, padding, and alignment across all affected pages while preserving usability.

### Mobile Controller and Timeline Panels

On the Solar System page, both the controller panel and the timeline should be collapsed by default on mobile devices. Users should be able to manually expand each panel, and the expanded controller should occupy the full available width to improve usability on smaller screens.

### Mobile Layout Consistency

Improve the Big Bang mobile interface by ensuring the timeline and information panel share consistent widths and alignment. Eliminate overlapping buttons and spacing issues so every interface element remains properly contained and visually balanced.

### Button Positioning and Visual Refinement

Adjust button placement where specified, including moving the **Hide UI** button in the Big Bang mobile interface and converting the ending scene into a cleaner single-column layout. Apply a consistent glassmorphism appearance to all specified buttons using a **10% black opacity** background to improve visual cohesion.