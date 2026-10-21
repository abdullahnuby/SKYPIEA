import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const output = join(root, 'dist');
// The BENO bundle is generated first by scripts/build.cjs from widget/src/.
const files = [
  'index.html', 'app.js', 'styles.css', 'favicon.svg', 'robots.txt', 'assets',
  'beno-chat.js', 'beno-chat.chunk.js', 'admin.html', 'admin.js', 'admin.css'
];

if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of files) {
  const source = join(root, file);
  if (!existsSync(source)) throw new Error(`Required deployment file is missing: ${file}`);
  cpSync(source, join(output, file), { recursive: true });
}

console.log(`SKYPIEA + Beno landing page and pricing assistant prepared in ${output}`);
