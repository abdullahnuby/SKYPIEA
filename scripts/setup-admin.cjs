'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const file = path.resolve(__dirname, '..', '.env');
const exists = fs.existsSync(file);
let content = exists ? fs.readFileSync(file, 'utf8') : 'BENO_LOCAL_DEMO=1\n';
const hasPassword = /^[ \t]*BENO_ADMIN_PASSWORD[ \t]*=[ \t]*\S.*$/m.test(content);
const hasSecret = /^[ \t]*BENO_ADMIN_SESSION_SECRET[ \t]*=[ \t]*\S.*$/m.test(content);
if (hasPassword && hasSecret) {
  console.log('.env already contains BENO_ADMIN_PASSWORD and BENO_ADMIN_SESSION_SECRET. No values were changed.');
  console.log('Open /admin after running npm start.');
  process.exit(0);
}
const password = hasPassword ? null : crypto.randomBytes(18).toString('base64url');
const secret = hasSecret ? null : crypto.randomBytes(48).toString('hex');
function putVar(name, value) {
  if (!value) return;
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}\\s*=.*$`, 'm');
  if (pattern.test(content)) content = content.replace(pattern, line);
  else content += `${content.endsWith('\n') || !content ? '' : '\n'}${line}\n`;
}
putVar('BENO_ADMIN_PASSWORD', password);
putVar('BENO_ADMIN_SESSION_SECRET', secret);
if (!/^BENO_LOCAL_DEMO\s*=/m.test(content)) content += 'BENO_LOCAL_DEMO=1\n';
fs.writeFileSync(file, content, { mode: 0o600 });
console.log('\nBENO admin credentials created in local .env (do not upload this file):');
if (password) console.log(`Password (save it now): ${password}`);
if (secret) console.log('Session secret: generated and stored in .env.');
if (!password) console.log('Existing admin password preserved.');
console.log('\nStart with: npm start');
console.log('Then open: http://127.0.0.1:4173/admin');
console.log('\nFor Vercel, set a separate BENO_ADMIN_PASSWORD and BENO_ADMIN_SESSION_SECRET in Project Settings → Environment Variables; do not reuse the local password.');
