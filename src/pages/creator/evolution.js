// Pure aggregate-evolution model for the Creator mode — no THREE, no DOM.
// The galaxy is simulated statistically: totals evolve, discrete events are
// sampled for the renderer to visualize.

import { estimateTotalStars } from './galaxy-model.js';

export const SPEEDS = [1, 2, 10, 100, 1000, 1000000];
export const BASE_YEARS_PER_SECOND = 100;

export function speedLabel(multiplier) {
  return '×' + multiplier.toLocaleString('en-US');
}

const trim = v => String(parseFloat(v.toFixed(2)));

export function formatYears(years) {
  const y = Math.max(0, years);
  if (y < 1e3) return `${Math.round(y)} yr`;
  if (y < 1e6) return `${trim(y / 1e3)} kyr`;
  if (y < 1e9) return `${trim(y / 1e6)} Myr`;
  return `${trim(y / 1e9)} Gyr`;
}

export function formatCount(n) {
  const v = Math.max(0, Math.round(n));
  if (v < 1e4) return v.toLocaleString('en-US');
  if (v < 1e6) return `${(v / 1e3).toFixed(1)}K`;
  if (v < 1e9) return `${(v / 1e6).toFixed(1)}M`;
  if (v < 1e12) return `${(v / 1e9).toFixed(1)}B`;
  return `${(v / 1e12).toFixed(2)}T`;
}

const MEAN_STAR_LIFE_YR = 8e9;
const SN_SHARE_OF_DEATHS = 0.002;  // only the massive tail of dying stars goes supernova
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createStats(params) {
  const totalStars = estimateTotalStars(params);
  return {
    years: 0,
    totalStars,
    totalPlanets: Math.round(totalStars * 1.6),
    habitablePlanets: Math.round(totalStars * 0.006),
    blackHoles: Math.round(totalStars * 1e-3),
    neutronStars: Math.round(totalStars * 1.4e-3),
    nebulae: Math.round(9000 * params.nebulaFrequency) + 40,
    clusters: params.clusterCount + Math.round(150 * params.starDensity),
    avgStellarAgeYr: 6.2e9 / (1 + params.starFormationRate / 4),
    galaxyMassSuns: params.mass * 1e11,
    bhMassSuns: 4.1e6 * Math.max(params.mass, 0.1),
    supernovae: 0,
    gasSupply: clamp(0.35 + params.nebulaFrequency * 0.25, 0.1, 1),
  };
}

/* Advance the aggregates by dtYears. Mutates stats, returns sampled events
   for the renderer: [{ type: 'supernova' | 'starburst' }...]. */
export function stepEvolution(stats, params, dtYears, rng = Math.random) {
  if (!(dtYears > 0)) return [];
  const dt = dtYears; // frame dt is already capped upstream (≤1e7 yr even at ×1,000,000)

  const sfrStarsPerYr = params.starFormationRate * stats.gasSupply * 0.8;
  const births = sfrStarsPerYr * dt;
  const deaths = Math.min(stats.totalStars * (dt / MEAN_STAR_LIFE_YR), stats.totalStars * 0.4);
  const supernovae = deaths * SN_SHARE_OF_DEATHS;

  // average age: survivors age by dt, newborns pull the mean down
  const survivors = Math.max(stats.totalStars - deaths, 1);
  const nextTotal = Math.max(survivors + births, 1);
  stats.avgStellarAgeYr = ((stats.avgStellarAgeYr + dt) * survivors + (dt / 2) * births) / nextTotal;

  stats.totalStars = nextTotal;
  stats.totalPlanets = Math.round(stats.totalPlanets + births * 1.6 - deaths * 1.1);
  stats.habitablePlanets = Math.max(0, Math.round(stats.habitablePlanets + births * 0.005 - deaths * 0.004));
  stats.neutronStars = Math.round(stats.neutronStars + supernovae * 0.8);
  stats.blackHoles = Math.round(stats.blackHoles + supernovae * 0.2);
  stats.supernovae = Math.round(stats.supernovae + supernovae);
  stats.bhMassSuns *= 1 + dt * 2.5e-11;                          // slow accretion
  stats.gasSupply = clamp(stats.gasSupply - births / 1e11 + supernovae / 1e12, 0.02, 1);
  stats.nebulae = Math.max(20, Math.round(stats.nebulae + supernovae * 2e-4 - births * 1e-5));
  stats.years += dtYears;

  // visible events: roughly one supernova flash per 400 kyr of sim time
  const events = [];
  const expectedFlashes = dt / 4e5;
  let flashes = Math.floor(expectedFlashes);
  if (rng() < expectedFlashes - flashes) flashes += 1;
  for (let i = 0; i < Math.min(flashes, 3); i++) events.push({ type: 'supernova' });
  if (stats.gasSupply > 0.5 && rng() < dt / 2e9) events.push({ type: 'starburst' });
  return events;
}

/* 0 = pristine blue disk, 1 = gas-starved amber relic. Drives global tinting. */
export function agingTint(stats) {
  return clamp(1 - stats.gasSupply, 0, 1) * 0.6 + clamp(stats.years / 4e10, 0, 1) * 0.4;
}

/* Merge stats of two colliding galaxies. */
export function mergeStats(a, b) {
  const merged = { ...a };
  for (const key of ['totalStars', 'totalPlanets', 'habitablePlanets', 'blackHoles',
    'neutronStars', 'nebulae', 'clusters', 'supernovae']) merged[key] = Math.round(a[key] + b[key]);
  merged.galaxyMassSuns = a.galaxyMassSuns + b.galaxyMassSuns;
  merged.bhMassSuns = a.bhMassSuns + b.bhMassSuns;
  merged.avgStellarAgeYr = (a.avgStellarAgeYr * a.totalStars + b.avgStellarAgeYr * b.totalStars)
    / Math.max(a.totalStars + b.totalStars, 1);
  merged.gasSupply = clamp(a.gasSupply + b.gasSupply * 0.5, 0.02, 1);
  return merged;
}
