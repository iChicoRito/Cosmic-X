# Objective
## Enhance the Title Screen with Creator Credits and a Context-Aware Settings Menu

---

## Description

Update the title screen by adding creator credits, refining the visual style of the existing **START** button, and introducing a new **SETTINGS** button beneath it. The creator credit should display **"Developed by Mark Adrianne Salunga"** as a footer positioned at the bottom-right corner of the title screen. The **START** button should be restyled with a semi-transparent black appearance (approximately 25% opacity) and a blur effect. The new **SETTINGS** button should match the visual style of the **START** button and open a categorized settings interface. Implement only the settings that are supported by the application's current architecture and functionality. If a requested setting cannot be implemented because it is not applicable or supported, omit it rather than adding a non-functional option.

---

## Primary Objective

Enhance the title screen by adding creator credits, updating the button styling, and implementing a categorized settings menu that includes only features supported by the current application.

---

## Constraints

- Display the creator credit as **"Developed by Mark Adrianne Salunga"**.
- Position the creator credit as a footer in the bottom-right corner of the title screen.
- Restyle the **START** button using approximately **25% black opacity** with a **blur** effect.
- Place the **SETTINGS** button directly below the **START** button.
- The **SETTINGS** button must use the same visual style as the **START** button.
- Organize all settings into categorized tabs.
- Implement **only** settings that are currently supported by the existing application.
- Do **not** create placeholder, non-functional, or simulated settings.
- If the application cannot support every requested setting, implement only those that are feasible within the current system.

---

## Supporting Tasks

### Title Screen Updates
- Add a footer displaying **"Developed by Mark Adrianne Salunga"**.
- Position the footer at the bottom-right corner of the title screen.
- Update the **START** button to use a blurred, semi-transparent black style (approximately 25% opacity).
- Add a **SETTINGS** button directly below the **START** button using the same visual styling.

### Settings Menu
- Implement a settings interface accessible through the **SETTINGS** button.
- Organize all settings into categorized tabs.
- Include only settings that are applicable to the current implementation.
- Exclude any unsupported settings instead of displaying inactive or placeholder controls.

---

## Detailed Breakdown

### Creator Credits

Display the text **"Developed by Mark Adrianne Salunga"** as a footer positioned at the bottom-right corner of the title screen. Ensure it remains subtle and visually consistent with the overall interface.

### Button Styling

Update the **START** button to use a low-opacity black background (approximately 25% opacity) with a blur effect. Add a **SETTINGS** button directly beneath the **START** button using the same size, spacing, and visual styling.

### Settings Organization

Organize the settings menu into categorized tabs. Only include tabs and options that are supported by the application's existing functionality.

### Graphics

Adjust visual quality and rendering.

#### Display
- Resolution
- Fullscreen / Windowed / Borderless
- FPS Limit
- UI Scale
- Brightness
- Gamma
- Field of View (FOV)

#### Graphics Quality
- Overall Preset (Low, Medium, High, Ultra)
- Texture Quality
- Shadow Quality
- Anti-Aliasing
- Ambient Occlusion
- Bloom
- Motion Blur
- Depth of Field
- Lens Flare
- Screen Space Reflections
- Anisotropic Filtering
- Particle Quality
- Volumetric Lighting
- Atmospheric Scattering Quality
- Cloud Quality
- Nebula Quality
- Star Density
- Asteroid Density

### Camera

Configure camera behavior and navigation.

- Movement
- Mouse Sensitivity
- Camera Speed
- Zoom Speed
- Pan Speed
- Rotation Speed

### Mouse

Allow users to customize mouse controls.

#### Customize
- Left Click
- Right Click
- Middle Mouse Button
- Scroll Wheel

### Interface

Configure the visibility of interface elements and notifications.

#### HUD
- Show HUD
- Show Timeline
- Show Minimap
- Show Coordinates
- Show FPS
- Show Object Labels
- Show Tooltips

#### Labels
- Planet Labels
- Moon Labels
- Star Labels
- Galaxy Labels
- Distance Labels

#### Notifications
- Simulation Events
- Collision Alerts
- Educational Tips
- Warnings

### Implementation Guidance

Implement as many of the requested settings as the current application architecture supports. Before adding each option, verify that the underlying functionality already exists or can be reasonably implemented within the current system. If a setting is unsupported, inapplicable, or would require functionality that does not yet exist, omit it from the interface rather than displaying a disabled, placeholder, or non-functional control. The completed settings menu should accurately reflect the application's current capabilities while remaining organized, scalable, and easy to expand in future updates.