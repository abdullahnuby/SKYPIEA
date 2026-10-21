(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MIYAR_DIALOGUE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODEL_LABELS = {
    'APT-BRICK': 'تشطيب شقة على الطوب',
    'APT-PLASTER': 'تشطيب شقة على المحارة',
    'APT-PLASTER-MEP': 'شقة بمحارة وتمديدات مكتملة',
    'APT-PAINT': 'شقة جاهزة للدهان',
    'APT-PARTIAL': 'استكمال تشطيب جزئي',
    'BLD-NEW-RES': 'عمارة سكنية جديدة',
    'BLD-NEW-COM': 'عمارة تجارية/إدارية',
    'BLD-NEW-MIX': 'عمارة مختلطة سكني وتجاري',
    'BLD-STRUCTURE': 'هيكل ومباني فقط',
    'BLD-FINISH': 'تشطيب عمارة قائمة'
  };
  const PACKAGE_LABELS = { economic: 'اقتصادي', semi: 'نصف تشطيب', medium: 'متوسط', luxury: 'فاخر' };
  const YES = /^(?:اه|ايوه|ايوا|نعم|تمام|موافق|ماشي|موجود|موجوده|yes|y|حاضر|صحيح|بالظبط|بالضبط)$/;
  const NO = /^(?:لا|لأ|لأه|مش|مفيش|لايوجد|مش موجود|مش موجوده|بدون|منغير|no|n|غلط|مش صحيح)$/;

  function normalize(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
      .replace(/م²|م2|متر مربع/g, ' متر مربع ')
      .replace(/ج\.م/g, ' جنيه ')
      .replace(/\s+/g, ' ').trim();
  }
  function numberFrom(match) { if (!match) return null; const n = Number(String(match).replace(',', '.')); return Number.isFinite(n) ? n : null; }
  function freshState() {
    return {
      modelCode: null, projectKind: null, area: null, areaCandidate: null, areaBasis: null,
      floors: null, apartmentCount: 1, roomsPerApartment: null, bathrooms: null, unitsPerFloor: null,
      package: null, scope: null, basement: null, elevator: null, kitchen: false, ac: false,
      marginMode: 'comprehensive', quoteBasis: 'average', location: 'الأقصر', commonAreaPercent: null,
      pending: null, assumptions: [], started: false, lastIntent: null, touched: false,
      commercialGroundFloor: false, completed: {},
    };
  }
  function has(t, patterns) { return patterns.some(p => p.test(t)); }
  function parseModel(t, s, changes) {
    const before = s.modelCode;
    const building = /عماره|عمارة|مبني|مبنى|ادوار|طوابق|دور متكرر/.test(t);
    const apartment = /شقه|شقة|شقق|استوديو/.test(t);
    if (has(t, [/عماره\s*(?:سكنيه\s*و\s*تجاريه|مختلطه|مختلط)/, /سكني\s*و\s*تجاري/, /مختلطه/])) {
      s.modelCode = 'BLD-NEW-MIX'; s.projectKind = 'mixed';
    } else if (has(t, [/هيكل\s*فقط/, /عظم\s*فقط/, /خرسانه\s*فقط/, /اعمال\s*العظم/, /خرسانه\s*ومباني\s*فقط/, /هيكل\s*ومباني\s*فقط/]) && building) {
      s.modelCode = 'BLD-STRUCTURE'; s.projectKind = 'building'; s.scope = 'structure';
    } else if (has(t, [/تشطيب\s*عماره\s*(?:قائمه|موجوده)/, /عماره\s*قائمه.*تشطيب/, /استكمال\s*تشطيب\s*عماره/])) {
      s.modelCode = 'BLD-FINISH'; s.projectKind = 'building'; s.scope = 'finishing';
    } else if (building && has(t, [/تجاري/, /اداري/, /محلات/, /محل\s*تجاري/, /مكاتب/])) {
      s.modelCode = 'BLD-NEW-COM'; s.projectKind = 'building';
    } else if (building && has(t, [/عماره/, /مبني/, /مبنى/])) {
      s.modelCode = 'BLD-NEW-RES'; s.projectKind = 'building';
    } else if (apartment || has(t, [/تشطيب\s*شقه/, /شقه\s*على/, /جاهزه\s*للدهان/])) {
      s.projectKind = 'apartment';
      if (has(t, [/تشطيب\s*جزئي/, /استكمال\s*الناقص/, /اعمال\s*منفذه/])) s.modelCode = 'APT-PARTIAL';
      else if (has(t, [/جاهزه\s*للدهان/, /جاهز\s*للدهان/, /دهانات\s*فقط/])) s.modelCode = 'APT-PAINT';
      else if (has(t, [/تمديدات\s*(?:كامل|مكتمله)/, /محاره\s*و\s*(?:كهرباء|سباكه)/, /كهرباء\s*وسباكه\s*مكتمل/])) s.modelCode = 'APT-PLASTER-MEP';
      else if (has(t, [/على\s*المحاره/, /علي\s*المحاره/, /محاره\s*جاهزه/, /استلمتها\s*محاره/])) s.modelCode = 'APT-PLASTER';
      else if (has(t, [/على\s*الطوب/, /علي\s*الطوب/, /طوب\s*احمر/, /على\s*العظم.*شقه/])) s.modelCode = 'APT-BRICK';
    }
    if (s.modelCode && s.modelCode !== before) {
      changes.push(`حددت نوع الخدمة: ${MODEL_LABELS[s.modelCode]}.`);
      s.touched = true;
    }
    if (s.modelCode && s.modelCode.startsWith('APT-')) s.projectKind = 'apartment';
    if (s.modelCode && s.modelCode.startsWith('BLD-')) s.projectKind = 'building';
    return { building, apartment };
  }
  function parseNumbers(t, s, changes, context) {
    // Explicit total area first. Do not confuse it with one floor's area.
    const total = t.match(/(?:اجمالي\s*(?:مسطحات|المسطحات|المساحه|مساحه)|المساحه\s*(?:الاجماليه|الكليه)|مساحه\s*(?:المبنى|المبني|المشروع|العماره\s*كلها)|مسطحات\s*(?:المبنى|المبني|البناء))\s*(?:هي|حوالي|تقريبا|=|:)?\s*(\d{2,7}(?:\.\d+)?)/);
    const floor = t.match(/(?:مساحه\s*(?:كل\s*)?(?:الدور|الطابق)(?:\s*الواحد)?|مسطح\s*(?:كل\s*)?الدور|المسطح\s*لكل\s*دور|كل\s*دور)\s*(?:حوالي|تقريبا|هي|=|:)?\s*(\d{2,6}(?:\.\d+)?)/)
      || t.match(/(\d{2,6}(?:\.\d+)?)\s*(?:متر(?:\s*مربع)?|متر\s*مربع)\s*(?:لكل\s*دور|للدور|في\s*الدور)/)
      || t.match(/(\d{1,2})\s*[x×*]\s*(\d{2,6}(?:\.\d+)?)\s*(?:متر|متر\s*مربع|مربع|م\b)/);
    let areaMatch = null, basis = null, v = null;
    if (total) { areaMatch = total; basis = 'total'; v = numberFrom(total[1]); }
    else if (floor) { areaMatch = floor; basis = 'floor'; v = numberFrom(floor[2] && floor[0].includes('x') ? floor[2] : floor[1]); }
    else {
      const aptArea = t.match(/(?:مساحه\s*(?:الشقه|الوحده)|الشقه\s*(?:مساحتها|مساحه)|شقه)\s*(?:حوالي|تقريبا|هي|=|:)?\s*(\d{2,6}(?:\.\d+)?)/)
        || t.match(/(\d{2,6}(?:\.\d+)?)\s*(?:متر|متر\s*مربع|مربع|م\b)\s*(?:للشقه|للوحده)/);
      if (aptArea && (s.projectKind === 'apartment' || context.apartment)) { areaMatch = aptArea; basis = 'apartment'; v = numberFrom(aptArea[1]); }
      else {
        const generic = t.match(/(?:مساحه|مسطح)\s*(?:حوالي|تقريبا|هي|=|:)?\s*(\d{2,7}(?:\.\d+)?)\s*(?:متر(?:\s*مربع)?|مربع|م\b)?/)
          || t.match(/(\d{2,7}(?:\.\d+)?)\s*(?:متر\s*مربع|متر|م\b)/);
        if (generic) {
          v = numberFrom(generic[1]); areaMatch = generic;
          if (s.projectKind === 'apartment' || context.apartment) basis = 'apartment';
          else if (/(كل\s*دور|لكل\s*دور|مساحه\s*الدور|مسطح\s*الدور)/.test(t)) basis = 'floor';
          else basis = 'ambiguous';
        }
      }
    }
    if (v && v > 0 && v <= 1000000) {
      if (basis === 'total') {
        s.areaCandidate = v; s.areaBasis = 'total'; s.totalArea = v;
        if (s.floors) s.area = Number((v / s.floors).toFixed(2)); else s.area = null;
        changes.push(`سجلت إجمالي المسطحات ${v} م²${s.floors ? `، أي ${s.area} م² متوسط مسطح/دور حسب عدد الأدوار` : ''}.`);
      } else if (basis === 'floor' || basis === 'apartment') {
        s.area = v; s.areaCandidate = v; s.areaBasis = basis; s.totalArea = null;
        changes.push(`${basis === 'apartment' ? 'مساحة الشقة' : 'مساحة الدور'}: ${v} م².`);
      } else if (basis === 'ambiguous') {
        s.areaCandidate = v; s.area = null; s.areaBasis = null; s.pending = 'areaBasis';
        changes.push(`وجدت مساحة ${v} م²، لكن أساسها غير واضح؛ لن أفترض أنها للدور أو إجمالي المبنى.`);
      }
      s.touched = true;
    }
    // Handle floor counts in common Egyptian descriptions: أرضي + 3 متكرر = 4 levels above grade.
    const ground = t.match(/(?:ارضي|الدور\s*الارضي)\s*(?:\+|و)\s*(\d+)\s*(?:ادوار?\s*)?متكرر/);
    const floorCount = t.match(/(\d{1,2})\s*(?:ادوار|طوابق|طابق|دور(?:ات)?)/);
    if (ground) {
      const n = numberFrom(ground[1]); if (n > 0 && n < 60) { s.floors = n + 1; changes.push(`أرضي + ${n} متكرر = ${s.floors} أدوار فوق الأرض.`); }
    } else if (floorCount) {
      const n = numberFrom(floorCount[1]); if (n > 0 && n <= 60) { s.floors = n; changes.push(`عدد الأدوار: ${n}.`); }
    }
    // Recompute a stated gross total if the floor count arrived in this or a later message.
    if (s.areaBasis === 'total' && s.totalArea && s.floors) s.area = Number((s.totalArea / s.floors).toFixed(2));

    let rooms = null;
    if (/غرفتين|غرفتين نوم/.test(t)) rooms = 2;
    else if (/(?:اربع|اربعه|٤|4)\s*غرف|4\s*غرف/.test(t)) rooms = 4;
    else if (/(?:ثلاث|ثلاثه|تلات|٣|3)\s*غرف|3\s*غرف/.test(t)) rooms = 3;
    else if (/غرفه\s*واحده|غرفة واحدة|غرفه واحده/.test(t)) rooms = 1;
    if (rooms) { s.roomsPerApartment = rooms; changes.push(`نموذج الوحدة: ${rooms} غرف.`); s.touched = true; }

    const units = t.match(/(\d{1,2})\s*(?:شقق?|وحدات?)\s*(?:في|بال|لكل)\s*الدور|(?:في|بال|لكل)\s*الدور\s*(?:عدد\s*)?(\d{1,2})\s*(?:شقق?|وحدات?)/);
    if (units) { const n = numberFrom(units[1] || units[2]); if (n > 0 && n <= 30) { s.unitsPerFloor = n; changes.push(`عدد الوحدات في الدور: ${n}.`); s.touched = true; } }
    else if (/شقتين\s*(?:في|بال|لكل)\s*الدور|وحدتين\s*(?:في|بال|لكل)\s*الدور/.test(t)) { s.unitsPerFloor = 2; changes.push('عدد الوحدات في الدور: 2.'); s.touched = true; }
    else if (/ثلاث\s*شقق\s*(?:في|بال|لكل)\s*الدور/.test(t)) { s.unitsPerFloor = 3; changes.push('عدد الوحدات في الدور: 3.'); s.touched = true; }

    const aptCount = t.match(/(?:عدد\s*)?(\d{1,3})\s*(?:شقق|شقه|وحدات)\s*(?:متشابهه|متماثله|نفس\s*النموذج|في\s*المشروع)/);
    if (aptCount) { const n = numberFrom(aptCount[1]); if (n > 0 && n <= 500) { s.apartmentCount = n; changes.push(`عدد الوحدات المتشابهة: ${n}.`); s.touched = true; } }

    const bathrooms = t.match(/(\d{1,2})\s*(?:حمامات|حمام)(?:\s*(?:لكل|في)\s*وحده|\s*للوحده)?/);
    if (bathrooms && /(حمام|حمامات)/.test(t)) { const n = numberFrom(bathrooms[1]); if (n > 0 && n <= 8) { s.bathrooms = n; changes.push(`عدد الحمامات لكل وحدة: ${n}.`); s.touched = true; } }
  }
  function parseChoices(t, s, changes) {
    const beforePack = s.package;
    if (has(t, [/نصف\s*تشطيب/, /نص\s*تشطيب/, /اقتصادي/, /اقتصاديه/, /متوسط/, /متوسطه/, /فاخر/, /لوكس/, /فخم/, /luxury/])) {
      if (/نصف\s*تشطيب|نص\s*تشطيب/.test(t)) s.package = 'semi';
      else if (/اقتصادي|اقتصاديه/.test(t)) s.package = 'economic';
      else if (/فاخر|لوكس|فخم|luxury/.test(t)) s.package = 'luxury';
      else if (/متوسط|متوسطه/.test(t)) s.package = 'medium';
      if (s.package && s.package !== beforePack) changes.push(`باقة التشطيب: ${PACKAGE_LABELS[s.package]}.`);
    }
    if (has(t, [/على\s*المفتاح/, /علي\s*المفتاح/, /تسليم\s*مفتاح/, /كامل\s*من\s*الحفر/, /الهيكل\s*والتشطيب/, /شامل\s*كل\s*الاعمال/])) {
      s.scope = 'turnkey'; s.marginMode = /اشراف/.test(t) ? 'supervision' : 'comprehensive';
      if (s.modelCode && s.projectKind === 'building' && s.modelCode === 'BLD-STRUCTURE') s.modelCode = 'BLD-NEW-RES';
      changes.push('نطاق العمل: من البداية حتى التسليم على المفتاح.');
    } else if (has(t, [/هيكل\s*فقط/, /عظم\s*فقط/, /خرسانه\s*فقط/, /اعمال\s*العظم/, /هيكل\s*ومباني\s*فقط/])) {
      s.scope = 'structure'; if (s.projectKind === 'building') s.modelCode = 'BLD-STRUCTURE';
      changes.push('نطاق العمل: الهيكل والمباني فقط؛ استبعدت التشطيبات النهائية.');
    } else if (has(t, [/تشطيب\s*فقط/, /اعمال\s*التشطيب\s*فقط/])) {
      s.scope = 'finishing'; if (s.projectKind === 'building') s.modelCode = 'BLD-FINISH';
      changes.push('نطاق العمل: التشطيب فقط لمبنى قائم.');
    }
    if (/اشراف/.test(t)) { s.marginMode = 'supervision'; changes.push('طريقة التعاقد: إشراف هندسي بنسبة الإعدادات المسجلة.'); }
    if (/شامل/.test(t) && !/اسعار|سعر شامل|شامل النقل/.test(t)) s.marginMode = 'comprehensive';

    const boolPatterns = [
      { key: 'basement', negative: /(?:بدون|من\s*غير|مفيش|مافيش|مش\s*(?:عايز|عاوز|عايزه|عاوزه|محتاج|محتاجه|مطلوب|داخل|ضمن)|لا\s*يوجد|بلا|شيل|احذف|استبعد)\s*(?:اي\s*)?(?:(?:ال)?بدروم|(?:ال)?قبو)/, positive: /بدروم|قبو/ },
      { key: 'elevator', negative: /(?:بدون|من\s*غير|مفيش|مافيش|مش\s*(?:عايز|عاوز|عايزه|عاوزه|محتاج|محتاجه|مطلوب|داخل|ضمن)|لا\s*يوجد|بلا|شيل|احذف|استبعد)\s*(?:اي\s*)?(?:(?:ال)?اسانسير|(?:ال)?مصعد|(?:ال)?مصاعد)/, positive: /اسانسير|مصعد|مصاعد/ },
      { key: 'kitchen', negative: /(?:بدون|من\s*غير|مفيش|مافيش|مش\s*(?:عايز|عاوز|عايزه|عاوزه|محتاج|محتاجه|مطلوب|داخل|ضمن)|لا\s*يوجد|بلا|شيل|احذف|استبعد)\s*(?:اي\s*)?(?:(?:ال)?مطبخ)/, positive: /مطبخ/ },
      { key: 'ac', negative: /(?:بدون|من\s*غير|مفيش|مافيش|مش\s*(?:عايز|عاوز|عايزه|عاوزه|محتاج|محتاجه|مطلوب|داخل|ضمن)|لا\s*يوجد|بلا|شيل|احذف|استبعد)\s*(?:اي\s*)?(?:(?:ال)?تكييف|(?:ال)?مكيف)/, positive: /تكييف|مكيف/ }
    ];
    for (const item of boolPatterns) {
      const old = s[item.key];
      if (item.negative.test(t)) s[item.key] = false;
      else if (item.positive.test(t)) s[item.key] = true;
      if (old !== s[item.key]) changes.push(({basement:'البدروم',elevator:'الأسانسير',kitchen:'المطبخ الإضافي',ac:'تأسيس التكييف'})[item.key] + (s[item.key] ? ': نعم.' : ': لا.'));
    }
    if (/ارضي\s*(?:تجاري|محلات)|الدور\s*الارضي\s*تجاري/.test(t)) { s.commercialGroundFloor = true; changes.push('الدور الأرضي تجاري؛ راجع تقسيم الاستخدامات قبل اعتماد الحصر.'); }
    const common = t.match(/(?:المشتركات|السلالم|مساحه\s*المشتركات)\s*(?:بنسبه|نسبه|حوالي|=|:)?\s*(\d{1,2}(?:\.\d+)?)\s*%/);
    if (common) { s.commonAreaPercent = Math.min(40, Math.max(0, numberFrom(common[1]))); changes.push(`نسبة المشتركات التي طلبتها: ${s.commonAreaPercent}% (افتراض قابل للتعديل وليس قياسًا).`); }
    const location = t.match(/(?:في|ب|بمحافظه|بمدينة)\s*(الاقصر|اسنا|ارمنت|الطود|قنا|اسوان|القاهره|الجيزه|الاسكندريه)/);
    if (location) { const names={الاقصر:'الأقصر',اسنا:'إسنا',ارمنت:'أرمنت',الطود:'الطود',قنا:'قنا',اسوان:'أسوان',القاهره:'القاهرة',الجيزه:'الجيزة',الاسكندريه:'الإسكندرية'};s.location=names[location[1]]||location[1];changes.push(`موقع المشروع: ${s.location}.`); }
    if (s.projectKind === 'apartment') {
      const delivery = t.match(/(?:حاله\s*الاستلام\s*|استلمتها\s*|الاستلام\s*)(على\s*الطوب|على\s*المحاره|جاهزه\s*للدهان|تمديدات\s*مكتمله)/);
      if (delivery && !s.modelCode) {
        const v=delivery[1];s.modelCode=/طوب/.test(v)?'APT-BRICK':/دهان/.test(v)?'APT-PAINT':/تمديدات/.test(v)?'APT-PLASTER-MEP':'APT-PLASTER';
        changes.push(`حالة استلام الشقة: ${MODEL_LABELS[s.modelCode]}.`);
      }
    }
  }
  function classifyIntent(text, currentState) {
    const t = normalize(text);
    const material = /حديد|اسمنت|خرسانه|رمل|زلط|سن|طوب|سيراميك|بلاط|بورسلين|كابل|سلك|سباكه|ppr|pvc|دهان|بلاستيك|اسانسير|مصنعيه|جبس|باب|ابواب|شباك|الوميتال|upvc|رخام|جرانيت|مطبخ|خلاط|معجون|سيلر|عزل/;
    if (/^(?:مشروع جديد|ابدأ من جديد|ابدا من جديد|نبدأ مشروع|امسح المشروع|ابدأ مشروع جديد)$/.test(t) || /عايز ابدا مشروع جديد/.test(t)) return 'new_project';

    // Deterministic domain intents are evaluated before ordinary project edits so a
    // price discussion never accidentally changes the active project draft.
    if (/ليه بتسال|ليه محتاج|سبب السؤال|على اي اساس|ليه اعتبرت|ازاي اخترت|المعدل ده جه منين|ليه لازم اعرف/.test(t)) return 'why';
    if (/اعرض الافتراضات|الافتراضات المستخدمة|المعدلات المستخدمة|المعاملات المستخدمة|مصادر المعدلات|المعدل الافتراضي/.test(t)) return 'assumptions';
    if (/^(?:طب لو|لو|ماذا لو|ايه لو|افترض|في حالة ان)(?:\s|$)/.test(t) && /(مساحه|مسطح|دور|ادوار|شقه|وحده|باقة|باقه|تشطيب|بدروم|اسانسير|مطبخ|تكييف|حديد|خرسانه|مشتركات|تغيير|زود|قلل|خلي)/.test(t)) return 'scenario';
    if (/قارن.*(اسعار|سعر|الارخص|حديد|اسمنت|خرسانه|رمل|زلط|طوب|سيراميك|دهان|بورسلين|بدائل)|فرق السعر بين|الارخص من|مقارنة اسعار|قارن اسعار/.test(t) && (material.test(t) || /اسعار|سعر/.test(t))) return 'compare_prices';
    if (/قارن.*(الباقات|الباقه|التشطيب|اقتصادي.*فاخر|متوسط.*فاخر)|فرق الباقات|مقارنه الباقات|مقارنة الباقات/.test(t)) return 'compare_packages';
    if (/حصر|طلبيات|الطلبيه|طلبية|قائمة الشراء|جهز.*الشراء|كم طن|كم شيكاره|كم متر مكعب|حسب الدور|كل دور|احتياجات المواد|كمية (?:الحديد|الاسمنت|الرمل|الزلط|الطوب)|استهلاك (?:الاسمنت|الرمل|الزلط)/.test(t)) return 'takeoff';
    if (/فجوات الاسعار|الاسعار الناقصه|ايه الناقص|ما الناقص|البنود الناقصه|تدقيق قاعدة|راجع قاعدة الاسعار|سجل ناقص|اسعار ناقصه/.test(t)) return 'gaps';
    if (/راجع المقايسه|راجع التسعير|حلل المقايسه|تحليل المقايسه|مدى جاهزيه|هل السعر موثوق|اكتمل التسعير|دقق المقايسه|راجع البنود/.test(t)) return 'review_estimate';
    if (/اقدر اوفر|ازاي اوفر|توفير|خفض التكلفه|قلل التكلفه|تقليل التكلفه|بدائل اوفر|بديل ارخص|اقل تكلفة|وفرلي/.test(t)) return 'savings';
    if (/ملخص (?:المشروع|البيانات)|احنا وصلنا لفين|ايه اللي سجلته|راجع البيانات|حالة المشروع|ملف المشروع/.test(t)) return 'status';
    if (/سعر|بكام|ثمن|تكلفه\s*(?:الطن|المتر|الشيكاره|البند)|كام\s*(?:سعر|طن|متر)|اسعار/.test(t) && material.test(t)) return 'price_lookup';
    if (/ازاي\s*(?:اتحسب|حسبت|حسبنا)|ليه\s*(?:الرقم|الكميه|الكمية|حسبت)|اشرح\s*(?:لي\s*)?(?:البند|الحساب|الرقم|الكميه|الكمية|الحديد|الخرسانه|الاسمنت)|مصدر\s*(?:الرقم|السعر)|اساس\s*(?:الحساب|الكميه|الكمية)|تفاصيل حساب|وضح الحساب/.test(t)) return 'explain';
    if (/معاينه مهندس|زيارة مهندس|عايز مهندس يعاين|اطلب معاينه|عايز حد يشوف الموقع/.test(t)) return 'request_site_visit';
    if (/احسب|اعمل\s*(?:مقايسه|الحساب)|طلع\s*(?:المقايسه|الحساب)|ابدأ\s*(?:الحساب|المقايسه)|احسبها|اطلع\s*(?:المقايسه|التكلفه)|جهز\s*(?:المقايسه|الحساب)/.test(t)) return 'calculate';
    if (/احفظ\s*(?:المشروع|الحاله)|اعتمد\s*البيانات|كده\s*صح|جهز المقايسه الان/.test(t)) return 'confirm';
    if (/تغيير|عدل|بدل|خلي|خللي|اقصد|قصدي|مش\s*ده|لا\s*اقصد|عايزها|عاوزها|بدل ما|مش عاوز|مش عايز/.test(t)) return 'correction';
    if (/مساعده|تقدر\s*تعمل|ازاي\s*بتشتغل|انت\s*مين|مش عارف ابدأ|مش فاهم/.test(t)) return 'help';
    if (/^(?:نعم|اه|ايوه|لا|لأ|مش|مفيش|مافيش|تمام|موافق|ماشي|اقتصادي|متوسط|فاخر|لوكس|نصف تشطيب|على المفتاح|هيكل فقط)$/.test(t) && currentState?.pending) return 'answer';
    if (/عماره|مبنى|مبني|شقه|شقة|مشروع|تشطيب|عظم|مساحه|مسطح|ادوار|دور\s|على\s*المفتاح/.test(t)) return 'project';
    if (currentState?.modelCode && /(مطبخ|تكييف|اسانسير|مصعد|بدروم|حمام|غرف|مساحه|مسطح|ادوار|دور|مشتركات|المفتاح|اقتصادي|متوسط|فاخر|تغيير|خلي|خلّي|زود|قلل|شيل|احذف)/.test(t)) return 'correction';
    return 'unknown';
  }
  function pendingAnswer(text, s, changes) {
    if (!s.pending) return false;
    const t=normalize(text), pending=s.pending;
    if (pending === 'areaBasis') {
      if (/اجمالي|المسطحات|كل\s*المبنى|المبنى\s*كله|المشروع\s*كله/.test(t)) { s.areaBasis='total';s.totalArea=s.areaCandidate;s.area=s.floors?Number((s.areaCandidate/s.floors).toFixed(2)):null;s.pending=null;changes.push('أكدت أن المساحة هي إجمالي المسطحات.');return true; }
      if (/الدور|للدور|لكل\s*دور|مسطح\s*الدور/.test(t)) { s.areaBasis=s.projectKind==='apartment'?'apartment':'floor';s.area=s.areaCandidate;s.totalArea=null;s.pending=null;changes.push(`أكدت أن المساحة ${s.projectKind==='apartment'?'للشقة':'للدور الواحد'}.`);return true; }
      return false;
    }
    if (['basement','elevator'].includes(pending)) {
      const yes=YES.test(t)||/^(?:فيه|يوجد|موجود|عايزه|اه\s*(?:فيه|موجود))$/.test(t);
      const no=NO.test(t)||/^(?:لا\s*(?:يوجد|مش)|مش\s*(?:موجود|عايز)|بدون)$/.test(t);
      if (yes||no) { s[pending]=yes;s.pending=null;changes.push(`${pending==='basement'?'البدروم':'الأسانسير'}: ${yes?'نعم':'لا'}.`);return true; }
      return false;
    }
    if (pending === 'package') {
      if (/اقتصادي/.test(t)) s.package='economic';else if (/نصف\s*تشطيب|نص\s*تشطيب/.test(t)) s.package='semi';else if (/فاخر|لوكس|فخم/.test(t)) s.package='luxury';else if (/متوسط/.test(t)) s.package='medium';else return false;
      s.pending=null;changes.push(`تم تأكيد باقة ${PACKAGE_LABELS[s.package]}.`);return true;
    }
    if (pending === 'scope') {
      if (/عظم|هيكل|خرسانه\s*فقط|مباني\s*فقط/.test(t)) { s.scope='structure';s.modelCode='BLD-STRUCTURE'; }
      else if (/مفتاح|كامل|من\s*الصفر.*تشطيب|تشطيب\s*كامل/.test(t)) { s.scope='turnkey'; if(!s.modelCode||s.modelCode==='BLD-STRUCTURE')s.modelCode='BLD-NEW-RES'; }
      else return false;
      s.pending=null;changes.push(`نطاق العمل: ${s.scope==='structure'?'هيكل ومباني فقط':'على المفتاح'}.`);return true;
    }
    if (pending === 'rooms') {
      const r=roomNumber(t);if(!r)return false;s.roomsPerApartment=r;s.pending=null;changes.push(`عدد الغرف: ${r}.`);return true;
    }
    if (pending === 'bathrooms') {
      const m=t.match(/\d+/);if(!m||Number(m[0])<1||Number(m[0])>8)return false;s.bathrooms=Number(m[0]);s.pending=null;changes.push(`عدد الحمامات: ${s.bathrooms}.`);return true;
    }
    if (pending === 'model') {
      if (/شقه|شقة/.test(t)) {s.projectKind='apartment';s.modelCode=null;}
      else if(/عظم|هيكل/.test(t)){s.projectKind='building';s.modelCode='BLD-STRUCTURE';s.scope='structure';}
      else if(/تشطيب\s*عماره\s*قائمه|عماره\s*قائمه/.test(t)){s.projectKind='building';s.modelCode='BLD-FINISH';s.scope='finishing';}
      else if(/تجاري/.test(t)&&/عماره|مبني|مبنى/.test(t)){s.projectKind='building';s.modelCode='BLD-NEW-COM';}
      else if(/مختلط|سكني\s*و\s*تجاري/.test(t)){s.projectKind='mixed';s.modelCode='BLD-NEW-MIX';}
      else if(/عماره|مبني|مبنى|سكني/.test(t)){s.projectKind='building';s.modelCode='BLD-NEW-RES';}
      else return false;
      s.pending=null;changes.push(`نوع الخدمة: ${MODEL_LABELS[s.modelCode]||'شقة؛ نحتاج تحديد حالة الاستلام'}.`);return true;
    }
    return false;
  }
  function roomNumber(t) {
    if (/غرفتين|غرفتين نوم|غرفتين/.test(t)) return 2;
    if (/(?:اربع|اربعه|4)\s*غرف/.test(t)) return 4;
    if (/(?:ثلاث|ثلاثه|تلات|3)\s*غرف/.test(t)) return 3;
    return null;
  }
  function applyAssumptions(s) {
    const existing=new Set(s.assumptions);
    const add=x=>{if(!existing.has(x)){s.assumptions.push(x);existing.add(x);}};
    if (s.projectKind==='building' && s.modelCode !== 'BLD-NEW-COM' && s.modelCode !== 'BLD-STRUCTURE' && s.unitsPerFloor===null) {s.unitsPerFloor=2;add('افتراض مبدئي: وحدتان سكنيتان في كل دور؛ عدّله إذا كان التقسيم مختلفًا.');}
    if (s.projectKind==='building' && s.modelCode !== 'BLD-NEW-COM' && s.roomsPerApartment===null) {s.roomsPerApartment=3;add('افتراض مبدئي: 3 غرف لكل وحدة سكنية؛ ليس حصرًا معماريًا.');}
    if (s.projectKind==='building' && s.modelCode !== 'BLD-NEW-COM' && s.bathrooms===null) {s.bathrooms=2;add('افتراض مبدئي: حمامان لكل وحدة سكنية؛ راجعه قبل اعتماد بنود الصحي.');}
    if (s.projectKind==='apartment' && s.roomsPerApartment===null) {s.roomsPerApartment=3;add('افتراض مبدئي: الشقة 3 غرف لأن عدد الغرف لم يُذكر.');}
    if (s.projectKind==='apartment' && s.bathrooms===null) {s.bathrooms=2;add('افتراض مبدئي: حمامان للشقة لأن العدد لم يُذكر.');}
    if (s.kitchen===false) add('لم تتم إضافة مطبخ مستقل؛ لأنه خيار إضافي لم يطلبه العميل بعد.');
    if (s.ac===false) add('لم تتم إضافة تكييف أو تأسيس تكييف؛ لأنه خيار إضافي لم يطلبه العميل بعد.');
    return s;
  }
  function getNextQuestion(s) {
    if (s.pending==='areaBasis') return {key:'areaBasis',text:`سجلت ${s.areaCandidate} م²، لكن لا أريد أحسبها على أساس خاطئ. الرقم ده مساحة الدور الواحد ولا إجمالي مسطحات المبنى؟`,choices:['مساحة الدور الواحد','إجمالي المسطحات']};
    if (!s.modelCode) return {key:'model',text:'خلّيني أحدد نطاق الشغل الأول عشان ما أضيفش بنود مش مطلوبة. بنتكلم عن شقة، ولا عمارة جديدة، ولا عمارة قائمة محتاجة تشطيب؟ اكتب وصفك بطريقتك.',choices:['شقة تشطيب','عمارة جديدة','هيكل ومباني فقط','تشطيب عمارة قائمة']};
    if (s.area===null || s.area<=0) return {key:'area',text:s.projectKind==='apartment'?'مساحة الشقة الواحدة كام متر مربع تقريبًا؟ لو عندك أكتر من شقة متشابهة قلّي عددها كمان.':'مسطح الدور الواحد كام متر مربع؟ ولو الـ220 مثلًا تشمل السلم والمشتركات، قلّي؛ هفصل التقدير عن المساحة الصافية بدل ما أخلطهم.',choices:s.projectKind==='apartment'?['100 م²','120 م²','150 م²']:['150 م² للدور','180 م² للدور','220 م² للدور']};
    if (s.projectKind==='building' && !s.floors) return {key:'floors',text:'عدد الأدوار فوق الأرض كام؟ لو الوصف عندك «أرضي و4 متكرر» اكتبه كده، وهحسبهم 5 أدوار.' ,choices:['أرضي و3 متكرر','أرضي و4 متكرر','5 أدوار']};
    if (s.projectKind==='building' && s.scope===null && s.modelCode!=='BLD-STRUCTURE' && s.modelCode!=='BLD-FINISH') return {key:'scope',text:'قبل ما أختار البنود: لما تقول عمارة جديدة، تقصد الهيكل والمباني فقط، ولا المشروع كامل لحد التشطيب والتسليم على المفتاح؟',choices:['هيكل ومباني فقط','على المفتاح']};
    if (s.modelCode!=='BLD-STRUCTURE' && s.package===null) return {key:'package',text:'مستوى التشطيب هيغيّر مواصفات الخامات والتكلفة. تحب الاقتصادي، نصف التشطيب، المتوسط، ولا الفاخر؟ ولو محتار أشرح لك الفرق قبل الاختيار.',choices:['اقتصادي','نصف تشطيب','متوسط','فاخر']};
    if (s.projectKind==='apartment' && !s.roomsPerApartment) return {key:'rooms',text:'الشقة كام غرفة؟ ده بيساعدني أقدّر الأبواب وبعض بنود الوحدة، لكنه لا يغني عن الحصر من المخطط.',choices:['غرفتين','3 غرف','4 غرف']};
    if (s.projectKind==='building' && s.floors>=3 && s.basement===null) return {key:'basement',text:'في بدروم؟ بسأل لأن الحفر والعزل والخرسانة تتغير بشكل كبير. مش هفترض وجوده أو غيابه من نفسي.',choices:['في بدروم','بدون بدروم']};
    if (s.projectKind==='building' && s.floors>=3 && s.elevator===null) return {key:'elevator',text:'هل الأسانسير داخل نطاق المقايسة؟ هفصل التوريد عن التركيب حتى لا تتكرر التكلفة.',choices:['أسانسير مطلوب','بدون أسانسير']};
    return null;
  }
  function projectSummary(s) {
    const parts=[];
    if(s.modelCode)parts.push(MODEL_LABELS[s.modelCode]);
    if(s.area)parts.push(`${s.area} م² ${s.areaBasis==='apartment'?'للشقة':s.projectKind==='building'?'للدور':'للوحدة'}`);
    if(s.floors)parts.push(`${s.floors} أدوار`);
    if(s.projectKind==='building'&&s.unitsPerFloor)parts.push(`${s.unitsPerFloor} وحدة/دور`);
    if(s.roomsPerApartment)parts.push(`${s.roomsPerApartment} غرف/وحدة`);
    if(s.bathrooms)parts.push(`${s.bathrooms} حمام/وحدة`);
    if(s.package)parts.push(`تشطيب ${PACKAGE_LABELS[s.package]}`);
    if(s.scope)parts.push(`النطاق: ${{structure:'هيكل ومباني فقط',finishing:'تشطيب فقط',turnkey:'على المفتاح'}[s.scope]||'يحتاج إلى توضيح'}`);
    if(s.basement!==null&&s.projectKind==='building')parts.push(s.basement?'بدروم: نعم':'بدون بدروم');
    if(s.elevator!==null&&s.projectKind==='building')parts.push(s.elevator?'أسانسير: نعم':'أسانسير: لا');
    if(s.kitchen)parts.push('مطبخ إضافي');if(s.ac)parts.push('تكييف إضافي');
    if(s.location)parts.push(`الموقع: ${s.location}`);
    return parts;
  }
  function handle(text, previous) {
    const s=Object.assign(freshState(), previous||{});s.assumptions=Array.isArray(s.assumptions)?s.assumptions.slice():[];
    const raw=String(text??'').trim(), t=normalize(raw), changes=[];
    if(!raw)return {state:s,changes,intent:'empty',action:null};
    let intent=classifyIntent(raw,s);
    if(intent==='new_project') return {state:freshState(),changes:['بدأنا مشروعًا جديدًا؛ احتفظنا بكتالوج الأسعار، وصفرنا بيانات المشروع السابق.'],intent,action:'reset'};
    const readOnlyIntents = new Set(['price_lookup','compare_prices','compare_packages','takeoff','gaps','review_estimate','savings','status','explain','help','why','assumptions','request_site_visit']);
    if (readOnlyIntents.has(intent)) return {state:s,changes,intent,action:intent};
    s.lastIntent=intent;
    const pendingBefore=s.pending;
    if (pendingBefore === 'confirm' && (YES.test(t) || /اعتمد|احسب|تمام/.test(t))) intent = 'calculate';
    // Resolve the exact pending question first, then parse any other facts in the same message.
    pendingAnswer(raw,s,changes);
    const context={apartment:s.projectKind==='apartment'};
    parseModel(t,s,changes);
    parseNumbers(t,s,changes,context);
    parseChoices(t,s,changes);
    if(s.areaBasis==='total'&&s.totalArea&&s.floors){s.area=Number((s.totalArea/s.floors).toFixed(2));}
    if(s.projectKind==='building'&&s.modelCode&&s.scope===null&&s.modelCode==='BLD-STRUCTURE')s.scope='structure';
    if(s.modelCode==='BLD-FINISH')s.scope='finishing';
    if(s.modelCode==='BLD-STRUCTURE')s.scope='structure';
    s.started=true;
    if(s.projectKind==='building') {
      if(s.unitsPerFloor===null && s.modelCode!=='BLD-NEW-COM' && s.modelCode!=='BLD-STRUCTURE') {
        // Use a visible, editable template instead of asking for another form-like field immediately.
        s.unitsPerFloor=2;
        if(!s.assumptions.includes('افتراض مبدئي: وحدتان سكنيتان في كل دور؛ عدّله إذا كان التقسيم مختلفًا.'))s.assumptions.push('افتراض مبدئي: وحدتان سكنيتان في كل دور؛ عدّله إذا كان التقسيم مختلفًا.');
      }
    }
    if (/^(?:غير كده|مش كده|اقصد|قصدي|لا اقصد|عدلها)$/.test(t)) intent='correction';
    if (intent==='help') return {state:s,changes,intent,action:'help'};
    if (intent==='price_lookup') return {state:s,changes,intent,action:'price_lookup'};
    if (intent==='explain') return {state:s,changes,intent,action:'explain'};
    if (intent==='compare_packages') return {state:s,changes,intent,action:'compare_packages'};
    if (intent==='takeoff') return {state:s,changes,intent,action:'takeoff'};
    if (intent==='status') return {state:s,changes,intent,action:'status'};
    if (intent==='calculate') return {state:s,changes,intent,action:'calculate'};
    if (intent==='scenario') { s.pending='scenario_review'; return {state:s,changes,intent,action:'scenario',summary:projectSummary(s)}; }
    const next=getNextQuestion(s);
    if(next){s.pending=next.key;return {state:s,changes,intent,action:'ask',question:next};}
    s.pending='confirm';
    return {state:s,changes,intent,action:(intent==='confirm'?'calculate':'confirm'),summary:projectSummary(s)};
  }
  return { normalize, freshState, handle, classifyIntent, getNextQuestion, projectSummary, MODEL_LABELS, PACKAGE_LABELS, applyAssumptions };
});
