/* MIYAR deterministic construction estimating engine — no LLM, no network calls. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MIYAR_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const RATE_REGISTRY = root?.MIYAR_RATES || (typeof require === 'function' ? require('./miyar-rates.js') : null);
  const DIVISIONS = [
    { code: '01', name: 'الدراسات والتجهيزات والتكاليف غير المباشرة', color: 'indirect' },
    { code: '02', name: 'الحفر والأعمال الترابية والأساسات', color: 'earth' },
    { code: '03', name: 'الهيكل الخرساني ومواده ومصنعياته', color: 'structure' },
    { code: '04', name: 'المباني والبياض والعزل', color: 'masonry' },
    { code: '05', name: 'أعمال الكهرباء والتيار الخفيف', color: 'electrical' },
    { code: '06', name: 'أعمال السباكة والصرف والتغذية', color: 'plumbing' },
    { code: '07', name: 'التشطيبات المعمارية', color: 'finishing' },
    { code: '08', name: 'المصنعيات والعمالة', color: 'labor' },
    { code: '09', name: 'الأسانسير والمعدات الخاصة', color: 'special' },
    { code: '10', name: 'الخيارات الإضافية', color: 'options' }
  ];
  const PACKAGE_LABELS = { economic: 'اقتصادي', semi: 'نصف تشطيب', medium: 'متوسط', luxury: 'فاخر' };
  const SCOPE_LABELS = { structure: 'الهيكل فقط', finishing: 'التشطيب فقط', turnkey: 'على المفتاح' };

  function normalizeArabic(value) {
    return String(value == null ? '' : value).toLowerCase()
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
      .replace(/م²|م2/g, ' متر مربع ').replace(/ج\.م/g, ' جنيه ').replace(/\s+/g, ' ').trim();
  }
  const includesAny = (text, words) => words.some(w => text.includes(normalizeArabic(w)));

  function classifyPriceRow(row) {
    const n = normalizeArabic(row && row.name);
    const c = normalizeArabic(row && row.category);
    let division;

    // Prefer an explicit admin-defined category over keyword guesses. This prevents
    // e.g. "مونة أسمنت ورمل" being misclassified as structural cement, and keeps
    // "اختبار تربة" with earthworks rather than indirect testing.
    if (row && row.scope === 'optional' || c.includes('خيارات اضافيه')) division = '10';
    else if (c.includes('التكاليف غير المباشره')) division = '01';
    else if (c.includes('الحفر') || c.includes('الاساسات')) division = '02';
    else if (c.includes('الهيكل الخرساني')) division = '03';
    else if (c.includes('المباني') || c.includes('البياض') || c.includes('العزل')) division = '04';
    else if (c.includes('الكهرباء')) division = '05';
    else if (c.includes('السباكه') || c.includes('الصرف') || c.includes('التغذيه')) division = '06';
    else if (c.includes('المصنعيات') || c.includes('العماله')) division = '08';
    else if (c.includes('الاسانسير') || c.includes('المعدات الخاصه')) division = '09';
    else if (c.includes('التشطيبات')) division = '07';
    else if (includesAny(n, ['اختبار تربه', 'حفر الي', 'حفر يدوي', 'نقل ناتج الحفر', 'ردم ودك'])) division = '02';
    else if (includesAny(n, ['تصميم معماري', 'ترخيص', 'رسوم عداد', 'عداد كهرباء', 'عداد مياه', 'توصيل غاز', 'اشراف هندسي', 'ضرائب', 'تامينات', 'اختبارات خرسانه وحديد'])) division = '01';
    else if (includesAny(n, ['مصنعيه', 'اجر يوميه', 'يوميه صنايعي', 'يوميه عامل'])) division = '08';
    else if (includesAny(n, ['ppr', 'pvc صرف', 'خلاط', 'طقم صحي', 'اطقم صحيه', 'خامات سباكه', 'خزان مياه', 'توصيل صرف عام'])) division = '06';
    else if (includesAny(n, ['كابل', 'اسلاك كهرباء', 'مواسير كهرباء', 'مفاتيح وبريزات', 'لوحه schneider', 'خامات كهرباء'])) division = '05';
    else if (includesAny(n, ['طوب', 'مونه اسمنت', 'محاره', 'بياض', 'لياسه'])) division = '04';
    else if (includesAny(n, ['اسانسير', 'مصعد', 'صيانة اسانسير'])) division = '09';
    else if (includesAny(n, ['مطبخ الوميتال', 'مطبخ —', 'تاسيس تكييف'])) division = '10';
    else if (includesAny(n, ['حديد تسليح', 'حديد استثماري', 'حديد عز', 'حديد بشاي', 'اسمنت', 'خرسانه جاهزه', 'مضخه خرسانه', 'شده خشبيه', 'شده معدنيه', 'سلك ربط', 'بيتومين', 'رولات عزل', 'رمل', 'زلط', 'سن'])) division = '03';
    else if (includesAny(n, ['سيراميك', 'بورسلين', 'دهانات', 'ابواب', 'شبابيك', 'رخام', 'جرانيت', 'جبس بورد', 'واجهه حجر', 'هاي ستون'])) division = '07';
    else division = '07';

    const div = DIVISIONS.find(d => d.code === division) || DIVISIONS[6];
    let itemType = 'material';
    if (includesAny(n, ['مصنعيه', 'اجر يوميه', 'اتعاب', 'اشراف'])) itemType = 'labor';
    if (includesAny(n, ['تصميم', 'ترخيص', 'عداد', 'اختبار', 'توصيل', 'صيانه'])) itemType = 'service';
    if (row && row.scope === 'optional') itemType = 'optional';
    const quantityMode = row && (row.qtyMode || row.quantityMode) || 'manual';
    let quantityState = Number(row && row.factor) > 0 || quantityMode === 'fixed' ? 'configured' : 'needs_quantity_rule';
    if ((row && row.quantityRule === 'manual') || quantityMode === 'manual') quantityState = 'manual_quantity';
    return {
      divisionCode: div.code,
      division: div.name,
      workType: itemType,
      quantityState,
      wbsCode: row && row.wbsCode || `${div.code}.XX`,
    };
  }

  function rowHasPrice(row) {
    return RATE_REGISTRY ? RATE_REGISTRY.hasUsablePrice(row) : (!!row && row.active !== false && row.status !== 'missing' && row.avg !== null && row.avg !== undefined && row.avg !== '' && Number.isFinite(Number(row.avg)) && Number(row.avg) > 0);
  }
  function rowIsStale(row, staleDays = 90, now = new Date()) {
    if (!row || !row.date) return true;
    const date = new Date(`${row.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return true;
    const age = Math.floor((now.getTime() - date.getTime()) / 86400000);
    return age < 0 || age > Number(staleDays || 90);
  }
  function findByName(rows, name) {
    if (!name) return null;
    const normalized = normalizeArabic(name);
    const available = (rows || []).filter(r => r && r.active !== false);
    // Prefer exact canonical names, then resolve historical names through aliases.
    // Deactivated duplicate rows remain in the data archive but are never priced.
    return available.find(r => normalizeArabic(r.name) === normalized) ||
      available.find(r => Array.isArray(r.aliases) && r.aliases.some(alias => normalizeArabic(alias) === normalized)) || null;
  }
  function pickPackageRow(rows, rules, pkg) {
    const names = rules[pkg] || rules.medium || [];
    for (const name of names) {
      const match = findByName(rows, name);
      if (match) return match;
    }
    return null;
  }
  function scopeAllowed(line, project) {
    if (line.optionKey && !project[line.optionKey]) return false;
    const scope = project.scope || 'turnkey';
    if (line.scope === 'optional') return !!line.optionKey && !!project[line.optionKey];
    if (scope === 'structure') return ['structure', 'earth'].includes(line.scope);
    if (scope === 'finishing') return ['finishing', 'electrical', 'plumbing', 'labor', 'special'].includes(line.scope) && !line.turnkeyOnly;
    return true;
  }
  function getGrossArea(project) {
    return Math.max(0, Number(project.area) || 0) * Math.max(0, Number(project.floors) || 0);
  }
  function sharedRateValue(settings, key, fallback) {
    // The legacy account settings are still the visible inputs in the basic estimator.
    // They are synchronized to modelRates/resourceRates on Save. Give a finite explicit
    // visible value priority here as a compatibility safeguard for old localStorage data
    // where these fields could diverge from the unified registry.
    const legacy = ({steelKgPerM2:['steelFactor',1000],concreteM3PerM2:['concreteFactor',1],basementSteelKgPerM2:['basementSteelFactor',1000],basementConcreteM3PerM2:['basementConcreteFactor',1]})[key];
    if (legacy) {
      const legacyRaw = settings?.[legacy[0]];
      if (legacyRaw !== '' && legacyRaw !== null && legacyRaw !== undefined && Number.isFinite(Number(legacyRaw))) return Number(legacyRaw) * legacy[1];
    }
    const saved = settings?.modelRates?.[key];
    const raw = saved && typeof saved === 'object' ? saved.value : saved;
    const current = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(current)) {
      const lowRaw = saved && typeof saved === 'object' ? Number(saved.low) : NaN;
      const highRaw = saved && typeof saved === 'object' ? Number(saved.high) : NaN;
      if (Number.isFinite(lowRaw) && Number.isFinite(highRaw)) return Math.min(Math.max(lowRaw, highRaw), Math.max(Math.min(lowRaw, highRaw), current));
      return current;
    }
    const shared = RATE_REGISTRY?.getRate?.(key, settings, 'resourceRates')?.value;
    if (Number.isFinite(Number(shared))) return Number(shared);
    const def = RATE_REGISTRY?.defaults?.[key]?.value;
    return Number.isFinite(Number(def)) ? Number(def) : fallback;
  }
  function calcQuantity(line, project, settings, overrides, context) {
    const override = overrides && overrides[line.code];
    if (override !== undefined && override !== null && override !== '' && Number.isFinite(Number(override)) && Number(override) >= 0) {
      return { qty: Number(override), source: 'override', note: 'كمية أدخلها المستخدم يدويًا' };
    }
    const area = Math.max(0, Number(project.area) || 0);
    const floors = Math.max(0, Number(project.floors) || 0);
    const gross = getGrossArea(project);
    const rooms = Math.max(0, Number(project.rooms) || 0);
    const units = Math.max(1, Number(project.unitsPerFloor) || 1);
    const baths = Math.max(0, Number(project.bathrooms) || 0);
    const factor = Number(line.factor || 0);
    switch (line.quantityRule) {
      case 'gross_area_factor': return { qty: factor * gross, source: 'formula', note: line.assumption || `المسطحات الإجمالية × ${factor}` };
      case 'floor_area_factor': return { qty: factor * area, source: 'formula', note: line.assumption || `مساحة الدور × ${factor}` };
      case 'per_100m2': return { qty: gross / 100, source: 'formula', note: 'معادلة مرجعية لكل 100 م² مسطحات؛ لا تمثل حصرًا تفصيليًا' };
      case 'steel_ton': {
        const aboveRate = sharedRateValue(settings, 'steelKgPerM2', Number(settings.steelFactor || 0) * 1000) / 1000;
        const basementRate = sharedRateValue(settings, 'basementSteelKgPerM2', Number(settings.basementSteelFactor || 0) * 1000) / 1000;
        // `floors` describes above-grade floors; a basement checkbox adds one separate footprint rather than changing every floor's factor.
        const qty = gross * aboveRate + (project.basement ? area * basementRate : 0);
        return { qty, source: 'benchmark', note: project.basement ? `فوق الأرض ${Math.round(aboveRate*1000)} كجم/م² + بدروم تقديري ${Math.round(basementRate*1000)} كجم/م² على بصمة دور واحد؛ ليس تفريدًا إنشائيًا` : `معدل استرشادي ${Math.round(aboveRate * 1000)} كجم/م²؛ ليس حصرًا إنشائيًا` };
      }
      case 'concrete_m3': {
        const aboveRate = sharedRateValue(settings, 'concreteM3PerM2', Number(settings.concreteFactor || 0));
        const basementRate = sharedRateValue(settings, 'basementConcreteM3PerM2', Number(settings.basementConcreteFactor || 0));
        const qty = gross * aboveRate + (project.basement ? area * basementRate : 0);
        return { qty, source: 'benchmark', note: project.basement ? `فوق الأرض ${aboveRate} م³/م² + بدروم تقديري ${basementRate} م³/م² على بصمة دور واحد؛ راجع اللوحات` : `معدل استرشادي ${aboveRate} م³/م²؛ يحتاج مراجعة المخططات` };
      }
      case 'floor_finish': return { qty: gross * factor, source: 'benchmark', note: `صافي افتراضي للأرضيات ${Math.round(factor * 100)}% من المسطحات قبل مراجعة الفراغات` };
      case 'paint_surface': return { qty: gross * factor, source: 'benchmark', note: `${factor} م² أسطح دهان لكل م² مسطح بناء؛ فرضية أولية قابلة للمعايرة` };
      case 'doors_by_rooms':
        if (project.type === 'commercial' || !rooms) return { qty: null, source: 'manual', note: 'يحتاج حصر الأبواب من المخطط التجاري' };
        const internalDoorsPerUnit = Math.max(0, Math.ceil(rooms + baths + (project.kitchen ? 1 : 0)));
        return { qty: internalDoorsPerUnit * units * floors, source: 'benchmark', note: `${internalDoorsPerUnit} باب داخلي/وحدة = عدد الغرف + الحمامات + باب المطبخ؛ × ${units} وحدة/دور × ${floors} أدوار. يجب تأكيد العدد من جدول الأبواب.` };
      case 'bathroom_sets': return { qty: baths * units * floors, source: 'user_template', note: `عدد الحمامات المدخل لكل وحدة × الوحدات/الدور × الأدوار` };
      case 'rooms_units':
        if (project.type === 'commercial' || !rooms) return { qty: null, source: 'manual', note: 'يحتاج حصرًا حسب البرنامج المعماري' };
        return { qty: factor * rooms * units * floors, source: 'benchmark', note: 'عدد الوحدات/الغرف افتراض تخطيطي وليس حصرًا نهائيًا' };
      case 'ac_units':
        if (!project.ac) return { qty: 0, source: 'option_off', note: 'التكييف غير مختار' };
        if (project.type === 'commercial' || !rooms) return { qty: null, source: 'manual', note: 'عدد وحدات التكييف يحتاج تحديدًا' };
        return { qty: Math.ceil(factor * rooms * units * floors), source: 'benchmark', note: 'عدد وحدات تأسيس تقديري؛ يؤكد مع العميل' };
      case 'fixed_one': return { qty: 1, source: 'fixed', note: line.assumption || 'مرة واحدة لكل مشروع' };
      case 'per_room_unit': return { qty: factor * rooms * units * floors, source: 'benchmark', note: line.assumption || 'معدل نموذجي يحتاج معايرة' };
      case 'manual':
      default: return { qty: null, source: 'manual', note: line.assumption || 'أدخل الكمية من الحصر أو المخططات؛ لا يمكن استنتاجها بأمان من المساحة وحدها' };
    }
  }

  function buildSchedule(project, rows, settings) {
    const pkg = project.pack || 'medium';
    const modelRate = (key, fallback) => { const saved=settings?.modelRates?.[key]; const n=saved&&saved.value!==undefined&&saved.value!==null&&saved.value!==''?Number(saved.value):NaN; return Number.isFinite(n)&&n>=0?n:(RATE_REGISTRY?.defaults?.[key]?.value ?? fallback); };
    const tileFactor=modelRate('floorTileM2PerM2Apartment',0.75);
    const paintSurfaceFactor=modelRate('plasterM2PerM2Built',RATE_REGISTRY?.defaults?.paintSurfaceM2PerM2Built?.value ?? 2.2);
    const tileWastePercent=Number.isFinite(Number(settings?.tileWastePercent))?Number(settings.tileWastePercent):(RATE_REGISTRY?.getRate?.('tileWaste',settings,'resourceRates')?.value ?? 7.5);
    const selectedSteel = project.steelChoice || 'حديد استثماري';
    const concreteName = `خرسانة جاهزة ${project.concreteGrade || 'C25'}`;
    const floorDefaults = {
      economic: 'سيراميك أرضيات 50×50', semi: 'سيراميك أرضيات 50×50',
      medium: 'بورسلين', luxury: 'سيراميك كليوباترا'
    };
    const floorName = project.flooringChoice || floorDefaults[pkg] || floorDefaults.medium;
    const doorRules = {
      economic: ['باب خشبي داخلي اقتصادي', 'أبواب داخلية'],
      semi: [], medium: ['باب خشبي داخلي متوسط', 'أبواب داخلية'],
      luxury: ['باب خشبي داخلي فاخر', 'أبواب داخلية']
    };
    const sanitaryRules = {
      economic: ['أطقم صحية — اقتصادي', 'طقم صحي كامل للحمام'],
      semi: [], medium: ['أطقم صحية — متوسط', 'طقم صحي كامل للحمام'],
      luxury: ['أطقم صحية — فاخر', 'طقم صحي كامل للحمام']
    };
    const windowRules = {
      economic: ['شبابيك ألوميتال السعد — اقتصادي', 'شبابيك ألوميتال'],
      semi: ['شبابيك ألوميتال السعد — اقتصادي', 'شبابيك ألوميتال'],
      medium: ['شبابيك ألوميتال PS صغير', 'شبابيك ألوميتال'],
      luxury: ['شبابيك ألوميتال جامبو', 'شبابيك ألوميتال']
    };
    const kitchenRules = {
      economic: ['مطبخ ألوميتال سنجل فايبر'], semi: ['مطبخ ألوميتال سنجل فايبر'],
      medium: ['مطبخ ألوميتال دبل فايبر'], luxury: ['مطبخ ألوميتال كلادينج']
    };
    const inFinish = project.scope !== 'structure';
    const inStructure = project.scope !== 'finishing';
    const rowsOut = [];
    function add({ code, title, category, scope, priceName, choiceRow, quantityRule, factor = 0, unit, assumption, required = true, optionKey, turnkeyOnly = false, packages, alternative = false, wastePercent = 0 }) {
      if (packages && !packages.includes(pkg)) return;
      const shell = { code, title, category, scope, quantityRule, factor, unit, assumption, required, optionKey, turnkeyOnly };
      if (!scopeAllowed(shell, project)) return;
      let row = choiceRow || (priceName ? findByName(rows, priceName) : null);
      if (!row && priceName) {
        row = rows.find(r => normalizeArabic(r.name).includes(normalizeArabic(priceName))) || null;
      }
      const q = calcQuantity({ ...shell, quantityRule, factor }, project, settings, project.manualQuantities || {}, {});
      const qty = q.qty;
      const hasPrice = rowHasPrice(row) && Number.isFinite(Number(row.avg)) && Number(row.avg) > 0;
      const price = hasPrice ? Number(row.avg) : null;
      const priceLow = hasPrice ? (row.low !== null && row.low !== undefined && row.low !== '' && Number.isFinite(Number(row.low)) ? Number(row.low) : price) : null;
      const priceHigh = hasPrice ? (row.high !== null && row.high !== undefined && row.high !== '' && Number.isFinite(Number(row.high)) ? Number(row.high) : price) : null;
      const billableQty = qty === null ? null : qty * (1 + Math.max(0, Number(wastePercent) || 0) / 100);
      const cost = billableQty !== null && price !== null ? billableQty * price : null;
      const costLow = billableQty !== null && priceLow !== null ? billableQty * priceLow : null;
      const costHigh = billableQty !== null && priceHigh !== null ? billableQty * priceHigh : null;
      const stale = row ? rowIsStale(row, settings.staleDays) : true;
      const rowStatus = row ? row.status : 'missing';
      const rowClassification = classifyPriceRow(row || { name: title || priceName, category: category || '' });
      const warnings = [];
      if (!row) warnings.push('سجل السعر غير موجود في الكتالوج');
      else if (!hasPrice) warnings.push('السعر غير مدخل');
      if (stale && hasPrice) warnings.push('السعر قديم أو تاريخه يحتاج مراجعة');
      if (row && row.status === 'national') warnings.push('بديل وطني وليس سعرًا محليًا مؤكدًا للأقصر');
      if (row && rowClassification.workType === 'material' && row.transport !== 'yes' && row.transport !== 'not-applicable') warnings.push(row.transport === 'no' ? 'النقل غير مشمول في السعر المسجل' : 'حالة شمول النقل غير معروفة');
      if (q.source === 'benchmark') warnings.push('الكمية استرشادية وليست حصرًا من الرسومات');
      if (qty === null) warnings.push('الكمية تحتاج إلى إدخال يدوي أو حصر من المخططات');
      rowsOut.push({
        code, title: title || (row && row.name) || priceName || code, category: category || (row && row.category) || 'غير مصنف',
        division: rowClassification.division,
        divisionCode: rowClassification.divisionCode,
        workType: rowClassification.workType,
        scope, quantity: qty, billableQuantity: billableQty, wastePercent: Math.max(0, Number(wastePercent) || 0), quantitySource: q.source, quantityNote: q.note, unit: unit || (row && row.unit) || '—',
        price, low: priceLow, high: priceHigh, status: rowStatus, source: row && row.source || 'لم يحدد مصدر سعر',
        date: row && row.date || null, confidence: row && row.confidence || 'ضعيفة', transport: row && row.transport || 'unknown',
        lineCost: cost, lineCostLow: costLow, lineCostHigh: costHigh, priced: hasPrice, stale, required, optionKey: optionKey || null, priceId: row && row.id || null,
        warnings, assumption: assumption || '', editableQuantity: true, priceRowName: row && row.name || priceName || null,
        isAlternative: !!alternative
      });
    }
    // Structure and earthworks: mutually exclusive steel/concrete selections prevent duplicate material families.
    if (inStructure) {
      add({ code: '03.01', title: 'حديد التسليح — الاختيار المحدد', category: 'الهيكل الخرساني', scope: 'structure', choiceRow: findByName(rows, selectedSteel), priceName: selectedSteel, quantityRule: 'steel_ton', unit: 'طن', assumption: 'اختيار ماركة واحدة فقط؛ الكمية بمعدل طن/م² استرشادي', required: true });
      add({ code: '03.02', title: `الخرسانة الجاهزة ${project.concreteGrade || 'C25'}`, category: 'الهيكل الخرساني', scope: 'structure', priceName: concreteName, quantityRule: 'concrete_m3', unit: 'م³', assumption: 'درجة الخرسانة اختيار المستخدم؛ المقاومة النهائية يحددها المصمم الإنشائي', required: true });
      add({ code: '03.03', title: 'مضخة الخرسانة', category: 'الهيكل الخرساني', scope: 'structure', priceName: 'مضخة خرسانة', quantityRule: 'fixed_one', unit: 'مشروع', assumption: 'تحقق من طريقة التسعير: بالمقطوعية أو بالساعة/المتر المكعب', required: true });
      add({ code: '03.04', title: 'الشدة الخشبية أو المعدنية', category: 'الهيكل الخرساني', scope: 'structure', priceName: 'شدة خشبية / موسكي', quantityRule: 'manual', unit: 'م³', assumption: 'يلزم تحديد نظام الشدة والكمية من المخططات وطريقة التعاقد', required: true });
      add({ code: '08.01', title: 'مصنعية نجارة مسلحة / شدة', category: 'المصنعيات والعمالة', scope: 'structure', priceName: 'مصنعية نجارة مسلحة', quantityRule: 'manual', unit: 'م²', assumption: 'كمية الشدة تحصر من عناصر الخرسانة ولا تساوي مساحة الأدوار تلقائيًا', required: true });
      add({ code: '08.02', title: 'مصنعية حدادة مسلحة', category: 'المصنعيات والعمالة', scope: 'structure', priceName: 'مصنعية حدادة مسلحة', quantityRule: 'steel_ton', unit: 'طن', assumption: 'تستخدم كمية الحديد الاسترشادية نفسها لغرض الموازنة فقط', required: true });
      add({ code: '08.03', title: 'مصنعية صب الخرسانة', category: 'المصنعيات والعمالة', scope: 'structure', priceName: 'مصنعية صب خرسانة', quantityRule: 'concrete_m3', unit: 'م³', assumption: 'تستخدم كمية الخرسانة الاسترشادية نفسها لغرض الموازنة فقط', required: true });
      add({ code: '02.01', title: 'حفر آلي بالحفار', category: 'الحفر والأساسات', scope: 'earth', priceName: 'حفر آلي بالحفار', quantityRule: 'manual', unit: 'م³', assumption: 'تحتاج أبعاد الحفر ومنسوب التأسيس ونوع التربة؛ لا تستنتج من المساحة وحدها', required: true });
      add({ code: '02.02', title: 'نقل ناتج الحفر', category: 'الحفر والأساسات', scope: 'earth', priceName: 'نقل ناتج الحفر', quantityRule: 'manual', unit: 'م³', assumption: 'حسب الحجم ومسافة النقل ورسوم التخلص', required: true });
      add({ code: '02.03', title: 'ردم ودك', category: 'الحفر والأساسات', scope: 'earth', priceName: 'ردم ودك', quantityRule: 'manual', unit: 'م³', assumption: 'يحدد من مناسيب الموقع وحجم الردم ونوع مادة الردم', required: true });
      add({ code: '02.04', title: 'اختبار التربة', category: 'الحفر والأساسات', scope: 'earth', priceName: 'اختبار تربة', quantityRule: 'fixed_one', unit: 'مشروع', assumption: 'النطاق والعدد وفق متطلبات المشروع والمهندس المختص', required: true });
      add({ code: '03.05', title: 'العزل المائي للأساسات', category: 'الهيكل الخرساني', scope: 'structure', priceName: 'بيتومين / رولات عزل', quantityRule: 'manual', unit: 'م²', assumption: 'الكمية بحسب تفاصيل الأساسات والبدروم ونظام العزل', required: !!project.basement });
    }
    // Masonry/plaster requires a drawing-based take-off; available unit rates may be used once quantity is entered.
    if (inFinish) {
      add({ code: '04.01', title: 'مباني بالطوب الأحمر', category: 'المباني والبياض', scope: 'finishing', priceName: 'طوب أحمر طفلي مثقب', quantityRule: 'manual', unit: 'ألف طوبة', assumption: 'تحتاج حصر الحوائط وخصم الفتحات وتحديد سمك الحائط', required: true });
      add({ code: '04.02', title: 'مونة المباني والبياض', category: 'المباني والبياض', scope: 'finishing', priceName: 'مونة أسمنت ورمل', quantityRule: 'manual', unit: 'م³', assumption: 'تحدد من مساحة الحوائط وسمك الطبقات ونسب الخلط', required: true });
      add({ code: '04.03', title: 'مصنعية المحارة والبياض', category: 'المباني والبياض', scope: 'finishing', priceName: 'مصنعية المحارة والبياض', quantityRule: 'manual', unit: 'م²', assumption: 'حصر وجهي الحوائط والأسقف وفق الرسومات', required: true });
      if (project.pack !== 'semi') {
        const tileChoice = findByName(rows, floorName) || findByName(rows, floorDefaults[pkg]);
        add({ code: '07.01', title: 'توريد بلاط الأرضيات — بديل واحد', category: 'التشطيبات', scope: 'finishing', choiceRow: tileChoice, priceName: floorName, quantityRule: 'floor_finish', factor: tileFactor, wastePercent: tileWastePercent, unit: 'م²', assumption: `صافي أرضيات مبدئي ${Math.round(tileFactor*100)}% من مساحة الشقة/المسطحات بحسب النموذج، ثم ${tileWastePercent}% هالك شراء على التوريد فقط؛ يلزم قياس الأرضيات الفعلي`, required: true });
        add({ code: '08.04', title: 'مصنعية تركيب بلاط الأرضيات', category: 'المصنعيات والعمالة', scope: 'labor', priceName: 'مصنعية سيراميك', quantityRule: 'floor_finish', factor: tileFactor, unit: 'م²', assumption: `المصنعية على المساحة الصافية ${Math.round(tileFactor*100)}% فقط دون هالك شراء`, required: true });
        add({ code: '07.02', title: 'دهانات داخلية', category: 'التشطيبات', scope: 'finishing', priceName: 'دهانات داخلية', quantityRule: 'paint_surface', factor: paintSurfaceFactor, unit: 'م²', assumption: `معامل ${paintSurfaceFactor} م² سطح دهان/م² مسطح؛ استبدله بالحصر الفعلي لأسطح الحوائط والأسقف`, required: true });
        const doorRow = pickPackageRow(rows, {
          economic: ['باب خشبي داخلي اقتصادي', 'أبواب داخلية'], semi: [],
          medium: ['باب خشبي داخلي متوسط', 'أبواب داخلية'], luxury: ['باب خشبي داخلي فاخر', 'أبواب داخلية']
        }, pkg);
        if (doorRow) add({ code: '07.03', title: 'أبواب داخلية — حسب الباقة', category: 'التشطيبات', scope: 'finishing', choiceRow: doorRow, priceName: doorRow.name, quantityRule: 'doors_by_rooms', factor: 1, unit: 'باب', assumption: 'عدد الأبواب الداخلية تقديرًا = الغرف + الحمامات + باب المطبخ لكل وحدة؛ عدد صحيح ويجب مراجعته من جدول الأبواب', required: true, packages: ['economic', 'medium', 'luxury'] });
        const windows = pickPackageRow(rows, windowRules, pkg);
        if (windows) add({ code: '07.04', title: 'شبابيك — حسب الباقة', category: 'التشطيبات', scope: 'finishing', choiceRow: windows, priceName: windows.name, quantityRule: 'manual', unit: 'م²', assumption: 'يلزم جدول الشبابيك ومقاساتها؛ مساحة المسطحات لا تحدد مساحة الزجاج بدقة', required: true });
        add({ code: '07.05', title: 'سيراميك حوائط الحمامات والمطبخ', category: 'التشطيبات', scope: 'finishing', priceName: 'سيراميك حوائط 25×50', quantityRule: 'manual', unit: 'م²', assumption: 'حصر حسب عدد الحمامات وارتفاع التكسية ومقاسات المطبخ', required: true });
        add({ code: '07.06', title: 'رخام / جرانيت للسلالم والأسطح', category: 'التشطيبات', scope: 'finishing', priceName: 'رخام / جرانيت', quantityRule: 'manual', unit: 'م²', assumption: 'حسب السلالم والبسطات والأسطح المختارة', required: false });
        add({ code: '07.07', title: 'أسقف جبسية / جبس بورد', category: 'التشطيبات', scope: 'finishing', priceName: 'جبس / أسقف مستعارة', quantityRule: 'manual', unit: 'م²', assumption: 'يُدخل فقط إذا كانت ضمن مواصفات الباقة؛ يلزم حصر المساحة', required: false });
      }
      // Electrical and plumbing composite budget lines avoid double-counting individual cables/pipes.
      add({ code: '05.01', title: 'خامات كهرباء — مرجع لكل 100 م²', category: 'الكهرباء', scope: 'electrical', priceName: 'خامات كهرباء لشقة 100 م² — مرجعي', quantityRule: 'per_100m2', unit: 'وحدة مرجعية / 100 م²', assumption: 'مقارنة أولية من سجل مرجعي؛ لا تجمع معها أسعار الأسلاك والمواسير واللوحات المفردة', required: true });
      add({ code: '08.05', title: 'مصنعية كهرباء', category: 'المصنعيات والعمالة', scope: 'electrical', priceName: 'مصنعية كهرباء', quantityRule: 'manual', unit: 'نقطة', assumption: 'أدخل عدد النقاط من المخطط الكهربائي؛ لا يوجد عدد نقاط موثق للمساحة الحالية', required: true });
      add({ code: '06.01', title: 'خامات سباكة — معدل مرجعي للمتر المسطح', category: 'السباكة والصرف', scope: 'plumbing', priceName: 'خامات سباكة للمتر', quantityRule: 'gross_area_factor', factor: 1, unit: 'م²', assumption: 'سعر مرجعي وطني قديم؛ يستلزم تحديثًا محليًا ومراجعة نطاق ما يشمله', required: true });
      if (pkg !== 'semi') {
        const sanitary = pickPackageRow(rows, sanitaryRules, pkg);
        if (sanitary) add({ code: '06.02', title: 'أطقم صحية — حسب الباقة', category: 'السباكة والصرف', scope: 'plumbing', choiceRow: sanitary, priceName: sanitary.name, quantityRule: 'bathroom_sets', unit: 'طقم حمام', assumption: 'عدد الحمامات حسب البيانات أو القيمة الافتراضية الظاهرة؛ تحقق قبل الاعتماد', required: true, packages: ['economic', 'medium', 'luxury'] });
      }
      if (project.sewerConnection) add({ code: '06.03', title: 'وصلة الصرف العام', category: 'السباكة والصرف', scope: 'plumbing', priceName: 'توصيل صرف عام', quantityRule: 'fixed_one', unit: 'وصلة', assumption: 'يتوقف على إتاحة الشبكة والاشتراطات المحلية', required: true });
    }
    // Explicit optional choices.
    if (project.kitchen && inFinish) {
      const kitchen = pickPackageRow(rows, kitchenRules, pkg);
      if (kitchen) add({ code: '10.01', title: 'مطبخ — حسب الباقة', category: 'خيارات إضافية', scope: 'optional', optionKey: 'kitchen', choiceRow: kitchen, priceName: kitchen.name, quantityRule: 'manual', unit: kitchen.unit || 'م²', assumption: 'أدخل مساحة وحدات المطبخ حسب وحدة السعر المسجلة', required: true });
    }
    if (project.ac && inFinish) add({ code: '10.02', title: 'تأسيس تكييف', category: 'خيارات إضافية', scope: 'optional', optionKey: 'ac', priceName: 'تأسيس تكييف', quantityRule: 'ac_units', factor: 0.5, unit: 'وحدة', assumption: 'عدد تأسيسات مبدئي؛ يراجع حسب الغرف وخطة التكييف', required: true });
    if (project.elevator) add({ code: '09.01', title: 'توريد وتركيب أسانسير', category: 'الأسانسير', scope: 'special', optionKey: 'elevator', priceName: 'توريد وتركيب أسانسير 6–8 وقفات', quantityRule: 'fixed_one', unit: 'وحدة', assumption: 'السعة والوقفات والتجهيزات تحتاج عرضًا مطابقًا للمشروع', required: true });
    if (project.scope === 'turnkey') {
      add({ code: '01.01', title: 'التصميم المعماري والإنشائي', category: 'التكاليف غير المباشرة', scope: 'indirect', priceName: 'تصميم معماري وإنشائي', quantityRule: 'fixed_one', unit: 'مشروع', assumption: 'يشمل التصميم فقط وفق نطاق معتمد؛ لا يستنتج سعره من المساحة دون طريقة تسعير', required: true, turnkeyOnly: true });
      add({ code: '01.02', title: 'رسوم الترخيص والإجراءات', category: 'التكاليف غير المباشرة', scope: 'indirect', priceName: 'رسوم ترخيص وإجراءات بناء', quantityRule: 'fixed_one', unit: 'مشروع', assumption: 'تتغير بحسب الموقع والاشتراطات والرسوم الرسمية', required: true, turnkeyOnly: true });
      add({ code: '01.03', title: 'اختبارات الخرسانة والحديد', category: 'التكاليف غير المباشرة', scope: 'indirect', priceName: 'اختبارات خرسانة وحديد', quantityRule: 'fixed_one', unit: 'مشروع', assumption: 'النطاق وعدد الاختبارات يحدد حسب المواصفات والمشروع', required: true, turnkeyOnly: true });
      add({ code: '01.04', title: 'رسوم عدادات كهرباء ومياه وصرف', category: 'التكاليف غير المباشرة', scope: 'indirect', priceName: 'رسوم عداد كهرباء', quantityRule: 'fixed_one', unit: 'طلب/عداد', assumption: 'الرسوم الفعلية تحتاج تحققًا رسميًا بحسب الحالة', required: false, turnkeyOnly: true });
    }
    // De-duplicate using WBS code and ensure ordering by work breakdown structure.
    const unique = new Map();
    for (const line of rowsOut) unique.set(line.code, line);
    return [...unique.values()].sort((a, b) => a.code.localeCompare(b.code, 'en'));
  }

  function buildEstimate(project, rows, settings = {}, overrides = {}) {
    const cfg = { steelFactor: 0.08, concreteFactor: 0.35, basementSteelFactor: 0.075, basementConcreteFactor: 0.55, staleDays: 90, margin: 15, supervision: 10, ...settings };
    const p = { type: 'residential', pack: 'medium', scope: 'turnkey', floors: 1, area: 0, rooms: 3, unitsPerFloor: 1, bathrooms: 2, basement: false, elevator: false, kitchen: false, ac: false, sewerConnection: false, ...project };
    p.manualQuantities = overrides || p.manualQuantities || {};
    const lines = buildSchedule(p, rows || [], cfg);
    const pricedLines = lines.filter(l => l.quantity !== null && l.price !== null && l.lineCost !== null && Number.isFinite(l.lineCost));
    const directSubtotal = pricedLines.reduce((s, l) => s + l.lineCost, 0);
    const rangedLines = lines.filter(l => l.quantity !== null && l.quantity !== undefined && l.price !== null && l.lineCostLow !== null && l.lineCostHigh !== null);
    const directSubtotalLow = rangedLines.reduce((s, l) => s + l.lineCostLow, 0);
    const directSubtotalHigh = rangedLines.reduce((s, l) => s + l.lineCostHigh, 0);
    // Price and quantity gaps are independent. A line can need both; neither gap
    // should disappear merely because the other field is missing.
    const unresolvedPriceLines = lines.filter(l => l.required && !l.priced);
    const unresolvedQuantityLines = lines.filter(l => l.required && (l.quantity === null || l.quantity === undefined));
    const staleLines = lines.filter(l => l.stale && l.priced);
    const nationalLines = lines.filter(l => l.status === 'national' && l.priced);
    const estimatedLines = lines.filter(l => l.status === 'estimate' && l.priced);
    const localLines = lines.filter(l => l.status === 'local' && l.priced);
    const applicablePricedCount = lines.filter(l => l.priced).length;
    const priceCoverage = lines.length ? Math.round((lines.filter(l => l.priced).length / lines.length) * 100) : 0;
    const quantifiableCount = lines.filter(l => l.quantity !== null).length;
    const quantityCoverage = lines.length ? Math.round((quantifiableCount / lines.length) * 100) : 0;
    const amountCoverage = directSubtotal > 0 && (unresolvedPriceLines.length || unresolvedQuantityLines.length) ? 'جزئي — توجد فجوات' : directSubtotal > 0 ? 'جزئي — راجع الافتراضات' : 'غير متاح — لا توجد بنود كافية للتسعير';
    const feeRate = p.mode === 'supervision' ? Number(cfg.supervision) : Number(cfg.margin);
    const fee = directSubtotal * feeRate / 100;
    const total = directSubtotal + fee;
    const totalLow = directSubtotalLow * (1 + feeRate / 100);
    const totalHigh = directSubtotalHigh * (1 + feeRate / 100);
    const transportRiskLines = lines.filter(l => l.priced && (l.workType === 'material' || l.scope === 'optional') && l.transport !== 'yes' && l.transport !== 'not-applicable');
    const byDivision = {};
    for (const line of pricedLines) {
      const key = `${line.divisionCode} ${line.division}`;
      if (!byDivision[key]) byDivision[key] = { subtotal: 0, subtotalLow: 0, subtotalHigh: 0, lines: 0 };
      byDivision[key].subtotal += line.lineCost;
      byDivision[key].subtotalLow += line.lineCostLow == null ? line.lineCost : line.lineCostLow;
      byDivision[key].subtotalHigh += line.lineCostHigh == null ? line.lineCost : line.lineCostHigh;
      byDivision[key].lines += 1;
    }
    const riskCount = unresolvedPriceLines.length + unresolvedQuantityLines.length + staleLines.length + transportRiskLines.length;
    return {
      project: p, grossArea: getGrossArea(p), lines, pricedLines, directSubtotal, directSubtotalLow, directSubtotalHigh, fee, feeRate, total, totalLow, totalHigh,
      unresolvedPriceLines, unresolvedQuantityLines, staleLines, nationalLines, estimatedLines, localLines, transportRiskLines,
      priceCoverage, quantityCoverage, amountCoverage, byDivision, riskCount,
      isContractReady: lines.length > 0 && unresolvedPriceLines.length === 0 && unresolvedQuantityLines.length === 0 && staleLines.length === 0 && nationalLines.length === 0 && estimatedLines.length === 0 && transportRiskLines.length === 0
    };
  }

  function auditCatalog(rows, settings = {}, now = new Date()) {
    const active = (rows || []).filter(r => r.active !== false);
    const priced = active.filter(rowHasPrice);
    const local = priced.filter(r => r.status === 'local');
    const national = priced.filter(r => r.status === 'national');
    const estimate = priced.filter(r => r.status === 'estimate');
    const missing = active.filter(r => !rowHasPrice(r));
    const stale = priced.filter(r => rowIsStale(r, settings.staleDays || 90, now));
    const noQuantityRule = active.filter(r => r.calc && !(Number(r.factor) > 0) && r.qtyMode !== 'fixed' && r.qtyMode !== 'manual');
    const byDivision = {};
    for (const row of active) {
      const d = classifyPriceRow(row);
      if (!byDivision[d.divisionCode]) byDivision[d.divisionCode] = { code: d.divisionCode, name: d.division, total: 0, priced: 0, missing: 0, stale: 0 };
      const item = byDivision[d.divisionCode]; item.total++;
      if (rowHasPrice(row)) item.priced++; else item.missing++;
      if (rowHasPrice(row) && rowIsStale(row, settings.staleDays || 90, now)) item.stale++;
    }
    return { total: active.length, priced: priced.length, local: local.length, national: national.length, estimate: estimate.length, missing: missing.length, stale: stale.length, noQuantityRule: noQuantityRule.length, byDivision: Object.values(byDivision).sort((a, b) => a.code.localeCompare(b.code)) };
  }

  function parseProjectText(text) {
    const t = normalizeArabic(text), result = {}, found = [];
    function set(k, v, label) { if (v !== undefined && v !== null) { result[k] = v; found.push(label); } }
    let m = t.match(/(?:مساحه\s*(?:الدور(?:\s*الواحد)?|الطابق(?:\s*الواحد)?)|مسطح\s*(?:الدور|الطابق)|الدور\s*(?:مساحته|مساحه))\s*(?:هي|حوالي|تقريبا|=|:)?\s*(\d{2,7}(?:\.\d+)?)/);
    if (m) set('area', Number(m[1]), `مساحة الدور ${m[1]} م²`);
    let total = t.match(/(?:اجمالي\s*(?:مسطحات|مساحه|المسطحات|المساحه)|المساحه\s*(?:الاجماليه|الكليه)|مساحه\s*(?:المبنى|المبني|المشروع|العماره\s*كلها))\s*(?:هي|حوالي|تقريبا|=|:)?\s*(\d{2,7}(?:\.\d+)?)/);
    if (total) set('totalArea', Number(total[1]), `إجمالي المسطحات ${total[1]} م²`);
    m = t.match(/(\d{1,2})\s*(?:ادوار|دور|طوابق|طابق)/g);
    if (m && m.length) { const n = m[m.length - 1].match(/\d+/); if (n) set('floors', Number(n[0]), `عدد الأدوار ${n[0]}`); }
    if (/تجاري|اداري|محلات|مكاتب/.test(t)) set('type', 'commercial', 'نوع المشروع تجاري/إداري');
    else if (/سكني|عماره|شقه|فيلا/.test(t)) set('type', 'residential', 'نوع المشروع سكني');
    if (/هيكل فقط|عظم فقط|خرسانه فقط/.test(t)) set('scope', 'structure', 'النطاق الهيكل فقط');
    else if (/تشطيب فقط/.test(t)) set('scope', 'finishing', 'النطاق التشطيب فقط');
    else if (/على المفتاح|علي المفتاح|هيكل وتشطيب|كامل/.test(t)) set('scope', 'turnkey', 'النطاق على المفتاح');
    if (/اقتصادي/.test(t)) set('pack', 'economic', 'باقة اقتصادي');
    else if (/نصف تشطيب|نص تشطيب/.test(t)) set('pack', 'semi', 'باقة نصف تشطيب');
    else if (/فاخر|لوكس|فخم/.test(t)) set('pack', 'luxury', 'باقة فاخر');
    else if (/متوسط/.test(t)) set('pack', 'medium', 'باقة متوسط');
    const roomMatch = t.match(/(?:غرفتين|غرفهين|2\s*غرف|2\s*غرفات)/) ? 2 : t.match(/(?:3\s*غرف|ثلاث غرف|تلات غرف)/) ? 3 : t.match(/(?:4\s*غرف|اربع غرف|اربعه غرف)/) ? 4 : null;
    if (roomMatch) set('rooms', roomMatch, `نموذج ${roomMatch} غرف`);
    const unitMatch = t.match(/(\d+)\s*(?:وحدات|شقق)\s*(?:في|بال|لكل)?\s*الدور|(\d+)\s*(?:وحدة|شقه)\s*(?:في|بال|لكل)?\s*الدور/);
    if (unitMatch) { const n = Number(unitMatch[1] || unitMatch[2]); if (n > 0 && n <= 30) set('unitsPerFloor', n, `${n} وحدات/شقق في الدور`); }
    const bathsMatch = t.match(/(\d+)\s*(?:حمامات|حمام)/);
    if (bathsMatch) set('bathrooms', Number(bathsMatch[1]), `عدد الحمامات ${bathsMatch[1]}`);
    const yes = /(?:بدروم\s*(?:نعم|موجود)|مع\s*بدروم|يوجد\s*بدروم)/.test(t);
    const no = /(?:بدون\s*بدروم|من\s*غير\s*بدروم|لا\s*يوجد\s*بدروم)/.test(t);
    if (yes) set('basement', true, 'بدروم موجود'); else if (no) set('basement', false, 'بدون بدروم');
    const elevatorYes = /(?:مع\s*(?:اسانسير|مصعد)|يوجد\s*(?:اسانسير|مصعد)|اسانسير\s*(?:نعم|موجود))/.test(t);
    const elevatorNo = /(?:بدون\s*(?:اسانسير|مصعد)|من\s*غير\s*(?:اسانسير|مصعد)|لا\s*يوجد\s*(?:اسانسير|مصعد))/.test(t);
    if (elevatorYes) set('elevator', true, 'أسانسير مطلوب'); else if (elevatorNo) set('elevator', false, 'بدون أسانسير');
    if (/مع\s*مطبخ|اضافه\s*مطبخ|مطبخ\s*نعم/.test(t)) set('kitchen', true, 'المطبخ مطلوب');
    if (/بدون\s*مطبخ|مطبخ\s*لا/.test(t)) set('kitchen', false, 'المطبخ غير مطلوب');
    if (/تكييف\s*(?:نعم|موجود)|مع\s*تكييف|تأسيس\s*تكييف/.test(t)) set('ac', true, 'تأسيس التكييف مطلوب');
    if (/بدون\s*تكييف|تكييف\s*لا/.test(t)) set('ac', false, 'تأسيس التكييف غير مطلوب');
    if (/شامل|مقاول شامل/.test(t)) set('mode', 'comprehensive', 'نمط شامل');
    if (/اشراف|إشراف/.test(t)) set('mode', 'supervision', 'نمط إشراف');
    return { values: result, found, normalized: t };
  }

  function nextAction(project, intent, estimate) {
    if (intent === 'price_lookup') return { action: 'lookup_price', reason: 'الطلب يتضمن استعلامًا سعريًا؛ لا ينبغي تغيير حالة المشروع.' };
    if (intent === 'audit') return { action: 'audit_catalog', reason: 'الطلب متعلق بجودة المعرفة أو الأسعار الناقصة.' };
    if (intent === 'compare') return { action: 'compare_options', reason: 'الطلب يتطلب مقارنة سجلات متوافقة في المواصفات والوحدة.' };
    const missing = [];
    if (!(Number(project.area) > 0)) missing.push('مساحة الدور');
    if (!(Number(project.floors) > 0)) missing.push('عدد الأدوار');
    if (!project.type) missing.push('نوع المشروع');
    if (!project.scope) missing.push('نطاق المقايسة');
    if (project.type === 'residential' && project.scope !== 'structure' && !project.rooms) missing.push('نموذج الشقة');
    if (project.scope !== 'structure' && !project.pack) missing.push('باقة التشطيب');
    if (project.basement === null || project.basement === undefined) missing.push('حالة البدروم');
    if (project.elevator === null || project.elevator === undefined) missing.push('حالة الأسانسير');
    if (missing.length) return { action: 'ask_missing_fact', fields: missing, reason: `لا يمكن تكوين حالة مشروع مستقرة قبل معرفة: ${missing.join('، ')}.` };
    if (!estimate) return { action: 'run_preflight', reason: 'البيانات الأساسية مكتملة؛ افحص جاهزية الكميات والأسعار قبل إعلان أي إجمالي.' };
    if (estimate.unresolvedPriceLines.length || estimate.unresolvedQuantityLines.length) return { action: 'explain_gaps', reason: 'التقدير يظل جزئيًا لوجود أسعار أو كميات ناقصة؛ اعرض الفجوات وخطوة استكمالها.' };
    if (estimate.staleLines.length || estimate.nationalLines.length || estimate.estimatedLines.length) return { action: 'quality_review', reason: 'البنود قابلة للجمع حسابيًا، لكن جودة بعض الأسعار أو مصادرها تتطلب مراجعة قبل الاعتماد.' };
    return { action: 'present_estimate', reason: 'اجتازت البنود فحوص الجاهزية الأساسية؛ يظل الاعتماد النهائي مشروطًا بالمراجعة الهندسية.' };
  }

  return { DIVISIONS, PACKAGE_LABELS, SCOPE_LABELS, normalizeArabic, classifyPriceRow, rowHasPrice, rowIsStale, findByName, buildSchedule, buildEstimate, auditCatalog, parseProjectText, nextAction };
});
