'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rates = require('../engines/miyar-rates.js');
const takeoff = require('../engines/miyar-takeoff.js');
const legacy = require('../engines/miyar-engine.js');
const engine = require('../api/_lib/engine.cjs');
const kb = require('../api/_lib/boq-knowledge.cjs');
const root = path.resolve(__dirname, '..');
const candidates = fs.readdirSync(path.join(root,'api/_data')).map(name=>({name,m:name.match(/^price-book\.v(\d+)\.json$/)})).filter(x=>x.m).sort((a,b)=>Number(b.m[1])-Number(a.m[1]));
const book = JSON.parse(fs.readFileSync(path.join(root,'api/_data',candidates[0].name),'utf8'));
const byId = new Map(book.prices.map(row=>[row.id,row]));

assert.equal(book.priceBookVersion,'v8','active book is the compact v8 core catalog');
assert.ok(book.knowledgeBase && book.knowledgeBase.version === kb.data.schemaVersion,'active catalog declares the knowledge-base version');
assert.equal(book.prices.length,201,'active operational file excludes the long-tail bulletin import');
assert.equal(book.prices.filter(row=>row.active!==false).length,183,'default agent matching is limited to the operational core');
assert.ok(!book.prices.some(row=>/^J26-/.test(String(row.id||''))),'bulletin variants do not appear in the operational file');
const extendedPath=path.join(root,'api','_data','price-book-extended.v1.json');
const extended=JSON.parse(fs.readFileSync(extendedPath,'utf8'));
assert.equal(extended.rows.length,291,'extended bulletin rows remain archived');
assert.ok(extended.rows.every(row=>row.active===false&&row.searchable===false),'archived rows cannot match by default');
assert.ok(book.prices.filter(row=>row.active!==false).every(row=>row.workPackage&&row.tradeCode&&row.itemKind&&row.priceScope),'all active rows have structured classifications');
assert.ok(book.prices.filter(row=>row.active!==false).every(row=>kb.data.canonicalCategories.includes(row.category)),'active catalog uses only canonical trade categories');
assert.deepEqual(kb.duplicateAudit(book.prices),[],'no identical active searchable rows remain');

for (const [id, canonicalId] of [['B26-001','P033'],['B26-002','P056'],['B26-005','P146'],['B26-006','P146'],['P131','P041'],['P160','P020'],['P153','P050'],['P159','P027']]) {
  assert.equal(byId.get(id).active,false,`${id} is inactive because it duplicates another record`);
  assert.equal(byId.get(id).canonicalId,canonicalId,`${id} keeps a traceable canonical reference`);
  assert.equal(byId.get(canonicalId).active,true,`${canonicalId} remains active`);
}
assert.equal(byId.get('P154').active,false,'same-name row with conflicting unit is blocked from selection');
assert.equal(byId.get('P154').canonicalId,'P123');
assert.equal(byId.get('P041').priceScope,'derived_reference_not_market_quote','derived plumbing point price remains explicitly non-market');
assert.equal(byId.get('B26-003').priceScope,'derived_reference_not_execution_boq','area-based electrical budget estimate is not treated as an execution takeoff');
assert.equal(byId.get('P162').priceScope,'unpriced_gap','all-inclusive excavation price remains a gap until a matching quote exists');
assert.deepEqual(byId.get('P162').includes,['تشغيل الحفار الآلي','تحميل ناتج الحفر','نقل ناتج الحفر وفق مسافة ومقلب محددين في العرض']);

// Compatibility: historical estimate names resolve to canonical active rows.
const rows = book.prices;
for (const [oldName, unit, canonicalId, expectedPrice] of [
  ['مصنعية محارة','م²','P033',67.5],
  ['تركيب سيراميك','م²','P056',225],
  ['مصنعية تركيب جبس بورد','م²','P146',265],
  ['مصنعية تأسيس سباكة — نقطة','نقطة','P041',545.45],
  ['باب خشب داخلي','باب','P050',3500],
  ['أجرة مضخة خرسانة','مشروع','P020',850],
  ['أطقم صحية — اقتصادي','طقم','P156',6000],
  ['فحص تربة','مشروع','P027',3500]
]) {
  const found = takeoff.lookupPrice(rows,[oldName],unit,book.settings);
  assert.equal(found.priceName,byId.get(canonicalId).name,`${oldName} resolves to ${canonicalId}`);
  assert.equal(found.unitPrice,expectedPrice,`${oldName} price is kept unit-compatible`);
}
assert.equal(legacy.findByName(rows,'مصنعية محارة').id,'P033','legacy estimate lookup resolves canonical alias');
const conflict=takeoff.lookupPrice(rows,['خلاط اقتصادي محلي'],'طقم حمام',book.settings);
assert.equal(conflict.priceStatus,'missing','single mixer price cannot be used as a bathroom set rate');
assert.equal(conflict.unitMismatch,true,'wrong unit is exposed instead of silently converted');

const materialGroup = key => kb.data.materialSynonyms.find(group=>group.key===key);
assert.ok(!materialGroup('sand').terms.map(kb.normalize).includes('سن'),'sand does not treat aggregate slang as sand');
assert.ok(!materialGroup('ceramic').terms.map(kb.normalize).some(term=>['جرانيت','رخام'].includes(term)),'granite/marble are not ceramic synonyms');
assert.ok(materialGroup('aggregate').terms.map(kb.normalize).includes('سن'),'"سن" is classified as aggregate');
assert.ok(materialGroup('granite').terms.map(kb.normalize).includes('جرانيت'),'granite has its own synonym group');

const central = rates.defaults;
assert.ok(Object.keys(central).length >= 65,'resource consumption values are centralized instead of scattered between models');
for (const d of takeoff.getRateDefinitions()) {
  const aliases={puttyKgPerM2:'puttyKgPerM2Surface',sealerLPerM2:'sealerLPerM2Surface',interiorPaintLPerM2:'interiorPaintLPerM2Surface',plasterCementKgPerM2:'plasterCementKgPerM2Surface',plasterSandM3PerM2:'plasterSandM3PerM2Surface',tileWaste:'tileWaste',tileCementKgPerM2:'floorTileCementKgPerM2',tileSandM3PerM2:'floorTileSandM3PerM2'};
  assert.ok(central[aliases[d.key]||d.key],`takeoff rate ${d.key} has a central definition`);
}
for (const pkg of kb.data.workPackages) {
  assert.ok(pkg.requiredLines?.length,`${pkg.key} declares clear major BOQ lines`);
  assert.ok(pkg.wastePolicy,`${pkg.key} declares how waste is applied`);
}
const paint=kb.data.workPackages.find(pkg=>pkg.key==='painting_system');
assert.ok(paint.laborIncludes.includes('السيلر/البرايمر حسب النظام')===false || paint.laborIncludes.includes('تجهيز السطح'),'paint work has a complete labor scope');
assert.ok(paint.materialComponents.includes('دهان/بلاستيك نهائي'),'paint materials are defined as a component list, not disconnected BOQ trades');
const result=engine.handleTool({tool:'price-catalog.search',state:{},args:{query:'جرانيت'},sessionId:'agent-knowledge-test'});
assert.equal(result.found,true,'catalog material search works using the centralized synonym dataset');
assert.ok(result.results.every(row=>row.workPackage==='floor_wall_finishes'),'search result exposes canonical work package');
const extendedOnlyResult=engine.handleTool({tool:'price-catalog.search',state:{},args:{query:'سيكوريت أزرق فاتح عاكس'},sessionId:'agent-extended-archive-test'});
assert.equal(extendedOnlyResult.found,false,'bulletin-only variants must not leak into default agent search while stored in the extended archive');
assert.ok(result.results.every(row=>!['B26-002','B26-005','B26-006'].includes(row.priceId)),'deactivated duplicate bridge rows are not exposed by agent search');
console.log('Agent knowledge tests passed: canonical taxonomy, duplicate cleanup, alias compatibility, unit guards, rate centralization, and domain synonym separation.');
