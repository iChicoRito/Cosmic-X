# Objective

## Implement a Dynamic Background Music System with Audio Controls and a Minimal Music Player

---

## Role

You are a game audio and UI/UX developer. Approach this objective with the mindset, vocabulary, and priorities of implementing an immersive audio experience while maintaining a clean, intuitive user interface.

---

## Description

Implement a complete dynamic background music (BGM) system that changes music based on the current game context while providing smooth, immersive transitions between tracks. The system should support multiple playback behaviors, including looping, random playback, configurable delays, and seamless fade-in/fade-out effects to create a polished audio experience. Expand the Settings menu with comprehensive audio controls, allowing users to customize background music behavior and volume. Additionally, display a minimal, low-opacity music player at the top-center of the screen that shows the currently playing track and provides basic playback controls without using a visible container or background.

---

## Primary Objective

Develop a dynamic background music system with smooth transitions, configurable playback behavior, user-accessible audio settings, and a minimal on-screen music player.

---

## Secondary Objectives

* Implement context-specific music playback for the Big Bang, Solar System, and Lobby scenes.
* Apply smooth fade-in and fade-out transitions between all music tracks.
* Allow users to configure background music behavior through the Settings menu.
* Display the currently playing music using a subtle, always-visible player with playback controls.
* Set the default audio volume to 50% while supporting a maximum of 100%.

---

## Success Criteria

* Big Bang scene plays its designated background music with smooth fade-in and fade-out effects.
* Solar System scene randomly selects from five background music tracks.
* Solar System music waits at least 10 seconds after a track finishes before playing the next random track.
* After every Solar System track has been played, playback repeats starting from the first music in the playlist.
* Lobby uses `assets\music\lobby\Cosmic Dawn.mp3`.
* Lobby music loops with a 5-second delay between repetitions.
* All scene transitions use smooth audio fading.
* Audio settings include:

  * Master Volume
  * Background Music Volume
  * Music playback mode/settings (such as random playback and looping)
  * Music selection options
* Default audio volume is 50%.
* A minimal music player is displayed at the top-center of the screen.
* The music player displays:

  * Current track title
  * Low-opacity appearance
  * Spinning disk icon
  * Previous track button
  * Play/Pause button
  * Next track button
* The music player has no visible container, panel, or background.

---

## Constraints

* Big Bang music is located in `assets\music\big-bang`.
* Solar System music is located in `assets\music\solar-system`.
* Lobby music uses `assets\music\lobby\Cosmic Dawn.mp3`.
* The top-center music player must have no visible container or box.
* The player should maintain a subtle, low-opacity appearance.
* No sound effects (SFX) settings should be implemented at this time.

---

## Out of Scope

* Sound effects (SFX) implementation and SFX settings.

---

## Context & Dependencies

* Background music assets already exist under:

  * `assets\music\big-bang`
  * `assets\music\solar-system`
  * `assets\music\lobby`
* The music player layout should visually follow the reference shown in `assets\img\screenshot-reference.png`.

---

## Supporting Tasks

### Background Music System

* Implement dedicated music playback for the Big Bang scene.
* Apply smooth fade-in when music starts.
* Apply smooth fade-out when music stops or transitions.

### Solar System Music

* Implement playback using the five available Solar System background music tracks.
* Randomly select the next track for playback.
* Wait at least 10 seconds after a track finishes before starting the next one.
* After every track has been played, restart playback beginning with the first music in the playlist.
* Apply smooth fade-in and fade-out during every transition.

### Lobby Music

* Configure the Lobby scene to play `assets\music\lobby\Cosmic Dawn.mp3`.
* Repeat playback after a 5-second interval.
* Ensure looping uses smooth fade transitions.

### Audio Settings

* Add a Master Volume control.
* Add a Background Music volume control.
* Add music playback options, including random playback and looping.
* Add a music selection option so users can choose which music should play.
* Set the default volume level to 50%.

### Music Player UI

* Create a minimal player positioned at the top-center of the screen.
* Display the currently playing music title.
* Add a continuously spinning disk icon.
* Add Previous, Play/Pause, and Next controls.
* Ensure the player has low opacity.
* Do not use any visible container, panel, or boxed background.

---

## Detailed Breakdown

### Big Bang Music

The Big Bang scene should play only its designated background music from the `assets\music\big-bang` directory. Playback should include smooth fade-in when starting and smooth fade-out when ending or transitioning to maintain an immersive experience.

### Solar System Music

The Solar System scene contains five different background music tracks. Playback should randomly choose a track, then wait at least 10 seconds after the track finishes before playing another. Once every track has been played, playback should repeat beginning with the first music in the playlist. Every transition should include smooth fade-in and fade-out effects.

#### Nested Details

* Random playback applies to the five Solar System music tracks.
* A minimum 10-second pause occurs after each completed track.
* Playback restarts after the complete playlist has been played.

### Lobby Music

The Lobby scene should exclusively use `assets\music\lobby\Cosmic Dawn.mp3`. After the track completes, playback should restart after a 5-second delay while maintaining smooth fade transitions between repetitions.

### Audio Settings

Expand the Settings menu to include audio configuration options. Users should be able to adjust Master Volume and Background Music volume, choose music playback behavior such as random playback or looping, and select which music should play. The default volume should be initialized at 50%, with a maximum value of 100%.

### Music Player Interface

Using `assets\img\screenshot-reference.png` as the visual reference, create a small music player positioned at the top-center of the screen. The player should have a subtle, low-opacity appearance with no visible container or background. It should display the currently playing music title, include a continuously spinning disk icon, and provide Previous, Play/Pause, and Next controls for music navigation.
