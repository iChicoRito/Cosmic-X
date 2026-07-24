// Renders Hugeicons icon data (framework-agnostic tuples) to inline SVG strings
// so the vanilla string-template markup of every page can drop icons in directly.
import {
  PlayIcon,
  PauseIcon,
  Backward01Icon,
  PreviousIcon,
  NextIcon,
  MinusSignIcon,
  PlusSignIcon,
  Refresh01Icon,
  Clock01Icon,
  ArrowLeft01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons';

// Hugeicons attrs are React-style camelCase (strokeWidth); SVG markup needs kebab-case.
const attrsToStr = attrs => Object.entries(attrs)
  .filter(([k]) => k !== 'key')
  .map(([k, v]) => `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"`)
  .join(' ');

// icon data is an array of [tag, attrs] tuples on a 24×24 grid
export const icon = (data, size = 18) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" `
  + `fill="none" aria-hidden="true" focusable="false">`
  + data.map(([tag, attrs]) => `<${tag} ${attrsToStr(attrs)} />`).join('')
  + `</svg>`;

export const ICONS = {
  play: icon(PlayIcon),
  pause: icon(PauseIcon),
  reverse: icon(Backward01Icon),
  prev: icon(PreviousIcon),
  next: icon(NextIcon),
  minus: icon(MinusSignIcon),
  plus: icon(PlusSignIcon),
  reset: icon(Refresh01Icon),
  now: icon(Clock01Icon),
  back: icon(ArrowLeft01Icon, 16),
  chevronDown: icon(ArrowDown01Icon),
  chevronUp: icon(ArrowUp01Icon),
};
