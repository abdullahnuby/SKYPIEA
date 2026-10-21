(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MIYAR_WORKFLOW = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const QUESTION_LABELS = {
    model: 'تحديد نوع الخدمة', areaBasis: 'تثبيت أساس المساحة', area: 'تحديد المساحة',
    floors: 'تثبيت عدد الأدوار', scope: 'اعتماد نطاق الأعمال', package: 'اختيار مستوى التشطيب',
    rooms: 'تفاصيل نموذج الوحدة', roomsPerApartment: 'تفاصيل نموذج الوحدة', bathrooms: 'تحديد الحمامات',
    basement: 'تحديد وجود البدروم', elevator: 'تحديد نطاق الأسانسير', unitsPerFloor: 'تأكيد الوحدات في الدور'
  };
  const STEP_LABELS = {
    scope: 'تعريف المشروع', quantities: 'تثبيت الكميات', pricing: 'تسعير البنود', review: 'المراجعة الهندسية'
  };
  const QUESTION_KEYS_FOR_QUANTITIES = new Set(['areaBasis', 'area', 'floors', 'unitsPerFloor']);
  const SCOPE_SELF_DESCRIBING_MODELS = new Set(['BLD-STRUCTURE', 'BLD-FINISH', 'BLD-NEW-COM']);

  function countGaps(result, key, fallbackKey) {
    if (!result) return 0;
    if (Array.isArray(result[key])) return result[key].length;
    if (Array.isArray(result[fallbackKey])) return result[fallbackKey].length;
    return 0;
  }

  function plan(projectState, options) {
    const d = projectState && typeof projectState === 'object' ? projectState : {};
    const opts = options && typeof options === 'object' ? options : {};
    const q = opts.nextQuestion && typeof opts.nextQuestion === 'object' ? opts.nextQuestion : null;
    const estimate = opts.estimate && typeof opts.estimate === 'object' ? opts.estimate : null;
    const modelCode = String(d.modelCode || '');
    const hasModel = !!modelCode;
    const isBuilding = d.projectKind === 'building' || modelCode.startsWith('BLD-');
    const hasArea = Number.isFinite(Number(d.area)) && Number(d.area) > 0;
    const hasFloors = !isBuilding || (Number.isFinite(Number(d.floors)) && Number(d.floors) > 0);
    const scopeQuestionOpen = !!q && ['model', 'scope'].includes(q.key);
    const quantitiesQuestionOpen = !!q && QUESTION_KEYS_FOR_QUANTITIES.has(q.key);
    const priceGaps = countGaps(estimate, 'priceGaps', 'missingPrices');
    const quantityGaps = countGaps(estimate, 'quantityGaps', 'missingQuantities');
    const hasGaps = priceGaps + quantityGaps > 0;

    const scopeComplete = hasModel && !scopeQuestionOpen && (!isBuilding || SCOPE_SELF_DESCRIBING_MODELS.has(modelCode) || !!d.scope);
    const quantitiesComplete = scopeComplete && hasArea && hasFloors && !quantitiesQuestionOpen;
    // An estimate with gaps is a useful result, but pricing is not considered finished.
    const pricingComplete = !!estimate && !hasGaps;
    // This alpha requires a human engineering review; no automatic result marks this gate complete.
    const reviewComplete = false;
    const stageFlags = { scope: scopeComplete, quantities: quantitiesComplete, pricing: pricingComplete, review: reviewComplete };
    const stages = Object.keys(STEP_LABELS).map(key => ({
      key,
      label: STEP_LABELS[key],
      complete: stageFlags[key],
      status: stageFlags[key] ? 'complete' : 'pending'
    }));
    const currentStage = stages.find(step => !step.complete)?.key || 'review';
    const progressPercent = Math.round(stages.filter(step => step.complete).length / stages.length * 100);

    let action;
    if (!hasModel || (q && q.key === 'model')) {
      action = {
        type: 'choose_service', key: 'model', title: QUESTION_LABELS.model,
        prompt: 'اختر نوع المشروع حتى أستخدم نموذج الحصر والتسعير المناسب بدل تطبيق نموذج عام.',
        reason: 'اختيار الخدمة يحدد البنود والقواعد التي ينطبق عليها التقدير.'
      };
    } else if (q) {
      action = {
        type: 'ask_field', key: q.key || null,
        title: QUESTION_LABELS[q.key] || 'استكمال بيانات المشروع',
        prompt: String(q.prompt || q.text || 'نحتاج تثبيت معلومة مؤثرة قبل متابعة التقدير.'),
        reason: 'اختير هذا السؤال لأنه يؤثر في نموذج المقايسة أو كمياتها أو نطاقها.'
      };
    } else if (!estimate) {
      action = {
        type: 'run_estimate', title: 'تشغيل المقايسة الأولية',
        prompt: 'المدخلات الأساسية متاحة وفق القواعد الحالية. شغّل الحساب ثم راجع البنود غير المسعّرة والافتراضات قبل الاعتماد.',
        reason: 'لا يوجد سؤال مطلوب حاليًا؛ الخطوة التالية هي حساب البنود المعروفة وإظهار فجوات البيانات.'
      };
    } else if (hasGaps) {
      action = {
        type: 'review_gaps', title: 'استكمال فجوات المقايسة',
        prompt: `توجد ${priceGaps} فجوة سعر و${quantityGaps} فجوة كمية. راجع المصدر والكمية لكل بند قبل التعامل مع الإجمالي كتكلفة مكتملة.`,
        reason: 'وجود نتيجة حساب لا يعني اكتمالها؛ الفجوات تمنع اعتبار التسعير نهائيًا.'
      };
    } else {
      action = {
        type: 'engineering_review', title: 'مراجعة هندسية قبل الاعتماد',
        prompt: 'نتيجة الحساب موجودة، لكن الاعتماد يتطلب مراجعة الرسومات والكميات ومصادر الأسعار والنقل والضرائب ونطاق التوريد.',
        reason: 'المحرك لا يوقع أو يعتمد مقايسة بدل المهندس المسؤول.'
      };
    }

    return {
      stages,
      currentStage,
      progressPercent,
      action,
      gaps: { price: priceGaps, quantity: quantityGaps, total: priceGaps + quantityGaps },
      gates: { estimateExists: !!estimate, engineeringReviewRequired: !reviewComplete, pricingComplete }
    };
  }

  const ROUTES = {
    new_project: ['project.reset', 'project'], correction: ['project.update', 'project'],
    calculate: ['estimate.run', 'estimate'], price_lookup: ['price-catalog.search', 'read'],
    compare_prices: ['price-catalog.compare', 'read'], compare_packages: ['package.compare', 'read'],
    takeoff: ['resource.takeoff', 'read'], gaps: ['price-catalog.audit', 'read'],
    review_estimate: ['estimate.audit', 'read'], savings: ['cost.optimize', 'analysis'],
    scenario: ['scenario.evaluate', 'scenario'], status: ['project.status', 'read'],
    explain: ['boq.explain', 'read'], assumptions: ['project.assumptions', 'read'],
    why: ['decision.explain', 'read'], help: ['agent.capabilities', 'read'],
    request_site_visit: ['service.request', 'request']
  };

  function routeIntent(intent) {
    const name = String(intent || 'unknown');
    const match = ROUTES[name];
    if (!match) return { intent: name, tool: 'intent.clarify', mode: 'clarify', mutatesProject: false };
    return {
      intent: name,
      tool: match[0],
      mode: match[1],
      mutatesProject: match[1] === 'project' || match[1] === 'estimate'
    };
  }

  return { plan, routeIntent };
});
