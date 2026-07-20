export function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

/* Horizontally seamless fbm for textures wrapped around a sphere: cross-fades
   the sample with one taken a full width to the left, so x=0 and x=W agree and
   no seam shows down the back of the planet. */
export function tileFbm(px, py, scale, seed, octaves, W) {
  const t = px / W;
  return fbm(px / scale, py / scale, seed, octaves) * (1 - t)
       + fbm((px - W) / scale, py / scale, seed, octaves) * t;
}

export function makeCanvas(w, h, documentRef = document) {
  const canvas = documentRef.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}
