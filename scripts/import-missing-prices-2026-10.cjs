'use strict';
// Fill the price gaps that the supplied January 2026 bulletin and October 2026
// labor list can support, without editing any frozen engine.
//
// Policy:
//  - Direct source prices keep the source date and source name.
//  - A bridge row is added only when a frozen engine looks up an exact name that
//    differs from a priced catalog row; the bridge carries the same source price
//    and a `bridgeOf` reference.
//  - Derived values are allowed only with an explicit formula, marked
//    `derived:true`, and a warning. No density or quantity is invented.
//  - Unit corrections are made only when the source gives an exact conversion
//    (roll of 100 m -> per meter) or when the catalog unit is a combined label
//    that prevents the matching unit from being read. The old unit is preserved.
//  - Rows with no supplied price stay missing. They are listed in the report.
//
// Usage: node scripts/import-missing-prices-2026-10.cjs
// Output: .tmp-missing-export.json + MISSING-PRICES-2026-10-IMPORT.json
// Then:   node scripts/publish-price-book.cjs .tmp-missing-export.json

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const engine = require('../engines/miyar-engine.js');
const rates = require('../engines/miyar-rates.js');
const models = require('../engines/miyar-project-models.js');

const root = path.resolve(__dirname, '..');
const basePath = path.join(root, 'api/_data/price-book.v3.json');
const baseRaw = fs.readFileSync(basePath, 'utf8');
const base = JSON.parse(baseRaw);
const prices = JSON.parse(JSON.stringify(base.prices));
const settings = JSON.parse(JSON.stringify(base.settings || {}));
const byId = new Map(prices.map(p => [p.id, p]));
const actions = [];
const newRows = [];
const unitCorrections = [];
const derivedBridges = [];

const BULLETIN = 'نشرة أسعار مواد البناء — يناير 2026 (Scribd)';
const BULLETIN_DATE = '2026-01-01';
const LABOR = 'قائمة مصنعيات واردة من المستخدم — 2026-10-21';
const LABOR_DATE = '2026-10-21';
const BATCH = 'missing-2026-10';

const r2 = n => Math.round(n * 100) / 100;
const addNote = (old, extra) => {
  if (!extra) return old || '';
  if (!old) return extra;
  return String(old).includes(extra) ? old : `${old} — ${extra}`;
};
const money = n => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));

// ---------------------------------------------------------------------------
// 1) Explicit fills of existing rows. Every target is currently missing.
// ---------------------------------------------------------------------------
const FILLS = [
  {
    id: 'P060', unit: 'م²', low: 155, avg: 157.5, high: 160,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'رولات عزل بيتوميني 3 مم: 155–160/م². البيتومين المؤكسد بالكيلوجرام في P139 (25/كجم). السعر خامة فقط، ولا يشمل مصنعية العزل P145. لا تجمع مع P138 في نفس البند.',
    alternateOf: 'P138',
    quote: {
      name: 'عازل رطوبة بيتوميني 3 مم — نطاق', unit: 'م²', low: 155, avg: 157.5, high: 160,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true, derived: true,
      note: 'النطاق من صفين: عازل فايبر جلاس 155/م²، عازل بوليستر مسلح 160/م².'
    }
  },
  {
    id: 'P069', unit: 'م²', low: 180, avg: 202.5, high: 225,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'بلاطات جبسية 9.5–12.5 مم: 180–225/م². خامة فقط؛ مصنعية التركيب P146 (180–350/م²) منفصلة. الأكسسوارات والبروفايلات غير مشمولة.',
    quote: {
      name: 'بلاطات جبسية 9.5–12.5 مم — نطاق', unit: 'م²', low: 180, avg: 202.5, high: 225,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true, derived: true,
      note: '180/م² للبلاطات العادية 9.5 مم، و225/م² للمثقبة أو المضادة للبكتيريا 12.5 مم.'
    }
  },
  {
    id: 'P077', unit: 'م', low: 38.85, avg: 38.85, high: 38.85,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    rollPrice: 3885, rollLength: 100,
    note: 'لفة 100 م = 3,885 جنيه؛ سعر المتر = 38.85. السعر خامة فقط. لا تضرب سعر اللفة في عدد الأمتار؛ استخدم سعر المتر.',
    quote: {
      name: 'أسلاك نحاس PVC 4 مم — لفة 100 م', unit: 'لفة 100 م', low: 3885, avg: 3885, high: 3885,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true,
      conversion: '3,885 ÷ 100 = 38.85/م',
      note: 'الوحدة الأصلية لفة 100 م؛ حُوّلت إلى سعر المتر بقسمة صحيحة.'
    }
  },
  {
    id: 'P078', unit: 'م', low: 58.5, avg: 58.5, high: 58.5,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    rollPrice: 5850, rollLength: 100,
    note: 'لفة 100 م = 5,850 جنيه؛ سعر المتر = 58.5. السعر خامة فقط. لا تضرب سعر اللفة في عدد الأمتار؛ استخدم سعر المتر.',
    quote: {
      name: 'أسلاك نحاس PVC 6 مم — لفة 100 م', unit: 'لفة 100 م', low: 5850, avg: 5850, high: 5850,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true,
      conversion: '5,850 ÷ 100 = 58.5/م',
      note: 'الوحدة الأصلية لفة 100 م؛ حُوّلت إلى سعر المتر بقسمة صحيحة.'
    }
  },
  {
    id: 'P088', unit: 'م²', low: 450, avg: 465, high: 480,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'حجر ميكا 10×20 = 450/م²، حجر هاشمي = 480/م². خامة فقط؛ التركيب والتثبيت والسقالات غير مشمولة. P114 بديل.',
    quote: {
      name: 'واجهة حجر — نطاق', unit: 'م²', low: 450, avg: 465, high: 480,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true, derived: true,
      note: '450 للميكا، 480 للهاشمي؛ لا يشمل التركيب.'
    }
  },
  {
    id: 'P052', unit: 'م²', low: 440, avg: 682.5, high: 925,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'نطاق 16 نوع رخام/جرانيت: 440–925/م². النوع والسماكة والتشطيب يحددون السعر؛ التركيب غير مشمول. P089 للسلالم، P112 بديل.',
    quote: {
      name: 'رخام/جرانيت (نطاق النشرة)', unit: 'م²', low: 440, avg: 682.5, high: 925,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true, derived: true,
      note: 'النطاق من 16 نوعًا؛ السعر النشط 682.5 وسط النطاق وليس سعر نوع محدد.'
    }
  },
  {
    id: 'P038', unit: 'م', low: 40, avg: 210, high: 380,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'مواسير صرف مدعمة 1/2–6 بوصة: 40–380/م. اختر القطر قبل الشراء. لا تجمع مع P120–P122 عند اختيار قطر محدد.',
    quote: {
      name: 'مواسير صرف مدعمة 1/2–6 بوصة — نطاق', unit: 'م', low: 40, avg: 210, high: 380,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true, derived: true,
      note: 'النطاق واسع لأنه يغطي ستة أقطار؛ السعر النشط 210 وسط النطاق وليس سعر قطر محدد.'
    }
  },
  {
    id: 'P135', unit: 'لتر', low: 45, avg: 125, high: 225,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'النطاق 45–225/لتر. السعر النشط 125 للطلاء المط الداخلي عالي الجودة أبيض؛ الاقتصادي 45، والفاخر 135–225. لا يشمل المعجون أو السيلر.',
    quote: {
      name: 'مط داخلي عالي الجودة أبيض', unit: 'لتر', low: 125, avg: 125, high: 125,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true,
      note: 'السعر النشط 125/لتر. النطاق العام في الصف 45–225/لتر.'
    }
  },
  {
    id: 'P136', unit: 'لتر', low: 115, avg: 190, high: 215,
    status: 'national', date: BULLETIN_DATE, source: BULLETIN,
    confidence: 'متوسطة', transport: 'no', taxIncluded: true,
    note: 'النطاق 115–215/لتر. السعر النشط 190 للطلاء المط الخارجي متفوق الجودة؛ 115 للطلاء داخلي/خارجي عالي الجودة، و215 لنصف مط عالي الجودة. السقالات غير مشمولة.',
    quote: {
      name: 'مط خارجي متفوق الجودة', unit: 'لتر', low: 190, avg: 190, high: 190,
      date: BULLETIN_DATE, source: BULLETIN, status: 'national', confidence: 'متوسطة',
      transport: 'no', taxIncluded: true,
      note: 'السعر النشط 190/لتر. النطاق العام في الصف 115–215/لتر.'
    }
  },
  {
    id: 'P049', unit: 'م²', low: 63.25, avg: 78.25, high: 93.25,
    status: 'estimate', date: BULLETIN_DATE, source: `${BULLETIN} + ${LABOR}`,
    confidence: 'ضعيفة', transport: 'no', taxIncluded: false,
    note: 'مادة 125/لتر × 0.146 لتر/م² = 18.25 + مصنعية نقاشة سادة 45–75 = 63.25–93.25/م². السعر النشط 78.25. لا تجمع مع P090 أو P135 في نفس الحصر.',
    derived: true,
    derivation: {
      formula: '(سعر لتر الدهان × معدل الاستهلاك) + مصنعية الدهان',
      inputs: [
        { name: 'مط داخلي عالي الجودة أبيض', unit: 'لتر', value: 125, source: BULLETIN },
        { name: 'معدل استهلاك الدهان', unit: 'لتر/م²', value: 0.146, source: 'محرك الحصر المجمد — interiorPaintLPerM2' },
        { name: 'نقاشة سادة', unit: 'م²', low: 45, high: 75, source: LABOR }
      ],
      calculation: '125×0.146=18.25؛ 18.25+45=63.25؛ 18.25+75=93.25؛ 18.25+60=78.25',
      result: { low: 63.25, avg: 78.25, high: 93.25 }
    },
    quote: {
      name: 'دهان داخلي — مادة + مصنعية', unit: 'م²', low: 63.25, avg: 78.25, high: 93.25,
      date: BULLETIN_DATE, source: `${BULLETIN} + ${LABOR}`, status: 'estimate', confidence: 'ضعيفة',
      transport: 'no', taxIncluded: false, derived: true,
      note: 'قيمة مركبة: المادة من نشرة يناير (قديمة) والمصنعية من قائمة أكتوبر. راجع تغطية الدهان والعدد قبل الاعتماد.'
    }
  },
  {
    id: 'P111', unit: 'م²', low: 63.25, avg: 78.25, high: 93.25,
    status: 'estimate', date: BULLETIN_DATE, source: `${BULLETIN} + ${LABOR}`,
    confidence: 'ضعيفة', transport: 'no', taxIncluded: false,
    note: 'بديل P049 بنفس الصيغة: مادة 125/لتر × 0.146 لتر/م² + مصنعية 45–75/م². لا تجمع مع P049 أو P090 أو P135.',
    alternateOf: 'P049',
    derived: true,
    derivation: {
      formula: '(سعر لتر الدهان × معدل الاستهلاك) + مصنعية الدهان',
      inputs: [
        { name: 'مط داخلي عالي الجودة أبيض', unit: 'لتر', value: 125, source: BULLETIN },
        { name: 'معدل استهلاك الدهان', unit: 'لتر/م²', value: 0.146, source: 'محرك الحصر المجمد — interiorPaintLPerM2' },
        { name: 'نقاشة سادة', unit: 'م²', low: 45, high: 75, source: LABOR }
      ],
      calculation: '125×0.146=18.25؛ 18.25+45=63.25؛ 18.25+75=93.25؛ 18.25+60=78.25',
      result: { low: 63.25, avg: 78.25, high: 93.25 }
    },
    quote: {
      name: 'دهانات — سعر المتر — مادة + مصنعية', unit: 'م²', low: 63.25, avg: 78.25, high: 93.25,
      date: BULLETIN_DATE, source: `${BULLETIN} + ${LABOR}`, status: 'estimate', confidence: 'ضعيفة',
      transport: 'no', taxIncluded: false, derived: true,
      note: 'بديل P049؛ لا تجمع.'
    }
  },
  {
    id: 'P041', unit: 'نقطة', low: 363.64, avg: 545.45, high: 727.27,
    status: 'estimate', date: LABOR_DATE, source: `${LABOR} — قيمة مشتقة`,
    confidence: 'ضعيفة', transport: 'not-applicable', taxIncluded: false,
    note: '200–400/م² ÷ 0.55 نقطة/م² (0.30 مياه + 0.25 صرف) = 363.64–727.27/نقطة. السعر النشط 545.45. قيمة مشتقة من سعر المتر وكثافة النقاط في النموذج، وليست سعر سوق لنقطة منفردة.',
    derived: true,
    derivation: {
      formula: 'سعر المتر ÷ كثافة النقاط لكل م²',
      inputs: [
        { name: 'تأسيس وتشطيب السباكة', unit: 'م²', low: 200, high: 400, source: LABOR },
        { name: 'كثافة النقاط', unit: 'نقطة/م²', value: 0.55, source: 'محرك النماذج المجمد — 0.30 مياه + 0.25 صرف' }
      ],
      calculation: '200÷0.55=363.64؛ 400÷0.55=727.27؛ 300÷0.55=545.45',
      result: { low: 363.64, avg: 545.45, high: 727.27 }
    },
    quote: {
      name: 'مصنعية سباكة — سعر النقطة المشتق', unit: 'نقطة', low: 363.64, avg: 545.45, high: 727.27,
      date: LABOR_DATE, source: `${LABOR} — قيمة مشتقة`, status: 'estimate', confidence: 'ضعيفة',
      transport: 'not-applicable', taxIncluded: false, derived: true,
      note: 'لا تُستخدم كسعر سوق لنقطة منفردة؛ للتقريب فقط.'
    }
  },
  {
    id: 'P131', unit: 'نقطة', low: 363.64, avg: 545.45, high: 727.27,
    status: 'estimate', date: LABOR_DATE, source: `${LABOR} — قيمة مشتقة`,
    confidence: 'ضعيفة', transport: 'not-applicable', taxIncluded: false,
    note: 'بديل P041 بنفس الصيغة: 200–400/م² ÷ 0.55 نقطة/م². لا تجمع مع P041.',
    alternateOf: 'P041',
    derived: true,
    derivation: {
      formula: 'سعر المتر ÷ كثافة النقاط لكل م²',
      inputs: [
        { name: 'تأسيس وتشطيب السباكة', unit: 'م²', low: 200, high: 400, source: LABOR },
        { name: 'كثافة النقاط', unit: 'نقطة/م²', value: 0.55, source: 'محرك النماذج المجمد — 0.30 مياه + 0.25 صرف' }
      ],
      calculation: '200÷0.55=363.64؛ 400÷0.55=727.27؛ 300÷0.55=545.45',
      result: { low: 363.64, avg: 545.45, high: 727.27 }
    },
    quote: {
      name: 'مصنعية تأسيس سباكة — نقطة مشتقة', unit: 'نقطة', low: 363.64, avg: 545.45, high: 727.27,
      date: LABOR_DATE, source: `${LABOR} — قيمة مشتقة`, status: 'estimate', confidence: 'ضعيفة',
      transport: 'not-applicable', taxIncluded: false, derived: true,
      note: 'بديل P041؛ لا تجمع.'
    }
  },
  {
    id: 'P112', unit: 'م²', low: 440, avg: 682.5, high: 925,
    status: 'estimate', date: BULLETIN_DATE, source: `${BULLETIN} — بديل P052`,
    confidence: 'ضعيفة', transport: 'no', taxIncluded: true,
    note: 'بديل P052: نطاق الرخام/الجرانيت 440–925/م². النوع والسماكة والتشطيب يحددون السعر؛ لا تجمع مع P052.',
    alternateOf: 'P052',
    quote: {
      name: 'رخام/جرانيت — عرض محلي بديل', unit: 'م²', low: 440, avg: 682.5, high: 925,
      date: BULLETIN_DATE, source: BULLETIN, status: 'estimate', confidence: 'ضعيفة',
      transport: 'no', taxIncluded: true, derived: true,
      note: 'بديل P052؛ لا تجمع.'
    }
  },
  {
    id: 'P114', unit: 'م²', low: 450, avg: 465, high: 480,
    status: 'estimate', date: BULLETIN_DATE, source: `${BULLETIN} — بديل P088`,
    confidence: 'ضعيفة', transport: 'no', taxIncluded: true,
    note: 'بديل P088: حجر ميكا 450/م²، حجر هاشمي 480/م². خامة فقط؛ التركيب والسقالات غير مشمولة. لا تجمع مع P088.',
    alternateOf: 'P088',
    quote: {
      name: 'واجهة حجر — عرض محلي بديل', unit: 'م²', low: 450, avg: 465, high: 480,
      date: BULLETIN_DATE, source: BULLETIN, status: 'estimate', confidence: 'ضعيفة',
      transport: 'no', taxIncluded: true, derived: true,
      note: 'بديل P088؛ لا تجمع.'
    }
  },
  {
    id: 'P093', unit: 'م³', low: 290, avg: 845, high: 1400,
    status: 'estimate', date: LABOR_DATE, source: `${LABOR} — نطاق عناصر`,
    confidence: 'ضعيفة', transport: 'not-applicable', taxIncluded: false,
    requiresElementSelection: true,
    note: 'نطاق كل العناصر الإنشائية الموردة 290–1,400/م³: قواعد 450–700، أعمدة ورقاب 900–1,400، سقف مصمت 550–850، هوردي/فلات 700–1,000، ومجموعة ثانية متعارضة 290–310. السعر النشط 845 وسط النطاق. لا تستخدمه لتسعير عنصر محدد دون اختيار العنصر؛ الخرسانة العادية للبشة 90–180/م³ منفصلة.',
    derived: true,
    derivation: {
      formula: 'أدنى وأعلى سعر م³ للعناصر الإنشائية (بدون الخرسانة العادية للبشة)',
      inputs: [
        { name: 'قواعد عادية/مسلحة/ميد', unit: 'م³', low: 450, high: 700, source: LABOR },
        { name: 'أعمدة ورقاب', unit: 'م³', low: 900, high: 1400, source: LABOR },
        { name: 'سقف مصمت', unit: 'م³', low: 550, high: 850, source: LABOR },
        { name: 'سقف هوردي/فلات', unit: 'م³', low: 700, high: 1000, source: LABOR },
        { name: 'المجموعة الثانية المتعارضة', unit: 'م³', low: 290, high: 310, source: LABOR }
      ],
      calculation: 'min=290؛ max=1,400؛ avg=(290+1,400)÷2=845',
      result: { low: 290, avg: 845, high: 1400 }
    },
    quote: {
      name: 'مصنعية صب خرسانة — نطاق عناصر', unit: 'م³', low: 290, avg: 845, high: 1400,
      date: LABOR_DATE, source: `${LABOR} — نطاق عناصر`, status: 'estimate', confidence: 'ضعيفة',
      transport: 'not-applicable', taxIncluded: false, derived: true,
      note: 'نطاق جامع؛ لا يغني عن اختيار العنصر.'
    }
  }
];

function applyFill(f) {
  const target = byId.get(f.id);
  if (!target) throw new Error(`Missing target row: ${f.id}`);
  if (rates.hasUsablePrice(target)) throw new Error(`Refusing to overwrite active price: ${f.id} ${target.name}`);
  const before = {
    name: target.name, unit: target.unit, low: target.low, avg: target.avg, high: target.high,
    date: target.date, source: target.source, status: target.status
  };
  if (f.unit && f.unit !== target.unit) {
    unitCorrections.push({
      rowId: target.id, rowName: target.name, from: target.unit, to: f.unit,
      reason: f.id === 'P060'
        ? 'الوحدة المركبة «م² / رول» لا تطابق وحدة BOQ/الحصر «م²»؛ السعر المورد للمتر المسطح.'
        : 'الوحدة المركبة «م / لفة» لا تطابق وحدة الحصر «م»؛ السعر المورد للفة 100 م وحُوّل إلى سعر المتر بقسمة صحيحة.',
      preserved: f.id === 'P077' || f.id === 'P078' ? { rollPrice: f.rollPrice, rollLength: f.rollLength } : null
    });
    target.originalUnit = target.unit;
    target.unit = f.unit;
  }
  target.low = f.low;
  target.avg = f.avg;
  target.high = f.high;
  target.date = f.date;
  target.source = f.source;
  target.status = f.status;
  target.confidence = f.confidence || target.confidence || 'متوسطة';
  target.transport = f.transport || 'unknown';
  target.transportNote = f.transport === 'not-applicable'
    ? 'مصنعية فقط؛ لا تشمل المواد أو النقل.'
    : 'السعر بدون نقل للموقع حسب المصدر.';
  target.taxIncluded = f.taxIncluded === true;
  target.taxNote = f.taxIncluded === true
    ? 'المصدر يذكر شمول الضريبة عادةً؛ راجع البند قبل الشراء.'
    : 'المصدر لم يحدد شمول الضريبة؛ لم تُضف ضريبة تلقائيًا.';
  target.importBatch = BATCH;
  target.previousState = before;
  if (f.derived) {
    target.derived = true;
    target.derivation = f.derivation || null;
    target.sourceItems = (f.derivation && f.derivation.inputs ? f.derivation.inputs : []).map(x => x.name);
  }
  if (f.bridgeOf) target.bridgeOf = f.bridgeOf;
  if (f.alternateOf) target.alternateOf = f.alternateOf;
  if (f.requiresElementSelection) target.requiresElementSelection = true;
  if (f.rollPrice) {
    target.rollPrice = f.rollPrice;
    target.rollLength = f.rollLength;
  }
  target.note = addNote(target.note, f.note);
  if (f.quote) {
    const arr = Array.isArray(target.bulletinQuotes) ? target.bulletinQuotes : [];
    const existing = arr.find(q => q.name === f.quote.name && q.unit === f.quote.unit);
    if (existing) {
      Object.assign(existing, f.quote, { activated: true });
    } else {
      arr.push({ ...f.quote, activated: true });
    }
    target.bulletinQuotes = arr;
  }
  if (f.derived) {
    derivedBridges.push({
      rowId: target.id, rowName: target.name, unit: target.unit,
      low: target.low, avg: target.avg, high: target.high,
      formula: f.derivation ? f.derivation.formula : '',
      calculation: f.derivation ? f.derivation.calculation : '',
      inputs: f.derivation ? f.derivation.inputs : [],
      note: f.note
    });
  }
  actions.push({
    action: f.derived ? 'filled-derived' : 'filled',
    rowId: target.id, rowName: target.name, unit: target.unit,
    low: target.low, avg: target.avg, high: target.high,
    date: target.date, source: target.source,
    previous: before
  });
}

for (const f of FILLS) applyFill(f);

// ---------------------------------------------------------------------------
// 2) Exact-name bridge rows for the frozen model/takeoff lookups.
// ---------------------------------------------------------------------------
const laborQuote = (name, unit, low, avg, high, note) => ({
  name, unit, low, avg, high, date: LABOR_DATE, source: LABOR,
  status: 'local', confidence: 'متوسطة', transport: 'not-applicable',
  transportNote: 'مصنعية فقط؛ لا تشمل المواد أو النقل.',
  taxIncluded: false, taxNote: 'القائمة لم تحدد شمول الضريبة؛ taxIncluded=false.',
  activated: true, note
});

const NEW_ROWS = [
  {
    name: 'مصنعية محارة', unit: 'م²', category: 'المصنعيات والعمالة', scope: 'finishing', kind: 'labor',
    low: 50, avg: 67.5, high: 85, status: 'local', date: LABOR_DATE, source: LABOR,
    confidence: 'متوسطة', transport: 'not-applicable', taxIncluded: false,
    bridgeOf: 'P033',
    aliases: ['محارة وبياض', 'مصنعية محارة وبياض', 'محارة / لياسة'],
    note: 'مرادف تنفيذي لـ P033 (مصنعية المحارة والبياض) بنفس النطاق 50–85/م². لا تجمع مع P033 في نفس الحصر. لا تشمل مونة الأسمنت والرمل.',
    laborQuote: laborQuote('محارة / لياسة', 'م²', 50, 67.5, 85, 'حوائط وأسقف؛ لا تشمل مونة الأسمنت والرمل.')
  },
  {
    name: 'تركيب سيراميك', unit: 'م²', category: 'المصنعيات والعمالة', scope: 'finishing', kind: 'labor',
    low: 150, avg: 225, high: 300, status: 'local', date: LABOR_DATE, source: LABOR,
    confidence: 'متوسطة', transport: 'not-applicable', taxIncluded: false,
    bridgeOf: 'P056',
    aliases: ['مصنعية سيراميك', 'مصنعية تركيب سيراميك', 'تركيب بلاط'],
    note: 'مرادف تنفيذي لـ P056 (مصنعية سيراميك) بنفس النطاق 150–300/م². لا تجمع مع P056. تركيب فقط؛ لا يشمل السيراميك أو المواد.',
    laborQuote: laborQuote('تركيب سيراميك', 'م²', 150, 225, 300, 'تركيب فقط؛ لا يشمل السيراميك أو المواد.')
  },
  {
    name: 'خامات كهرباء للمتر', unit: 'م²', category: 'الكهرباء', scope: 'finishing', kind: 'material',
    low: 100, avg: 125, high: 150, status: 'estimate', date: '2026-03-01',
    source: 'P119 — خامات كهرباء لشقة 100 م² — مرجعي (10,000–15,000)',
    confidence: 'ضعيفة', transport: 'no', taxIncluded: true,
    derivedFrom: 'P119',
    note: 'مشتق من P119: 12,500 ÷ 100 م² = 125/م² (النطاق 10,000–15,000 -> 100–150). مرجع شقة 100 م² وليس جدول كابلات أو دوائر؛ لا تستخدمه لحصر كهرباء تنفيذي.',
    aliases: ['خامات كهرباء للمتر المربع', 'خامات كهرباء — مؤشر مساحي'],
    derivation: {
      formula: 'مرجع شقة 100 م² ÷ 100 م²',
      inputs: [
        { name: 'P119 — خامات كهرباء لشقة 100 م²', unit: 'مشروع شقة 100 م²', low: 10000, avg: 12500, high: 15000, source: 'as eskahraba — مرجع وطني' }
      ],
      calculation: '10,000÷100=100؛ 12,500÷100=125؛ 15,000÷100=150',
      result: { low: 100, avg: 125, high: 150 }
    },
    bulletinQuote: {
      name: 'خامات كهرباء لشقة 100 م² — مرجعي', unit: 'مشروع شقة 100 م²',
      low: 10000, avg: 12500, high: 15000, date: '2026-03-01',
      source: 'as eskahraba — رقم مرجعي للشقة', status: 'national', confidence: 'ضعيفة',
      transport: 'no', taxIncluded: true, activated: true,
      note: 'المرجع الأصلي؛ حُوّل إلى سعر م² بقسمة صحيحة على 100 م².'
    }
  },
  {
    name: 'مصنعية محارة خارجية', unit: 'م²', category: 'المصنعيات والعمالة', scope: 'finishing', kind: 'labor',
    low: 50, avg: 67.5, high: 85, status: 'local', date: LABOR_DATE, source: LABOR,
    confidence: 'متوسطة', transport: 'not-applicable', taxIncluded: false,
    bridgeOf: 'P033',
    aliases: ['محارة خارجية', 'مصنعية محارة واجهات'],
    note: 'نفس سعر المحارة/اللياسة 50–85/م². لا تشمل السقالات الخارجية أو مونة الأسمنت والرمل؛ راجع الواجهة والسقالات منفصلة.',
    laborQuote: laborQuote('محارة / لياسة', 'م²', 50, 67.5, 85, 'نفس سعر المحارة الداخلية؛ السقالات الخارجية غير مشمولة.')
  },
  {
    name: 'مصنعية جبس', unit: 'م²', category: 'المصنعيات والعمالة', scope: 'finishing', kind: 'labor',
    low: 180, avg: 265, high: 350, status: 'local', date: LABOR_DATE, source: LABOR,
    confidence: 'متوسطة', transport: 'not-applicable', taxIncluded: false,
    bridgeOf: 'P146',
    aliases: ['جبس بورد مودرن', 'مصنعية تركيب جبس بورد', 'مصنعية جبس بورد'],
    note: 'من صف جبس بورد مودرن 180–350/م² (النسخة المسطحة). لا تجمع مع P146 أو مع صف المتر الطولي. لا تشمل مواد الجبس.',
    laborQuote: laborQuote('جبس بورد مودرن', 'م²', 180, 265, 350, 'النسخة المسطحة؛ لا تجمع مع صف المتر الطولي.')
  },
  {
    name: 'مصنعية تركيب جبس بورد', unit: 'م²', category: 'المصنعيات والعمالة', scope: 'finishing', kind: 'labor',
    low: 180, avg: 265, high: 350, status: 'local', date: LABOR_DATE, source: LABOR,
    confidence: 'متوسطة', transport: 'not-applicable', taxIncluded: false,
    bridgeOf: 'P146',
    aliases: ['مصنعية جبس', 'جبس بورد مودرن', 'مصنعية جبس بورد'],
    note: 'بديل P146 بنفس النطاق 180–350/م². لا تجمع مع P146 أو مع صف المتر الطولي. لا تشمل مواد الجبس.',
    laborQuote: laborQuote('جبس بورد مودرن', 'م²', 180, 265, 350, 'بديل P146؛ لا تجمع.')
  }
];

function addNewRow(row) {
  const id = `B26-${String(newRows.length + 1).padStart(3, '0')}`;
  if (byId.has(id)) throw new Error(`Duplicate bridge id: ${id}`);
  const target = {
    id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    low: row.low,
    avg: row.avg,
    high: row.high,
    date: row.date,
    source: row.source,
    status: row.status,
    confidence: row.confidence,
    transport: row.transport,
    transportNote: row.transport === 'not-applicable'
      ? 'مصنعية فقط؛ لا تشمل المواد أو النقل.'
      : 'السعر بدون نقل للموقع حسب المصدر.',
    taxIncluded: row.taxIncluded === true,
    taxNote: row.taxIncluded === true
      ? 'المصدر يذكر شمول الضريبة عادةً؛ راجع البند قبل الشراء.'
      : 'المصدر لم يحدد شمول الضريبة؛ لم تُضف ضريبة تلقائيًا.',
    qtyMode: 'manual',
    factor: 0,
    calc: false,
    scope: row.scope,
    kind: row.kind,
    packages: ['economic', 'semi', 'medium', 'luxury'],
    active: true,
    importBatch: BATCH,
    note: row.note,
    aliases: row.aliases || []
  };
  if (row.bridgeOf) target.bridgeOf = row.bridgeOf;
  if (row.derivedFrom) target.derivedFrom = row.derivedFrom;
  if (row.derivation) {
    target.derived = true;
    target.derivation = row.derivation;
    target.sourceItems = (row.derivation.inputs || []).map(x => x.name);
    derivedBridges.push({
      rowId: id, rowName: target.name, unit: target.unit,
      low: target.low, avg: target.avg, high: target.high,
      formula: row.derivation.formula, calculation: row.derivation.calculation,
      inputs: row.derivation.inputs, note: row.note
    });
  }
  if (row.laborQuote) target.laborQuotes = [row.laborQuote];
  if (row.bulletinQuote) target.bulletinQuotes = [row.bulletinQuote];
  prices.push(target);
  byId.set(id, target);
  newRows.push(target);
  actions.push({
    action: 'added', rowId: id, rowName: target.name, unit: target.unit,
    low: target.low, avg: target.avg, high: target.high,
    date: target.date, source: target.source, bridgeOf: row.bridgeOf || null
  });
}

for (const row of NEW_ROWS) addNewRow(row);

// ---------------------------------------------------------------------------
// 3) Record batch metadata in settings.
// ---------------------------------------------------------------------------
settings.missingPriceBatch = BATCH;
settings.missingPriceBatchDate = '2026-10-21';
settings.missingPriceBatchNote = 'ملء الفجوات من نشرة يناير 2026 وقائمة مصنعيات أكتوبر 2026؛ القيم المشتقة معلنة، والفجوات غير المدعومة بقيت مفتوحة.';

// ---------------------------------------------------------------------------
// 4) Audit, model verification, and report.
// ---------------------------------------------------------------------------
const auditBefore = engine.auditCatalog(base.prices, base.settings);
const auditAfter = engine.auditCatalog(prices, settings);

const project = {
  modelCode: 'APT-BRICK', package: 'medium', marginMode: 'comprehensive', quoteBasis: 'average',
  apartmentArea: 150, apartmentCount: 1, roomsPerApartment: 3, bathrooms: 2,
  kitchen: false, gypsum: false, ac: false, sanitary: true,
  concreteMethod: 'ready_mix', concreteGrade: 'C25', steelName: 'حديد استثماري',
  foundationSystem: 'isolated', soil: 'normal', basement: false, groundwater: false,
  includeBasicPlaster: false, completed: {}, floors: []
};

function modelCheck(rows) {
  const estimate = models.buildEstimate(project, rows, base.settings || {}, {});
  const lines = estimate.lines || [];
  const gaps = lines.filter(l => l.priceGap === true);
  const priced = lines.filter(l => l.unitPrice !== null && l.unitPrice !== undefined);
  return {
    lines: lines.length,
    priced: priced.length,
    gaps: gaps.length,
    gapItems: gaps.map(l => ({ code: l.code, item: l.item, unit: l.unit, status: l.priceStatus })),
    totalCost: estimate.totals ? (estimate.totals.total ?? estimate.totals.cost ?? null) : null
  };
}

const modelBefore = modelCheck(base.prices);
const modelAfter = modelCheck(prices);
const closedGapCodes = modelBefore.gapItems.map(x => x.code).filter(code => !modelAfter.gapItems.some(x => x.code === code));
const closedGaps = modelBefore.gapItems
  .filter(x => closedGapCodes.includes(x.code))
  .map(x => ({ ...x, status: 'closed', closedIn: 'v4' }));
const remainingClientGaps = modelAfter.gapItems;

const count = action => actions.filter(a => a.action === action).length;
const percent = (p, t) => (t ? Math.round((p / t) * 1000) / 10 : 0);

const remaining = prices
  .filter(p => p.active !== false && !rates.hasUsablePrice(p))
  .map(p => {
    const reasonMap = {
      P010: 'فرق سعر أقطار الحديد ليس سعرًا مطلقًا، والنشرة لا تفصل فروق الأقطار.',
      P018: 'النشرة لا تتضمن خرسانة جاهزة C30؛ لا يُشتق سعر المقاومة من C25.',
      P019: 'النشرة لا تتضمن خرسانة جاهزة C35؛ لا يُشتق سعر المقاومة من C25.',
      P020: 'لا يوجد سعر مضخة خرسانة في المصدرين.',
      P021: 'النشرة تسعّر الخشب م³ وليس شدة خشبية/موسكي؛ لا تحويل بدون تصميم شدة.',
      P022: 'لا يوجد سعر إيجار شدة معدنية في المصدرين.',
      P023: 'لا يوجد سعر حفر آلي في المصدرين.',
      P024: 'لا يوجد سعر حفر يدوي في المصدرين.',
      P025: 'لا يوجد سعر نقل ناتج حفر في المصدرين.',
      P026: 'لا يوجد سعر ردم ودك في المصدرين.',
      P027: 'لا يوجد سعر اختبار تربة في المصدرين.',
      P031: 'لا توجد خلطة مونة محددة؛ لا يُخترع سعر من الأسمنت والرمل فقط.',
      P036: 'النشرة لا تتضمن مواسير/علب كهرباء.',
      P040: 'لا يوجد سعر طقم صحي كامل في المصدرين.',
      P042: 'لا يوجد سعر توصيل صرف عام؛ يلزم عرض الجهة المختصة.',
      P050: 'لا يوجد سعر باب داخلي في المصدرين؛ الخشب م³ لا يكفي لتسعير باب.',
      P051: 'لا يوجد سعر شباك ألوميتال عام في المصدرين؛ توجد أسعار شبابيك محددة بأسماء أخرى وليست بديلًا مطابقًا.',
      P053: 'لا يوجد سعر مطبخ في المصدرين.',
      P054: 'لا يوجد سعر تكييف في المصدرين.',
      P055: 'لا يوجد سعر مصعد في المصدرين.',
      P057: 'لا يوجد سعر ترخيص/تصميم في المصدرين.',
      P058: 'لا يوجد سعر رسوم عداد في المصدرين.',
      P059: 'لا يوجد سعر إشراف هندسي في المصدرين.',
      P061: 'لا يوجد سعر سلك ربط حديد في المصدرين.',
      P062: 'النشرة لا تفصل سعر الحديد حسب القطر؛ لا يُنسب سعر الماركة إلى قطر محدد.',
      P063: 'النشرة لا تفصل سعر الحديد حسب القطر؛ لا يُنسب سعر الماركة إلى قطر محدد.',
      P064: 'النشرة لا تفصل سعر الحديد حسب القطر؛ لا يُنسب سعر الماركة إلى قطر محدد.',
      P065: 'النشرة لا تفصل سعر الحديد حسب القطر؛ لا يُنسب سعر الماركة إلى قطر محدد.',
      P066: 'النشرة لا تفصل سعر الحديد حسب القطر؛ لا يُنسب سعر الماركة إلى قطر محدد.',
      P067: 'النشرة لا تفصل سعر الحديد حسب القطر؛ لا يُنسب سعر الماركة إلى قطر محدد.',
      P070: 'لا يوجد سعر باب خشبي اقتصادي في المصدرين.',
      P071: 'لا يوجد سعر باب خشبي متوسط في المصدرين.',
      P072: 'لا يوجد سعر باب مصفح/فاخر في المصدرين.',
      P073: 'لا يوجد سعر مفاتيح/بريزات في المصدرين.',
      P074: 'لا يوجد سعر لوحة كهرباء في المصدرين.',
      P075: 'لا يوجد سعر قواطع/مفاتيح رئيسية في المصدرين.',
      P076: 'لا يوجد سعر كابل/توصيلات رئيسية في المصدرين.',
      P079: 'لا يوجد سعر طقم صحي اقتصادي في المصدرين.',
      P080: 'لا يوجد سعر طقم صحي متوسط في المصدرين.',
      P081: 'لا يوجد سعر طقم صحي فاخر في المصدرين.',
      P082: 'لا يوجد سعر رسوم حكومية في المصدرين.',
      P083: 'لا يوجد سعر ضرائب/تأمينات في المصدرين.',
      P084: 'لا يوجد سعر إشراف/إدارة في المصدرين.',
      P085: 'لا يوجد سعر عمالة غير مباشرة في المصدرين.',
      P086: 'لا يوجد سعر توصيل مرافق في المصدرين.',
      P087: 'لا يوجد سعر رسوم عداد/مرافق في المصدرين.',
      P091: 'لا توجد مصنعية نجارة مسلحة في القائمة الموردة.',
      P092: 'لا توجد مصنعية حدادة مسلحة في القائمة الموردة.',
      P094: 'لا يوجد سعر يومية عمالة في المصدرين.',
      P095: 'لا يوجد سعر يومية فني في المصدرين.',
      P113: 'لا يوجد سعر مصعد/تركيب في المصدرين.',
      P115: 'لا يوجد سعر سور وبوابة في المصدرين.',
      P128: 'لا يوجد سعر خزان مياه في المصدرين.',
      P129: 'لا يوجد سعر باب خشبي داخلي فاخر في المصدرين.',
      P132: 'لا يوجد سعر كراسي حديد في المصدرين.',
      P133: 'النشرة تسعّر السيلر/الدهان التحضيري بالكيلوجرام (42–245/كجم)، والكتالوج يطلبه باللتر. لا توجد كثافة في المصدر، فلا تحويل. كما أن المحرك يبحث عن الاسم «سيلر» بينما الصف «سيلر داخلي».',
      P140: 'لا يوجد سعر شبك فيبر جلاس في المصدرين.',
      P142: 'لا يوجد سعر مسامير جبس بورد في المصدرين.',
      P143: 'لا يوجد سعر بروفايل معدني للجبس في المصدرين.',
      P144: 'لا يوجد سعر مادة فواصل سيراميك في المصدرين.',
      P145: 'لا توجد مصنعية عزل مائي في القائمة الموردة.'
    };
    return {
      rowId: p.id, rowName: p.name, unit: p.unit, category: p.category,
      reason: reasonMap[p.id] || 'لا يوجد سعر مطابق في المصدرين المرفقين؛ لا يُخترع سعر.'
    };
  });

const report = {
  generatedAt: new Date().toISOString(),
  batch: BATCH,
  baseBook: {
    file: 'api/_data/price-book.v3.json',
    sha256: crypto.createHash('sha256').update(baseRaw).digest('hex'),
    totalRows: base.prices.length
  },
  policy: {
    sourceOnly: true,
    overwriteNewerActivePrices: false,
    exactNameBridges: true,
    unitCorrectionsWithExactConversionOnly: true,
    derivedValuesMarked: true,
    inventedPrices: false,
    unknownUnitsKeptOut: true,
    taxForLabor: false
  },
  sources: {
    bulletin: { name: BULLETIN, date: BULLETIN_DATE, rows: 313 },
    labor: { name: LABOR, date: LABOR_DATE, rows: 32 },
    model: { file: 'engines/miyar-project-models.js', note: 'لم يُعدل؛ الجسور تطابق أسماءه الحرفية.' }
  },
  counts: {
    addedRows: count('added'),
    filledRows: count('filled'),
    filledDerivedRows: count('filled-derived'),
    unitCorrections: unitCorrections.length,
    totalRowsBefore: base.prices.length,
    totalRowsAfter: prices.length,
    activeBefore: auditBefore.total,
    activeAfter: auditAfter.total,
    pricedBefore: auditBefore.priced,
    pricedAfter: auditAfter.priced,
    missingBefore: auditBefore.missing,
    missingAfter: auditAfter.missing,
    staleBefore: auditBefore.stale,
    staleAfter: auditAfter.stale
  },
  coverage: {
    before: { total: auditBefore.total, priced: auditBefore.priced, missing: auditBefore.missing, percent: percent(auditBefore.priced, auditBefore.total), stale: auditBefore.stale },
    after: { total: auditAfter.total, priced: auditAfter.priced, missing: auditAfter.missing, percent: percent(auditAfter.priced, auditAfter.total), stale: auditAfter.stale }
  },
  clientEstimate: {
    project: 'شقة 150 م² — 3 غرف — 2 حمام — باقة متوسطة — APT-BRICK — بدون مطبخ/جبس/تكييف',
    before: modelBefore,
    after: modelAfter,
    closedGaps,
    remainingGaps: remainingClientGaps
  },
  unitCorrections,
  newRows: newRows.map(r => ({
    id: r.id, name: r.name, unit: r.unit, low: r.low, avg: r.avg, high: r.high,
    status: r.status, date: r.date, source: r.source, bridgeOf: r.bridgeOf || null,
    derivedFrom: r.derivedFrom || null, note: r.note
  })),
  derivedBridges,
  actions,
  remainingGaps: remaining,
  decisions: [
    'الأسعار المباشرة من النشرة احتفظت بتاريخ يناير 2026، لذا تظهر قديمة (stale) ولا تُقدّم كسعر محلي حديث.',
    'P060 وP077 وP078 صُححت وحداتها لأن الصيغة المركبة كانت تمنع مطابقة BOQ/الحصر؛ حُفظت الوحدة الأصلية وسعر اللفة.',
    'الجسور الجديدة لا تعدل المحركات المجمدة؛ تضيف أسماء مطابقة فقط.',
    'P041/P131 وP049/P111 وP093 وقيمة الكهرباء للمتر مشتقة بصيغة معلنة، وليست أسعارًا موردة مباشرة.',
    'الأبواب والأطقم الصحية والتنظيف والسيلر بقيت مفتوحة لعدم وجود سعر/وحدة مطابقة في المصدرين.'
  ],
  conflicts: [
    { area: 'السيلر', detail: 'المصدر يسعّر السيلر والدهان التحضيري بالكيلوجرام (42–245/كجم)، والكتالوج/المحرك يطلبان لترًا. لا كثافة في المصدر، فلا تحويل.' },
    { area: 'الخرسانة', detail: 'P093 نطاق جامع 290–1,400/م³ بسبب تعارض مجموعتين؛ لا يغني عن اختيار العنصر. الخرسانة العادية للبشة 90–180/م³ منفصلة.' },
    { area: 'السباكة بالنقطة', detail: 'P041/P131 قيمة مشتقة من 200–400/م² ÷ 0.55 نقطة/م²، وليست سعر نقطة صريحًا.' },
    { area: 'الدهان', detail: 'P049/P111 قيمة مركبة (مادة يناير + مصنعية أكتوبر)؛ المادة قديمة والمصنعية حديثة، والضريبة غير محددة.' },
    { area: 'الأبواب', detail: 'لا يوجد سعر باب في المصدرين؛ خشب المتر المكعب لا يكفي لتسعير باب دون مقاس وتصميم وقائمة مكونات.' }
  ]
};

const exportDoc = {
  app: base.app,
  version: '2026-10-21',
  exportedAt: new Date().toISOString(),
  settings,
  bulletins: Array.isArray(base.bulletins) ? base.bulletins : [],
  notes: [
    ...(Array.isArray(base.notes) ? base.notes : []),
    'الإصدار v4 يملأ الفجوات المدعومة من نشرة يناير 2026 وقائمة مصنعيات أكتوبر 2026، ويضيف صفوف جسر بأسماء مطابقة للمحركات المجمدة.',
    'لم تُكتب أسعار تخمينية: الصفوف المشتقة معلنة بصيغتها ومدخلاتها، والوحدات غير المتوافقة بقيت مفتوحة.',
    'P060 وP077 وP078 صُححت وحداتها من صيغ مركبة إلى وحدة الاستهلاك المطابقة، مع حفظ الوحدة الأصلية وسعر اللفة.',
    'الفجوات المتبقية في تقدير الشقة: سيلر، أبواب، أطقم صحية، تنظيف وتسليم؛ لا يوجد لها سعر/وحدة مطابقة في المصدرين.'
  ],
  prices
};

fs.writeFileSync(path.join(root, '.tmp-missing-export.json'), JSON.stringify(exportDoc, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(root, 'MISSING-PRICES-2026-10-IMPORT.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Added rows: ${count('added')} | filled: ${count('filled')} | filled-derived: ${count('filled-derived')} | unit corrections: ${unitCorrections.length}`);
console.log(`Coverage: ${auditBefore.priced}/${auditBefore.total} (${percent(auditBefore.priced, auditBefore.total)}%) -> ${auditAfter.priced}/${auditAfter.total} (${percent(auditAfter.priced, auditAfter.total)}%)`);
console.log(`Stale priced rows: ${auditBefore.stale} -> ${auditAfter.stale}`);
console.log(`Client estimate: ${modelBefore.priced} priced, ${modelBefore.gaps} gaps -> ${modelAfter.priced} priced, ${modelAfter.gaps} gaps`);
console.log('Closed client gaps:');
for (const g of closedGaps) console.log(` - ${g.code} ${g.item}`);
console.log('Remaining client gaps:');
for (const g of remainingClientGaps) console.log(` - ${g.code} ${g.item} (${g.unit})`);
console.log(`Remaining catalog gaps: ${remaining.length}`);
