export function paintRangeFill(el) {
  if (!el) return;
  const span = Number(el.max) - Number(el.min);
  const frac = span ? (Number(el.value) - Number(el.min)) / span : 0;
  el.style.setProperty('--fill', 'calc(7px + (100% - 14px) * ' + frac + ')');
}
