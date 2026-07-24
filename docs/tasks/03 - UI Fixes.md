# Enhancement Request

Please implement the following improvements and bug fixes:

---

# 1. Reposition Toast Notifications

* Move toast notifications from the top of the screen to the bottom.
* The current placement overlaps with the **← Modes** button, making it difficult to access.
* Ensure the new position does not obstruct any important UI elements, controls, or scene content.
* Toast notifications should remain readable and responsive across different screen sizes.

---

# 2. Expand Galaxy Content

Add all additional galaxies that already exist in the project to the **Index**, including:

* Andromeda Galaxy
* Existing Messier galaxies
* Any other galaxy entries already available in the project

These galaxies should:

* Appear in the Index alongside the currently listed galaxies.
* Be discoverable during camera exploration.
* Be included in the camera movement and discovery sequence just like the existing galaxies.
* Display their names, descriptions, and available information when discovered.
* Follow the same visual and interaction behavior as the current galaxy entries.

---

# 3. Add a Hide UI Toggle

Add a **Hide UI** button to both the **Index** and **Big Bang** scenes.

### When enabled:

* Hide all interface elements, including buttons, navigation controls, panels, labels, text, notifications, and overlays.
* Leave only the 3D scene visible for an immersive viewing experience.
* Provide a simple and unobtrusive way to restore the interface.

### When disabled:

* Restore the full interface exactly as it appeared before it was hidden.
* Preserve the user's current scene, camera position, and simulation state.

---

# 4. Improve the Title Screen

Redesign the **Before the Stars** title screen background.

Instead of using a static background, use the galaxy environment from the main experience.

### Requirements

* Display visible galaxies and other space objects in the background.
* Have the camera slowly move through space to create a cinematic effect.
* Keep the title, menu, and navigation controls readable while the animated background plays.
* Use appropriate contrast or overlays to maintain text readability.
* Ensure the movement is smooth, subtle, and loops seamlessly.
* Optimize the animation so it does not noticeably impact loading time or performance.

---

# 5. Fix Unexpected Solar System Redirection

There is an intermittent navigation bug in the **Solar System Simulation** scene.

### Current Behavior

While the user is actively exploring or interacting with the Solar System simulation, the application sometimes unexpectedly redirects to the **Big Bang** page without any user action.

### Expected Behavior

* The Solar System simulation should remain active until the user intentionally changes scenes.
* No automatic redirection to the Big Bang page should occur.
* Scene transitions should only happen after a valid user action or an explicitly defined simulation event.

### Investigation Requirements

* Check for unintended timers, delayed callbacks, event listeners, or navigation triggers inherited from the Big Bang scene.
* Verify that scene state and routing state are properly reset when entering the Solar System simulation.
* Ensure previous animation callbacks or automatic transitions are fully cancelled when switching scenes.
* Check for duplicate event listeners being registered after revisiting the Solar System scene.
* Verify the issue does not occur after repeatedly switching between the Index, Big Bang, and Solar System scenes.

### Acceptance Criteria

* Users can remain on the Solar System Simulation page indefinitely without unexpected redirects.
* Navigation only occurs after intentional user interaction.
* Repeated scene switching does not trigger unexpected navigation.
* The fix works consistently on desktop and mobile devices.

---

# 6. Fix Title Screen Button Hover Glitch

There is an intermittent UI glitch on the **Before the Stars** title screen.

### Current Behavior

When moving the cursor in and out of the menu buttons, the hover effect sometimes glitches. This causes button elements, titles, and descriptions to flicker, duplicate, or overlap, making the title screen appear unstable and reducing usability.

### Expected Behavior

* Hover transitions should be smooth and consistent.
* Only one instance of each button and its associated text should be displayed at all times.
* Rapidly moving the cursor over and away from buttons should not create duplicate or overlapping UI elements.
* The title screen should remain visually stable regardless of hover interactions.

### Investigation Requirements

* Check for duplicate hover state updates or repeated component renders.
* Ensure hover animations are not creating multiple instances of the same UI elements.
* Verify that previous hover states are properly cleared before applying new ones.
* Check for duplicate event listeners or animation callbacks attached to the menu buttons.
* Confirm the issue does not occur after repeatedly hovering over buttons or returning to the title screen multiple times.

### Acceptance Criteria

* Hovering over menu buttons no longer causes flickering, duplication, or overlapping UI elements.
* Menu animations remain smooth and responsive.
* The title screen maintains a clean and stable appearance during all hover interactions.
* The issue is consistently resolved across desktop browsers and different screen sizes.

---

# 7. Fix Simulation Reset Not Clearing Spawned Objects

There is an issue with the simulation reset functionality.

### Current Behavior

When the user resets the simulation, the simulation state is reset, but any objects that were dynamically spawned during the simulation remain in the scene. This causes old spawned objects to accumulate across multiple resets and results in an incorrect simulation state.

### Expected Behavior

When the user resets the simulation:

* Remove all dynamically spawned objects from the scene.
* Restore the simulation to its original initial state.
* Reset all simulation variables, timers, animations, physics states, and object collections.
* Ensure no objects from the previous simulation persist after the reset.
* Recreate only the original default objects required for a fresh simulation.

### Investigation Requirements

* Check that all dynamically created entities are properly tracked and disposed of during reset.
* Verify spawned meshes, particle systems, physics bodies, labels, trails, and related resources are removed from both the scene and memory.
* Ensure any associated event listeners, animation callbacks, timers, and simulation loops attached to spawned objects are also cleaned up.
* Verify object pools or cached references are cleared to prevent previously spawned objects from reappearing.
* Confirm that resetting multiple times does not cause duplicate objects, memory leaks, or performance degradation.
* Test resetting after long simulations and after repeatedly spawning objects to ensure the scene always returns to a clean initial state.

### Acceptance Criteria

* Resetting the simulation completely removes all previously spawned objects.
* The simulation always starts from a clean, identical initial state.
* No duplicate or leftover objects remain after one or multiple resets.
* Memory usage remains stable after repeated resets.
* The reset behavior is consistent across all simulation scenes on both desktop and mobile devices.

---
