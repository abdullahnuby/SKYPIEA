'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../engines/miyar-engine.js');
const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'api', '_data', 'price-book.v1.json'), 'utf8'));
const prices = payload.prices;
const settings = { ...payload.settings, staleDays: 90 };

// Classification should prefer the admin category instead of ambiguous tokens.
assert.equal(engine.classifyPriceRow({ name: 'مونة أسمنت ورمل', category: 'المباني والبياض' }).divisionCode, '04');
assert.equal(engine.classifyPriceRow({ name: 'اختبار تربة', category: 'الحفر والأساسات' }).divisionCode, '02');
assert.equal(engine.classifyPriceRow({ name: 'توصيل صرف عام', category: 'السباكة والصرف' }).divisionCode, '06');
assert.equal(engine.classifyPriceRow({ name: 'مصنعية حدادة مسلحة', category: 'المصنعيات والعمالة' }).divisionCode, '08');
assert.equal(engine.classifyPriceRow({ name: 'مطبخ ألوميتال سنجل فايبر', category: 'خيارات إضافية', scope: 'optional' }).divisionCode, '10');

// Arabic project fact extraction should preserve facts and normalize Arabic digits.
const parsed = engine.parseProjectText('عمارة سكنية مساحة الدور ١٨٠ متر، ٤ أدوار، ٣ غرف، تشطيب متوسط، بدون بدروم، بدون أسانسير، على المفتاح');
assert.equal(parsed.values.area, 180);
assert.equal(parsed.values.floors, 4);
assert.equal(parsed.values.rooms, 3);
assert.equal(parsed.values.type, 'residential');
assert.equal(parsed.values.pack, 'medium');
assert.equal(parsed.values.scope, 'turnkey');
assert.equal(parsed.values.basement, false);
assert.equal(parsed.values.elevator, false);

const project = { type: 'residential', pack: 'medium', scope: 'turnkey', area: 180, floors: 4, rooms: 3, unitsPerFloor: 1, bathrooms: 2, basement: false, elevator: false, kitchen: false, ac: false, sewerConnection: false, mode: 'comprehensive', steelChoice: 'حديد استثماري', concreteGrade: 'C25' };
const result = engine.buildEstimate(project, prices, settings, {});
assert.ok(result.lines.length >= 20, 'Should build a categorized BOQ, not a single area multiplier');
assert.ok(result.lines.some(l => l.code === '03.01'), 'Selected steel should appear');
assert.ok(result.lines.some(l => l.code === '03.02'), 'Selected concrete grade should appear');
assert.ok(!result.lines.some(l => l.code === '09.01'), 'Elevator must be excluded when not selected');
assert.ok(!result.lines.some(l => l.code === '10.01'), 'Kitchen must be excluded when not selected');
assert.ok(result.lines.every((l, i, a) => i === 0 || a[i - 1].code.localeCompare(l.code, 'en') <= 0), 'BOQ should sort by WBS code');
assert.ok(result.unresolvedPriceLines.length > 0, 'Missing prices must be represented as gaps');
assert.ok(result.unresolvedQuantityLines.length > 0, 'Manual take-off quantities must be represented as gaps');
assert.ok(result.transportRiskLines.length > 0, 'National material prices without included transport must be flagged');
assert.equal(result.isContractReady, false, 'National alternatives and gaps should block contract-ready state');
assert.ok(result.totalLow <= result.total && result.total <= result.totalHigh, 'Base total should be bounded by the priced-item low/high range');
for (const l of result.lines.filter(l => !l.priced)) assert.equal(l.lineCost, null, `${l.title} has no price and must not contribute cost`);

// Manual take-off quantities override only the matching WBS line.
const overrideResult = engine.buildEstimate(project, prices, settings, { '02.01': 16 });
assert.equal(overrideResult.lines.find(l => l.code === '02.01').quantity, 16);
assert.equal(overrideResult.lines.find(l => l.code === '02.01').quantitySource, 'override');

// Low/average/high arithmetic and fee behavior are auditable on a small synthetic BOQ.
const toyCatalog = [
  { id: 'T1', name: 'حديد استثماري', category: 'الهيكل الخرساني', unit: 'طن', low: 90, high: 110, avg: 100, date: '2026-10-19', status: 'local', confidence: 'عالية', transport: 'yes', active: true },
  { id: 'T2', name: 'خرسانة جاهزة C25', category: 'الهيكل الخرساني', unit: 'م³', low: 190, high: 210, avg: 200, date: '2026-10-19', status: 'local', confidence: 'عالية', transport: 'yes', active: true }
];
// The visible account settings must stay authoritative even if old persisted modelRates disagree.
const settingsPriority = engine.buildEstimate({ ...project, area:100, floors:1, basement:false }, toyCatalog, {
  steelFactor:0.12, concreteFactor:0.5, basementSteelFactor:0.09, basementConcreteFactor:0.65, supervision:10, staleDays:90,
  modelRates:{steelKgPerM2:{value:80,low:60,high:100},concreteM3PerM2:{value:0.35,low:0.30,high:0.40},basementSteelKgPerM2:{value:75,low:60,high:90},basementConcreteM3PerM2:{value:0.55,low:0.45,high:0.70}}
}, {});
assert.equal(settingsPriority.lines.find(l=>l.code==='03.01').quantity,12,'steelFactor 0.12 t/m² must produce 12 t for 100 m²');
assert.equal(settingsPriority.lines.find(l=>l.code==='03.02').quantity,50,'concreteFactor 0.5 m³/m² must produce 50 m³ for 100 m²');
const basementPriority = engine.buildEstimate({ ...project, area:100, floors:1, basement:true }, toyCatalog, {
  steelFactor:0.12, concreteFactor:0.5, basementSteelFactor:0.09, basementConcreteFactor:0.65, supervision:10, staleDays:90,
  modelRates:{steelKgPerM2:{value:80,low:60,high:100},concreteM3PerM2:{value:0.35,low:0.30,high:0.40},basementSteelKgPerM2:{value:75,low:60,high:90},basementConcreteM3PerM2:{value:0.55,low:0.45,high:0.70}}
}, {});
assert.equal(basementPriority.lines.find(l=>l.code==='03.01').quantity,21,'basement uses a separate 0.09 t/m² footprint rate in addition to the 12 t above-ground estimate');
assert.equal(basementPriority.lines.find(l=>l.code==='03.02').quantity,115,'basement uses a separate 0.65 m³/m² footprint rate in addition to 50 m³ above-ground');

const toy = engine.buildEstimate({ type: 'residential', pack: 'semi', scope: 'structure', area: 100, floors: 1, rooms: 2, basement: false, elevator: false, mode: 'supervision', steelChoice: 'حديد استثماري', concreteGrade: 'C25' }, toyCatalog, { steelFactor: 0.05, concreteFactor: 0.3, supervision: 10, staleDays: 90 }, { '03.03': 0 });
assert.ok(toy.directSubtotalLow <= toy.directSubtotal && toy.directSubtotal <= toy.directSubtotalHigh);
assert.equal(toy.feeRate, 10);
assert.ok(Math.abs(toy.total - toy.directSubtotal * 1.1) < 0.001);

// A line with no price and no quantity must appear in both independent gap lists.
const doubleGap = result.lines.find(l => l.code === '02.01');
assert.ok(doubleGap && !doubleGap.priced && doubleGap.quantity === null);
assert.ok(result.unresolvedPriceLines.some(l => l.code === '02.01'));
assert.ok(result.unresolvedQuantityLines.some(l => l.code === '02.01'));

const audit = engine.auditCatalog(prices, settings, new Date('2026-10-19T00:00:00'));
assert.equal(audit.total, prices.filter(p => p.active !== false).length);
assert.ok(audit.missing > 0 && audit.national > 0);
assert.ok(audit.byDivision.some(d => d.code === '02' && d.name.includes('الحفر')));
console.log(`BENO engine tests passed: ${result.lines.length} BOQ lines; ${result.unresolvedPriceLines.length} price gaps; ${result.unresolvedQuantityLines.length} quantity gaps; range and fee logic valid.`);
