'use strict';
const assert=require('node:assert/strict');
const nlu=require('../engines/beno-nlu.js');
const agent=require('../api/_lib/agent.cjs');

// --- determinism contract: same input → same output, twice -----------------
const first=nlu.resolve('مش عايز تأسيس تكييف');
const second=nlu.resolve('مش عايز تأسيس تكييف');
assert.deepEqual(first,second,'nlu must be pure/deterministic');

// --- intent classification -------------------------------------------------
assert.equal(nlu.resolve('هلا يا هندس').intent,'greet');
assert.equal(nlu.resolve('متشكرين خالص منك').intent,'thanks');
assert.equal(nlu.resolve('تقدر تعمل ايه في الموقع').intent,'help');
assert.equal(nlu.resolve('عمارتي مختلطة سكني وتجاري').facts.some(f=>f.key==='modelCode'&&f.value==='BLD-NEW-MIX'),true);
assert.equal(nlu.resolve('سعر مكيف حديد').intent,'price_lookup');
assert.equal(nlu.resolve('ليه بتسالني السؤال ده').intent,'why');
assert.equal(nlu.resolve('5',{pending:'area'}).intent,'answer_pending');
assert.equal(nlu.resolve('لو شلنا الكهرباء').intent,'scenario');

// --- phraseSimilarity rejects partial multi-token matches ------------------
assert.equal(nlu.resolve('لماذا نتسائل دائما').intent,'unknown');
assert.equal(nlu.resolve('كامل عالمفتاح يا سيدي').intent,'unknown');

// --- negation features -----------------------------------------------------
const feat=(t,key)=>{const r=nlu.resolve(t).facts.find(f=>f.key===key);return r?r.value:null;};
assert.equal(feat('مش عايز تأسيس تكييف في العقار','ac'),false);
assert.equal(feat('فيه مطبخ ومفيش تكييف','kitchen'),true);
assert.equal(feat('فيه مطبخ ومفيش تكييف','ac'),false);
assert.equal(feat('لو شلنا المصعد وخلينا مطبخ','elevator'),false);
assert.equal(feat('لو شلنا المصعد وخلينا مطبخ','kitchen'),true);
assert.equal(feat('المصعد موجود والبدروم معاه','elevator'),true);
assert.equal(feat('من غير بدروم','basement'),false);
assert.equal(feat('عايزش اسانسير','elevator'),false);

// --- confidence + confirmation tier ---------------------------------------
const low=nlu.resolve('عمارة مختلطه سكني وتجاري تقريبا');
assert.ok(low.facts.every(f=>f.confidence<=1&&f.confidence>0));
const smart=nlu.resolve('شيء غير مفهوم تماما');
assert.equal(smart.intent,'unknown');

// --- runtime lexicon additions (learning loop seam) ------------------------
nlu.mergeAdditions({intents:{greet:['بسم الله الرحمن الرحيم']},places:['القرنه الجديده']});
const mergedPlace=nlu.resolve('نقف على القرنه الجديده').facts.find(f=>f.key==='location');
assert.ok(mergedPlace&&mergedPlace.value==='القرنه الجديده','multi-token taught place wins over bare token');
assert.equal(nlu.resolve('بسم الله الرحمن الرحيم').intent,'greet','merged synonym teaches new greeting');
assert.throws(()=>nlu.mergeAdditions({modelHints:{'BAD-CODE':['x']}},'model family naming'));
assert.throws(()=>nlu.mergeAdditions({unknownKind:['x']}),'unknown lexicon kind rejected');

// --- decision brain --------------------------------------------------------
assert.equal(agent.chooseNextKey({service:'building',area:120},'building',{}),'floors');
assert.equal(agent.chooseNextKey({service:'building',area:120,floors:3},'building',{}),'pack');
assert.equal(agent.chooseNextKey({service:'apartment',area:120,pack:'luxury',rooms:3,bathrooms:2},'apartment',{}),'location'); // lowest-impact leftover
// tall building boosts elevator to the top of the remaining slots
assert.equal(agent.chooseNextKey({service:'building',area:120,floors:9,pack:'medium',unitsPerFloor:2},'building',{}),'elevator');
assert.equal(agent.chooseNextKey({service:'building',area:120,floors:3,pack:'medium',unitsPerFloor:1,rooms:3,bathrooms:2,basement:false,elevator:false,kitchen:false,ac:false},'building',{}),'location','explicit false option answers are complete, not missing slots');

const p1=agent.planConversation({parsed:{found:['مساحة الدور 120 م²'],values:{area:120}},state:{service:'apartment'},pending:null});
assert.ok(p1.reply.includes('سجلت'),'reply acknowledges facts');
assert.equal(p1.nextQuestion.key,'package');
assert.ok(p1.reply.includes('ليه السؤال ده'),'reply explains why');
assert.ok(p1.quickReplies.length<=4);

// pending wins over info-gain
const p2=agent.planConversation({parsed:{found:[],values:{}},state:{service:'apartment',area:100},pending:'floors'});
assert.equal(p2.nextQuestion.key,'floors');

// service gate: no state → ask model first
const p3=agent.planConversation({parsed:{found:[],values:{}},state:{},pending:null});
assert.ok(p3.reply.includes('شقة')||p3.reply.includes('عمارة'));

// warnings land in reply
const p4=agent.planConversation({parsed:{found:[],values:{}},state:{service:'building',plotArea:150,area:120,floors:3},pending:null});
assert.ok(p4.warnings.length>=1,'plot/build mismatch warns');

// widgetASKFOR mapping stays honest (only keys the widget can ask)
for(const key of ['area','floors','pack','rooms','bathrooms','unitsPerFloor','basement','elevator','kitchen','ac']) assert.ok(agent.mapToWidgetKey(key) in agent.ASK_TEMPLATES);
assert.equal(agent.mapToWidgetKey('pack'),'package');
assert.equal(agent.mapToWidgetKey('basement'),'options');

console.log('beno-nlu + agent decision brain tests passed: determinism, intents, negation windows, confidence tiers, lexicon seam, info-gain questions, honest warnings.');
