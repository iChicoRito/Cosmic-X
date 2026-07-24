// Guided scenario presets — pure snapshot blobs fed through the same
// sanitizeState + applySolarState path as saved scenes. Only the fields that
// differ from defaults are set; sanitizeState fills the rest.

export const SOLAR_PRESETS = [
  {
    id: 'grand-tour',
    name: 'Grand Tour',
    desc: 'Milky Way at a gentle pace, trails and labels on.',
    state: {
      galaxy: 0, timeScale: 2,
      toggles: { showTrails: true, showLabels: true },
      cam: { pos: [0, 120, 340], target: [0, 0, 0] },
    },
  },
  {
    id: 'rogue-bh',
    name: 'Rogue Black Hole',
    desc: 'A wandering 300-solar-mass hole disturbs the planets.',
    state: {
      galaxy: 0, timeScale: 10,
      toggles: { collisions: true, showTrails: true },
      cam: { pos: [0, 150, 320], target: [0, 0, 0] },
      log: [{ day: 0, galaxy: 0, type: 'blackhole', props: { pos: [120, 0, 40], massSuns: 300 } }],
    },
  },
  {
    id: 'eclipse-watch',
    name: 'Eclipse Watch',
    desc: 'Automatic eclipses in the inner system (needs High quality).',
    state: {
      galaxy: 0, timeScale: 1,
      toggles: { eclipses: true, showLabels: true },
      cam: { pos: [0, 40, 120], target: [0, 0, 0] },
    },
  },
  {
    id: 'andromeda',
    name: 'Andromeda Approach',
    desc: 'Drift into the imagined Andromeda system.',
    state: {
      galaxy: 1, timeScale: 10,
      cam: { pos: [0, 90, 300], target: [0, 0, 0] },
    },
  },
];
