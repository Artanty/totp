import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(backRoot, 'client', 'dist');
const destDir = join(backRoot, 'src', 'public', 'client');

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

for (const file of readdirSync(srcDir)) {
  const srcPath = join(srcDir, file);
  if (!statSync(srcPath).isFile() || !/\.(js|map)$/.test(file)) continue;
  cpSync(srcPath, join(destDir, file));
  console.log('synced', file);
}