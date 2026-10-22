'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const client=['beno-chat.js','beno-chat.chunk.js'];
const forbidden=[/BENO_MARGIN_PCT/i,/BENO_MARGIN_MODE/i,/SUPABASE_SERVICE_ROLE_KEY/i,/service_role/i,/price-book\.v\d+\.json/i,/"margin"\s*:\s*\d/i,/marginPct/i,/marginRate/i];
let bad=[];
for(const f of client){const p=path.join(root,f);if(!fs.existsSync(p)){bad.push(`${f}: missing built client file`);continue;}const text=fs.readFileSync(p,'utf8');for(const re of forbidden)if(re.test(text))bad.push(`${f}: client contains forbidden pattern ${re}`);}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
// The client bundle must stay dependency-free. Server-only dependencies (the
// Neon driver used by api/_lib/db.cjs, plus Neon CLI config tooling) are allowed here.
const allowedServerDeps=new Set(['@neondatabase/serverless','@neon/config','@neon/env']);
const unexpected=Object.keys(pkg.dependencies||{}).filter(name=>!allowedServerDeps.has(name));
if(unexpected.length)bad.push(`Unexpected runtime dependencies: ${unexpected.join(', ')}. Review the no-runtime-dependency requirement.`);
if(bad.length){console.error(bad.join('\n'));process.exit(1);}console.log('Client bundle secret-pattern scan passed. API/server files were intentionally not scanned as client bundles.');
