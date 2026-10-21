'use strict';

const fs = require('node:fs');
const path = require('node:path');
const KNOWLEDGE = JSON.parse(fs.readFileSync(path.join(__dirname, '../api/_data/boq-knowledge.v1.json'), 'utf8'));

const norm = value => String(value || '').normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const categoryMap = new Map(Object.entries(KNOWLEDGE.taxonomyMappings).map(([a,b]) => [norm(a), b]));

function classifyPackage(row) {
  const t = norm([row.id, row.name, row.category, row.sourceCategory, row.note].filter(Boolean).join(' '));
  // Work scopes that need precise classification are intentionally tested before broad material/category matches.
  if (/حفر|ناتج الحفر|حفار|ردم|دك|احلال|نزح مياه|تدعيم جوانب/.test(t)) return /ردم|دك/.test(t) ? 'backfill_and_compaction' : 'excavation_and_haulage';
  if (/اختبار تربه|فحص تربه|جسات|اعتماد|ترخيص|رسوم|اشراف|تصميم|تكاليف غير مباشره|مصاريف اداريه/.test(t)) return 'other_trades';
  if (/خرسان|حديد تسليح|سلك ربط|مضخه خرسانه|نجاره مسلحه|شده خشبيه|شده معدنيه|فورم|كراسي بلاستيك/.test(t)) return 'reinforced_concrete';
  if (/عزل|بيتومين|ممبرين|لفائف|رول عزل|عزل حراري|فايبر جلاس/.test(t)) return /اساسات|قواعد|بدروم/.test(t) ? 'foundation_waterproofing' : 'foundation_waterproofing';
  if (/طوب|بلوك|مباني|مونه المباني|طوبه/.test(t)) return 'masonry';
  if (/محاره|بياض|لياسه|طرطشه/.test(t)) return 'plaster_and_splash';
  if (/دهان|دهانات|بويا|بلاستيك|سيلر|معجون|برايمر/.test(t)) return 'painting_system';
  if (/رخام|جرانيت|سيراميك|بورسلين|بلاط|ارضيات|تركيب حجر/.test(t)) return 'floor_wall_finishes';
  if (/جبس بورد|اسقف معلقه|كرانيش جبس|الواح جبسيه/.test(t)) return 'ceilings_gypsum';
  if (/كهرب|كابل|اسلاك|مفتاح|بريزه|لوحه توزيع|نقاط اناره|تيار خفيف|مواسير pvc كهرباء/.test(t)) return 'electrical';
  if (/سباك|صرف|مواسير مياه|مواسير صرف|طقم حمام|ادوات صحيه|خلاط|قاعده حمام|حوض غسيل|نقاط مياه|نقاط صرف/.test(t)) return 'plumbing_and_sanitary';
  if (/باب|ابواب|خشب داخلي|حلوق|شبابيك|شباك|الوميتال|زجاج واجهات|upvc/.test(t)) return 'doors_windows_wood_aluminum';
  if (/مطبخ|وحدات مطبخ|رخامه مطبخ/.test(t)) return 'other_trades';
  if (/تكييف|مكيف/.test(t)) return 'other_trades';
  if (/اسانسير|مصعد/.test(t)) return 'other_trades';
  if (/تنظيف|تسليم نهائي/.test(t)) return 'other_trades';
  if (/معده|نقل وتشوين|ونش|سقاله|مولد|هزاز/.test(t)) return 'other_trades';
  return 'other_trades';
}

function classifyKind(row) {
  const t = norm([row.name, row.category, row.note, row.laborItem].filter(Boolean).join(' '));
  if (row.derived || row.derivedFrom || row.bridgeOf || row.alternateOf) return 'reference_or_alternative';
  if (row.laborOnly || row.kind === 'labor' || /مصنعيه|عماله|اجره|تركيب فقط/.test(t)) return 'labor';
  if (/مضخه|حفار|نقل ناتج الحفر|معدات|ونش|سقاله|مولد|هزاز/.test(t)) return 'equipment_or_operation';
  if (/رسوم|ترخيص|اختبار|فحص تربه|تصميم|اشراف|اعتماد|توصيل/.test(t)) return 'service_or_fee';
  if (/نظافه|تسليم/.test(t)) return 'service';
  if (/طقم حمام|ادوات صحيه|خلاط|حوض|قاعده حمام/.test(t)) return 'fixture';
  return 'material';
}

function classifyScope(row, packageKey) {
  const t = norm([row.id, row.name, row.note, row.source].filter(Boolean).join(' '));
  if (row.status === 'missing' || row.avg == null) return 'unpriced_gap';
  if (row.derived || row.derivedFrom || row.id === 'B26-003' || /مشتق|مرجعي|مؤشر مساحي/.test(t)) return 'derived_reference_not_supplier_quote';
  if (row.laborOnly || row.kind === 'labor' || /مصنعيه|عماله|تركيب فقط/.test(t)) return 'labor_only';
  if (row.id === 'P162' || /شامل الحفار والتحميل والنقل/.test(t)) return 'inclusive_excavation_and_transport';
  if (/حفر الي بالحفار/.test(t)) return 'excavation_only';
  if (/نقل ناتج الحفر/.test(t)) return 'transport_only';
  if (/مصنعيه الهيكل الخرساني شامله/.test(t)) return 'inclusive_structural_labor';
  if (/خرسانه جاهزه/.test(t)) return 'ready_mix_supply';
  if (/مشروع شقه|طقم حمام|مشروع$/.test(norm(row.unit))) return 'lump_sum_or_set';
  if (/رسوم|ترخيص|اختبار|فحص تربه|تصميم|اشراف|توصيل|تكاليف غير مباشره/.test(t)) return 'service_or_fee';
  if (packageKey === 'excavation_and_haulage') return 'scope_needs_quote_review';
  if (packageKey === 'other_trades') return 'supplier_quote_scope';
  return 'single_item_supply_rate';
}

const inactiveRules = [
  {id:'P079', canonicalId:'P156', reason:'صف قديم لنفس طقم الحمام الاقتصادي؛ أبقيناه في السجل للتتبع، والصف النشط المرجعي هو P156.'},
  {id:'P080', canonicalId:'P155', reason:'صف قديم لنفس طقم الحمام المتوسط؛ أبقيناه في السجل للتتبع، والصف النشط المرجعي هو P155.'},
  {id:'P081', canonicalId:'P157', reason:'صف قديم لنفس طقم الحمام الفاخر؛ أبقيناه في السجل للتتبع، والصف النشط المرجعي هو P157.'},
  {id:'P154', canonicalId:'P123', reason:'تعارض وحدة لنفس الاسم: طقم حمام مقابل وحدة. أوقف الصف الخاطئ ولا تخلط سعر خلاط مفرد بسعر طقم حمام.'},
  {id:'P160', canonicalId:'P020', reason:'تكرار لنفس مصنعية مضخة الخرسانة وبنفس الوحدة والنطاق؛ يستخدم P020 كصف مرجعي واحد.'},
  {id:'P131', canonicalId:'P041', reason:'تكرار لسعر نقطة السباكة المشتق، وليس سعر سوق مستقلًا؛ يستخدم P041 مع وسم السعر المشتق.'},
  {id:'B26-001', canonicalId:'P033', reason:'مرادف مكرر لمصنعية المحارة العامة بنفس الوحدة والنطاق.'},
  {id:'B26-002', canonicalId:'P056', reason:'مرادف مكرر لمصنعية تركيب السيراميك بنفس الوحدة والنطاق.'},
  {id:'B26-005', canonicalId:'P146', reason:'مرادف مكرر لمصنعية جبس بورد بالمتر المسطح؛ أبقِ سجل المتر الطولي المختلف مستقلًا إن وُجد.'},
  {id:'B26-006', canonicalId:'P146', reason:'مرادف مكرر لمصنعية تركيب جبس بورد بالمتر المسطح.'},
  {id:'P153', canonicalId:'P050', reason:'تكرار توريد الباب الداخلي بنفس الوحدة والسعر؛ يظل P050 الاسم التوافقي الأساسي، ويحتفظ بهذا الاسم كمرادف.'},
  {id:'P159', canonicalId:'P027', reason:'مرادف فحص/اختبار التربة بنفس وحدة المشروع والسعر؛ الصف P027 هو المرجع الأساسي.'}
];

function cleanPriceBook(book) {
  if (!book || !Array.isArray(book.prices)) throw new Error('Expected a price-book object with prices[].');
  const byId = new Map(book.prices.map(row => [String(row.id), row]));
  const sourceCategories = {};
  for (const row of book.prices) {
    if (!row || typeof row !== 'object') continue;
    const originalCategory = String(row.category || '').trim();
    const packageKey = classifyPackage(row);
    const packageDef = KNOWLEDGE.workPackages.find(group => group.key === packageKey);
    const genericLaborCategory = /^(?:المصنعيات والعمالة|المصنعيات|مصنعيات التشطيبات)$/u.test(originalCategory);
    let canonicalCategory = categoryMap.get(norm(originalCategory)) || originalCategory;
    // Labor is a cost type, not a separate trade. Put it under the same construction
    // category as its work package; only genuinely unmapped labor stays in a generic bucket.
    if (genericLaborCategory) canonicalCategory = packageKey !== 'other_trades' ? packageDef.category : 'مصنعيات متنوعة';
    if (!KNOWLEDGE.canonicalCategories.includes(canonicalCategory)) canonicalCategory = packageDef?.category || 'مصنعيات متنوعة';
    if (canonicalCategory !== originalCategory) {
      row.sourceCategory = row.sourceCategory || originalCategory;
      row.category = canonicalCategory;
      sourceCategories[row.id] = {from: originalCategory, to: canonicalCategory};
    }
    row.workPackage = packageKey;
    row.tradeCode = packageKey;
    row.itemKind = classifyKind(row);
    row.priceScope = classifyScope(row, packageKey);
    row.knowledgeVersion = KNOWLEDGE.schemaVersion;
    row.engineerReview = row.status === 'missing' ? 'price_or_scope_required' : (row.derived || row.derivedFrom ? 'derived_reference' : (row.confidence === 'ضعيفة' || packageKey === 'other_trades' ? 'review_before_execution' : 'catalog_entry'));
    if (!Array.isArray(row.aliases)) row.aliases = [];
    row.aliases = [...new Set(row.aliases.map(x=>String(x).trim()).filter(Boolean))];
    if (row.status === 'missing') {
      row.low = null; row.avg = null; row.high = null;
      row.priceScope = 'unpriced_gap';
      row.engineerReview = 'price_or_scope_required';
    }
    if (row.derived || row.derivedFrom || row.bridgeOf || row.alternateOf) {
      row.recordRole = 'derived_or_alternate_reference';
    } else {
      row.recordRole = 'catalog_item';
    }
  }
  // Canonical spellings/aliases let old estimate models continue matching by prior item names.
  const addAliases = (id, names) => {
    const row = byId.get(id); if (!row) return;
    row.aliases = [...new Set([...(row.aliases || []), ...names])];
  };
  addAliases('P020', ['أجرة مضخة خرسانة']);
  addAliases('P033', ['مصنعية محارة', 'محارة وبياض', 'مصنعية محارة وبياض']);
  addAliases('P041', ['مصنعية تأسيس سباكة — نقطة', 'مصنعية سباكة نقطة']);
  addAliases('P050', ['باب خشب داخلي', 'أبواب خشب', 'باب داخلي']);
  addAliases('P056', ['تركيب سيراميك', 'مصنعية تركيب سيراميك', 'تركيب بلاط']);
  addAliases('P146', ['مصنعية جبس', 'مصنعية تركيب جبس بورد', 'جبس بورد مودرن']);
  addAliases('P027', ['فحص تربة']);
  addAliases('P156', ['أطقم صحية اقتصادي']);
  addAliases('P155', ['أطقم صحية متوسط']);
  addAliases('P157', ['أطقم صحية فاخر']);

  // Mark legacy duplicates inactive, preserving ID, history, and exact reason.
  for (const rule of inactiveRules) {
    const row = byId.get(rule.id); if (!row) continue;
    row.active = false;
    row.searchable = false;
    row.deprecated = true;
    row.canonicalId = rule.canonicalId;
    row.deprecatedReason = rule.reason;
    row.recordRole = 'deprecated_duplicate_or_conflict';
    row.priceScope = 'deprecated_not_for_matching';
    row.engineerReview = 'historical_record';
    row.aliases = [...new Set([...(row.aliases || [])])];
  }
  // Scope rules from the engineer are machine-readable on the relevant catalogue rows.
  const includes = {
    P162: ['تشغيل الحفار الآلي','تحميل ناتج الحفر','نقل ناتج الحفر وفق مسافة ومقلب محددين في العرض'],
    P165: ['مصنعية الحدادة','مصنعية النجارة المسلحة','الشدة الخشبية أو المعدنية','الصب'],
    P163: ['توريد رمل الردم فقط؛ لا يشمل مصنعية الردم والدمك'],
    P171: ['مصنعية الردم والدمك فقط؛ لا تشمل توريد الرمل'],
    P023: ['الحفر الآلي فقط؛ لا يشمل النقل ما لم ينص العرض'],
    P025: ['نقل ناتج الحفر فقط؛ لا يشمل تشغيل الحفار'],
    P119: ['قيمة مرجعية إجمالية لشقة 100 م² وفق المصدر'],
    'B26-003': ['مؤشر مساحة مشتق من إجمالي شقة مرجعية؛ ليس حصر كابلات أو دوائر']
  };
  const excludes = {
    P162: ['رسوم المقلب غير المذكورة في العرض','نزح المياه الجوفية','تدعيم جوانب الحفر غير المذكور بالعقد'],
    P163: ['مصنعية الردم والدمك'],
    P171: ['توريد رمل الردم'],
    P023: ['نقل ناتج الحفر'],
    P025: ['أجرة الحفار'],
    P165: ['توريد الحديد والأسمنت والرمل والزلط والمياه'],
    'B26-003': ['لا يستخدم بدل حصر الكابلات والدوائر والنقاط']
  };
  for (const [id, list] of Object.entries(includes)) if (byId.has(id)) byId.get(id).includes = list;
  for (const [id, list] of Object.entries(excludes)) if (byId.has(id)) byId.get(id).excludes = list;
  if (byId.has('P041')) {
    byId.get('P041').priceScope = 'derived_reference_not_market_quote';
    byId.get('P041').engineerReview = 'derived_reference';
    byId.get('P041').note = `${byId.get('P041').note || ''} تنبيه قاعدة البيانات: مشتق من سعر/م² وكثافة نقاط، وليس عرضًا مستقلًا لنقطة السباكة.`.trim();
  }
  if (byId.has('B26-003')) {
    byId.get('B26-003').priceScope = 'derived_reference_not_execution_boq';
    byId.get('B26-003').engineerReview = 'derived_reference';
  }
  book.knowledgeBase = {
    file: 'api/_data/boq-knowledge.v1.json',
    version: KNOWLEDGE.schemaVersion,
    migration: 'agent-data-cleanup-2026-10',
    normalizedCategoryCount: Object.keys(sourceCategories).length,
    normalizedCategories: sourceCategories,
    deactivatedDuplicateOrConflictingRows: inactiveRules.map(x=>x.id)
  };
  return book;
}

module.exports = { cleanPriceBook, classifyPackage, classifyKind, classifyScope, KNOWLEDGE };
