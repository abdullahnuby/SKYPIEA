'use strict';
const engine=require('../../engines/miyar-engine.js');
const dialogue=require('../../engines/miyar-dialogue-agent.js');
const nlu=require('../../engines/beno-nlu.js');
const digitMap={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
const numberWords={
  'صفر':0,'واحد':1,'واحده':1,'واحدة':1,'اول':1,'اولى':1,'أول':1,
  'اتنين':2,'اثنين':2,'تنين':2,'اثنان':2,'اثنتين':2,'اتنينه':2,
  'تلات':3,'تلاته':3,'ثلاث':3,'ثلاثه':3,'ثلاثة':3,'ثلاثين':30,'تلاتين':30,
  'اربعه':4,'اربع':4,'أربع':4,'أربعة':4,'اربعة':4,'اربعين':40,'أربعين':40,
  'خمسه':5,'خمس':5,'خمسة':5,'خمسة':5,'خمسين':50,
  'سته':6,'ست':6,'ستة':6,'ستين':60,
  'سبعه':7,'سبع':7,'سبعة':7,'سبعين':70,
  'تمانيه':8,'تمنيه':8,'ثمانية':8,'تمانية':8,'ثمان':8,'تمانين':80,'تمنين':80,
  'تسعه':9,'تسع':9,'تسعة':9,'تسعين':90,
  'عشره':10,'عشرة':10,'عشرين':20,'ميه':100,'ميا':100,'مئة':100,'مائه':100,'مائة':100,'مية':100,'مئه':100,
  'ميتين':200,'مئتين':200,'تلتميه':300,'تلتمية':300,'تلت ميه':300,'تلاتمية':300,'اربعمية':400,'اربعمائه':400,
  'خمسمية':500,'ستمية':600,'سبعمية':700,'تمنمية':800,'تسعمية':900,'الف':1000,'ألف':1000,'الفين':2000,'ألفين':2000,
  'مليون':1000000,'مليونين':2000000,'فدان':1
};
const places=['البياضية','الطود','أرمنت','اسنا','إسنا','البر الغربي','الكرنك','العوامية','القرنة','الزينية','العديسات','الأقصر','الاقصر'];
const materials=['حديد','أسمنت','اسمنت','رمل','زلط','سن','طوب','خرسانة','سيراميك','بلاط','دهان','محارة','رخام','جبس','كابلات','مواسير','أسانسير','مصعد','اسلاك','نحاس'];
function norm(s){return engine.normalizeArabic(String(s||'')).replace(/[،؛؟!.,:()[\]{}]/g,' ').replace(/\s+/g,' ').trim();}
function normalizedDigits(text){return String(text||'').replace(/[٠-٩۰-۹]/g,ch=>digitMap[ch]||ch).replace(/[٬،]/g,'').replace(/٫/g,'.');}
function wordsToNumericText(text){
  let s=String(text||'');
  const entries=Object.entries(numberWords).filter(([word])=>word!=='فدان').sort((a,b)=>b[0].length-a[0].length);
  for(const [word,num] of entries){const escaped=word.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&');const re=new RegExp(`(^|[^\\p{L}\\p{N}]|و)${escaped}(?=$|[^\\p{L}\\p{N}])`,'giu');s=s.replace(re,(_,prefix)=>prefix==='و'?`و ${num}`:`${prefix}${num}`);}
  s=s.replace(/(^|[^\p{L}\p{N}])(\d+)\s*و\s*نص(?=$|[^\p{L}\p{N}])/giu,(_,prefix,n)=>`${prefix}${Number(n)>=1000?Number(n)*1.5:Number(n)+0.5}`);
  s=s.replace(/(\d+)\s*(?:و\s*)?نص(?=$|[^\p{L}])/giu,(_,n)=>String(Number(n)+0.5));
  s=s.replace(/(^|[^\p{L}\p{N}])1000\s*و\s*(\d{1,3})(?=$|[^\p{L}\p{N}])/gu,(_,prefix,n)=>`${prefix}${1000+Number(n)}`);
  s=s.replace(/(^|[^\p{L}\p{N}])100\s*و\s*(\d{1,2})(?=$|[^\p{L}\p{N}])/gu,(_,prefix,n)=>`${prefix}${100+Number(n)}`);
  s=s.replace(/\b(\d+)\s*(?:ونص|و\s+نص)\b/giu,(_,n)=>String(Number(n)+0.5));
  s=s.replace(/(^|[^\p{L}\p{N}])(\d{1,2})000\s*(?:و|\+)\s*(\d{1,3})(?=$|[^\p{L}\p{N}])/gu,(_,prefix,a,b)=>`${prefix}${Number(a)*1000+Number(b)}`);
  return s;
}
function isNum(v){return Number.isFinite(Number(v));}
function infer(text,pending,current={}){
  const raw=String(text||'').slice(0,2000);const digitText=normalizedDigits(raw);const t=norm(wordsToNumericText(digitText));
  const facts={},found=[];const set=(k,v,label)=>{if(v!==undefined&&v!==null){facts[k]=v;found.push(label||`${k}: ${String(v)}`);}};
  const num='(\\d{1,7}(?:\\.\\d+)?)';
  const explicitArea=new RegExp(`(?:مساحه\\s*(?:الدور(?:\\s*الواحد)?|الطابق(?:\\s*الواحد)?|الشقه|الفيلا|العماره|المبنى|المشروع)|مسطح\\s*(?:الدور|الطابق|الشقه|المبنى)|الدور\\s*(?:مساحته|مساحه))\\s*(?:هي|حوالي|تقريبا|تقريباً|=|:)?\\s*${num}`,'u').exec(t);
  let area=null, areaLabel='';
  if(explicitArea){area=Number(explicitArea[1]);areaLabel=`مساحة الدور ${explicitArea[1]} م²`;}
  else {
    // Egyptian land-area conversions: feddan, qirat, and square qasaba only.
    const landUnit=new RegExp(`(?:مساحه\\s*)?${num}\\s*(فدان(?:ات)?|قيراط(?:ات)?|قراريط|قصبه\\s*مربعه|قصبه|قصبة\\s*مربعة)(?=$|[^\\p{L}])`,'u').exec(t);
    if(landUnit){const qty=Number(landUnit[1]);const unit=landUnit[2];const multiplier=/فدان/u.test(unit)?4200.8333333333:/قيراط|قراريط/u.test(unit)?175.0347222222:12.6025;const landBefore=t.slice(Math.max(0,landUnit.index-45),landUnit.index);const areaContext=pending==='area'||/مساحه\s*(?:الدور|الطابق|المبنى المبني|المسطح المبني)|مسطح مبني|الدور المبني/u.test(landBefore);const converted=qty*multiplier;if(areaContext){area=converted;areaLabel=`تحويل ${landUnit[1]} ${unit} إلى ${area.toFixed(2)} م²`;}else if(/ارض|قطعه|قطعة|ارضيه/u.test(t)){set('plotArea',Math.round(converted*100)/100,`مساحة الأرض ${converted.toFixed(2)} م²`);}}
    if(area===null){const areaMatch=new RegExp(`${num}\\s*(?:متر\\s*مربع|متر\\s*مربّع|م\\s*مربع|م2|م²)(?=$|[^\\p{L}])`,'u').exec(t);
      const bareMeter=new RegExp(`${num}\\s*(?:متر|م)(?=$|[^\\p{L}])`,'u').exec(t);
      if(areaMatch&&!/(?:سعر|بكام|بكم|ثمن)\\s*$/.test(t.slice(0,areaMatch.index))){area=Number(areaMatch[1]);areaLabel=`المساحة المذكورة ${areaMatch[1]} م²`;}
      else if(bareMeter&&!/(?:سعر|بكام|بكم|ثمن)\\s*$/.test(t.slice(0,bareMeter.index))&&(Number(bareMeter&&bareMeter[1])>=20||/مساحه|مسطح|شقه|فيلا|عماره|مبنى|بناء|بيت|الدور|للدور/u.test(t)||pending==='area'||current.service==='apartment'||current.service==='building')){area=Number(bareMeter[1]);areaLabel=`المساحة المذكورة ${bareMeter[1]} م²`;}
      else if(pending==='area') {const plain=new RegExp(`^\\s*${num}\\s*$`,'u').exec(t);if(plain){area=Number(plain[1]);areaLabel=`المساحة ${plain[1]} م²`;}}
    }
  }
  // A bare one-feddan phrase is accepted only when it is the requested area unit.
  if(area===null && /(?:^|[^\p{L}\p{N}])فدان(?=$|[^\p{L}\p{N}])/u.test(t)) {if(pending==='area'){area=4200.83;areaLabel='تحويل فدان مصري إلى 4,200.83 م²';} else if(/ارض|مساحه/u.test(t)){set('plotArea',4200.83,'مساحة الأرض فدان مصري، نحو 4,200.83 م²');}}

  const totalArea=new RegExp(`(?:اجمالي\\s*(?:مسطحات|مساحه|المسطحات|المساحه)|المساحه\\s*(?:الاجماليه|الكليه)|مساحه\\s*(?:المبنى|المبني|المشروع|العماره\\s*كلها))\\s*(?:هي|حوالي|تقريبا|تقريباً|=|:)?\\s*${num}`,'u').exec(t);
  if(totalArea){area=Number(totalArea[1]);areaLabel=`إجمالي المساحة ${totalArea[1]} م²`;}
  if(area!==null&&area>=20&&area<=5000)set('area',Math.round(area*100)/100,areaLabel);

  let floors=null;
  const explicitFloors=new RegExp(`عدد\\s*(?:الادوار|الطوابق|الأدوار|الأدوار)\\s*(?:هو|=|:)?\\s*(\\d{1,2})`,'u').exec(t);
  if(explicitFloors)floors=Number(explicitFloors[1]);
  if(floors===null){const m=new RegExp(`(?:^|[^\\p{L}\\p{N}]|و)(\\d{1,2})\\s*(?:ادوار|دور|طوابق|طابق|طابقات)(?=$|[^\\p{L}\\p{N}])`,'u').exec(t);if(m)floors=Number(m[1]);}
  if(floors===null&&/(?:خلي|خلّي|تعديل|بدل)/u.test(t)){const candidates=[...t.matchAll(/(?:^|[^\p{L}\p{N}])(\d{1,2})(?=$|[^\p{L}\p{N}])/gu)].map(m=>Number(m[1]));if(candidates.length&&/(?:دور|طابق|ادوار|طوابق)/u.test(t))floors=candidates[candidates.length-1];}
  if(floors===null&&/(?:دورين|دوران|طابقين|طابقان)/u.test(t))floors=2;
  if(floors===null&&/(?:اربع|أربع|اربعه|أربعة)\s*(?:ادوار|دور|طوابق|طابق)/u.test(t))floors=4;
  if(floors===null&&/(?:واحد|واحدة|واحده)\s*(?:دور|طابق)/u.test(t))floors=1;
  if(floors===null){const reverseFloor=/(?:من\s+)?(?:دور|طابق)\s+(\d{1,2})(?=$|[^\p{L}\p{N}])/u.exec(t);if(reverseFloor)floors=Number(reverseFloor[1]);}
  if(floors===null&&pending==='floors'){const m=/^\s*(\d{1,2})\s*$/u.exec(t);if(m)floors=Number(m[1]);}
  if(floors!==null&&floors>=1&&floors<=40)set('floors',floors,`عدد الأدوار ${floors}`);

  let rooms=null;
  const roomBefore=new RegExp(`(?:^|[^\\p{L}\\p{N}])(\\d{1,2})\\s*(?:غرف|غرفه|غرفة|اوض|أوض|اوضه|أوضة)(?=$|[^\\p{L}])`,'u').exec(t);
  const roomAfter=new RegExp(`(?:عدد\\s*(?:الغرف|الاوض|الأوض)|غرف|غرفه|غرفة|اوض|أوض)\\s*(?:هو|=|:)?\\s*(\\d{1,2})`,'u').exec(t);
  if(roomBefore)rooms=Number(roomBefore[1]);else if(roomAfter)rooms=Number(roomAfter[1]);else if(/(?:غرفتين|اوضتين|أوضتين)/u.test(t))rooms=2;
  if(rooms===null&&pending==='rooms'&&/^\s*[1-8]\s*$/u.test(t))rooms=Number(t.trim());
  if(rooms!==null&&rooms>=1&&rooms<=8)set('rooms',rooms,`عدد الغرف ${rooms}`);

  let bathrooms=null;
  const bathBefore=new RegExp(`(?:^|[^\\p{L}\\p{N}]|و)(\\d{1,2})\\s*(?:حمامات|حمام|دورات\\s*مياه)(?=$|[^\\p{L}])`,'u').exec(t);
  const bathAfter=new RegExp(`(?:عدد\\s*الحمامات|حمامات|حمام)\\s*(?:هو|=|:)?\\s*(\\d{1,2})`,'u').exec(t);
  if(bathBefore)bathrooms=Number(bathBefore[1]);else if(bathAfter)bathrooms=Number(bathAfter[1]);else if(/حمامين|حمامان/u.test(t))bathrooms=2;
  if(bathrooms===null&&pending==='bathrooms'&&/^\s*[1-8]\s*$/u.test(t))bathrooms=Number(t.trim());
  if(bathrooms!==null&&bathrooms>=1&&bathrooms<=8)set('bathrooms',bathrooms,`عدد الحمامات ${bathrooms}`);

  let units=null;
  const unitBefore=new RegExp(`(?:^|[^\\p{L}\\p{N}])(\\d{1,2})\\s*(?:شقق|شقه|شقة|وحدات)\\s*(?:في|بال)?\\s*(?:الدور|الطابق)?(?=$|[^\\p{L}])`,'u').exec(t);
  const unitAfter=new RegExp(`(?:عدد\\s*(?:الشقق|الوحدات)\\s*(?:في\\s*الدور)?|شقق\\s*في\\s*الدور)\\s*(?:هو|=|:)?\\s*(\\d{1,2})`,'u').exec(t);
  if(unitBefore)units=Number(unitBefore[1]);else if(unitAfter)units=Number(unitAfter[1]);else if(/شقتين|وحدتين/u.test(t))units=2;
  if(units===null&&/(?:وحده|وحدة).{0,24}1\s*(?:بالدور|في الدور)/u.test(t))units=1;
  if(units!==null&&units>=1&&units<=30)set('unitsPerFloor',units,`عدد الوحدات في الدور ${units}`);

  if(/تجاري|اداري|ادارى|محلات|مكاتب/u.test(t))set('type','commercial','نوع المشروع تجاري/إداري');
  else if(/سكني|عماره|شقه|فيلا|بيت|مبنى/u.test(t))set('type','residential','نوع المشروع سكني');
  if(/(?:هيكل\s*فقط|عظم\s*فقط|خرسانه\s*فقط|خرسانة\s*فقط|شغل\s*الهيكل(?:\s*والخرسانه)?\s*بس)/u.test(t))set('scope','structure','النطاق هيكل فقط');
  else if(/تشطيب\s*فقط|شقه\s*تشطيب|شقة\s*تشطيب|تشطيب\s*شقه|تشطيب\s*شقة/u.test(t))set('scope','finishing','النطاق تشطيب فقط');
  else if(/على\s*المفتاح|علي\s*المفتاح|هيكل\s*وتشطيب|كامل/u.test(t))set('scope','turnkey','النطاق على المفتاح');
  if(/نصف\s*تشطيب|نص\s*تشطيب/u.test(t))set('pack','semi','باقة نصف تشطيب');
  else if(/اقتصادي/u.test(t))set('pack','economic','باقة اقتصادي');
  else if(/فاخر|لوكس|فخم/u.test(t))set('pack','luxury','باقة فاخر');
  else if(/متوسط/u.test(t))set('pack','medium','باقة متوسط');

  function toggle(re, negative, positive, key, label){if(negative.test(t))set(key,false,`بدون ${label}`);else if(positive.test(t))set(key,true,`${label} مطلوب`);}
  toggle(/(?:بدون|من\s*غير|مفيش|مافيش|مش\s*عايز|مش\s*عاوز|لا\s*يوجد|بلا)\s*(?:بدروم|قبو)/u,/(?:بدون|من\s*غير|مفيش|مافيش|مش\s*عايز|مش\s*عاوز|لا\s*يوجد|بلا)\s*(?:بدروم|قبو)/u,/(?:بدروم\s*(?:نعم|موجود)|مع\s*بدروم|يوجد\s*بدروم|بدروم)/u,'basement','بدروم');
  toggle(/(?:بدون|من\s*غير|مفيش|مافيش|مش\s*عايز|مش\s*عاوز|لا\s*يوجد|بلا|شيل|الغى|إلغاء)\s*(?:اسانسير|مصعد|الأسانسير|الاسانسير)/u,/(?:بدون|من\s*غير|مفيش|مافيش|مش\s*عايز|مش\s*عاوز|لا\s*يوجد|بلا|شيل|الغى|إلغاء)\s*(?:اسانسير|مصعد|الأسانسير|الاسانسير)/u,/(?:اسانسير|مصعد|الأسانسير|الاسانسير)/u,'elevator','أسانسير');
  toggle(/(?:بدون|من\s*غير|مفيش|مافيش|مطبخ\s*لا|شيل|الغى|إلغاء)\s*(?:مطبخ|المطبخ)/u,/(?:بدون|من\s*غير|مفيش|مافيش|مطبخ\s*لا|شيل|الغى|إلغاء)\s*(?:مطبخ|المطبخ)/u,/(?:مطبخ)/u,'kitchen','مطبخ إضافي');
  toggle(/(?:بدون|من\s*غير|مفيش|مافيش|تكييف\s*لا|شيل|الغى|الغاء|إلغاء)\s*(?:تأسيس\s*)?(?:تكييف|المكيف)/u,/(?:بدون|من\s*غير|مفيش|مافيش|تكييف\s*لا|شيل|الغى|الغاء|إلغاء)\s*(?:تأسيس\s*)?(?:تكييف|المكيف)/u,/(?:تكييف|مكيف)/u,'ac','تأسيس تكييف');
  if(/بدروم\s*(?:لا|مش مطلوب|مش عايز)/u.test(t))set('basement',false,'بدون بدروم');
  if(/بدون\s*(?:تاسيس\s*)?تكييف/u.test(t))set('ac',false,'بدون تأسيس تكييف');
  if(/(?:الغاء|إلغاء)\s*(?:ال)?(?:اسانسير|أسانسير|مصعد)/u.test(t))set('elevator',false,'بدون أسانسير');

  const place=places.find(p=>t.includes(norm(p)));if(place)set('location',place,`الموقع: ${place}`);
  let intent='unknown',query='';
  if(facts.plotArea!==undefined && facts.area===undefined && pending!=='area')intent='plot_area';
  else if(/ابدأ\s*(?:من\s*)?جديد|ابدا\s*(?:من\s*)?جديد|من\s*الاول/u.test(t))intent='start_over';
  else if(/(?:بكام|بكم|سعر|ثمن|كام)\s*(?:طن|متر|كيلو)?/u.test(t)&&materials.some(x=>t.includes(norm(x)))){intent='price_lookup';query=materials.find(x=>t.includes(norm(x)))||t.replace(/بكام|بكم|سعر|كام|ثمن/gu,'').trim();}
  else if(/قارن|مقارنه|مقارنة/u.test(t)&&/باق|تشطيب|المستوى|الاسعار/u.test(t))intent='compare_packages';
  else if(/قارن|مقارنه|مقارنة/u.test(t))intent='compare_prices';
  else if(/لو\s*(?:شلت|شيلنا|خليناها|زودنا|قللنا|غيرنا)|سيناريو|ماذا\s*لو/u.test(t))intent='scenario';
  else if(/احسب|مقايسه|المقايسه|التكلفه|الإجمالي|الاجمالي|كام\s*الاجمالي/u.test(t))intent='calculate';
  else if(/شكرا|متشكر|تسلم/u.test(t))intent='thanks';
  else if(/مش\s*عارف|مش\s*عارفه|معرفش|مش\s*متأكد/u.test(t))intent='unknown_fact';
  else if(/مهندس|اتكلم\s*مع\s*حد|شخص\s*حقيقي|كلم\s*حد/u.test(t))intent='request_engineer';
  else if(/ليه\s*(?:بتسألني|بتسالني|سألتني|سالنتي|السؤال|بتسأل|بتسال)/u.test(t))intent='why';

  // The frozen parser provides secondary classification only; its inferred numeric defaults are not trusted.
  try{const seed={...dialogue.freshState(),modelCode:current.modelCode||null,projectKind:current.service==='building'?'building':current.service==='apartment'?'apartment':null,area:current.area??null,floors:current.floors??null,roomsPerApartment:current.rooms??null,bathrooms:current.bathrooms??null,unitsPerFloor:current.unitsPerFloor??null,package:current.pack??null,scope:current.scope??null,basement:current.basement??null,elevator:current.elevator??null,location:current.location||'الأقصر'};const d=dialogue.handle(raw,seed);if(intent==='unknown'&&d?.action==='price_lookup')intent='price_lookup';}catch(_){/* independent extraction remains deterministic */}

  // Smart deterministic layer (beno-nlu): lexicon + fuzzy + negation windows.
  // It only FILLS what the frozen regex missed — never overrides an explicit
  // regex verdict — so the 170-phrase language corpus stays intact.
  let matchedMaterial=null;
  const slotKeyMap={package:'pack',modelCode:'modelCode',scope:'scope',location:'location',basement:'basement',elevator:'elevator',kitchen:'kitchen',ac:'ac'};
  const slotLabels={pack:'مستوى التشطيب',modelCode:'نوع الخدمة',scope:'نطاق الأعمال',location:'الموقع',basement:'بدروم',elevator:'أسانسير',kitchen:'مطبخ إضافي',ac:'تأسيس تكييف'};
  const packLabels={economic:'اقتصادي',semi:'نصف تشطيب',medium:'متوسط',luxury:'فاخر'};
  const scopeLabels={structure:'هيكل فقط',finishing:'تشطيب فقط',turnkey:'على المفتاح'};
  let needsConfirmation=[],nluConfidence=null,lexiconVersion=null;
  try{
    const smart=nlu.resolve(digitText,{pending:pending||null});
    needsConfirmation=smart.needsConfirmation||[];
    lexiconVersion=smart.lexiconVersion||null;
    const scored=(smart.facts||[]).filter(f=>f.confidence>=0.8&&Object.prototype.hasOwnProperty.call(slotKeyMap,f.key));
    for(const f of scored){
      const key=slotKeyMap[f.key];
      const existing=facts[key];
      // Boolean feature correction: the frozen regex's blind positive toggles
      // ('بلا','مفيش... ' handled; 'مش عايز' missed) lose to the negation-aware
      // layer when it is *more confident* and flags explicit absence.
      const correctsAbsence=typeof f.value==='boolean'&&existing===true&&f.value===false&&f.confidence>=0.85;
      if(existing!==undefined&&existing!==null&&!correctsAbsence)continue;
      const value=(key==='pack'&&packLabels[f.value])?packLabels[f.value]:(key==='scope'&&scopeLabels[f.value])?scopeLabels[f.value]:f.value;
      const label=slotLabels[key];
      if(correctsAbsence){for(let i=0;i<found.length;i++)if(String(found[i]).includes(label)){found.splice(i,1);break;}found.push('بدون '+label);}
      else if(existing===undefined||existing===null)found.push(label+': '+String(value));
      facts[key]=value;needsConfirmation=needsConfirmation.filter(x=>x.key!==f.key);
      nluConfidence=nluConfidence===null?f.confidence:Math.min(nluConfidence,f.confidence);
    }
    if(intent==='unknown'&&smart.intent&&!['unknown','empty','answer_pending'].includes(smart.intent)&&smart.intentScore>=0.75)intent=smart.intent;
    if(!matchedMaterial&&smart.matchedMaterial&&smart.matchedMaterial.score>=0.9)matchedMaterial=smart.matchedMaterial.query;
  }catch(_){/* the nlu layer is additive; its failure never blocks extraction */}

  return {values:facts,found:[...new Set(found)],normalized:t,intent,query,unmatched:found.length===0&&intent==='unknown',matchedMaterial:matchedMaterial||materials.find(x=>t.includes(norm(x)))||null,needsConfirmation,confidence:nluConfidence===null?(Object.keys(facts).length||intent!=='unknown'?1:null):nluConfidence,lexiconVersion};
}
module.exports={infer,norm,normalizedDigits,wordsToNumericText,places,materials};
