'use strict';
const assert=require('node:assert/strict');
const cases=require('./language/corpus.json');
const parser=require('../api/_lib/conversation.cjs');
assert.ok(cases.length>=150,`expected >=150 language examples; found ${cases.length}`);
const seen=new Set();let checked=0,passed=0;const failures=[];
for(const [i,c] of cases.entries()){
  assert.ok(typeof c.text==='string'&&c.text.trim(),`empty phrase at ${i+1}`);
  assert.ok(!seen.has(c.text),`duplicate phrase at ${i+1}`);seen.add(c.text);
  const result=parser.infer(c.text,c.pending,{});
  for(const [key,want] of Object.entries(c.expected||{})){
    const got=key==='intent'?result.intent:result.values[key];checked++;
    if(Object.is(got,want))passed++;else failures.push({index:i+1,text:c.text,key,want,got});
  }
}
assert.equal(failures.length,0,`${failures.length}/${checked} extraction checks failed:\n${JSON.stringify(failures.slice(0,20),null,2)}`);
assert.ok(parser.infer('ألف ومية متر مربع').values.area===1100);
assert.ok(parser.infer('مليون ونص').normalized.includes('1500000'));
console.log(`Egyptian Arabic language tests passed: ${cases.length} distinct phrases; ${checked}/${checked} expected field checks passed; number/unit normalization smoke passed.`);
