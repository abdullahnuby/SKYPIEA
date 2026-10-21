'use strict';
const assert = require('node:assert/strict');
const engine = require('../api/_lib/engine.cjs');
const taxonomy = require('../engines/miyar-wbs.js');
const explainer = require('../engines/beno-explain.js');

const result = engine.handleTool({
  tool: 'estimate.run',
  state: {
    service: 'apartment', modelCode: 'APT-BRICK', type: 'residential',
    pack: 'medium', scope: 'finishing', area: 100, apartmentArea: 100,
    apartmentCount: 1, rooms: 3, roomsPerApartment: 3, bathrooms: 2, floors: 1
  },
  args: {}, sessionId: 'boq-organization-test'
});
const view = result.estimate;
assert.ok(Array.isArray(view.workBreakdown), 'estimate exposes a work-breakdown hierarchy');
assert.equal(view.lineCount, 31, 'the organized BOQ includes separately visible mortar-water quantity gaps without inventing consumption.');
assert.equal(view.workBreakdown.reduce((sum, stage) => sum + stage.lineCount, 0), view.lineCount,
  'every original line belongs to exactly one work stage');
assert.equal(view.workBreakdown.reduce((sum, stage) => sum + stage.packages.reduce((n, pkg) => n + pkg.lineCount, 0), 0), view.lineCount,
  'every original line belongs to exactly one work package');
assert.ok(view.summaryLineCount < view.lineCount, 'the engineer-facing BOQ is condensed while detailed resource lines remain available');
assert.equal(view.boqSummary.length, view.summaryLineCount, 'summary line count matches the compact BOQ');
assert.ok(view.boqSummary.every(row => row.lineCodes.length > 0), 'each main row links to its detailed component lines');
assert.ok(view.boqSummary.every(row => row.complete || row.missingPriceCount > 0 || row.missingQuantityCount > 0), 'incomplete main rows explain the missing input');

const finishing = view.workBreakdown.find(stage => stage.name === 'التشطيبات');
assert.ok(finishing, 'finishing work exists as a parent stage');
const paints = finishing.packages.find(pkg => pkg.name === 'أعمال الدهانات');
assert.ok(paints, 'paint materials and labor share one work package');
assert.equal(paints.lineCount, 4);
const paintLines = view.lines.filter(line => /PAINT|PUTTY|SEALER/.test(line.code));
assert.equal(paintLines.length, 4);
assert.ok(paintLines.every(line => line.section === 'التشطيبات' && line.category === 'أعمال الدهانات'));
assert.ok(paintLines.some(line => line.kind === 'labor'), 'paint labor is identified as labor within the paint package');
assert.ok(paintLines.some(line => line.kind === 'material'), 'paint materials are identified as materials within the paint package');

for (const [codePart, expectedGroup] of [
  ['FLOOR-TILE', 'سيراميك الأرضيات'],
  ['WET-TILE', 'سيراميك الحمامات والمطبخ']
]) {
  const tileLines = view.lines.filter(line => line.code.includes(codePart));
  assert.equal(tileLines.length, 5, `${codePart}: supply, labor, mortar components, and the explicit manual water-quantity line are preserved`);
  assert.ok(tileLines.every(line => line.section === 'التشطيبات' && line.category === expectedGroup));
}
assert.ok(!view.lines.some(line => ['مصنعيات التشطيبات', 'الأرضيات'].includes(line.category)),
  'legacy generic labor/flooring divisions are no longer presented as separate work packages');
assert.ok(view.lines.every(line => line.section && line.category && line.kindLabel),
  'each line exposes its phase, work package and kind');
assert.ok(view.lines.every((line, index, all) => index === 0 || taxonomy.compareLines(all[index - 1], line) <= 0),
  'lines are sorted by stable work-stage and package order');

const paintLabor = paintLines.find(line => line.kind === 'labor');
const narrative = explainer.explainLine(paintLabor).narrative;
assert.ok(narrative.includes('المرحلة: التشطيبات'));
assert.ok(narrative.includes('مجموعة العمل: أعمال الدهانات'));
assert.ok(narrative.includes('النوع: مصنعية'));

const building = engine.handleTool({
  tool: 'estimate.run',
  state: { service: 'building', modelCode: 'BLD-NEW-RES', type: 'residential', pack: 'medium', scope: 'turnkey', area: 150, plotArea: 150, floors: 2, unitsPerFloor: 1, rooms: 3, bathrooms: 2 },
  args: {}, sessionId: 'boq-building-organization-test'
}).estimate;
assert.equal(building.workBreakdown.reduce((sum, stage) => sum + stage.lineCount, 0), building.lineCount);
assert.ok(building.lines.every(line => line.section !== 'غير مصنف' && line.category !== 'أعمال غير مصنفة'),
  'building model lines are assigned to explicit phases and work packages');
const stairLines = building.lines.filter(line => /STAIR/.test(line.code));
assert.equal(stairLines.length, 4, 'each floor has a separate marble supply and installation-labor line');
assert.ok(stairLines.every(line => line.section === 'التشطيبات' && line.category === 'الرخام والجرانيت' && ['material','labor'].includes(line.kind)),
  'stair/common finishes are separated into raw material and labor under one coherent marble package.');
assert.ok(building.workBreakdown.some(stage => stage.name === 'أعمال الموقع' && stage.packages.some(pkg => pkg.name === 'المرافق والشبكات العامة')),
  'public utilities are shown under site works instead of an unclassified group');
assert.ok(building.summaryLineCount < building.lineCount * 0.4, 'building BOQ presents fewer than 40% as many main rows as detailed component lines');
const bindingWire = building.lines.find(line => /STRUCT-STEEL-WIRE/.test(line.code));
assert.ok(bindingWire && bindingWire.section === 'الهيكل الخرساني' && bindingWire.category === 'الخرسانة المسلحة',
  'structural binding wire must not be misclassified as electrical cable due to the word WIRE');
assert.ok(!building.boqSummary.some(row => row.category === 'مساحات الدور والوحدات'), 'note-only project metadata is hidden from the main BOQ');

console.log('BOQ organization tests passed: apartment/building work hierarchy, coherent material/labor groups, ordered lines, and clear explanations.');
