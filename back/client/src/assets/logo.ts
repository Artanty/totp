export type LogoPalette = { start: string; end: string };

export const LOGO_PALETTES: LogoPalette[] = [
  { start: '#4DD0FF', end: '#3B5BFF' },
  { start: '#A855F7', end: '#EC4899' },
  { start: '#22C55E', end: '#06B6D4' },
  { start: '#3B82F6', end: '#3B82F6' },
];

const LOGO_BORDER = '#111827';

const LOGO_PATH =
  'M 27 28 H 73 C 77 28 80 31 80 35 C 80 39 77 42 73 42 H 57 V 68 C 57 72 54 75 50 75 C 46 75 43 72 43 68 V 42 H 27 C 23 42 20 39 20 35 C 20 31 23 28 27 28 Z';

export function buildDefaultLogo(palette: LogoPalette = randomPalette()): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<defs>
<linearGradient id="t-gradient" x1="20" y1="30" x2="80" y2="70" gradientUnits="userSpaceOnUse">
<stop offset="0%" stop-color="${palette.start}"/>
<stop offset="100%" stop-color="${palette.end}"/>
</linearGradient>
</defs>
<rect x="4" y="4" width="92" height="92" rx="24" fill="none" stroke="${LOGO_BORDER}" stroke-width="5"/>
<path d="${LOGO_PATH}" fill="url(#t-gradient)"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function randomPalette(): LogoPalette {
  return LOGO_PALETTES[Math.floor(Math.random() * LOGO_PALETTES.length)];
}

export const DEFAULT_LOGO = buildDefaultLogo();