/*
 * Canonical work-breakdown display taxonomy for BENO / MIYAR.
 * This module classifies and orders existing estimate lines for presentation only.
 * It does not alter quantity, rate, pricing, or cost calculations.
 */
'use strict';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[×x]/g, 'x').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ').trim();
}

const SECTION_ORDER = [
  'بيانات المشروع', 'الدراسات والتجهيزات والتكاليف غير المباشرة',
  'الحفر والأساسات', 'الهيكل الخرساني', 'المباني والمحارة',
  'الكهرباء والتيار الخفيف', 'السباكة والصرف', 'التشطيبات',
  'المطبخ والخيارات الإضافية', 'الأسانسير والمعدات الخاصة',
  'أعمال الموقع', 'التسليم', 'مصنعيات متنوعة', 'غير مصنف'
];

const PACKAGE_ORDER = [
  'الحفر والنقل', 'الردم والدك', 'الأعمال الترابية', 'الأساسات', 'العزل المائي للأساسات', 'الخرسانة المسلحة', 'مباني الطوب والمونة', 'المحارة والبياض', 'الطرطشة',
  'أعمال الكهرباء', 'أعمال السباكة والصرف', 'الأدوات الصحية',
  'سيراميك الأرضيات', 'سيراميك الحمامات والمطبخ', 'العزل',
  'أعمال الدهانات', 'الرخام والجرانيت', 'الأبواب والنجارة',
  'الشبابيك والألوميتال', 'الجبس بورد', 'أعمال الأسقف والتشطيبات الأخرى',
  'المطبخ', 'التكييف', 'الأسانسير', 'معدات وخدمات موقع',
  'الدراسات والرسوم', 'اختبارات واعتمادات', 'التسليم والتنظيف', 'مصنعيات متنوعة'
];

const rank = (list, value) => {
  const i = list.indexOf(value);
  return i < 0 ? list.length : i;
};

function normalizedCode(line = {}) {
  return normalize(line.code || line.key)
    .toUpperCase()
    .replace(/^(?:APARTMENT|APT|FLOOR-\d+|GROUND|BASEMENT|FIRST|SECOND|THIRD|FOURTH|ROOF|PROJECT)[-_]*/, '');
}

function kindOf(line = {}) {
  const raw = normalize(line.kind || line.workType || line.type);
  const text = normalize([line.code, line.title, line.item, line.trade].filter(Boolean).join(' '));
  if (/^(?:note|ملاحظه|معلومه)$/.test(raw) || /ملاحظه|معدل مرجعي|معلومه تشغيليه|overview|مراجعه النطاق|تنبيه نطاق|صافي مساحه الوحدات/.test(text)) return { kind: 'note', kindLabel: 'ملاحظة/معلومة' };
  if (/^(?:labor|labour|مصنعيه|عماله)$/.test(raw) || /مصنعيه|اجر يوميه|اجور عمال|تركيب فقط|عماله تركيب|اجر تركيب/.test(text)) return { kind: 'labor', kindLabel: 'مصنعية' };
  if (/^(?:equipment|معدات)$/.test(raw) || /معدات|مضخه|حفار|نقل ناتج|ونش|سقاله|هزاز خرسانه/.test(text)) return { kind: 'equipment', kindLabel: 'معدات/تشغيل' };
  if (/^(?:service|indirect|خدمات|رسوم)$/.test(raw) || /رسوم|ترخيص|تصميم|اشراف|اختبار|اعتماد|توصيل|مصاريف اداريه/.test(text)) return { kind: 'service', kindLabel: 'خدمات/رسوم' };
  if (/optional|اختياري/.test(raw)) return { kind: 'optional', kindLabel: 'اختياري' };
  return { kind: 'material', kindLabel: 'خامات/توريد' };
}

function classifyLine(line = {}) {
  const code = normalizedCode(line);
  const title = normalize(line.title || line.item || '');
  const division = normalize(line.division || line.category || line.trade || '');
  const text = `${code} ${title} ${division}`;
  const output = (section, category) => ({ section, category, ...kindOf(line) });

  if (/OVERVIEW/.test(code) || /مراجعه النطاق|تنبيه نطاق الشقه/.test(text)) return output('بيانات المشروع', 'مراجعة النطاق');
  if (/APT-AREA/.test(code) || /صافي مساحه الوحدات/.test(text)) return output('بيانات المشروع', 'مساحات الدور والوحدات');
  if (/PUBLIC-NETWORKS/.test(code) || /المرافق والشبكات العامه/.test(text)) return output('أعمال الموقع', 'المرافق والشبكات العامة');

  // Specific work-package rules are evaluated first so materials and labor stay together.
  if (/PUTTY|SEALER|PAINT(?:-|$)|PAINT-LAB/.test(code) || /دهان|دهانات|بلاستيك داخلي|سيلر داخلي|معجون داخلي|مصنعيه معجون|برايمر دهان/.test(text)) {
    return output('التشطيبات', 'أعمال الدهانات');
  }
  if (/WET-TILE|WET-MORTAR/.test(code) || /سيراميك حوائط|سيراميك حمامات|سيراميك مناطق رطبه|مناطق رطبه|مونة السيراميك للمناطق الرطبه|مونة تركيب سيراميك حوائط/.test(text)) {
    return output('التشطيبات', 'سيراميك الحمامات والمطبخ');
  }
  if (/FLOOR-TILE|FLOOR-MORTAR|TILE-FLOOR/.test(code) || /سيراميك ارضيات|بورسلين ارضيات|بلاط الارضيات|مصنعيه تركيب بلاط الارضيات|مونة تركيب الارضيات|رمل مونة تركيب ارضيات|اسمنت مونة تركيب ارضيات|مصنعيه تركيب السيراميك للارضيات/.test(text)) {
    return output('التشطيبات', 'سيراميك الأرضيات');
  }
  if (/FOUND-WATERPROOF|BASEMENT-WATERPROOF/.test(code) || /عزل مائي للاساسات|عزل مائي للبدروم/.test(text)) return output('الحفر والأساسات', 'العزل المائي للأساسات');
  if (/WATERPROOF|INSULATION|BITUMEN/.test(code) || /عزل مائي|عزل حراري|عزل اسطح|عزل حمامات|لفائف بيتومين/.test(text)) {
    return output('التشطيبات', 'العزل');
  }
  if (/MARBLE|GRANITE|STAIR-MAT|STAIR-LAB/.test(code) || /رخام|جرانيت|توريد رخام|مصنعيه تركيب رخام/.test(text)) return output('التشطيبات', 'الرخام والجرانيت');
  if (/GYPSUM|CEILING/.test(code) || /جبس بورد|اسقف معلقه|سقف جبسي|كرانيش جبس/.test(text)) return output('التشطيبات', 'الجبس بورد');
  if (/DOOR/.test(code) || /ابواب|باب خشبي|باب داخلي|باب مدخل|حلوق خشب|مصنعيه تركيب باب/.test(text)) return output('التشطيبات', 'الأبواب والنجارة');
  if (/WINDOW/.test(code) || /شبابيك|شباك|الوميتال|upvc|زجاج واجهات|مصنعيه تركيب شبابيك/.test(text)) return output('التشطيبات', 'الشبابيك والألوميتال');
  if (/PLASTER/.test(code) || /محاره|بياض|لياسه/.test(text)) return output('المباني والمحارة', 'المحارة والبياض');
  if (/SPLASH/.test(code) || /طرطشه/.test(text)) return output('المباني والمحارة', 'الطرطشة');
  if (/HALF-BRICK|FULL-BRICK|BRICK-MORTAR|MASONRY/.test(code) || /طوب احمر|طوب\/بلوك|مباني بالطوب|مصنعيه مباني|مونة المباني|مونة حائط/.test(text)) return output('المباني والمحارة', 'مباني الطوب والمونة');
  if (/SANITARY/.test(code) || /اطقم صحيه|ادوات صحيه|خلاطات|طقم حمام|قاعده حمام|حوض غسيل/.test(text)) return output('السباكة والصرف', 'الأدوات الصحية');
  if (/PLUMB|WATER-POINT|DRAIN-POINT|SEWER|SANITARY/.test(code) || /سباكه|صرف صحي|صرف عام|مواسير ppr|مواسير pvc|تغذيه مياه|خامات سباكه|مصنعيه سباكه|نقاط مياه|نقاط صرف|اطقم صحيه|ادوات صحيه|خلاطات|طقم حمام/.test(text)) return output('السباكة والصرف', /اطقم صحيه|ادوات صحيه|خلاطات|طقم حمام/.test(text) ? 'الأدوات الصحية' : 'أعمال السباكة والصرف');
  // Structural classification comes before the broad WIRE/CABLE electrical rule;
  // binding wire and rebar must never leak into electrical works.
  if (/STRUCT|CONCRETE|MIXER|PUMP-CONCRETE|FOUND-CONCRETE|BASEMENT-CONCRETE|REBAR|STEEL|BINDING-WIRE/.test(code) || /مصنعيه الهيكل الخرساني|حديد تسليح|سلك ربط الحديد|أسمنت خلط الخرسانة|رمل خلطة الخرسانة|زلط\/سن خلطة الخرسانة|مياه خلط الخرسانة|خرسانه مسلحه|خرسانه جاهزه|خلط الخرسانه|صب خرسانه|مضخه خرسانه/.test(text)) return output('الهيكل الخرساني', 'الخرسانة المسلحة');
  if (/ELEC|SWITCH|SOCKET|WIRE|CABLE|PANEL|LIGHTING/.test(code) || /كهرباء|كابل|اسلاك|سلك كهرباء|مواسير pvc كهرباء|مفاتيح وبريزات|لوحة توزيع|مصنعيه كهرباء|نقاط اناره/.test(text)) return output('الكهرباء والتيار الخفيف', 'أعمال الكهرباء');
  if (/FOUND-EXC|EXCAVATION|SPOIL/.test(code) || /حفر آلي ونقل|حفر الاساسات|حفر آلي|حفر يدوي|ناتج الحفر/.test(text)) return output('الحفر والأساسات', 'الحفر والنقل');
  if (/BACKFILL/.test(code) || /رمل ردم|مصنعيه الردم|ردم ودك/.test(text)) return output('الحفر والأساسات', 'الردم والدك');
  if (/FOUND|RAFT|BASEMENT/.test(code) || /احلال|اساسات|لبشه|نزح مياه جوفيه/.test(text)) return output('الحفر والأساسات', /احلال|نزح/.test(text) ? 'الأعمال الترابية' : 'الأساسات');
  if (/FORMWORK|SHUTTER/.test(code) || /نجاره مسلحه|شده خشبيه|شده معدنيه/.test(text)) return output('الهيكل الخرساني', 'الخرسانة المسلحة');
  if (/STEEL|REBAR|BINDING-WIRE/.test(code) || /حديد تسليح|حداده مسلحه|سلك ربط/.test(text)) return output('الهيكل الخرساني', 'الخرسانة المسلحة');
  if (/ELEVATOR|LIFT/.test(code) || /اسانسير|مصعد/.test(text)) return output('الأسانسير والمعدات الخاصة', 'الأسانسير');
  if (/KITCHEN/.test(code) || /مطبخ الوميتال|وحدات المطبخ|مطبخ اضافي/.test(text)) return output('المطبخ والخيارات الإضافية', 'المطبخ');
  if (/AIR-CONDITION|\bAC\b/.test(code) || /تكييف|مكيف/.test(text)) return output('المطبخ والخيارات الإضافية', 'التكييف');
  if (/CLEANING/.test(code) || /تنظيف وتسليم|تنظيف نهائي/.test(text)) return output('التسليم', 'التسليم والتنظيف');
  if (/DESIGN|PERMIT|LICENSE/.test(code) || /تصميم معماري|ترخيص|رسوم|تكاليف غير مباشره/.test(text)) return output('الدراسات والتجهيزات والتكاليف غير المباشرة', 'الدراسات والرسوم');
  if (/TEST|TESTING/.test(code) || /اختبارات|فحص تربه|اعتماد/.test(text)) return output('الدراسات والتجهيزات والتكاليف غير المباشرة', 'اختبارات واعتمادات');
  if (/GENERATOR|CRANE|SCAFFOLD|EQUIPMENT/.test(code) || /معدات وخدمات موقع|معدات موقع|نقل وتشوين/.test(text)) return output('أعمال الموقع', 'معدات وخدمات موقع');
  if (/SITE|FENCE|PAVING|LANDSCAPE/.test(code) || /سور|تنسيق موقع|بلاط انترلوك|اعمال الموقع/.test(text)) return output('أعمال الموقع', 'أعمال الموقع العام');

  // Use division only as a weak fallback. Generic labor divisions are intentionally
  // collapsed into a generic package rather than falsely shown as a separate trade.
  if (/مصنعي|عمال/.test(division)) {
    return output('مصنعيات متنوعة', 'مصنعيات متنوعة');
  }
  if (/^التشطيبات?$|^مصنعيات التشطيبات$|^finishing$/.test(division)) return output('التشطيبات', 'أعمال تشطيبات أخرى');
  if (/ارضيات/.test(division)) return output('التشطيبات', 'أعمال أرضيات أخرى');
  if (/دهان/.test(division)) return output('التشطيبات', 'أعمال الدهانات');
  if (/نجاره/.test(division)) return output('التشطيبات', 'الأبواب والنجارة');
  if (/الوميتال|شبابيك/.test(division)) return output('التشطيبات', 'الشبابيك والألوميتال');
  if (/ادوات صحيه/.test(division)) return output('السباكة والصرف', 'الأدوات الصحية');
  if (/تسليم/.test(division)) return output('التسليم', 'التسليم والتنظيف');
  if (/كهرباء/.test(division)) return output('الكهرباء والتيار الخفيف', 'أعمال الكهرباء');
  if (/سباك|صرف/.test(division)) return output('السباكة والصرف', 'أعمال السباكة والصرف');
  if (/خرسان|هيكل|انشائي/.test(division)) return output('الهيكل الخرساني', 'الخرسانة المسلحة');
  if (/مباني|طوب|محاره/.test(division)) return output('المباني والمحارة', 'مباني ومحارة أخرى');
  if (/دراسات|رسوم|مصروفات/.test(division)) return output('الدراسات والتجهيزات والتكاليف غير المباشرة', 'الدراسات والرسوم');
  if (/تشطيب|finishing/.test(normalize(line.scope || ''))) return output('التشطيبات', 'أعمال تشطيبات أخرى');
  const sourceCategory = String(line.category || line.division || '').trim();
  if (sourceCategory && !/^(?:غير مصنف|unclassified|n\/a|—|-)$/i.test(sourceCategory)) {
    return output(String(line.section || 'غير مصنف'), sourceCategory);
  }
  return output(String(line.section || 'غير مصنف'), 'أعمال غير مصنفة');
}

function compareLines(a, b) {
  const sa = rank(SECTION_ORDER, a.section), sb = rank(SECTION_ORDER, b.section);
  if (sa !== sb) return sa - sb;
  const ca = rank(PACKAGE_ORDER, a.category), cb = rank(PACKAGE_ORDER, b.category);
  if (ca !== cb) return ca - cb;
  const code = String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true });
  return code || String(a.title || '').localeCompare(String(b.title || ''), 'ar');
}

module.exports = { normalize, normalizedCode, kindOf, classifyLine, compareLines, SECTION_ORDER, PACKAGE_ORDER };
