/*
 * MIYAR resource take-off engine — deterministic, no LLM/network dependency.
 * Default rates are transcribed from the user's Egyptian construction-consumption note.
 * Estimated rates are for preliminary planning, not a substitute for drawings/design BOQs.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MIYAR_TAKEOFF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const RATE_REGISTRY = root?.MIYAR_RATES || (typeof require === 'function' ? require('./miyar-rates.js') : null);
  const BOQ_METHODOLOGY = typeof require === 'function' ? require('./miyar-boq-methodology.js') : null;
  const RATE_DEFINITIONS = [
    {key:'steelKgPerM2', label:'حديد التسليح للمسطح المبني', unit:'كجم/م²', low:60, high:100, group:'الهيكل الخرساني', desc:'معدل عام للأدوار فوق الأرض؛ لا يمثل تفريد الحديد من اللوحات.'},
    {key:'concreteM3PerM2', label:'الخرسانة المسلحة للمسطح المبني', unit:'م³/م²', low:0.30, high:0.40, group:'الهيكل الخرساني', desc:'معدل عام للأدوار فوق الأرض؛ يلزم تفريد العناصر للمقايسة التنفيذية.'},
    {key:'basementSteelKgPerM2', label:'حديد البدروم لكل م² بصمة', unit:'كجم/م²', low:60, high:90, group:'البدروم', desc:'معدل منفصل عن الدور العادي؛ لا يغني عن التفريد الإنشائي.'},
    {key:'basementConcreteM3PerM2', label:'خرسانة البدروم لكل م² بصمة', unit:'م³/م²', low:0.45, high:0.70, group:'البدروم', desc:'معدل منفصل للبدروم؛ لا يغني عن حصر اللبشة والحوائط والقواعد.'},
    {key:'rcCementKgPerM3', label:'أسمنت الخرسانة المسلحة بالموقع', unit:'كجم/م³ خرسانة', low:350, high:350, group:'الخلط بالموقع', desc:'7 شكاير × 50 كجم لكل م³ وفق جدول الخلطة المرفق.'},
    {key:'plainCementKgPerM3', label:'أسمنت الخرسانة العادية بالموقع', unit:'كجم/م³ خرسانة', low:250, high:250, group:'الخلط بالموقع', desc:'5 شكاير × 50 كجم لكل م³ وفق جدول الخلطة المرفق.'},
    {key:'rcSandM3PerM3', label:'رمل خلطة الخرسانة', unit:'م³/م³ خرسانة', low:0.40, high:0.40, group:'الخلط بالموقع', desc:'معدل خلطة المصدر.'},
    {key:'rcAggregateM3PerM3', label:'زلط/سن خلطة الخرسانة', unit:'م³/م³ خرسانة', low:0.80, high:0.80, group:'الخلط بالموقع', desc:'معدل خلطة المصدر.'},
    {key:'rcWaterLPerM3', label:'ماء الخلطة المسلحة', unit:'لتر/م³ خرسانة', low:175, high:175, group:'الخلط بالموقع', desc:'يتغير حسب رطوبة الركام وتصميم الخلطة.'},
    {key:'plainWaterLPerM3', label:'ماء الخلطة العادية', unit:'لتر/م³ خرسانة', low:125, high:125, group:'الخلط بالموقع', desc:'يتغير حسب رطوبة الركام وتصميم الخلطة.'},
    {key:'halfBrickPerM2', label:'طوب لحائط نصف طوبة', unit:'طوبة/م²', low:55, high:55, group:'المباني', desc:'طوب أحمر 12 سم؛ راجع أبعاد الطوبة والفواصل.'},
    {key:'halfBrickSandM3PerM2', label:'رمل مونة حائط نصف طوبة', unit:'م³/م² حائط', low:0.022, high:0.022, group:'المباني', desc:'معدل المصدر المرفق.'},
    {key:'halfBrickCementKgPerM2', label:'أسمنت مونة حائط نصف طوبة', unit:'كجم/م² حائط', low:8, high:8, group:'المباني', desc:'المصدر يذكر أيضًا معدلًا عامًا للمونة 300–350 كجم/م³ رمل؛ راجع التعارض.'},
    {key:'fullBrickPerM2', label:'طوب لحائط طوبة كاملة', unit:'طوبة/م²', low:110, high:110, group:'المباني', desc:'حائط نحو 25 سم؛ راجع أبعاد الطوبة والفواصل.'},
    {key:'fullBrickSandM3PerM2', label:'رمل مونة حائط طوبة كاملة', unit:'م³/م² حائط', low:0.045, high:0.045, group:'المباني', desc:'معدل المصدر المرفق.'},
    {key:'fullBrickCementKgPerM2', label:'أسمنت مونة حائط طوبة كاملة', unit:'كجم/م² حائط', low:16, high:16, group:'المباني', desc:'المصدر يذكر أيضًا معدلًا عامًا للمونة 300–350 كجم/م³ رمل؛ راجع التعارض.'},
    {key:'plasterCementKgPerM2', label:'أسمنت المحارة', unit:'كجم/م²', low:7.5, high:12, group:'المحارة والطرطشة', desc:'اتساع النطاق يجمع القيم المتعارضة 7.5–10 و9–12 كجم/م² الواردة في المصدر.'},
    {key:'plasterSandM3PerM2', label:'رمل المحارة', unit:'م³/م²', low:0.025, high:0.025, group:'المحارة والطرطشة', desc:'سمك مرجعي نحو 2 سم.'},
    {key:'splashCementKgPerM2', label:'أسمنت الطرطشة', unit:'كجم/م²', low:2.25, high:2.25, group:'المحارة والطرطشة', desc:'سمك مرجعي نحو 0.5 سم.'},
    {key:'splashSandM3PerM2', label:'رمل الطرطشة', unit:'م³/م²', low:0.005, high:0.005, group:'المحارة والطرطشة', desc:'معدل المصدر المرفق.'},
    {key:'tileCementKgPerM2', label:'أسمنت مونة تركيب البلاط', unit:'كجم/م²', low:10, high:10, group:'الأرضيات', desc:'يعادل شيكارة 50 كجم لكل 5 م² حسب المصدر.'},
    {key:'tileSandM3PerM2', label:'رمل مونة تركيب البلاط', unit:'م³/م²', low:0.04, high:0.04, group:'الأرضيات', desc:'فرشة تسوية إضافية غير محسوبة إذا لزم الأمر.'},
    {key:'tileWaste', label:'هالك السيراميك والبورسلين', unit:'%', low:5, high:10, group:'الهالك', desc:'يطبق على كمية الشراء، لا على المساحة الصافية المنفذة.'},
    {key:'sealerLPerM2', label:'سيلر داخلي', unit:'لتر/م² سطح', low:0.08, high:0.12, group:'الدهانات', desc:'سطح الدهان المقاس، وليس مسطح الدور.'},
    {key:'puttyKgPerM2', label:'معجون داخلي', unit:'كجم/م² سطح', low:0.5, high:1.0, group:'الدهانات', desc:'3 سكاكين حسب الملف.'},
    {key:'interiorPaintLPerM2', label:'بلاستيك داخلي', unit:'لتر/م² سطح', low:0.125, high:0.20, group:'الدهانات', desc:'المعدل المركزي 0.146 (منتصف 0.125–0.167 لثلاثة أوجه)؛ حد 0.20 محفوظ كتعارض مصدر واضح وليس كمركز افتراضي.'},
    {key:'exteriorPaintLPerM2', label:'بلاستيك خارجي', unit:'لتر/م² سطح', low:0.15, high:0.25, group:'الدهانات', desc:'الامتصاص ونوع النظام يؤثران في الاستهلاك.'},
    {key:'exteriorPuttyKgPerM2', label:'معجون خارجي', unit:'كجم/م² سطح', low:0.8, high:1.5, group:'الدهانات', desc:'حسب خشونة السطح.'},
    {key:'membraneM2PerM2', label:'رول عزل مائي شامل التراكب', unit:'م² رول/م² سطح', low:1.1, high:1.3, group:'العزل', desc:'الكمية التي تُشترى بعد التراكب.'},
    {key:'bitumenKgPerM2', label:'بيتومين لعزل وجهين', unit:'كجم/م² سطح', low:180/70, high:200/60, group:'العزل', desc:'مستنتج من برميل 180–200 كجم يغطي 60–70 م² لوجهين.'},
    {key:'thermalBoardM2PerM2', label:'لوح عزل حراري', unit:'م²/م² سطح', low:1, high:1, group:'العزل', desc:'لا يتضمن المادة اللاصقة أو المثبتات.'},
    {key:'fiberglassMeshM2PerM2', label:'شبك فيبر جلاس', unit:'م²/م² سطح', low:1.05, high:1.15, group:'العزل', desc:'يشمل التراكب.'},
    {key:'gypsumBoardM2PerM2', label:'ألواح جبس بورد', unit:'م² لوح/م² سقف', low:1.05, high:1.2, group:'الجبس بورد', desc:'لا يمكن تحويلها إلى عدد ألواح دون أبعاد اللوح.'},
    {key:'gypsumScrewsPerM2', label:'مسامير جبس بورد', unit:'مسمار/م²', low:25, high:35, group:'الجبس بورد', desc:'حسب التصميم والمسافات.'},
    {key:'gypsumProfileLmPerM2', label:'بروفايل معدني للجبس', unit:'م طولي/م²', low:1.2, high:1.5, group:'الجبس بورد', desc:'حسب توزيع الهيكل والمسافات.'},
    {key:'bindingWireKgPerTonne', label:'سلك ربط الحديد', unit:'كجم/طن حديد', low:8, high:12, group:'الهيكل الخرساني', desc:'توحيد مؤقت على 8–12 كجم/طن لتصحيح احتمال خطأ الوحدة في المصدر؛ قابل للتعديل والمراجعة.'},
    {key:'spacersPerM2', label:'كراسي/فواصل بلاستيك للحديد', unit:'قطعة/م²', low:3, high:5, group:'الهيكل الخرساني', desc:'حسب العنصر وغطاء الخرسانة.'}
  ];

  const rateAliases = {
    puttyKgPerM2: 'puttyKgPerM2Surface',
    sealerLPerM2: 'sealerLPerM2Surface',
    interiorPaintLPerM2: 'interiorPaintLPerM2Surface',
    basementSteelKgPerM2: 'basementSteelKgPerM2', basementConcreteM3PerM2: 'basementConcreteM3PerM2',
    plasterCementKgPerM2: 'plasterCementKgPerM2Surface',
    plasterSandM3PerM2: 'plasterSandM3PerM2Surface',
    tileWaste: 'tileWaste',
    tileCementKgPerM2: 'floorTileCementKgPerM2',
    tileSandM3PerM2: 'floorTileSandM3PerM2'
  };
  const rateMap = Object.fromEntries(RATE_DEFINITIONS.map(r => {
    const shared = RATE_REGISTRY?.defaults?.[r.key] || RATE_REGISTRY?.defaults?.[rateAliases[r.key]];
    return [r.key, shared ? {...r,low:shared.low,high:shared.high,defaultValue:shared.value,desc:shared.basis||r.desc} : r];
  }));
  const n = v => v===null||v===undefined||v==='' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const round = (v, digits=3) => v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(digits));
  const midpoint = (a,b) => (a+b)/2;
  const norm = s => String(s ?? '').normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ـ/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');

  function getRate(settings, key) {
    const def = rateMap[key];
    const saved = settings && settings.resourceRates && settings.resourceRates[key];
    const low = n(saved && saved.low);
    const high = n(saved && saved.high);
    let lo = low === null ? def.low : low;
    let hi = high === null ? def.high : high;
    if (lo > hi) [lo,hi] = [hi,lo];
    const savedValue=n(saved && saved.value);
    const centralValue=n(def.defaultValue);
    const candidate=savedValue!==null?savedValue:(lo===hi?lo:(centralValue!==null&&centralValue>=lo&&centralValue<=hi?centralValue:midpoint(lo,hi)));
    const mid=Math.min(hi,Math.max(lo,candidate));
    return {low:lo, high:hi, mid, definition:def};
  }
  function rateQuantity(base, key, settings, multiplier=1) {
    if (base === null || base === undefined || !Number.isFinite(Number(base))) return {value:null,low:null,high:null,gap:true};
    const r=getRate(settings,key);
    return {low:base*r.low*multiplier, high:base*r.high*multiplier, value:base*r.mid*multiplier, gap:false};
  }
  function exactQuantity(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return {value:null,low:null,high:null,gap:true};
    const x=Math.max(0,Number(value));return {value:x,low:x,high:x,gap:false};
  }
  function normalizeUnit(unit) {
    const s=norm(unit).replace(/متر مربع/g,'م2').replace(/متر مكعب/g,'م3').replace(/متر طولي/g,'م طولي');
    if (s.includes('الف طوبه') || s.includes('1000 طوبه')) return 'thousand_brick';
    if (s === 'طوبه' || s === 'قطعه طوب') return 'brick';
    if (s === 'طن' || s === 'ton') return 'ton';
    if (s === 'كجم' || s === 'كيلوجرام' || s === 'kg') return 'kg';
    if (s === 'شيكاره' || s.includes('كيس اسمنت')) return 'bag50';
    if (s.includes('م3') || s === 'm3') return 'm3';
    if (s.includes('م2') || s === 'm2') return 'm2';
    if (s.includes('متر طولي') || s === 'م طولي' || s === 'متر' || s === 'م' || s === 'm' || s === 'meter') return 'lm';
    if (s === 'لتر' || s === 'liter') return 'liter';
    if (s.includes('لوح')) return 'board';
    if (s === 'مسمار') return 'screw';
    if (s === 'قطعه') return 'piece';
    if (s === 'باب') return 'door';
    if (s === 'نقطه') return 'point';
    if (s === 'مشروع' || s.includes('مشروع حمام')) return 'project';
    // The single sanitary set is the same commercial unit whether entered as 'طقم' or 'طقم حمام'.
    if (s === 'طقم' || s === 'طقم حمام' || s === 'طقم صحي') return 'sanitary_set';
    if (s === 'وحده' || s === 'عداد' || s === 'وصله') return 'unit';
    if (s === 'سنه') return 'year';
    return s;
  }
  function convertPriceValue(value, fromUnit, toUnit) {
    const v=n(value); if(v===null) return null;
    const from=normalizeUnit(fromUnit), to=normalizeUnit(toUnit);
    if(from===to) return v;
    if(from==='thousand_brick' && to==='brick') return v/1000;
    if(from==='brick' && to==='thousand_brick') return v*1000;
    if(from==='ton' && to==='kg') return v/1000;
    if(from==='kg' && to==='ton') return v*1000;
    if(from==='bag50' && to==='ton') return v*20;
    if(from==='ton' && to==='bag50') return v/20;
    if(from==='bag50' && to==='kg') return v/50;
    if(from==='kg' && to==='bag50') return v*50;
    return null;
  }
  function rowHasPrice(r) { return !!r && r.status!=='missing' && n(r.avg)!==null && n(r.avg)>0; }
  function daysOld(date) { const d=date?new Date(date+'T00:00:00Z'):null; if(!d||!Number.isFinite(d.getTime()))return null;return Math.floor((Date.now()-d.getTime())/86400000); }
  function lookupPrice(db, candidates, unit, settings) {
    const names=(Array.isArray(candidates)?candidates:[candidates]).filter(Boolean).map(norm);
    const rows=(db||[]).filter(r=>r&&r.active!==false);
    for(const sought of names){
      // Canonical rows are matched by their primary name first. Historical item names are
      // resolved through aliases only when no exact active row exists, avoiding duplicate pricing.
      const exact=rows.filter(r=>norm(r.name)===sought);
      const matches=exact.length ? exact : rows.filter(r=>(Array.isArray(r.aliases)?r.aliases:[]).some(alias=>norm(alias)===sought));
      if(!matches.length) continue;
      // Prefer a compatible priced row; retain a missing compatible row as a gap if no alternate works.
      const compatible=matches.filter(r=>normalizeUnit(r.unit)===normalizeUnit(unit)||convertPriceValue(1,r.unit,unit)!==null).map(r=>({r,avg:convertPriceValue(r.avg,r.unit,unit),low:convertPriceValue(r.low,r.unit,unit),high:convertPriceValue(r.high,r.unit,unit)}));
      const priced=compatible.filter(x=>rowHasPrice(x.r));
      const preferred=(priced.length?priced:compatible).sort((a,b)=>{
        const rank={local:0,national:1,estimate:2,missing:3};
        return (rank[a.r.status]??9)-(rank[b.r.status]??9) || String(b.r.date||'').localeCompare(String(a.r.date||''));
      })[0];
      if(preferred){
        const r=preferred.r,old=daysOld(r.date),stale=old!==null&&old>Number((settings&&settings.staleDays)||90);
        return {unitPrice:rowHasPrice(r)?preferred.avg:null, priceLow:rowHasPrice(r)?(preferred.low??preferred.avg):null, priceHigh:rowHasPrice(r)?(preferred.high??preferred.avg):null, priceStatus:rowHasPrice(r)?r.status:'missing', priceSource:r.source||'', priceDate:r.date||'', priceName:r.name, stale, oldDays:old, transport:r.transport||'unknown', transportNote:r.transportNote||''};
      }
      // Don't silently convert incompatible units; remember the explicit catalog row as a reason for a gap.
      const first=matches[0];
      return {unitPrice:null,priceLow:null,priceHigh:null,priceStatus:'missing',priceSource:first.source||'',priceDate:first.date||'',priceName:first.name,stale:false,oldDays:null,transport:first.transport||'unknown',transportNote:first.transportNote||'',unitMismatch:true,catalogUnit:first.unit};
    }
    return {unitPrice:null,priceLow:null,priceHigh:null,priceStatus:'missing',priceSource:'',priceDate:'',priceName:null,stale:false,oldDays:null,transport:'unknown',transportNote:''};
  }

  function buildMaterialTakeoff(project, floorSpecs, db, settings, overrides) {
    const p=project||{}, floors=Array.isArray(floorSpecs)?floorSpecs:[], catalog=Array.isArray(db)?db:[], cfg=settings||{}, manual=overrides||{};
    const lines=[];
    const includeStructure=p.scope!=='finishing';
    const includeFinishing=p.scope!=='structure';
    const rateConflicts=[
      {severity:'critical',title:'تعارض كبير في معدل حديد التسليح',detail:'الملف يذكر 60–100 كجم/م²، كما يذكر أن مسطح 150 م² قد يحتاج 9–15 طنًا، وهذان متسقان تقريبًا. لكنه يذكر أيضًا طنًا لكل 80 م²، أي 12.5 كجم/م² فقط؛ هذا أقل بكثير من النطاق السابق. يستخدم المحرك نطاق 60–100 كجم/م² كتقدير تخطيطي ويهمل قاعدة طن/80 م² إلى أن تعتمد الشركة معدلًا موحدًا، ولا يعد ذلك تفريد حديد من اللوحات.'},
      {severity:'critical',title:'تعارض كبير في معدل أسمنت الهيكل لكل م²',detail:'الملف يذكر 6–8 شكاير/م² مبني، بينما معدل الخرسانة 0.30–0.40 م³/م² × 7 شكاير/م³ ينتج نحو 2.1–2.8 شيكارة/م² للخرسانة فقط. كما يذكر الجدول الإجمالي 60–80 شيكارة لكل 100 م². لم أستخدم معدل 6–8 شكاير/م² في الحصر؛ عند خلط الموقع استخدمت مكونات الخلطة لكل م³ فقط.'},
      {severity:'medium',title:'اختلاف معدل أسمنت المحارة',detail:'ورد معدل 7.5–10 كجم/م² في جدول، و9–12 كجم/م² في النص. يعرض المحرك النطاق الجامع 7.5–12 كجم/م² بدل إخفاء التعارض.'},
      {severity:'medium',title:'تعارض محتمل في سلك الربط',detail:'المصدر كتب 0.5–1 كجم لكل طن، وقد يكون المقصود 0.5–1% من وزن الحديد. اعتمدت المنصة مؤقتًا 8–12 كجم/طن كمدى قابل للتعديل، ويجب تأكيده من المقاول/المورد قبل الطلب.'},
      {severity:'medium',title:'معدلات الملخص لكل 100 م² ليست قابلة للجمع مع التفصيل',detail:'جدول المواد لكل 100 م² مبنى يجمع بنودًا إنشائية ومونة ومحارة وتشطيبات في قيمة إجمالية تقديرية؛ لا يُضاف إلى خطوط الحصر التفصيلية لتجنب ازدواج الكميات.'},
      {severity:'medium',title:'المعدلات المساحية ليست حصرًا إنشائيًا',detail:'توزيع الحديد والخرسانة على الأدوار بالتساوي لغرض التخطيط فقط. لا يحدد المعدل العام كميات القواعد والأعمدة والكمرات والأسقف لكل دور؛ يلزم جدول كميات/رسومات إنشائية للشراء التنفيذي.'}
    ];

    function hasManualValue(key) {
      return Object.prototype.hasOwnProperty.call(manual,key) && manual[key]!=='' && manual[key]!==null && manual[key]!==undefined && Number.isFinite(Number(manual[key])) && Number(manual[key])>=0;
    }
    function applyManual(key, q) {
      if(hasManualValue(key)) return exactQuantity(manual[key]);
      return q;
    }
    function add(spec) {
      const key=spec.key;
      const q=spec.skipManual?spec.quantity:applyManual(key,spec.quantity||exactQuantity(null));
      const rate=spec.priceCandidates?lookupPrice(catalog,spec.priceCandidates,spec.unit,cfg):{unitPrice:null,priceLow:null,priceHigh:null,priceStatus:'missing',priceSource:'',priceDate:'',stale:false,transport:'unknown',transportNote:''};
      const value=q.value, unitPrice=rate.unitPrice;
      const qtyGap=q.gap || value===null;
      const wastePercent = spec.wasteIncluded ? 0 : (BOQ_METHODOLOGY ? BOQ_METHODOLOGY.getWastePercent(cfg, { ...spec, code:spec.key, item:spec.item, kind:spec.kind || 'material' }) : Number(spec.wastePercent || 0));
      const billableValue = value===null ? null : value*(1+wastePercent/100);
      const billableLow = q.low===null || q.low===undefined ? null : q.low*(1+wastePercent/100);
      const billableHigh = q.high===null || q.high===undefined ? null : q.high*(1+wastePercent/100);
      const priceGap=spec.required!==false && spec.kind!=='nonpriced' && unitPrice===null;
      const warnings=[...(spec.warnings||[])];
      const quantitySource=spec.quantitySource || (hasManualValue(key)?'تعديل يدوي من جدول الحصر':qtyGap?'حصر مطلوب / لم تُدخل الكمية':'حساب وفق المعدل أو المدخلات الموضحة');
      if(qtyGap && !warnings.some(x=>/الكمية|الحصر|المخطط/.test(x))) warnings.push('الكمية تحتاج قياسًا من الرسومات أو إدخال حصر معتمد.');
      if(priceGap) warnings.push(rate.unitMismatch?`وحدة السعر في الكتالوج (${rate.catalogUnit}) لا تتوافق مع وحدة الحصر (${spec.unit})؛ لم يتم التحويل.`:'لا يوجد سعر وحدة قابل للاستخدام لهذا البند؛ أدخل سعر التوريد/المصنعية من لوحة الإدارة.');
      if(rate.stale) warnings.push(`السعر قديم (${rate.oldDays} يومًا) ويحتاج تأكيدًا.`);
      if(rate.priceStatus==='national') warnings.push('سعر وطني بديل وليس عرضًا محليًا مؤكدًا للأقصر.');
      if(rate.transport==='no') warnings.push('السعر لا يشمل النقل للموقع.');
      else if(rate.transport==='unknown' && spec.kind==='material') warnings.push('شمول النقل غير معروف.');
      if(rate.transportNote) warnings.push(rate.transportNote);
      const cost=billableValue!==null&&unitPrice!==null?billableValue*unitPrice:null;
      const costLow=billableLow!==null&&rate.priceLow!==null?billableLow*rate.priceLow:null;
      const costHigh=billableHigh!==null&&rate.priceHigh!==null?billableHigh*rate.priceHigh:null;
      if (wastePercent>0) warnings.push(`نسبة هالك التوريد ${wastePercent}% مطبقة على الخامات فقط؛ المصنعية تظل على الكمية الصافية.`);
      lines.push({key,floorKey:spec.floorKey||'project',floorLabel:spec.floorLabel||'المشروع',trade:spec.trade||'عام',item:spec.item,kind:spec.kind||'material',resourceKey:spec.resourceKey||norm(spec.item)+'|'+spec.unit+'|'+(spec.kind||'material'),quantity:round(value),quantityLow:round(q.low),quantityHigh:round(q.high),billableQuantity:round(billableValue),wastePercent:round(wastePercent,2),unit:spec.unit,unitPrice:unitPrice===null?null:round(unitPrice,4),priceLow:rate.priceLow===null?null:round(rate.priceLow,4),priceHigh:rate.priceHigh===null?null:round(rate.priceHigh,4),cost:cost===null?null:round(cost,2),costLow:costLow===null?null:round(costLow,2),costHigh:costHigh===null?null:round(costHigh,2),priceStatus:rate.priceStatus,priceSource:rate.priceSource,priceDate:rate.priceDate,priceName:rate.priceName||null,transport:rate.transport,basis:spec.basis||'',warnings:[...new Set(warnings)],quantityGap:qtyGap,priceGap,quantitySource,required:spec.required!==false,stale:rate.stale,unitMismatch:!!rate.unitMismatch});
      return lines[lines.length-1];
    }
    function r(key){return getRate(cfg,key);}
    function kgInfo(area, key){const q=rateQuantity(area,key,cfg);return {value:q.value===null?null:q.value/1000,low:q.low===null?null:q.low/1000,high:q.high===null?null:q.high/1000,gap:q.gap};}
    function areaInfo(area,key,mult=1){return rateQuantity(area,key,cfg,mult);}
    function lineFloorKey(f,s){return `${f.key}::${s}`;}
    function manualInputQty(f,key){const value=f[key]; return value===null||value===undefined||value===''?null:Math.max(0,Number(value)||0);}
    function exactOrGap(value){return value===null?exactQuantity(null):exactQuantity(value);}
    function addCement(f, suffix, title, kgQuantity, basis, warnings=[]) {
      const tonne={value:kgQuantity.value===null?null:kgQuantity.value/1000,low:kgQuantity.low===null?null:kgQuantity.low/1000,high:kgQuantity.high===null?null:kgQuantity.high/1000,gap:kgQuantity.gap};
      add({key:lineFloorKey(f,suffix),floorKey:f.key,floorLabel:f.label,item:title,trade:'توريد مواد — الأسمنت',kind:'material',resourceKey:'cement|طن|material',unit:'طن',quantity:tonne,skipManual:false,priceCandidates:['أسمنت رمادي عام','أسمنت بني سويف','أسمنت السويس'],basis:basis,warnings:[...warnings,'يعادل كل طن 20 شيكارة وزن 50 كجم.']});
    }
    function addSand(f,suffix,title,quantity,basis,warnings=[]) {
      add({key:lineFloorKey(f,suffix),floorKey:f.key,floorLabel:f.label,item:title,trade:'توريد مواد — الرمل',kind:'material',resourceKey:'sand|م³|material',unit:'م³',quantity,priceCandidates:['رمل عادي / حرش','رمل عادي/حرش','رمل عادي','رمل ناعم'],basis,warnings});
    }
    function addAggregate(f,suffix,title,quantity,basis,warnings=[]) {
      add({key:lineFloorKey(f,suffix),floorKey:f.key,floorLabel:f.label,item:title,trade:'توريد مواد — الزلط/السن',kind:'material',resourceKey:'aggregate|م³|material',unit:'م³',quantity,priceCandidates:['زلط عادي','سن'],basis,warnings});
    }
    function materialQtyLine(f,suffix,item,unit,quantity,candidates,basis,warnings=[],kind='material',trade='توريد خامات',extra={}) {
      return add({key:lineFloorKey(f,suffix),floorKey:f.key,floorLabel:f.label,item,trade,kind,unit,quantity,priceCandidates:candidates,basis,warnings,...extra});
    }
    function laborLine(f,suffix,item,unit,quantity,candidates,basis,warnings=[]) {
      return add({key:lineFloorKey(f,suffix),floorKey:f.key,floorLabel:f.label,item,trade:'مصنعية / تنفيذ',kind:'labor',unit,quantity,priceCandidates:candidates,basis,warnings});
    }

    for(const f of floors){
      const area=Number(f.area)||0;
      // Structural quantities. Explicit user-entered quantities replace the area allowance and become exact.
      if(includeStructure){
        const measuredSteel=manualInputQty(f,'steelTonnes');
        let steelQ=measuredSteel===null?areaInfo(area,f.isBasement?'basementSteelKgPerM2':'steelKgPerM2',0.001):exactQuantity(measuredSteel); // kg/m² to tonne/m² unless a per-floor quantity was entered
        const steelKey=lineFloorKey(f,'steel_tonnes');
        steelQ=applyManual(steelKey,steelQ);
        const steelManual=measuredSteel!==null||hasManualValue(steelKey);
        const steelChoice=p.steelChoice||'حديد استثماري';
        const steelWarnings=[f.isBasement?'معدل البدروم مستقل 60–90 كجم/م² بصمة؛ البصمة تستخدم مساحة البدروم المدخلة ويظل المعدل تقديريًا لا تفريدًا من اللوحات.':'توزيع حديد المسطح العام على هذا الدور مخصص للتخطيط فقط، وليس تفريدًا من اللوحات.'];
        if(!steelManual&&!f.isBasement)steelWarnings.push('تعارض معدل الحديد في المصدر: 60–100 كجم/م² مقابل طن/80 م². لا تعتمد طلبية الحديد قبل حصر الرسومات أو اعتماد معدل الشركة.');
        const steelLine=add({key:steelKey,floorKey:f.key,floorLabel:f.label,item:steelChoice,trade:'الهيكل الخرساني — توريد',kind:'material',resourceKey:'reinforcement_steel|طن|material',unit:'طن',quantity:steelQ,skipManual:true,priceCandidates:[steelChoice,'حديد استثماري'],basis:steelManual?'كمية مدخلة لكل دور وتتطلب مطابقة مع الحصر المعتمد.':f.isBasement?'بصمة البدروم × معدل مستقل 60–90 كجم/م²؛ راجع تصميم اللبشة والحوائط.':'مسطح الدور × معدل 60–100 كجم/م²؛ المتوسط الحسابي افتراضي.',quantitySource:steelManual?'كمية مدخلة/حصر يدوي':f.isBasement?'معدل بدروم تقديري مستقل':'معدل تخطيطي متعارض في المصدر',warnings:steelWarnings});
        const bindingCorrect=steelQ.value===null?{value:null,low:null,high:null,gap:true}:(()=>{const rr=r('bindingWireKgPerTonne');return {value:steelQ.value*rr.mid,low:steelQ.value*rr.low,high:steelQ.value*rr.high,gap:false};})();
        materialQtyLine(f,'binding_wire','سلك ربط حديد','كجم',bindingCorrect,['سلك ربط حديد'],'معدل مؤقت 8–12 كجم/طن (القيمة المركزية 10) بناءً على تصحيح محتمل لوحدة المصدر؛ راجع المورد/المقاول قبل الطلب.');
        const spacerQ=areaInfo(area,'spacersPerM2');
        materialQtyLine(f,'plastic_spacers','كراسي/فواصل بلاستيك للحديد','قطعة',spacerQ,['كراسي بلاستيك للحديد'],'3–5 قطع لكل م²؛ راجع النوع والتوزيع حسب العنصر.');

        const measuredConcrete=manualInputQty(f,'concreteM3');
        let concreteQ=measuredConcrete===null?areaInfo(area,f.isBasement?'basementConcreteM3PerM2':'concreteM3PerM2'):exactQuantity(measuredConcrete);
        const concreteKey=lineFloorKey(f,'concrete_m3');
        concreteQ=applyManual(concreteKey,concreteQ);
        const concreteManual=measuredConcrete!==null||hasManualValue(concreteKey);
        const concreteEstimateWarnings=!concreteManual?[f.isBasement?'حجم خرسانة البدروم باستخدام نطاق 0.45–0.70 م³/م² بصمة؛ ليس حصر لبشة/حوائط/قواعد من اللوحات.':'حجم الخرسانة من معدل مساحي عام، وليس حصر عناصر. لا تعتمد طلبية الخرسانة أو مكوناتها قبل مراجعة الحجم على الرسومات.']:[];
        if(p.concreteMethod==='site_mix'){
          add({key:lineFloorKey(f,'concrete_volume_reference'),floorKey:f.key,floorLabel:f.label,item:'حجم الخرسانة المسلحة (مرجعي — لا يُجمع مع المكونات)',trade:'الهيكل الخرساني — حجم',kind:'nonpriced',unit:'م³',quantity:concreteQ,skipManual:true,basis:concreteManual?'حجم الخرسانة أدخل يدويًا.':f.isBasement?'بصمة البدروم × 0.45–0.70 م³/م²؛ تقدير مساحي مستقل وليس حصر عناصر.':'مسطح الدور × 0.30–0.40 م³/م²؛ تقدير مساحي فقط.',quantitySource:concreteManual?'كمية مدخلة/حصر يدوي':f.isBasement?'معدل بدروم تقديري مستقل':'معدل مساحي تخطيطي',warnings:['هذا السطر مرجعي؛ التكلفة مشتقة من الأسمنت والرمل والزلط والماء أدناه ولا تُضاف مرة ثانية.',...concreteEstimateWarnings]});
          const cementKg={value:concreteQ.value===null?null:concreteQ.value*r('rcCementKgPerM3').mid,low:concreteQ.low===null?null:concreteQ.low*r('rcCementKgPerM3').low,high:concreteQ.high===null?null:concreteQ.high*r('rcCementKgPerM3').high,gap:concreteQ.gap};
          addCement(f,'concrete_cement','أسمنت خلط الخرسانة المسلحة',cementKg,'حجم الخرسانة × 350 كجم/م³ = 7 شكاير/م³.', ['لا تستخدم معدل 6–8 شكاير لكل م²؛ توجد به فجوة تعارض في المصدر.','معدل الأسمنت لكل م³ من المصدر تقديري؛ لا تعتمد طلبية الأسمنت قبل اعتماد تصميم الخلطة/مقاومة الخرسانة.',...concreteEstimateWarnings]);
          const sandQ={value:concreteQ.value===null?null:concreteQ.value*r('rcSandM3PerM3').mid,low:concreteQ.low===null?null:concreteQ.low*r('rcSandM3PerM3').low,high:concreteQ.high===null?null:concreteQ.high*r('rcSandM3PerM3').high,gap:concreteQ.gap};
          addSand(f,'concrete_sand','رمل خلطة الخرسانة المسلحة',sandQ,'حجم الخرسانة × 0.40 م³ رمل لكل م³ خرسانة.', ['معدل الخلطة تقريبي؛ راجع تصميم الخلطة قبل طلب المواد.',...concreteEstimateWarnings]);
          const aggQ={value:concreteQ.value===null?null:concreteQ.value*r('rcAggregateM3PerM3').mid,low:concreteQ.low===null?null:concreteQ.low*r('rcAggregateM3PerM3').low,high:concreteQ.high===null?null:concreteQ.high*r('rcAggregateM3PerM3').high,gap:concreteQ.gap};
          addAggregate(f,'concrete_aggregate','زلط/سن خلطة الخرسانة المسلحة',aggQ,'حجم الخرسانة × 0.80 م³ ركام لكل م³ خرسانة.', ['معدل الخلطة تقريبي؛ راجع تصميم الخلطة قبل طلب المواد.',...concreteEstimateWarnings]);
          const waterQ={value:concreteQ.value===null?null:concreteQ.value*r('rcWaterLPerM3').mid,low:concreteQ.low===null?null:concreteQ.low*r('rcWaterLPerM3').low,high:concreteQ.high===null?null:concreteQ.high*r('rcWaterLPerM3').high,gap:concreteQ.gap};
          materialQtyLine(f,'concrete_water','ماء خلط الخرسانة','لتر',waterQ,[],'175 لتر/م³؛ كمية تشغيلية تقريبية تظهر للمراجعة ولا تدخل في قائمة طلبيات المواد المسعرة.', ['تُعدّل وفق رطوبة الركام وتصميم الخلطة.'],'nonpriced','معلومة تشغيلية');
        } else {
          add({key:concreteKey,floorKey:f.key,floorLabel:f.label,item:`خرسانة جاهزة ${p.concreteGrade||'C25'}`,trade:'الهيكل الخرساني — توريد',kind:'material',resourceKey:'ready_concrete|م³|material',unit:'م³',quantity:concreteQ,skipManual:true,priceCandidates:[`خرسانة جاهزة ${p.concreteGrade||'C25'}`],basis: measuredConcrete!==null||Object.prototype.hasOwnProperty.call(manual,concreteKey)?'حجم أدخله المستخدم لكل دور.':'مسطح الدور × 0.30–0.40 م³/م²؛ تقدير مساحي عام وليس حصر عناصر.',quantitySource:concreteManual?'كمية مدخلة/حصر يدوي':f.isBasement?'حصر خاص مطلوب':'معدل مساحي تخطيطي',warnings:[f.isBasement?'راجع حصر القواعد واللبشة وحوائط البدروم والعزل؛ معدل المساحة مجرد تقدير بديل.':'راجع الحجم على الرسومات الإنشائية ومقاومة الخرسانة قبل طلب التوريد.',...concreteEstimateWarnings]});
          if(f.key===floors[0]?.key){
            add({key:'project::concrete_pump',floorKey:'project',floorLabel:'المشروع',item:'مضخة خرسانة / انتقال وتشغيل',trade:'معدات صب',kind:'equipment',unit:'مشروع',quantity:exactQuantity(1),priceCandidates:['مضخة خرسانة','أجرة مضخة خرسانة'],basis:'وحدة تعبئة أولية فقط؛ يجب تعديلها حسب عدد الصبات/الأيام وعرض شركة المضخة.',warnings:['لا تفترض أن تكلفة المضخة سعر ثابت للمشروع قبل عرض المورد.']});
          }
        }
        laborLine(f,'structural_labor','مصنعية الهيكل الخرساني — حدادة ونجارة وشدة وصب','م³',concreteQ,['مصنعية الهيكل الخرساني شاملة الحدادة والنجارة والصب والشدة'],'بند واحد لكل م³ خرسانة من القواعد حتى آخر سقف؛ يشمل مصنعية الحديد والنجارة/الشدة والصب. لا تضاف مصنعية حدادة أو نجارة أو صب أخرى لنفس النطاق.');
        const formwork=manualInputQty(f,'formworkArea');
        const formworkQ=formwork===null?exactQuantity(null):exactQuantity(formwork);
        materialQtyLine(f,'formwork_rental','إيجار/توريد الشدة — فقط إذا غير مشمول بالعقد','م²',formworkQ,['إيجار شدة معدنية','شدة خشبية/معدنية','شدة خشبية موسكي'],'بند توريد/إيجار تعاقدي منفصل فقط إذا كان غير مشمول في سعر الهيكل الشامل.', ['لا يكرر مصنعية النجارة أو الشدة المضمنة في البند الشامل.'],'material','الهيكل الخرساني — اختياري حسب العقد');
      }

      if(includeFinishing){
        // Masonry: wall areas are measured inputs, so dependent quantities remain gaps until the areas are supplied.
        const halfArea=manualInputQty(f,'halfBrickArea');
        const halfQ=halfArea===null?exactQuantity(null):exactQuantity(halfArea);
        const halfBricks=halfArea===null?exactQuantity(null):rateQuantity(halfArea,'halfBrickPerM2',cfg);
        const halfCount={value:halfBricks.value===null?null:halfBricks.value/1000,low:halfBricks.low===null?null:halfBricks.low/1000,high:halfBricks.high===null?null:halfBricks.high/1000,gap:halfBricks.gap};
        materialQtyLine(f,'half_bricks','طوب أحمر لحائط نصف طوبة','ألف طوبة',halfCount,['طوب أحمر طفلي مثقب','طوب أحمر 20×10×6'],'مساحة الحائط × 55 طوبة/م² ثم التحويل إلى ألف طوبة؛ الهالك يطبق على التوريد فقط.');
        const halfSand=halfArea===null?exactQuantity(null):rateQuantity(halfArea,'halfBrickSandM3PerM2',cfg);
        addSand(f,'half_mortar_sand','رمل مونة حائط نصف طوبة',halfSand,'مساحة الحائط × 0.022 م³ رمل/م².');
        const halfCement=halfArea===null?exactQuantity(null):rateQuantity(halfArea,'halfBrickCementKgPerM2',cfg);
        addCement(f,'half_mortar_cement','أسمنت مونة حائط نصف طوبة',halfCement,'مساحة الحائط × 8 كجم أسمنت/م².');
        laborLine(f,'half_masonry_labor','مصنعية مباني — نصف طوبة','م²',halfQ,['مصنعية مباني'],'تُحسب على مساحة الحائط المقاسة.');

        const fullArea=manualInputQty(f,'fullBrickArea');
        const fullQ=fullArea===null?exactQuantity(null):exactQuantity(fullArea);
        const fullBrickCount=fullArea===null?exactQuantity(null):rateQuantity(fullArea,'fullBrickPerM2',cfg);
        const fullBricks={value:fullBrickCount.value===null?null:fullBrickCount.value/1000,low:fullBrickCount.low===null?null:fullBrickCount.low/1000,high:fullBrickCount.high===null?null:fullBrickCount.high/1000,gap:fullBrickCount.gap};
        materialQtyLine(f,'full_bricks','طوب أحمر لحائط طوبة كاملة','ألف طوبة',fullBricks,['طوب أحمر طفلي مثقب','طوب أحمر 25×12×6'],'مساحة الحائط × 110 طوبة/م² ثم التحويل إلى ألف طوبة؛ راجع مقاس الطوب قبل التوريد.');
        const fullSand=fullArea===null?exactQuantity(null):rateQuantity(fullArea,'fullBrickSandM3PerM2',cfg);
        addSand(f,'full_mortar_sand','رمل مونة حائط طوبة كاملة',fullSand,'مساحة الحائط × 0.045 م³ رمل/م².');
        const fullCement=fullArea===null?exactQuantity(null):rateQuantity(fullArea,'fullBrickCementKgPerM2',cfg);
        addCement(f,'full_mortar_cement','أسمنت مونة حائط طوبة كاملة',fullCement,'مساحة الحائط × 16 كجم أسمنت/م².');
        laborLine(f,'full_masonry_labor','مصنعية مباني — طوبة كاملة','م²',fullQ,['مصنعية مباني'],'تُحسب على مساحة الحائط المقاسة.');
        materialQtyLine(f,'masonry_water','مياه خلط مونة المباني — كمية يحددها المهندس','لتر',exactQuantity(null),['مياه خلط المونة'],'تظهر منفصلة ضمن التوريدات؛ يدخل المهندس الكمية وفق نوع المونة وظروف التنفيذ، دون افتراض معدل مياه غير معتمد.',['كمية اختيارية غير محسوبة حتى إدخالها.'],'material','توريد مياه المونة',{required:false,wasteKey:'concreteWater',wastePercent:0});

        const plasterArea=manualInputQty(f,'plasterArea');
        const plasterQ=plasterArea===null?exactQuantity(null):exactQuantity(plasterArea);
        const plasterSand=plasterArea===null?exactQuantity(null):rateQuantity(plasterArea,'plasterSandM3PerM2',cfg);
        addSand(f,'plaster_sand','رمل محارة/بياض',plasterSand,'مساحة المحارة × 0.025 م³ رمل/م²، لسمك نحو 2 سم.');
        const plasterCement=plasterArea===null?exactQuantity(null):rateQuantity(plasterArea,'plasterCementKgPerM2',cfg);
        addCement(f,'plaster_cement','أسمنت محارة/بياض',plasterCement,'المصدر مختلف على أسمنت المحارة؛ يستخدم المحرك نطاق 7.5–12 كجم/م².');
        laborLine(f,'plaster_labor','مصنعية المحارة والبياض','م²',plasterQ,['مصنعية المحارة والبياض','مصنعية محارة وبياض'],'تُحسب على مساحة المحارة المنفذة؛ السقالات الخارجية تُراجع منفصلة.');
        materialQtyLine(f,'plaster_water','مياه خلط مونة المحارة — كمية يحددها المهندس','لتر',exactQuantity(null),['مياه خلط المونة'],'كمية مستقلة للتسجيل عند الحاجة؛ يحددها المهندس وفق نوع المونة ومعدل التشغيل بالموقع.',['لا يوجد معدل استهلاك معتمد؛ لا يتم تخمين الكمية.'],'material','توريد مياه المونة',{required:false,wasteKey:'concreteWater',wastePercent:0});

        const splashArea=manualInputQty(f,'splashArea');
        const splashQ=splashArea===null?exactQuantity(null):exactQuantity(splashArea);
        const splashSand=splashArea===null?exactQuantity(null):rateQuantity(splashArea,'splashSandM3PerM2',cfg);
        addSand(f,'splash_sand','رمل طرطشة',splashSand,'مساحة الطرطشة × 0.005 م³/م².');
        const splashCement=splashArea===null?exactQuantity(null):rateQuantity(splashArea,'splashCementKgPerM2',cfg);
        addCement(f,'splash_cement','أسمنت طرطشة',splashCement,'مساحة الطرطشة × 2.25 كجم/م².');
        laborLine(f,'splash_labor','مصنعية طرطشة','م²',splashQ,['مصنعية طرطشة'],'لا يتوفر سجل مستقل للمصنعية؛ أضف سعره في لوحة الإدارة.');

        // Floor & wall tiles, buying quantity includes wastage; laying labor does not.
        const floorTileArea=manualInputQty(f,'tileArea');
        const floorTileQ=floorTileArea===null?exactQuantity(null):exactQuantity(floorTileArea);
        const floorTileBuy=floorTileArea===null?exactQuantity(null):exactQuantity(floorTileArea);
        const floorTileName=p.flooringChoice||'سيراميك أرضيات 60×60';
        materialQtyLine(f,'floor_tile_material',floorTileName,'م²',floorTileBuy,[floorTileName,'سيراميك أرضيات 60×60','سيراميك أرضيات 50×50'],'مسطح التركيب الصافي؛ نسبة هالك التوريد تطبق مرة واحدة من إعدادات المنهجية.');
        const floorTileCement=floorTileArea===null?exactQuantity(null):rateQuantity(floorTileArea,'tileCementKgPerM2',cfg);
        addCement(f,'floor_tile_cement','أسمنت مونة تركيب أرضيات',floorTileCement,'10 كجم أسمنت/م² صافي تركيب.');
        const floorTileSand=floorTileArea===null?exactQuantity(null):rateQuantity(floorTileArea,'tileSandM3PerM2',cfg);
        addSand(f,'floor_tile_sand','رمل مونة تركيب أرضيات',floorTileSand,'0.04 م³ رمل/م² صافي تركيب؛ لا يتضمن فرشة تسوية إضافية إذا لزمت.');
        laborLine(f,'floor_tile_labor','مصنعية تركيب سيراميك أرضيات','م²',floorTileQ,['مصنعية سيراميك','تركيب سيراميك'],'تُحسب على المساحة الصافية لا كمية الشراء بعد الهالك.');

        const wallTileArea=manualInputQty(f,'wallTileArea');
        const wallTileQ=wallTileArea===null?exactQuantity(null):exactQuantity(wallTileArea);
        const wallTileBuy=wallTileArea===null?exactQuantity(null):exactQuantity(wallTileArea);
        materialQtyLine(f,'wall_tile_material','سيراميك حوائط 25×50','م²',wallTileBuy,['سيراميك حوائط 25×50'],'المساحة الصافية + 5–10% هالك؛ راجع الماركة والمقاس.');
        const wallTileCement=wallTileArea===null?exactQuantity(null):rateQuantity(wallTileArea,'tileCementKgPerM2',cfg);
        addCement(f,'wall_tile_cement','أسمنت مونة تركيب سيراميك حوائط',wallTileCement,'10 كجم أسمنت/م² صافي تركيب.');
        const wallTileSand=wallTileArea===null?exactQuantity(null):rateQuantity(wallTileArea,'tileSandM3PerM2',cfg);
        addSand(f,'wall_tile_sand','رمل مونة تركيب سيراميك حوائط',wallTileSand,'0.04 م³ رمل/م² صافي تركيب.');
        const grout=floorTileArea===null&&wallTileArea===null?exactQuantity(null):(()=>{const a=(floorTileArea||0)+(wallTileArea||0),rr={low:0.2,high:0.5};return {value:a*0.35,low:a*rr.low,high:a*rr.high,gap:false};})();
        materialQtyLine(f,'tile_grout','مادة فواصل سيراميك','كجم',grout,['مادة فواصل سيراميك'],'0.2–0.5 كجم/م² مجموع الأرضيات والحوائط؛ يعتمد على حجم البلاطة والفاصل.');
        materialQtyLine(f,'floor_tile_water','مياه خلط مونة الأرضيات — كمية يحددها المهندس','لتر',exactQuantity(null),['مياه خلط المونة'],'عنصر توريد مستقل عند المحاسبة عليه؛ لا تستخدم نسبة مياه عامة بدل مواصفة المونة.',['كمية اختيارية غير محسوبة حتى إدخالها.'],'material','توريد مياه المونة',{required:false,wasteKey:'concreteWater',wastePercent:0});
        materialQtyLine(f,'wet_tile_water','مياه خلط مونة سيراميك الحوائط — كمية يحددها المهندس','لتر',exactQuantity(null),['مياه خلط المونة'],'عنصر توريد مستقل عند الحاجة؛ يحدد المهندس الكمية بحسب المونة وموقع الاستخدام.',['كمية اختيارية غير محسوبة حتى إدخالها.'],'material','توريد مياه المونة',{required:false,wasteKey:'concreteWater',wastePercent:0});

        const marbleArea=manualInputQty(f,'marbleArea');
        const marbleQ=marbleArea===null?exactQuantity(null):exactQuantity(marbleArea);
        materialQtyLine(f,'marble_material','رخام/جرانيت','م²',marbleQ,['رخام / جرانيت للسلالم','رخام/جرانيت','رخام'],'حصر يدوي حسب السلم/العتب/السطح؛ تفاصيل الدرج قد تحتاج م.ط أو عدد درجات.');
        const marbleCement=marbleArea===null?exactQuantity(null):{value:marbleArea*12.5,low:marbleArea*12.5,high:marbleArea*12.5,gap:false};
        addCement(f,'marble_cement','أسمنت مونة تركيب رخام',marbleCement,'شيكارة 50 كجم لكل 4 م² = 12.5 كجم/م².');
        const marbleSand=marbleArea===null?exactQuantity(null):{value:marbleArea*0.0625,low:marbleArea*0.0625,high:marbleArea*0.0625,gap:false};
        addSand(f,'marble_sand','رمل مونة تركيب رخام',marbleSand,'0.25 م³ رمل لكل 4 م² = 0.0625 م³/م².');
        laborLine(f,'marble_labor','مصنعية تركيب رخام','م²',marbleQ,['مصنعية رخام'],'لا يتوفر سعر مصنعية موثوق في الكتالوج بعد.');

        // Paint consumes a measured surface area. The generated area*3 default is explicitly disclosed as a planning proxy.
        const paintArea=manualInputQty(f,'paintArea');
        const paintQ=paintArea===null?exactQuantity(null):exactQuantity(paintArea);
        if(f.paintAreaAuto!==false){} // preserve this note in the resulting basis rather than changing the stored value.
        const sealer=paintArea===null?exactQuantity(null):rateQuantity(paintArea,'sealerLPerM2',cfg);
        materialQtyLine(f,'sealer','سيلر داخلي','لتر',sealer,['سيلر داخلي'],'0.08–0.12 لتر/م² سطح؛ السطح الافتراضي الأولي يساوي نحو 3× مسطح الدور ويحتاج مراجعة.');
        const putty=paintArea===null?exactQuantity(null):rateQuantity(paintArea,'puttyKgPerM2',cfg);
        materialQtyLine(f,'putty','معجون داخلي','كجم',putty,['معجون داخلي'],'0.5–1 كجم/م² سطح لثلاث سكاكين.');
        const interiorPaint=paintArea===null?exactQuantity(null):rateQuantity(paintArea,'interiorPaintLPerM2',cfg);
        materialQtyLine(f,'interior_paint','بلاستيك داخلي','لتر',interiorPaint,['بلاستيك داخلي'],'0.125–0.167 لتر/م² سطح لثلاثة أوجه.');
        laborLine(f,'paint_labor','مصنعية دهانات','م²',paintQ,['مصنعية دهانات'],'السعر بالمساحة المنفذة؛ لا يوجد سعر مقاس للمتر السطحي في الكتالوج بعد.');

        const exteriorArea=manualInputQty(f,'exteriorPaintArea');
        const exteriorQ=exteriorArea===null?exactQuantity(null):exactQuantity(exteriorArea);
        const exteriorPaint=exteriorArea===null?exactQuantity(null):rateQuantity(exteriorArea,'exteriorPaintLPerM2',cfg);
        materialQtyLine(f,'exterior_paint','بلاستيك خارجي','لتر',exteriorPaint,['بلاستيك خارجي'],'المساحة الخارجية تُدخل من الواجهة؛ لا تُستنتج من المسطح دون رسومات.');
        const exteriorPutty=exteriorArea===null?exactQuantity(null):rateQuantity(exteriorArea,'exteriorPuttyKgPerM2',cfg);
        materialQtyLine(f,'exterior_putty','معجون خارجي','كجم',exteriorPutty,['معجون خارجي'],'0.8–1.5 كجم/م² حسب خشونة الواجهة.');
        laborLine(f,'exterior_paint_labor','مصنعية دهانات خارجية','م²',exteriorQ,['مصنعية دهانات'],'لا تشمل السقالات/التجهيزات ما لم يسعر المورد ذلك صراحة.');

        const roofArea=manualInputQty(f,'waterproofArea');
        const roofQ=roofArea===null?exactQuantity(null):exactQuantity(roofArea);
        const membrane=roofArea===null?exactQuantity(null):rateQuantity(roofArea,'membraneM2PerM2',cfg);
        materialQtyLine(f,'membrane','رولات عزل مائي','م²',membrane,['رولات عزل مائي','بيتومين / رولات عزل'],'معدل الشراء يشمل التراكب المقدر؛ ألغِ الهالك الإضافي منعًا للازدواج.',[],'material','توريد خامات',{wastePercent:0});
        const bitumen=roofArea===null?exactQuantity(null):rateQuantity(roofArea,'bitumenKgPerM2',cfg);
        materialQtyLine(f,'bitumen','بيتومين لعزل وجهين','كجم',bitumen,['بيتومين للعزل'],'مستنتج من 180–200 كجم/برميل يغطي 60–70 م² لوجهين؛ يجب تأكيد نوع النظام.');
        const insulation=roofArea===null?exactQuantity(null):rateQuantity(roofArea,'thermalBoardM2PerM2',cfg);
        materialQtyLine(f,'thermal_insulation','ألواح عزل حراري','م²',insulation,['ألواح عزل حراري'],'معدل الكمية يتضمن احتياطي القص حسب المعدل؛ لا يضاف هالك ثانٍ.',['راجع معدل القص المعتمد قبل الطلب.'],'material','توريد خامات',{wastePercent:0});
        const mesh=roofArea===null?exactQuantity(null):rateQuantity(roofArea,'fiberglassMeshM2PerM2',cfg);
        materialQtyLine(f,'fiberglass_mesh','شبك فيبر جلاس','م²',mesh,['شبك فيبر جلاس'],'معدل الكمية يتضمن التراكب؛ لا يضاف هالك ثانٍ.',['راجع التراكب من مواصفة النظام.'],'material','توريد خامات',{wastePercent:0});
        laborLine(f,'waterproof_labor','مصنعية عزل مائي','م²',roofQ,['مصنعية عزل مائي'],'تعتمد على نظام العزل والطبقات والضمان.');

        const gypsumArea=manualInputQty(f,'gypsumArea');
        const gypsumQ=gypsumArea===null?exactQuantity(null):exactQuantity(gypsumArea);
        const board=gypsumArea===null?exactQuantity(null):rateQuantity(gypsumArea,'gypsumBoardM2PerM2',cfg);
        materialQtyLine(f,'gypsum_board','ألواح جبس بورد','م²',board,['ألواح جبس بورد','جبس بورد كناوف — سعر استرشادي للمتر'],'معدل الكمية يتضمن احتياطي القص؛ لا يضاف هالك ثانٍ.',['يجب مطابقة وحدة سعر اللوح مع وحدة المتر المربع.'],'material','توريد خامات',{wastePercent:0});
        const screws=gypsumArea===null?exactQuantity(null):rateQuantity(gypsumArea,'gypsumScrewsPerM2',cfg);
        materialQtyLine(f,'gypsum_screws','مسامير جبس بورد','مسمار',screws,['مسامير جبس بورد'],'25–35 مسمار/م².');
        const profiles=gypsumArea===null?exactQuantity(null):rateQuantity(gypsumArea,'gypsumProfileLmPerM2',cfg);
        materialQtyLine(f,'gypsum_profile','بروفايل معدني للجبس','متر طولي',profiles,['بروفايل معدني للجبس'],'1.2–1.5 متر طولي/م²؛ نوع القطاع والمسافات تؤثر في الاستهلاك.');
        laborLine(f,'gypsum_labor','مصنعية جبس بورد','م²',gypsumQ,['مصنعية جبس بورد'],'مصنعية تركيب فقط، منفصلة عن المواد.');

        // Opening and systems quantities are never inferred from floor area.
        const doorCount=manualInputQty(f,'interiorDoors');
        const doorQ=doorCount===null?exactQuantity(null):exactQuantity(doorCount);
        const doorName=p.pack==='luxury'?'باب خشبي داخلي فاخر':p.pack==='economic'?'باب خشبي داخلي اقتصادي':'باب خشبي داخلي متوسط';
        materialQtyLine(f,'interior_doors',doorName,'باب',doorQ,[doorName],'عدد الأبواب يُحصر من المخطط؛ لا تُستخدم أسعار أبواب ألوميتال/UPVC بديلًا للباب الداخلي دون مواصفة مطابقة.');
        const windows=manualInputQty(f,'windowArea');
        const windowQ=windows===null?exactQuantity(null):exactQuantity(windows);
        const windowName=p.pack==='luxury'?'شبابيك ألوميتال جامبو':p.pack==='economic'?'شبابيك ألوميتال السعد — اقتصادي':'شبابيك ألوميتال PS صغير';
        materialQtyLine(f,'windows',windowName,'م²',windowQ,[windowName,'شبابيك ألوميتال'],'مساحة الفتحات الصافية؛ القطاع والزجاج والشبك والإكسسوارات تحدد المواصفة.');
        const switches=manualInputQty(f,'switchSocketCount');
        materialQtyLine(f,'switches_sockets','مفاتيح وبريزات','قطعة',switches===null?exactQuantity(null):exactQuantity(switches),['مفاتيح وبريزات — متوسط','مفاتيح وبريزات — اقتصادي','مفاتيح وبريزات — فاخر'],'عدد النقاط/الوجهات من مخطط الكهرباء؛ سعر الماركة والبند غير متاح أو يحتاج مطابقة.');
        const electricalPoints=manualInputQty(f,'electricalPoints');
        laborLine(f,'electrical_labor','مصنعية كهرباء','نقطة',electricalPoints===null?exactQuantity(null):exactQuantity(electricalPoints),['مصنعية كهرباء'],'170–230 ج.م/نقطة في السجل كبديل وطني؛ تأكد من حدود التأسيس والتشطيب.');
        for(const [suffix,name,candidates] of [
          ['wire_15','كابل نحاس 1.5 مم² — السويدي',['كابل نحاس 1.5 مم² — السويدي']],
          ['wire_25','كابل نحاس 2.5 مم² — السويدي',['كابل نحاس 2.5 مم² — السويدي']],
          ['wire_4','أسلاك كهرباء 4 مم',['أسلاك كهرباء 4 مم']],
          ['wire_6','كابل تكييف 6 مم²',['كابل تكييف 6 مم²','أسلاك كهرباء 6 مم']],
          ['electric_conduit','مواسير PVC كهرباء 20 مم — السويدي',['مواسير PVC كهرباء 20 مم — السويدي']]
        ]) materialQtyLine(f,suffix,name,'متر',exactQuantity(null),candidates,'الطول يُحصر من المخطط ومسارات الدوائر؛ لا يُستنتج بأمان من المساحة أو عدد النقاط.');

        const plumbingPoints=manualInputQty(f,'plumbingPoints');
        laborLine(f,'plumbing_labor','مصنعية سباكة','نقطة',plumbingPoints===null?exactQuantity(null):exactQuantity(plumbingPoints),['مصنعية سباكة','مصنعية تأسيس سباكة — نقطة'],'لا يُخلط سعر النقطة مع سعر المقطوعية لحمام ومطبخ.');
        for(const [suffix,name,candidates] of [
          ['ppr_pipe','مواسير PPR للمياه','مواسير PPR للمياه'],
          ['pvc_pipe_2','مواسير PVC صرف 2 بوصة سمك 3 مم','مواسير PVC صرف 2 بوصة سمك 3 مم'],
          ['pvc_pipe_3','مواسير PVC صرف 3 بوصة سمك 3 مم','مواسير PVC صرف 3 بوصة سمك 3 مم'],
          ['pvc_pipe_4','مواسير PVC صرف 4 بوصة','مواسير PVC صرف 4 بوصة']
        ]) materialQtyLine(f,suffix,name,'متر',exactQuantity(null),[candidates],'أطوال المسارات والأقطار تُحصر من مخطط السباكة؛ عدد النقاط وحده لا يكفي.');

        const bathroomCount=n(f.bathrooms);
        const sanitaryName=p.pack==='economic'?'أطقم صحية — اقتصادي':p.pack==='luxury'?'أطقم صحية — فاخر':'أطقم صحية — متوسط';
        if(p.pack!=='semi') materialQtyLine(f,'sanitary_set',sanitaryName,'طقم حمام',bathroomCount===null?exactQuantity(null):exactQuantity(bathroomCount),[sanitaryName],'عدد الأطقم وفق عدد الحمامات المدخل؛ المواصفات والخلاطات والتغذية تحدد السعر.');
        if(p.kitchen){
          const kitchenArea=manualInputQty(f,'kitchenArea');
          const kitchenName=p.pack==='luxury'?'مطبخ ألوميتال كلادينج':p.pack==='medium'?'مطبخ ألوميتال دبل فايبر':'مطبخ ألوميتال سنجل فايبر';
          materialQtyLine(f,'kitchen',kitchenName,'م²',kitchenArea===null?exactQuantity(null):exactQuantity(kitchenArea),[kitchenName],'مساحة وحدات المطبخ حسب طريقة القياس التي يعتمدها المورد؛ لا تخلطها مع المتر الطولي.');
        }
        if(p.ac){
          const ac=manualInputQty(f,'acUnits');
          materialQtyLine(f,'ac_installation','تأسيس تكييف','وحدة',ac===null?exactQuantity(null):exactQuantity(ac),['تأسيس تكييف'],'عدد الوحدات ومواسير النحاس والصرف والكابلات حسب مسارات التكييف.');
        }
      }
    }

    // Project-level scope items that require measured quantities or a supplier/consultant quotation.
    const projectLines=[
      {key:'project::excavation',item:'حفر آلي ونقل ناتج الحفر — شامل الحفار والتحميل والنقل',trade:'الحفر والنقل',kind:'equipment',unit:'م³',candidates:['حفر آلي ونقل ناتج الحفر شامل النقل'],basis:'بند واحد شامل الحفار والتحميل والنقل والتخلص إلى مسافة/مقلب متفق عليهما؛ لا يضاف بند نقل آخر لنفس الناتج.'},
      {key:'project::backfill_sand',item:'توريد رمل الردم',trade:'الردم والدك',kind:'material',unit:'م³',candidates:['رمل ردم (توريد)'],basis:'صافي حجم الردم من الحصر؛ تطبق نسبة الهالك على التوريد فقط، ولا يساوي حجم الحفر تلقائيًا.'},
      {key:'project::backfill_labor',item:'مصنعية الردم والدك',trade:'الردم والدك',kind:'labor',unit:'م³',candidates:['مصنعية ردم ودك'],basis:'مصنعية الردم والدمك على صافي الحجم؛ لا تشمل توريد الرمل.'},
      {key:'project::soil_test',item:'فحص تربة',trade:'اختبارات واعتمادات',kind:'labor',unit:'مشروع',candidates:['فحص تربة'],basis:'يتحدد بنطاق الاختبارات وعدد الجسات ومعمل الاختبار.'},
      {key:'project::concrete_tests',item:'اختبارات خرسانة وحديد',trade:'اختبارات واعتمادات',kind:'labor',unit:'اختبار',candidates:['اختبارات خرسانة وحديد'],basis:'عدد الاختبارات حسب الكود وخطة الاختبار والجهة المشرفة؛ أدخل العدد المعتمد.'},
      {key:'project::design',item:'تصميم معماري وإنشائي',trade:'التكاليف غير المباشرة',kind:'labor',unit:'مشروع',candidates:['تصميم معماري وإنشائي','تصميم معماري/إنشائي'],basis:'عرض مكتب هندسي محلي مطلوب.'},
      {key:'project::permit',item:'رسوم ترخيص وإجراءات بناء',trade:'التكاليف غير المباشرة',kind:'indirect',unit:'مشروع',candidates:['رسوم ترخيص وإجراءات بناء','تراخيص البناء'],basis:'الرسوم الرسمية تعتمد على الموقع ونوع الأرض والاشتراطات؛ لا توجد قيمة معتمدة في الكتالوج.'}
    ];
    for(const s of projectLines){
      if(!includeStructure && ['project::excavation','project::backfill_sand','project::backfill_labor'].includes(s.key)) continue;
      if(p.scope!=='turnkey' && ['project::design','project::permit'].includes(s.key)) continue;
      const q = s.key==='project::soil_test'?exactQuantity(1):exactQuantity(null);
      add({key:s.key,floorKey:'project',floorLabel:'المشروع',item:s.item,trade:s.trade,kind:s.kind,unit:s.unit,quantity:q,priceCandidates:s.candidates,basis:s.basis,wasteKey:s.key==='project::backfill_sand'?'backfillSand':undefined,warnings:['يُستكمل من المخطط أو العرض/الجهة المختصة.'],required:true});
    }
    if(p.elevator){
      add({key:'project::elevator_supply',floorKey:'project',floorLabel:'المشروع',item:'توريد أسانسير 6–8 وقفات',trade:'الأسانسير',kind:'material',unit:'وحدة',quantity:exactQuantity(1),priceCandidates:['أسانسير 6–8 وقفات'],basis:'عدد مبدئي وحدة واحدة؛ السعة والحمولة والوقفات والمواصفات وعقد الصيانة تُعتمد مع المورد.'});
      add({key:'project::elevator_install',floorKey:'project',floorLabel:'المشروع',item:'مصنعية تركيب أسانسير',trade:'الأسانسير',kind:'labor',unit:'وحدة',quantity:exactQuantity(1),priceCandidates:['مصنعية تركيب أسانسير'],basis:'نفس وحدة الأسانسير؛ تحقق هل عرض المورد يشمل التركيب.'});
    }
    if(p.sewerConnection){
      add({key:'project::sewer_connection',floorKey:'project',floorLabel:'المشروع',item:'توصيل الصرف العام',trade:'التوصيلات والمرافق',kind:'labor',unit:'وصلة',quantity:exactQuantity(1),priceCandidates:['توصيل الصرف العام'],basis:'يتوقف على توفر الشبكة ورسوم الجهة وأعمال الحفر والردم.'});
    }
    if(includeFinishing){
      const totalUnits=floors.filter(f=>!f.isBasement).reduce((s,f)=>s+(Number(f.units)||Number(p.unitsPerFloor)||1),0);
      add({key:'project::electric_panel',floorKey:'project',floorLabel:'المشروع',item:'لوحة توزيع وقواطع',trade:'الكهرباء',kind:'material',unit:'وحدة',quantity:exactQuantity(totalUnits>0?totalUnits:null),priceCandidates:['لوحة Schneider 12 موضع + قواطع','لوحة توزيع وقواطع'],basis:'افتراض لوحة لكل وحدة سكنية؛ يراجع عدد الدوائر وسعة اللوحة والتصميم.'});
    }

    // Roll up the resource-order list. If any contributing floor is unmeasured, the total is marked incomplete while known quantities remain visible.
    const materials=lines.filter(l=>l.kind==='material');
    const grouped=new Map();
    for(const l of materials){
      const key=l.resourceKey;
      if(!grouped.has(key)) grouped.set(key,{key,item:l.resourceKey==='cement|طن|material'?'أسمنت — إجمالي كل البنود':l.resourceKey==='sand|م³|material'?'رمل — إجمالي كل البنود':l.resourceKey==='aggregate|م³|material'?'زلط/سن — إجمالي الخلطات':l.item,trade:l.trade,kind:l.kind,unit:l.unit,quantity:0,knownQuantity:0,quantityLow:0,quantityHigh:0,missingQuantity:false,cost:0,knownCost:0,priceMissing:false,floors:new Set(),warnings:[],sources:new Set(),items:new Set(),lineCount:0});
      const g=grouped.get(key);g.lineCount++;g.floors.add(l.floorLabel);g.items.add(l.item);
      const purchaseQuantity=l.billableQuantity??l.quantity;
      const wasteFactor=1+(Number(l.wastePercent)||0)/100;
      if(l.quantity===null||purchaseQuantity===null){g.missingQuantity=true;}else{g.knownQuantity+=purchaseQuantity;g.quantity+=purchaseQuantity;}
      if(l.quantityLow!==null)g.quantityLow+=l.quantityLow*wasteFactor;else g.missingQuantity=true;
      if(l.quantityHigh!==null)g.quantityHigh+=l.quantityHigh*wasteFactor;else g.missingQuantity=true;
      if(l.cost===null){if(purchaseQuantity!==null)g.priceMissing=true;}else{g.cost+=l.cost;g.knownCost+=l.cost;}
      if(l.unitPrice===null)g.priceMissing=true;
      if(l.priceSource)g.sources.add(l.priceSource);
      l.warnings.forEach(w=>g.warnings.push(w));
    }
    const resourceTotals=[...grouped.values()].map(g=>{const warnings=[...new Set(g.warnings)];return {key:g.key,item:g.item,trade:g.trade,kind:g.kind,unit:g.unit,quantity:g.missingQuantity?null:round(g.quantity),knownQuantity:round(g.knownQuantity),quantityLow:g.missingQuantity?null:round(g.quantityLow),quantityHigh:g.missingQuantity?null:round(g.quantityHigh),cost:g.priceMissing?null:round(g.cost,2),knownCost:round(g.knownCost,2),floors:[...g.floors],items:[...g.items],warnings,missingQuantity:g.missingQuantity,priceMissing:g.priceMissing,procurementReview:warnings.some(w=>/لا تعتمد طلبية|لا تعتمد طلب|راجع تصميم الخلطة قبل طلب|سعر وطني بديل|السعر لا يشمل النقل|شمول النقل غير معروف|السعر قديم/.test(w)),lineCount:g.lineCount,sources:[...g.sources]};});
    const priceGaps=lines.filter(l=>l.required&&l.priceGap&&l.kind!=='nonpriced');
    const quantityGaps=lines.filter(l=>l.required&&l.quantityGap&&l.kind!=='nonpriced');
    const pricedCost=lines.reduce((s,l)=>s+(l.cost||0),0);
    const supplyCost=lines.filter(l=>l.kind==='material').reduce((s,l)=>s+(l.cost||0),0);
    const laborCost=lines.filter(l=>l.kind==='labor').reduce((s,l)=>s+(l.cost||0),0);
    const equipmentCost=lines.filter(l=>l.kind==='equipment').reduce((s,l)=>s+(l.cost||0),0);
    const indirectCost=lines.filter(l=>l.kind==='indirect').reduce((s,l)=>s+(l.cost||0),0);
    const totalFloorArea=floors.reduce((s,f)=>s+(Number(f.area)||0),0);
    const pricedLines=lines.filter(l=>l.kind!=='nonpriced'&&l.quantity!==null&&l.unitPrice!==null);
    const priceCoverage=lines.filter(l=>l.required&&l.kind!=='nonpriced').length?Math.round(lines.filter(l=>l.required&&l.kind!=='nonpriced'&&l.unitPrice!==null).length/lines.filter(l=>l.required&&l.kind!=='nonpriced').length*100):0;
    const quantityCoverage=lines.filter(l=>l.required&&l.kind!=='nonpriced').length?Math.round(lines.filter(l=>l.required&&l.kind!=='nonpriced'&&!l.quantityGap).length/lines.filter(l=>l.required&&l.kind!=='nonpriced').length*100):0;
    return {lines,floors:floors.map(f=>({key:f.key,label:f.label,area:Number(f.area)||0,isBasement:!!f.isBasement})),resourceTotals,priceGaps,quantityGaps,rateConflicts,pricedCost:round(pricedCost,2),supplyCost:round(supplyCost,2),laborCost:round(laborCost,2),equipmentCost:round(equipmentCost,2),indirectCost:round(indirectCost,2),totalFloorArea:round(totalFloorArea,2),priceCoverage,quantityCoverage,pricedLineCount:pricedLines.length,sourceRates:'Pasted markdown.md — معدلات مواد البناء في الإنشاءات السكنية في مصر',notes:['معدلات استرشادية من الملف المقدم وليست حصرًا معتمدًا.','لا تُجمع قائمة الموارد التفصيلية مرة ثانية مع جدول BOQ الرئيسي.','عند الخرسانة الجاهزة، لا تُضاف مكونات الأسمنت والرمل والزلط إلى الطلبية.']};
  }

  function getRateDefinitions(){return RATE_DEFINITIONS.map(x=>({...x}));}
  function validateRateSettings(saved){
    const errors=[];
    for(const d of RATE_DEFINITIONS){const v=saved&&saved[d.key];if(!v)continue;const lo=n(v.low),hi=n(v.high);if(lo===null||hi===null||lo<0||hi<0)errors.push(`${d.label}: القيم يجب أن تكون أرقامًا غير سالبة.`);else if(lo>hi)errors.push(`${d.label}: أقل معدل أكبر من أعلى معدل.`);}
    return errors;
  }
  return {RATE_DEFINITIONS,getRateDefinitions,buildMaterialTakeoff,lookupPrice,convertPriceValue,validateRateSettings};
});
