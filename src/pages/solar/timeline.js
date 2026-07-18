export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const SIM_DAY_LIMIT = 36525;
export const TIME_SCALE_PRESETS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];

export function sessionStartMs(now = Date.now()) {
  return Math.min(
    J2000_MS + SIM_DAY_LIMIT * 86400000,
    Math.max(J2000_MS - SIM_DAY_LIMIT * 86400000, now),
  );
}

export function clampSimDays(days) {
  return Math.max(-SIM_DAY_LIMIT, Math.min(SIM_DAY_LIMIT, Number.isFinite(days) ? days : 0));
}

export function simDateFromDays(days) {
  return new Date(J2000_MS + clampSimDays(days) * 86400000);
}

export function simDaysFromDate(date) {
  const ms = date instanceof Date ? date.getTime() : Number(date);
  return clampSimDays((ms - J2000_MS) / 86400000);
}

export function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

export function formatUtcTime(date) {
  return date.toISOString().slice(11, 19) + ' UTC';
}

export function formatElapsedDays(days) {
  const sign = days < 0 ? '-' : '+';
  return sign + Math.abs(days).toFixed(2) + ' days';
}
