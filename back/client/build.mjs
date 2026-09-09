import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { moduleFederationPlugin } from '@module-federation/esbuild/plugin';
import { federationConfig } from './federation.config.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, 'dist');

rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: [join(root, 'src', 'entry.ts')],
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  splitting: true,
  treeShaking: true,
  sourcemap: true,
  metafile: false,
  minify: true,
  plugins: [moduleFederationPlugin(federationConfig)],
});

rmSync(join(outdir, 'mf-manifest.json'), { force: true });

const remoteEntry = join(outdir, 'remoteEntry.js');
const code = readFileSync(remoteEntry, 'utf8');

const plugin = code.match(/var\s+([A-Za-z_$][\w$]*)=\(\)=>\(\{name:"import-maps-plugin"/);
if (plugin) {
  const ref = `plugins:[${plugin[1]}()]`;
  if (code.includes(ref)) {
    writeFileSync(remoteEntry, code.replace(ref, 'plugins:[]'));
    console.log('Import-maps plugin stripped from remoteEntry.js');
  }
}

console.log('Remote built into', outdir);