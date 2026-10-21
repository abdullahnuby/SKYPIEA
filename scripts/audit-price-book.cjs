'use strict';
const fs = require('node:fs');
const path = require('node:path');
const rates = require('../engines/miyar-rates.js');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'api', '_data');
const files = fs.readdirSync(dataDir)
  .map(name => ({ name, match: name.match(/^price-book\.v(\d+)\.json$/) }))
  .filter(x => x.match)
  .sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
if (!files.length) throw new Error('No price-book.vN.json catalog files were found.');
const file = path.join(dataDir, files[0].name);
const book = JSON.parse(fs.readFileSync(file, 'utf8'));
const extendedPath = path.join(dataDir, 'price-book-extended.v1.json');
const extendedDoc = fs.existsSync(extendedPath) ? JSON.parse(fs.readFileSync(extendedPath, 'utf8')) : { rows: [] };
const extendedRows = Array.isArray(extendedDoc.rows) ? extendedDoc.rows : [];
if (!Array.isArray(book.prices)) throw new Error(`${files[0].name} must contain prices[].`);
const active = book.prices.filter(p => p.active !== false);
const priced = active.filter(rates.hasUsablePrice);
const missing = active.filter(p => p.status === 'missing' || !rates.hasUsablePrice(p));
const now = Date.now();
const staleDays = Math.max(1, Number(book.settings?.staleDays || 90));
const ageDays = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const ts = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ts) ? Math.floor((now - ts) / 86400000) : null;
};
const counts = list => list.reduce((out, row) => { const k = String(row.status || 'missing'); out[k] = (out[k] || 0) + 1; return out; }, {});
const issues = [];
const ids = new Set();
for (const [index, row] of book.prices.entries()) {
  const label = `${row.id || `row-${index + 1}`} (${row.name || 'unnamed'})`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) { issues.push(`${label}: row must be an object`); continue; }
  if (!row.id || typeof row.id !== 'string') issues.push(`${label}: missing id`);
  if (ids.has(row.id)) issues.push(`${label}: duplicate id`);
  ids.add(row.id);
  if (!String(row.name || '').trim()) issues.push(`${label}: missing name`);
  if (!String(row.unit || '').trim()) issues.push(`${label}: missing unit`);
  if (row.status === 'missing') {
    if (row.avg != null || row.low != null || row.high != null) issues.push(`${label}: status=missing but one or more price fields are populated`);
    continue;
  }
  if (row.active !== false) {
    const avg = row.avg == null || row.avg === '' ? null : Number(row.avg);
    if (!(Number.isFinite(avg) && avg > 0)) issues.push(`${label}: active priced row has no positive numeric avg`);
    if (!String(row.source || '').trim()) issues.push(`${label}: active priced row has no source`);
  }
  for (const k of ['low','avg','high']) {
    if (row[k] != null && row[k] !== '' && !(Number.isFinite(Number(row[k])) && Number(row[k]) > 0)) issues.push(`${label}: ${k} must be positive or empty`);
  }
  if (row.low != null && row.avg != null && Number(row.low) > Number(row.avg)) issues.push(`${label}: low > avg`);
  if (row.avg != null && row.high != null && Number(row.avg) > Number(row.high)) issues.push(`${label}: avg > high`);
  if (row.low != null && row.high != null && Number(row.low) > Number(row.high)) issues.push(`${label}: low > high`);
}

// Guard against known high-impact unit/source regressions seen in v4.
const byId = new Map(book.prices.map(row => [row.id, row]));
const mustMatch = (id, predicate, message) => { const row = byId.get(id); if (!row || !predicate(row)) issues.push(`${id}: ${message}`); };
mustMatch('P005', row => row.unit === 'شيكارة' && Number(row.avg) > 0, 'a 50 kg cement bag must be priced per bag, not by volume');
mustMatch('P006', row => row.unit === 'طن' && Number(row.avg) > 10000, 'steel rebar must be priced per tonne, not by volume');
mustMatch('P003', row => row.unit === 'طن' && Number(row.avg) < 10000, 'cement tonne price appears to have an order-of-magnitude error');
mustMatch('P004', row => row.unit === 'طن' && Number(row.avg) < 10000, 'general cement tonne price appears to have an order-of-magnitude error');
mustMatch('P029', row => row.unit === 'ألف طوبة' && Number(row.avg) > 100, 'brick unit must match the product name');
mustMatch('P030', row => row.unit === 'ألف طوبة' && Number(row.avg) > 100, 'cement-brick unit must match the product name');
mustMatch('P037', row => row.unit === 'نقطة' && Number(row.avg) === 95 && row.status === 'local', 'October local electrical labor rate must remain per point');
mustMatch('P119', row => row.unit === 'مشروع شقة 100 م²' && Number(row.avg) === 12500, 'preserve the source apartment lump-sum row separately from its derived per-m² bridge');
mustMatch('B26-003', row => row.unit === 'م²' && Number(row.low) === 100 && Number(row.avg) === 125 && Number(row.high) === 150, 'the published per-m² bridge must match the documented 100–150 EGP/m² derivation');
for (const id of ['P061','P062','P063','P064','P065','P066','P067','P132']) {
  mustMatch(id, row => row.status === 'missing' && row.avg == null, 'keep the unsupported price gap open until matching evidence exists');
}

const stale = priced.filter(row => { const age = ageDays(row.date); return age == null || age > staleDays; });
const byStatus = counts(active);
const report = {
  generatedAt: new Date().toISOString(),
  file: path.relative(root, file).replace(/\\/g, '/'),
  version: book.priceBookVersion || book.version || files[0].name,
  rows: book.prices.length,
  extendedCatalog: { file: path.relative(root, extendedPath).replace(/\\/g, '/'), rows: extendedRows.length, rowsExcludedFromDefaultSearch: extendedRows.filter(row => row.active === false && row.searchable === false).length },
  active: active.length,
  priced: priced.length,
  missingOrUnpriced: active.length - priced.length,
  numericPriceCoveragePercent: active.length ? Math.round(priced.length / active.length * 1000) / 10 : 0,
  statusCounts: byStatus,
  staleDaysThreshold: staleDays,
  staleOrUndatedPricedRows: stale.length,
  freshDatedPricedRows: priced.length - stale.length,
  localPricedRows: active.filter(row => row.status === 'local' && rates.hasUsablePrice(row)).length,
  nationalAlternativeRows: active.filter(row => row.status === 'national' && rates.hasUsablePrice(row)).length,
  estimatedRows: active.filter(row => row.status === 'estimate' && rates.hasUsablePrice(row)).length,
  transportUnknownRows: active.filter(row => row.transport === 'unknown' && rates.hasUsablePrice(row)).length,
  openGapIds: missing.map(row => row.id),
  integrityIssues: issues,
  interpretation: 'Numeric price coverage counts active rows with a positive average only. It does not mean current, local, supplier-verified, transport-inclusive, quantity-complete, or approved for construction.'
};
if (process.argv.includes('--check')) {
  if (issues.length) {
    process.stderr.write(`Catalog integrity check failed with ${issues.length} issue(s):\n${issues.map(x => `- ${x}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    console.log(`Catalog integrity check passed: ${report.version}; ${report.active} active core rows; ${report.priced}/${report.active} numerically priced (${report.numericPriceCoveragePercent}%); ${report.staleOrUndatedPricedRows} stale/undated core prices; ${missing.length} open price gaps; ${report.extendedCatalog.rowsExcludedFromDefaultSearch} extended rows excluded from default search.`);
  }
} else {
  fs.writeFileSync(path.join(root, 'PRICE-BOOK-QUALITY-REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
