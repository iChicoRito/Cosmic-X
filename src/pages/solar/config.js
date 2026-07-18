import { Vector3 } from 'three';

export function createSolarConfig() {
  const CONFIG = {
  distanceScale: 34,
  distanceExp: 0.55,
  planetScale: 1.5,
  timeScale: 10,          // simulated days per real second
  playing: true,
  gravityMult: 1,         // global gravity strength multiplier
  // collisions start ON (user can disable); other automatic events start OFF
  collisions: true,
  eclipses: false,
  autoNEAs: false,
  showTrails: true,
  showLabels: true,
  showBelt: true,
  showNebulas: true,
  particleDensity: 1,
  quality: 'high',
  displayMode: 'fullscreen',
  antialiasing: true,
  mouseSensitivity: 1,
  cameraSpeed: 1,
  rotationSpeed: 1,
  panSpeed: 1,
  zoomSpeed: 1,
  showHUD: true,
  showTimeline: true,
  showWarnings: true,
  // threshold low enough that the ACES-tone-mapped scene actually feeds the
  // pass — at 0.9 almost nothing crossed it and the strength slider looked dead
  bloom: { threshold: 0.6, strength: 1.15, radius: 0.55 },
  homeCam: new Vector3(0, 85, 235),
  titleOrbit: { radius: 330, height: 120, rate: 0.05 },
  introDur: 3.5,
};
  return CONFIG;
}

// Gravitational parameter of one solar mass in scene units (u³/day²),
// calibrated so a circular orbit at Earth's scaled distance takes ~365 days.
export const GM_SUN = 11.6;
export const QUALITY = {
  low:    { pixelRatio: 1,   shadows: false, density: 0.5 },
  medium: { pixelRatio: 1.5, shadows: false, density: 0.85 },
  high:   { pixelRatio: 2,   shadows: true,  density: 1 },
};

export const TEX_BASE = 'https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/';
