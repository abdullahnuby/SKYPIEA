'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const pkg = JSON.parse(read('package.json'));
const vercel = JSON.parse(read('vercel.json'));

assert.equal(pkg.name, 'skypiea-beno-platform');
assert.equal(pkg.type, 'commonjs', 'BENO engine exports must remain CommonJS-compatible');
assert.match(pkg.scripts.build, /scripts\/build\.cjs.*build\.mjs/);
assert.match(read('index.html'), /<script src="\/beno-chat\.js" defer[^>]*data-brand="Beno"/);
assert.match(read('index.html'), /<script src="\.\/app\.js" defer><\/script>/, 'existing SKYPIEA page entry point should remain');
for (const file of ['dist/index.html','dist/app.js','dist/styles.css','dist/beno-chat.js','dist/beno-chat.chunk.js','dist/admin.html','dist/admin.js','dist/admin.css','api/tool.js','api/lead.js','api/admin/session.js','api/admin/price-book.js','api/admin/publish.js','engines/miyar-engine.js','api/_data/price-book.v1.json','supabase/migrations/20261021_admin_price-control.sql']) {
  assert.ok(exists(file), `Unified project is missing ${file}`);
}
assert.equal(vercel.outputDirectory, 'dist');
assert.equal(vercel.buildCommand, 'npm run build');
assert.equal(vercel.functions['api/*.js'].maxDuration, 15);
assert.equal(vercel.functions['api/admin/*.js'].maxDuration, 15);
assert.ok(vercel.routes.some(r => r.src === '/admin/?$' && r.dest === '/admin.html'), 'admin route should be exposed through the same deployment');
assert.ok(vercel.routes.some(r => r.src === '/api/_data/.*' && r.status === 404), 'price-book must not be served as a public static file');
assert.ok(!exists('dist/api/_data/price-book.v1.json'), 'price-book must not enter static output');
assert.ok(exists('widget/src/loader.js') && exists('scripts/build.cjs'), 'Vercel build must retain BENO build sources');
assert.doesNotMatch(read('.vercelignore'), /^(widget\/src|scripts)\/?$/m, 'build source/scripts must not be ignored');
assert.ok(read('admin.html').includes('/api/admin/price-book') === false, 'HTML shell should not embed API data or secrets');
console.log('Unified-project integration passed: unified build, BENO admin assets/APIs, same-origin route, and private price book guard.');
