/* MIYAR unified rate and price-validation registry.
 * Source: user-provided material-consumption report + explicit reconciliation decisions.
 * Deterministic/local-only; this module does not call an LLM or any network service.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MIYAR_RATES = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = {
    steelKgPerM2: { value: 80, low: 60, high: 100, unit: 'كجم/م² مسطح', basis: 'معدل تخطيطي فقط؛ لا يُستخدم كتفريد حديد من اللوحات.' },
    concreteM3PerM2: { value: 0.35, low: 0.30, high: 0.40, unit: 'م³/م² مسطح', basis: 'معدل تخطيطي للهيكل فوق الأرض؛ الأساسات والبدروم يحتاجان حصرًا مستقلًا.' },
    basementSteelKgPerM2: { value: 75, low: 60, high: 90, unit: 'كجم/م² بصمة بدروم', basis: 'افتراض تخطيطي للبدروم (60–90 كجم/م²)؛ يلزم حصر القواعد واللبشة والحوائط من اللوحات.' },
    basementConcreteM3PerM2: { value: 0.55, low: 0.45, high: 0.70, unit: 'م³/م² بصمة بدروم', basis: 'افتراض تخطيطي للبدروم (0.45–0.70 م³/م²)؛ لا يغني عن حصر العناصر من اللوحات.' },
    commonAreaPercent: { value: 10, low: 10, high: 12, unit: '% من مسطح الدور', basis: 'افتراض واجهة ابتدائي للمشتركات والسلالم؛ يُعلّم كتقدير ويُستبدل بالقياس الفعلي.' },
    rcCementKgPerM3: { value: 350, low: 350, high: 350, unit: 'كجم/م³ خرسانة', basis: 'سبع شكاير وزن 50 كجم لكل م³؛ يعتمد تصميم الخلطة المعتمد.' },
    rcSandM3PerM3: { value: 0.40, low: 0.40, high: 0.40, unit: 'م³/م³ خرسانة', basis: 'معدل خلطة مبدئي.' },
    rcAggregateM3PerM3: { value: 0.80, low: 0.80, high: 0.80, unit: 'م³/م³ خرسانة', basis: 'معدل خلطة مبدئي.' },
    rcWaterLPerM3: { value: 175, low: 125, high: 175, unit: 'لتر/م³ خرسانة', basis: 'يتغير حسب تصميم الخلطة ورطوبة الركام.' },
    plasterSurfaceM2PerM2Built: { value: 2.20, low: 2.0, high: 2.5, unit: 'م² سطح/م² مسطح', basis: 'افتراض مساحة أسطح قابل للاستبدال بقياس الحوائط والسقف.' },
    paintSurfaceM2PerM2Built: { value: 2.20, low: 2.0, high: 2.5, unit: 'م² دهان/م² مسطح', basis: 'يستخدم نفس معامل سطح المحارة مبدئيًا حتى إدخال المساحة الفعلية.' },
    puttyKgPerM2Surface: { value: 0.75, low: 0.50, high: 1.00, unit: 'كجم/م² سطح', basis: 'ثلاث سكاكين؛ راجع خشونة السطح وبيانات المنتج.' },
    sealerLPerM2Surface: { value: 0.10, low: 0.08, high: 0.12, unit: 'لتر/م² سطح', basis: 'معدل استهلاك استرشادي.' },
    interiorPaintLPerM2Surface: { value: 0.146, low: 0.125, high: 0.20, unit: 'لتر/م² سطح', basis: 'المعدل المركزي المستخدم فعليًا 0.146 لتر/م² سطح = منتصف نطاق 0.125–0.167 لثلاثة أوجه؛ 0.20 ليس الافتراضي، بل حد أعلى بديل ناتج عن تعارض المصدر (1 لتر/5م²). يظهر النطاق 0.125–0.20 للمراجعة.' },
    floorTileM2PerM2Apartment: { value: 0.75, low: 0.70, high: 0.82, unit: 'م² أرضية/م² شقة', basis: 'معامل صافي مبدئي؛ الأفضل قياس المساحة الصافية لكل وحدة.' },
    wetTileM2PerM2Apartment: { value: 0.45, low: 0.35, high: 0.55, unit: 'م² تكسية/م² شقة', basis: 'مؤشر فقط؛ القياس بحسب الحمامات والمطبخ وارتفاع التكسية.' },
    tileWaste: { value: 7.5, low: 5, high: 10, unit: '%', basis: 'يضاف إلى شراء البلاط فقط، ولا يضاف إلى مصنعية التركيب أو المونة.' },
    bindingWireKgPerTonne: { value: 10, low: 8, high: 12, unit: 'كجم/طن حديد', basis: 'توحيد مؤقت على 8–12 كجم/طن لتصحيح احتمال خطأ الوحدة في المصدر؛ قابل للتعديل ومراجعة المورد.' },
    plasterCementKgPerM2Surface: { value: 9.75, low: 7.5, high: 12, unit: 'كجم/م² سطح محارة', basis: 'النطاق الجامع لمعدلي 7.5–10 و9–12 الواردين بالمصدر.' },
    plasterSandM3PerM2Surface: { value: 0.025, low: 0.02, high: 0.03, unit: 'م³/م² سطح محارة', basis: 'تقريب لمونة بسمك يقارب 2 سم.' },
    floorTileCementKgPerM2: { value: 10, low: 10, high: 10, unit: 'كجم/م² بلاط', basis: 'معدل المصدر؛ لا يشمل فرشة تسوية إضافية إن لزمت.' },
    floorTileSandM3PerM2: { value: 0.04, low: 0.04, high: 0.04, unit: 'م³/م² بلاط', basis: 'معدل المصدر؛ لا يشمل فرشة تسوية إضافية إن لزمت.' },
    brickPiecesPerM2Built: { value: 25, low: 25, high: 25, unit: 'طوبة/م² مسطح', basis: 'تقدير إجمالي من مواصفة النماذج؛ يتعارض مع جدول الاستهلاك 60–120 طوبة/م²، لذا لا يُعتمد للشراء قبل الحصر من الحوائط.' },
    "plainCementKgPerM3": {"value":250,"low":250,"high":250,"unit":"كجم/م³ خرسانة","basis":"5 شكاير × 50 كجم لكل م³ وفق جدول الخلطة المرفق.","quality":"planning_only","sourceKey":"plainCementKgPerM3"},
    "plainWaterLPerM3": {"value":125,"low":125,"high":125,"unit":"لتر/م³ خرسانة","basis":"يتغير حسب رطوبة الركام وتصميم الخلطة.","quality":"planning_only","sourceKey":"plainWaterLPerM3"},
    "halfBrickPerM2": {"value":55,"low":55,"high":55,"unit":"طوبة/م²","basis":"طوب أحمر 12 سم؛ راجع أبعاد الطوبة والفواصل.","quality":"planning_only","sourceKey":"halfBrickPerM2"},
    "halfBrickSandM3PerM2": {"value":0.022,"low":0.022,"high":0.022,"unit":"م³/م² حائط","basis":"معدل المصدر المرفق.","quality":"planning_only","sourceKey":"halfBrickSandM3PerM2"},
    "halfBrickCementKgPerM2": {"value":8,"low":8,"high":8,"unit":"كجم/م² حائط","basis":"المصدر يذكر أيضًا معدلًا عامًا للمونة 300–350 كجم/م³ رمل؛ راجع التعارض.","quality":"planning_only","sourceKey":"halfBrickCementKgPerM2"},
    "fullBrickPerM2": {"value":110,"low":110,"high":110,"unit":"طوبة/م²","basis":"حائط نحو 25 سم؛ راجع أبعاد الطوبة والفواصل.","quality":"planning_only","sourceKey":"fullBrickPerM2"},
    "fullBrickSandM3PerM2": {"value":0.045,"low":0.045,"high":0.045,"unit":"م³/م² حائط","basis":"معدل المصدر المرفق.","quality":"planning_only","sourceKey":"fullBrickSandM3PerM2"},
    "fullBrickCementKgPerM2": {"value":16,"low":16,"high":16,"unit":"كجم/م² حائط","basis":"المصدر يذكر أيضًا معدلًا عامًا للمونة 300–350 كجم/م³ رمل؛ راجع التعارض.","quality":"planning_only","sourceKey":"fullBrickCementKgPerM2"},
    "splashCementKgPerM2": {"value":2.25,"low":2.25,"high":2.25,"unit":"كجم/م²","basis":"سمك مرجعي نحو 0.5 سم.","quality":"planning_only","sourceKey":"splashCementKgPerM2"},
    "splashSandM3PerM2": {"value":0.005,"low":0.005,"high":0.005,"unit":"م³/م²","basis":"معدل المصدر المرفق.","quality":"planning_only","sourceKey":"splashSandM3PerM2"},
    "exteriorPaintLPerM2": {"value":0.2,"low":0.15,"high":0.25,"unit":"لتر/م² سطح","basis":"الامتصاص ونوع النظام يؤثران في الاستهلاك.","quality":"planning_only","sourceKey":"exteriorPaintLPerM2"},
    "exteriorPuttyKgPerM2": {"value":1.15,"low":0.8,"high":1.5,"unit":"كجم/م² سطح","basis":"حسب خشونة السطح.","quality":"planning_only","sourceKey":"exteriorPuttyKgPerM2"},
    "membraneM2PerM2": {"value":1.2000000000000002,"low":1.1,"high":1.3,"unit":"م² رول/م² سطح","basis":"الكمية التي تُشترى بعد التراكب.","quality":"planning_only","sourceKey":"membraneM2PerM2"},
    "bitumenKgPerM2": {"value":2.9523809523809526,"low":2.5714285714285716,"high":3.3333333333333335,"unit":"كجم/م² سطح","basis":"مستنتج من برميل 180–200 كجم يغطي 60–70 م² لوجهين.","quality":"planning_only","sourceKey":"bitumenKgPerM2"},
    "thermalBoardM2PerM2": {"value":1,"low":1,"high":1,"unit":"م²/م² سطح","basis":"لا يتضمن المادة اللاصقة أو المثبتات.","quality":"planning_only","sourceKey":"thermalBoardM2PerM2"},
    "fiberglassMeshM2PerM2": {"value":1.1,"low":1.05,"high":1.15,"unit":"م²/م² سطح","basis":"يشمل التراكب.","quality":"planning_only","sourceKey":"fiberglassMeshM2PerM2"},
    "gypsumBoardM2PerM2": {"value":1.125,"low":1.05,"high":1.2,"unit":"م² لوح/م² سقف","basis":"لا يمكن تحويلها إلى عدد ألواح دون أبعاد اللوح.","quality":"planning_only","sourceKey":"gypsumBoardM2PerM2"},
    "gypsumScrewsPerM2": {"value":30,"low":25,"high":35,"unit":"مسمار/م²","basis":"حسب التصميم والمسافات.","quality":"planning_only","sourceKey":"gypsumScrewsPerM2"},
    "gypsumProfileLmPerM2": {"value":1.35,"low":1.2,"high":1.5,"unit":"م طولي/م²","basis":"حسب توزيع الهيكل والمسافات.","quality":"planning_only","sourceKey":"gypsumProfileLmPerM2"},
    "spacersPerM2": {"value":4,"low":3,"high":5,"unit":"قطعة/م²","basis":"حسب العنصر وغطاء الخرسانة.","quality":"planning_only","sourceKey":"spacersPerM2"},
    "exteriorPlasterCementKgPerM2": {"value":10,"low":7.5,"high":12,"unit":"كجم/م² سطح","basis":"نطاق استرشادي؛ يعتمد السمك ونظام التنفيذ على المواصفات.","quality":"planning_only","sourceKey":"exteriorPlasterCementKgPerM2"},
    "exteriorPlasterSandM3PerM2": {"value":0.025,"low":0.025,"high":0.025,"unit":"م³/م² سطح","basis":"نطاق سمك مرجعي نحو 2 سم؛ الواجهة الفعلية تُقاس.","quality":"planning_only","sourceKey":"exteriorPlasterSandM3PerM2"},
    "excavationM3PerM2": {"value":0.12,"low":0.12,"high":0.12,"unit":"م³/م² بصمة","basis":"عامل اقتراحي بالمصدر؛ الحفر الحقيقي من المناسيب وأبعاد الحفر.","quality":"planning_only","sourceKey":"excavationM3PerM2"},
    "backfillM3PerM2": {"value":0.06,"low":0.06,"high":0.06,"unit":"م³/م² بصمة","basis":"لا يفترض أن يساوي ناتج الحفر؛ يحتاج حصرًا.","quality":"review_required","sourceKey":"backfillM3PerM2"},
    "replacementGravelM3PerM2": {"value":0.1,"low":0.1,"high":0.1,"unit":"م³/م² بصمة","basis":"عامل اقتراحي من الملف ويحتاج مراجعة تقرير التربة.","quality":"review_required","sourceKey":"replacementGravelM3PerM2"},
    "foundationConcreteM3PerM2": {"value":0.08,"low":0.08,"high":0.08,"unit":"م³/م² بصمة","basis":"معدل تخطيطي من الملف وليس بديلاً عن اللوحات.","quality":"review_required","sourceKey":"foundationConcreteM3PerM2"},
    "foundationSteelKgPerM2": {"value":8,"low":8,"high":8,"unit":"كجم/م² بصمة","basis":"معدل تخطيطي من الملف وليس تفريدًا للحديد.","quality":"review_required","sourceKey":"foundationSteelKgPerM2"},
    "raftConcreteM3PerM2": {"value":0.03,"low":0.03,"high":0.03,"unit":"م³/م² بصمة","basis":"القيمة الواردة في الملف محل شك هندسي؛ لا يستخدمها المحرك تلقائيًا عند اختيار اللبشة.","quality":"review_required","sourceKey":"raftConcreteM3PerM2"},
    "exteriorPlasterM2PerM2Built": {"value":0.55,"low":0.55,"high":0.55,"unit":"م²/م² مبني","basis":"عامل ابتدائي؛ الأفضل إدخال مساحة الواجهة المقاسة بكل دور.","quality":"planning_only","sourceKey":"exteriorPlasterM2PerM2Built"},
    "plumbingM2PerM2Apartment": {"value":1,"low":1,"high":1,"unit":"م²/م² شقة","basis":"معامل كمية فقط؛ يفضل لاحقًا استبداله بحصر أقطار ومسارات ونقاط.","quality":"planning_only","sourceKey":"plumbingM2PerM2Apartment"},
    "electricalM2PerM2Apartment": {"value":1,"low":1,"high":1,"unit":"م²/م² شقة","basis":"معامل كمية فقط وليس حصر دوائر أو كابلات.","quality":"review_required","sourceKey":"electricalM2PerM2Apartment"},
    "electricalPointsPerM2Apartment": {"value":0.8,"low":0.8,"high":0.8,"unit":"نقطة/م² شقة","basis":"مؤشر أولي؛ عدد النقاط والتغذية من التصميم الكهربائي.","quality":"planning_only","sourceKey":"electricalPointsPerM2Apartment"},
    "waterPointsPerM2Apartment": {"value":0.3,"low":0.3,"high":0.3,"unit":"نقطة/م² شقة","basis":"مؤشر أولي؛ مراجعة الحمامات والمطبخ.","quality":"planning_only","sourceKey":"waterPointsPerM2Apartment"},
    "drainPointsPerM2Apartment": {"value":0.25,"low":0.25,"high":0.25,"unit":"نقطة/م² شقة","basis":"مؤشر أولي؛ يراجع مع مخطط الصرف.","quality":"planning_only","sourceKey":"drainPointsPerM2Apartment"},
    "gypsumM2PerM2Apartment": {"value":0.3,"low":0.3,"high":0.3,"unit":"م²/م² شقة","basis":"اختياري ويحتاج مساحة سقف فعلية.","quality":"review_required","sourceKey":"gypsumM2PerM2Apartment"},
    "doorAreaPer35M2": {"value":35,"low":35,"high":35,"unit":"م²/باب","basis":"عدد الأبواب = تقريب لأعلى مساحة الشقة/المعدل؛ ليس جدول أبواب معماريًا.","quality":"review_required","sourceKey":"doorAreaPer35M2"},
    "kitchenLmPerM2Apartment": {"value":0.15,"low":0.15,"high":0.15,"unit":"م طولي/م² شقة","basis":"معدل ملف النماذج، يحتاج تأكيد؛ يسمح بإدخال الطول الفعلي.","quality":"review_required","sourceKey":"kitchenLmPerM2Apartment"},
    "windowM2PerM2Apartment": {"value":0.12,"low":0.12,"high":0.12,"unit":"م²/م² شقة","basis":"معدل استرشادي ضعيف؛ الأفضل إدخال جدول الفتحات.","quality":"review_required","sourceKey":"windowM2PerM2Apartment"},
    "stairM2PerM2Built": {"value":0.06,"low":0.06,"high":0.06,"unit":"م²/م² مبني","basis":"معامل مصدر تقديري؛ ليس حصرًا هندسيًا.","quality":"review_required","sourceKey":"stairM2PerM2Built"},
    "roofWaterproofM2PerM2": {"value":1,"low":1,"high":1,"unit":"م²/م² سطح","basis":"عادةً مساحة السطح × معامل التراكب المحدد لنظام العزل.","quality":"planning_only","sourceKey":"roofWaterproofM2PerM2"},
    "commercialConcreteFactor": {"value":1.05,"low":1.05,"high":1.05,"unit":"معامل","basis":"معامل مقترح من التقرير، وليس معايرًا؛ يطبّق كافتراض قابل للتعديل.","quality":"review_required","sourceKey":"commercialConcreteFactor"},
    "commercialSteelFactor": {"value":1.1,"low":1.1,"high":1.1,"unit":"معامل","basis":"معامل مقترح من التقرير، لا يستبدل التصميم الإنشائي.","quality":"planning_only","sourceKey":"commercialSteelFactor"},
    "commercialElectricalFactor": {"value":1.3,"low":1.3,"high":1.3,"unit":"معامل","basis":"معامل مقترح فقط؛ تحدد الأحمال حسب النشاط.","quality":"planning_only","sourceKey":"commercialElectricalFactor"},
    "commercialFacadeFactor": {"value":1.4,"low":1.4,"high":1.4,"unit":"معامل","basis":"مرجع فقط وغير مطبق تلقائيًا؛ يلزم قياس واجهات المحلات من الرسومات.","quality":"review_required","sourceKey":"commercialFacadeFactor"},
    "commercialPlumbingFactor": {"value":1.1,"low":1.1,"high":1.1,"unit":"معامل","basis":"مرجع فقط وغير مطبق تلقائيًا؛ عدد الحمامات والنشاط ومخطط السباكة يحكم الحصر.","quality":"review_required","sourceKey":"commercialPlumbingFactor"},
  };
  const legacyKeys = {
    steelFactor: 'steelKgPerM2', concreteFactor: 'concreteM3PerM2',
    basementSteelFactor: 'basementSteelKgPerM2', basementConcreteFactor: 'basementConcreteM3PerM2',
    paintSurfaceFactor: 'paintSurfaceM2PerM2Built', tileCoverageFactor: 'floorTileM2PerM2Apartment'
  };
  function hasUsablePrice(row) {
    if (!row || row.active === false || row.status === 'missing') return false;
    const avg = row.avg;
    return avg !== null && avg !== undefined && avg !== '' && Number.isFinite(Number(avg)) && Number(avg) > 0;
  }
  function validatePriceInput(row) {
    const errors = [];
    const status = row?.status || 'missing';
    const names = [['low','أقل سعر'],['avg','متوسط السعر'],['high','أعلى سعر']];
    for (const [key,label] of names) {
      const v = row?.[key];
      if (v === '' || v === null || v === undefined) continue;
      if (!Number.isFinite(Number(v)) || Number(v) <= 0) errors.push(`${label}: يجب أن يكون أكبر من صفر؛ اترك الحقل فارغًا إذا لم يتوفر السعر.`);
    }
    const low = row?.low === '' || row?.low == null ? null : Number(row.low);
    const avg = row?.avg === '' || row?.avg == null ? null : Number(row.avg);
    const high = row?.high === '' || row?.high == null ? null : Number(row.high);
    if (low !== null && avg !== null && low > avg) errors.push('أقل سعر أكبر من المتوسط.');
    if (avg !== null && high !== null && avg > high) errors.push('المتوسط أكبر من أعلى سعر.');
    if (low !== null && high !== null && low > high) errors.push('أقل سعر أكبر من أعلى سعر.');
    if (status !== 'missing' && (avg === null || !Number.isFinite(avg) || avg <= 0)) errors.push('لا يمكن تصنيف السعر موثقًا/بديلًا دون متوسط سعر أكبر من صفر.');
    if (status !== 'missing' && !String(row?.source || '').trim()) errors.push('أدخل مصدر السعر أو اسم المورد قبل حفظ سعر غير فجوة.');
    return [...new Set(errors)];
  }
  function getRate(key, settings = {}, bucket = 'resourceRates') {
    const def = defaults[key];
    if (!def) return null;
    const saved = settings?.[bucket]?.[key];
    if (saved && typeof saved === 'object') {
      const low = saved.low === null || saved.low === '' || saved.low === undefined ? def.low : Number(saved.low);
      const high = saved.high === null || saved.high === '' || saved.high === undefined ? def.high : Number(saved.high);
      const lo = Math.min(low, high), hi = Math.max(low, high);
      const editedValue = saved.value === null || saved.value === '' || saved.value === undefined ? null : Number(saved.value);
      const candidate = Number.isFinite(editedValue) ? editedValue : (lo === hi ? lo : (def.value >= lo && def.value <= hi ? def.value : (lo + hi) / 2));
      const value = Math.min(hi, Math.max(lo, candidate));
      return { ...def, value, low: lo, high: hi };
    }
    if (saved !== undefined && saved !== null && saved !== '' && Number.isFinite(Number(saved))) return { ...def, value: Number(saved), low: def.low, high: def.high };
    return { ...def };
  }
  return { version: '1.0.0', defaults, legacyKeys, hasUsablePrice, validatePriceInput, getRate };
});
