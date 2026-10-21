/* MIYAR service-model BOQ engine. Deterministic, local-only, no LLM. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MIYAR_PROJECT_MODELS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const BOQ_METHODOLOGY = typeof require === 'function' ? require('./miyar-boq-methodology.js') : null;

  const MODEL_DEFINITIONS = [
    { code:'APT-BRICK', name:'شقة مستلمة على الطوب', type:'apartment', scope:'finishing', includes:['plaster','plumbing','electrical','flooring','wetTiles','paint','doors','windows','sanitary','kitchen','gypsum','cleaning'], excludes:['earthworks','foundations','structure','facade','elevator','publicNetworks'], description:'يحسب بنود التشطيب من حالة الطوب حتى التسليم، مع فصل المواد عن المصنعيات وإظهار معدلات المساحة كمؤشرات أولية.' },
    { code:'APT-PLASTER', name:'شقة مستلمة على المحارة', type:'apartment', scope:'finishing', includes:['plumbing','electrical','flooring','wetTiles','paint','doors','windows','sanitary','kitchen','gypsum','cleaning'], excludes:['plaster','earthworks','foundations','structure'], description:'يستبعد المحارة ومكوناتها، ويحسب باقي نطاق التشطيب المحدد.' },
    { code:'APT-PLASTER-MEP', name:'شقة محارة + تمديدات مكتملة', type:'apartment', scope:'finishing', includes:['flooring','wetTiles','paint','doors','windows','sanitary','kitchen','gypsum','cleaning'], excludes:['plaster','plumbing','electrical','earthworks','foundations','structure'], description:'يستبعد المحارة والسباكة والكهرباء ونقاطها؛ يستمر حصر التشطيب النهائي.' },
    { code:'APT-PAINT', name:'شقة جاهزة للدهان', type:'apartment', scope:'finishing', includes:['paint','cleaning'], excludes:['plaster','plumbing','electrical','flooring','wetTiles','doors','windows','sanitary','kitchen','earthworks','foundations','structure'], description:'يحسب المعجون والسيلر والدهان والتنظيف فقط، ولا يفترض أعمالًا تم تنفيذها من غير تأكيد.' },
    { code:'APT-PARTIAL', name:'شقة تشطيب جزئي / استكمال الناقص', type:'apartment', scope:'finishing', includes:['plaster','plumbing','electrical','flooring','wetTiles','paint','doors','windows','sanitary','kitchen','gypsum','cleaning'], excludes:['earthworks','foundations','structure'], description:'يحسب الأعمال غير المنفذة التي لم يحددها المستخدم كأعمال مكتملة.' },
    { code:'BLD-NEW-RES', name:'عمارة سكنية من الصفر', type:'building', use:'residential', includes:['earthworks','foundations','structure','masonry','plaster','mep','finishing','common','roof','facade'], description:'مراحل عمارة سكنية من الأرض الخام حتى التشطيب، بمعدلات تخطيطية قابلة للتعديل.' },
    { code:'BLD-NEW-COM', name:'عمارة تجارية من الصفر', type:'building', use:'commercial', includes:['earthworks','foundations','structure','masonry','plaster','commercialMep','commercialFinishing','common','roof','facade','fire'], description:'يضيف متطلبات تجارية كمراجعة ومناطق واجهات/تكييف/حريق؛ البنود التي تحتاج مخططات تظل كميات ناقصة.' },
    { code:'BLD-NEW-MIX', name:'عمارة مختلطة سكني + تجاري', type:'building', use:'mixed', includes:['earthworks','foundations','structure','masonry','plaster','mixedFinishing','common','roof','facade'], description:'يفصل وظيفة كل دور إلى سكني أو تجاري، ولا يخلط نسب التشطيب بينهما.' },
    { code:'BLD-STRUCTURE', name:'عمارة هيكل / خرسانة ومباني فقط', type:'building', scope:'structure', includes:['earthworks','foundations','structure','masonry'], description:'يقتصر على الحفر والأساسات والهيكل والمباني؛ المحارة الأساسية اختيار إضافي.' },
    { code:'BLD-FINISH', name:'تشطيب عمارة قائمة', type:'building', scope:'finishing', includes:['unitFinishing','common','roof','facade','publicNetworks','elevator'], description:'يبدأ من حالة استلام الوحدات ولا يعيد تسعير الهيكل القائم.' }
  ];

  // Rates are transcribed from the user-provided model specification, not claimed as code-approved norms.
  const RATE_DEFINITIONS = [
    {key:'steelKgPerM2',label:'حديد الهيكل لكل م² مسطح',section:'الهيكل الخرساني',unit:'كجم/م² مسطح',value:80,low:60,high:100,note:'نطاق عام فقط؛ لا يحل محل حصر الحديد من اللوحات. يتعارض مع مرجع طن/80م² داخل الملف.'},
    {key:'concreteM3PerM2',label:'خرسانة الهيكل لكل م² مسطح',section:'الهيكل الخرساني',unit:'م³/م² مسطح',value:0.35,low:0.30,high:0.40,note:'معدل عام للأدوار فوق الأرض؛ لا يشمل حصرًا منفصلًا موثوقًا للأساسات أو البدروم.'},
    {key:'basementSteelKgPerM2',label:'حديد البدروم لكل م² بصمة',section:'البدروم',unit:'كجم/م² بصمة',value:75,low:60,high:90,note:'تقدير مستقل للبدروم؛ يجب مراجعة اللبشة والقواعد والحوائط من اللوحات.'},
    {key:'basementConcreteM3PerM2',label:'خرسانة البدروم لكل م² بصمة',section:'البدروم',unit:'م³/م² بصمة',value:0.55,low:0.45,high:0.70,note:'تقدير مستقل؛ لا يشمل تلقائيًا تصميم النزح والعزل أو يغني عن حصر العناصر.'},
    {key:'commonAreaPercent',label:'نسبة المشتركات الافتراضية',section:'الأعمال المشتركة',unit:'% من مسطح الدور',value:10,low:10,high:12,note:'افتراض افتراضي معلّم كتقدير؛ يجب استبداله بالقياس الفعلي عندما يتوفر.'},
    {key:'rcCementKgPerM3',label:'أسمنت خلطة الخرسانة المسلحة',section:'خلطة الخرسانة',unit:'كجم/م³ خرسانة',value:350,note:'7 شكاير/م³ حسب الملف؛ تعتمد الخلطة الفعلية من تصميم معتمد.'},
    {key:'rcSandM3PerM3',label:'رمل خلطة الخرسانة',section:'خلطة الخرسانة',unit:'م³/م³ خرسانة',value:0.40,note:'معدل حجمي للمراجعة المبدئية فقط.'},
    {key:'rcAggregateM3PerM3',label:'زلط/سن خلطة الخرسانة',section:'خلطة الخرسانة',unit:'م³/م³ خرسانة',value:0.80,note:'معدل حجمي للمراجعة المبدئية فقط.'},
    {key:'rcWaterLPerM3',label:'ماء خلطة الخرسانة',section:'خلطة الخرسانة',unit:'لتر/م³ خرسانة',value:175,note:'يتغير حسب تصميم الخلطة ورطوبة الركام.'},
    {key:'bindingWireKgPerTonne',label:'سلك ربط لكل طن حديد',section:'الهيكل الخرساني',unit:'كجم/طن حديد',value:10,low:8,high:12,note:'نطاق مؤقت موحّد 8–12 كجم/طن؛ راجع مواصفة التنفيذ واستهلاك المقاول.'},
    {key:'tileCementKgPerM2',label:'أسمنت مونة تركيب البلاط',section:'الأرضيات',unit:'كجم/م² بلاط',value:10,note:'المعدل المرفق يساوي شيكارة 50 كجم لكل 5 م²؛ لا يشمل فرشة تسوية إضافية.'},
    {key:'tileSandM3PerM2',label:'رمل مونة تركيب البلاط',section:'الأرضيات',unit:'م³/م² بلاط',value:0.04,note:'معدل مرفق؛ تضاف فرشة تسوية عند الحاجة حسب التنفيذ.'},
    {key:'exteriorPlasterCementKgPerM2',label:'أسمنت البياض الخارجي',section:'الواجهات',unit:'كجم/م² سطح',value:10,low:7.5,high:12,note:'نطاق استرشادي؛ يعتمد السمك ونظام التنفيذ على المواصفات.'},
    {key:'exteriorPlasterSandM3PerM2',label:'رمل البياض الخارجي',section:'الواجهات',unit:'م³/م² سطح',value:0.025,note:'نطاق سمك مرجعي نحو 2 سم؛ الواجهة الفعلية تُقاس.'},
    {key:'excavationM3PerM2',label:'الحفر الاسترشادي',section:'الأعمال الترابية',unit:'م³/م² بصمة',value:0.12,note:'عامل اقتراحي بالمصدر؛ الحفر الحقيقي من المناسيب وأبعاد الحفر.'},
    {key:'backfillM3PerM2',label:'الردم الاسترشادي',section:'الأعمال الترابية',unit:'م³/م² بصمة',value:0.06,note:'لا يفترض أن يساوي ناتج الحفر؛ يحتاج حصرًا.'},
    {key:'replacementGravelM3PerM2',label:'إحلال زلط استرشادي',section:'الأعمال الترابية',unit:'م³/م² بصمة',value:0.10,note:'عامل اقتراحي من الملف ويحتاج مراجعة تقرير التربة.'},
    {key:'foundationConcreteM3PerM2',label:'خرسانة أساسات',section:'الأساسات',unit:'م³/م² بصمة',value:0.08,note:'معدل تخطيطي من الملف وليس بديلاً عن اللوحات.'},
    {key:'foundationSteelKgPerM2',label:'حديد أساسات',section:'الأساسات',unit:'كجم/م² بصمة',value:8,note:'معدل تخطيطي من الملف وليس تفريدًا للحديد.'},
    {key:'raftConcreteM3PerM2',label:'خرسانة لبشة — معامل المصدر',section:'الأساسات',unit:'م³/م² بصمة',value:0.03,note:'القيمة الواردة في الملف محل شك هندسي؛ لا يستخدمها المحرك تلقائيًا عند اختيار اللبشة.'},
    {key:'brickPiecesPerM2Built',label:'طوب لكل م² مبني',section:'المباني',unit:'طوبة/م² مبني',value:25,note:'تقدير إجمالي أولي فقط. القياس حسب الحوائط والفتحات أكثر موثوقية.'},
    {key:'plasterM2PerM2Built',label:'محارة داخلية',section:'المباني والبياض',unit:'م² محارة/م² مبني',value:2.20,note:'استرشادي من ملف النماذج؛ استبدله بمسطح الحوائط الفعلي عند توفره.'},
    {key:'plasterCementKgPerM2Surface',label:'أسمنت المحارة لكل م² سطح',section:'المحارة',unit:'كجم/م² سطح',value:9.75,low:7.5,high:12,note:'مصدر معدلات الموارد: نطاق يجمع قيمًا متعارضة؛ تحقق قبل طلبية الأسمنت.'},
    {key:'plasterSandM3PerM2Surface',label:'رمل المحارة لكل م² سطح',section:'المحارة',unit:'م³/م² سطح',value:0.025,low:0.02,high:0.03,note:'معدل مرجعي لسمك نحو 2 سم؛ راجع سمك المواصفات.'},
    {key:'exteriorPlasterM2PerM2Built',label:'محارة/واجهة خارجية',section:'الواجهات',unit:'م²/م² مبني',value:0.55,note:'عامل ابتدائي؛ الأفضل إدخال مساحة الواجهة المقاسة بكل دور.'},
    {key:'puttyKgPerM2Apartment',label:'معجون لكل م² سطح دهان',section:'الدهانات',unit:'كجم/م² سطح',value:0.75,note:'موحد مع معدل السطح في سجل الموارد؛ الافتراضي 0.5–1 كجم/م² سطح لثلاث سكاكين.'},
    {key:'sealerLPerM2Apartment',label:'سيلر لكل م² سطح دهان',section:'الدهانات',unit:'لتر/م² سطح',value:0.10,note:'موحد مع معدل السطح؛ 0.08–0.12 لتر/م² سطح.'},
    {key:'paintLPerM2Apartment',label:'بلاستيك داخلي لكل م² سطح دهان',section:'الدهانات',unit:'لتر/م² سطح',value:0.146,low:0.125,high:0.20,note:'المعدل المركزي 0.146 = منتصف نطاق 0.125–0.167 لثلاثة أوجه؛ الحد 0.20 محفوظ بسبب تعارض المصدر ويُعرض كنطاق.'},
    {key:'floorTileM2PerM2Apartment',label:'أرضيات لكل م² شقة',section:'الأرضيات',unit:'م²/م² شقة',value:0.75,note:'معامل مساحة صافي مبدئي؛ يتغير مع الفراغات.'},
    {key:'wetTileM2PerM2Apartment',label:'سيراميك المناطق الرطبة لكل م² شقة',section:'الأرضيات',unit:'م²/م² شقة',value:0.45,note:'معدل مبدئي ضعيف دون أبعاد الحمامات والمطبخ وارتفاع التكسية.'},
    {key:'plumbingM2PerM2Apartment',label:'أساس خامات السباكة',section:'السباكة',unit:'م²/م² شقة',value:1,note:'معامل كمية فقط؛ يفضل لاحقًا استبداله بحصر أقطار ومسارات ونقاط.'},
    {key:'electricalM2PerM2Apartment',label:'أساس خامات الكهرباء',section:'الكهرباء',unit:'م²/م² شقة',value:1,note:'معامل كمية فقط وليس حصر دوائر أو كابلات.'},
    {key:'electricalPointsPerM2Apartment',label:'نقاط كهرباء',section:'الكهرباء',unit:'نقطة/م² شقة',value:0.80,note:'مؤشر أولي؛ عدد النقاط والتغذية من التصميم الكهربائي.'},
    {key:'waterPointsPerM2Apartment',label:'نقاط مياه',section:'السباكة',unit:'نقطة/م² شقة',value:0.30,note:'مؤشر أولي؛ مراجعة الحمامات والمطبخ.'},
    {key:'drainPointsPerM2Apartment',label:'نقاط صرف',section:'الصرف',unit:'نقطة/م² شقة',value:0.25,note:'مؤشر أولي؛ يراجع مع مخطط الصرف.'},
    {key:'gypsumM2PerM2Apartment',label:'جبس بورد اختياري',section:'الجبس',unit:'م²/م² شقة',value:0.30,note:'اختياري ويحتاج مساحة سقف فعلية.'},
    {key:'doorAreaPer35M2',label:'عدد الأبواب لكل مساحة',section:'النجارة',unit:'م²/باب',value:35,note:'عدد الأبواب = تقريب لأعلى مساحة الشقة/المعدل؛ ليس جدول أبواب معماريًا.'},
    {key:'kitchenLmPerM2Apartment',label:'مطبخ لكل م² شقة',section:'المطبخ',unit:'م طولي/م² شقة',value:0.15,note:'معدل ملف النماذج، يحتاج تأكيد؛ يسمح بإدخال الطول الفعلي.'},
    {key:'windowM2PerM2Apartment',label:'شبابيك لكل م² شقة',section:'الألوميتال',unit:'م²/م² شقة',value:0.12,note:'معدل استرشادي ضعيف؛ الأفضل إدخال جدول الفتحات.'},
    {key:'stairM2PerM2Built',label:'السلالم',section:'الأعمال المشتركة',unit:'م²/م² مبني',value:0.06,note:'معامل مصدر تقديري؛ ليس حصرًا هندسيًا.'},
    {key:'roofWaterproofM2PerM2',label:'عزل السطح',section:'العزل',unit:'م²/م² سطح',value:1,note:'عادةً مساحة السطح × معامل التراكب المحدد لنظام العزل.'},
    {key:'commercialConcreteFactor',label:'معامل خرسانة تجارية',section:'تجاري',unit:'معامل',value:1.05,note:'معامل مقترح من التقرير، وليس معايرًا؛ يطبّق كافتراض قابل للتعديل.'},
    {key:'commercialSteelFactor',label:'معامل حديد تجاري',section:'تجاري',unit:'معامل',value:1.10,note:'معامل مقترح من التقرير، لا يستبدل التصميم الإنشائي.'},
    {key:'commercialElectricalFactor',label:'معامل كهرباء تجاري',section:'تجاري',unit:'معامل',value:1.30,note:'معامل مقترح فقط؛ تحدد الأحمال حسب النشاط.'},
    {key:'commercialFacadeFactor',label:'معامل واجهات تجارية (مرجع غير مطبق)',section:'تجاري',unit:'معامل',value:1.40,note:'مرجع فقط وغير مطبق تلقائيًا؛ يلزم قياس واجهات المحلات من الرسومات.'},
    {key:'commercialPlumbingFactor',label:'معامل سباكة تجاري (مرجع غير مطبق)',section:'تجاري',unit:'معامل',value:1.10,note:'مرجع فقط وغير مطبق تلقائيًا؛ عدد الحمامات والنشاط ومخطط السباكة يحكم الحصر.'}
  ];
  const RATE_REGISTRY = root?.MIYAR_RATES || (typeof require === 'function' ? require('./miyar-rates.js') : null);
  const MODEL_RATE_ALIASES = {
    plasterM2PerM2Built: 'plasterSurfaceM2PerM2Built',
    puttyKgPerM2Apartment: 'puttyKgPerM2Surface',
    sealerLPerM2Apartment: 'sealerLPerM2Surface',
    paintLPerM2Apartment: 'interiorPaintLPerM2Surface',
    floorTileM2PerM2Apartment: 'floorTileM2PerM2Apartment',
    wetTileM2PerM2Apartment: 'wetTileM2PerM2Apartment',
    tileCementKgPerM2: 'floorTileCementKgPerM2',
    tileSandM3PerM2: 'floorTileSandM3PerM2'
  };
  for (const d of RATE_DEFINITIONS) {
    const shared = RATE_REGISTRY?.defaults?.[d.key] || RATE_REGISTRY?.defaults?.[MODEL_RATE_ALIASES[d.key]];
    if (shared) { d.value=shared.value; d.low=shared.low; d.high=shared.high; d.note=shared.basis || d.note; }
  }
  const RATE_MAP = Object.fromEntries(RATE_DEFINITIONS.map(x => [x.key, x]));
  const MODEL_MAP = Object.fromEntries(MODEL_DEFINITIONS.map(x => [x.code, x]));
  const norm = s => String(s ?? '').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/ـ/g,'').toLowerCase().replace(/[^\p{L}\p{N}.]+/gu,' ').trim().replace(/\s+/g,' ');
  const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  const fmtNum = v => v === null ? 'غير محدد' : Number(v.toFixed(3)).toString();
  const moneyRound = v => v === null || !Number.isFinite(v) ? null : Number(v.toFixed(2));

  function rateValue(settings, key) {
    const d = RATE_MAP[key]; if (!d) return {value:0,low:0,high:0,definition:null};
    const saved = settings?.modelRates?.[key];
    if (saved && typeof saved === 'object') {
      const candidate = num(saved.value) ?? num(saved.default) ?? d.value;
      const low = num(saved.low) ?? (d.low !== undefined ? d.low : candidate);
      const high = num(saved.high) ?? (d.high !== undefined ? d.high : candidate);
      const lo = Math.min(low,high), hi = Math.max(low,high);
      const value = Math.min(hi,Math.max(lo,candidate));
      return {value,low:lo,high:hi,definition:d};
    }
    const value = num(saved) ?? d.value;
    return {value,low:d.low !== undefined ? d.low : value,high:d.high !== undefined ? d.high : value,definition:d};
  }
  function quantity(base, rate, lowRate, highRate) {
    if (base === null || !Number.isFinite(base)) return {quantity:null,low:null,high:null};
    return {quantity:base*rate,low:base*lowRate,high:base*highRate};
  }
  function scaleQ(q, rate, lowRate=rate, highRate=rate) {
    if (!q || q.quantity===null || q.quantity===undefined) return {quantity:null,low:null,high:null};
    const lowBase=q.low===null||q.low===undefined?q.quantity:q.low;
    const highBase=q.high===null||q.high===undefined?q.quantity:q.high;
    return {quantity:q.quantity*rate,low:lowBase*lowRate,high:highBase*highRate};
  }
  function numericOverride(overrides, code, q) {
    const v = num(overrides?.[code]);
    return v === null || v < 0 ? q : {quantity:v,low:v,high:v,overridden:true};
  }
  function labelForFloor(f) { return f.label || f.key || 'الدور غير محدد'; }
  function quotePrice(db, candidates, unit, settings, basis='average') {
    const lookup = root.MIYAR_TAKEOFF?.lookupPrice;
    if (lookup) {
      const found = lookup(db, candidates, unit, settings);
      const picked = basis === 'low' ? found.priceLow : basis === 'high' ? found.priceHigh : found.unitPrice;
      return {...found, unitPrice:picked === undefined ? null : picked, priceLow:found.priceLow ?? null, priceHigh:found.priceHigh ?? null};
    }
    const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean).map(norm);
    const row = (db || []).find(x => list.includes(norm(x.name)) && x.status !== 'missing' && x.avg !== '' && x.avg != null && Number.isFinite(Number(x.avg)) && Number(x.avg) > 0);
    if (!row) return {unitPrice:null,priceLow:null,priceHigh:null,priceStatus:'missing',priceSource:'',priceDate:'',transport:'unknown',stale:false};
    const unitOk = norm(row.unit) === norm(unit);
    if (!unitOk) return {unitPrice:null,priceLow:null,priceHigh:null,priceStatus:'missing',priceSource:row.source||'',priceDate:row.date||'',transport:row.transport||'unknown',unitMismatch:true,stale:false};
    return {unitPrice:basis==='low' ? Number(row.low ?? row.avg) : basis==='high' ? Number(row.high ?? row.avg) : Number(row.avg),priceLow:Number(row.low ?? row.avg),priceHigh:Number(row.high ?? row.avg),priceStatus:row.status||'missing',priceSource:row.source||'',priceDate:row.date||'',priceName:row.name,transport:row.transport||'unknown',stale:false};
  }
  function buildEstimate(project={}, prices=[], settings={}, overrides={}) {
    const p = {modelCode:'APT-BRICK',package:'medium',marginMode:'comprehensive',quoteBasis:'average',apartmentArea:null,apartmentCount:1,roomsPerApartment:3,bathrooms:2,kitchen:false,kitchenLm:null,ac:false,gypsum:false,sanitary:true,concreteMethod:'site_mix',concreteGrade:'C25',steelName:'حديد استثماري',foundationSystem:'isolated',soil:'normal',basement:false,groundwater:false,includeBasicPlaster:false,completed:{},floors:[],...project};
    const requestedModelCode = p.modelCode;
    const model = MODEL_MAP[p.modelCode] || MODEL_MAP['APT-BRICK'];
    const lines = [];
    const notes = [];
    if (!MODEL_MAP[requestedModelCode]) notes.push(`رمز النموذج غير معروف (${String(requestedModelCode)}). تم إيقاف الاعتماد؛ راجع اختيار نموذج الخدمة.`);
    const rates = key => rateValue(settings,key);
    const unitAliases = {
      cement:['أسمنت رمادي عام','أسمنت بني سويف','أسمنت السويس'], sand:['رمل عادي/حرش','رمل عادي / حرش','رمل عادي','رمل ناعم'], aggregate:['زلط عادي','سن'], steel:['حديد استثماري','حديد عز'],
    };
    const add = spec => {
      const q0 = spec.quantity && typeof spec.quantity === 'object' ? spec.quantity : {quantity:num(spec.quantity),low:num(spec.quantity),high:num(spec.quantity)};
      const q = numericOverride(overrides,spec.code,q0);
      const price = spec.priceCandidates?.length ? quotePrice(prices,spec.priceCandidates,spec.unit,settings,p.quoteBasis) : {unitPrice:null,priceLow:null,priceHigh:null,priceStatus:'missing',priceSource:'',priceDate:'',transport:'unknown',stale:false};
      const quantity = num(q.quantity), qLow = num(q.low), qHigh = num(q.high), unitPrice = num(price.unitPrice);
      const priced = unitPrice !== null && price.priceStatus !== 'missing' && unitPrice > 0;
      const priceGap = spec.priceRequired !== false && spec.kind !== 'note' && !priced;
      const quantityGap = spec.quantityRequired !== false && spec.kind !== 'note' && quantity === null;
      const waste = BOQ_METHODOLOGY ? BOQ_METHODOLOGY.getWastePercent(settings, spec) : Number(spec.wastePercent || 0);
      const billableQty = quantity === null ? null : quantity*(1+waste/100);
      const billableLow = qLow === null ? null : qLow*(1+waste/100);
      const billableHigh = qHigh === null ? null : qHigh*(1+waste/100);
      const cost = billableQty !== null && priced ? billableQty*unitPrice : null;
      const costLow = billableLow !== null && price.priceLow !== null && price.priceLow !== undefined ? billableLow*Number(price.priceLow) : null;
      const costHigh = billableHigh !== null && price.priceHigh !== null && price.priceHigh !== undefined ? billableHigh*Number(price.priceHigh) : null;
      const warnings = [...(spec.warnings||[])];
      if (price.unitMismatch) warnings.push(`وحدة السعر في الكتالوج (${price.catalogUnit || 'غير محددة'}) لا توافق وحدة البند (${spec.unit})؛ لم يتم تحويلها تلقائيًا.`);
      if (priced && price.priceStatus === 'national') warnings.push('السعر بديل وطني وليس عرضًا محليًا مؤكدًا للأقصر.');
      if (priced && price.transport !== 'yes' && price.transport !== 'not-applicable') warnings.push(price.transport === 'no' ? 'السعر لا يشمل النقل.' : 'شمول النقل غير معروف.');
      if (price.stale) warnings.push('السعر قديم أو تاريخ الصلاحية يحتاج مراجعة.');
      if (spec.quantityBasis && quantity !== null && !q.overridden) warnings.push(`المعدل مصدره: ${spec.quantityBasis}.`);
      const row = {
        code:spec.code, floorKey:spec.floorKey || 'project', floorLabel:spec.floorLabel || 'المشروع', division:spec.division || 'غير مصنف', item:spec.item,
        kind:spec.kind || 'material', unit:spec.unit, quantity:quantity===null?null:quantity, quantityLow:qLow, quantityHigh:qHigh,
        billableQuantity:billableQty, wastePercent:waste, wasteKey:spec.wasteKey || (BOQ_METHODOLOGY ? BOQ_METHODOLOGY.wasteKeyFor(spec) : null), unitPrice:priced?unitPrice:null, priceLow:price.priceLow ?? null, priceHigh:price.priceHigh ?? null,
        cost:cost===null?null:moneyRound(cost), costLow:costLow===null?null:moneyRound(costLow), costHigh:costHigh===null?null:moneyRound(costHigh), priceStatus:priced?price.priceStatus:'missing', priceSource:price.priceSource||'', priceDate:price.priceDate||'', priceName:price.priceName||null, transport:price.transport||'unknown', stale:!!price.stale,
        basis:spec.basis||'', quantityBasis:spec.quantityBasis||'', warnings:[...new Set(warnings)], priceGap, quantityGap, required:spec.required!==false, resourceKey:spec.resourceKey||`${norm(spec.item)}|${norm(spec.unit)}|${spec.kind||'material'}`,
      };
      lines.push(row); return row;
    };
    const addNote = (code,item,division,basis,warnings=[],floorKey='project',floorLabel='المشروع') => add({code,item,division,kind:'note',unit:'—',quantity:null,quantityRequired:false,priceRequired:false,required:false,basis,warnings,floorKey,floorLabel});
    const sourceWarning = 'معدل ابتدائي من مواصفة النماذج المقدمة؛ ليس جدول كميات تصميميًا. راجع الرسومات والمعايرة قبل طلب المواد.';
    const addMaterialAndLabor = (base) => {
      if (base.material !== false) add({code:`${base.code}-MAT`,floorKey:base.floorKey,floorLabel:base.floorLabel,item:base.item,division:base.division,kind:'material',unit:base.unit,quantity:base.quantity,priceCandidates:base.materialCandidates||[base.item],basis:base.basis,quantityBasis:base.quantityBasis,...(base.wastePercent==null?{}:{wastePercent:base.wastePercent}),wasteKey:base.wasteKey,warnings:base.warnings||[],resourceKey:base.resourceKey});
      if (base.labor) add({code:`${base.code}-LAB`,floorKey:base.floorKey,floorLabel:base.floorLabel,item:base.laborItem||`مصنعية ${base.item}`,division:base.division,kind:'labor',unit:base.laborUnit||base.unit,quantity:base.laborQuantity||base.quantity,priceCandidates:base.laborCandidates||[base.laborItem||`مصنعية ${base.item}`],basis:base.laborBasis||`مصنعية منفصلة عن توريد ${base.item}.`,quantityBasis:base.quantityBasis,warnings:base.laborWarnings||base.warnings||[],resourceKey:`${norm(base.laborItem||`مصنعية ${base.item}`)}|${norm(base.laborUnit||base.unit)}|labor`});
    };
    function calcLine(code, item, division, kind, unit, base, rateKey, priceCandidates, basis, opts={}) {
      const r = rateKey ? rates(rateKey) : {value:1,low:1,high:1};
      const q = opts.fixed ? {quantity:base,low:base,high:base} : quantity(base,r.value,r.low,r.high);
      return {code,item,division,kind,unit,quantity:q,priceCandidates,basis,quantityBasis:opts.quantityBasis||(rateKey?`${r.definition?.label || rateKey}: ${r.value}`:''),wastePercent:opts.wastePercent||0,warnings:opts.warnings||[],required:opts.required,resourceKey:opts.resourceKey};
    }
    function addConcreteSupply(floor, volume, codePrefix, warnings=[]) {
      if (p.concreteMethod === 'site_mix') {
        add({code:`${codePrefix}-CONCRETE-REF`,floorKey:floor.key,floorLabel:floor.label,item:'حجم الخرسانة — مرجع غير مسعّر',division:'الهيكل الخرساني',kind:'note',unit:'م³',quantity:volume,quantityRequired:true,priceRequired:false,required:false,basis:'الحجم مرجع لتفكيك الخلطة ولا يضاف للتكلفة بجانب مكوناتها.',warnings:[...warnings,'مكونات الخلطة لا تعتمد للطلب قبل مراجعة تصميم الخلطة ومقاومة الخرسانة.']});
        const cementRate=rates('rcCementKgPerM3'); const cement = {quantity:volume.quantity===null?null:volume.quantity*cementRate.value,low:volume.low===null?null:volume.low*cementRate.value,high:volume.high===null?null:volume.high*cementRate.value};
        add({code:`${codePrefix}-CEMENT`,floorKey:floor.key,floorLabel:floor.label,item:'أسمنت خلط الخرسانة المسلحة',division:'الهيكل الخرساني',kind:'material',unit:'طن',quantity:{quantity:cement.quantity===null?null:cement.quantity/1000,low:cement.low===null?null:cement.low/1000,high:cement.high===null?null:cement.high/1000},priceCandidates:unitAliases.cement,basis:'حجم الخرسانة × 350 كجم/م³ وفق معدل الخلطة المرفق؛ كل طن = 20 شيكارة 50 كجم.',quantityBasis:'خلطة استرشادية',warnings:[...warnings,'راجع تصميم الخلطة المعتمد قبل طلب الأسمنت.'],resourceKey:'cement|طن|material',wasteKey:'concreteCement'});
        const sandRate=rates('rcSandM3PerM3'); const sand = {quantity:volume.quantity===null?null:volume.quantity*sandRate.value,low:volume.low===null?null:volume.low*sandRate.value,high:volume.high===null?null:volume.high*sandRate.value};
        add({code:`${codePrefix}-SAND`,floorKey:floor.key,floorLabel:floor.label,item:'رمل خلطة الخرسانة المسلحة',division:'الهيكل الخرساني',kind:'material',unit:'م³',quantity:sand,priceCandidates:unitAliases.sand,basis:'حجم الخرسانة × 0.40 م³ رمل لكل م³ خرسانة وفق المعدل المرفق.',warnings:[...warnings,'راجع تصميم الخلطة قبل الطلب.'],resourceKey:'sand|م³|material',wasteKey:'concreteSand'});
        const aggRate=rates('rcAggregateM3PerM3'); const agg = {quantity:volume.quantity===null?null:volume.quantity*aggRate.value,low:volume.low===null?null:volume.low*aggRate.value,high:volume.high===null?null:volume.high*aggRate.value};
        add({code:`${codePrefix}-AGG`,floorKey:floor.key,floorLabel:floor.label,item:'زلط/سن خلطة الخرسانة المسلحة',division:'الهيكل الخرساني',kind:'material',unit:'م³',quantity:agg,priceCandidates:unitAliases.aggregate,basis:'حجم الخرسانة × 0.80 م³ ركام لكل م³ خرسانة وفق المعدل المرفق.',warnings:[...warnings,'راجع تصميم الخلطة قبل الطلب.'],resourceKey:'aggregate|م³|material',wasteKey:'concreteAggregate'});
        const waterRate=rates('rcWaterLPerM3'); const water = {quantity:volume.quantity===null?null:volume.quantity*waterRate.value,low:volume.low===null?null:volume.low*waterRate.value,high:volume.high===null?null:volume.high*waterRate.value};
        add({code:`${codePrefix}-WATER`,floorKey:floor.key,floorLabel:floor.label,item:'مياه خلط الخرسانة — توريد/استهلاك',division:'الهيكل الخرساني',kind:'material',unit:'لتر',quantity:water,priceCandidates:['مياه خلط الخرسانة'],priceRequired:false,required:false,wasteKey:'concreteWater',basis:`حجم الخرسانة × ${waterRate.value} لتر/م³ كمرجع معدل؛ راجع تصميم الخلطة ومصدر المياه.`,warnings:[...warnings,'سعر المياه غير مفترض؛ يمكن إدخاله من لوحة الإدارة إذا كانت تحاسب كبند مستقل.']});
      } else {
        add({code:`${codePrefix}-READY`,floorKey:floor.key,floorLabel:floor.label,item:`خرسانة جاهزة ${p.concreteGrade||'C25'}`,division:'الهيكل الخرساني',kind:'material',unit:'م³',quantity:volume,priceCandidates:[`خرسانة جاهزة ${p.concreteGrade||'C25'}`,`خرسانة ${p.concreteGrade||'C25'}`],basis:'سعر توريد الخرسانة الجاهزة فقط؛ تحقق مما إذا كان يشمل المضخة والانتقال.',warnings:[...warnings,'لا تُضاف مكونات الأسمنت والرمل والزلط إلى طلبية الخرسانة الجاهزة منعًا للازدواج.'],resourceKey:'ready-concrete|m3|material'});
      }
      add({code:`${codePrefix}-COMBINED-LAB`,floorKey:floor.key,floorLabel:floor.label,item:'مصنعية الهيكل الخرساني — حدادة ونجارة وشدة وصب',division:'الهيكل الخرساني',kind:'labor',unit:'م³',quantity:volume,priceCandidates:['مصنعية الهيكل الخرساني شاملة الحدادة والنجارة والصب والشدة'],basis:'بند مصنعية واحد لكل م³ خرسانة؛ يشمل ربط الحديد والنجارة/الشدة وتنفيذ الصب طبقًا لمنهجية المهندس. لا يضاف فوقه بند مصنعية حدادة أو نجارة أو صب منفصل لنفس الأعمال.',warnings:[...warnings,'راجع العقد قبل اعتماد السعر: إيجار/توريد ألواح الشدة ومضخة الخرسانة قد يكونان بندين تعاقديين مستقلين فقط إذا لم يكونا مشمولين.']});
    }
    function addSteel(floor, qTonnes, code, warnings=[]) {
      add({code,floorKey:floor.key,floorLabel:floor.label,item:p.steelName||'حديد تسليح',division:'الهيكل الخرساني',kind:'material',unit:'طن',quantity:qTonnes,priceCandidates:[p.steelName||'حديد استثماري','حديد استثماري'],basis:'معدل تخطيطي على المسطح؛ لا يمثل تفريد أسياخ من اللوحات.',quantityBasis:'معدل التسليح العام',warnings:[...warnings,'مراجعة هندسية مطلوبة قبل الشراء.'],resourceKey:'reinforcement-steel|ton|material',wasteKey:'concreteSteel'});
      const wireRate=rates('bindingWireKgPerTonne');
      const wireKg=scaleQ(qTonnes,wireRate.value,wireRate.low,wireRate.high);
      add({code:`${code}-WIRE`,floorKey:floor.key,floorLabel:floor.label,item:'سلك ربط الحديد',division:'الهيكل الخرساني',kind:'material',unit:'كجم',quantity:wireKg,priceCandidates:['سلك ربط حديد'],basis:`كمية الحديد بالطن × ${wireRate.value} كجم/طن؛ النطاق ${wireRate.low}–${wireRate.high} كجم/طن.`,warnings:['معدل مؤقت موحّد بعد احتمال خطأ الوحدة بالمصدر؛ راجعه مع مهندس التنفيذ والمورد.'],resourceKey:'binding-wire|كجم|material',wasteKey:'bindingWire'});
    }
    function addMasonry(floor, codePrefix, totalArea, factorAllowed=true) {
      const half = num(floor.halfBrickArea), full = num(floor.fullBrickArea);
      if (half !== null || full !== null) {
        if (half !== null) {
          add({code:`${codePrefix}-HALF-BRICK`,floorKey:floor.key,floorLabel:floor.label,item:'طوب أحمر لحائط نصف طوبة',division:'المباني',kind:'material',unit:'ألف طوبة',quantity:quantity(half,0.055,0.055,0.055),priceCandidates:['طوب أحمر طفلي مثقب','طوب أحمر 20×10×6'],basis:'مساحة الحائط × 55 طوبة/م² ÷ 1000؛ الكمية بوحدة ألف طوبة.',warnings:[sourceWarning],wasteKey:'masonryBrick'});
          add({code:`${codePrefix}-HALF-SAND`,floorKey:floor.key,floorLabel:floor.label,item:'رمل مونة حائط نصف طوبة',division:'المباني',kind:'material',unit:'م³',quantity:quantity(half,0.022,0.022,0.022),priceCandidates:unitAliases.sand,basis:'مساحة الحائط × 0.022 م³/م² وفق المعدل المرفق.',warnings:[sourceWarning],resourceKey:'sand|م³|material',wasteKey:'masonrySand'});
          add({code:`${codePrefix}-HALF-CEMENT`,floorKey:floor.key,floorLabel:floor.label,item:'أسمنت مونة حائط نصف طوبة',division:'المباني',kind:'material',unit:'طن',quantity:quantity(half,0.008,0.008,0.008),priceCandidates:unitAliases.cement,basis:'مساحة الحائط × 8 كجم/م²؛ تحويل إلى طن.',warnings:[sourceWarning,'راجع التعارض بين معدل الأسمنت ومعدل المونة العام.'],resourceKey:'cement|طن|material',wasteKey:'masonryCement'});
          add({code:`${codePrefix}-HALF-LAB`,floorKey:floor.key,floorLabel:floor.label,item:'مصنعية مباني نصف طوبة',division:'مصنعيات المباني',kind:'labor',unit:'م²',quantity:{quantity:half,low:half,high:half},priceCandidates:['مصنعية مباني'],basis:'مساحة الحائط المقاسة.'});
        } else add({code:`${codePrefix}-HALF-BRICK`,floorKey:floor.key,floorLabel:floor.label,item:'حوائط نصف طوبة — مساحة مطلوبة',division:'المباني',kind:'material',unit:'م² حائط',quantity:{quantity:null,low:null,high:null},priceRequired:false,basis:'لم تُدخل مساحة حائط نصف طوبة؛ هذه ليست صفرًا.',warnings:['فجوة حصر.']});
        if (full !== null) {
          add({code:`${codePrefix}-FULL-BRICK`,floorKey:floor.key,floorLabel:floor.label,item:'طوب أحمر لحائط طوبة كاملة',division:'المباني',kind:'material',unit:'ألف طوبة',quantity:quantity(full,0.11,0.11,0.11),priceCandidates:['طوب أحمر طفلي مثقب','طوب أحمر 25×12×6'],basis:'مساحة الحائط × 110 طوبة/م² ÷ 1000؛ الكمية بوحدة ألف طوبة.',warnings:[sourceWarning],wasteKey:'masonryBrick'});
          add({code:`${codePrefix}-FULL-SAND`,floorKey:floor.key,floorLabel:floor.label,item:'رمل مونة حائط طوبة كاملة',division:'المباني',kind:'material',unit:'م³',quantity:quantity(full,0.045,0.045,0.045),priceCandidates:unitAliases.sand,basis:'مساحة الحائط × 0.045 م³/م² وفق المعدل المرفق.',warnings:[sourceWarning],resourceKey:'sand|م³|material',wasteKey:'masonrySand'});
          add({code:`${codePrefix}-FULL-CEMENT`,floorKey:floor.key,floorLabel:floor.label,item:'أسمنت مونة حائط طوبة كاملة',division:'المباني',kind:'material',unit:'طن',quantity:quantity(full,0.016,0.016,0.016),priceCandidates:unitAliases.cement,basis:'مساحة الحائط × 16 كجم/م²؛ تحويل إلى طن.',warnings:[sourceWarning,'راجع التعارض بين معدل الأسمنت ومعدل المونة العام.'],resourceKey:'cement|طن|material',wasteKey:'masonryCement'});
          add({code:`${codePrefix}-FULL-LAB`,floorKey:floor.key,floorLabel:floor.label,item:'مصنعية مباني طوبة كاملة',division:'مصنعيات المباني',kind:'labor',unit:'م²',quantity:{quantity:full,low:full,high:full},priceCandidates:['مصنعية مباني'],basis:'مساحة الحائط المقاسة.'});
        } else add({code:`${codePrefix}-FULL-BRICK`,floorKey:floor.key,floorLabel:floor.label,item:'حوائط طوبة كاملة — مساحة مطلوبة',division:'المباني',kind:'material',unit:'م² حائط',quantity:{quantity:null,low:null,high:null},priceRequired:false,basis:'لم تُدخل مساحة حائط طوبة كاملة؛ هذه ليست صفرًا.',warnings:['فجوة حصر.']});
      } else if (factorAllowed) {
        const brickEstimateQ=quantity(totalArea,rates('brickPiecesPerM2Built').value,rates('brickPiecesPerM2Built').low,rates('brickPiecesPerM2Built').high);
        const brickPurchaseQ=scaleQ(brickEstimateQ,0.001,0.001,0.001);
        add({code:`${codePrefix}-BRICK-EST`,floorKey:floor.key,floorLabel:floor.label,item:'طوب/بلوك — تقدير إجمالي مبني',division:'المباني',kind:'material',unit:'ألف طوبة',quantity:brickPurchaseQ,priceCandidates:['طوب أحمر طفلي مثقب','طوب أحمر 20×10×6'],basis:'إجمالي مسطح الدور × معدل الطوب/م² ÷ 1000؛ الكمية بوحدة ألف طوبة. لا يحدد النوع أو السمك أو الفتحات.',quantityBasis:'معدل إجمالي تخطيطي',warnings:[sourceWarning,'تقدير الطوب الإجمالي لا يحدد سمك الحائط أو الفتحات؛ لا تعتمد طلبية تنفيذية قبل الحصر.'],wasteKey:'masonryBrick'});
        // The attached source includes 200 kg cement + 0.67 m³ sand per 1,000 solid bricks; explicitly flagged as a rough derivative.
        add({code:`${codePrefix}-BRICK-MORTAR-CEMENT`,floorKey:floor.key,floorLabel:floor.label,item:'أسمنت مونة المباني — تقدير من عدد الطوب',division:'المباني',kind:'material',unit:'طن',quantity:scaleQ(brickEstimateQ,0.0002),priceCandidates:unitAliases.cement,basis:'0.20 كجم أسمنت/طوبة (200 كجم لكل 1,000 طوبة) حسب المصدر المرفق؛ تحويل إلى طن.',warnings:[sourceWarning,'المصدر يذكر الطوب المصمت؛ قد لا ينطبق على الطوب الأحمر المثقب أو أنواع بلوك أخرى.'],resourceKey:'cement|طن|material',wasteKey:'masonryCement'});
        add({code:`${codePrefix}-BRICK-MORTAR-SAND`,floorKey:floor.key,floorLabel:floor.label,item:'رمل مونة المباني — تقدير من عدد الطوب',division:'المباني',kind:'material',unit:'م³',quantity:scaleQ(brickEstimateQ,0.00067),priceCandidates:unitAliases.sand,basis:'0.67 م³ رمل لكل 1,000 طوبة حسب المصدر المرفق؛ يتأثر بنوع الطوب والمونة.',warnings:[sourceWarning,'المصدر يذكر الطوب المصمت؛ يلزم اعتماد المعدل للمادة المستخدمة.'],resourceKey:'sand|م³|material',wasteKey:'masonrySand'});
      } else {
        add({code:`${codePrefix}-BRICK-GAP`,floorKey:floor.key,floorLabel:floor.label,item:'طوب/بلوك — مساحة الحوائط مطلوبة',division:'المباني',kind:'material',unit:'طوبة',quantity:{quantity:null,low:null,high:null},priceCandidates:['طوب أحمر طفلي مثقب'],basis:'حصر الحوائط من اللوحات مطلوب.',warnings:['لا يمكن استنتاج نوع الحائط أو عدد الفتحات من مساحة الدور وحدها.']});
      }
      if (half !== null || full !== null || (factorAllowed && totalArea !== null)) {
        add({code:`${codePrefix}-MASONRY-WATER`,floorKey:floor.key,floorLabel:floor.label,item:'مياه خلط مونة المباني — كمية يحددها المهندس',division:'مباني الطوب والمونة',kind:'material',unit:'لتر',quantity:{quantity:null,low:null,high:null},priceCandidates:['مياه خلط المونة'],quantityRequired:true,priceRequired:false,required:false,wasteKey:'concreteWater',basis:'لا يوجد معدل استهلاك معتمد في ملف المشروع؛ يدخل المهندس كمية المياه بعد اعتماد نوع المونة وطريقة التنفيذ. لا تُحتسب تلقائيًا ولا يُفترض سعرها.',warnings:['فجوة كمية مقصودة؛ لا تستخدم معامل مياه الخرسانة بديلًا لمونة المباني.']});
      }
    }
    function apartmentLines(opts) {
      const area = num(opts.area), count = Math.max(0,Number(opts.count)||0), floorKey=opts.floorKey||'units', floorLabel=opts.floorLabel||`الوحدات (${count})`;
      if (count <= 0) { add({code:`${floorKey}-APT-AREA`,floorKey,floorLabel,item:'مساحة الشقة / عدد الوحدات',division:'بيانات المشروع',kind:'note',unit:'م²',quantity:{quantity:null,low:null,high:null},priceRequired:false,basis:'أدخل عدد الوحدات الموجب.',warnings:['عدد الوحدات ناقص.']});return; }
      if (area === null) add({code:`${floorKey}-APT-AREA`,floorKey,floorLabel,item:'صافي مساحة الوحدات بعد خصم المشتركات',division:'بيانات المشروع',kind:'note',unit:'م²',quantity:{quantity:null,low:null,high:null},priceRequired:false,basis:'أدخل مساحة المشتركات/السلالم المقاسة في صف الدور حتى لا يحسب النظام مساحة الدور الإجمالية على أنها مساحة شقق صافية.',warnings:['فجوة مساحة: تشطيبات الوحدات التي تعتمد على المساحة تبقى غير محسوبة إلى حين قياس صافي المساحة.']});
      const gross = area === null ? null : area*count;
      const includes = new Set(opts.includes);
      const isPartial = p.modelCode==='APT-PARTIAL' || p.modelCode==='BLD-FINISH';
      const completed = p.completed||{};
      const completedFor = k => isPartial && !!completed[k];
      const skip = k => !includes.has(k) || completedFor(k);
      const mk = (suffix,item,division,kind,unit,q,rateKey,candidates,basis,warnings=[],extra={}) => add({code:`${floorKey}-${suffix}`,floorKey,floorLabel,item,division,kind,unit,quantity:q,priceCandidates:candidates,basis,quantityBasis:rateKey?`${rateKey}`:'',warnings:[...warnings,...(isPartial?['بنود النموذج الجزئي تستبعد ما تم تحديده كمنفذ.']:[])],...extra});
      if (!skip('plaster')) {
        const plasterArea = quantity(gross,rates('plasterM2PerM2Built').value,rates('plasterM2PerM2Built').low,rates('plasterM2PerM2Built').high);
        mk('PLASTER','محارة داخلية','المحارة والبياض','labor','م²',plasterArea,null,['مصنعية محارة','محارة وبياض'],`مساحة الوحدات × ${rates('plasterM2PerM2Built').value}؛ الافتراضي قابل للمراجعة.`,[sourceWarning]);
        const plasterCement = scaleQ(plasterArea, rates('plasterCementKgPerM2Surface').value/1000, rates('plasterCementKgPerM2Surface').low/1000, rates('plasterCementKgPerM2Surface').high/1000);
        const plasterSand = scaleQ(plasterArea, rates('plasterSandM3PerM2Surface').value, rates('plasterSandM3PerM2Surface').low, rates('plasterSandM3PerM2Surface').high);
        mk('PLASTER-CEMENT','أسمنت المحارة','المحارة والبياض','material','طن',plasterCement,'plasterCementKgPerM2Surface',unitAliases.cement,`مساحة سطح المحارة × ${rates('plasterCementKgPerM2Surface').value} كجم/م² ÷ 1000 = طن؛ نطاق المصدر محفوظ.`,[sourceWarning,'موحد على طن لدمجه في إجمالي طلبية الأسمنت؛ يساوي 20 شيكارة × 50 كجم لكل طن.'],{resourceKey:'cement|طن|material',wasteKey:'plasterCement'});
        mk('PLASTER-SAND','رمل المحارة','المحارة والبياض','material','م³',plasterSand,'plasterSandM3PerM2Surface',unitAliases.sand,`مساحة سطح المحارة × ${rates('plasterSandM3PerM2Surface').value} م³/م² سطح.`,[sourceWarning,'لا تجمع مع بند مونة آخر يغطي نفس المحارة.'],{resourceKey:'sand|م³|material',wasteKey:'plasterSand'});
        mk('PLASTER-WATER','مياه خلط مونة المحارة — كمية يحددها المهندس','المحارة والبياض','material','لتر',{quantity:null,low:null,high:null},null,['مياه خلط المونة'],'كمية المياه تتبع نوع المونة ومعدل التشغيل بالموقع؛ لا توجد نسبة معتمدة في الملف الحالي.', ['فجوة كمية مقصودة؛ أدخلها من لوحة حصر الكميات بعد مراجعة الخلطة.'],{required:false,quantityRequired:true,priceRequired:false,wasteKey:'concreteWater'});
      }
      if (!skip('plumbing')) {
        mk('PLUMB-MAT','خامات سباكة — مؤشر مساحي','السباكة','material','م²',quantity(gross,rates('plumbingM2PerM2Apartment').value,rates('plumbingM2PerM2Apartment').low,rates('plumbingM2PerM2Apartment').high),'plumbingM2PerM2Apartment',['خامات سباكة للمتر','خامات سباكة للمتر المربع'],`مساحة الوحدات × معامل السباكة ${rates('plumbingM2PerM2Apartment').value}.`,['ليس حصر مواسير وأقطار؛ استخدم مخطط السباكة للطلب التنفيذي.']);
        const plumbingPointQ = quantity(gross,rates('waterPointsPerM2Apartment').value,rates('waterPointsPerM2Apartment').low,rates('waterPointsPerM2Apartment').high);
        const drainPointQ = quantity(gross,rates('drainPointsPerM2Apartment').value,rates('drainPointsPerM2Apartment').low,rates('drainPointsPerM2Apartment').high);
        mk('WATER-POINTS','نقاط مياه — حصر مبدئي','السباكة','labor','نقطة',plumbingPointQ,'waterPointsPerM2Apartment',['مصنعية سباكة نقطة','مصنعية سباكة'],`مساحة الوحدات × ${rates('waterPointsPerM2Apartment').value} نقطة/م².`,['معدل تقريبي؛ راجع نقاط التصميم.']);
        mk('DRAIN-POINTS','نقاط صرف — حصر مبدئي','الصرف','labor','نقطة',drainPointQ,'drainPointsPerM2Apartment',['مصنعية سباكة نقطة','مصنعية سباكة'],`مساحة الوحدات × ${rates('drainPointsPerM2Apartment').value} نقطة/م².`,['معدل تقريبي؛ راجع نقاط التصميم.']);
      }
      if (!skip('electrical')) {
        mk('ELEC-MAT','خامات كهرباء — مؤشر مساحي','الكهرباء','material','م²',quantity(gross,rates('electricalM2PerM2Apartment').value,rates('electricalM2PerM2Apartment').low,rates('electricalM2PerM2Apartment').high),'electricalM2PerM2Apartment',['خامات كهرباء للمتر','خامات كهرباء للمتر المربع'],`مساحة الوحدات × معامل الكهرباء ${rates('electricalM2PerM2Apartment').value}.`,['ليس جدول كابلات ودوائر؛ لا يمكن تحويل تكلفة شقة كاملة إلى سعر متر مربع دون وحدة مطابقة.']);
        mk('ELEC-POINTS','نقاط كهرباء — حصر مبدئي','الكهرباء','labor','نقطة',quantity(gross,rates('electricalPointsPerM2Apartment').value,rates('electricalPointsPerM2Apartment').low,rates('electricalPointsPerM2Apartment').high),'electricalPointsPerM2Apartment',['مصنعية كهرباء — نقطة تأسيس + تشطيب','مصنعية كهرباء'],`مساحة الوحدات × ${rates('electricalPointsPerM2Apartment').value} نقطة/م².`,['معدل تقريبي؛ حصر النقاط التنفيذي من المخطط.']);
      }
      if (!skip('flooring')) {
        const q=quantity(gross,rates('floorTileM2PerM2Apartment').value,rates('floorTileM2PerM2Apartment').low,rates('floorTileM2PerM2Apartment').high);
        mk('FLOOR-TILE','سيراميك/بورسلين أرضيات','التشطيبات','material','م²',q,'floorTileM2PerM2Apartment',p.package==='luxury'?['بورسلين','سيراميك أرضيات 60×60']:['سيراميك أرضيات 60×60','سيراميك فرز أول'],`مساحة الوحدات × ${rates('floorTileM2PerM2Apartment').value} قبل إضافة الهالك.`,[sourceWarning],{wasteKey:'tile'});
        mk('FLOOR-TILE-LAB','مصنعية تركيب سيراميك أرضيات','مصنعيات التشطيبات','labor','م²',q,null,['تركيب سيراميك'],'تتبع مساحة البلاط المركب؛ لا تشمل توريد البلاط.',[sourceWarning]);
        mk('FLOOR-TILE-CEMENT','أسمنت مونة تركيب الأرضيات','الأرضيات','material','طن',scaleQ(q,rates('tileCementKgPerM2').value/1000,rates('tileCementKgPerM2').low/1000,rates('tileCementKgPerM2').high/1000),null,unitAliases.cement,'مساحة البلاط × 10 كجم أسمنت/م² حسب ملف المعدلات؛ يتحول إلى طن.',[sourceWarning,'لا يشمل فرشة تسوية إضافية عند الحاجة.'],{resourceKey:'cement|طن|material',wasteKey:'mortarCement'});
        mk('FLOOR-TILE-SAND','رمل مونة تركيب الأرضيات','الأرضيات','material','م³',scaleQ(q,rates('tileSandM3PerM2').value,rates('tileSandM3PerM2').low,rates('tileSandM3PerM2').high),null,unitAliases.sand,'مساحة البلاط × 0.04 م³ رمل/م² حسب الملف المرفق.',[sourceWarning],{resourceKey:'sand|م³|material',wasteKey:'mortarSand'});
        mk('FLOOR-TILE-WATER','مياه خلط مونة الأرضيات — كمية يحددها المهندس','سيراميك الأرضيات','material','لتر',{quantity:null,low:null,high:null},null,['مياه خلط المونة'],'تُحدد من وصفة المونة واستهلاك الموقع؛ لا يوجد معدل مؤكد.', ['فجوة كمية مقصودة؛ لا تؤثر في الإجمالي حتى اعتماد الكمية والسعر.'],{required:false,quantityRequired:true,priceRequired:false,wasteKey:'concreteWater'});
      }
      if (!skip('wetTiles')) {
        const q=quantity(gross,rates('wetTileM2PerM2Apartment').value,rates('wetTileM2PerM2Apartment').low,rates('wetTileM2PerM2Apartment').high);
        mk('WET-TILE','سيراميك حمامات ومطبخ','التشطيبات','material','م²',q,'wetTileM2PerM2Apartment',['سيراميك حوائط 25×50','سيراميك فرز أول'],`مساحة الوحدات × ${rates('wetTileM2PerM2Apartment').value}؛ ارتفاع التكسية ومساحات المطبخ والحمام غير محصورة.`,[sourceWarning],{wasteKey:'tile'});
        mk('WET-TILE-LAB','مصنعية تركيب سيراميك مناطق رطبة','مصنعيات التشطيبات','labor','م²',q,null,['تركيب سيراميك'],'على المساحة المقدرة، تراجع بعد قياس الحمامات والمطبخ.');
        mk('WET-TILE-CEMENT','أسمنت مونة السيراميك للمناطق الرطبة','الأرضيات','material','طن',scaleQ(q,rates('tileCementKgPerM2').value/1000,rates('tileCementKgPerM2').low/1000,rates('tileCementKgPerM2').high/1000),null,unitAliases.cement,'مساحة البلاط الرطب × معدل أسمنت المونة؛ يراجع نظام التركيب.',[sourceWarning],{resourceKey:'cement|طن|material',wasteKey:'mortarCement'});
        mk('WET-TILE-SAND','رمل مونة السيراميك للمناطق الرطبة','الأرضيات','material','م³',scaleQ(q,rates('tileSandM3PerM2').value,rates('tileSandM3PerM2').low,rates('tileSandM3PerM2').high),null,unitAliases.sand,'مساحة البلاط الرطب × معدل رمل المونة.',[sourceWarning],{resourceKey:'sand|م³|material',wasteKey:'mortarSand'});
        mk('WET-TILE-WATER','مياه خلط مونة السيراميك — كمية يحددها المهندس','سيراميك الحمامات والمطبخ','material','لتر',{quantity:null,low:null,high:null},null,['مياه خلط المونة'],'تُحدد من وصفة المونة واستهلاك الموقع؛ لا يوجد معدل مؤكد.', ['فجوة كمية مقصودة؛ لا تؤثر في الإجمالي حتى اعتماد الكمية والسعر.'],{required:false,quantityRequired:true,priceRequired:false,wasteKey:'concreteWater'});
      }
      if (!skip('paint')) {
        const paintSurface = quantity(gross,rates('plasterM2PerM2Built').value,rates('plasterM2PerM2Built').low,rates('plasterM2PerM2Built').high);
        const putty = scaleQ(paintSurface,rates('puttyKgPerM2Apartment').value,rates('puttyKgPerM2Apartment').low,rates('puttyKgPerM2Apartment').high);
        const sealer = scaleQ(paintSurface,rates('sealerLPerM2Apartment').value,rates('sealerLPerM2Apartment').low,rates('sealerLPerM2Apartment').high);
        const paint = scaleQ(paintSurface,rates('paintLPerM2Apartment').value,rates('paintLPerM2Apartment').low,rates('paintLPerM2Apartment').high);
        mk('PUTTY','معجون داخلي','الدهانات','material','كجم',putty,'puttyKgPerM2Apartment',['معجون داخلي','معجون'],`مساحة أسطح الدهان التقديرية × ${rates('puttyKgPerM2Apartment').value} كجم/م² سطح؛ السطح = المسطح × ${rates('plasterM2PerM2Built').value}.`,[sourceWarning],{wasteKey:'paintPutty'});
        mk('SEALER','سيلر','الدهانات','material','لتر',sealer,'sealerLPerM2Apartment',['سيلر','سعر السيلر'],`مساحة أسطح الدهان التقديرية × ${rates('sealerLPerM2Apartment').value} لتر/م² سطح.`,[sourceWarning],{wasteKey:'paintSealer'});
        mk('PAINT','بلاستيك داخلي','الدهانات','material','لتر',paint,'paintLPerM2Apartment',['دهانات بلاستيك داخلي','دهانات','بلاستيك داخلي'],`مساحة أسطح الدهان التقديرية × ${rates('paintLPerM2Apartment').value} لتر/م² سطح؛ معدل المصدر يحفظ نطاق 0.125–0.20 لتر/م².`,[sourceWarning],{wasteKey:'paintFinish'});
        const paintLaborArea=quantity(gross,rates('plasterM2PerM2Built').value,rates('plasterM2PerM2Built').low,rates('plasterM2PerM2Built').high);
        mk('PAINT-LAB','مصنعية معجون ودهان','مصنعيات التشطيبات','labor','م²',paintLaborArea,null,['مصنعية دهانات'],'مساحة السطح تقديرية باستخدام معامل المحارة؛ حصر السطح الحقيقي أدق.',[sourceWarning]);
      }
      if (!skip('doors')) {
        const roomsPerUnit = Math.max(0,Number(p.roomsPerApartment)||0);
        const bathroomsPerUnit = Math.max(0,Number(p.bathrooms)||0);
        const doorsPerUnit = Math.ceil(roomsPerUnit + bathroomsPerUnit + (p.kitchen ? 1 : 0));
        const qty = doorsPerUnit>0 ? {quantity:doorsPerUnit*count,low:doorsPerUnit*count,high:doorsPerUnit*count} : {quantity:null,low:null,high:null};
        mk('DOORS','أبواب داخلية — بدون باب المدخل','النجارة','material','باب',qty,null,['باب خشب داخلي','أبواب خشب','باب داخلي'],`عدد داخلي مبدئي = ${roomsPerUnit} غرف + ${bathroomsPerUnit} حمامات + ${p.kitchen?1:0} باب مطبخ لكل وحدة × ${count} وحدات.`,['استبعد باب الشقة الخارجي عمدًا حتى يضاف من جدول الأبواب المنفصل.','اعتمد العدد والمقاسات من الجدول المعماري قبل الطلب.']);
        mk('DOORS-LAB','مصنعية تركيب الأبواب الداخلية','الأبواب والنجارة','labor','باب',qty,null,['مصنعية تركيب باب داخلي'],'نفس عدد الأبواب؛ يشمل التركيب فقط ولا يكرر توريد الباب.',['أدخل سعر المصنعية المنفصل بعد تحديد نوع الحلق والمفصلات والإكسسوارات.']);
      }
      if (!skip('windows')) {
        const q=quantity(gross,rates('windowM2PerM2Apartment').value,rates('windowM2PerM2Apartment').low,rates('windowM2PerM2Apartment').high);
        mk('WINDOWS','شبابيك ألوميتال/PVC — تقدير','الألوميتال','material','م²',q,null,['شبابيك ألوميتال PS صغير','شبابيك ألوميتال السعد (اقتصادي)'],`مساحة الوحدات × ${rates('windowM2PerM2Apartment').value}؛ جدول الفتحات الفعلي مطلوب.`,['معدل مساحي ضعيف؛ لا تستخدمه كطلبية تصنيع.']);
        mk('WINDOWS-LAB','مصنعية تركيب الشبابيك','الشبابيك والألوميتال','labor','م²',q,null,['مصنعية تركيب شبابيك ألوميتال بالمتر المربع'],'على مساحة الفتحات المقاسة؛ المصنعية منفصلة عن توريد قطاع الألوميتال والزجاج.',['لا يستخدم سعر بالقطعة بدل المتر المربع.']);
      }
      if (!skip('gypsum') && p.gypsum) {
        const q=quantity(gross,rates('gypsumM2PerM2Apartment').value,rates('gypsumM2PerM2Apartment').low,rates('gypsumM2PerM2Apartment').high);
        mk('GYPSUM','جبس بورد — سقف مستعار','الجبس','material','م²',q,null,['جبس بورد كناوف','جبس بورد'],`مساحة الوحدات × ${rates('gypsumM2PerM2Apartment').value}.`,['اختيار اختياري؛ راجع المساحة ونوع النظام والبروفايلات.']);
        mk('GYPSUM-LAB','مصنعية تركيب جبس بورد','مصنعيات التشطيبات','labor','م²',q,null,['مصنعية جبس','مصنعية تركيب جبس بورد'],'مساحة سقف تقديرية.');
      }
      if (!skip('sanitary') && p.sanitary) {
        const baths=Math.max(0,Number(p.bathrooms)||0)*count;
        const setName=`أطقم صحية — ${p.package==='economic'?'اقتصادي':p.package==='luxury'?'فاخر':'متوسط'}`;
        mk('SANITARY','أطقم صحية وخلاطات', 'الأدوات الصحية','material','طقم حمام',{quantity:baths,low:baths,high:baths},null,[setName,'خلاط اقتصادي محلي'],`عدد الحمامات لكل وحدة × عدد الوحدات (${p.bathrooms} × ${count}).`,['اعتمد محتوى الطقم ومواصفاته قبل مقارنة الأسعار.']);
        mk('SANITARY-LAB','مصنعية تركيب الأطقم الصحية','الأدوات الصحية','labor','طقم حمام',{quantity:baths,low:baths,high:baths},null,['مصنعية تركيب طقم حمام'],'نفس عدد الأطقم؛ لا يشمل توريد الطقم ولا تأسيس المواسير إذا كانا بندين مستقلين.');
      }
      if (!skip('kitchen') && p.kitchen) {
        const explicit = num(p.kitchenLm);
        const q = explicit!==null ? {quantity:explicit*count,low:explicit*count,high:explicit*count} : quantity(gross,rates('kitchenLmPerM2Apartment').value,rates('kitchenLmPerM2Apartment').low,rates('kitchenLmPerM2Apartment').high);
        const item=p.package==='luxury'?'مطبخ ألوميتال كلادينج':p.package==='medium'?'مطبخ ألوميتال دبل فايبر':'مطبخ ألوميتال سنجل فايبر';
        mk('KITCHEN',item,'المطبخ','material','م طولي',q,null,[item],explicit!==null?`طول المطبخ الفعلي المدخل × عدد الوحدات، لكن سجل السعر في الكتالوج قد يكون بالمتر المربع.`:`مساحة الوحدات × ${rates('kitchenLmPerM2Apartment').value} متر طولي/م² وفق معدل النماذج.`,['تحقق من وحدة المورد: المتر الطولي لا يساوي المتر المربع. أدخل قياس المورد النهائي.']);
        mk('KITCHEN-LAB','مصنعية تركيب وحدات المطبخ','المطبخ','labor','م طولي',q,null,['مصنعية تركيب مطبخ بالمتر الطولي'],'على الطول النهائي المعتمد؛ توريد الوحدات منفصل.',['يلزم تأكيد أن عرض المصنعية بالمتر الطولي.']);
      }
      if (p.ac && !(isPartial && completedFor('ac'))) add({code:`${floorKey}-AC`,floorKey,floorLabel,item:'تأسيس تكييف — عدد وحدات',division:'التكييف',kind:'material',unit:'وحدة',quantity:{quantity:num(opts.acUnits)===null?null:num(opts.acUnits)*count,low:num(opts.acUnits)===null?null:num(opts.acUnits)*count,high:num(opts.acUnits)===null?null:num(opts.acUnits)*count},priceCandidates:['تأسيس تكييف'],basis:'عدد وحدات التكييف يجب إدخاله لكل وحدة/دور؛ أطوال النحاس والكابل والصرف تحتاج حصرًا منفصلًا.',warnings:['خيار المستخدم فقط؛ يجب حصر أطوال المسارات.']});
      if (!skip('cleaning')) mk('CLEANING','تنظيف وتسليم','التسليم','labor','وحدة',{quantity:count,low:count,high:count},null,['تنظيف وتسليم','مصنعية تنظيف وتسليم'],`عدد الوحدات (${count})؛ السعر يحتاج عرضًا أو إدخالًا.`,['بند تسليم لا يمثل مواد فقط.']);
    }

    const isApartment = model.type==='apartment';
    if (isApartment) {
      const includeSet = new Set(model.includes);
      const area = num(p.apartmentArea);
      if (area === null || area <= 0) notes.push('أدخل مساحة الشقة الموجبة.');
      if (model.code === 'APT-PARTIAL') {
        for (const [key,label] of Object.entries({plaster:'المحارة',plumbing:'السباكة',electrical:'الكهرباء',flooring:'الأرضيات',wetTiles:'سيراميك المناطق الرطبة',paint:'الدهانات',doors:'الأبواب',windows:'الشبابيك',sanitary:'الأطقم الصحية',kitchen:'المطبخ',gypsum:'الجبس'})) {
          if (p.completed?.[key]) notes.push(`استبعاد ${label}: محدد كمنفذ بالفعل.`);
        }
      }
      apartmentLines({area,count:p.apartmentCount,floorKey:'apartment',floorLabel:`الشقة / ${p.apartmentCount} وحدة`,includes:[...includeSet]});
      if (p.modelCode==='APT-BRICK' || p.modelCode==='APT-PLASTER' || p.modelCode==='APT-PLASTER-MEP' || p.modelCode==='APT-PAINT' || p.modelCode==='APT-PARTIAL') {
        add({code:'APT-OVERVIEW',floorKey:'project',floorLabel:'المشروع',item:'تنبيه نطاق الشقة',division:'مراجعة النطاق',kind:'note',unit:'—',quantity:null,quantityRequired:false,priceRequired:false,required:false,basis:model.description,warnings:[sourceWarning,'السعر النهائي يظل جزئيًا عند وجود فجوات سعر أو كمية.']});
      }
    } else {
      const floors = (Array.isArray(p.floors)&&p.floors.length?p.floors:[]).filter(f=>!f.isBasement);
      if (!floors.length) notes.push('أدخل دورًا واحدًا على الأقل مع مساحة موجبة.');
      const validFloors = floors.map((f,i)=>({...f,key:f.key||`floor-${i+1}`,label:labelForFloor(f),area:num(f.area),units:Math.max(0,Number(f.units)||0),usage:f.usage||(model.use==='commercial'?'commercial':model.use==='mixed'?(i===0?'commercial':'residential'):'residential')}));
      const areaFloors=validFloors.filter(f=>f.area!==null&&f.area>0);
      if (areaFloors.length!==validFloors.length) notes.push('يوجد دور بمساحة غير صحيحة؛ كميات هذا الدور قد تبقى فجوات.');
      const footprint = areaFloors.find(f=>/ارض|ground|دور ارضي/.test(norm(f.label)))?.area ?? areaFloors[0]?.area ?? null;
      const totalAboveGrade = areaFloors.reduce((s,f)=>s+(f.area||0),0);
      const buildingFloors = validFloors.length;
      const allBuilding = ['BLD-NEW-RES','BLD-NEW-COM','BLD-NEW-MIX','BLD-STRUCTURE'].includes(p.modelCode);
      const includeStructure = allBuilding;
      if (includeStructure) {
        if (footprint!==null) {
          // Explicitly use footprint for foundation quantities, not gross area.
          const excavationQ = quantity(footprint,rates('excavationM3PerM2').value,rates('excavationM3PerM2').low,rates('excavationM3PerM2').high);
          add({code:'FOUND-EXC',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'حفر آلي ونقل ناتج الحفر — شامل النقل',division:'الحفر والأعمال الترابية',kind:'equipment',unit:'م³',quantity:excavationQ,priceCandidates:['حفر آلي ونقل ناتج الحفر شامل النقل'],basis:`بصمة الدور المرجعية ${footprint} م² × معامل الحفر؛ الحجم تقديري وليس حصرًا من المناسيب. السعر المطلوب يشمل الحفار وتحميل ونقل ناتج الحفر إلى مسافة/مقلب متفق عليهما.`,warnings:[sourceWarning,'لا تستخدم سعر حفر فقط أو نقل فقط بديلًا عن السعر الشامل؛ حدد مسافة النقل والمقلب قبل التسعير.']});
          const fillQ = quantity(footprint,rates('backfillM3PerM2').value,rates('backfillM3PerM2').low,rates('backfillM3PerM2').high);
          add({code:'FOUND-BACKFILL-SAND',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'توريد رمل الردم — بعد الهالك',division:'الحفر والأعمال الترابية',kind:'material',unit:'م³',quantity:fillQ,priceCandidates:['رمل ردم (توريد)'],wasteKey:'backfillSand',basis:`صافي حجم الردم التقديري ${fmtNum(fillQ.quantity)} م³ قبل نسبة الهالك؛ لا يساوي تلقائيًا حجم الحفر.`,warnings:[sourceWarning,'معدل الهالك قابل للتعديل من لوحة الإدارة.']});
          add({code:'FOUND-BACKFILL-LAB',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'مصنعية الردم والدك',division:'الحفر والأعمال الترابية',kind:'labor',unit:'م³',quantity:fillQ,priceCandidates:['مصنعية ردم ودك'],basis:'مصنعية الردم والدك على صافي حجم الردم، دون هالك توريد الرمل.',warnings:[sourceWarning]});
          add({code:'FOUND-WATERPROOF-MAT',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'توريد خامات عزل مائي للأساسات',division:'العزل',kind:'material',unit:'م²',quantity:{quantity:null,low:null,high:null},priceCandidates:['بيتومين/رولات عزل','رولات عزل مائي'],basis:'بند اختياري حسب المواصفات؛ أدخل المسطح الفعلي من اللوحات بعد تحديد نظام العزل والتراكب والوزرات.',required:false,quantityRequired:true,wasteKey:'waterproofing',warnings:['فجوة كمية مقصودة؛ لا يقدّر مسطح القواعد من بصمة الدور وحدها.']});
          add({code:'FOUND-WATERPROOF-LAB',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'مصنعية تنفيذ عزل مائي للأساسات',division:'العزل',kind:'labor',unit:'م²',quantity:{quantity:null,low:null,high:null},priceCandidates:['مصنعية عزل مائي','مصنعية عزل'],basis:'مصنعية منفصلة على نفس مساحة العزل الصافية، دون هالك توريد.',required:false,quantityRequired:true,warnings:['اعتمد البند إذا كان نظام العزل ضمن المواصفات.']});
          add({code:'FOUND-REPLACEMENT',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'إحلال زلط — تقدير مساحي',division:'الحفر والأعمال الترابية',kind:'material',unit:'م³',quantity:quantity(footprint,rates('replacementGravelM3PerM2').value,rates('replacementGravelM3PerM2').low,rates('replacementGravelM3PerM2').high),priceCandidates:['زلط عادي','سن'],basis:`بصمة الدور ${footprint} م² × معامل إحلال مبدئي.`,warnings:[sourceWarning,'يتوقف الإحلال على تقرير التربة وتصميم الأساسات.']});
          if (p.foundationSystem==='raft') {
            add({code:'FOUND-RAFT-CONCRETE',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'خرسانة لبشة — من اللوحات',division:'الأساسات',kind:'material',unit:'م³',quantity:{quantity:null,low:null,high:null},priceCandidates:['خرسانة جاهزة '+(p.concreteGrade||'C25')],basis:'لم يستخدم المحرك معامل اللبشة 0.03 الوارد في الملف لأنه محل شك هندسي؛ أدخل حجم اللبشة من اللوحات.',warnings:['فجوة كمية حرجة: يلزم حجم لبشة معتمد وتفريد حديد.']});
            add({code:'FOUND-RAFT-STEEL',floorKey:'project',floorLabel:'المشروع / الأساسات',item:'حديد لبشة — من اللوحات',division:'الأساسات',kind:'material',unit:'طن',quantity:{quantity:null,low:null,high:null},priceCandidates:[p.steelName||'حديد استثماري'],basis:'حصر الحديد من اللوحات/جدول التفريد مطلوب.',warnings:['فجوة كمية حرجة: لا يستخدم معامل قواعد منفصلة للّبشة.']});
          } else {
            const fconc=quantity(footprint,rates('foundationConcreteM3PerM2').value,rates('foundationConcreteM3PerM2').low,rates('foundationConcreteM3PerM2').high);
            addConcreteSupply({key:'foundations',label:'الأساسات'},fconc,'FOUND-CONCRETE',[sourceWarning,'حجم تأسيسات تخطيطي؛ راجع التصميم.']);
            const fsteel=quantity(footprint,rates('foundationSteelKgPerM2').value,rates('foundationSteelKgPerM2').low,rates('foundationSteelKgPerM2').high);
            addSteel({key:'foundations',label:'الأساسات'},{quantity:fsteel.quantity===null?null:fsteel.quantity/1000,low:fsteel.low===null?null:fsteel.low/1000,high:fsteel.high===null?null:fsteel.high/1000},'FOUND-STEEL',[sourceWarning,'معدل 8 كجم/م² بصمة تخطيطي فقط؛ تحقق من الأساسات والميدات.']);
          }
        } else {
          add({code:'FOUND-EXC',item:'حفر آلي ونقل ناتج الحفر — شامل النقل',division:'الحفر والأعمال الترابية',kind:'equipment',unit:'م³',quantity:{quantity:null,low:null,high:null},priceCandidates:['حفر آلي ونقل ناتج الحفر شامل النقل'],basis:'يلزم إدخال حجم الحفر من اللوحات والمناسيب، ويجب أن يشمل سعر الوحدة الحفار والنقل إلى مسافة/مقلب متفق عليهما.',warnings:['فجوة كمية؛ لا يعوضها سعر الحفر وحده.']});
        }
        for (const f of validFloors) {
          const fa=f.area;
          const concrete = fa===null?{quantity:null,low:null,high:null}:quantity(fa,rates('concreteM3PerM2').value,rates('concreteM3PerM2').low,rates('concreteM3PerM2').high);
          const commercial=f.usage==='commercial' || p.modelCode==='BLD-NEW-COM';
          const cFactor=commercial?rates('commercialConcreteFactor').value:1;
          const concreteAdjusted={quantity:concrete.quantity===null?null:concrete.quantity*cFactor,low:concrete.low===null?null:concrete.low*cFactor,high:concrete.high===null?null:concrete.high*cFactor};
          addConcreteSupply({key:f.key,label:f.label},concreteAdjusted,`${f.key}-STRUCT-CONCRETE`,[sourceWarning,...(commercial?['يطبق معامل تجاري مقترح غير معاير من التقرير.']:[])]);
          const steel = fa===null?{quantity:null,low:null,high:null}:quantity(fa,rates('steelKgPerM2').value,rates('steelKgPerM2').low,rates('steelKgPerM2').high);
          const sFactor=commercial?rates('commercialSteelFactor').value:1;
          const steelTonnes={quantity:steel.quantity===null?null:steel.quantity*sFactor/1000,low:steel.low===null?null:steel.low*sFactor/1000,high:steel.high===null?null:steel.high*sFactor/1000};
          addSteel({key:f.key,label:f.label},steelTonnes,`${f.key}-STRUCT-STEEL`,[sourceWarning,...(commercial?['معامل حديد تجاري مقترح وغير معاير.']:[])]);
          const wallMeasured=num(f.halfBrickArea)!==null || num(f.fullBrickArea)!==null;
          addMasonry(f,f.key,fa||0,!wallMeasured);
          if (p.modelCode==='BLD-STRUCTURE') add({code:`${f.key}-STRUCT-STAIR`,floorKey:f.key,floorLabel:f.label,item:'سلالم خرسانية — حصر من اللوحات',division:'الهيكل الخرساني',kind:'material',unit:'م³',quantity:{quantity:null,low:null,high:null},priceCandidates:[`خرسانة جاهزة ${p.concreteGrade||'C25'}`],basis:'لم يستخدم معدل 0.06 م²/م² المذكور للسلالم بوصفه حجم خرسانة؛ يلزم حصر البسطات والقوائم والكمرات من اللوحات.',warnings:['فجوة كمية مقصودة؛ لا تمثل صفرًا.']});
          if (p.modelCode==='BLD-STRUCTURE' && !p.includeBasicPlaster) continue;
          if (p.modelCode==='BLD-STRUCTURE' && p.includeBasicPlaster) {
            const plArea=quantity(fa,rates('plasterM2PerM2Built').value,rates('plasterM2PerM2Built').low,rates('plasterM2PerM2Built').high);
            add({code:`${f.key}-PLASTER`,floorKey:f.key,floorLabel:f.label,item:'محارة أساسية',division:'المباني والبياض',kind:'labor',unit:'م²',quantity:plArea,priceCandidates:['محارة وبياض','مصنعية محارة'],basis:'خيار اختياري لهيكل/مباني فقط؛ مساحة تخطيطية.',warnings:[sourceWarning]});
          }
        }
        if (p.concreteMethod==='ready_mix') add({code:'PROJECT-CONCRETE-PUMP',floorKey:'project',floorLabel:'المشروع',item:'مضخة خرسانة / تشغيل وانتقال',division:'معدات الصب',kind:'equipment',unit:'يوم/م³',quantity:{quantity:null,low:null,high:null},priceCandidates:['أجرة مضخة خرسانة','مضخة خرسانة'],basis:'يلزم تحديد عدد الصبات/أيام التشغيل ومسافة الانتقال من عرض المضخة؛ لا يفترض المحرك كمية تلقائية.',warnings:['فجوة كمية مقصودة حتى يحدد جدول الصبات والمورد.']});
        // Basement lines are only based on explicit fields, never multiplied using typical-floor factors.
        if (p.basement) {
          const basementFootprint = areaFloors.find(f=>/ارض|ground|دور ارضي/.test(norm(f.label)))?.area ?? areaFloors[0]?.area ?? null;
          const bq = num(p.basementExcavationM3); const bcInput = num(p.basementConcreteM3); const bsInput = num(p.basementSteelTonnes); const bw = num(p.basementWaterproofArea);
          const bc = bcInput!==null?{quantity:bcInput,low:bcInput,high:bcInput}:basementFootprint===null?{quantity:null,low:null,high:null}:quantity(basementFootprint,rates('basementConcreteM3PerM2').value,rates('basementConcreteM3PerM2').low,rates('basementConcreteM3PerM2').high);
          const bs = bsInput!==null?{quantity:bsInput,low:bsInput,high:bsInput}:basementFootprint===null?{quantity:null,low:null,high:null}:quantity(basementFootprint,rates('basementSteelKgPerM2').value/1000,rates('basementSteelKgPerM2').low/1000,rates('basementSteelKgPerM2').high/1000);
          add({code:'BASEMENT-EXC',floorKey:'basement',floorLabel:'البدروم',item:'حفر البدروم',division:'الحفر والأعمال الترابية',kind:'equipment',unit:'م³',quantity:{quantity:bq,low:bq,high:bq},priceCandidates:['حفر آلي ونقل ناتج الحفر شامل النقل'],basis:'حجم مدخل من الحصر/اللوحات؛ السعر شامل الحفار والنقل إلى مسافة/مقلب متفق عليهما، ولا يطبق معدل الدور العادي.',warnings:['اعتماد حجم الحفر والمناسيب والمساند من المهندس الجيوتقني.']});
          addConcreteSupply({key:'basement',label:'البدروم'},bc,'BASEMENT-CONCRETE',[`تقدير بدروم بمعدل مستقل ${rates('basementConcreteM3PerM2').low}–${rates('basementConcreteM3PerM2').high} م³/م² بصمة؛ بصمة البدروم مفترضة مساوية للدور الأرضي ما لم تدخل كمية يدوية.`,`حصر البدروم من اللوحات مطلوب قبل الشراء.`]);
          addSteel({key:'basement',label:'البدروم'}, {quantity:bs.quantity,low:bs.low,high:bs.high},'BASEMENT-STEEL',[`تقدير بدروم بمعدل مستقل ${rates('basementSteelKgPerM2').low}–${rates('basementSteelKgPerM2').high} كجم/م² بصمة؛ بصمة البدروم مفترضة مساوية للدور الأرضي ما لم تدخل كمية يدوية.`,`لا يعتمد قبل مراجعة التفريد الإنشائي.`]);
          add({code:'BASEMENT-WATERPROOF',floorKey:'basement',floorLabel:'البدروم',item:'توريد خامات عزل مائي للبدروم',division:'العزل',kind:'material',unit:'م²',quantity:{quantity:bw,low:bw,high:bw},priceCandidates:['بيتومين/رولات عزل','رولات عزل مائي'],basis:'مساحة عزل مدخلة يدويًا؛ راجع التراكب والوزرات ونظام العزل قبل تطبيق الهالك.',warnings:['تحتاج مواصفات النظام وعلاج الفواصل والتفاصيل.'],wasteKey:'waterproofing'});
          add({code:'BASEMENT-WATERPROOF-LAB',floorKey:'basement',floorLabel:'البدروم',item:'مصنعية تنفيذ عزل مائي للبدروم',division:'العزل',kind:'labor',unit:'م²',quantity:{quantity:bw,low:bw,high:bw},priceCandidates:['مصنعية عزل مائي','مصنعية عزل'],basis:'مصنعية مستقلة على نفس المسطح الصافي؛ لا يضاف الهالك على المصنعية.'});
          if (p.groundwater) { const days=num(p.dewateringDays);add({code:'BASEMENT-DEWATERING',floorKey:'basement',floorLabel:'البدروم',item:'نزح مياه جوفية / معدات',division:'الحفر والأعمال الترابية',kind:'equipment',unit:'يوم',quantity:{quantity:days,low:days,high:days},priceCandidates:['نزح مياه جوفية','معدات نزح مياه'],basis:'أيام تشغيل تدخل حسب خطة الجيوتقني والمقاول.',warnings:['لا يكفي معامل تكلفة فقط؛ يلزم دراسة ونطاق عرض معدات.']}); }
        }
      }
      const includeFinish = ['BLD-NEW-RES','BLD-NEW-COM','BLD-NEW-MIX','BLD-FINISH'].includes(p.modelCode);
      if (includeFinish) {
        for (const f of validFloors) {
          const commercial = p.modelCode==='BLD-NEW-COM' || f.usage==='commercial';
          if (p.modelCode==='BLD-FINISH') {
            const delivery = p.deliveryCondition || 'APT-BRICK';
            const conditionIncludes = MODEL_MAP[delivery]?.includes || MODEL_MAP['APT-BRICK'].includes;
            const apartmentCompleted = {};
            for (const [k,label] of Object.entries({plaster:'المحارة',plumbing:'السباكة',electrical:'الكهرباء',flooring:'الأرضيات',wetTiles:'السيراميك الرطب',paint:'الدهانات',doors:'الأبواب',windows:'الشبابيك',sanitary:'الأطقم الصحية',kitchen:'المطبخ'})) {
              if (p.completed?.[k]) apartmentCompleted[k]=true;
            }
            const count=Math.max(1,f.units||p.unitsPerFloor||1);
            const commonArea=num(f.commonArea);
            apartmentLines({area:f.area===null||commonArea===null?null:Math.max(0,f.area-commonArea)/count,count,roomsPerApartment:p.roomsPerApartment,floorKey:f.key,floorLabel:f.label,includes:conditionIncludes,acUnits:f.acUnits});
          } else if (commercial) {
            const area=f.area;
            if (area===null) { add({code:`${f.key}-COM-AREA`,floorKey:f.key,floorLabel:f.label,item:'مساحة الدور التجاري',division:'التشطيبات التجارية',kind:'note',unit:'م²',quantity:{quantity:null,low:null,high:null},priceRequired:false,basis:'مساحة تجارية مطلوبة.',warnings:['فجوة قياس.']});continue; }
            const factor=rates('commercialElectricalFactor').value;
            add({code:`${f.key}-COM-ELEC`,floorKey:f.key,floorLabel:f.label,item:'كهرباء تجارية — مؤشر مساحي',division:'الكهرباء',kind:'material',unit:'م²',quantity:quantity(area,factor,factor,factor),priceCandidates:['خامات كهرباء للمتر','خامات كهرباء'],basis:`مساحة الدور × معامل ${factor}; الأحمال لا تُستنتج من المساحة فقط.`,warnings:[sourceWarning,'يلزم تصميم كهرباء وحريق حسب نوع النشاط.']});
            add({code:`${f.key}-COM-STOREFRONT`,floorKey:f.key,floorLabel:f.label,item:'واجهة زجاجية/أبواب محلات',division:'الواجهات التجارية',kind:'material',unit:'م²',quantity:{quantity:null,low:null,high:null},priceCandidates:['واجهة زجاجية تجارية','شبابيك ألوميتال جامبو'],basis:'المساحة وتقسيمات الزجاج والقطاعات من واجهات معتمدة.',warnings:['فجوة حصر حرجة للمحلات؛ لا يستخدم معامل واجهة كبديل للتصميم.']});
            add({code:`${f.key}-COM-AC`,floorKey:f.key,floorLabel:f.label,item:'تكييف تجاري — مراجعة أحمال',division:'التكييف',kind:'material',unit:'م²',quantity:{quantity:null,low:null,high:null},priceCandidates:['تكييف مركزي','تأسيس تكييف'],basis:'نوع النظام والسعة الحرارية من دراسة الأحمال.',warnings:['يلزم تحديد النظام والسعة ومسارات الأنابيب.']});
            add({code:`${f.key}-COM-FIRE`,floorKey:f.key,floorLabel:f.label,item:'نظام إنذار/إطفاء الحريق',division:'أنظمة الحريق',kind:'material',unit:'مشروع',quantity:{quantity:null,low:null,high:null},priceCandidates:['نظام إنذار وإطفاء الحريق'],basis:'حسب النشاط والاشتراطات والاعتماد المختص.',warnings:['يلزم التحقق من المتطلبات الرسمية والرسومات؛ لا يفترض أن النظام اختياري أو إلزامي دون معرفة النشاط.']});
          } else {
            // Residential or mixed-use residential floor finish measured by floor area and unit count.
            const commonArea=num(f.commonArea);
            apartmentLines({area:f.area===null||commonArea===null?null:Math.max(0,f.area-commonArea)/Math.max(1,f.units||p.unitsPerFloor||1),count:Math.max(1,f.units||p.unitsPerFloor||1),roomsPerApartment:p.roomsPerApartment,floorKey:f.key,floorLabel:f.label,includes:MODEL_MAP['APT-BRICK'].includes,acUnits:f.acUnits});
          }
        }
      }
      // Common works are not multiplied by unit count: stair, roof, facade, elevator and public utilities are project/floor items.
      if (includeFinish || p.modelCode==='BLD-FINISH') {
        for (const f of validFloors) {
          const isRoof = f.key === areaFloors[areaFloors.length-1]?.key;
          const commonArea=num(f.commonArea); const commonEstimated=f.commonAreaSource==='estimate';
          const stair = commonArea===null?{quantity:null,low:null,high:null}:{quantity:commonArea,low:commonArea,high:commonArea};
          const commonBasis=commonArea===null?'أدخل مساحة السلالم/المشتركات أو اقبل الافتراض التلقائي؛ المساحة الفارغة تمنع اكتمال هذا البند.':commonEstimated?`مساحة مشتركات تقديرية ${commonArea} م² (${f.area>0?Number((100*commonArea/f.area).toFixed(1)):10}% من مسطح الدور)؛ استبدلها بالقياس الفعلي عند توفره.`:`مساحة المشتركات المدخلة/المقاسة للدور: ${commonArea} م².`;
          add({code:`${f.key}-STAIR-MAT`,floorKey:f.key,floorLabel:f.label,item:'توريد رخام/جرانيت السلالم والمشتركات',division:'الرخام والجرانيت',kind:'material',unit:'م²',quantity:stair,priceCandidates:['رخام وجرانيت','رخام'],basis:commonBasis,wasteKey:'tile',warnings:[...(commonArea===null?['فجوة كمية: مساحة المشتركات والسلالم مطلوبة.']:[]),...(commonEstimated?['المساحة الافتراضية تقدير مبدئي بنسبة المشتركات؛ لا تعامل كقياس فعلي.']:[])]});
          add({code:`${f.key}-STAIR-LAB`,floorKey:f.key,floorLabel:f.label,item:'مصنعية تركيب رخام/جرانيت السلالم والمشتركات',division:'الرخام والجرانيت',kind:'labor',unit:'م²',quantity:stair,priceCandidates:['مصنعية تركيب رخام','مصنعية تركيب جرانيت'],basis:'نفس مساحة التكسية المقاسة؛ لا يضاف هالك على المصنعية.',warnings:[...(commonArea===null?['فجوة كمية: مساحة المشتركات والسلالم مطلوبة.']:[]),...(commonEstimated?['المساحة الافتراضية تقدير مبدئي بنسبة المشتركات؛ لا تعامل كقياس فعلي.']:[])]});
          const facadeMeasured=num(f.facadeArea);
          const facadeQ=facadeMeasured!==null?{quantity:facadeMeasured,low:facadeMeasured,high:facadeMeasured}:f.area===null?{quantity:null,low:null,high:null}:quantity(f.area,rates('exteriorPlasterM2PerM2Built').value,rates('exteriorPlasterM2PerM2Built').low,rates('exteriorPlasterM2PerM2Built').high);
          add({code:`${f.key}-FACADE-CEMENT`,floorKey:f.key,floorLabel:f.label,item:'أسمنت بياض الواجهة الخارجية',division:'الواجهات',kind:'material',unit:'طن',quantity:scaleQ(facadeQ,rates('exteriorPlasterCementKgPerM2').value/1000,rates('exteriorPlasterCementKgPerM2').low/1000,rates('exteriorPlasterCementKgPerM2').high/1000),priceCandidates:unitAliases.cement,basis:'مساحة الواجهة × نطاق أسمنت البياض؛ الافتراضي يحتاج اعتماد السمك ونظام التنفيذ.',warnings:[sourceWarning,'نطاق استرشادي وليس خلطة معتمدة.'],resourceKey:'cement|طن|material'});
          add({code:`${f.key}-FACADE-SAND`,floorKey:f.key,floorLabel:f.label,item:'رمل بياض الواجهة الخارجية',division:'الواجهات',kind:'material',unit:'م³',quantity:scaleQ(facadeQ,rates('exteriorPlasterSandM3PerM2').value,rates('exteriorPlasterSandM3PerM2').value,rates('exteriorPlasterSandM3PerM2').value),priceCandidates:unitAliases.sand,basis:'مساحة الواجهة × 0.025 م³/م² حسب معدل المحارة المرجعي.',warnings:[sourceWarning],resourceKey:'sand|م³|material',wasteKey:'masonrySand'});
          add({code:`${f.key}-FACADE`,floorKey:f.key,floorLabel:f.label,item:'محارة/تشطيب واجهة خارجية',division:'الواجهات',kind:'labor',unit:'م²',quantity:facadeQ,priceCandidates:['مصنعية محارة خارجية','محارة خارجية'],basis:facadeMeasured!==null?'مساحة واجهة مقاسة مدخلة لكل دور.':`مسطح الدور × ${rates('exteriorPlasterM2PerM2Built').value} معامل واجهة استرشادي.`,warnings:facadeMeasured!==null?[]:[sourceWarning,'المعامل لا يخصم فتحات الواجهة؛ يلزم الحصر الفعلي.']});
          if (isRoof) {
            const roof=quantity(f.area,rates('roofWaterproofM2PerM2').value,rates('roofWaterproofM2PerM2').low,rates('roofWaterproofM2PerM2').high);
            add({code:'PROJECT-ROOF-WATERPROOF',floorKey:f.key,floorLabel:`السطح (${f.label})`,item:'عزل السطح المائي — توريد',division:'العزل',kind:'material',unit:'م²',quantity:roof,priceCandidates:['بيتومين/رولات عزل','رولات عزل مائي'],basis:`مساحة السطح × معامل ${rates('roofWaterproofM2PerM2').value}؛ المعامل يشمل احتياطي التراكب، لذلك لا يضاف هالك تلقائي آخر.`,warnings:[sourceWarning],wastePercent:0});
            add({code:'PROJECT-ROOF-WATERPROOF-LAB',floorKey:f.key,floorLabel:`السطح (${f.label})`,item:'مصنعية تنفيذ العزل المائي',division:'مصنعيات العزل',kind:'labor',unit:'م²',quantity:roof,priceCandidates:['مصنعية عزل مائي','مصنعية عزل'],basis:'مصنعية التطبيق منفصلة عن توريد الرولات/البيتومين؛ السعر يحتاج توثيقًا.'});
          }
        }
        add({code:'PROJECT-SOIL-TEST',floorKey:'project',floorLabel:'المشروع',item:'اختبار تربة / تقرير جيوتقني',division:'التكاليف غير المباشرة',kind:'service',unit:'مشروع',quantity:{quantity:1,low:1,high:1},priceCandidates:['فحص تربة'],basis:'بند واحد للمشروع؛ نطاق الجسات والمختبر يحدد من الاستشاري.',warnings:['السعر/النطاق يلزم تأكيدهما بعرض محلي.']});
        add({code:'PROJECT-DESIGN',floorKey:'project',floorLabel:'المشروع',item:'تصميم معماري وإنشائي',division:'التكاليف غير المباشرة',kind:'service',unit:'مشروع',quantity:{quantity:1,low:1,high:1},priceCandidates:['تصميم معماري وإنشائي','تصميم معماري/إنشائي'],basis:'بند مستقل إذا كان ضمن النطاق؛ لا يعني النظام أنه مشمول في المقاولة.',warnings:['تأكيد نطاق الخدمة مع المكتب الهندسي.']});
        if (p.modelCode!=='BLD-STRUCTURE') add({code:'PROJECT-PERMITS',floorKey:'project',floorLabel:'المشروع',item:'تراخيص وإجراءات بناء',division:'التكاليف غير المباشرة',kind:'service',unit:'مشروع',quantity:{quantity:1,low:1,high:1},priceCandidates:['رسوم ترخيص وإجراءات بناء','تراخيص البناء'],basis:'قيمة الرسوم الرسمية تتأكد حسب العنوان والاشتراطات.',warnings:['لا توجد قيمة رسمية محلية مؤكدة ضمن الكتالوج.']});
        if (p.elevator) {
          add({code:'PROJECT-ELEVATOR',floorKey:'project',floorLabel:'المشروع',item:'توريد أسانسير',division:'الأسانسير',kind:'material',unit:'وحدة',quantity:{quantity:1,low:1,high:1},priceCandidates:['أسانسير 6–8 وقفات'],basis:'توريد فقط؛ استبعاد سعر عرض توريد+تركيب من هذه السطر حتى لا يكرر بند المصنعية المنفصل. راجع تفاصيل عرض المورد.',warnings:['تحقق هل عرض الأسانسير يشمل التركيب والكابينة والأبواب والمراقبة والصيانة.']});
          add({code:'PROJECT-ELEVATOR-LAB',floorKey:'project',floorLabel:'المشروع',item:'مصنعية تركيب أسانسير',division:'مصنعيات المعدات',kind:'labor',unit:'وحدة',quantity:{quantity:1,low:1,high:1},priceCandidates:['مصنعية تركيب أسانسير'],basis:'تركيب منفصل فقط إذا لم يكن مشمولًا في عرض التوريد.',warnings:['تحقق من عدم ازدواج التركيب بين عرض المورد وهذا البند.']});
        }
        add({code:'PROJECT-PUBLIC-NETWORKS',floorKey:'project',floorLabel:'المشروع',item:'المرافق والشبكات العامة',division:'المرافق',kind:'service',unit:'مشروع',quantity:{quantity:null,low:null,high:null},priceCandidates:['شبكات المرافق العامة','توصيل صرف عام'],basis:'يحدد حسب حالة الشبكات الحالية ومكان الربط والمخططات.',warnings:['لا يمكن التسعير/الحصر قبل تحديد حدود الأعمال.']});
      }
    }

    // Soil factors remain review indicators, not blind multipliers on every structural item.
    if (p.soil==='clay') notes.push('تربة طينية: يلزم تقرير تربة؛ لم يضرب المحرك كل كميات الخرسانة/الحديد في معامل آلي غير معتمد.');
    if (p.soil==='rocky') notes.push('تربة صخرية: كمية وتكلفة الحفر تحتاج سعر وطريقة تكسير فعلية.');
    if (p.groundwater) notes.push('مياه جوفية قريبة: يلزم تصميم نزح وعزل؛ لم يستنتج المحرك المدة أو الكمية تلقائيًا.');
    if (p.foundationSystem==='raft' && isBuildingCode(p.modelCode)) notes.push('اختيار لبشة: لم يطبق معامل المصدر 0.03 لخرسانة اللبشة لأنه محل شك؛ كميات اللبشة والحديد فجوة إلى حين إدخال الحصر.');

    const pricedLines = lines.filter(x=>x.kind!=='note' && x.quantity!==null && x.unitPrice!==null && x.cost!==null);
    const directSubtotal = moneyRound(pricedLines.reduce((s,x)=>s+(x.cost||0),0));
    const supplySubtotal = moneyRound(pricedLines.filter(x=>x.kind==='material').reduce((s,x)=>s+(x.cost||0),0));
    const laborSubtotal = moneyRound(pricedLines.filter(x=>x.kind==='labor').reduce((s,x)=>s+(x.cost||0),0));
    const equipmentSubtotal = moneyRound(pricedLines.filter(x=>x.kind==='equipment').reduce((s,x)=>s+(x.cost||0),0));
    const serviceSubtotal = moneyRound(pricedLines.filter(x=>x.kind==='service').reduce((s,x)=>s+(x.cost||0),0));
    const priceGaps = lines.filter(x=>x.required && x.kind!=='note' && x.priceGap);
    const quantityGaps = lines.filter(x=>x.required && x.kind!=='note' && x.quantityGap);
    const staleLines = lines.filter(x=>x.stale && x.unitPrice!==null);
    const nationalLines = lines.filter(x=>x.priceStatus==='national' && x.unitPrice!==null);
    const localLines = lines.filter(x=>x.priceStatus==='local' && x.unitPrice!==null);
    const priceCoverage = lines.filter(x=>x.required && x.kind!=='note').length ? Math.round(lines.filter(x=>x.required && x.kind!=='note' && x.unitPrice!==null).length/lines.filter(x=>x.required && x.kind!=='note').length*100) : 0;
    const quantityCoverage = lines.filter(x=>x.required && x.kind!=='note').length ? Math.round(lines.filter(x=>x.required && x.kind!=='note' && !x.quantityGap).length/lines.filter(x=>x.required && x.kind!=='note').length*100) : 0;
    const feeRate = p.marginMode==='supervision' ? Number(settings.supervision ?? 10) : Number(settings.margin ?? 15);
    const fee = moneyRound(directSubtotal*feeRate/100);
    const totalKnownPartial = moneyRound(directSubtotal+(fee||0));
    const byDivisionMap = new Map();
    for (const l of lines) {
      const key=l.division||'غير مصنف'; if(!byDivisionMap.has(key))byDivisionMap.set(key,{division:key,subtotal:0,priced:0,priceGaps:0,quantityGaps:0,lines:0});
      const g=byDivisionMap.get(key);g.lines++; if(l.cost!==null){g.subtotal+=l.cost;g.priced++;}if(l.priceGap)g.priceGaps++;if(l.quantityGap)g.quantityGaps++;
    }
    const byDivision=[...byDivisionMap.values()].map(g=>({...g,subtotal:moneyRound(g.subtotal)}));
    const allQuantityComplete=quantityGaps.length===0;
    const allPriceComplete=priceGaps.length===0;
    const transportRisks = lines.filter(x=>x.unitPrice!==null && x.kind==='material' && x.transport!=='yes' && x.transport!=='not-applicable');
    const contractReady=!!MODEL_MAP[requestedModelCode]&&allQuantityComplete&&allPriceComplete&&staleLines.length===0&&nationalLines.length===0&&transportRisks.length===0;
    return {model,project:p,marginMode:p.marginMode,lines,notes,byDivision,directSubtotal,supplySubtotal,laborSubtotal,equipmentSubtotal,serviceSubtotal,feeRate,fee,totalKnownPartial,totalKnownPartialLabel:p.marginMode==='supervision'?'المجموع المعروف + أتعاب الإشراف الجزئية':'المجموع المعروف بعد هامش داخلي جزئي',priceGaps,quantityGaps,staleLines,nationalLines,localLines,transportRisks,priceCoverage,quantityCoverage,pricedCount:pricedLines.length,contractReady,canQuoteFinal:contractReady&&notes.length===0,totalAboveGradeArea:model.type==='apartment'?(num(p.apartmentArea)||0)*Math.max(0,Number(p.apartmentCount)||0):sum((p.floors||[]).filter(f=>!f.isBasement).map(f=>num(f.area)||0)),modelCode:p.modelCode,quoteBasis:p.quoteBasis,summary:{lineCount:lines.length,pricedLineCount:pricedLines.length,priceGapCount:priceGaps.length,quantityGapCount:quantityGaps.length}};
  }
  function isBuildingCode(code){return String(code||'').startsWith('BLD-');}
  function sum(a){return a.reduce((s,x)=>s+x,0);}
  function validateRateSettings(saved) {
    const errors=[];
    for (const d of RATE_DEFINITIONS) {
      const x=saved?.[d.key]; if(x===undefined||x===null||x==='')continue;
      const v=typeof x==='object'?x.value:x; const n=num(v);
      if(n===null||n<0)errors.push(`${d.label}: يجب أن يكون المعدل رقمًا غير سالب.`);
      if(typeof x==='object') { const lo=num(x.low),hi=num(x.high); if(lo===null||hi===null||lo<0||hi<0)errors.push(`${d.label}: حدود المعدل يجب أن تكون أرقامًا غير سالبة.`); else if(lo>hi)errors.push(`${d.label}: الحد الأدنى أكبر من الحد الأعلى.`); if(n!==null&&(n<lo||n>hi))errors.push(`${d.label}: المعدل الافتراضي خارج النطاق.`); }
    }
    return errors;
  }
  function modelForDelivery(code) { return MODEL_MAP[code] || MODEL_MAP['APT-BRICK']; }
  return {MODEL_DEFINITIONS,RATE_DEFINITIONS,rateValue,buildEstimate,validateRateSettings,modelForDelivery};
});
