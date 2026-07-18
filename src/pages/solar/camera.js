export function createCameraMetadata() {
const CAMERA_MODES = new Set(['orbit', 'free', 'follow', 'cinematic', 'drone', 'telescope']);
const CAMERA_MODE_LABELS = {
  orbit: 'Orbit',
  free: 'Free flight',
  follow: 'Follow',
  cinematic: 'Cinematic',
  drone: 'Drone',
  telescope: 'Telescope',
};
const CAMERA_HINTS = {
  orbit: 'Left-drag orbits, right-drag pans, scroll zooms. Click any body to focus it.',
  free: 'WASD moves, Space rises, Ctrl descends, Shift boosts, and left-drag looks around.',
  follow: 'Orbit controls stay active while the camera travels with the selected body.',
  cinematic: 'An auto-directed tour moves between living targets. Esc returns to orbit.',
  drone: 'A close, gently moving observation orbit around the selected target.',
  telescope: 'Use Telescope zoom for a long-lens view of the selected target.',
};
  return { CAMERA_MODES, CAMERA_MODE_LABELS, CAMERA_HINTS };
}
