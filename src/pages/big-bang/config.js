export function createBigBangConfig() {
const CONFIG = {
  bloom: { threshold: 0.6, strength: 1.15, radius: 0.55 },
  pixelRatio: 2,
};
// ponytail: single quality tier; halve COUNTS + pixelRatio if low-end perf matters
const COUNTS = {
  foam: 6000, plasma: 20000, particles: 16000, atomClusters: 2400,
  galaxies: 60, galaxyPts: 700, milkyWay: 11000, starUnits: 40,
  planetesimals: 200, starfield: [2200, 1500],
};
  return { CONFIG, COUNTS };
}
