'use strict';
// BENO decision brain (no LLM). A deterministic composer that takes the parsed
// extraction result + project state and decides:
//   1. what to acknowledge (typed facts with honest labels),
//   2. contradictions / engineering warnings worth surfacing,
//   3. the next question — selected by information gain, not first-missing,
//   4. the reply text + quick replies for the widget.
// It never invents numbers and never decides prices.

// Information-gain weights per slot per project kind: how much estimate value a
// missing fact unlocks. Higher = ask first. Tied to BOQ division weight
// (foundations/structure >> options).
const WEIGHTS = {
  apartment: [
    ['area', 95], ['pack', 70], ['rooms', 30], ['bathrooms', 25], ['location', 5]
  ],
  building: [
    ['area', 95], ['floors', 85], ['pack', 70], ['unitsPerFloor', 60],
    ['basement', 50], ['elevator', 40], ['rooms', 20], ['bathrooms', 20], ['location', 5]
  ]
};

// Keys the widget can actually ask for (its ask flows are keyed on these).
const WIDGET_ASK_FOR = {
  area: 'area', floors: 'floors', pack: 'package',
  rooms: 'unitDetails', bathrooms: 'unitDetails',
  unitsPerFloor: 'options', basement: 'options', elevator: 'options',
  kitchen: 'options', ac: 'options'
};

function isFilled(v) { return v !== undefined && v !== null && v !== ''; }

function stateHas(p, key) {
  if (!p) return false;
  const value = p[key];
  if (['area','floors','unitsPerFloor'].includes(key)) return Number.isFinite(Number(value)) && Number(value) > 0;
  if (['rooms','bathrooms'].includes(key)) return Number.isFinite(Number(value)) && Number(value) > 0;
  return isFilled(value);
}

function projectKind(p) {
  const code = String((p && p.modelCode) || '');
  if (code.startsWith('BLD-')) return 'building';
  if (code.startsWith('APT-')) return 'apartment';
  if (p && p.service === 'building') return 'building';
  if (p && p.service === 'apartment') return 'apartment';
  // No explicit service: more than one floor describes a building, not a unit.
  return Number(p && p.floors) >= 2 ? 'building' : 'apartment';
}

function filledFactsCount(p, kind) {
  return (WEIGHTS[kind] || []).filter(([key]) => stateHas(p, key)).length;
}

const contextEngine = require('../../engines/beno-context.js');

function chooseNextKey(p, kind, parsedValues, excludeKey) {
  const parsedHas = parsedValues || {};
  const candidates = (WEIGHTS[kind] || [])
    .filter(([key]) => !stateHas(p, key) && !(key in parsedHas) && key !== excludeKey)
    .map(([key, weight]) => {
      // Elevator becomes high-impact for tall buildings (division 09 unlocks).
      const floors = Number(p && p.floors) || 0;
      const boosted = kind === 'building' && key === 'elevator' && floors >= 8 ? 72 : weight;
      return [key, boosted];
    })
    .sort((a, b) => b[1] - a[1]);
  return candidates.length ? candidates[0][0] : null;
}

function mapToWidgetKey(key) { return WIDGET_ASK_FOR[key] || key || 'area'; }

// ---------------------------------------------------------------------------
// Engineering warnings — deterministic contradictions worth telling the client.
function detectWarnings(p) {
  const warnings = [];
  const plot = Number(p && p.plotArea) || 0;
  const built = Number(p && p.area) || 0;
  const floors = Number(p && p.floors) || 0;
  if (plot && built && floors && plot < built * floors * 0.55) {
    warnings.push('سيبك من الفرق: مساحة الأرض أقل بكتير من مسطحات البناء المحسوبة — راجع مساحة الأرض أو مساحة الدور المبني.');
  }
  if (p && p.pack === 'luxury' && built >= 1500) {
    warnings.push('فاخر مع مساحة كبيرة بيضخم ميزانية التشطيبات بفرق كبير؛ هيظهرلك نطاق سعري مش رقم واحد.');
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Reply templates (Egyptian dialect). All stay tied to real state values so no
// invented content can appear.
const ASK_TEMPLATES = {
  area: { title: 'مساحة الدور', text: 'مساحة الدور/الوحدة المبني كام متر مربع؟', reason: 'المساحة هي رأس الكميات: الحديد والخرسانة والمحارة كلها بتنحسب منها.' },
  floors: { title: 'عدد الأدوار', text: 'عدد الأدوار كام (الأرضي بيتحسب معاهم)؟', reason: 'عدد الأدوار بيضرب مساحة الدور عشان يعطي إجمالي المسطحات المبنية.' },
  package: { title: 'مستوى التشطيب', text: 'مستوى التشطيب: اقتصادي، نصف تشطيب، متوسط ولا فاخر؟', reason: 'مستوى التشطيب بتحدد بنود الكتالوج اللي هتنحسب وبتحتك بميزانية كاملة.' },
  scope: { title: 'نطاق الأعمال', text: 'هيكل وبناء بس، تشطيب بس، ولا من الأول للمفتاح؟', reason: 'النطاق بيحدد أقراط العمل دي ليها بنود ولا المقايسة هتفتح أقسام أقل.' },
  unitDetails: { title: 'تفاصيل نموذج الوحدة', text: 'كل وحدة/شقة فيها كام غرفة وكام حمام؟', reason: 'نموذج الوحدة بيوزّع الكهرباء والسباكة والتشطيبات على الوحدات.' },
  options: { title: 'الإضافات المطلوبة', text: 'عايز أسانسير أو بدروم أو تأسيس تكييف أو مطبخ؟', reason: 'الإضافات دي بنود انتخابية صريحة؛ مفيش بند بدخلها من غير اختيار صريح.' }
};

function askTemplateForStateKey(key) {
  return ASK_TEMPLATES[mapToWidgetKey(key)] || null;
}

const FACT_LABELS = {
  area: 'مساحة الدور', plotArea: 'مساحة الأرض', floors: 'عدد الأدوار', rooms: 'عدد الغرف',
  bathrooms: 'عدد الحمامات', unitsPerFloor: 'وحدات الدور', pack: 'الباقة', scope: 'النطاق',
  type: 'نوع المشروع', basement: 'البدروم', elevator: 'الأسانسير', kitchen: 'المطبخ', ac: 'التكييف', location: 'الموقع'
};
const PACK_LABELS = { economic: 'اقتصادي', semi: 'نصف تشطيب', medium: 'متوسط', luxury: 'فاخر' };
const SCOPE_LABELS = { structure: 'هيكل فقط', finishing: 'تشطيب فقط', turnkey: 'على المفتاح' };
const TYPE_LABELS = { residential: 'سكني', commercial: 'تجاري', mixed: 'مختلط' };

function factNumber(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value); }
function formatFact(key, value) {
  if (value === undefined || value === null || value === '') return 'غير محدد';
  if (typeof value === 'boolean') return value ? 'مفعّل' : 'ملغي';
  if (key === 'pack') return PACK_LABELS[value] || String(value);
  if (key === 'scope') return SCOPE_LABELS[value] || String(value);
  if (key === 'type') return TYPE_LABELS[value] || String(value);
  if (key === 'area' || key === 'plotArea') return `${factNumber(value)} م²`;
  if (key === 'floors') return `${factNumber(value)} أدوار`;
  if (key === 'rooms') return `${factNumber(value)} غرف`;
  if (key === 'bathrooms') return `${factNumber(value)} حمامات`;
  if (key === 'unitsPerFloor') return `${factNumber(value)} وحدات/دور`;
  return String(value);
}
function factLabel(key) { return FACT_LABELS[key] || key; }
function pendingLabel(key) { return ({ area: 'مساحة الدور', floors: 'عدد الأدوار', package: 'الباقة', scope: 'النطاق', options: 'الوحدات والإضافات', unitDetails: 'الغرف والحمامات', material: 'الخامة' })[key] || 'بيانات المشروع'; }

function composeAck(found) {
  if (!Array.isArray(found) || !found.length) return '';
  const shown = found.slice(0, 3).map(String);
  return `سجلت: ${shown.join('، ')}${found.length > 3 ? ' — وفيه تفاصيل أكتر اتسجلت.' : '.'}`;
}

function buildQuickReplies(widgetKey) {
  if (widgetKey === 'package') return ['اقتصادي', 'نصف تشطيب', 'متوسط', 'فاخر'];
  if (widgetKey === 'scope') return ['هيكل فقط', 'تشطيب فقط', 'على المفتاح'];
  if (widgetKey === 'options') return ['فيه أسانسير', 'مفيش أسانسير', 'فيه بدروم', 'مفيش بدروم'];
  if (widgetKey === 'unitDetails') return ['3 غرف وحمامين', '2 غرفة وحمام'];
  return [];
}

function planConversation(opts) {
  const parsed = opts && opts.parsed && typeof opts.parsed === 'object' ? opts.parsed : { values: {}, found: [], intent: 'unknown' };
  const project = opts && opts.state && typeof opts.state === 'object' ? opts.state : {};
  const pending = opts && opts.pending ? String(opts.pending) : null;
  const message = String(opts && opts.message ? opts.message : (parsed.normalized || ''));
  const history = Array.isArray(opts && opts.history) ? opts.history : [];

  // Deterministic dialogue-context resolution (acts, focus, undo, reuse).
  const context = contextEngine.resolve({ message, pending, state: project, history, values: parsed.values || {} });

  const values = { ...(parsed.values || {}) };
  let found = Array.isArray(parsed.found) ? [...parsed.found] : [];

  // A comparison question must not silently change the package.
  if (context.act === 'compare') {
    delete values.pack;
    found = found.filter(f => !String(f).includes('الباقة') && !String(f).includes('باقة'));
  }
  if (context.revert) {
    values[context.revert.key] = context.revert.value;
    found = [`${factLabel(context.revert.key)} ${formatFact(context.revert.key, context.revert.value)}`];
  }
  for (const [key, value] of Object.entries(context.patches || {})) {
    values[key] = value;
    if (!found.some(f => String(f).includes(factLabel(key)))) found.push(`${factLabel(key)} ${formatFact(key, value)}`);
  }

  const reply = [];
  const quickReplies = [];
  const changed = found.length > 0;
  const mergedProject = { ...project, ...values };
  const kind = projectKind(mergedProject);

  if (context.revert) reply.push(`رجّعت ${factLabel(context.revert.key)} لـ ${formatFact(context.revert.key, context.revert.value)}.`);
  else if (context.act === 'change' && changed) reply.push(`عدّلت: ${found.slice(0, 3).join('، ')}${found.length > 3 ? ' — وفيه تفاصيل أكتر.' : '.'}`);
  else if (changed) reply.push(composeAck(found));

  let suppressNext = false;

  if (context.act === 'cancel') {
    if (context.revert) reply.push('التعديل اللي قبله رجع زي ما كان.');
    else if (context.askValue) reply.push(`آخر تعديل مسجل على ${factLabel(context.askValue)} كان مرة واحدة بس ومعرفش القيمة اللي قبله. اكتب القيمة القديمة وأنا أرجّعها.`);
    else if (context.skipPending) reply.push(`تمام، سيبنا سؤال ${pendingLabel(pending)}.`);
    else reply.push('مفيش تعديل مسجل في الجلسة دي أرجّعه. لو عايز نبدأ من الأول قولي «ابدأ من جديد».');
  }

  if (context.act === 'reuse') {
    const facts = Object.keys(FACT_LABELS).filter(k => stateHas(project, k) || values[k] !== undefined).slice(0, 4)
      .map(k => `${factLabel(k)} ${formatFact(k, values[k] !== undefined ? values[k] : project[k])}`);
    reply.push(facts.length ? `ماشي على نفس بيانات المشروع: ${facts.join('، ')}.` : 'لسه مفيش بيانات محفوظة في الجلسة دي. ابدأ بمساحة الدور وأنا أكمل.');
  }

  if (context.act === 'compare') {
    const pack = context.compare && context.compare.pack;
    reply.push(pack ? `مقارنة ${PACK_LABELS[pack] || pack} بباقي المستويات بتطلع على نفس بيانات المشروع.` : 'مقارنة الباقات بتطلع على نفس بيانات المشروع.');
    reply.push('عشان المقارنة تبقى أرقام حقيقية مش تقديرات، محتاج مقايسة محسوبة الأول. نكمل بيانات المشروع؟');
    suppressNext = true;
  }

  if (context.act === 'clarify') {
    const template = pending ? askTemplateForStateKey(pending) : null;
    reply.push(template ? `بمعنى أبسط: ${template.text}` : 'أوضح أكتر: اكتب بيانات المشروع الأساسية — مساحة الدور، عدد الأدوار، ومستوى التشطيب — وأنا أكمل.');
    if (template && template.reason) reply.push(`(السبب: ${template.reason})`);
  }

  if (context.askFocus) {
    reply.push('تحب أعدّل إيه بالظبط؟ المساحة، عدد الأدوار، الباقة، ولا الإضافات؟');
    quickReplies.push('المساحة', 'عدد الأدوار', 'الباقة', 'الإضافات');
    suppressNext = true;
  }

  if (context.act === 'deny' && !changed && !pending) reply.push('تمام، صحّح اللي تحبه وأنا أحدّث البيانات.');

  // Next question: skip a question the user just cancelled, and never ask a
  // follow-up while a comparison or focus clarification is pending.
  const pendingWidget = context.skipPending ? null : pending;
  let nextKey = null;
  if (!pendingWidget && !suppressNext && (mergedProject.service || context.serviceHint || stateHas(mergedProject, 'area') || stateHas(mergedProject, 'floors') || Object.keys(values).length)) {
    nextKey = chooseNextKey(mergedProject, kind, values, context.skipPending ? context.focus : null);
  }
  let nextWidgetKey = suppressNext ? null : (pendingWidget || (nextKey ? mapToWidgetKey(nextKey) : null));
  let template = nextWidgetKey ? askTemplateForStateKey(nextWidgetKey) : null;
  let hideTemplate = false;

  if (context.act === 'clarify') {
    if (pending) {
      nextWidgetKey = pending;
      template = askTemplateForStateKey(pending);
      quickReplies.push(...buildQuickReplies(pending));
    } else {
      nextWidgetKey = null;
      template = null;
    }
    hideTemplate = true; // the explanation above already restates the question
  }

  if (context.serviceHint && (!project || !project.service) && !suppressNext && !stateHas(mergedProject, 'area')) {
    reply.push(context.serviceHint === 'building' ? 'ماشي، هنمشي في مشروع مبنى/عمارة.' : 'ماشي، هنمشي في مشروع شقة.');
  }
  if (!suppressNext && context.act !== 'clarify') quickReplies.push(...buildQuickReplies(nextWidgetKey));

  const warnings = detectWarnings({ ...project, ...values });
  const needsConfirmation = Array.isArray(parsed.needsConfirmation) ? parsed.needsConfirmation.slice(0, 3) : [];

  if (warnings.length) reply.push(warnings[0]);
  if (needsConfirmation.length) {
    reply.push(`(${needsConfirmation[0].label}: سجلتها بمطابقة مش قطعية — لو غلط عدّلها وأنا أعود يتحقق حسابًا)`);
  }

  if (!suppressNext && context.act !== 'clarify') {
    if (template && !hideTemplate) {
      reply.push(`${template.text}`);
      if (nextKey && !pendingWidget && template.reason) reply.push(`(ليه السؤال ده؟ ${template.reason})`);
    } else if (pendingWidget && !template) {
      reply.push('فين ردك على المعلومة المطلوبة؟');
    } else if (!mergedProject || !mergedProject.service) {
      if (!context.serviceHint) reply.push('نبدأ: عايز تسعير لشقة ولا عمارة؟');
    } else {
      reply.push('البيانات الأساسية مش بتضيق؛ تقدر تحسب المقايسة أو تراجع النواقص.');
    }
  }

  // Honest progress: share of the info-gain checklist filled, labeled تخطيطي.
  const total = (WEIGHTS[kind] || []).length;
  const filled = filledFactsCount(mergedProject, kind) + Object.keys(values).length;
  const progressPercent = total ? Math.min(100, Math.round((filled / total) * 100)) : 0;

  let action = null;
  if (context.act === 'compare') action = { type: 'compare_packages', pack: (context.compare && context.compare.pack) || null };
  else if (context.revert) action = { type: 'revert', key: context.revert.key, value: context.revert.value };

  return {
    reply: reply.filter(Boolean).join(' ').trim(),
    nextQuestion: nextWidgetKey ? { key: nextWidgetKey, title: (template && template.title) || 'استكمال بيانات المشروع' } : null,
    quickReplies: [...new Set(quickReplies.filter(Boolean))].slice(0, 4),
    needsConfirmation,
    progressPercent,
    warnings,
    planKind: kind,
    act: context.act,
    focus: context.focus || null,
    action,
    serviceHint: context.serviceHint || null,
    serviceCorrection: !!context.serviceCorrection,
    handled: context.act !== 'answer',
    values,
    found
  };
}

module.exports = { planConversation, chooseNextKey, detectWarnings, mapToWidgetKey, WEIGHTS, ASK_TEMPLATES };
