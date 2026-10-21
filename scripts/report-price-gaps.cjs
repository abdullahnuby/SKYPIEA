'use strict';
// Produce an honest, reproducible gaps report for the current price book.
// It does not change prices. It answers:
//  - What did the January bulletin actually close?
//  - Which BOQ lines and takeoff resources are still unpriced, and why?
//  - Which bulletin rows are lookup-only because no takeoff/BOQ rule consumes them?
//  - Which active prices disagree materially with the bulletin?
//  - Which units or data points are still unknown?
//
// Usage: node scripts/report-price-gaps.cjs
// Output: PRICE-GAPS-REPORT.json + docs/PRICE-GAPS-2026-01.md

const fs = require('node:fs');
const path = require('node:path');
const engine = require('../engines/miyar-engine.js');
const takeoff = require('../engines/miyar-takeoff.js');
const { handleTool, loadBook } = require('../api/_lib/engine.cjs');

const root = path.resolve(__dirname, '..');
const book = loadBook();
const extendedPath = path.join(root, 'api/_data/price-book-extended.v1.json');
const extendedDoc = fs.existsSync(extendedPath) ? JSON.parse(fs.readFileSync(extendedPath, 'utf8')) : { rows: [] };
const extendedRows = Array.isArray(extendedDoc.rows) ? extendedDoc.rows : [];
const auditRows = [...book.prices, ...extendedRows];
const norm = engine.normalizeArabic;
const today = new Date().toISOString().slice(0, 10);
const dayMs = 86400000;
const daysOld = date => {
  const d = date ? new Date(String(date) + 'T00:00:00Z') : null;
  return d && Number.isFinite(d.getTime()) ? Math.floor((Date.now() - d.getTime()) / dayMs) : null;
};
const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;
const money = n => n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

const audit = handleTool({ tool: 'price-catalog.audit' });
const importReport = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'BULLETIN-2026-01-IMPORT.json'), 'utf8')); }
  catch (_) { return null; }
})();
const laborReport = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'LABOR-RATES-2026-10-IMPORT.json'), 'utf8')); }
  catch (_) { return null; }
})();
const v4Report = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'MISSING-PRICES-2026-10-IMPORT.json'), 'utf8')); }
  catch (_) { return null; }
})();
const SUPERSEDED_LABOR_DECISIONS = new Set(['p093_concrete', 'p041_p131_plumbing']);

const projects = {
  apartment: {
    label: 'شقة 150م² — 3 غرف — 2 حمام — باقة متوسطة — تسليم مفتاح',
    state: { service: 'apartment', type: 'residential', area: 150, rooms: 3, bathrooms: 2, pack: 'medium', scope: 'turnkey', floors: 1 }
  },
  building: {
    label: 'عمارة 200م² × 4 أدوار — وحدتان/دور — باقة متوسطة — تسليم مفتاح',
    state: { service: 'building', type: 'residential', area: 200, floors: 4, unitsPerFloor: 2, pack: 'medium', scope: 'turnkey', elevator: true }
  }
};

const boq = {};
for (const [key, project] of Object.entries(projects)) {
  const result = handleTool({ tool: 'estimate.run', state: project.state });
  const view = result.estimate;
  const gaps = view.lines.filter(l => l.required && !l.hasPrice);
  const byCategory = {};
  for (const g of gaps) byCategory[g.category] = (byCategory[g.category] || 0) + 1;
  boq[key] = {
    label: project.label,
    coveragePercent: view.coveragePercent,
    lineCount: view.lineCount,
    pricedLineCount: view.pricedLineCount,
    priceGapCount: view.priceGapCount,
    quantityGapCount: view.quantityGapCount,
    totalGapCount: view.totalGapCount,
    readyToShowAmount: view.readyToShowAmount,
    amount: view.amount,
    byCategory,
    gaps: gaps.map(g => ({
      code: g.code, title: g.title, category: g.category, unit: g.unit,
      quantity: g.quantity, hasQuantity: g.hasQuantity, status: g.status,
      source: g.source, date: g.date, warnings: g.warnings,
      priceRowName: g.priceRowName || '', priceId: g.priceId || ''
    }))
  };
}

const floorSpecs = Array.from({ length: 1 }, (_, i) => ({
  key: `floor-${i + 1}`, label: `الدور ${i + 1}`, area: 150,
  apartmentCount: 1, units: 1, rooms: 3, bathrooms: 2
}));
const rawTakeoff = takeoff.buildMaterialTakeoff({
  modelCode: 'APT-BRICK', scope: 'turnkey', package: 'medium',
  basement: false, elevator: false, kitchen: false, ac: false,
  apartmentArea: 150, apartmentCount: 1, roomsPerApartment: 3, bathrooms: 2,
  concreteGrade: 'C25', steelName: 'حديد استثماري'
}, floorSpecs, book.prices, book.settings, {});
const takeoffGaps = (rawTakeoff.priceGaps || []).map(g => ({
  title: g.item, unit: g.unit, trade: g.trade, kind: g.kind,
  reason: g.unitMismatch ? 'وحدة السعر في الكتالوج لا تتوافق مع وحدة الحصر'
    : g.priceStatus === 'missing' ? 'لا يوجد سعر وحدة قابل للاستخدام'
    : 'غير مسعّر',
  unitMismatch: !!g.unitMismatch, priceStatus: g.priceStatus,
  warnings: g.warnings || []
}));
const takeoffByKind = {};
const takeoffByTrade = {};
for (const g of takeoffGaps) {
  takeoffByKind[g.kind] = (takeoffByKind[g.kind] || 0) + 1;
  takeoffByTrade[g.trade] = (takeoffByTrade[g.trade] || 0) + 1;
}
const takeoffUsedNames = [...new Set((rawTakeoff.lines || [])
  .filter(l => l.unitPrice !== null && l.unitPrice !== undefined && l.priceName)
  .map(l => l.priceName))];

const boqUsedNames = new Set();
for (const b of Object.values(boq)) for (const g of b.gaps) if (g.priceRowName) boqUsedNames.add(g.priceRowName);
for (const b of Object.values(boq)) {
  // Priced lines are not in gaps; collect their price names from the view separately.
  const result = handleTool({ tool: 'estimate.run', state: b === boq.apartment ? projects.apartment.state : projects.building.state });
  for (const l of result.estimate.lines) if (l.priceRowName) boqUsedNames.add(l.priceRowName);
}
const usedNames = new Set([...takeoffUsedNames, ...boqUsedNames].map(norm));

const bulletinActiveRows = book.prices.filter(p => p.active !== false && p.bulletin === 'jan-2026' && String(p.date) === '2026-01-01');
const bulletinQuoteCount = auditRows.reduce((sum, p) => sum + (Array.isArray(p.bulletinQuotes) ? p.bulletinQuotes.length : 0), 0);
const usedBulletinRows = [];
const usedWithQuoteOnly = [];
for (const p of auditRows) {
  if (!usedNames.has(norm(p.name))) continue;
  if (p.bulletin === 'jan-2026' && String(p.date) === '2026-01-01') usedBulletinRows.push({ id: p.id, name: p.name, unit: p.unit, price: p.avg, date: p.date });
  else if (p.avg !== null && p.avg !== undefined && p.status !== 'missing' && Array.isArray(p.bulletinQuotes)) {
    const bulletinQuote = p.bulletinQuotes.find(q => q && (q.bulletin === 'jan-2026' || /نشرة/.test(String(q.source || ''))) && q.date);
    if (bulletinQuote && p.date && String(p.date) > String(bulletinQuote.date)) {
      usedWithQuoteOnly.push({ id: p.id, name: p.name, activePrice: p.avg, activeDate: p.date, quoteCount: p.bulletinQuotes.length });
    }
  }
}
const newBulletinRows = (extendedRows.length ? extendedRows : book.prices.filter(p => p.id && /^J26-/.test(p.id))).filter(p => p.id && /^J26-/.test(p.id));
const unusedNewRows = newBulletinRows.filter(p => !usedNames.has(norm(p.name)));
const unusedByCategory = {};
for (const p of unusedNewRows) unusedByCategory[p.category || 'غير مصنف'] = (unusedByCategory[p.category || 'غير مصنف'] || 0) + 1;

// Active vs bulletin comparisons. Keep only material differences, but include the
// known suspicious rows even if a threshold would hide them.
const unitsCompatible = (a, b) => {
  const A = String(a || '').trim();
  const B = String(b || '').trim();
  if (A === B) return true;
  // Metre and linear metre are the same dimension; a roll or a whole-apartment
  // reference is not directly comparable to a per-metre/per-m² active price.
  return (A === 'م' && B === 'م.ط') || (A === 'م.ط' && B === 'م');
};
const discrepancies = [];
for (const p of book.prices) {
  if (!Array.isArray(p.bulletinQuotes) || !p.bulletinQuotes.length) continue;
  if (p.avg === null || p.avg === undefined) continue;
  const quote = p.bulletinQuotes.find(q => q && q.activated === true && q.avg != null) ||
    p.bulletinQuotes.find(q => q && q.bulletin === 'jan-2026' && q.avg != null && !q.option) ||
    p.bulletinQuotes.find(q => q && q.bulletin === 'jan-2026' && q.avg != null);
  if (!quote) continue;
  // A quote in a different unit (e.g. a 100 m roll vs a per-metre active price)
  // is not directly comparable; the conversion is documented on the quote.
  if (quote.unit && p.unit && !unitsCompatible(quote.unit, p.unit)) continue;
  const diff = Number(p.avg) - Number(quote.avg);
  const diffPct = quote.avg ? Math.round((diff / Number(quote.avg)) * 1000) / 10 : null;
  if (Math.abs(diffPct) < 5 && !['P120', 'P121', 'P110', 'P028'].includes(p.id)) continue;
  discrepancies.push({
    id: p.id, name: p.name, unit: p.unit,
    activePrice: p.avg, activeDate: p.date || null,
    bulletinPrice: quote.avg, bulletinDate: quote.date || null,
    diff, diffPct, derived: !!quote.derived,
    bulletinName: quote.name || '', note: quote.note || ''
  });
}
discrepancies.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

const unknownUnits = book.prices.filter(p => p.active !== false && p.unitMissing);
const preExistingStale = audit.stale - bulletinActiveRows.length;
const report = {
  generatedAt: new Date().toISOString(),
  today,
  book: {
    version: book.priceBookVersion || book.version,
    rows: book.prices.length,
    active: audit.total,
    priced: audit.priced,
    missing: audit.missing,
    coveragePercent: audit.coveragePercent,
    stale: audit.stale
  },
  bulletin: {
    id: 'jan-2026',
    title: 'نشرة أسعار مواد البناء — يناير 2026',
    ageDays: daysOld('2026-01-01'),
    rows: importReport ? importReport.counts.bulletinRows : 313,
    addedRows: importReport ? importReport.counts.addedRows : newBulletinRows.length,
    filledMissing: importReport ? importReport.counts.filledMissing : null,
    keptNewer: importReport ? importReport.counts.keptNewer : null,
    unknownUnitRows: unknownUnits.length,
    activeRowsFromBulletin: bulletinActiveRows.length,
    archivedExtendedRows: extendedRows.length,
    quotes: bulletinQuoteCount,
    note: 'كل أسعار النشرة قديمة (يناير 2026)؛ تُستخدم كمرجع مؤرخ ولا تُستبدل بها الأسعار الأحدث.'
  },
  boq,
  takeoff: {
    label: 'حصر شقة 150م² — باقة متوسطة (نموذج الحصر الحالي)',
    lineCount: (rawTakeoff.lines || []).length,
    priceCoverage: rawTakeoff.priceCoverage,
    quantityCoverage: rawTakeoff.quantityCoverage,
    priceGapCount: takeoffGaps.length,
    quantityGapCount: (rawTakeoff.quantityGaps || []).length,
    byKind: takeoffByKind,
    byTrade: takeoffByTrade,
    gaps: takeoffGaps,
    usedPriceNames: takeoffUsedNames.sort((a, b) => a.localeCompare(b, 'ar'))
  },
  usage: {
    usedBulletinRows: usedBulletinRows,
    usedWithQuoteOnly,
    newBulletinRows: newBulletinRows.length,
    archivedAsExtendedCatalog: extendedRows.length > 0,
    unusedNewRows: unusedNewRows.length,
    unusedByCategory,
    examplesUnused: unusedNewRows.slice(0, 20).map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.avg, category: p.category }))
  },
  discrepancies,
  unknownUnits: unknownUnits.map(p => ({ id: p.id, name: p.name, unit: p.unit, price: p.avg, note: p.note || '' })),
  anomalies: importReport ? importReport.anomalies : [],
  stale: {
    activeStale: audit.stale,
    activeFromBulletin: bulletinActiveRows.length,
    preExistingStale,
    note: `${bulletinActiveRows.length} صف نشرة فقط ما زال داخل الكتالوج التشغيلي؛ ${extendedRows.length} صفًا من النشرة نُقل إلى الأرشيف الموسع خارج المطابقة الافتراضية؛ ${preExistingStale} صفًا تشغيليًا قديمًا أو غير مؤرخ.`
  },
  labor: laborReport ? {
    id: laborReport.labor.id,
    title: laborReport.labor.title,
    date: laborReport.labor.date,
    note: laborReport.labor.note,
    suppliedItems: laborReport.counts.suppliedItems,
    suppliedRows: laborReport.counts.suppliedRows,
    addedRows: laborReport.counts.addedRows,
    filledMissing: laborReport.counts.filledMissing,
    updatedActive: laborReport.counts.updatedActive,
    comparisons: laborReport.counts.comparisons,
    coverage: laborReport.coverage,
    mapping: laborReport.mapping,
    derivedBridges: laborReport.derivedBridges,
    comparisonsDetail: laborReport.comparisons,
    factors: laborReport.factors,
    decisions: laborReport.decisions.map(d => SUPERSEDED_LABOR_DECISIONS.has(d.key)
      ? { ...d, supersededBy: 'v4', supersededNote: 'v4 أغلق هذا البند بقيمة مشتقة معلنة؛ راجع قسم v4.' }
      : d),
    unresolved: laborReport.unresolved,
    conflicts: laborReport.conflicts
  } : null,
  v4: v4Report ? {
    batch: v4Report.batch,
    generatedAt: v4Report.generatedAt,
    counts: v4Report.counts,
    coverage: v4Report.coverage,
    clientEstimate: v4Report.clientEstimate ? {
      ...v4Report.clientEstimate,
      closedGaps: (v4Report.clientEstimate.closedGaps || []).map(g => ({ ...g, status: 'closed', closedIn: 'v4' }))
    } : null,
    unitCorrections: v4Report.unitCorrections,
    newRows: v4Report.newRows,
    derivedBridges: v4Report.derivedBridges,
    actions: v4Report.actions,
    remainingClientGaps: v4Report.clientEstimate ? v4Report.clientEstimate.remainingGaps : [],
    remainingGaps: v4Report.remainingGaps,
    decisions: v4Report.decisions,
    conflicts: v4Report.conflicts
  } : null,
  recommendations: [
    'لا تعتمد أسعار يناير 2026 كأسعار نشطة للبنود التي لها سعر أحدث؛ راجع الفروق الكبيرة (خصوصًا مواسير الصرف 2 و3 بوصة ولوح الجبس بورد).',
    'أكمل وحدات البنود العشرة غير المذكورة في النشرة قبل استخدامها في أي حساب.',
    'احسم منتج الدهانات (سيلر/بلاستيك داخلي/خارجي) ومعدل الاستهلاك لكل م²؛ النشرة تسعّر المادة فقط.',
    'حدد سماكة العزل الحراري لتحويل سعر المتر المكعب إلى متر مربع، وحدد نوع الرخام/الجرانيت قبل تسعير البند العام.',
    'v4 صحح P077/P078 إلى سعر المتر (لفة 100 م ÷ 100)؛ أكمل مقاسات 1.5 و2.5 مم² غير الموجودة في النشرة.',
    'v4 أغلق 7 من فجوات تقدير الشقة (المحارة، نقاط المياه والصرف، خامات الكهرباء، مصنعية الأرضيات والمناطق الرطبة، والدهان). بقيت 4 فجوات حقيقية: السيلر، الأبواب، الأطقم الصحية، والتنظيف.',
    'P093 (صب الخرسانة) مُلئ في v4 بنطاق جامع 290–1,400/م³ مع requiresElementSelection=true. لا تستخدمه لتسعير عنصر محدد دون اختيار العنصر؛ النطاق ليس سعرًا عامًا صالحًا لكل العناصر.',
    'P041/P131 (سباكة بالنقطة) مُلئا في v4 بقيمة مشتقة 363.64–727.27/نقطة (متوسط 545.45) من 200–400/م² ÷ 0.55 نقطة/م². هي قيمة تقريبية معلنة، وليست سعر سوق لنقطة منفردة.',
    'P049/P111 (دهان داخلي) مُلئا في v4 بقيمة مركبة 63.25–93.25/م² (متوسط 78.25): مادة يناير 125/لتر × 0.146 لتر/م² + مصنعية أكتوبر 45–75/م². المادة قديمة والمصنعية حديثة، والضريبة غير محددة.',
    'P133 (سيلر) بقي مفتوحًا: النشرة تسعّره بالكيلوجرام والكتالوج يطلبه باللتر، ولا توجد كثافة في المصدر. لا تحويل بدون كثافة موثقة.',
    'أبواب وأطقم صحية وتنظيف وتسليم ليست في المصدرين كأسعار مطابقة؛ لا تُملأ بأسعار مخترعة أو بتحويل غير مبرر.',
    'راجع تعارض مصنعيات الخرسانة: 450–700/700–1,000 و900–1,400/م³ مقابل 290–310/م³. الفارق قد يكون بسبب شمول الشدة والحدادة من عدمه.',
    'الصفوف الجديدة B26-001..B26-006 جسور أسماء للمحركات المجمدة؛ لا تعدل المحركات. لا تجمع صفًا جديدًا مع الصف الأصلي في نفس الحصر.',
    'بعد اكتمال الأسعار، أعد نشر دفتر الأسعار وطبّق ترحيلات Supabase واختبر Vercel.'
  ]
};

fs.writeFileSync(path.join(root, 'PRICE-GAPS-REPORT.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

const kindLabel = { labor: 'مصنعية', material: 'مادة', equipment: 'معدات', indirect: 'غير مباشر' };
const labor = report.labor;
const rowById = new Map(book.prices.map(p => [p.id, p]));
const actionArabic = {
  filled: 'مُلئ من المصنعيات',
  'filled-derived': 'مُلئ بقيمة مشتقة',
  'updated-active': 'حُدّث بسعر أحدث',
  'kept-active': 'أُبقي السعر النشط',
  added: 'صف جديد للاستعلام',
  'comparison-only': 'مقارنة فقط'
};
const laborActiveActions = labor ? labor.mapping.filter(m => m.action !== 'added') : [];
const laborNewRows = labor ? labor.mapping.filter(m => m.action === 'added') : [];

const md = [];
md.push('# تقرير نواقص التسعير — نشرة يناير 2026 + مصنعيات أكتوبر 2026');
md.push('');
md.push(`- التاريخ: ${today}`);
md.push(`- إصدار دفتر الأسعار: **${report.book.version}**`);
md.push(`- المصدر الأول: ${report.bulletin.title} (${report.bulletin.ageDays} يومًا) — [الرابط](${importReport ? importReport.bulletin.url : ''})`);
md.push(`- المصدر الثاني: ${labor ? labor.title : 'قائمة المصنعيات المحلية'} (${labor ? labor.date : '2026-10-21'}) — مصنعية فقط، غير شاملة الخامات.`);
md.push('');
md.push('## 1. الملخص التنفيذي');
md.push('');
md.push(`- دفتر الأسعار: **${report.book.priced}/${report.book.active}** بندًا مسعّرًا (**${report.book.coveragePercent}%**)، وناقص **${report.book.missing}**.`);
md.push(`- النشرة أضافت **${report.bulletin.addedRows}** صفًا جديدًا، وملأت **${report.bulletin.filledMissing}** بنود كانت بدون سعر، وأُضيفت كاقتباس مؤرخ لـ **${report.bulletin.keptNewer}** صفًا أحدث سعرًا.`);
md.push(`- قائمة المصنعيات: **${labor ? labor.suppliedItems : 31}** بندًا مصنعيًا، أضافت **${labor ? labor.addedRows : 27}** صفًا، وملأت **${labor ? labor.filledMissing : 4}** بنود ناقصة، وحدّثت **${labor ? labor.updatedActive : 2}** سعرًا نشطًا مع حفظ القيم السابقة.`);
md.push(`- تغطية مقايسة الشقة: **${boq.apartment.coveragePercent}%** (${boq.apartment.priceGapCount} فجوة سعر)، والعمارة: **${boq.building.coveragePercent}%** (${boq.building.priceGapCount} فجوة سعر).`);
md.push(`- تغطية الحصر: **${report.takeoff.priceCoverage}%** (${report.takeoff.priceGapCount} فجوة سعر من ${report.takeoff.lineCount} بندًا، و${report.takeoff.quantityGapCount} فجوة كمية).`);
md.push(`- في الكتالوج التشغيلي **${report.stale.activeFromBulletin}** صف نشرة نشط؛ نُقلت **${report.bulletin.archivedExtendedRows}** صفوف نشرة إلى الأرشيف الموسع. بقي **${report.stale.activeStale}** سعرًا تشغيليًا قديمًا أو غير مؤرخ يحتاج مراجعة.`);
md.push(`- **${report.usage.unusedNewRows}** من أصل **${report.usage.newBulletinRows}** صفًا جديدًا من النشرة غير مربوط بأي بند مقايسة أو حصر حالي؛ نُقل إلى الأرشيف الموسع وأُخرج من المطابقة الافتراضية.`);
if (report.v4) {
  md.push(`- **v4:** أضاف **${report.v4.counts.addedRows}** صفوف جسر/استعلام، وملأ **${report.v4.counts.filledRows + report.v4.counts.filledDerivedRows}** صفًا (منها **${report.v4.counts.filledDerivedRows}** بقيمة مشتقة معلنة)، وصحّح **${report.v4.counts.unitCorrections}** وحدات مركبة.`);
  md.push(`- **تقدير الشقة (v4):** من **${report.v4.clientEstimate.before.priced}** بندًا مسعّرًا و**${report.v4.clientEstimate.before.gaps}** فجوة إلى **${report.v4.clientEstimate.after.priced}** مسعّرًا و**${report.v4.clientEstimate.after.gaps}** فجوات. الفجوات المتبقية: ${report.v4.remainingClientGaps.map(g => g.item).join('، ')}.`);
}
md.push('');
md.push('> الخلاصة: النشرة حسّنت تغطية الخامات كمرجع موسع، لكن صفوفها الـ291 لم تكن مرتبطة بقواعد الحصر الحالية؛ لذلك حُفظت في أرشيف منفصل بدل تضخيم نتائج المطابقة. قائمة المصنعيات أغلقت المحارة والسيراميك والكهرباء والدهان والجبس والمباني والرخام. **v4** أغلق الفجوات المدعومة إضافيًا (العزل، الجبس، الأسلاك، الرخام/الجرانيت، الحجر، المواسير، الدهان الداخلي، سباكة النقطة، وصب الخرسانة) مع تمييز القيم المشتقة. الفجوات المتبقية ليست أسعارًا مخفية: **سيلر بلا كثافة، أبواب، أطقم صحية، تنظيف، شدة وحدادة، عزل مائي، خدمات وعروض محلية، ومواد لم تسعّرها النشرة**.');
md.push('');
if (report.v4) {
  const v4Fills = report.v4.actions.filter(a => a.action !== 'added');
  const v4Added = report.v4.actions.filter(a => a.action === 'added');
  const v4DerivedById = new Map((report.v4.derivedBridges || []).map(d => [d.rowId, d]));
  md.push('## 2. تحديث v4 — ما أُغلق وما بقي');
  md.push('');
  md.push(`v4 مبني على **${report.v4.coverage.before.priced}/${report.v4.coverage.before.total}** (${report.v4.coverage.before.percent}%) وأصبح **${report.v4.coverage.after.priced}/${report.v4.coverage.after.total}** (${report.v4.coverage.after.percent}%)؛ الصفوف القديمة **${report.v4.coverage.after.stale}** لأن أسعار النشرة محفوظة بتاريخ يناير 2026.`);
  md.push('');
  md.push('### ما أُغلق من الصفوف الموجودة');
  md.push('');
  md.push('| الصف | البند | الوحدة | السعر النشط | نوع الملء | المصدر/الصيغة |');
  md.push('|---|---|---|---:|---|---|');
  for (const a of v4Fills) {
    const d = v4DerivedById.get(a.rowId);
    const bookRow = book.prices.find(p => p.id === a.rowId);
    const kind = a.action === 'filled-derived'
      ? 'مشتق معلن'
      : (bookRow && (bookRow.status === 'estimate' || /^نطاق\s+16/.test(bookRow.note || '')))
        ? 'نطاق/تقديري'
        : 'مباشر';
    const source = d ? `${d.formula} — ${d.calculation}` : (a.source || '');
    md.push(`| ${a.rowId} | ${a.rowName} | ${a.unit} | ${money(a.avg)} | ${kind} | ${source} |`);
  }
  md.push('');
  md.push('### الصفوف الجديدة (جسور أسماء واستعلام)');
  md.push('');
  md.push('| الصف | البند | الوحدة | السعر | الجسر/المصدر |');
  md.push('|---|---|---|---:|---|');
  for (const a of v4Added) {
    const n = (report.v4.newRows || []).find(r => r.id === a.rowId);
    md.push(`| ${a.rowId} | ${a.rowName} | ${a.unit} | ${money(a.avg)} | ${a.bridgeOf ? `جسر لـ ${a.bridgeOf}` : (n && n.derivedFrom ? `مشتق من ${n.derivedFrom}` : 'استعلام')} |`);
  }
  md.push('');
  md.push('P112 بديل P052 وP114 بديل P088؛ لا تُجمع في نفس الحصر.'); md.push(''); md.push('### تصحيحات الوحدة');
  md.push('');
  md.push('| الصف | من | إلى | السبب |');
  md.push('|---|---|---|---|');
  for (const u of (report.v4.unitCorrections || [])) md.push(`| ${u.rowId} ${u.rowName} | ${u.from} | ${u.to} | ${u.reason} |`);
  md.push('');
  md.push('### تقدير الشقة بعد v4');
  md.push('');
  md.push(`- قبل: **${report.v4.clientEstimate.before.priced}** مسعّرًا و**${report.v4.clientEstimate.before.gaps}** فجوة.`);
  md.push(`- بعد: **${report.v4.clientEstimate.after.priced}** مسعّرًا و**${report.v4.clientEstimate.after.gaps}** فجوة.`);
  md.push(`- ما أُغلق: ${report.v4.clientEstimate.closedGaps.map(g => g.item).join('، ')}.`);
  md.push(`- ما بقي: ${report.v4.remainingClientGaps.map(g => `${g.item} (${g.unit})`).join('، ')}.`);
  md.push('');
  const remainingByCategory = {};
  for (const g of (report.v4.remainingGaps || [])) {
    const key = g.category || 'غير مصنف';
    if (!remainingByCategory[key]) remainingByCategory[key] = [];
    remainingByCategory[key].push(g);
  }
  md.push('### الفجوات الكتالوجية المتبقية حسب التصنيف');
  md.push('');
  md.push('| التصنيف | العدد | أمثلة |');
  md.push('|---|---:|---|');
  for (const [key, rows] of Object.entries(remainingByCategory)) {
    md.push(`| ${key} | ${rows.length} | ${rows.slice(0, 6).map(r => r.rowName).join('، ')}${rows.length > 6 ? '…' : ''} |`);
  }
  md.push('');
  md.push('> تحذير: P093 نطاق جامع 290–1,400/م³ مع `requiresElementSelection=true`، وP041/P131 قيمة نقطة مشتقة من سعر المتر، وP049/P111 قيمة مركبة (مادة يناير + مصنعية أكتوبر). هذه ليست أسعارًا سوقية مباشرة، ويجب عرضها كتقدير لا كعرض نهائي.');
  md.push('');
}
md.push('## 3. ما أغلقته النشرة فعليًا');
md.push('');
if (usedBulletinRows.length) {
  md.push('| الصف | البند | السعر النشط | الوحدة |');
  md.push('|---|---|---:|---|');
  for (const r of usedBulletinRows) md.push(`| ${r.id} | ${r.name} | ${money(r.price)} | ${r.unit} |`);
} else md.push('لا توجد صفوف نشطة من النشرة دخلت النماذج الحالية.');
md.push('');
if (usedWithQuoteOnly.length) {
  md.push('صفوف لها سعر أحدث من النشرة، فأُضيفت النشرة كاقتباس مرجعي فقط:');
  md.push('');
  md.push('| الصف | البند | السعر النشط | تاريخه |');
  md.push('|---|---|---:|---|');
  for (const r of usedWithQuoteOnly) md.push(`| ${r.id} | ${r.name} | ${money(r.activePrice)} | ${r.activeDate || '—'} |`);
  md.push('');
}
md.push(`إجمالًا احتفظ **${report.bulletin.keptNewer}** صفًا بسعره الأحدث على مستوى الدفتر؛ الجدول يعرض الصفوف المستخدمة فعليًا في المقايسة/الحصر فقط.`); md.push(''); md.push('## 4. ما أغلقته قائمة المصنعيات');
md.push('');
if (labor) {
  md.push(`القائمة وصلت بتاريخ **${labor.date}**، وهي **مصنعية فقط** (لا تشمل الحديد والأسمنت والرمل والزلط والبلاط والدهانات). لم تُضف أي ضريبة تلقائيًا لأن المستخدم لم يحدد شمولها.`);
  md.push('');
  md.push('| الحالة | الصف | البند النشط | الوحدة | السعر | ملاحظة |');
  md.push('|---|---|---|---:|---:|---|');
  for (const m of laborActiveActions) {
    const r = rowById.get(m.mappedTo);
    md.push(`| ${actionArabic[m.action] || m.action} | ${m.mappedTo} | ${m.mappedRowName || m.item} | ${r ? r.unit : m.unit} | ${r ? money(r.avg) : '—'} | ${m.item} |`);
  }
  for (const d of (labor.derivedBridges || [])) {
    if (laborActiveActions.some(m => m.mappedTo === d.rowId)) continue;
    md.push(`| مُلئ بقيمة مشتقة | ${d.rowId} | ${d.rowName} | ${d.unit} | ${money(d.activePrice)} | ${(d.sourceItems || []).join(' + ')} |`);
  }
  md.push('');
  md.push('أبرز ما تغيّر:');
  md.push('');
  md.push('- **P033 محارة ولياسة:** 50–85 ج/م² (كانت فجوة).');
  md.push('- **P056 سيراميك:** 150–300 ج/م² (كان 105 ج/م² وطنيًا؛ القيمة القديمة محفوظة في `previousPrice`).');
  md.push('- **P037 كهرباء:** 70–120 ج/نقطة (كان 200 ج/نقطة وطنيًا؛ القيمة القديمة محفوظة في `previousPrice`).');
  md.push('- **P090 دهانات:** 45–75 ج/م² للدهان السادة (كانت فجوة). الدهان الديكوري 70–120 ج/م² في صف مستقل.');
  md.push('- **P146 جبس بورد:** 180–350 ج/م² (كانت فجوة).');
  md.push('- **P130 مباني:** 35–65 ج/م² كقيمة جامعة مشتقة (12 سم 35–55، و25 سم 180–260/م³ × 0.25 م = 45–65).');
  md.push('- **مصنعية رخام:** 350–700 ج/م² كصف جديد بالاسم المطابق لمحرك الحصر.');
  md.push('');
  md.push(`### الصفوف الجديدة للاستعلام (${laborNewRows.length})`);
  md.push('');
  md.push('| الصف | البند | الوحدة | النطاق |');
  md.push('|---|---|---|---:|');
  for (const m of laborNewRows) {
    const r = rowById.get(m.mappedTo);
    md.push(`| ${m.mappedTo} | ${m.mappedRowName || m.item} | ${r ? r.unit : m.unit} | ${money(m.low)}–${money(m.high)} |`);
  }
  md.push('');
  if (labor.comparisonsDetail && labor.comparisonsDetail.length) {
    md.push('### مقارنات لم تُستبدل');
    md.push('');
    md.push('| الصف النشط | السعر النشط | البند المورد | سعر المصنعية | سبب عدم الاستبدال |');
    md.push('|---|---:|---|---:|---|');
    for (const c of labor.comparisonsDetail) md.push(`| ${c.rowName} (${c.rowId}) | ${money(c.activePrice)} / ${c.activeUnit} | ${c.laborName} | ${money(c.laborLow)}–${money(c.laborHigh)} / ${c.laborUnit} (متوسط ${money(c.laborPrice)}) | اختلاف الوحدة: مشروع حمام + مطبخ مقابل قطعة واحدة |`);
    md.push('');
  }
} else {
  md.push('لم يتم العثور على تقرير استيراد المصنعيات.');
  md.push('');
}
md.push('## 5. فجوات المقايسة (BOQ) المتبقية');
md.push('');
for (const [key, b] of Object.entries(boq)) {
  md.push(`### ${key === 'apartment' ? 'الشقة' : 'العمارة'} — ${b.coveragePercent}%`);
  md.push('');
  md.push('| الكود | البند | الوحدة | التصنيف |');
  md.push('|---|---|---|---|');
  for (const g of b.gaps) md.push(`| ${g.code} | ${g.title} | ${g.unit} | ${g.category} |`);
  md.push('');
}
md.push('**التفسير:** قائمة المصنعيات أغلقت **04.03 المحارة** و**08.04 تركيب البلاط** و**08.05 الكهرباء**. و**v4** أغلق **03.05 العزل** و**07.02 الدهانات** (مادة + مصنعية) و**07.06 الرخام/الجرانيت** و**07.07 الجبس** و**08.03 صب الخرسانة** (بنطاق جامع يحتاج اختيار العنصر). ما زال مفتوحًا: **08.01 الشدة** و**08.02 الحدادة** (لم يرد لهما سعر)، **06.02 الأطقم الصحية** (مادة/عرض)، **07.03 الأبواب** (مادة/عرض)، و**03.04 الشدة** (مادة/إيجار). الخدمات (تصميم، ترخيص، حفر، مضخة، اختبارات) خارج قائمة المصنعيات الموردة.');
md.push('');
md.push('## 6. فجوات الحصر (Takeoff) المتبقية');
md.push('');
md.push(`التغطية **${report.takeoff.priceCoverage}%**، والفجوات **${report.takeoff.priceGapCount}**: ${Object.entries(report.takeoff.byKind).map(([k, v]) => `${kindLabel[k] || k}: ${v}`).join(' — ')}.`);
md.push('');
md.push('| النوع | البند | الوحدة | السبب |');
md.push('|---|---|---|---|');
for (const g of report.takeoff.gaps) md.push(`| ${kindLabel[g.kind] || g.kind} | ${g.title} | ${g.unit} | ${g.reason} |`);
md.push('');
md.push('**ما أغلقته المصنعيات وv4 في الحصر:** المحارة، السيراميك، الرخام، الدهان الداخلي والخارجي، الجبس بورد، الكهرباء، مباني نصف/كامل طوبة، الأسلاك 4 و6 مم، سباكة النقطة، وصب الخرسانة (بنطاق جامع). **ما بقي من المصنعيات:** الشدة (P091)، الحدادة (P092)، الطرطشة، والعزل المائي (P145).');
md.push('');
md.push('### بنود تحتاج قرارًا أو تحققًا قبل التنفيذ');
md.push('');
md.push('| البند | الخيارات/المطلوب |');
md.push('|---|---|');
md.push('| **P093 صب الخرسانة (م³)** | v4 ملأه بنطاق جامع 290–1,400/م³ مع `requiresElementSelection=true`. للتنفيذ: اختر العنصر (قواعد/أعمدة/سقف) أو أضف بنود BOQ لكل عنصر. النطاق ليس سعرًا عامًا صالحًا لكل العناصر. |');
md.push('| **P041/P131 سباكة (نقطة)** | v4 ملأهما بقيمة مشتقة 363.64–727.27/نقطة (متوسط 545.45) من 200–400/م² ÷ 0.55 نقطة/م². للتنفيذ: زوّد سعر نقطة صريحًا أو أكد كثافة النقاط. |');
md.push('| **P091 نجارة/شدة (م²)** | لم يرد سعر شدة/نجارة مسلحة. زوّد سعر المتر المسطح. |');
md.push('| **P092 حدادة (طن)** | لم يرد سعر حدادة/تسليح. زوّد سعر الطن. |');
md.push('| **P145 عزل مائي (م²)** | لم يرد سعر عزل. زوّد السعر حسب النظام والطبقات والضمان. |');
md.push('| **P090 دهانات** | تم تفعيل السادة 45–75/م². الديكوري 70–120/م² منفصل. المحرك يستخدم P090 للداخل والخارج معًا؛ الخارج قد يحتاج سقالات. |');
md.push('| **P130 مباني** | القيمة الجامعة 35–65/م² مشتقة. أكد سماكة 25 سم وشمول السقالات. |');
md.push('| **P126/P127 سباكة مقطوعية** | 6,500/7,500 لمشروع حمام + مطبخ، مقابل 2,500–4,500 لكل قطعة. الوحدات مختلفة ولم تُستبدل. |');
md.push('| **P133 سيلر داخلي (لتر)** | النشرة تسعّره/الدهان التحضيري بالكيلو (42–245/كجم) والبند باللتر — لا كثافة في المصدر. زوّد كثافة أو سعر لتر. |');
md.push('| **أبواب (باب)** | لا سعر باب في المصدرين؛ خشب الم³ لا يكفي دون مقاس/تصميم/BOM. زوّد عرض نجار/معرض. |');
md.push('| **أطقم صحية (طقم حمام)** | لا سعر طقم في المصدرين. زوّد عرض ماركة/باقة. |');
md.push('| **تنظيف وتسليم (وحدة)** | لا سعر في المصدرين. زوّد عرضًا محليًا. |');
md.push('| **فواصل سيراميك/شبك فيبرجلاس/مسامير وبروفايل جبس** | غير موجودة في نشرة المواد — عروض محلية. |');
md.push('| **ألواح عزل حراري** | سعر البوليسترين بالم³: 3,200 (32 كجم/م³) و3,820 (36 كجم/م³) — حدد السماكة. |');
md.push('| **أسلاك 1.5/2.5 مم²** | النشرة بها 2/3/4/6 مم فقط؛ لا تحويل بدون مطابقة مقاس. |');
md.push('');
md.push('## 7. فروق أسعار النشرة التي تحتاج مراجعة');
md.push('');
md.push('| الصف | البند | السعر النشط | تاريخه | نشرة يناير | الفرق |');
md.push('|---|---|---:|---|---:|---:|');
for (const d of discrepancies.slice(0, 20)) md.push(`| ${d.id} | ${d.name}${d.derived ? ' (مقارنة)' : ''} | ${money(d.activePrice)} | ${d.activeDate || '—'} | ${money(d.bulletinPrice)} | ${d.diffPct > 0 ? '+' : ''}${d.diffPct}% |`);
md.push('');
md.push('لا تُقارن الصفوف التي حُوّلت وحدتها (مثل لفة 100 م → م، أو مشروع 100 م² → م²) مباشرة؛ التحويل موثق في حقل `conversion` داخل الاقتباس، والمقارنة تتم بعد التحويل فقط.');
md.push('');
md.push('أولوية المراجعة: **P120/P121** (فارق نحو 5 أضعاف: السعر النشط قد يكون لماسورة عادية/أقل سماكة بينما النشرة «مدعمة» — راجع المواصفة والوحدة قبل التعديل)، **P110** (لوح الجبس 825 مقابل 320: راجع نوع اللوح ومقاسه)، **P028** (طوب 1,600 مقابل 4,025: راجع الوحدة وكثافة الطوب)، **P012** (رمل ناعم 260 مقابل 160: راجع شمول النقل).');
md.push('');
md.push('## 8. وحدات غير مذكورة في النشرة');
md.push('');
md.push('| الصف | البند | السعر |');
md.push('|---|---|---:|');
for (const u of report.unknownUnits) md.push(`| ${u.id} | ${u.name} | ${money(u.price)} |`);
md.push('');
md.push('هذه البنود مسعّرة في الكتالوج لكنها **لا تدخل الحساب** حتى تأكيد الوحدة (كجم/لتر/م³/ألف طوبة).');
md.push('');
if (labor && labor.conflicts && labor.conflicts.length) {
  md.push('## 9. تعارضات وقرارات قائمة المصنعيات');
  md.push('');
  md.push('### تعارضات لم تُدمج');
  md.push('');
  for (const c of labor.conflicts) md.push(`- **${c.area}:** ${c.detail}`);
  md.push('');
  md.push('### قرارات موثقة');
  md.push('');
  for (const d of labor.decisions) {
    if (d.supersededBy) {
      md.push(`- ~~**${d.decision}**~~ — استُبدل في ${d.supersededBy}: ${d.supersededNote}`);
      continue;
    }
    md.push(`- **${d.decision}** ${d.rationale}`);
  }
  if (report.v4 && Array.isArray(report.v4.decisions) && report.v4.decisions.length) {
    md.push('');
    md.push('### قرارات v4');
    md.push('');
    for (const d of report.v4.decisions) md.push(`- ${d}`);
  }
  md.push('');
}
md.push('## 10. شذوذات بيانات النشرة');
md.push('');
for (const a of report.anomalies) md.push(`- **${a.name}:** ${a.issue}`);
md.push('');
md.push('## 11. خطة الإكمال المقترحة');
md.push('');
for (const r of report.recommendations) md.push(`- ${r}`);
md.push('');
md.push('## 12. الملفات');
md.push('');
md.push('- `BULLETIN-2026-01-IMPORT.json`: تفاصيل كل صف من النشرة (أُضيف/مُلئ/بقي أحدث/وحدة ناقصة).');
md.push('- `LABOR-RATES-2026-10-IMPORT.json`: تفاصيل كل بند مصنعية (أُضيف/مُلئ/حُدّث/مقارنة/فجوة باقية).');
md.push('- `MISSING-PRICES-2026-10-IMPORT.json`: تفاصيل v4 (ملء، جسور، قيم مشتقة، تصحيحات وحدة، فجوات متبقية).');
md.push('- `PRICE-GAPS-REPORT.json`: هذا التقرير بصيغة منظمة.');
md.push('- دفتر الأسعار النشط يتم اختياره من أحدث `api/_data/price-book.vN.json`؛ الإصدار الحالي `'+report.book.version+'`.');
md.push('- `PRICE-BOOK-PUBLISH-REPORT.json`: تغطية النشر والتحذيرات.');
md.push('');

const docsDir = path.join(root, 'docs');
fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(path.join(docsDir, 'PRICE-GAPS-2026-01.md'), md.join('\n'), 'utf8');

console.log(`Book ${report.book.version}: ${report.book.priced}/${report.book.active} priced (${report.book.coveragePercent}%), missing ${report.book.missing}, stale ${report.book.stale}`);
console.log(`BOQ coverage: apartment ${boq.apartment.coveragePercent}% (${boq.apartment.priceGapCount} gaps), building ${boq.building.coveragePercent}% (${boq.building.priceGapCount} gaps)`);
console.log(`Takeoff coverage: ${report.takeoff.priceCoverage}% (${report.takeoff.priceGapCount} price gaps, ${report.takeoff.quantityGapCount} quantity gaps)`);
console.log(`Bulletin: ${report.bulletin.addedRows} added, ${report.bulletin.filledMissing} filled, ${report.bulletin.keptNewer} kept newer, ${report.unknownUnits.length} unknown units`);
console.log(`Labor: ${labor ? labor.suppliedItems : 0} items, ${labor ? labor.addedRows : 0} added, ${labor ? labor.filledMissing : 0} filled, ${labor ? labor.updatedActive : 0} updated, ${labor ? labor.comparisons : 0} comparisons`);
console.log(`Usage: ${report.usage.newBulletinRows} new bulletin rows, ${report.usage.unusedNewRows} unused by current BOQ/takeoff`);
console.log(`Discrepancies >=5%: ${discrepancies.length}`);
console.log('Wrote PRICE-GAPS-REPORT.json and docs/PRICE-GAPS-2026-01.md');
