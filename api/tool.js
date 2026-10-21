'use strict';
const engine = require('./_lib/engine.cjs');
const {handleTool}=engine;
const {send,readBody,handlerPrelude,requestId}=require('./_lib/http.cjs');
const {recordUnmatched}=require('./_lib/unmatched.cjs');
const priceStore=require('./_lib/price-store.cjs');
const pricingStore=require('./_lib/pricing-feedback.cjs');
const pricingMemory=require('./_lib/pricing-memory.cjs');
const learn=require('./_lib/learn.cjs');

const PRICING_TOOLS = new Set(['price-catalog.search','estimate.run','boq.explain','scenario.evaluate']);

function chatLearningEnabled() {
  if (process.env.BENO_LEARN_PRICE_MENTIONS === '1') return true;
  return process.env.BENO_LOCAL_DEMO === '1' && process.env.NODE_ENV !== 'production';
}

async function loadPricingContext(bookDoc) {
  const [history, feedback] = await Promise.all([
    priceStore.getPriceBookHistory(24),
    pricingStore.listRows({ limit: 500 })
  ]);
  const book = bookDoc || engine.loadBook().doc;
  return {
    pricingSignals: pricingMemory.buildSignals(book, history, feedback.rows),
    pricingLearning: { historyVersions: history.length, feedbackAvailable: feedback.available, feedbackRows: feedback.rows.length }
  };
}

module.exports=async function toolHandler(req,res){
  if(!(await handlerPrelude(req,res,'tool',50)))return;
  const id=requestId();
  try{
    const body=await readBody(req,65536);
    if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{ok:false,error:'Request must be a JSON object.',requestId:id});
    // Verified supervisor lexicon feeds the deterministic language layer just
    // before planning; stale/unavailable learning never blocks the request.
    if(body.tool==='conversation.plan'){
      try{await learn.applyLearnedLexicon();}catch(error){
        if(error.status)process.stderr.write(`[beno-tool] ${id} learned-lexicon unavailable (${error.status})\n`);
      }
    }
    const publishedBook=await priceStore.getPublishedBook();
    let context={};
    if(PRICING_TOOLS.has(body.tool)){
      try{context=await loadPricingContext(publishedBook);}catch(error){
        process.stderr.write(`[beno-tool] ${id} pricing-learning unavailable (${error.status||'error'})\n`);
      }
    }
    const result=handleTool(body,publishedBook||null,context);
    if((body.tool==='conversation.extract'||body.tool==='conversation.plan')&&result.unmatched&&typeof body.args?.message==='string'){try{await recordUnmatched(body.args.message,result.intent);}catch(_){process.stderr.write(`[beno-tool] ${id} unmatched log failed\n`);}}
    // Structured price mentions become *unverified* evidence only. They never
    // change a published price and cannot influence suggestions until reviewed.
    if(chatLearningEnabled()&&['conversation.plan','conversation.extract'].includes(body.tool)&&typeof body.args?.message==='string'){
      try{
        const book=publishedBook||engine.loadBook().doc;
        const observation=pricingMemory.detectPriceObservation(body.args.message,book);
        if(observation)await pricingStore.recordRows([observation],{book,sourceType:'customer'});
      }catch(error){process.stderr.write(`[beno-tool] ${id} price-mention capture failed (${error.status||'error'})\n`);}
    }
    return send(res,200,{...result,requestId:id});
  }catch(error){
    const status=error.status||(/Unknown tool|Unknown .* field|must be|between|Invalid|must contain|is required/i.test(error.message)?400:500);
    if(status>=500)process.stderr.write(`[beno-tool] ${id} ${String(error.message||'server error').slice(0,240)}\n`);
    return send(res,status,{ok:false,error:status>=500?'الحساب مش متاح لحظياً. جرّب تاني أو ابعت ملخص المشروع لمهندس.':String(error.message||'Invalid request.').slice(0,240),requestId:id});
  }
};
