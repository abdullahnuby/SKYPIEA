'use strict';
// Import the user-supplied labor-only rates (2026-10-21) into the price book.
//
// Policy:
//  - Every supplied item is stored with its exact unit and date.
//  - A supplied rate fills an existing row only when the unit is directly
//    compatible and the row is missing, or when the supplied date is newer and
//    the user explicitly asked for labor rates (P037/P056). Older active values
//    are preserved in `previousPrice`.
//  - Element-specific concrete rates are stored as separate rows; the generic
//    `مصنعية صب خرسانة` row is deliberately left open instead of inventing an
//    average.
//  - The single masonry row used by the frozen takeoff gets a derived 35–65/م²
//    bridge, clearly marked, because it serves both 12 cm and 25 cm walls.
//  - Rows with incompatible units (P126/P127 project lump sums) only receive a
//    comparison quote; their active prices are not overwritten.
//
// Usage: node scripts/import-labor-rates-2026-10.cjs
// Output: .tmp-labor-export.json + LABOR-RATES-2026-10-IMPORT.json
// Then:   node scripts/publish-price-book.cjs .tmp-labor-export.json

const fs = require('node:fs');
const path = require('node:path');
const data = require('./labor-rates-2026-10.cjs');
const engine = require('../engines/miyar-engine.js');
const rates = require('../engines/miyar-rates.js');

const root = path.resolve(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'api/_data/price-book.v2.json'), 'utf8'));
const prices = JSON.parse(JSON.stringify(base.prices));
const settings = JSON.parse(JSON.stringify(base.settings || {}));
const byId = new Map(prices.map(p => [p.id, p]));
const round2 = n => Math.round(Number(n) * 100) / 100;
const norm = value => engine.normalizeArabic(value);

const unitClass = value => {
  const s = String(value == null ? '' : value).toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  if (/م²|م2|مترمربع/.test(s)) return 'area';
  if (/م³|م3|مترمكعب/.test(s)) return 'volume';
  if (/^م\.?ط$|مترطول|مترطولي/.test(s)) return 'length';
  if (/نقطة|نقطه/.test(s)) return 'point';
  if (/قطعة|قطعه|عدد/.test(s)) return 'piece';
  if (/باب/.test(s)) return 'door';
  if (/حلقة|حلقه/.test(s)) return 'frame';
  if (/ألفطوبة|الفطوبة|1000طوبة|1,000طوبة/.test(s)) return 'kbrick';
  if (/مشروع/.test(s)) return 'project';
  if (/طن/.test(s)) return 'ton';
  if (/كجم|كيلو/.test(s)) return 'kg';
  return s || 'unknown';
};
const unitsCompatible = (a, b) => unitClass(a) === unitClass(b);

const allRows = [];
for (const section of data.SECTIONS) {
  for (const row of section.rows) allRows.push({ ...row, section });
}

const quoteFromRow = (row, section) => {
  const low = Number(row.low);
  const high = Number(row.high);
  const avg = row.avg == null ? round2((low + high) / 2) : Number(row.avg);
  return {
    name: row.name,
    unit: row.unit,
    low,
    avg,
    high,
    date: data.META.date,
    source: data.META.source,
    status: 'local',
    confidence: row.confidence || 'متوسطة',
    transport: 'not-applicable',
    transportNote: 'مصنعية فقط؛ لا تشمل خامات أو نقلًا.',
    taxIncluded: false,
    taxNote: 'لم يحدد المستخدم شمول الضريبة.',
    laborOnly: true,
    batch: data.META.id,
    laborItem: row.name,
    section: section.key,
    category: section.category,
    scope: section.scope,
    note: row.note || ''
  };
};

const addLaborQuote = (target, quote) => {
  if (!Array.isArray(target.laborQuotes)) target.laborQuotes = [];
  const exists = target.laborQuotes.some(x => x && x.batch === quote.batch && x.name === quote.name &&
    String(x.avg) === String(quote.avg) && x.date === quote.date && String(x.unit) === String(quote.unit));
  if (!exists) target.laborQuotes.push(quote);
};

const mergeAliases = (target, aliases) => {
  if (!Array.isArray(aliases) || !aliases.length) return;
  const current = Array.isArray(target.aliases) ? target.aliases.slice() : [];
  for (const alias of aliases) if (alias && alias !== target.name && !current.includes(alias)) current.push(alias);
  if (current.length) target.aliases = current;
};

const savePrevious = (target, reason) => {
  if (target.avg == null && target.low == null && target.high == null) return;
  target.previousPrice = {
    low: target.low == null ? null : Number(target.low),
    avg: target.avg == null ? null : Number(target.avg),
    high: target.high == null ? null : Number(target.high),
    date: target.date || null,
    source: target.source || '',
    status: target.status || 'missing',
    note: reason
  };
};

const fillFromQuote = (target, quote, opts = {}) => {
  if (opts.preservePrevious) savePrevious(target, opts.previousNote || 'السعر السابق قبل التحديث من قائمة المصنعيات المحلية.');
  target.low = quote.low;
  target.avg = quote.avg;
  target.high = quote.high;
  target.date = quote.date;
  target.source = opts.source || quote.source;
  target.status = 'local';
  target.confidence = opts.confidence || quote.confidence || 'متوسطة';
  target.transport = quote.transport || 'not-applicable';
  target.transportNote = quote.transportNote || target.transportNote || '';
  target.taxIncluded = false;
  target.taxNote = quote.taxNote;
  target.laborOnly = true;
  target.laborBatch = data.META.id;
  target.laborItem = quote.name;
  if (opts.derived) target.derived = true;
  if (quote.note) {
    const current = String(target.note || '');
    if (!current.includes(quote.note)) target.note = [current, quote.note].filter(Boolean).join(' — ');
  }
};

const actions = [];
const add = (action, extra) => actions.push({ action, ...extra });

// ---------------------------------------------------------------------------
// 1) Direct fills to existing rows.
// ---------------------------------------------------------------------------
const fillsByName = new Map(data.FILLS.map(f => [f.itemName, f]));
for (const fill of data.FILLS) {
  const target = byId.get(fill.rowId);
  if (!target) throw new Error(`FILL target not found: ${fill.rowId}`);
  const row = allRows.find(r => r.name === fill.itemName);
  if (!row) throw new Error(`FILL item not found: ${fill.itemName}`);
  const quote = quoteFromRow(row, row.section);
  const compatible = unitsCompatible(target.unit, quote.unit);
  addLaborQuote(target, quote);
  mergeAliases(target, fill.aliases);
  if (!compatible) {
    add('unit-mismatch', {
      kind: 'fill', rowId: target.id, rowName: target.name,
      laborName: quote.name, laborPrice: quote.avg,
      catalogUnit: target.unit, laborUnit: quote.unit,
      note: 'السعر لم يُفعّل لأن وحدة قائمة المصنعيات غير متوافقة مع وحدة البند.'
    });
    continue;
  }
  if (!rates.hasUsablePrice(target)) {
    fillFromQuote(target, quote, { source: data.META.source, confidence: quote.confidence });
    add('filled', {
      kind: 'fill', rowId: target.id, rowName: target.name,
      laborName: quote.name, laborPrice: quote.avg, laborUnit: quote.unit,
      note: fill.note
    });
    continue;
  }
  if (fill.kind === 'update-active' && String(target.date || '') <= data.META.date) {
    fillFromQuote(target, quote, {
      preservePrevious: true,
      source: data.META.source,
      confidence: quote.confidence,
      previousNote: `السعر السابق (${target.status}) قبل تحديث مصنعية ${quote.name} من قائمة 2026-10-21.`
    });
    add('updated-active', {
      kind: 'fill', rowId: target.id, rowName: target.name,
      laborName: quote.name, laborPrice: quote.avg, laborUnit: quote.unit,
      previousPrice: target.previousPrice ? target.previousPrice.avg : null,
      previousDate: target.previousPrice ? target.previousPrice.date : null,
      note: fill.note
    });
    continue;
  }
  add('kept-active', {
    kind: 'fill', rowId: target.id, rowName: target.name,
    laborName: quote.name, laborPrice: quote.avg, laborUnit: quote.unit,
    activePrice: target.avg, activeDate: target.date || null,
    note: 'السعر النشط أحدث من قائمة المصنعيات؛ أُضيفت القائمة كاقتباس مرجعي فقط.'
  });
}

// ---------------------------------------------------------------------------
// 2) Derived bridge for the single masonry takeoff row (P130).
// ---------------------------------------------------------------------------
for (const d of data.DERIVED_FILLS) {
  const target = byId.get(d.rowId);
  if (!target) throw new Error(`DERIVED target not found: ${d.rowId}`);
  const quote = {
    name: d.name,
    unit: d.unit,
    low: d.low,
    avg: d.avg,
    high: d.high,
    date: data.META.date,
    source: `${data.META.source} — قيمة مشتقة`,
    status: 'local',
    confidence: 'ضعيفة',
    transport: 'not-applicable',
    transportNote: 'مصنعية فقط؛ القيمة مشتقة من سعرين بوحدتين مختلفتين.',
    taxIncluded: false,
    taxNote: 'لم يحدد المستخدم شمول الضريبة.',
    laborOnly: true,
    batch: data.META.id,
    laborItem: d.name,
    derived: true,
    sourceItems: d.sourceItems,
    category: 'المصنعيات والعمالة',
    scope: 'finishing',
    note: d.note
  };
  addLaborQuote(target, quote);
  mergeAliases(target, d.aliases);
  const compatible = unitsCompatible(target.unit, quote.unit);
  if (!compatible) {
    add('unit-mismatch', {
      kind: 'derived', rowId: target.id, rowName: target.name,
      laborName: quote.name, laborPrice: quote.avg,
      catalogUnit: target.unit, laborUnit: quote.unit,
      note: 'القيمة المشتقة لم تُفعّل بسبب اختلاف الوحدة.'
    });
    continue;
  }
  if (!rates.hasUsablePrice(target)) {
    fillFromQuote(target, quote, { source: quote.source, confidence: 'ضعيفة', derived: true });
    add('filled-derived', {
      kind: 'derived', rowId: target.id, rowName: target.name,
      laborName: quote.name, laborPrice: quote.avg, laborUnit: quote.unit,
      note: d.note
    });
  } else {
    add('derived-quote', {
      kind: 'derived', rowId: target.id, rowName: target.name,
      laborName: quote.name, laborPrice: quote.avg,
      activePrice: target.avg, activeDate: target.date || null,
      note: d.note
    });
  }
}

// ---------------------------------------------------------------------------
// 3) New labor rows. The special "مصنعية رخام" row uses the exact frozen
//    takeoff candidate name, so it is added once and not duplicated.
// ---------------------------------------------------------------------------
const representedBySpecial = new Set(['تركيب رخام أرضيات أو درج']);
const existingLaborIds = prices.map(p => p.id).filter(id => /^L26-\d+$/.test(id));
let laborSeq = existingLaborIds.reduce((max, id) => Math.max(max, Number(id.slice(4))), 0);
const newRows = [];

const pushNewRow = (row, section) => {
  laborSeq += 1;
  const id = `L26-${String(laborSeq).padStart(3, '0')}`;
  const quote = quoteFromRow(row, section);
  const newRow = {
    id,
    name: quote.name,
    category: section.category,
    unit: quote.unit,
    low: quote.low,
    avg: quote.avg,
    high: quote.high,
    date: quote.date,
    source: quote.source,
    status: 'local',
    confidence: quote.confidence,
    transport: quote.transport,
    transportNote: quote.transportNote,
    taxIncluded: false,
    taxNote: quote.taxNote,
    laborOnly: true,
    laborBatch: data.META.id,
    laborItem: quote.name,
    importBatch: data.META.id,
    note: quote.note || '',
    qtyMode: 'manual',
    factor: 0,
    calc: false,
    scope: section.scope,
    packages: ['economic', 'semi', 'medium', 'luxury'],
    active: true
  };
  if (Array.isArray(row.aliases) && row.aliases.length) newRow.aliases = row.aliases.slice();
  prices.push(newRow);
  byId.set(id, newRow);
  newRows.push(newRow);
  add('added', {
    kind: 'new-row', rowId: id, rowName: newRow.name,
    laborName: quote.name, laborPrice: quote.avg, laborUnit: quote.unit,
    scope: section.scope, note: quote.note || ''
  });
  return newRow;
};

for (const section of data.SECTIONS) {
  for (const row of section.rows) {
    if (fillsByName.has(row.name)) continue;
    if (representedBySpecial.has(row.name)) continue;
    pushNewRow(row, section);
  }
}
for (const row of data.SPECIAL_NEW) {
  pushNewRow(row, data.SECTIONS.find(s => s.key === 'finishing'));
}

// ---------------------------------------------------------------------------
// 4) Comparison quotes for incompatible lump-sum plumbing rows.
// ---------------------------------------------------------------------------
const comparisonQuotes = [];
for (const [id, c] of Object.entries(data.COMPARISONS)) {
  const target = byId.get(id);
  if (!target) throw new Error(`COMPARISON target not found: ${id}`);
  const row = allRows.find(r => r.name === c.itemName);
  if (!row) throw new Error(`COMPARISON item not found: ${c.itemName}`);
  const quote = { ...quoteFromRow(row, row.section), comparison: true, unitMismatch: true, note: c.note };
  addLaborQuote(target, quote);
  comparisonQuotes.push({ rowId: id, rowName: target.name, laborName: quote.name, laborLow: quote.low, laborPrice: quote.avg, laborHigh: quote.high, laborUnit: quote.unit, activePrice: target.avg, activeUnit: target.unit, note: c.note });
  add('comparison-only', {
    kind: 'comparison', rowId: id, rowName: target.name,
    laborName: quote.name, laborPrice: quote.avg, laborUnit: quote.unit,
    catalogUnit: target.unit, activePrice: target.avg,
    note: c.note
  });
}

// ---------------------------------------------------------------------------
// 5) Record factors and source metadata in settings.
// ---------------------------------------------------------------------------
settings.laborRateSource = data.META.source;
settings.laborRateDate = data.META.date;
settings.laborRateScope = data.META.scope;
settings.laborRateNote = data.META.note;
settings.laborFactors = data.FACTORS;
settings.laborFactorsNote = data.META.factorsNote;

// ---------------------------------------------------------------------------
// 6) Audit and report.
// ---------------------------------------------------------------------------
const before = engine.auditCatalog(base.prices, base.settings);
const after = engine.auditCatalog(prices, settings);

const count = action => actions.filter(a => a.action === action).length;
const mapping = [];
for (const section of data.SECTIONS) {
  for (const row of section.rows) {
    const fill = fillsByName.get(row.name);
    if (fill) {
      const target = byId.get(fill.rowId);
      mapping.push({
        item: row.name, unit: row.unit, low: row.low, high: row.high,
        mappedTo: fill.rowId, mappedRowName: target ? target.name : '',
        action: actions.find(a => a.rowId === fill.rowId && a.laborName === row.name)?.action || fill.kind
      });
      continue;
    }
    const created = newRows.find(r => r.name === row.name);
    if (created) {
      mapping.push({
        item: row.name, unit: row.unit, low: row.low, high: row.high,
        mappedTo: created.id, mappedRowName: created.name, action: 'added'
      });
    }
  }
}
for (const row of data.SPECIAL_NEW) {
  const created = newRows.find(r => r.name === row.name);
  mapping.push({
    item: 'تركيب رخام أرضيات أو درج', unit: row.unit, low: row.low, high: row.high,
    mappedTo: created ? created.id : '', mappedRowName: created ? created.name : '', action: 'added'
  });
}

// The labor import starts from the published v2 book and the v2 gap report.
// These are the pre-labor BOQ/takeoff numbers from that report, recorded here
// explicitly so a later re-run cannot accidentally label the post-labor report
// as the baseline.
const baseline = {
  bookVersion: 'v2',
  source: 'PRICE-GAPS-REPORT.json before the labor import',
  boq: {
    apartment: { coveragePercent: 32, priceGapCount: 17 },
    building: { coveragePercent: 31, priceGapCount: 18 }
  },
  takeoff: { priceCoverage: 49, priceGapCount: 38, quantityGapCount: 64 }
};

const unresolved = [
  {
    rowId: 'P093', rowName: 'مصنعية صب خرسانة', unit: 'م³',
    reason: 'الأسعار الموردة خاصة بالعنصر (قواعد 450–700، أعمدة 900–1,400، أسقف 550–1,000/م³) وتوجد مجموعة ثانية متعارضة (أساسات/أعمدة/أسقف 290–310). لا يوجد سعر م³ واحد صالح لكل العناصر.',
    options: ['إضافة بنود حصر/BOQ لكل عنصر', 'اعتماد متوسط مرجح بمعاملات عناصر محددة', 'استخدام نطاق القواعد 450–700 مع تحذير واضح']
  },
  {
    rowId: 'P041', rowName: 'مصنعية سباكة', unit: 'نقطة',
    reason: 'المورد قدّم سعرًا لكل م² (200–400) ولكل حمام/مطبخ (2,500–4,500)، وليس لكل نقطة. لا يوجد عدد نقاط لكل حمام في البيانات.',
    options: ['تزويد سعر النقطة', 'اعتماد عدد نقاط قياسي لكل حمام/مطبخ', 'استخدام سعر المقطوعية بدل سعر النقطة']
  },
  {
    rowId: 'P131', rowName: 'مصنعية تأسيس سباكة — نقطة', unit: 'نقطة',
    reason: 'نفس مشكلة P041: لا يوجد سعر نقطة صريح.',
    options: ['تزويد سعر النقطة', 'اعتماد عدد نقاط قياسي', 'استخدام سعر المقطوعية']
  },
  {
    rowId: 'P091', rowName: 'مصنعية نجارة مسلحة', unit: 'م²',
    reason: 'لم ترد مصنعية شدة/نجارة مسلحة في القائمة الموردة.',
    options: ['تزويد سعر الشدة', 'الاحتفاظ بها كفجوة']
  },
  {
    rowId: 'P092', rowName: 'مصنعية حدادة مسلحة', unit: 'طن',
    reason: 'لم ترد مصنعية حدادة/تسليح في القائمة الموردة.',
    options: ['تزويد سعر الطن', 'الاحتفاظ بها كفجوة']
  },
  {
    rowId: 'P145', rowName: 'مصنعية عزل مائي', unit: 'م²',
    reason: 'لم ترد مصنعية عزل مائي في القائمة الموردة.',
    options: ['تزويد سعر العزل حسب النظام والطبقات', 'الاحتفاظ بها كفجوة']
  },
  {
    rowId: 'P090', rowName: 'مصنعية دهانات', unit: 'م²',
    reason: 'تم تفعيل الدهان السادة 45–75/م². الدهان الديكوري 70–120/م² في صف منفصل، والدهان الخارجي قد يحتاج سقالات. المحرك يستخدم P090 للداخل والخارج معًا.',
    options: ['الاحتفاظ بالسعر السادة مع تحذير', 'استخدام 45–120 للبند العام', 'فصل الداخلي عن الخارجي في محرك الحصر (يتطلب تعديل المحرك المجمد)']
  },
  {
    rowId: 'P130', rowName: 'مصنعية مباني', unit: 'م²',
    reason: 'السعر الجامع 35–65/م² مشتق: 12 سم 35–55/م²، و25 سم 180–260/م³ × 0.25 م = 45–65/م². يحتاج تأكيد سماكة الحائط وشمول السقالات.',
    options: ['تأكيد سماكة 25 سم', 'استخدام سعر منفصل لكل سماكة (يتطلب تعديل المحرك المجمد)', 'الاحتفاظ بالنطاق الجامع']
  },
  {
    rowId: 'P126/P127', rowName: 'مصنعية سباكة بدون/مع دفن', unit: 'مشروع حمام + مطبخ',
    reason: 'السعر المورد 2,500–4,500 لكل قطعة (حمام أو مطبخ)، بينما الصف النشط 6,500/7,500 لمشروع حمام + مطبخ. الوحدات مختلفة ولم يُستبدل السعر النشط.',
    options: ['تأكيد أن 2,500–4,500 لكل قطعة', 'تحويل السعر إلى مشروع بضرب عدد القطع', 'الاحتفاظ بالمقارنة فقط']
  }
];

const report = {
  generatedAt: new Date().toISOString(),
  labor: data.META,
  policy: {
    laborOnly: true,
    overwriteNewerPrices: false,
    fillMissingOnly: true,
    elementSpecificConcreteNotAveraged: true,
    incompatibleUnitsNotApplied: true,
    previousPricesPreserved: true
  },
  counts: {
    suppliedItems: data.META.sourceItems || 31,
    suppliedRows: allRows.length,
    addedRows: count('added'),
    filledMissing: count('filled') + count('filled-derived'),
    updatedActive: count('updated-active'),
    keptActive: count('kept-active'),
    comparisons: count('comparison-only'),
    unitMismatch: count('unit-mismatch'),
    totalRowsBefore: base.prices.length,
    totalRowsAfter: prices.length
  },
  coverage: {
    before: { total: before.total, priced: before.priced, missing: before.missing, percent: before.total ? Math.round((before.priced / before.total) * 1000) / 10 : 0, stale: before.stale },
    after: { total: after.total, priced: after.priced, missing: after.missing, percent: after.total ? Math.round((after.priced / after.total) * 1000) / 10 : 0, stale: after.stale }
  },
  baseline,
  actions,
  mapping,
  derivedBridges: data.DERIVED_FILLS.map(d => ({ ...d, rowName: byId.get(d.rowId)?.name, activePrice: byId.get(d.rowId)?.avg, activeDate: byId.get(d.rowId)?.date })),
  comparisons: comparisonQuotes,
  factors: data.FACTORS,
  decisions: data.DECISIONS,
  unresolved,
  conflicts: [
    {
      area: 'الخرسانة',
      detail: 'قواعد 450–700 وأعمدة 900–1,400 وأسقف 550–1,000/م³، مقابل أساسات 290–310 وأعمدة 310 وأسقف 310/م³. الفارق كبير ولا يمكن دمجه دون معرفة ما إذا كانت المجموعة الثانية تشمل الشدة والحدادة أم لا.'
    },
    {
      area: 'الجبس بورد',
      detail: 'السعر 180–350 ورد لوحدة م² أو م.ط. تم حفظ صفين منفصلين بنفس النطاق، واستخدام صف المتر المسطح فقط في P146.'
    },
    {
      area: 'الدهانات',
      detail: 'نقاشة سادة 45–75/م²، دهانات ديكورية 70–120/م². المحرك يستخدم صفًا واحدًا للدهان الداخلي والخارجي؛ تم تفعيل السادة فقط.'
    },
    {
      area: 'المباني',
      detail: '12 سم 35–55/م²، 25 سم 180–260/م³، والألف طوبة 1,200–1,800. تحويل 25 سم إلى م² استخدم سماكة 0.25 م، وهو افتراض هندسي موثق وليس سعرًا مورّدًا.'
    },
    {
      area: 'الضريبة',
      detail: 'القائمة لم تحدد شمول الضريبة؛ كل الصفوف taxIncluded=false. لا تُضف ضريبة تلقائيًا قبل التأكيد.'
    }
  ]
};

const exportDoc = {
  app: base.app,
  version: '2026-10-21',
  exportedAt: new Date().toISOString(),
  settings,
  bulletins: Array.isArray(base.bulletins) ? base.bulletins : [],
  notes: [
    ...(Array.isArray(base.notes) ? base.notes : []),
    'الإصدار v3 يضيف قائمة مصنعيات محلية مؤرخة 2026-10-21 (مصنعية فقط، غير شاملة الخامات).',
    'الأسعار محدثة فقط حيث كانت الوحدة متوافقة والتاريخ أحدث؛ القيم السابقة محفوظة في previousPrice.',
    'مصنعية صب الخرسانة العامة P093 بقيت مفتوحة لأن الأسعار الموردة خاصة بكل عنصر ولا يجوز اختراع متوسط.',
    'مصنعية السباكة بالنقطة P041/P131 بقيت مفتوحة لأن المورد قدّم سعر م² وسعر قطعة، وليس سعر نقطة.',
    'الضريبة غير محددة في قائمة المصنعيات؛ taxIncluded=false لكل صفوفها.'
  ],
  prices
};

fs.writeFileSync(path.join(root, '.tmp-labor-export.json'), JSON.stringify(exportDoc, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'LABOR-RATES-2026-10-IMPORT.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Labor items: ${report.counts.suppliedItems} (${report.counts.suppliedRows} rows after the gypsum unit split)`);
console.log(`Added: ${report.counts.addedRows} | filled missing: ${report.counts.filledMissing} | updated active: ${report.counts.updatedActive} | comparisons: ${report.counts.comparisons} | unit mismatch: ${report.counts.unitMismatch}`);
console.log(`Coverage: ${report.coverage.before.priced}/${report.coverage.before.total} (${report.coverage.before.percent}%) -> ${report.coverage.after.priced}/${report.coverage.after.total} (${report.coverage.after.percent}%)`);
console.log(`Stale priced rows: ${report.coverage.before.stale} -> ${report.coverage.after.stale}`);
console.log('Filled/updated:');
for (const a of actions.filter(x => ['filled', 'filled-derived', 'updated-active', 'kept-active'].includes(x.action))) {
  console.log(` - ${a.action} ${a.rowId} ${a.rowName}: ${a.laborName} = ${a.laborPrice} (${a.laborUnit})`);
}
console.log('Unresolved:');
for (const u of unresolved) console.log(` - ${u.rowId} ${u.rowName}: ${u.reason}`);
console.log('Wrote .tmp-labor-export.json and LABOR-RATES-2026-10-IMPORT.json');
