'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const api=require('../api/_lib/engine.cjs');
const original={book:process.env.BENO_PRICE_BOOK_FILE,margin:process.env.BENO_MARGIN_PCT,mode:process.env.BENO_MARGIN_MODE,coverage:process.env.BENO_MIN_COVERAGE};
const state={service:'building',modelCode:'BLD-NEW-RES',type:'residential',pack:'medium',scope:'turnkey',area:180,floors:3,rooms:3,bathrooms:2,unitsPerFloor:1,basement:false,elevator:false,kitchen:false,ac:false,location:'الأقصر'};
function run(tool,args={},project=state){return api.handleTool({tool,state:project,args,sessionId:'test-session'});}
function checkNoPrivateFields(value){const json=JSON.stringify(value);assert.doesNotMatch(json,/"(?:margin|marginPct|marginRate|marginMode|settings|prices|priceBookFile|rawCatalog)"\s*:/i);assert.doesNotMatch(json,/BENO_MARGIN_PCT|SUPABASE_SERVICE_ROLE_KEY|"margin"\s*:\s*\d/i);}
try{
  process.env.BENO_MARGIN_PCT='17';process.env.BENO_MARGIN_MODE='comprehensive';process.env.BENO_MIN_COVERAGE='0.70';
  process.env.BENO_PRICE_BOOK_FILE=path.join(root,'api/_data/price-book.v1.json');
  const audit=run('price-catalog.audit',{});assert.equal(audit.priceBookVersion,'v1');assert.equal(audit.estimateId.length>10,true);assert.ok(audit.coveragePercent<70,'seed catalog remains partial');checkNoPrivateFields(audit);
  const partial=run('estimate.run',{});assert.equal(partial.estimate.readyToShowAmount,false);assert.equal(partial.estimate.amount,null);assert.ok(partial.estimate.priceGapCount>0);assert.ok(partial.estimate.lineCount>20);assert.equal(partial.priceBookVersion,'v1');assert.ok(partial.estimateId);checkNoPrivateFields(partial);
  const compare=run('package.compare',{packages:['economic','medium','luxury']});assert.equal(compare.packages.length,3);assert.ok(compare.packages.every(x=>x.coveragePercent<70&&x.amount===null));checkNoPrivateFields(compare);
  const search=run('price-catalog.search',{query:'حديد'},{});assert.equal(typeof search.found,'boolean');assert.ok(Array.isArray(search.results)||!search.found);checkNoPrivateFields(search);
  const takeoff=run('resource.takeoff',{});assert.ok(Array.isArray(takeoff.lines));checkNoPrivateFields(takeoff);
  const assumptions=run('project.assumptions',{});assert.ok(Array.isArray(assumptions.items));checkNoPrivateFields(assumptions);
  const extracted=run('conversation.extract',{message:'شقة تشطيب 120 متر 3 غرف و2 حمام اقتصادي على المفتاح',pending:null},{service:'apartment'});assert.equal(extracted.values.area,120);assert.equal(extracted.values.rooms,3);assert.equal(extracted.values.bathrooms,2);assert.equal(extracted.values.pack,'economic');checkNoPrivateFields(extracted);
  const building=run('estimate.run',{});const line=building.estimate.lines.find(x=>x.code);assert.ok(line);const explanation=run('boq.explain',{code:line.code});assert.equal(explanation.line.code,line.code);assert.ok(explanation.formula);checkNoPrivateFields(explanation);
  const scenario=run('scenario.evaluate',{changes:{elevator:true},approve:false});assert.equal(scenario.approved,false);assert.ok(scenario.before);assert.ok(scenario.after);checkNoPrivateFields(scenario);
  assert.throws(()=>run('estimate.run',{}, {...state,area:19}),/area must be between/);
  assert.throws(()=>run('estimate.run',{}, {...state,pack:'gold'}),/pack must be/);
  assert.throws(()=>run('estimate.run',{}, {...state,unknownThing:1}),/Unknown state field/);
  assert.throws(()=>run('price-catalog.search',{query:'حديد',extra:true},{}),/Unknown args field/);
  assert.throws(()=>run('estimate.run',{overrides:{'03.01':-2}}),/Invalid manual quantity/);
  assert.throws(()=>run('estimate.run',{overrides:{'sql;drop':4}}),/Invalid manual quantity/);
  assert.throws(()=>run('conversation.extract',{message:'x'.repeat(2001)}),/at most 2000/);

  // This fixture is strictly test-only and must not be imported by the publishing script.
  process.env.BENO_PRICE_BOOK_FILE=path.join(root,'tests/fixtures/price-book.complete.TEST-ONLY.json');
  const complete=run('estimate.run',{});assert.equal(complete.priceBookVersion,'TEST-ONLY-COMPLETE');assert.ok(complete.estimate.coveragePercent>=70);assert.equal(complete.estimate.priceGapCount>0,true);assert.equal(complete.estimate.quantityGapCount>0,true);assert.equal(complete.estimate.readyToShowAmount,false,'price coverage alone must not reveal a main amount when required gaps remain');assert.equal(complete.estimate.amount,null);assert.equal(complete.estimate.low,null);assert.equal(complete.estimate.high,null);checkNoPrivateFields(complete);
  assert.ok(JSON.parse(require('node:fs').readFileSync(process.env.BENO_PRICE_BOOK_FILE,'utf8')).testOnly===true);
  console.log(`API adapter tests passed: 9 tools exercised; partial=${partial.estimate.coveragePercent}% (no main value), fixture=${complete.estimate.coveragePercent}% (main amount blocked while required gaps remain); schema/secret checks passed.`);
}finally{
  for(const [k,v] of Object.entries({BENO_PRICE_BOOK_FILE:original.book,BENO_MARGIN_PCT:original.margin,BENO_MARGIN_MODE:original.mode,BENO_MIN_COVERAGE:original.coverage})){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
