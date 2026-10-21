'use strict';
const crypto=require('node:crypto');
const {send,readBody,handlerPrelude,requestId}=require('./_lib/http.cjs');
const demoStore=require('./_lib/lead-store.cjs');
const keys=new Set(['name','phone','consent','estimateId','projectFacts','website','startedAt']);
const PHONE=/^(?:(?:\+20|0020|0)?1[0125]\d{8})$/;
const clean=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,'').trim();
async function persistLead(row){
  if(process.env.BENO_LOCAL_DEMO==='1'){
    const reference=`DEMO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    demoStore.addLead({...row,reference,created_at:new Date().toISOString()});return reference;
  }
  const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)throw Object.assign(new Error('Lead storage is not configured.'),{status:503});
  const response=await fetch(`${url}/rest/v1/leads`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({name:row.name,phone:row.phone,consent:true,estimate_id:row.estimateId,project_facts:row.projectFacts,source:'beno-chat-widget'})});
  if(!response.ok){const raw=(await response.text()).slice(0,300);throw Object.assign(new Error(`Lead persistence failed (${response.status}): ${raw}`),{status:503});}
  let ref='';try{const doc=await response.json();ref=String(doc?.[0]?.reference||doc?.[0]?.id||'');}catch{}
  return ref||`BENO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
module.exports=async function leadHandler(req,res){
  if(!(await handlerPrelude(req,res,'lead',8)))return;
  const id=requestId();
  try{
    const body=await readBody(req,16384);
    if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{ok:false,error:'Request must be a JSON object.',requestId:id});
    const unknown=Object.keys(body).filter(k=>!keys.has(k));if(unknown.length)return send(res,400,{ok:false,error:'Unknown lead field(s).',requestId:id});
    if(clean(body.website))return send(res,400,{ok:false,error:'Invalid lead submission.',requestId:id});
    const started=Number(body.startedAt||0);if(!Number.isFinite(started)||started<=0||Date.now()-started<2500)return send(res,400,{ok:false,error:'من فضلك راجع البيانات وحاول تاني.',requestId:id});
    const name=clean(body.name),phone=clean(body.phone).replace(/[\s()-]/g,'');
    if(name.length<2||name.length>100)return send(res,400,{ok:false,error:'اكتب الاسم بشكل صحيح.' ,requestId:id});
    if(!PHONE.test(phone))return send(res,400,{ok:false,error:'رقم الموبايل المصري غير صحيح.',requestId:id});
    if(body.consent!==true)return send(res,400,{ok:false,error:'لازم توافق صراحة على التواصل قبل الإرسال.',requestId:id});
    if(typeof body.estimateId!=='string'||body.estimateId.length>100)return send(res,400,{ok:false,error:'مرجع المقايسة غير صحيح.',requestId:id});
    if(!body.projectFacts||typeof body.projectFacts!=='object'||Array.isArray(body.projectFacts)||JSON.stringify(body.projectFacts).length>5000)return send(res,400,{ok:false,error:'ملخص المشروع غير صحيح.',requestId:id});
    const reference=await persistLead({name,phone,consent:true,estimateId:body.estimateId,projectFacts:body.projectFacts});
    if(process.env.OWNER_WEBHOOK_URL){try{await fetch(process.env.OWNER_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'beno.lead.created',reference,estimateId:body.estimateId,projectFacts:body.projectFacts})});}catch(err){process.stderr.write(`[beno-lead-webhook] ${id} delivery failed\n`);}}
    return send(res,201,{ok:true,reference,requestId:id});
  }catch(error){
    const status=error.status||503;
    if(status>=500)process.stderr.write(`[beno-lead] ${id} ${String(error.message||'lead error').slice(0,240)}\n`);
    return send(res,status,{ok:false,error:status>=500?'مش قادر أحفظ الطلب دلوقتي. تقدر تبعت الملخص على واتساب مباشرة.':String(error.message||'Invalid request.').slice(0,220),requestId:id});
  }
};
