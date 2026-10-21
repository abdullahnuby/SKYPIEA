'use strict';
// Import the January 2026 bulletin into the price book.
//
// Policy (deliberate):
//  - Every bulletin line is recorded with its own date/source.
//  - A bulletin value NEVER overwrites a newer active catalog price. It is
//    attached as a dated `bulletinQuotes[]` entry instead, so the agent can
//    answer "what did the January bulletin say?" without downgrading estimates.
//  - A missing catalog row is filled from the bulletin only when the unit is
//    compatible; otherwise it is attached with `unitMismatch:true` and left as a
//    visible gap.
//  - New bulletin-only rows are added with IDs J26-### and qtyMode "manual"
//    because no takeoff quantity rule exists for them yet.
//
// Usage: node scripts/import-bulletin-2026-01.cjs
// Output: .tmp-bulletin-export.json + BULLETIN-2026-01-IMPORT.json
// Then:   node scripts/publish-price-book.cjs .tmp-bulletin-export.json

const fs = require('node:fs');
const path = require('node:path');
const data = require('./bulletin-2026-01.cjs');
const engine = require('../engines/miyar-engine.js');
const rates = require('../engines/miyar-rates.js');

const root = path.resolve(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'api/_data/price-book.v1.json'), 'utf8'));
const prices = JSON.parse(JSON.stringify(base.prices));
const byId = new Map(prices.map(p => [p.id, p]));
const norm = value => engine.normalizeArabic(value);

const round2 = n => Math.round(Number(n) * 100) / 100;
const priceFields = price => {
  if (typeof price === 'number') return { low: price, avg: price, high: price };
  const low = price.low == null ? null : Number(price.low);
  const high = price.high == null ? null : Number(price.high);
  const avg = price.avg == null ? (low != null && high != null ? round2((low + high) / 2) : low != null ? low : high) : Number(price.avg);
  return { low, avg, high, note: price.note || '' };
};

const unitClass = value => {
  const s = String(value == null ? '' : value).toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  if (/م²|م2|مترمربع/.test(s)) return 'area';
  if (/م³|م3|مترمكعب/.test(s)) return 'volume';
  if (/لفة/.test(s)) return 'roll';
  if (/ألفطوبة|الفطوبة/.test(s)) return 'kbrick';
  if (/لوح/.test(s)) return 'board';
  if (/طن/.test(s)) return 'ton';
  if (/كجم|كيلو/.test(s)) return 'kg';
  if (/لتر/.test(s)) return 'liter';
  if (/شيكارة/.test(s)) return 'bag';
  if (/عبوة/.test(s)) return 'pack';
  if (/عدد|قطعة/.test(s)) return 'piece';
  if (/عود/.test(s)) return 'stick';
  if (/^(م|مط|متر|مترطولي|مترطول)$/.test(s)) return 'length';
  if (/مشروع/.test(s)) return 'project';
  return s || 'unknown';
};
const unitsCompatible = (a, b) => unitClass(a) === unitClass(b);

const aliasesFor = name => {
  const out = [];
  if (name.includes('بلاط')) out.push(name.replace(/بلاط/g, 'بالط'));
  if (name.includes('بيتومين')) out.push(name.replace(/بيتومين/g, 'بيتيومين'));
  if (name.includes('جبسية')) out.push(name.replace(/جبسية/g, 'حبسية'));
  if (/^مط /.test(name)) out.push(name.replace(/^مط /, 'بلاستيك '));
  if (/^نصف مط /.test(name)) out.push(name.replace(/^نصف مط /, 'نصف بلاستيك '));
  return [...new Set(out.filter(x => x && x !== name))];
};

const quoteFromRow = (row, section) => {
  const [name, unit, price, note, transport] = row;
  const fields = priceFields(price);
  const unitText = unit || 'غير مذكورة في النشرة';
  const tr = transport || section.transport || 'no';
  return {
    name,
    unit: unitText,
    unitMissing: !unit,
    low: fields.low,
    avg: fields.avg,
    high: fields.high,
    date: data.META.date,
    source: data.META.source,
    status: 'national',
    confidence: 'متوسطة',
    transport: tr,
    transportNote: tr === 'unknown'
      ? 'النشرة تذكر شمول الضريبة لكنها لا تذكر التوريد/التفريغ.'
      : 'السعر بدون نقل للموقع حسب النشرة.',
    taxIncluded: true,
    bulletin: data.META.id,
    note: note || fields.note || ''
  };
};

const quoteByName = new Map();
const bulletinRows = [];
for (const section of data.SECTIONS) {
  for (const row of section.rows) {
    const q = quoteFromRow(row, section);
    q.section = section.key;
    q.category = section.category;
    q.scope = section.scope;
    bulletinRows.push(q);
    quoteByName.set(q.name, q);
  }
}

const actions = [];
const addQuote = (target, quote) => {
  if (!Array.isArray(target.bulletinQuotes)) target.bulletinQuotes = [];
  const exists = target.bulletinQuotes.some(x =>
    x && x.bulletin === quote.bulletin && x.name === quote.name &&
    String(x.avg) === String(quote.avg) && x.date === quote.date
  );
  if (!exists) target.bulletinQuotes.push(quote);
};

const fillFromQuote = (target, quote) => {
  target.low = quote.low;
  target.avg = quote.avg;
  target.high = quote.high;
  target.date = quote.date;
  target.source = quote.source;
  target.status = 'national';
  target.confidence = quote.confidence || 'متوسطة';
  target.transport = quote.transport;
  target.transportNote = quote.transportNote || target.transportNote || '';
  target.taxIncluded = true;
  target.bulletin = quote.bulletin;
  target.bulletinName = quote.name;
  if (quote.note) target.note = [target.note, quote.note].filter(Boolean).join(' — ');
};

const attachOrFill = (target, quote, kind) => {
  addQuote(target, quote);
  const compatible = unitsCompatible(target.unit, quote.unit);
  if (!rates.hasUsablePrice(target) && compatible) {
    fillFromQuote(target, quote);
    actions.push({
      action: 'filled', kind, rowId: target.id, rowName: target.name,
      bulletinName: quote.name, bulletinPrice: quote.avg, unit: target.unit
    });
    return;
  }
  if (!rates.hasUsablePrice(target) && !compatible) {
    actions.push({
      action: 'unit-mismatch', kind, rowId: target.id, rowName: target.name,
      bulletinName: quote.name, bulletinPrice: quote.avg,
      catalogUnit: target.unit, quoteUnit: quote.unit,
      note: 'السعر لم يُفعّل لأن وحدة النشرة غير متوافقة مع وحدة البند.'
    });
    return;
  }
  const activeDate = String(target.date || '');
  if (activeDate && activeDate < data.META.date) {
    fillFromQuote(target, quote);
    actions.push({
      action: 'updated-older', kind, rowId: target.id, rowName: target.name,
      bulletinName: quote.name, bulletinPrice: quote.avg,
      previousDate: activeDate, unit: target.unit
    });
    return;
  }
  actions.push({
    action: 'kept-newer', kind, rowId: target.id, rowName: target.name,
    bulletinName: quote.name, bulletinPrice: quote.avg,
    activePrice: target.avg, activeDate: target.date || null, unit: target.unit,
    note: 'السعر النشط أحدث من نشرة يناير 2026؛ أُضيفت النشرة كاقتباس مرجعي فقط.'
  });
};

const byName = new Map();
for (const p of prices) {
  const k = norm(p.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(p);
}

let seq = 0;
for (const quote of bulletinRows) {
  const attachId = data.ATTACH[quote.name];
  if (attachId) {
    const target = byId.get(attachId);
    if (target) {
      attachOrFill(target, quote, 'attach');
      continue;
    }
    throw new Error(`ATTACH target not found: ${attachId} for ${quote.name}`);
  }
  const exact = byName.get(norm(quote.name));
  if (exact && exact.length) {
    attachOrFill(exact[0], quote, 'exact-name');
    continue;
  }
  seq += 1;
  const id = `J26-${String(seq).padStart(3, '0')}`;
  const aliases = aliasesFor(quote.name);
  const row = {
    id,
    name: quote.name,
    category: quote.category,
    unit: quote.unit,
    low: quote.low,
    avg: quote.avg,
    high: quote.high,
    date: quote.date,
    source: quote.source,
    status: 'national',
    confidence: quote.confidence,
    transport: quote.transport,
    transportNote: quote.transportNote,
    taxIncluded: true,
    bulletin: quote.bulletin,
    importBatch: data.META.id,
    note: quote.note || '',
    qtyMode: 'manual',
    factor: 0,
    calc: false,
    scope: quote.scope || 'finishing',
    packages: ['economic', 'semi', 'medium', 'luxury'],
    active: true
  };
  if (quote.unitMissing) {
    row.unitMissing = true;
    row.note = [row.note, 'الوحدة غير مذكورة في النشرة؛ لا تدخل الحساب حتى تأكيد الوحدة.'].filter(Boolean).join(' — ');
  }
  if (aliases.length) row.aliases = aliases;
  prices.push(row);
  byId.set(id, row);
  byName.set(norm(row.name), [row]);
  actions.push({
    action: 'added', kind: 'new-row', rowId: id, rowName: row.name,
    bulletinName: quote.name, bulletinPrice: quote.avg, unit: row.unit
  });
}

// Attach derived comparison quotes to generic catalog rows.
for (const [id, d] of Object.entries(data.DERIVED_QUOTES)) {
  const target = byId.get(id);
  if (!target) throw new Error(`DERIVED target not found: ${id}`);
  const quote = {
    name: d.name,
    unit: d.unit,
    low: d.low,
    avg: d.avg == null ? round2((d.low + d.high) / 2) : d.avg,
    high: d.high,
    date: data.META.date,
    source: `${data.META.source} — قيمة مرجعية مشتقة`,
    status: 'national',
    confidence: 'منخفضة',
    transport: 'no',
    transportNote: 'قيمة مرجعية للمقارنة؛ راجع السعر النشط قبل الشراء.',
    taxIncluded: true,
    bulletin: data.META.id,
    derived: true,
    note: d.note || ''
  };
  addQuote(target, quote);
  if (!rates.hasUsablePrice(target) && d.fill !== false && unitsCompatible(target.unit, quote.unit)) {
    fillFromQuote(target, quote);
    actions.push({
      action: 'filled-derived', kind: 'derived', rowId: id, rowName: target.name,
      bulletinName: d.name, bulletinPrice: quote.avg, unit: target.unit
    });
  } else {
    actions.push({
      action: 'derived-quote', kind: 'derived', rowId: id, rowName: target.name,
      bulletinName: d.name, bulletinPrice: quote.avg, activePrice: target.avg,
      activeDate: target.date || null, unit: target.unit,
      note: d.note || ''
    });
  }
}

// Fill genuinely missing rows that need a documented derivation (m² from a board).
for (const [id, d] of Object.entries(data.SPECIAL_FILLS)) {
  const target = byId.get(id);
  if (!target) throw new Error(`SPECIAL fill target not found: ${id}`);
  const quote = {
    name: d.name,
    unit: d.unit,
    low: d.low,
    avg: d.avg,
    high: d.high,
    date: data.META.date,
    source: `${data.META.source} — قيمة مشتقة`,
    status: 'national',
    confidence: 'منخفضة',
    transport: 'no',
    transportNote: 'قيمة مشتقة بتحويل وحدة؛ راجع الهالك قبل الاعتماد.',
    taxIncluded: true,
    bulletin: data.META.id,
    derived: true,
    note: d.note || ''
  };
  addQuote(target, quote);
  if (!rates.hasUsablePrice(target) && unitsCompatible(target.unit, quote.unit)) {
    fillFromQuote(target, quote);
    actions.push({
      action: 'filled-derived', kind: 'special-fill', rowId: id, rowName: target.name,
      bulletinName: d.name, bulletinPrice: quote.avg, unit: target.unit
    });
  } else {
    actions.push({
      action: 'derived-quote', kind: 'special-fill', rowId: id, rowName: target.name,
      bulletinName: d.name, bulletinPrice: quote.avg, activePrice: target.avg,
      activeDate: target.date || null, unit: target.unit, note: d.note || ''
    });
  }
}

// Attach paint options for lookup; do not pick one automatically.
for (const [id, names] of Object.entries(data.PAINT_ATTACH)) {
  const target = byId.get(id);
  if (!target) throw new Error(`PAINT target not found: ${id}`);
  for (const name of names) {
    const q = quoteByName.get(name);
    if (!q) throw new Error(`PAINT quote not found: ${name}`);
    const compatible = unitsCompatible(target.unit, q.unit);
    const quote = { ...q, option: true, unitMismatch: !compatible };
    addQuote(target, quote);
    actions.push({
      action: compatible ? 'attached-option' : 'unit-mismatch-option',
      kind: 'paint-option', rowId: id, rowName: target.name,
      bulletinName: q.name, bulletinPrice: q.avg,
      catalogUnit: target.unit, quoteUnit: q.unit,
      note: compatible
        ? 'خيار سعر متاح للاستعلام؛ لم يُفعّل تلقائيًا لوجود أكثر من منتج/جودة.'
        : 'وحدة النشرة (كجم) مختلفة عن وحدة البند (لتر)؛ لم يُفعّل السعر.'
    });
  }
}

const before = engine.auditCatalog(base.prices, base.settings);
const after = engine.auditCatalog(prices, base.settings);

const count = action => actions.filter(a => a.action === action).length;
const report = {
  generatedAt: new Date().toISOString(),
  bulletin: data.META,
  policy: {
    overwriteNewerPrices: false,
    fillMissingOnly: true,
    unitMismatchNotApplied: true
  },
  counts: {
    bulletinRows: bulletinRows.length,
    addedRows: count('added'),
    filledMissing: count('filled') + count('filled-derived'),
    keptNewer: count('kept-newer'),
    attachedOnly: count('kept-newer') + count('derived-quote') + count('attached-option') + count('unit-mismatch-option'),
    unitMismatch: count('unit-mismatch') + count('unit-mismatch-option'),
    unknownUnitRows: bulletinRows.filter(q => q.unitMissing).length,
    totalRowsBefore: base.prices.length,
    totalRowsAfter: prices.length
  },
  coverage: {
    before: { total: before.total, priced: before.priced, missing: before.missing, percent: before.total ? Math.round((before.priced / before.total) * 1000) / 10 : 0, stale: before.stale },
    after: { total: after.total, priced: after.priced, missing: after.missing, percent: after.total ? Math.round((after.priced / after.total) * 1000) / 10 : 0, stale: after.stale }
  },
  actions,
  keptNewer: actions.filter(a => a.action === 'kept-newer'),
  filled: actions.filter(a => a.action === 'filled' || a.action === 'filled-derived'),
  unitMismatch: actions.filter(a => a.action === 'unit-mismatch' || a.action === 'unit-mismatch-option'),
  unknownUnits: bulletinRows.filter(q => q.unitMissing).map(q => ({ name: q.name, price: q.avg, note: q.note })),
  anomalies: data.ANOMALIES
};

const exportDoc = {
  app: base.app,
  version: '2026-10-21',
  exportedAt: new Date().toISOString(),
  settings: base.settings,
  bulletins: [data.META],
  notes: [
    'الإصدار v2 يضيف نشرة يناير 2026 كاقتباسات مؤرخة، ويملأ البنود الناقصة فقط.',
    'الأسعار الأحدث من يناير 2026 لم تُستبدل؛ راجع bulletinQuotes للمقارنة بين السعر النشط وسعر النشرة.',
    'البنود ذات الوحدة غير المذكورة في النشرة لا تدخل الحساب حتى تأكيد الوحدة.',
    'الأسعار المؤرخة 2026-01-01 ستظهر كقديمة (أكثر من 90 يومًا) ويجب تأكيدها قبل الاعتماد.'
  ],
  prices
};

fs.writeFileSync(path.join(root, '.tmp-bulletin-export.json'), JSON.stringify(exportDoc, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'BULLETIN-2026-01-IMPORT.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Bulletin rows: ${report.counts.bulletinRows}`);
console.log(`Added: ${report.counts.addedRows} | filled missing: ${report.counts.filledMissing} | kept newer: ${report.counts.keptNewer} | unknown unit: ${report.counts.unknownUnitRows} | unit mismatch: ${report.counts.unitMismatch}`);
console.log(`Coverage: ${report.coverage.before.priced}/${report.coverage.before.total} (${report.coverage.before.percent}%) -> ${report.coverage.after.priced}/${report.coverage.after.total} (${report.coverage.after.percent}%)`);
console.log(`Stale priced rows: ${report.coverage.before.stale} -> ${report.coverage.after.stale}`);
console.log('Filled from bulletin:');
for (const a of report.filled) console.log(` - ${a.rowId} ${a.rowName}: ${a.bulletinPrice} (${a.unit})`);
console.log('Kept newer (bulletin quote attached only):');
for (const a of report.keptNewer.slice(0, 30)) console.log(` - ${a.rowId} ${a.rowName}: active ${a.activePrice} (${a.activeDate}) vs bulletin ${a.bulletinPrice}`);
if (report.keptNewer.length > 30) console.log(` ... and ${report.keptNewer.length - 30} more`);
console.log('Unknown-unit rows:');
for (const u of report.unknownUnits) console.log(` - ${u.name}: ${u.price}`);
console.log('Wrote .tmp-bulletin-export.json and BULLETIN-2026-01-IMPORT.json');
