// Pure, node-safe music helpers (no Vite-only APIs) so tests can import them
// without pulling in import.meta.glob from audio.js.

export const clamp01 = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function sceneForPath(path) {
  if (path === '/solar-system') return 'solar';
  if (path === '/big-bang') return 'big-bang';
  return 'lobby'; // '/', '/modes', and any fallback
}

export function effectiveVolume(master, bgm) {
  return clamp01(master) * clamp01(bgm);
}

// Full shuffle: every cycle plays each track exactly once in random order,
// so entering the simulation starts on a random track, not a fixed one.
export function buildSolarCycle(playlist) {
  const cycle = [...playlist];
  for (let i = cycle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
  }
  return cycle;
}
