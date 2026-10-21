'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const rates=require('../engines/miyar-rates.js');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2);let input=args.find(a=>!a.startsWith('--'));
const force=args.includes('--force');
if(!input){console.error('Usage: node scripts/publish-price-book.cjs <admin-export.json> [--force]');process.exit(2);}
const file=path.resolve(process.cwd(),input);let doc;
try{doc=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){console.error(`Cannot read valid JSON: ${e.message}`);process.exit(2);}
if(!doc||!Array.isArray(doc.prices)){console.error('Rejected: JSON must have a prices[] array.');process.exit(2);}
const errors=[];const warnings=[];const active=doc.prices.filter(p=>p&&p.active!==false);
for(const [i,p] of doc.prices.entries()){
  if(!p||typeof p!=='object'){errors.push(`row ${i+1}: not an object`);continue;}
  if(typeof p.name!=='string'||!p.name.trim())errors.push(`row ${i+1}: missing name`);
  if(typeof p.unit!=='string'||!p.unit.trim())errors.push(`row ${i+1}: missing unit`);
  for(const k of ['low','avg','high']) if(p[k]!==null&&p[k]!==undefined&&p[k]!==''&&(typeof p[k]==='string'||!Number.isFinite(Number(p[k]))||Number(p[k])<=0))errors.push(`row ${i+1} (${p.name||'unnamed'}): ${k} must be a positive number or blank`);
  const lo=p.low==null?null:Number(p.low),av=p.avg==null?null:Number(p.avg),hi=p.high==null?null:Number(p.high);
  if(lo!==null&&av!==null&&lo>av)errors.push(`row ${i+1} (${p.name}): low > avg`);
  if(av!==null&&hi!==null&&av>hi)errors.push(`row ${i+1} (${p.name}): avg > high`);
  if(p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date))errors.push(`row ${i+1} (${p.name}): date must be YYYY-MM-DD`);
  if(p.status!=='missing'&&!rates.hasUsablePrice(p))warnings.push(`${p.name||`row ${i+1}`}: marked ${p.status||'unknown'} but no usable price`);
  if(p.status==='national')warnings.push(`${p.name}: national alternative, verify local delivery/transport before purchase`);
  if(p.transport!=='yes')warnings.push(`${p.name}: transport is not explicitly included`);
}
const usable=active.filter(p=>p.status!=='missing'&&rates.hasUsablePrice(p));
const coverage=active.length?usable.length/active.length:0;
const divisions={};for(const p of active){const k=p.category||'غير مصنف';divisions[k]??={active:0,priced:0,missing:0};divisions[k].active++;if(p.status!=='missing'&&rates.hasUsablePrice(p))divisions[k].priced++;else divisions[k].missing++;}
const byImpact=Object.entries(divisions).map(([name,x])=>({name,...x})).sort((a,b)=>b.missing-a.missing||a.name.localeCompare(b.name,'ar'));
console.log(`Price book report: ${usable.length}/${active.length} active items priced (${(coverage*100).toFixed(1)}%).`);
console.log('Largest gaps:');for(const d of byImpact.slice(0,12))console.log(` - ${d.name}: ${d.missing} missing / ${d.active}`);
if(warnings.length)console.log(`Warnings: ${warnings.length} (first ${Math.min(15,warnings.length)} shown)`);for(const w of warnings.slice(0,15))console.log(` ! ${w}`);
if(errors.length){console.error(`Rejected with ${errors.length} error(s):\n${errors.slice(0,30).join('\n')}`);process.exit(1);}
const min=process.env.BENO_MIN_COVERAGE===undefined?.70:Number(process.env.BENO_MIN_COVERAGE);
if(coverage<min&&!force){console.error(`Publish rejected: coverage ${(coverage*100).toFixed(1)}% is below BENO_MIN_COVERAGE ${(min*100).toFixed(1)}%. Use --force only after explicit review.`);process.exit(1);}
const dir=path.join(root,'api','_data');fs.mkdirSync(dir,{recursive:true});
const versions=fs.readdirSync(dir).map(n=>Number((n.match(/^price-book\.v(\d+)\.json$/)||[])[1]||0));const n=Math.max(0,...versions)+1;
doc.priceBookVersion=`v${n}`;doc.publishedAt=new Date().toISOString();
const output=path.join(dir,`price-book.v${n}.json`);const body=JSON.stringify(doc,null,2)+'\n';fs.writeFileSync(output,body,{flag:'wx'});
fs.writeFileSync(path.join(root,'PRICE-BOOK-PUBLISH-REPORT.json'),JSON.stringify({version:`v${n}`,file:path.relative(root,output),sha256:crypto.createHash('sha256').update(body).digest('hex'),active:active.length,priced:usable.length,coveragePercent:Math.round(coverage*100),minimumCoveragePercent:Math.round(min*100),warnings:warnings.length,gaps:byImpact},null,2)+'\n');
console.log(`Published immutable ${path.relative(root,output)}; sha256=${crypto.createHash('sha256').update(body).digest('hex')}`);
