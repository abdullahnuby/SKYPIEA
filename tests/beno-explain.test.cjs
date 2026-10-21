'use strict';
const assert=require('node:assert/strict');
const explainer=require('../engines/beno-explain.js');

// explainLine builds a narrative ONLY from supplied data.
const pricedLine={code:'03-01',title:'حديد تسليح',category:'خرسانة مسلحة',quantity:'12.5',unit:'طن',hasQuantity:true,hasPrice:true,priced:true,unitPrice:'38,000 جنيه',lowUnitPrice:'37,500 جنيه',highUnitPrice:'39,000 جنيه',cost:'475,000 جنيه',lowCost:'468,750 جنيه',highCost:'487,500 جنيه',status:'local',source:'مصنع',date:'2026-10-01',transport:'included',warnings:[],required:true};
const exp=explainer.explainLine(pricedLine);
assert.ok(exp.narrative.includes('حديد تسليح'));
assert.ok(exp.costStory.includes('468,750'));
assert.ok(exp.narrative.includes('38,000 جنيه/طن'),'unit rate must be phrased as currency per BOQ unit');
assert.ok(!/[فف]جوة/.test(exp.costStory),'priced line is not treated as a gap');
const wasteExp=explainer.explainLine({...pricedLine,quantity:'12',billableQuantity:'12.6',wastePercent:5,assumption:'توريد حديد التسليح؛ المصنعية منفصلة'});
assert.ok(wasteExp.narrative.includes('الكمية الصافية: 12 طن'));
assert.ok(wasteExp.narrative.includes('كمية التوريد بعد هالك 5%: 12.6 طن'));
assert.ok(wasteExp.narrative.includes('نطاق/أساس البند: توريد حديد التسليح؛ المصنعية منفصلة.'));

const gapLine={code:'07-02',title:'دهانات',category:'تشطيبات',quantity:null,unit:'م2',hasQuantity:false,hasPrice:false,priced:false,status:'missing',required:true,warnings:[]};
const gapExp=explainer.explainLine(gapLine);
assert.ok(gapExp.costStory.includes('ما فيهش تكلفة'),'missing line never shows a cost');
assert.ok(gapExp.narrative.includes('ما يخمّنش')||gapExp.quantityStory.includes('ما يخمّنش'),'quantities are not guessed');

assert.throws(()=>explainer.explainLine(null),'null line rejected');

// Estimate-level honesty: partial subtotal is labeled, never a total.
const view={lines:[pricedLine,gapLine],coveragePercent:0.55,readyToShowAmount:false,amount:null};
const est=explainer.explainEstimate(view,{service:'building',area:120});
assert.ok(est.narrative.includes('جزئي'),'partial result labeled honestly');
assert.ok(!est.narrative.match(/الإجمالي صار/),'no fabricated totals');
assert.equal(est.priceGaps[0].title,'دهانات');

// Fully priced still requires human review wording.
const full={lines:[pricedLine],coveragePercent:1,readyToShowAmount:true,amount:'475,000 جنيه'};
const fullExp=explainer.explainEstimate(full,{service:'apartment',area:120});
assert.ok(fullExp.narrative.includes('مراجعة هندسية'),'human review gate stays');

// Gap summary groups by division.
assert.ok(explainer.explainGapSummary(view).narrative.includes('تشطيبات'));
const clean=explainer.explainGapSummary({lines:[pricedLine]});
assert.ok(clean.narrative.includes('مراجعة هندسية'));

console.log('beno-explain tests passed: data-bound narratives, honest gaps, cost stories, human-review gate.');
