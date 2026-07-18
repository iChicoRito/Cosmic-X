

# Objective
## Implement Big Bang Theory Mode and Universe Evolution Experience

---

## Description

Expand the simulation by introducing a dedicated **Big Bang Theory** mode that allows users to experience the evolution of the universe from its earliest moments through the present day and into its projected future. This new mode should focus on scientifically inspired visualizations, interactive controls, cinematic presentation, and chronological progression while maintaining the application's existing minimalist design language. Because several features are technically complex, implementations may use simplified or optimized simulations where appropriate, provided they remain visually convincing and consistent with the intended experience. The new mode should coexist alongside the existing Solar System Sandbox without altering its core functionality.

---

## Primary Objective

Develop a new **Big Bang Theory** simulation mode that enables users to interactively explore the formation and evolution of the universe through an immersive, timeline-driven experience.

---

## Secondary Objectives

- Introduce a separate gameplay mode dedicated to the Big Bang and cosmic evolution.
- Implement an interactive timeline that allows users to navigate major epochs of the universe.
- Create cinematic visualizations for each stage of universal evolution.
- Simulate the expansion of spacetime instead of merely moving celestial objects outward.
- Visualize the progression from fundamental particles to stars, galaxies, and planetary systems.
- Add cinematic camera sequences that showcase major cosmic events.
- Preserve the application's existing minimalist UI style throughout all new interfaces.

---

## Context & Dependencies

- The application already includes a **Solar System Sandbox** mode.
- The new **Big Bang Theory** mode should be presented as a separate experience selected before entering the simulation.
- New interfaces should remain visually consistent with the existing minimalist UI design.

---

## Supporting Tasks

### Gameplay Mode Selection
- **[Sequential]** Replace the current direct **Start** action with a mode selection screen.
- Present two simulation modes using the existing minimalist interface style.
- Ensure the transition from the title screen to the selected mode is smooth and visually consistent.

#### Mode 1
**Title:** Become the Creator

**Subtitle:** A Solar System Sandbox Simulation

#### Mode 2
**Title:** Before the Stars

**Subtitle:** From Singularity to Infinity: A Journey from the Big Bang to the Modern Universe

---

### Timeline Evolution System
- **[Sequential]** Implement an interactive timeline representing the chronological evolution of the universe.
- Allow users to scrub through every major cosmic epoch.
- Support seamless transitions between timeline stages.

#### Timeline Stages
- 0 Seconds
- Planck Epoch (10⁻⁴³ seconds)
- Inflation
- Particle Formation
- Atoms Form
- First Stars
- First Galaxies
- Milky Way Formation
- Solar System Formation
- Present Day
- Future Universe

#### Timeline Controls
- Pause
- Resume
- Reverse Time
- Jump to Any Epoch
- Change Simulation Speed

---

### Big Bang Animation
- **[Sequential]** Create an immersive opening sequence representing the birth of the universe.

#### Simulation Sequence
- Complete Darkness
- Quantum Fluctuations
- Brilliant Flash of Energy
- Rapid Inflation
- Expansion of Space
- Temperature Decrease
- Particle Formation

#### Visual Effects
- Massive Energy Waves
- Expanding Spacetime Grid
- Cosmic Plasma
- Radiation Glow
- Dynamic Particle Effects
- HDR Bloom

---

### Universe Expansion Simulation
- **[Sequential]** Simulate the expansion of spacetime rather than objects simply moving outward.
- Visualize galaxies becoming increasingly distant as space expands.
- Include a representation of Hubble expansion.
- Visualize cosmological redshift.
- Allow users to adjust the expansion speed through an interactive slider.

#### Control
Expansion Rate Slider

---

### Particle Formation Simulation
- **[Sequential]** Visualize the formation of the universe's earliest particles and their progression into larger structures.

#### Fundamental Particles
- Quarks
- Gluons
- Electrons
- Protons
- Neutrons

#### Evolution Sequence
Particles

↓

Hydrogen

↓

Helium

↓

Gas Clouds

↓

Stars

---

### First Star Formation
- **[Sequential]** Simulate gravitational collapse leading to the birth of the first stars.

#### Formation Stages
- Gas Clouds
- Gravitational Collapse
- Protostar Formation
- Stellar Ignition
- Nuclear Fusion

---

### Galaxy Formation
- **[Sequential]** Create an animated simulation showing the gradual assembly of galaxies.

#### Evolution Sequence
Gas Clouds

↓

Clusters

↓

Protogalaxies

↓

Spiral Galaxies

↓

Elliptical Galaxies

↓

Galaxy Clusters

- Allow users to freely rotate the camera around galaxies while they are forming.

---

### Solar System Formation
- **[Sequential]** Continue the simulation from the Milky Way to the formation of the Solar System.

#### Formation Sequence
Nebula

↓

Dust Disk

↓

Sun Formation

↓

Planetesimals

↓

Protoplanets

↓

Planets

↓

Moons

#### Visual Processes
- Accretion
- Planetary Collisions
- Planet Growth

---

### Cinematic Camera System
- **[Sequential]** Implement cinematic camera sequences that automatically showcase major stages of cosmic evolution.
- Present transitions in a documentary-inspired style.

#### Camera Highlights
- Expanding Universe
- Galaxy Formation
- Birth of Stars
- Planet Formation
- Black Holes

---

## Detailed Breakdown

### Big Bang Theory Mode

The application should introduce a completely separate simulation mode dedicated to the evolution of the universe. This mode should guide users through the chronological formation of the cosmos, beginning with the Big Bang and progressing through major scientific milestones until the present day and beyond. Although certain simulations are inherently complex, simplified implementations are acceptable provided they remain visually engaging and align with the intended educational and immersive experience.

### User Interface Integration

The title screen should no longer immediately launch the simulation. Instead, selecting **Start** should open a minimalist mode selection interface offering both the existing Solar System Sandbox and the new Big Bang Theory experience. This interface should match the application's current visual style, remaining clean, modern, and unobtrusive while clearly presenting both gameplay options.