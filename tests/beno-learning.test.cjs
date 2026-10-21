'use strict';
const assert=require('node:assert/strict');
const learn=require('../api/_lib/learn.cjs');
const nlu=require('../engines/beno-nlu.js');

// clusterUnmatched groups similar messages (containment on tokens).
const rows=[
 {normalized_text:'بكام المصعد لو سمحت',intent:'price_lookup'},
 {normalized_text:'بكام المصعد يا مهندس',intent:'price_lookup'},
 {normalized_text:'عايز اعرف سعر الاسمنت دلوقتي',intent:'price_lookup'},
 {normalized_text:'دهان اكريك كام باقي',intent:'unknown'},
 {normalized_text:'دهان اكريك كام',intent:'unknown'}
];
const clusters=learn.clusterUnmatched(rows);
assert.ok(clusters.length>=1&&clusters.length<=4,`reasonable clusters: ${clusters.length}`);
const grouped=clusters.filter(c=>c.size>1).map(c=>c.samples[0]);
assert.ok(grouped.length>=1,`similar variants grouped: ${JSON.stringify(clusters)}`);
assert.ok(clusters.every(c=>Array.isArray(c.samples)&&c.samples.length<=5));

// toLexiconAdditions maps verified rows into nlu addition shape and rejects junk.
const adds=learn.toLexiconAdditions([
 {kind:'intents',key:'thanks',value:'تسلم اديك'},
 {kind:'places',key:'',value:'القرنه الجديده'},
 {kind:'materials',key:'حديد',value:'فلانكس'},
 {kind:'modelHints',key:'BLD-NEW-RES',value:'عماره سكنى'},
 {kind:'modelHints',key:'BAD-CODE',value:'x'},
 {kind:'notakind',value:'nope'},
 {kind:'intents',key:'greet',value:''},
 {kind:'intents',key:'greet',value:'x'.repeat(200)}
]);
assert.deepEqual(adds,{intents:{thanks:['تسلم اديك']},places:['القرنه الجديده'],materials:[{query:'حديد',terms:['فلانكس']}],modelHints:{'BLD-NEW-RES':['عماره سكنى']}},'junk filtered exactly');
assert.throws(()=>learn.toLexiconAdditions('not-array'));

// Runtime merge of verified learning teaches the NLU immediately.
nlu.mergeAdditions(adds);
assert.equal(nlu.resolve('تسلم اديك يا هندس').intent,'thanks');

// Runtime helpers stay safe without Supabase env.
process.env.SUPABASE_URL=''; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
(async()=>{
  const res=await learn.fetchUnmatched().catch(e=>({error:e.message}));
  assert.ok(res&&res.available===false,'no env → available false');
  const lex=await learn.fetchVerifiedLexicon().catch(e=>({error:e.message}));
  assert.ok(lex&&lex.available===false,'no env → lexicon unavailable');
  await assert.rejects(()=>learn.insertLexiconRows([{kind:'places',value:'x'}]),'insert without env throws');
  console.log('beno-learning tests passed: containment clustering, verified-row filtering, immediate NLU teaching, safe no-env behavior.');
})().catch(e=>{console.error(e);process.exit(1);});
