'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const takeoff = require('../engines/miyar-takeoff.js');
global.MIYAR_TAKEOFF = takeoff;
const rates = require('../engines/miyar-rates.js');
const models = require('../engines/miyar-project-models.js');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'api', '_data', 'price-book.v1.json'), 'utf8'));
const prices = catalog.prices;
const settings = { ...(catalog.settings || {}), margin:15, supervision:10, staleDays:90, modelRates:{} };

assert.equal(models.MODEL_DEFINITIONS.length, 10, 'The ten specified service models must be available');
const knownCodes = new Set(models.MODEL_DEFINITIONS.map(m => m.code));
for (const code of ['APT-BRICK','APT-PLASTER','APT-PLASTER-MEP','APT-PAINT','APT-PARTIAL','BLD-NEW-RES','BLD-NEW-COM','BLD-NEW-MIX','BLD-STRUCTURE','BLD-FINISH']) {
  assert.ok(knownCodes.has(code), `Missing service model ${code}`);
}
function project(modelCode, overrides={}) {
  return {
    modelCode, package:'medium', marginMode:'supervision', quoteBasis:'average',
    apartmentArea:120, apartmentCount:1, bathrooms:2, kitchen:true, kitchenLm:4,
    ac:false, gypsum:true, sanitary:true, completed:{}, concreteMethod:'site_mix', concreteGrade:'C25',
    steelName:'حديد استثماري', foundationSystem:'isolated', soil:'normal', basement:false,
    groundwater:false, includeBasicPlaster:false,
    floors:[
      {key:'ground',label:'الدور الأرضي',area:100,units:2,usage:'commercial',formworkArea:100,halfBrickArea:20,fullBrickArea:10,facadeArea:30,acUnits:2},
      {key:'first',label:'الدور الأول',area:80,units:2,usage:'residential',formworkArea:80,halfBrickArea:15,fullBrickArea:5,facadeArea:25,acUnits:2}
    ],
    ...overrides
  };
}
const build = (p, o={}) => models.buildEstimate(p, prices, settings, o);
const codes = result => result.lines.map(x => x.code);
const line = (result, code) => result.lines.find(x => x.code === code);

// Optional finishing selections are conditional additions, not silently ignored.
for (const code of ['APT-BRICK','APT-PLASTER','APT-PLASTER-MEP']) {
  const r=build(project(code));
  assert.ok(r.lines.some(x=>x.code==='apartment-KITCHEN'), `${code}: kitchen option should generate a kitchen line`);
  assert.ok(r.lines.some(x=>x.code==='apartment-GYPSUM'), `${code}: gypsum option should generate gypsum line`);
}
const paintOnly=build(project('APT-PAINT'));
assert.ok(paintOnly.lines.some(x=>x.code==='apartment-PAINT'));
assert.ok(!paintOnly.lines.some(x=>/FLOOR-TILE|WET-TILE|DOORS|WINDOWS|SANITARY|KITCHEN|GYPSUM/.test(x.code)), 'Ready-for-paint model must not add items outside its scope');
assert.ok(!paintOnly.lines.some(x=>x.division==='المحارة والبياض'), 'Ready-for-paint must exclude plaster materials/labor');

const partial=build(project('APT-PARTIAL',{completed:{plaster:true,electrical:true,flooring:false}}));
assert.ok(!partial.lines.some(x=>/PLASTER/.test(x.code)), 'Completed plaster must remove plaster and related materials');
assert.ok(!partial.lines.some(x=>/ELEC/.test(x.code)), 'Completed electricity must remove electrical lines');
assert.ok(partial.lines.some(x=>/FLOOR-TILE/.test(x.code)), 'Uncompleted floors should remain included');

// A building's structural rates are applied to each floor once, not total area multiplied by floors a second time.
const building=build(project('BLD-NEW-RES',{concreteMethod:'site_mix',floors:[
  {key:'ground',label:'الدور الأرضي',area:100,units:2,usage:'residential',formworkArea:100,halfBrickArea:20,fullBrickArea:10,facadeArea:30},
  {key:'first',label:'الدور الأول',area:80,units:2,usage:'residential',formworkArea:80,halfBrickArea:15,fullBrickArea:5,facadeArea:25}
]}));
assert.equal(building.totalAboveGradeArea,180);
assert.equal(line(building,'ground-STRUCT-CONCRETE-CONCRETE-REF').quantity,35);
assert.equal(line(building,'first-STRUCT-CONCRETE-CONCRETE-REF').quantity,28);
assert.equal(line(building,'ground-STRUCT-STEEL').quantity,8);
assert.equal(line(building,'first-STRUCT-STEEL').quantity,6.4);
assert.equal(line(building,'ground-STRUCT-STEEL-WIRE').quantity,80,'8 tonnes steel × unified center 10 kg binding wire/tonne = 80 kg');
assert.equal(line(building,'ground-STRUCT-STEEL-WIRE').quantityLow,48,'wire lower bound combines 60 kg/m² steel and 8 kg/tonne wire');
assert.equal(line(building,'ground-STRUCT-STEEL-WIRE').quantityHigh,120,'wire upper bound combines 100 kg/m² steel and 12 kg/tonne wire');
assert.equal(line(building,'FOUND-EXC').quantity,12, 'Excavation uses footprint, not total repeated-floor area');
assert.equal(line(building,'FOUND-CONCRETE-CONCRETE-REF').quantity,8, 'Foundations use footprint once');
assert.ok(building.lines.some(x=>x.floorKey==='first'&&x.code==='first-STRUCT-CONCRETE-COMBINED-LAB'&&x.item==='مصنعية الهيكل الخرساني — حدادة ونجارة وشدة وصب'));
assert.ok(!building.lines.some(x=>/STEEL-FIX-LAB|FORMWORK-LAB|CONCRETE-POUR-LAB/.test(x.code)), 'The full structural labor scope is priced once per m³; no duplicate labor lines.');
assert.ok(building.lines.some(x=>x.item==='قائمة طلب توريد' )===false, 'No spurious synthetic cost rows');

const readyMix=build(project('BLD-NEW-RES',{concreteMethod:'ready_mix'}));
assert.ok(readyMix.lines.some(x=>x.code==='ground-STRUCT-CONCRETE-READY'&&x.unit==='م³'));
assert.ok(!readyMix.lines.some(x=>/STRUCT-CONCRETE-CEMENT|STRUCT-CONCRETE-SAND|STRUCT-CONCRETE-AGG/.test(x.code)), 'Ready-mix must not double count constituents');
assert.ok(readyMix.lines.some(x=>x.code==='ground-STRUCT-CONCRETE-COMBINED-LAB'), 'Ready-mix still uses one combined structural labor line per m³.');
assert.ok(!readyMix.lines.some(x=>/CONCRETE-POUR-LAB|STEEL-FIX-LAB|FORMWORK-LAB/.test(x.code)), 'No duplicate structural labor line exists in ready-mix mode.');

const structure=build(project('BLD-STRUCTURE',{includeBasicPlaster:false}));
assert.ok(structure.lines.some(x=>/STRUCT-STEEL/.test(x.code)));
assert.ok(structure.lines.some(x=>/BRICK/.test(x.code)));
assert.ok(!structure.lines.some(x=>/FLOOR-TILE|PAINT|KITCHEN|SANITARY|WINDOWS/.test(x.code)), 'Structure-only model excludes final finish');
assert.ok(!structure.lines.some(x=>x.code==='ground-PLASTER'), 'Basic plaster is excluded unless explicitly selected');
const structureWithPlaster=build(project('BLD-STRUCTURE',{includeBasicPlaster:true}));
assert.ok(structureWithPlaster.lines.some(x=>x.code==='ground-PLASTER'));

const commercial=build(project('BLD-NEW-COM',{concreteMethod:'ready_mix'}));
assert.ok(commercial.lines.some(x=>x.code==='ground-COM-STOREFRONT'));
assert.ok(commercial.lines.some(x=>x.code==='ground-COM-FIRE'));
assert.ok(!commercial.lines.some(x=>/KITCHEN|APT-DOORS|apartment-DOORS/.test(x.code)), 'Commercial floor does not inherit apartment finishes');
const mixed=build(project('BLD-NEW-MIX',{concreteMethod:'ready_mix'}));
assert.ok(mixed.lines.some(x=>x.code==='ground-COM-STOREFRONT'), 'Commercial-use floor should use commercial rules');
assert.ok(mixed.lines.some(x=>x.code.startsWith('first-')&&x.item.startsWith('أبواب داخلية')), 'Residential-use floor should use residential unit model');

const existing=build(project('BLD-FINISH',{concreteMethod:'ready_mix',deliveryCondition:'APT-PLASTER',completed:{electrical:true}}));
assert.ok(!existing.lines.some(x=>/STRUCT-STEEL|STRUCT-CONCRETE|FOUND-STEEL|FOUND-CONCRETE/.test(x.code)), 'Existing-building finishing must not reprice structure');
assert.ok(!existing.lines.some(x=>x.code.startsWith('ground-')&&/PLASTER-CEMENT|PLASTER-SAND/.test(x.code)), 'Existing unit received on plaster must not include plaster work');
assert.ok(!existing.lines.some(x=>/ELEC/.test(x.code)), 'Explicit completed work stays excluded');

// Unknown or malformed model identifiers must never be considered quote-ready.
const unknown=build(project('BLD-IMAGINARY'));
assert.ok(unknown.notes.some(x=>x.includes('رمز النموذج غير معروف')));
assert.equal(unknown.contractReady,false);
assert.equal(unknown.canQuoteFinal,false);

// Quantity overrides affect costs and remain explicit; rate validation catches impossible bounds.
const baseAPT=build(project('APT-BRICK'));
const materialLine=baseAPT.lines.find(x=>x.code==='apartment-FLOOR-TILE');
assert.ok(materialLine);
const overridden=build(project('APT-BRICK'),{[materialLine.code]:123});
assert.equal(line(overridden,materialLine.code).quantity,123);
assert.ok(models.validateRateSettings({steelKgPerM2:{value:80,low:100,high:60}}).length>=1, 'Invalid rate ranges must be rejected');
assert.ok(models.RATE_DEFINITIONS.length>=30);

// Unified per-surface paint rates, integer internal door schedule, tile waste on supply only, and no double-counted common area.
const apartment120=build(project('APT-BRICK',{apartmentArea:120,apartmentCount:1,roomsPerApartment:3,bathrooms:2,kitchen:true,modelCode:'APT-BRICK'}));
assert.ok(Math.abs(line(apartment120,'apartment-PAINT').quantity-38.544)<1e-8,'120 m² × 2.2 paint surface factor × unified 0.146 L/m² = 38.544 L');
assert.ok(Math.abs(line(apartment120,'apartment-SEALER').quantity-26.4)<1e-8,'Sealer is based on 264 m² of paintable surface, not gross apartment area');
assert.ok(Math.abs(line(apartment120,'apartment-PUTTY').quantity-198)<1e-8,'Putty is based on 264 m² of paintable surface at 0.75 kg/m²');
assert.equal(line(apartment120,'apartment-DOORS').quantity,6,'3 rooms + 2 bathrooms + kitchen door = six integer internal doors');
assert.equal(line(apartment120,'apartment-FLOOR-TILE').quantity,90,'Net floor area uses 75% planning factor');
assert.equal(line(apartment120,'apartment-FLOOR-TILE').billableQuantity,96.75,'7.5% waste applies to tile purchase only');
assert.equal(line(apartment120,'apartment-FLOOR-TILE-LAB').quantity,90,'Waste must not inflate installation labor');
const commonAreaProject=project('BLD-NEW-RES',{concreteMethod:'ready_mix',roomsPerApartment:3,floors:[
 {key:'ground',label:'الدور الأرضي',area:220,units:2,usage:'residential',commonArea:20,formworkArea:220,halfBrickArea:20,fullBrickArea:10,facadeArea:30},
]});
const commonAreaEstimate=build(commonAreaProject);
assert.equal(line(commonAreaEstimate,'ground-STAIR-MAT').quantity,20,'Stair/common material uses measured common area, not an added percentage of gross floor');
assert.equal(line(commonAreaEstimate,'ground-STAIR-LAB').quantity,20,'Stair/common installation labor uses the same net measured area.');
assert.equal(line(commonAreaEstimate,'ground-FLOOR-TILE').quantity,150,'Unit finishes exclude 20 m² common area: (220-20)×0.75');
const unmeasuredCommon=build(project('BLD-NEW-RES',{concreteMethod:'ready_mix',floors:[{key:'ground',label:'الأرضي',area:220,units:2,usage:'residential',formworkArea:220,halfBrickArea:20,fullBrickArea:10,facadeArea:30}]}));
assert.equal(line(unmeasuredCommon,'ground-STAIR-MAT').quantity,null,'Do not invent common-area quantity if it is not measured');
assert.equal(line(unmeasuredCommon,'ground-STAIR-LAB').quantity,null,'The labor line must remain unmeasured with the material line.');
const elevatorEstimate=build(project('BLD-FINISH',{elevator:true,concreteMethod:'ready_mix',floors:[{key:'ground',label:'الأرضي',area:100,units:1,usage:'residential',formworkArea:100,facadeArea:20}]}));
assert.equal(line(elevatorEstimate,'PROJECT-ELEVATOR').unitPrice,null,'Elevator supply must not fall back to a combined supply+installation price when labor is separately priced');
assert.equal(line(elevatorEstimate,'PROJECT-ELEVATOR').priceGap,true,'A supply-only price remains a visible gap unless a matching supply-only price is entered');
const zeroPriceCatalog=[{id:'Z',name:'سعر صفري',category:'تجريبي',unit:'م²',low:0,avg:0,high:0,date:'2026-10-20',source:'test',status:'local',active:true}];
const zeroLine=build(project('APT-PAINT'),zeroPriceCatalog).lines.find(x=>x.priceName==='سعر صفري');
assert.equal(zeroLine,undefined,'Zero-price test uses no matching candidate; no arbitrary extra row should be created');
assert.equal(require('../engines/miyar-rates.js').hasUsablePrice(zeroPriceCatalog[0]),false,'Zero must never be treated as a valid entered price');
assert.ok(require('../engines/miyar-rates.js').validatePriceInput({...zeroPriceCatalog[0],status:'local'}).length>0,'Price input must reject zero in the admin form');

// All engines read the same default centers/ranges for shared rates.
assert.equal(rates.getRate('steelKgPerM2',{}).value,80);
assert.equal(rates.getRate('concreteM3PerM2',{}).value,0.35);
assert.equal(rates.getRate('floorTileM2PerM2Apartment',{}).value,0.75);
assert.equal(rates.getRate('paintSurfaceM2PerM2Built',{}).value,2.2);
assert.equal(rates.getRate('bindingWireKgPerTonne',{}).value,10);
const clamped=rates.getRate('steelKgPerM2',{resourceRates:{steelKgPerM2:{low:100,high:100,value:80}}});
assert.equal(clamped.value,100,'Shared center is clamped when the saved range is collapsed');


console.log(`BENO project models frozen-engine tests passed: ${models.MODEL_DEFINITIONS.length} models; arithmetic, scopes, quantity gaps, and shared-rate consistency checked.`);
