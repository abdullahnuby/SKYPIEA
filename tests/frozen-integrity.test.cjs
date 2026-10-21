'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');const expected=require('./frozen-engine-sha256.json');
for(const [name,hash] of Object.entries(expected)){const file=path.join(root,'engines',name);assert.ok(fs.existsSync(file),`missing frozen engine ${name}`);const got=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');assert.equal(got,hash,`${name} has changed; frozen arithmetic source must remain byte-identical`);}
const book=JSON.parse(fs.readFileSync(path.join(root,'api/_data/price-book.v1.json'),'utf8'));
assert.ok(book.prices.some(x=>x.status==='missing'||x.avg==null),'production seed catalog must stay honestly incomplete');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/price-book.complete.TEST-ONLY.json'),'utf8'));
assert.equal(fixture.testOnly,true);assert.ok(fixture.prices.every(x=>String(x.source||'').includes('TEST ONLY')),'synthetic test prices need loud test-only labels');
console.log(`Frozen engine integrity passed: ${Object.keys(expected).length} source hashes match; test fixture isolated and labeled.`);
