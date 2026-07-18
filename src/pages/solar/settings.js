export function createSolarSettings(CONFIG, storage = globalThis.localStorage) {
const SETTINGS_KEY = 'cosmicx.settings.v1';

function sanitizeSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const clean = {};
  if (value.displayMode === 'windowed' || value.displayMode === 'fullscreen') clean.displayMode = value.displayMode;
  if (['low', 'medium', 'high'].includes(value.quality)) clean.quality = value.quality;

  for (const [key, min, max] of [
    ['bloomStrength', 0, 3],
    ['particleDensity', 0.3, 2],
    ['mouseSensitivity', 0.25, 2],
    ['cameraSpeed', 0.25, 3],
    ['rotationSpeed', 0.25, 2],
    ['panSpeed', 0.25, 2],
    ['zoomSpeed', 0.25, 2],
  ]) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key])) {
      clean[key] = Math.max(min, Math.min(max, value[key]));
    }
  }
  for (const key of [
    'antialiasing', 'showBelt', 'showNebulas', 'showHUD',
    'showTimeline', 'showLabels', 'showWarnings',
  ]) {
    if (typeof value[key] === 'boolean') clean[key] = value[key];
  }
  return clean;
}

function loadSettings() {
  try {
    const clean = sanitizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
    const { bloomStrength, ...flat } = clean;
    Object.assign(CONFIG, flat);
    if (bloomStrength !== undefined) CONFIG.bloom.strength = bloomStrength;
  } catch {
    // Storage can be blocked or contain malformed JSON; current defaults remain valid.
  }
}

function saveSettings() {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      displayMode: CONFIG.displayMode,
      quality: CONFIG.quality,
      antialiasing: CONFIG.antialiasing,
      bloomStrength: CONFIG.bloom.strength,
      particleDensity: CONFIG.particleDensity,
      showBelt: CONFIG.showBelt,
      showNebulas: CONFIG.showNebulas,
      mouseSensitivity: CONFIG.mouseSensitivity,
      cameraSpeed: CONFIG.cameraSpeed,
      rotationSpeed: CONFIG.rotationSpeed,
      panSpeed: CONFIG.panSpeed,
      zoomSpeed: CONFIG.zoomSpeed,
      showHUD: CONFIG.showHUD,
      showTimeline: CONFIG.showTimeline,
      showLabels: CONFIG.showLabels,
      showWarnings: CONFIG.showWarnings,
    }));
  } catch {
    // Settings still work for the current session when storage is unavailable.
  }
}
  return { loadSettings, saveSettings, sanitizeSettings };
}
