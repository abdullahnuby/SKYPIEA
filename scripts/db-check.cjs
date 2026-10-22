'use strict';
const fs = require('node:fs');
const path = require('node:path');
const db = require('../api/_lib/db.cjs');

const root = path.resolve(__dirname, '..');

for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const TABLES = [
  'leads',
  'quotes',
  'unmatched_messages',
  'beno_lexicon',
  'beno_rate_limits',
  'beno_price_book_state',
  'beno_price_book_versions',
  'beno_pricing_feedback'
];

async function main() {
  if (!db.configured()) {
    console.error('DATABASE_URL is not set. Run `neon deploy` first.');
    process.exit(1);
  }
  const info = await db.one('select current_database() as database, version() as version');
  console.log(`Neon Postgres: ${info.database} — ${String(info.version).split(',')[0]}`);

  let missing = 0;
  for (const table of TABLES) {
    try {
      const row = await db.one(`select count(*)::int as n from public.${table}`);
      console.log(`  ${table}: ${row.n} row(s)`);
    } catch (error) {
      missing++;
      console.log(`  ${table}: MISSING (${error.message.split('\n')[0]})`);
    }
  }
  const functions = await db.query(
    `select routine_name from information_schema.routines
      where routine_schema = 'public'
        and routine_name in ('beno_consume_rate_limit','beno_publish_price_book')
      order by routine_name`
  );
  for (const row of functions) console.log(`  function ${row.routine_name}(): present`);
  try {
    await db.query('select public.beno_consume_rate_limit($1::text,$2::text,$3::int,$4::int)', ['0'.repeat(64), 'tool', 1, 60]);
    console.log('  beno_consume_rate_limit(): executed');
  } catch (error) {
    missing++;
    console.log(`  beno_consume_rate_limit(): FAILED (${error.message.split('\n')[0]})`);
  }
  if (functions.length < 2) missing++;
  console.log(missing ? `\n${missing} problem(s) found.` : '\nAll Neon objects are present and reachable.');
  process.exit(missing ? 1 : 0);
}

main().catch(error => {
  console.error(`Neon check failed: ${error.message}`);
  process.exit(1);
});
