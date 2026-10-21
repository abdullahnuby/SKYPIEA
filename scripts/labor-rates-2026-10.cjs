'use strict';
// Labor-only rates supplied by the user on 2026-10-21.
//
// These are finishing, concrete, and masonry *labor* rates. They exclude
// materials (steel, cement, sand, aggregate, tiles, paint) unless a row says
// otherwise. Units are preserved exactly as supplied. No blended averages are
// invented: wherever the source gives element-specific rates, each element is
// stored as its own row and the generic catalog line is left open.

const META = {
  id: 'labor-2026-10',
  title: 'قائمة مصنعيات التشطيبات والخرسانات والمباني — أكتوبر 2026',
  shortTitle: 'مصنعيات أكتوبر 2026',
  date: '2026-10-21',
  source: 'قائمة مصنعيات واردة من المستخدم — 2026-10-21',
  currency: 'EGP',
  sourceItems: 31,
  scope: 'labor-only',
  note: 'الأسعار مصنعيات فقط: تشمل أجرة العمالة والصنايعية، ولا تشمل الخامات مثل الحديد والأسمنت والرمل والزلط والبلاط والدهانات إلا إذا ذُكر عكس ذلك. لم يحدد المستخدم شمول الضريبة؛ لذلك taxIncluded=false.',
  factorsNote: 'عوامل التسعير المذكورة لا تُضاف تلقائيًا إلى الأسعار؛ تُعرض كعوامل يجب تطبيقها يدويًا حسب المشروع.'
};

const SECTIONS = [
  {
    key: 'finishing',
    label: 'مصنعيات التشطيبات',
    category: 'المصنعيات والعمالة',
    scope: 'finishing',
    rows: [
      { name: 'تأسيس الكهرباء', unit: 'م²', low: 150, high: 300, note: 'من مساحة الشقة؛ تأسيس فقط، ولا يشمل خامات الأسلاك والمواسير.' },
      { name: 'نقطة كهرباء', unit: 'نقطة', low: 70, high: 120, note: 'نقطة كهرباء كاملة (تأسيس وتوصيل)؛ لا تشمل خامات المفاتيح والبريزات.' },
      { name: 'تأسيس وتشطيب السباكة', unit: 'م²', low: 200, high: 400, note: 'من المساحة المسطحة؛ لا تشمل الأطقم الصحية أو الخامات.' },
      { name: 'سباكة حمام أو مطبخ', unit: 'قطعة', low: 2500, high: 4500, note: 'لكل حمام أو مطبخ؛ لا تشمل الخامات. لا تُحوّل إلى سعر نقطة دون معرفة عدد النقاط.' },
      { name: 'محارة / لياسة', unit: 'م²', low: 50, high: 85, note: 'حوائط وأسقف؛ لا تشمل مونة الأسمنت والرمل.' },
      { name: 'تركيب سيراميك', unit: 'م²', low: 150, high: 300, note: 'تركيب فقط؛ لا يشمل السيراميك أو المواد.' },
      { name: 'تركيب بورسلين', unit: 'م²', low: 300, high: 600, note: 'تركيب فقط؛ لا يشمل البورسلين أو المواد.' },
      { name: 'تركيب رخام أرضيات أو درج', unit: 'م²', low: 350, high: 700, note: 'تركيب فقط؛ لا يشمل الرخام أو المواد.' },
      { name: 'تركيب باركيه / HDF', unit: 'م²', low: 80, high: 150, note: 'تركيب فقط؛ لا يشمل الباركيه أو المواد.' },
      { name: 'جبس بورد مودرن', unit: 'م²', low: 180, high: 350, note: 'السعر ورد لوحدة م² أو م.ط. هذا الصف للمتر المسطح، ويوجد صف مستقل للمتر الطولي بنفس النطاق؛ لا تُجمع الصفوف معًا.' },
      { name: 'جبس بورد مودرن — م.ط', unit: 'م.ط', low: 180, high: 350, note: 'نسخة المتر الطولي من نفس بند الجبس المودرن؛ لا تُجمع مع صف المتر المسطح.' },
      { name: 'جبس بلدي كلاسيك', unit: 'م.ط', low: 150, high: 250, note: 'مصنعية فقط؛ لا تشمل مواد الجبس.' },
      { name: 'نقاشة سادة', unit: 'م²', low: 45, high: 75, note: 'دهان سادة فقط. الدهانات الديكورية 70–120/م² في صف مستقل؛ الدهان الخارجي قد يحتاج سقالات.' },
      { name: 'دهانات ديكورية', unit: 'م²', low: 70, high: 120, note: 'دهانات ديكورية؛ لا تشمل المواد أو السقالات.' },
      { name: 'دهان أبواب خشبية', unit: 'باب', low: 250, high: 400, note: 'دهان باب خشبي؛ لا يشمل الدهان نفسه.' },
      { name: 'دهان باب الشقة الرئيسي', unit: 'باب', low: 500, high: 700, note: 'دهان الباب الرئيسي؛ لا يشمل الدهان نفسه.' },
      { name: 'حلوق أبواب وشبابيك', unit: 'حلقة', low: 100, high: 150, note: 'حلقة واحدة؛ لا تشمل الخامات.' },
      { name: 'تركيب وتجميع أبواب داخلية', unit: 'باب', low: 250, high: 450, note: 'تركيب وتجميع فقط؛ لا يشمل الباب أو الإكسسوارات.' },
      { name: 'تركيب شبابيك ألوميتال', unit: 'قطعة', low: 150, high: 300, note: 'تركيب فقط؛ لا يشمل الشباك أو الزجاج.' }
    ]
  },
  {
    key: 'concrete',
    label: 'مصنعيات الخرسانات',
    category: 'المصنعيات والعمالة',
    scope: 'structure',
    rows: [
      { name: 'قواعد عادية / مسلحة / ميد', unit: 'م³', low: 450, high: 700, note: 'قواعد وميد. يوجد بند منفصل «أساسات مسلحة 290–310» بنطاق مختلف؛ التعارض ظاهر ولم يُدمج.' },
      { name: 'أعمدة ورقاب', unit: 'م³', low: 900, high: 1400, note: 'أعمدة ورقاب. يوجد بند منفصل «أعمدة مسلحة 310 تقريبًا» بنطاق مختلف؛ التعارض ظاهر ولم يُدمج.' },
      { name: 'سقف مصمت Solid Slab', unit: 'م³', low: 550, high: 850, note: 'سقف مصمت. يوجد بند منفصل «أسقف مسلحة 310 تقريبًا» بنطاق مختلف؛ التعارض ظاهر ولم يُدمج.' },
      { name: 'سقف هوردي / فلات سلاب', unit: 'م³', low: 700, high: 1000, note: 'الهوردي والفلات سلاب أعلى من المصمت وفق عامل التسعير المذكور.' },
      { name: 'متر مسطح شامل أعمدة وسقف', unit: 'م²', low: 450, high: 650, note: 'سعر شامل للأعمدة والسقف معًا؛ لا يُجمع مع صفوف الأعمدة أو السقف المنفصلة.' },
      { name: 'خرسانة عادية للبشة', unit: 'م³', low: 90, high: 180, note: 'خرسانة عادية للبشة؛ لا تشمل الخامات.' },
      { name: 'أساسات مسلحة', unit: 'م³', low: 290, high: 310, note: 'القيمة كما وردت منفصلة. تتعارض مع «قواعد عادية/مسلحة/ميد 450–700»؛ لا تُستخدم تلقائيًا لتسعير البند العام.' },
      { name: 'أعمدة مسلحة', unit: 'م³', low: 310, high: 310, note: 'قيمة تقريبية كما وردت (310). تتعارض مع «أعمدة ورقاب 900–1,400»؛ لا تُستخدم تلقائيًا.' },
      { name: 'أسقف مسلحة', unit: 'م³', low: 310, high: 310, note: 'قيمة تقريبية كما وردت (310). تتعارض مع «سقف مصمت 550–850» و«هوردي/فلات 700–1,000»؛ لا تُستخدم تلقائيًا.' },
      { name: 'طبانات السور', unit: 'م.ط', low: 100, high: 100, note: 'متر طولي واحد؛ لا تشمل الخامات.' }
    ]
  },
  {
    key: 'masonry',
    label: 'مباني الطوب',
    category: 'المصنعيات والعمالة',
    scope: 'finishing',
    rows: [
      { name: 'طوب أحمر قاطوع 12 سم', unit: 'م²', low: 35, high: 55, note: 'مصنعية مباني 12 سم على مساحة الحائط.' },
      { name: 'طوب أحمر جدار 25 سم', unit: 'م³', low: 180, high: 260, note: 'مصنعية مباني 25 سم بالحجم. التحويل إلى م² يستخدم سماكة 0.25 م: 45–65/م².' },
      { name: 'مباني بالألف طوبة', unit: '1,000 طوبة', low: 1200, high: 1800, note: 'لكل 1,000 طوبة؛ لا تُجمع مع سعر المتر المسطح دون معرفة عدد الطوب لكل م².' }
    ]
  }
];

// Direct mappings to existing catalog rows used by the frozen BOQ/takeoff
// engines. `update-active` is allowed only because the user's list is dated
// 2026-10-21 and is newer than the active row; the old value is preserved in
// `previousPrice` before overwriting.
const FILLS = [
  {
    rowId: 'P033',
    itemName: 'محارة / لياسة',
    kind: 'fill',
    aliases: ['محارة / لياسة', 'محارة', 'لياسة', 'مصنعية محارة وبياض'],
    note: 'مصنعية محارة ولياسة للحوائط والأسقف؛ لا تشمل مونة الأسمنت والرمل.'
  },
  {
    rowId: 'P037',
    itemName: 'نقطة كهرباء',
    kind: 'update-active',
    aliases: ['نقطة كهرباء', 'مصنعية نقطة كهرباء'],
    note: 'نقطة الكهرباء شاملة التأسيس والتوصيل؛ لا تشمل خامات الأسلاك والمفاتيح والبريزات.'
  },
  {
    rowId: 'P056',
    itemName: 'تركيب سيراميك',
    kind: 'update-active',
    aliases: ['تركيب سيراميك', 'مصنعية تركيب سيراميك', 'سيراميك أرضيات'],
    note: 'تركيب سيراميك للأرضيات؛ لا يشمل السيراميك أو المواد.'
  },
  {
    rowId: 'P090',
    itemName: 'نقاشة سادة',
    kind: 'fill',
    aliases: ['نقاشة سادة', 'دهان سادة', 'مصنعية نقاشة'],
    note: 'دهان سادة فقط. الدهانات الديكورية 70–120/م² في صف مستقل؛ الدهان الخارجي قد يحتاج سقالات.'
  },
  {
    rowId: 'P146',
    itemName: 'جبس بورد مودرن',
    kind: 'fill',
    aliases: ['جبس بورد مودرن', 'جبس بورد', 'مصنعية جبس بورد'],
    note: 'مصنعية تركيب جبس بورد مودرن للمتر المسطح؛ لا تشمل الألواح والبروفايل.'
  }
];

// A single catalog row serves both half-brick (12 cm) and full-brick (25 cm)
// takeoff lines. The source gives 35–55/م² for 12 cm and 180–260/م³ for 25 cm.
// At 0.25 m thickness the latter is 45–65/م². The bridge row therefore stores
// the union 35–65/م², explicitly marked as derived, instead of silently using
// the half-brick rate for full-brick walls.
const DERIVED_FILLS = [
  {
    rowId: 'P130',
    name: 'مصنعية مباني — نطاق جامع',
    unit: 'م²',
    low: 35,
    high: 65,
    avg: 50,
    sourceItems: ['طوب أحمر قاطوع 12 سم', 'طوب أحمر جدار 25 سم'],
    aliases: ['مصنعية مباني', 'مباني 12 سم', 'مباني 25 سم', 'طوب أحمر قاطوع 12 سم', 'طوب أحمر جدار 25 سم'],
    note: 'نصف طوبة 12 سم: 35–55/م². طوبة كاملة 25 سم: 180–260/م³ × 0.25 م = 45–65/م². النطاق الجامع 35–65/م² والقيمة الوسطية 50 للبنود العامة فقط؛ راجع سماكة الحائط قبل الاعتماد.'
  }
];

// The row name is the exact frozen takeoff candidate, so this new row closes
// the marble-labor gap while remaining searchable by the user's wording.
const SPECIAL_NEW = [
  {
    name: 'مصنعية رخام',
    unit: 'م²',
    low: 350,
    high: 700,
    aliases: ['تركيب رخام أرضيات أو درج', 'تركيب رخام', 'مصنعية تركيب رخام'],
    note: 'تركيب رخام أرضيات أو درج؛ لا يشمل الرخام أو المواد.'
  }
];

// Existing lump-sum plumbing rows use "مشروع حمام + مطبخ", while the supplied
// item is "قطعة" (one bathroom or kitchen). They cannot overwrite each other.
// Attach the supplied rate as a comparison quote only.
const COMPARISONS = {
  P126: { itemName: 'سباكة حمام أو مطبخ', note: 'مقارنة فقط: 2,500–4,500 لكل حمام أو مطبخ. السعر النشط 6,500 لمشروع حمام + مطبخ، ووحدة البند مختلفة؛ لم يُستبدل.' },
  P127: { itemName: 'سباكة حمام أو مطبخ', note: 'مقارنة فقط: 2,500–4,500 لكل حمام أو مطبخ. السعر النشط 7,500 لمشروع حمام + مطبخ، ووحدة البند مختلفة؛ لم يُستبدل.' }
};

const FACTORS = [
  { key: 'floor4_no_hoist', label: 'الدور الرابع فأعلى بدون أوناش', effect: '+10–20%', appliesTo: 'labor' },
  { key: 'pump_pour', label: 'الصب بالبمب', effect: 'يقلل مصنعية الصب قليلًا', appliesTo: 'concrete-labor' },
  { key: 'manual_mixer', label: 'الصب اليدوي بالخلاطة النحلة', effect: 'يرفع السعر', appliesTo: 'concrete-labor' },
  { key: 'distance_permits_gates', label: 'المسافات والتصاريح والبوابات', effect: 'قد يرفع السعر', appliesTo: 'all-labor' },
  { key: 'large_areas', label: 'المساحات الكبيرة', effect: 'تسمح بخصم بسيط', appliesTo: 'all-labor' },
  { key: 'slab_type', label: 'نوع السقف والتسليح', effect: 'الفلات سلاب والهوردي أعلى من المصمت', appliesTo: 'concrete-labor' }
];

// Explicit decisions recorded for the report. These are not silent assumptions.
const DECISIONS = [
  {
    key: 'p090_paint',
    decision: 'P090 مصنعية دهانات filled with standard paint labor 45–75/م² (نقاشة سادة).',
    rationale: 'The frozen takeoff uses one row for both interior and exterior paint. The standard rate is the direct match for plain paint; decorative paint 70–120/م² is stored as a separate lookup row rather than inflating the generic row.'
  },
  {
    key: 'p093_concrete',
    decision: 'P093 مصنعية صب خرسانة left open.',
    rationale: 'The supplied concrete rates are element-specific (قواعد 450–700, أعمدة 900–1,400, أسقف 550–1,000/م³) and include a conflicting second set (أساسات/أعمدة/أسقف 290–310). A single m³ average would invent a number and misprice at least one element. Element rows are added for lookup only.'
  },
  {
    key: 'p130_masonry',
    decision: 'P130 مصنعية مباني filled with a derived 35–65/م² bridge.',
    rationale: 'The single frozen row serves both half-brick and full-brick walls. 12 cm is 35–55/م²; 25 cm is 180–260/م³, which is 45–65/م² at 0.25 m thickness. The bridge stores the union, not a hidden average.'
  },
  {
    key: 'p041_p131_plumbing',
    decision: 'P041/P131 plumbing per point left open.',
    rationale: 'The supplied plumbing rates are per م² (200–400) and per bathroom/kitchen piece (2,500–4,500). There is no per-point rate and no supplied points-per-bathroom count, so converting either would be an assumption.'
  },
  {
    key: 'p126_p127_plumbing',
    decision: 'P126/P127 lump sums kept; supplied per-piece rate attached as comparison only.',
    rationale: 'The units differ (مشروع حمام + مطبخ vs قطعة). Overwriting would compare unlike scopes.'
  },
  {
    key: 'p037_p056_updates',
    decision: 'P037 and P056 updated to the dated local labor rate, with previous values preserved.',
    rationale: 'The user list is dated 2026-10-21, newer than P037 (2026-07-01) and P056 (2026-10-19), and is explicitly labor-only. The old values remain in previousPrice for audit.'
  }
];

module.exports = { META, SECTIONS, FILLS, DERIVED_FILLS, SPECIAL_NEW, COMPARISONS, FACTORS, DECISIONS };
