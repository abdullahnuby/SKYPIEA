'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'api', '_data')).filter(x => /^price-book\.v\d+\.json$/.test(x)).sort((a,b) => Number((b.match(/v(\d+)/)||[])[1]) - Number((a.match(/v(\d+)/)||[])[1]));
assert.ok(files[0], 'a price book must exist');
const book = JSON.parse(fs.readFileSync(path.join(root, 'api', '_data', files[0]), 'utf8'));
assert.equal(book.priceBookVersion, 'v8', 'the compact core catalogue must be the active price book');
assert.equal(book.prices.length, 201, 'the operational file contains only core records, not the long-tail bulletin import');
assert.equal(book.prices.filter(row => row.active !== false).length, 183, 'only core records are active by default');
assert.ok(!book.prices.some(row => /^J26-/.test(String(row.id || ''))), 'January bulletin variants must not pollute the active operational catalogue');
const extended = JSON.parse(fs.readFileSync(path.join(root, 'api', '_data', 'price-book-extended.v1.json'), 'utf8'));
assert.equal(extended.rows.length, 291, 'all 291 bulletin variants remain preserved in the extended archive');
assert.ok(extended.rows.every(row => row.active === false && row.searchable === false), 'extended bulletin rows are excluded from default matching');
const rows = new Map(book.prices.map(row => [row.id, row]));
assert.equal(rows.get('P005').unit, 'شيكارة');
assert.equal(rows.get('P006').unit, 'طن');
assert.equal(rows.get('P003').avg, 3685);
assert.equal(rows.get('P004').avg, 3990);
assert.equal(rows.get('P029').unit, 'ألف طوبة');
assert.equal(rows.get('P030').unit, 'ألف طوبة');
assert.equal(rows.get('P037').unit, 'نقطة');
assert.equal(rows.get('P037').avg, 95);
assert.equal(rows.get('P119').unit, 'مشروع شقة 100 م²');
assert.equal(rows.get('P119').avg, 12500);
assert.ok(rows.has('B26-003'), 'the documented per-m² electrical reference is represented as a separate row');
assert.deepEqual([rows.get('B26-003').low, rows.get('B26-003').avg, rows.get('B26-003').high], [100,125,150], 'the derived per-m² bridge must match its source range');
for (const id of ['P061','P062','P063','P064','P065','P066','P067','P132']) {
  assert.equal(rows.get(id).status, 'missing', `${id} remains open until matching source evidence exists`);
  assert.equal(rows.get(id).avg, null, `${id} must not contain a proxy price`);
}
for (const id of ['P162','P163','P164','P165','P166','P167','P168','P169','P170','P171']) { assert.equal(rows.get(id).status,'missing',`${id} stays open until an engineer enters a matching local quote`); assert.equal(rows.get(id).avg,null); }
for (const id of ['P162','P163','P164','P165','P166','P167','P168','P169','P170','P171']) assert.ok(rows.get(id).active !== false);
const ids = book.prices.map(row => row.id);
assert.equal(new Set(ids).size, ids.length, 'catalog IDs must be unique');
for (const row of book.prices) {
  if (row.active === false || row.status === 'missing') continue;
  assert.ok(Number(row.avg) > 0 && Number.isFinite(Number(row.avg)), `${row.id}: active priced rows have a positive avg`);
  assert.ok(row.unit && row.name && row.source, `${row.id}: priced rows require a name, unit and source`);
  if (row.low != null) assert.ok(Number(row.low) <= Number(row.avg), `${row.id}: low cannot exceed avg`);
  if (row.high != null) assert.ok(Number(row.avg) <= Number(row.high), `${row.id}: avg cannot exceed high`);
}
console.log(`Catalog quality tests passed: ${files[0]}, ${book.prices.length} rows, known unit regressions corrected, unsupported prices remain gaps.`);
