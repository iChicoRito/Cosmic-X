# Objective

## Enhance Custom Stellar Exploration and Restore the Codex-Style Interface

---

## Description

Improve the experience of entering custom-created stellar systems by providing the same level of detail, interaction, and immersion available in the Solar System simulation mode. Ensure the user interface adapts dynamically based on whether the user is inside or outside a stellar system, displaying only the controls and features relevant to the current context. Make user-created objects easier to identify by displaying visible labels, and restore the previous Codex-style presentation for titles and descriptions instead of using an accordion layout. The overall experience should remain consistent, intuitive, and immersive across both built-in and custom stellar systems.

---

## Primary Objective

Provide custom-created stellar systems with feature parity to the Solar System simulation, including immersive exploration, contextual controls, and a consistent user interface.

---

## Secondary Objectives

* Deliver the same detailed exploration experience for custom stellar systems as the Solar System simulation.
* Dynamically switch the available controls based on whether the user is inside or outside a stellar system.
* Enable all relevant simulation interactions while exploring a stellar system, including viewing planet information, celestial body details, object inspection, and other available simulation features.
* Display visible labels for all user-created stellar systems and other placeable objects.
* Restore the previous Codex-style layout for titles and descriptions, replacing the accordion-based interface.

---

## Success Criteria

* Entering a custom stellar system provides the same exploration and interaction capabilities as the Solar System simulation.
* Controls automatically switch to the simulation interface when entering a stellar system and revert to the original interface upon exit.
* Planet information, celestial body details, and other simulation interactions are fully accessible within custom stellar systems.
* Every user-created stellar system and placeable object displays a visible label.
* Titles and descriptions are presented using the original Codex-style layout rather than an accordion interface.

---

## Context & Dependencies

* The application already includes a Solar System simulation mode with detailed exploration features and simulation controls.
* Custom-created stellar systems should reuse the same exploration capabilities and interaction model provided by the existing simulation.
* The interface must respond to the user's current context, changing between the default controls and simulation controls as the user enters or exits a stellar system.

---

## Supporting Tasks

### Exploration Experience

* Provide custom stellar systems with the same level of detail and immersion as the Solar System simulation.
* Ensure custom stellar systems support the same interactive exploration experience.

### Context-Aware Interface

* **[Tag: Conditional]** Hide controls that are not applicable while the user is inside a stellar system.
* **[Tag: Conditional]** Display the simulation controls used in the Solar System mode when the user enters a stellar system.
* Enable viewing planet information, celestial body details, object inspection, and all other applicable simulation interactions while inside a stellar system.
* **[Tag: Conditional]** Restore the original controls and interface automatically when the user exits the stellar system.

### Object Identification

* Display a visible label for every user-created stellar system.
* Display visible labels for all other placeable objects.

### User Interface

* Restore the original Codex-style presentation for titles and descriptions.
* Remove the accordion-based presentation and keep titles and descriptions continuously visible.

---

## Detailed Breakdown

### Immersive Stellar Exploration

Custom-created stellar systems should deliver the same exploration experience as the existing Solar System simulation. Users should experience the same level of detail, interactivity, and immersion when entering a custom stellar system as they do when exploring the built-in simulation.

### Context-Aware Controls

The user interface should adapt automatically based on the user's location. While inside a stellar system, only controls relevant to exploration should be displayed, including all simulation interactions such as viewing planet information, celestial body details, and object inspection. When the user exits the stellar system, the interface should automatically return to its original state.

### Placeable Object Labels

Every user-created stellar system and any other placeable object should display a visible label so users can easily identify and locate objects they have placed within the scene.

### Codex-Style Interface

Restore the previous Codex-style layout for titles and descriptions. Replace the accordion-based presentation with a layout that keeps titles and descriptions directly visible for a more consistent and accessible interface.
