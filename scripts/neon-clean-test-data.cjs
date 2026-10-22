'use strict';
const fs = require('node:fs');
const path = require('node:path');
const db = require('../api/_lib/db.cjs');

// Removes only the fixtures created by scripts/e2e-neon.cjs, so the database
// can stay clean after a verification run. Nothing else is touched.

const root = path.resolve(__dirname, '..');
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
    console.error('DATABASE_URL is not set. Nothing to clean.');
    process.exit(1);
  }
  const results = {};
  results.leads = (await db.query("delete from public.leads where name = 'اختبار نيون' returning id")).length;
  results.feedback = (await db.query("delete from public.beno_pricing_feedback where source = 'اختبار نيون' returning id")).length;
  results.lexicon = (await db.query("delete from public.beno_lexicon where value = 'مدينة اختبار نيون' returning id")).length;
  results.unmatched = (await db.query('delete from public.unmatched_messages returning id')).length;
  results.rateLimits = (await db.query('delete from public.beno_rate_limits returning bucket_key')).length;
  results.priceVersions = (await db.query('delete from public.beno_price_book_versions returning version')).length;
  // Drop the initialized state so the next request re-seeds from the committed
  // price-book file instead of a test publish.
  results.priceState = (await db.query("delete from public.beno_price_book_state where id = 'current' returning id")).length;
  console.log(`Removed E2E fixtures: ${JSON.stringify(results)}`);
}

main().catch(error => {
  console.error(`Cleanup failed: ${error.message}`);
  process.exit(1);
});
