'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const takeoff = require('../engines/miyar-takeoff.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'api', '_data', 'price-book.v1.json'), 'utf8'));
const prices = data.prices;
const settings = { ...data.settings, staleDays: 90, resourceRates: {} };
const floor = {
  key:'floor-0', label:'الأرضي', area:100, isBasement:false,
  concreteM3:null, steelTonnes:null,
  halfBrickArea:20, fullBrickArea:10, plasterArea:80, splashArea:50,
  tileArea:80, wallTileArea:20, paintArea:240, exteriorPaintArea:50,
  gypsumArea:30, waterproofArea:0, formworkArea:100,
  interiorDoors:5, windowArea:12, marbleArea:4, switchSocketCount:20,
  acUnits:0, kitchenArea:null, electricalPoints:30, plumbingPoints:8,
  units:1, bathrooms:2
};
const project = { type:'residential', pack:'medium', scope:'turnkey', area:100, floors:1, rooms:3,
  unitsPerFloor:1, bathrooms:2, basement:false, elevator:false, kitchen:false, ac:false,
  sewerConnection:false, mode:'comprehensive', steelChoice:'حديد استثماري', concreteGrade:'C25', concreteMethod:'site_mix' };
const r = takeoff.buildMaterialTakeoff(project, [floor], prices, settings, {});
assert.ok(r.lines.length > 50, `Should emit detailed resource lines, got ${r.lines.length}`);
assert.ok(r.lines.some(x => x.item.includes('طوب أحمر لحائط نصف طوبة') && x.quantity === 1.1 && x.unit === 'ألف طوبة' && x.billableQuantity === 1.155), 'brick supply is measured in the catalog unit and waste applies to supply only');
assert.ok(r.lines.some(x => x.item === 'أسمنت خلط الخرسانة المسلحة'));
assert.ok(r.lines.some(x => x.item === 'رمل خلطة الخرسانة المسلحة'));
assert.ok(r.lines.some(x => x.item === 'زلط/سن خلطة الخرسانة المسلحة'));
assert.ok(r.lines.some(x => x.item.includes('حجم الخرسانة المسلحة') && x.kind === 'nonpriced'));
assert.ok(!r.lines.some(x => x.item.startsWith('خرسانة جاهزة')), 'Site mixing must not also price ready-mix concrete');
assert.ok(r.lines.some(x => x.key==='project::excavation' && x.item.includes('شامل الحفار والتحميل والنقل')), 'excavation is one inclusive m³ line');
assert.ok(!r.lines.some(x => x.key==='project::spoil_haul'), 'haul must not be priced twice outside the excavation line');
assert.ok(r.lines.some(x => x.key==='project::backfill_sand' && x.kind==='material'), 'backfill sand is a supply line');
assert.ok(r.lines.some(x => x.key==='project::backfill_labor' && x.kind==='labor'), 'backfill compaction is a separate labor line');
assert.ok(r.lines.some(x => x.item === 'مصنعية تركيب سيراميك أرضيات' && x.unitPrice === 105));
const areaSteel = r.lines.find(x => x.key === 'floor-0::steel_tonnes');
assert.equal(areaSteel.quantitySource, 'معدل تخطيطي متعارض في المصدر');
assert.ok(areaSteel.warnings.some(w => w.includes('لا تعتمد طلبية الحديد')));
assert.ok(r.resourceTotals.find(x => x.key === 'reinforcement_steel|طن|material').procurementReview, 'Rate conflict should be passed into the purchase-order state');
const tileOrder = r.resourceTotals.find(x => x.items && x.items.some(n => n.includes('سيراميك أرضيات')));
assert.ok(tileOrder && tileOrder.procurementReview, 'National substitute prices or unknown transport must gate actual purchase orders');
assert.ok(r.lines.some(x => x.item === 'حديد استثماري' && x.quantity === 8));
assert.ok(r.priceGaps.length > 0 && r.quantityGaps.length > 0);
assert.ok(r.rateConflicts.some(x => x.severity === 'critical' && x.title.includes('أسمنت الهيكل')));
assert.ok(r.rateConflicts.some(x => x.severity === 'critical' && x.title.includes('حديد التسليح')), 'Contradictory steel rules must be made visible');
const waterLine = r.lines.find(x => x.item === 'ماء خلط الخرسانة');
assert.ok(waterLine && waterLine.kind === 'nonpriced', 'Operational mix water is visible but not treated as a missing-priced procurement item');
assert.ok(!r.priceGaps.some(x => x.item === 'ماء خلط الخرسانة')); 
assert.ok(r.resourceTotals.some(x => x.item.startsWith('أسمنت') && x.unit === 'طن'));
assert.ok(r.supplyCost > 0 && r.laborCost > 0);

// The user can enter per-floor measured quantities. Their dependent concrete ingredients and binding wire must follow.
const rManual = takeoff.buildMaterialTakeoff(project, [{...floor, concreteM3:20, steelTonnes:7}], prices, settings, {});
const cement = rManual.lines.find(x => x.key === 'floor-0::concrete_cement');
const sand = rManual.lines.find(x => x.key === 'floor-0::concrete_sand');
const agg = rManual.lines.find(x => x.key === 'floor-0::concrete_aggregate');
const water = rManual.lines.find(x => x.key === 'floor-0::concrete_water');
assert.equal(cement.quantity, 7, '20 m3 reinforced concrete × 350 kg/m3 = 7 tonnes cement');
assert.equal(rManual.lines.find(x => x.key === 'floor-0::steel_tonnes').quantitySource, 'كمية مدخلة/حصر يدوي');
assert.equal(sand.quantity, 8);
assert.equal(agg.quantity, 16);
assert.equal(water.quantity, 3500);
const wire = rManual.lines.find(x => x.key === 'floor-0::binding_wire');
assert.equal(wire.quantity, 70, '7 tonnes × centralized interim midpoint 10 kg/t = 70 kg wire');

const rOverride = takeoff.buildMaterialTakeoff(project, [floor], prices, settings, {'floor-0::steel_tonnes':7});
assert.equal(rOverride.lines.find(x => x.key === 'floor-0::steel_tonnes').quantity, 7);
assert.equal(rOverride.lines.find(x => x.key === 'floor-0::binding_wire').quantity, 70, 'Manual rebar override must flow to binding wire using the shared rate');

// Two-floor resource roll-up: the purchase list must add each independently measured floor, not duplicate a project total.
const emptySurfaceFloor = (key, label, area, concreteM3, steelTonnes) => ({
  key, label, area, isBasement:false, concreteM3, steelTonnes,
  halfBrickArea:null, fullBrickArea:null, plasterArea:null, splashArea:null,
  tileArea:null, wallTileArea:null, paintArea:null, exteriorPaintArea:null,
  gypsumArea:null, waterproofArea:0, formworkArea:null, interiorDoors:null,
  windowArea:null, marbleArea:null, switchSocketCount:null, acUnits:null,
  kitchenArea:null, electricalPoints:null, plumbingPoints:null, units:1, bathrooms:0
});
const twoFloor = takeoff.buildMaterialTakeoff(project,[
  emptySurfaceFloor('floor-0','الأرضي',100,10,7),
  emptySurfaceFloor('floor-1','الدور الأول',60,6,3)
],prices,settings,{});
assert.equal(twoFloor.lines.find(x => x.key === 'floor-0::concrete_cement').quantity,3.5);
assert.equal(twoFloor.lines.find(x => x.key === 'floor-1::concrete_cement').quantity,2.1);
const cementRollup = twoFloor.resourceTotals.find(x => x.item === 'أسمنت — إجمالي كل البنود');
const sandRollup = twoFloor.resourceTotals.find(x => x.item === 'رمل — إجمالي كل البنود');
const aggRollup = twoFloor.resourceTotals.find(x => x.item === 'زلط/سن — إجمالي الخلطات');
assert.equal(cementRollup.knownQuantity,5.768,'Procurement roll-up includes the 3% cement supply waste exactly once (5.6 × 1.03).');
assert.equal(cementRollup.procurementReview,true,'The default site-mix cement recipe must remain gated for engineering review');
assert.equal(cementRollup.quantity,null,'Do not claim the full cement order while other cement-consuming areas remain unmeasured');
assert.equal(cementRollup.missingQuantity,true);
assert.equal(sandRollup.knownQuantity,6.72,'Procurement roll-up includes 5% sand supply waste exactly once (6.4 × 1.05).');
assert.equal(aggRollup.knownQuantity,13.44,'Procurement roll-up includes 5% aggregate supply waste exactly once (12.8 × 1.05).');
assert.ok(cementRollup.floors.includes('الأرضي') && cementRollup.floors.includes('الدور الأول'));

// Basement structural quantities use their own explicit planning rates, not the ordinary-floor rates.
// They remain preliminary and carry a warning that a drawing-based take-off is required.
const basementFloor = emptySurfaceFloor('basement','البدروم',100,null,null);
basementFloor.isBasement = true;
const basementResult = takeoff.buildMaterialTakeoff({...project, basement:true},[basementFloor],prices,settings,{});
assert.equal(basementResult.lines.find(x => x.key === 'basement::steel_tonnes').quantity,7.5,'100 m² × centralized 75 kg/m² basement center = 7.5 t');
assert.equal(basementResult.lines.find(x => x.key === 'basement::concrete_volume_reference').quantity,55,'100 m² × centralized 0.55 m³/m² basement center = 55 m³');
assert.equal(basementResult.lines.find(x => x.key === 'basement::steel_tonnes').quantityLow,6);
assert.equal(basementResult.lines.find(x => x.key === 'basement::steel_tonnes').quantityHigh,9);
assert.equal(basementResult.lines.find(x => x.key === 'basement::concrete_volume_reference').quantityLow,45);
assert.equal(basementResult.lines.find(x => x.key === 'basement::concrete_volume_reference').quantityHigh,70);
assert.ok(basementResult.lines.find(x => x.key === 'basement::steel_tonnes').warnings.some(w => w.includes('البدروم')));

// Ready-mix mode prices concrete as one supply line and must not double-count its mix ingredients.
const rReady = takeoff.buildMaterialTakeoff({...project, concreteMethod:'ready_mix'}, [floor], prices, settings, {});
assert.ok(rReady.lines.some(x => x.item === 'خرسانة جاهزة C25' && x.unit === 'م³'));
assert.ok(!rReady.lines.some(x => x.item === 'أسمنت خلط الخرسانة المسلحة'));
assert.ok(!rReady.lines.some(x => x.item === 'رمل خلطة الخرسانة المسلحة'));

// Price normalization and unit conversion.
assert.equal(takeoff.convertPriceValue(200,'شيكارة','طن'),4000);
assert.equal(takeoff.convertPriceValue(2000,'ألف طوبة','طوبة'),2);
assert.equal(takeoff.convertPriceValue(10,'متر','م'),10);
const price = takeoff.lookupPrice(prices, ['مصنعية كهرباء'], 'نقطة', settings);
assert.equal(price.unitPrice, 200);
const missing = takeoff.lookupPrice(prices, ['خرسانة جاهزة C25'], 'م³', settings);
assert.equal(missing.unitPrice, null);
assert.equal(missing.unitMismatch, undefined, 'A matching price record with no price is a price gap, not a unit mismatch');

const definitions = takeoff.getRateDefinitions();
assert.ok(definitions.length >= 30);
assert.deepEqual(takeoff.validateRateSettings({steelKgPerM2:{low:100,high:60}}).length, 1, 'Low/high constraints are validated');
assert.equal(takeoff.validateRateSettings({steelKgPerM2:{low:null,high:null}}).length, 1, 'Blank rate entries must be rejected, not silently treated as zero');
const changed = takeoff.buildMaterialTakeoff(project,[floor],prices,{...settings,resourceRates:{steelKgPerM2:{low:100,high:100}}},{});
assert.equal(changed.lines.find(x => x.key === 'floor-0::steel_tonnes').quantity,10);
console.log(`BENO takeoff tests passed: ${r.lines.length} resource lines; ${r.priceGaps.length} price gaps; ${r.quantityGaps.length} quantity gaps; ready-mix/site-mix, per-floor overrides, material conversions, and rate validation checked.`);
