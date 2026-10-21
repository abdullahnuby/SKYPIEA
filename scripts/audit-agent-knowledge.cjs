'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const rates = require('../engines/miyar-rates.js');
const takeoff = require('../engines/miyar-takeoff.js');
const models = require('../engines/miyar-project-models.js');
const engine = require('../engines/miyar-engine.js');
const kb = require('../api/_lib/boq-knowledge.cjs');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'api/_data');
const books = fs.readdirSync(dir).map(name => ({name,match:name.match(/^price-book\.v(\d+)\.json$/)})).filter(x=>x.match).sort((a,b)=>Number(b.match[1])-Number(a.match[1]));
if (!books.length) throw new Error('No price book found.');
const file = path.join(dir, books[0].name);
const book = JSON.parse(fs.readFileSync(file,'utf8'));
const extendedPath = path.join(dir,'price-book-extended.v1.json');
const extendedDoc = fs.existsSync(extendedPath) ? JSON.parse(fs.readFileSync(extendedPath,'utf8')) : { rows: [] };
const extendedRows = Array.isArray(extendedDoc.rows) ? extendedDoc.rows : [];
const active = book.prices.filter(r=>r && r.active!==false);
const visible = active.filter(r=>r.searchable!==false);
const errors=[]; const warnings=[];
const requireCondition=(condition,message)=>{if(!condition)errors.push(message);};
requireCondition(books[0].name==='price-book.v8.json', 'v8 compact operational catalogue must be the latest price book');
requireCondition(!active.some(r=>/^J26-/.test(String(r.id||''))), 'extended January bulletin rows must not be active in the operational catalogue');
requireCondition(extendedRows.length===291, `expected 291 preserved extended bulletin rows; found ${extendedRows.length}`);
requireCondition(extendedRows.every(r=>r.active===false && r.searchable===false && r.catalogTier==='extended_archive'), 'extended catalogue rows must be archived and excluded from default search');
const canonicalCategories = new Set(kb.data.canonicalCategories);
const workPackages = new Set(kb.data.workPackages.map(x=>x.key));
for (const row of active) {
  const label = `${row.id||'?'} ${row.name||'(unnamed)'}`;
  for (const key of ['workPackage','tradeCode','itemKind','priceScope','knowledgeVersion']) requireCondition(!!row[key], `${label}: missing ${key}`);
  requireCondition(workPackages.has(row.workPackage), `${label}: unknown workPackage ${row.workPackage}`);
  requireCondition(canonicalCategories.has(row.category), `${label}: non-canonical category ${row.category}`);
  requireCondition(Array.isArray(row.aliases), `${label}: aliases must be an array`);
  if (row.status==='missing') requireCondition(row.avg==null && row.low==null && row.high==null, `${label}: a missing price must remain empty`);
  if (row.active!==false && row.status!=='missing') requireCondition(Number.isFinite(Number(row.avg)) && Number(row.avg)>0, `${label}: active price is invalid`);
}
const byId=new Map(book.prices.map(r=>[r.id,r]));
for(const id of book.knowledgeBase?.deactivatedDuplicateOrConflictingRows||[]) {
  const row=byId.get(id);
  requireCondition(!!row && row.active===false && !!row.canonicalId && !!row.deprecatedReason, `${id}: deactivated row needs canonicalId and a reason`);
  const target=byId.get(row?.canonicalId);
  requireCondition(!!target && target.active!==false, `${id}: canonical target ${row?.canonicalId} is not active`);
}
const dupes=kb.duplicateAudit(book.prices);
requireCondition(dupes.length===0, `active identical rows remain: ${JSON.stringify(dupes)}`);
const takeoffAliases={
  puttyKgPerM2:'puttyKgPerM2Surface', sealerLPerM2:'sealerLPerM2Surface',
  interiorPaintLPerM2:'interiorPaintLPerM2Surface', plasterCementKgPerM2:'plasterCementKgPerM2Surface',
  plasterSandM3PerM2:'plasterSandM3PerM2Surface', tileWaste:'tileWaste',
  tileCementKgPerM2:'floorTileCementKgPerM2', tileSandM3PerM2:'floorTileSandM3PerM2'
};
const modelAliases={
  plasterM2PerM2Built:'plasterSurfaceM2PerM2Built', puttyKgPerM2Apartment:'puttyKgPerM2Surface',
  sealerLPerM2Apartment:'sealerLPerM2Surface', paintLPerM2Apartment:'interiorPaintLPerM2Surface',
  floorTileM2PerM2Apartment:'floorTileM2PerM2Apartment', wetTileM2PerM2Apartment:'wetTileM2PerM2Apartment',
  tileCementKgPerM2:'floorTileCementKgPerM2', tileSandM3PerM2:'floorTileSandM3PerM2'
};
for(const d of takeoff.getRateDefinitions()) requireCondition(!!rates.defaults[takeoffAliases[d.key]||d.key], `takeoff rate ${d.key} has no central default`);
for(const d of models.RATE_DEFINITIONS) requireCondition(!!rates.defaults[modelAliases[d.key]||d.key], `project model rate ${d.key} has no central default`);
for(const group of kb.data.materialSynonyms) {
  const normalized=group.terms.map(kb.normalize);
  if(group.key==='sand') requireCondition(!normalized.includes('سن') && !normalized.includes('زلط'), 'sand aliases must not include the aggregate synonym "سن/زلط"');
  if(group.key==='ceramic') requireCondition(!normalized.includes('جرانيت') && !normalized.includes('رخام'), 'ceramic aliases must not contain granite or marble');
}
for(const pkg of kb.data.workPackages) {
  requireCondition(!!pkg.key && !!pkg.label && !!pkg.category && !!pkg.lineStructure, `incomplete work package ${pkg.key}`);
  requireCondition(typeof pkg.wastePolicy==='string', `${pkg.key}: missing waste policy`);
}
const report={
  generatedAt:new Date().toISOString(), version:'1.0.0-alpha.8',
  activePriceBook:books[0].name, priceBookVersion:book.version,
  rows:book.prices.length, activeRows:active.length, visibleRows:visible.length, extendedArchiveRows:extendedRows.length,
  pricedRows:active.filter(r=>r.status!=='missing' && Number.isFinite(Number(r.avg)) && Number(r.avg)>0).length,
  openPriceGaps:active.filter(r=>r.status==='missing'||r.avg==null).map(r=>({id:r.id,name:r.name,unit:r.unit})),
  normalizedCategories:[...new Set(active.map(r=>r.category))].sort(),
  workPackageCounts:active.reduce((out,r)=>(out[r.workPackage]=(out[r.workPackage]||0)+1,out),{}),
  deactivatedDuplicateRows:(book.knowledgeBase?.deactivatedDuplicateOrConflictingRows||[]).map(id=>({id,canonicalId:byId.get(id)?.canonicalId,reason:byId.get(id)?.deprecatedReason})),
  identicalActiveRows:dupes,
  centralizedRateCount:Object.keys(rates.defaults).length,
  workPackageRuleCount:kb.data.workPackages.length,
  materialSynonymGroupCount:kb.data.materialSynonyms.length,
  knowledgeHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'api/_data/boq-knowledge.v1.json'))).digest('hex'),
  errors,warnings,
  interpretation:'This validates schema organization and deterministic matching, not current local market prices or project-specific quantity approval.'
};
if(process.argv.includes('--check')) {
  if(errors.length){console.error(`Agent knowledge audit failed (${errors.length} issue(s)):\n${errors.map(x=>'- '+x).join('\n')}`);process.exitCode=1;}
  else console.log(`Agent knowledge audit passed: ${book.priceBookVersion}; ${active.length} active core rows; ${extendedRows.length} extended rows archived; ${workPackages.size} work packages; ${Object.keys(rates.defaults).length} central rates; ${report.deactivatedDuplicateRows.length} duplicate/conflicting rows inactive; ${report.openPriceGaps.length} unpriced gaps remain.`);
} else {
  fs.writeFileSync(path.join(root,'AGENT-DATA-QUALITY-REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(errors.length) process.exitCode=1;
}
