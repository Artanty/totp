import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = {
  'favicon-16x16.png': 16,
  'favicon-32x32.png': 32,
  'apple-touch-icon.png': 180,
  'android-chrome-192x192.png': 192,
  'android-chrome-512x512.png': 512,
};

const ICO_SIZES = [16, 32, 48];

const MANIFEST = {
  name: '',
  short_name: '',
  icons: [
    { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: '#ffffff',
  background_color: '#ffffff',
  display: 'standalone',
};

function extractSvgFromTs(source) {
  // Strategy 1: direct string export — export const x = '<svg...' or `<svg...`
  const direct = source.match(
    /(?:export\s+(?:const|let|var|default)\s+\w+\s*=\s*(?:`([^`]*<svg[^`]*)`|'([^']*<svg[^']*)'|"([^"]*<svg[^"]*)"))/s
  );
  if (direct) return direct[1] ?? direct[2] ?? direct[3];

  // Strategy 2: data URI — export const x = 'data:image/svg+xml;utf8,...'
  const dataUri = source.match(
    /(?:export\s+(?:const|let|var|default)\s+\w+\s*=\s*)(?:'([^']*data:image\/svg\+xml[^']*)'|"([^"]*data:image\/svg\+xml[^"]*)")/s
  );
  if (dataUri) {
    const uri = dataUri[1] ?? dataUri[2];
    const encoded = uri.replace(/^data:image\/svg\+xml;utf8,/, '');
    return decodeURIComponent(encoded);
  }

  // Strategy 3: function builds SVG — find the template + constants + default palette
  // Extract string constants (LOGO_PATH, LOGO_BORDER, etc.)
  const constants = {};
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*'([^']*)';/g)) {
    constants[m[1]] = m[2];
  }

  // Extract default palette from LOGO_PALETTES array
  const palettesMatch = source.match(/LOGO_PALETTES[^=]*=\s*\[([\s\S]*?)\]/);
  let paletteStart = '#4DD0FF';
  let paletteEnd = '#3B5BFF';
  if (palettesMatch) {
    const first = palettesMatch[1].match(/start:\s*'([^']+)'.*?end:\s*'([^']+)'/);
    if (first) {
      paletteStart = first[1];
      paletteEnd = first[2];
    }
  }

  // Find the SVG template (backtick string containing <svg)
  const svgTemplate = source.match(/const\s+svg\s*=\s*`([\s\S]*?)`;\s*\n\s*return/s);
  if (!svgTemplate) return null;

  let svg = svgTemplate[1];
  // Replace template variables with extracted constants / palette
  svg = svg.replace(/\$\{palette\.start\}/g, paletteStart);
  svg = svg.replace(/\$\{palette\.end\}/g, paletteEnd);
  svg = svg.replace(/\$\{LOGO_BORDER\}/g, constants['LOGO_BORDER'] ?? '#111827');
  svg = svg.replace(/\$\{LOGO_PATH\}/g, constants['LOGO_PATH'] ?? '');

  return svg;
}

async function main() {
  const webRoot = fileURLToPath(new URL('..', import.meta.url));
  const inputPath = process.argv[2]
    ? join(webRoot, process.argv[2])
    : join(webRoot, 'src', 'assets', 'logo.ts');
  const { default: sharp } = await import('sharp');
  const { default: toIco } = await import('to-ico');

  const raw = readFileSync(inputPath, 'utf-8');
  let svg;

  if (inputPath.endsWith('.svg')) {
    svg = raw;
  } else {
    svg = extractSvgFromTs(raw);
  }

  if (!svg || !svg.includes('<svg')) {
    console.error('Could not extract SVG from', inputPath);
    process.exit(1);
  }

  const svgBuffer = Buffer.from(svg);
  const publicDir = join(webRoot, 'public');
  const faviconDir = join(publicDir, 'favicon');

  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(faviconDir, { recursive: true });

  for (const [name, size] of Object.entries(SIZES)) {
    await sharp(svgBuffer).resize(size, size).png().toFile(join(faviconDir, name));
    console.log(`${name} (${size}x${size})`);
  }

  const icoBuffers = await Promise.all(
    ICO_SIZES.map((s) => sharp(svgBuffer).resize(s, s).png().toBuffer())
  );
  const ico = await toIco(icoBuffers);
  writeFileSync(join(faviconDir, 'favicon.ico'), ico);
  console.log('favicon.ico (16+32+48px)');

  writeFileSync(join(faviconDir, 'site.webmanifest'), JSON.stringify(MANIFEST));
  console.log('site.webmanifest');

  console.log(`\nDone → ${faviconDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
