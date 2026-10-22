'use strict';
const crypto = require('node:crypto');
const db = require('./db.cjs');
const buckets = new Map();
function getHeader(req,name){const v=req.headers?.[name.toLowerCase()];return Array.isArray(v)?v[0]:v;}
function allowedOrigin(req){
  const origin=getHeader(req,'origin');
  const configured=String(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!origin)return {allowed:true,origin:null};
  const host=String(getHeader(req,'host')||'').toLowerCase();
  let sameOrigin=false;
  try{sameOrigin=new URL(origin).host.toLowerCase()===host;}catch{}
  const explicit=configured.includes('*')||configured.includes(origin);
  return {allowed:explicit||sameOrigin,origin:configured.includes('*')?'*':origin};
}
function send(res,status,body,headers={}){
  const data=Buffer.from(JSON.stringify(body));
  res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Length',String(data.length));
  for(const [k,v] of Object.entries(headers))res.setHeader(k,v);res.end(data);
}
function cors(req,res){
  const o=allowedOrigin(req);
  if(o.origin){res.setHeader('Access-Control-Allow-Origin',o.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Beno-Session');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');}
  return o.allowed;
}
async function rateLimit(req,scope='tool',limit=40,windowMs=60000){
  const ip=String(getHeader(req,'x-forwarded-for')||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const session=String(getHeader(req,'x-beno-session')||'').slice(0,100);
  const productionRuntime = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const durable = db.configured() && process.env.BENO_LOCAL_DEMO !== '1' && process.env.BENO_DURABLE_RATE_LIMIT !== '0';
  const windowSeconds = Math.max(1, Math.ceil(windowMs/1000));
  if (productionRuntime && !durable) {
    process.stderr.write('[beno-rate-limit] production durable limiter is not configured; rejecting request\n');
    return {ok:false,retryAfter:60,unavailable:true};
  }
  if (durable) {
    // Only a hash is sent to Postgres; the raw IP and session never leave the request process.
    const key=crypto.createHash('sha256').update(`${scope}|${ip}|${session}`).digest('hex');
    try{
      const rows=await db.query('select public.beno_consume_rate_limit($1,$2,$3,$4) as allowed',[key,scope,limit,windowSeconds]);
      const allowed=rows[0]?.allowed === true;
      return {ok:allowed,retryAfter:windowSeconds};
    }catch(error){
      process.stderr.write(`[beno-rate-limit] durable gate failed (${String(error.message||'error').slice(0,120)}); rejecting request\n`);
      return {ok:false,retryAfter:60,unavailable:true};
    }
  }
  const key=`${scope}:${ip}:${session}`;const now=Date.now();let b=buckets.get(key);
  if(!b||now-b.start>=windowMs){b={start:now,count:0};buckets.set(key,b);}b.count++;
  if(buckets.size>5000)for(const [k,v] of buckets)if(now-v.start>windowMs)buckets.delete(k);
  return {ok:b.count<=limit,retryAfter:Math.max(1,Math.ceil((windowMs-(now-b.start))/1000)),localOnly:true};
}
function readBody(req,maxBytes=65536){return new Promise((resolve,reject)=>{
  let size=0, chunks=[];req.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(Object.assign(new Error('Request body too large.'),{status:413}));req.destroy();return;}chunks.push(chunk);});
  req.on('end',()=>{try{const raw=Buffer.concat(chunks).toString('utf8');resolve(raw?JSON.parse(raw):{});}catch{reject(Object.assign(new Error('Request body must be valid JSON.'),{status:400}));}});req.on('error',reject);
});}
function requestId(){return crypto.randomUUID();}
async function handlerPrelude(req,res,scope,limit){
  if(!cors(req,res)){send(res,403,{ok:false,error:'Origin is not allowed.'});return false;}
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return false;}
  if(req.method!=='POST'){send(res,405,{ok:false,error:'Method not allowed.'},{Allow:'POST, OPTIONS'});return false;}
  const gate=await rateLimit(req,scope,limit);
  if(!gate.ok){send(res,gate.unavailable?503:429,{ok:false,error:gate.unavailable?'الخدمة مش متاحة لحظياً. جرّب بعد شوية.':'Requests are temporarily limited. Try again shortly.'},{'Retry-After':String(gate.retryAfter)});return false;}
  return true;
}
module.exports={send,readBody,handlerPrelude,requestId,rateLimit};
