'use strict';
const fs = require('node:fs');
const path = require('node:path');
const db = require('../api/_lib/db.cjs');

const root = path.resolve(__dirname, '..');

// Same lightweight loader used by the local server: .env.local wins over .env.
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

async function main() {
  if (!db.configured()) {
    console.error('DATABASE_URL is not set. Run `neon deploy` (or add it to .env.local) first.');
    process.exit(1);
  }
  const schema = fs.readFileSync(path.join(root, 'neon', 'schema.sql'), 'utf8');
  const executed = await db.runSqlFile(schema);
  const rows = await db.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name in
        ('leads','quotes','unmatched_messages','beno_lexicon','beno_rate_limits',
         'beno_price_book_state','beno_price_book_versions','beno_pricing_feedback')
      order by table_name`
  );
  const functions = await db.query(
    `select routine_name from information_schema.routines
      where routine_schema = 'public' and routine_name in
        ('beno_consume_rate_limit','beno_publish_price_book')
      order by routine_name`
  );
  console.log(`Applied neon/schema.sql (${executed} statements).`);
  console.log(`Tables: ${rows.map(r => r.table_name).join(', ')}`);
  console.log(`Functions: ${functions.map(r => r.routine_name).join(', ')}`);
}

main().catch(error => {
  console.error(`Schema apply failed: ${error.message}`);
  process.exit(1);
});
