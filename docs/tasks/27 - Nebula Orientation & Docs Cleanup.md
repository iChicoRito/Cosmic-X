# Objective

## Implement Camera-Perspective Behavior and Reorganize Project Documentation

---

## Role

You are a software developer responsible for refining camera-dependent visual behavior and maintaining clear, organized project documentation.

---

## Description

Update the galaxy nebula’s behavior so that its position and orientation respond correctly when the camera angle changes. At present, the nebula follows the camera perspective, while the zodiac constellations remain fixed in the same position and angle regardless of camera rotation. Adjust the implementation so the intended visual elements behave consistently according to the required camera-perspective behavior. After completing the visual implementation, reorganize the project documentation, with particular attention to the remaining tasks carried over from items 25 to 26 and the contents of `suggestions.md`.

---

## Primary Objective

Correct the galaxy nebula’s camera-angle behavior so that it maintains the intended position and orientation when the camera rotates or changes perspective.

---

## Secondary Objectives

* Review the zodiac constellation behavior as the reference for how camera-angle changes should affect the selected galaxy nebula.
* Reorganize the documentation files after completing the implementation.
* Clearly arrange and update the remaining tasks associated with items 25 and 26.
* Reorganize `suggestions.md` to improve its structure and readability.

---

## Success Criteria

* The selected galaxy nebula no longer changes position or orientation incorrectly when the camera angle is adjusted.
* The nebula’s camera-perspective behavior is consistent with the intended behavior demonstrated by the zodiac constellations.
* Documentation files are logically organized and easier to navigate.
* Remaining tasks from items 25 to 26 are clearly grouped, ordered, and documented.
* `suggestions.md` is reorganized into a clear and coherent structure.

---

## Context & Dependencies

* The current implementation allows the galaxy nebula to follow changes in camera perspective.
* The zodiac constellations currently remain in the same position and orientation when the camera is rotated or the viewing angle changes.
* The zodiac constellation behavior should be reviewed as the comparison point for correcting the nebula’s behavior.
* Documentation cleanup should occur after the camera-related implementation is completed.

---

## Supporting Tasks

### Camera and Visual Behavior

* Inspect the current transformation and rendering logic applied to the selected galaxy nebula.
* Compare the nebula’s camera-relative behavior with the transformation logic used by the zodiac constellations.
* Modify the nebula implementation so that camera rotation or angle changes do not incorrectly alter its intended position or orientation.
* Verify the corrected behavior across different camera angles and rotations.

### Documentation Organization

* Review the existing documentation files after completing the implementation.
* Reorganize the remaining tasks associated with items 25 and 26 into a clear and logical sequence.
* Update task descriptions where necessary to improve clarity and consistency.
* Reorganize `suggestions.md` so related suggestions are grouped and presented in a readable structure.

---

## Detailed Breakdown

### Galaxy Nebula Camera Behavior

When the galaxy nebula is selected and the camera is rotated or viewed from a different angle, the nebula currently responds to the camera perspective in a way that differs from the zodiac constellations. The zodiac constellations remain visually fixed in their existing position and orientation during camera changes. Review both implementations and adjust the nebula so that it follows the same intended perspective and orientation rules.

### Documentation Cleanup

Once the camera behavior has been corrected, review the project’s documentation files and improve their organization. Give special attention to the remaining work documented between task items 25 and 26, ensuring that unfinished tasks are clearly identified and logically arranged. Reorganize `suggestions.md` so its entries are consistently structured, grouped by relevant topic, and easier to review.
