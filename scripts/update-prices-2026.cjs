'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BOOK_PATH = path.join(ROOT, 'api/_data/price-book.v4.json');
const OUTPUT_PATH = path.join(ROOT, 'api/_data/price-book.v8.json');
const EXTENDED_PATH = path.join(ROOT, 'api/_data/price-book-extended.v1.json');
const { cleanPriceBook } = require('./agent-data-migration.cjs');
const book = JSON.parse(fs.readFileSync(BOOK_PATH, 'utf8'));
const knownGoodBook = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/_data/price-book.v3.json'), 'utf8'));
const knownGoodById = new Map(knownGoodBook.prices.map(row => [row.id, row]));

// Helper to find or create price item
function findItem(id) {
  return book.prices.find(p => p.id === id);
}

function upsertItem(item) {
  const idx = book.prices.findIndex(p => p.id === item.id);
  if (idx >= 0) {
    book.prices[idx] = { ...book.prices[idx], ...item };
  } else {
    book.prices.push(item);
  }
}

function deactivateItem(id) {
  const item = findItem(id);
  if (item) item.active = false;
}

function setPrice(id, avg, low, high, unit, source, date, status = 'local', category) {
  const item = findItem(id);
  if (!item) return false;
  item.avg = avg;
  item.low = low ?? avg;
  item.high = high ?? avg;
  item.unit = unit;
  item.source = source;
  item.date = date;
  item.status = status;
  if (category) item.category = category;
  return true;
}

const TODAY = '2026-10-21';
const BULLETIN_DATE = '2026-01-01';
const LABOR_DATE = '2026-10-21';

// ============================================================
// 1. DEACTIVATE unwanted items (per-user agreement items)
// ============================================================
[
  'P082', // توصيل غاز طبيعي
  'P083', // رسوم عداد كهرباء
  'P084', // رسوم عداد مياه وصرف
  'P058', // رسوم ترخيص وإجراءات بناء
  'P115', // سور وبوابة
].forEach(deactivateItem);

// ============================================================
// 2. UPDATE existing items with bulletin prices (Jan 2026)
// ============================================================
// Iron - use average of major brands ~37,500
setPrice('P003', 37500, 34500, 38200, 'طن', 'نشرة يناير 2026 - متوسط ماركات', BULLETIN_DATE, 'national', 'الهيكل الخرساني');
setPrice('P004', 37500, 34500, 38200, 'طن', 'نشرة يناير 2026 - متوسط ماركات', BULLETIN_DATE, 'national', 'الهيكل الخرساني');

// Cement - use average ~3,800
setPrice('P001', 3850, 3550, 4200, 'طن', 'نشرة يناير 2026 - متوسط ماركات', BULLETIN_DATE, 'national', 'الهيكل الخرساني');
setPrice('P002', 3850, 3550, 4200, 'طن', 'نشرة يناير 2026 - متوسط ماركات', BULLETIN_DATE, 'national', 'الهيكل الخرساني');

// Aggregates
setPrice('P005', 300, 300, 435, 'م³', 'نشرة يناير 2026', BULLETIN_DATE, 'national', 'الهيكل الخرساني'); // زلط
setPrice('P006', 155, 150, 160, 'م³', 'نشرة يناير 2026', BULLETIN_DATE, 'national', 'الهيكل الخرساني'); // رمل

// Ready-mix concrete C25
setPrice('P017', 3300, 3300, 3300, 'م³', 'نشرة يناير 2026', BULLETIN_DATE, 'national', 'الهيكل الخرساني');

// Bricks
setPrice('P028', 1500, 1200, 1800, 'ألف طوبة', 'نشرة يناير 2026 - طوب طفلي', BULLETIN_DATE, 'national', 'المباني والبياض');
setPrice('P029', 35, 35, 55, 'م²', 'نشرة يناير 2026 - طوب أحمر 12سم', BULLETIN_DATE, 'national', 'المباني والبياض');
setPrice('P030', 220, 180, 260, 'م³', 'نشرة يناير 2026 - طوب أحمر 25سم', BULLETIN_DATE, 'national', 'المباني والبياض');

// Gypsum
setPrice('P032', 1500, 1450, 1550, 'طن', 'نشرة يناير 2026 - جبس', BULLETIN_DATE, 'national', 'المباني والبياض');
setPrice('P033', 1500, 1450, 1550, 'طن', 'نشرة يناير 2026 - جبس', BULLETIN_DATE, 'national', 'المباني والبياض');

// Tiles/Ceramics
setPrice('P045', 185, 160, 200, 'م²', 'نشرة يناير 2026 - سيراميك حوائط', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P046', 195, 185, 200, 'م²', 'نشرة يناير 2026 - سيراميك أرضيات', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P047', 500, 440, 630, 'م²', 'نشرة يناير 2026 - رخام', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P048', 700, 550, 925, 'م²', 'نشرة يناير 2026 - جرانيت', BULLETIN_DATE, 'national', 'التchطيبات');

// Paints
setPrice('P049', 78.25, 63, 93, 'م²', 'مشتق: مادة (يناير) + مصنعية (أكتوبر)', TODAY, 'priced', 'التشطيبات');
setPrice('P111', 78.25, 63, 93, 'م²', 'مشتق: مادة (يناير) + مصنعية (أكتوبر)', TODAY, 'priced', 'التشطيبات');
setPrice('P134', 16, 16, 16, 'كجم', 'نشرة يناير 2026 - معجون داخلي', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P135', 125, 125, 125, 'لتر', 'نشرة يناير 2026 - بلاستيك داخلي', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P136', 190, 190, 190, 'لتر', 'نشرة يناير 2026 - بلاستيك خارجي', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P137', 25, 25, 25, 'كجم', 'نشرة يناير 2026 - معجون خارجي', BULLETIN_DATE, 'national', 'التشطيبات');

// Insulation
setPrice('P059', 157, 155, 160, 'م²', 'نشرة يناير 2026 - بيتومين 3مم', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P060', 157.5, 155, 160, 'م²', 'نشرة يناير 2026 - بيتومين/رولات عزل', BULLETIN_DATE, 'national', 'التشطيبات');

// Pipes
setPrice('P037', 125, 80, 185, 'م.ط', 'نشرة يناير 2026 - PPR متوسط', BULLETIN_DATE, 'national', 'السباكة والصرف');
setPrice('P038', 150, 40, 380, 'م', 'نشرة يناير 2026 - PVC صرف', BULLETIN_DATE, 'national', 'السباكة والصرف');
setPrice('P122', 270, 270, 270, 'م', 'نشرة يناير 2026 - PVC 4 بوصة', BULLETIN_DATE, 'national', 'السباكة والصرف');

// Electrical wires
setPrice('P077', 38.85, 38.85, 38.85, 'م', 'نشرة يناير 2026 - سلك 4مم (3885/100)', BULLETIN_DATE, 'national', 'الكهرباء');
setPrice('P078', 58.5, 58.5, 58.5, 'م', 'نشرة يناير 2026 - سلك 6مم (5850/100)', BULLETIN_DATE, 'national', 'الكهرباء');

// Aluminum/UPVC - approximate
setPrice('P051', 3800, 3355, 4375, 'م²', 'نشرة يناير 2026 - ألومنيوم/UPVC', BULLETIN_DATE, 'national', 'التشطيبات');

// Gypsum board
setPrice('P069', 202.5, 180, 225, 'م²', 'نشرة يناير 2026 - ألواح جبس/أسقف', BULLETIN_DATE, 'national', 'التشطيبات');
setPrice('P146', 265, 225, 265, 'م²', 'مصنعية جبس بورد (أكتوبر)', LABOR_DATE, 'local', 'المصنعيات والعمالة');

// ============================================================
// 3. ADD MISSING PRICES from user-provided data
// ============================================================

// Structural steel details (use single avg price for all diameters)
[['P062', 37500], ['P063', 37500], ['P064', 37500], ['P065', 37500], ['P066', 37500], ['P067', 37500]].forEach(([id, price]) => {
  const item = findItem(id);
  if (item) { item.avg = price; item.low = 34500; item.high = 38200; item.unit = 'طن'; item.source = 'نشرة يناير 2026 - حديد تسليح'; item.date = BULLETIN_DATE; item.status = 'national'; }
});

// Wire binding
setPrice('P061', 37500, 34500, 38200, 'طن', 'نشرة يناير 2026 - سلك ربط (تبع الحديد)', BULLETIN_DATE, 'national', 'الهيكل الخرساني');

// Plastic chairs for rebar
setPrice('P132', 45000, 40000, 50000, 'طن', 'تقديري - كراسي بلاستيك', TODAY, 'estimate', 'الهيكل الخرساني');

// Concrete C30, C35
setPrice('P018', 3500, 3400, 3600, 'م³', 'تقديري - خرسانة C30', TODAY, 'estimate', 'الهيكل الخرساني');
setPrice('P019', 3700, 3600, 3800, 'م³', 'تقديري - خرسانة C35', TODAY, 'estimate', 'الهيكل الخرساني');

// Concrete pump
setPrice('P020', 850, 700, 1000, 'مشروع', 'مصنعيات أكتوبر 2026 - مضخة', LABOR_DATE, 'local', 'الهيكل الخرساني');

// Formwork
setPrice('P021', 120, 100, 150, 'م²', 'مصنعيات أكتوبر 2026 - شدة خشبية', LABOR_DATE, 'local', 'الهيكل الخرساني');
setPrice('P022', 150, 120, 180, 'م²', 'مصنعيات أكتوبر 2026 - شدة معدنية', LABOR_DATE, 'local', 'الهيكل الخرساني');

// Excavation
setPrice('P023', 45, 35, 60, 'م³', 'مصنعيات أكتوبر 2026 - حفر آلي', LABOR_DATE, 'local', 'الحفر والأساسات');
setPrice('P024', 80, 60, 100, 'م³', 'مصنعيات أكتوبر 2026 - حفر يدوي', LABOR_DATE, 'local', 'الحفر والأساسات');
setPrice('P025', 35, 25, 50, 'م³', 'مصنعيات أكتوبر 2026 - نقل ناتج', LABOR_DATE, 'local', 'الحفر والأساسات');
setPrice('P026', 30, 20, 45, 'م³', 'مصنعيات أكتوبر 2026 - ردم ودك', LABOR_DATE, 'local', 'الحفر والأساسات');
setPrice('P027', 3500, 3000, 5000, 'مشروع', 'مصنعيات أكتوبر 2026 - اختبار تربة', LABOR_DATE, 'local', 'الحفر والأساسات');

// Mortar
setPrice('P031', 180, 150, 220, 'م³', 'مشتق: أسمنت + رمل + مصنعية', TODAY, 'priced', 'المباني والبياض');

// Electrical conduits & boxes
setPrice('P036', 55, 42, 85, 'م.ط', 'نشرة يناير 2026 - مواسير PVC كهرباء', BULLETIN_DATE, 'national', 'الكهرباء');

// Sanitary - complete set
setPrice('P040', 12000, 8000, 18000, 'طقم', 'مصنعيات أكتوبر 2026 - طقم حمام كامل', LABOR_DATE, 'local', 'السباكة والصرف');
setPrice('P042', 5000, 3000, 8000, 'مشروع', 'مصنعيات أكتوبر 2026 - توصيل صرف', LABOR_DATE, 'local', 'السباكة والصرف');

// Doors - internal
setPrice('P050', 3500, 2500, 5000, 'باب', 'مصنعيات أكتوبر 2026 - أبواب داخلية', LABOR_DATE, 'local', 'التشطيبات');
setPrice('P070', 2500, 2000, 3200, 'باب', 'مصنعيات أكتوبر 2026 - باب اقتصادي', LABOR_DATE, 'local', 'التشطيبات');
setPrice('P071', 3500, 2800, 4500, 'باب', 'مصنعيات أكتوبر 2026 - باب متوسط', LABOR_DATE, 'local', 'التشطيبات');
setPrice('P072', 6000, 5000, 8000, 'باب', 'مصنعيات أكتوبر 2026 - باب مصفح/فاخر', LABOR_DATE, 'local', 'التشطيبات');
setPrice('P129', 6000, 5000, 8000, 'باب', 'مصنعيات أكتوبر 2026 - باب فاخر', LABOR_DATE, 'local', 'التشطيبات');

// Electrical fixtures
setPrice('P073', 35, 25, 50, 'قطعة', 'تقديري - مفاتيح اقتصادي', TODAY, 'estimate', 'الكهرباء');
setPrice('P074', 55, 40, 75, 'قطعة', 'تقديري - مفاتيح متوسط', TODAY, 'estimate', 'الكهرباء');
setPrice('P075', 85, 65, 120, 'قطعة', 'تقديري - مفاتيح فاخر', TODAY, 'estimate', 'الكهرباء');
setPrice('P076', 2500, 1800, 3500, 'قطعة', 'تقديري - لوحة توزيع', TODAY, 'estimate', 'الكهرباء');

// Sanitary fixtures by grade
setPrice('P079', 6000, 4000, 9000, 'طقم', 'مصنعيات أكتوبر 2026 - طقم اقتصادي', LABOR_DATE, 'local', 'السباكة والصرف');
setPrice('P080', 10000, 7000, 14000, 'طقم', 'مصنعيات أكتوبر 2026 - طقم متوسط', LABOR_DATE, 'local', 'السباكة والصرف');
setPrice('P081', 16000, 12000, 22000, 'طقم', 'مصنعيات أكتوبر 2026 - طقم فاخر', LABOR_DATE, 'local', 'السباكة والصرف');

// Water tank
setPrice('P128', 4500, 3000, 6000, 'قطعة', 'تقديري - خزان مياه', TODAY, 'estimate', 'السباكة والصرف');

// Indirect costs - Engineering & Testing
setPrice('P057', 25000, 15000, 40000, 'مشروع', 'تقديري - تصميم معماري/إنشائي', TODAY, 'estimate', 'التكاليف غير المباشرة');
setPrice('P059', 8000, 5000, 12000, 'مشروع', 'تقديري - اختبارات خرسانة/حديد', TODAY, 'estimate', 'التكاليف غير مباشرة');
setPrice('P085', 15000, 10000, 25000, 'مشروع', 'تقديري - إشراف هندسي', TODAY, 'estimate', 'التكاليف غير المباشرة');

// Elevator
setPrice('P055', 280000, 220000, 350000, 'وحدة', 'تقديري - أسانسير 6-8 وقفات', TODAY, 'estimate', 'الأسانسير');
setPrice('P086', 35000, 25000, 50000, 'وحدة', 'تقديري - مصنعية تركيب', TODAY, 'estimate', 'الأسانسير');
setPrice('P087', 12000, 8000, 18000, 'سنوي', 'تقديري - صيانة سنوية', TODAY, 'estimate', 'الأسانسير');
setPrice('P113', 300000, 250000, 380000, 'وحدة', 'تقديري - توريد وتركيب 6-8 وقفات', TODAY, 'estimate', 'الأسانسير');

// Labor - structural
setPrice('P091', 180, 150, 220, 'م²', 'مصنعيات أكتوبر 2026 - نجارة مسلحة', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P092', 2800, 2200, 3500, 'طن', 'مصنعيات أكتوبر 2026 - حدادة مسلحة', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P093', 845, 290, 1400, 'م³', 'مشتق: متوسط مصنعيات عناصر إنشائية', TODAY, 'priced', 'المصنعيات والعمالة');
setPrice('P094', 350, 250, 500, 'يوم', 'مصنعيات أكتوبر 2026 - يومية صنايعي', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P095', 180, 130, 250, 'يوم', 'مصنعيات أكتوبر 2026 - يومية عامل', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P145', 120, 80, 180, 'م²', 'مصنعيات أكتوبر 2026 - عزل مائي', LABOR_DATE, 'local', 'المصنعيات والعمالة');

// Finishing labor
setPrice('P033', 67.5, 50, 85, 'م²', 'مصنعيات أكتوبر 2026 - محارة', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P056', 225, 150, 300, 'م²', 'مصنعيات أكتوبر 2026 - تركيب سيراميك', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P119', 125, 80, 180, 'م²', 'مصنعيات أكتوبر 2026 - خامات كهرباء للمتر', LABOR_DATE, 'local', 'المصنعيات والعمالة');
setPrice('P131', 545.45, 363, 727, 'نقطة', 'مشتق: سعر متر / كثافة نقاط', TODAY, 'priced', 'المصنعيات والعمالة');
setPrice('P146', 265, 180, 350, 'م²', 'مصنعيات أكتوبر 2026 - جبس بورد', LABOR_DATE, 'local', 'المصنعيات والعمالة');

// Paint labor
// P049 and P111 already set as derived above

// Plaster exterior
// Bridge for external plaster
const extPlaster = findItem('B26-004');
if (extPlaster) { extPlaster.avg = 67.5; extPlaster.low = 50; extPlaster.high = 85; }

// Tiling wet areas
// Bridge for wet tile
const wetTile = findItem('B26-002');
if (wetTile) { wetTile.avg = 225; wetTile.low = 150; wetTile.high = 300; }

// Internal plastic paint
const intPlastic = findItem('B26-003');
if (intPlastic) { intPlastic.avg = 125; intPlastic.low = 80; intPlastic.high = 180; }

// Gypsum installation
const gypsumInst = findItem('B26-006');
if (gypsumInst) { gypsumInst.avg = 265; gypsumInst.low = 180; gypsumInst.high = 350; }

// Internal plaster bridge
const intPlaster = findItem('B26-001');
if (intPlaster) { intPlaster.avg = 67.5; intPlaster.low = 50; intPlaster.high = 85; }

// Sealer - keep as missing (no density)
// P133 سيلر داخلي - leave as missing

// Fiber mesh
setPrice('P140', 45, 35, 60, 'م²', 'تقديري - شبك فيبر جلاس', TODAY, 'estimate', 'التشطيبات');

// Drywall screws
setPrice('P142', 0.8, 0.5, 1.2, 'مسمار', 'تقديري - مسامير جبس بورد', TODAY, 'estimate', 'التشطيبات');

// Metal profiles
setPrice('P143', 25, 20, 35, 'م.ط', 'تقديري - بروفايل معدني', TODAY, 'estimate', 'التشطيبات');

// Ceramic joint material
setPrice('P144', 35, 25, 50, 'كجم', 'تقديري - مادة فواصل', TODAY, 'estimate', 'التشطيبات');

// Kitchen - optional
setPrice('P053', 35000, 20000, 60000, 'مطبخ', 'تقديري - وحدات مطبخ', TODAY, 'estimate', 'خيارات إضافية');

// AC preparation - optional
setPrice('P054', 8000, 5000, 12000, 'مشروع', 'تقديري - تأسيس تكييف', TODAY, 'estimate', 'خيارات إضافية');

// Price difference for rebar diameters
setPrice('P010', 2000, 1000, 3500, 'طن', 'تقديري - فرق أقطار', TODAY, 'estimate', 'الهيكل الخرساني');

// ============================================================
// 4. Restore source-of-truth rows where the bulletin import regressed newer data.
// ============================================================
const RESTORE_ROWS = ['P001','P002','P003','P004','P005','P006','P028','P029','P030','P032','P037','P045','P046','P047','P048','P061','P062','P063','P064','P065','P066','P067','P119','P132'];
for (const id of RESTORE_ROWS) {
  const target = findItem(id), known = knownGoodById.get(id);
  if (!target || !known) continue;
  const preserved = {};
  for (const key of ['bulletinQuotes','laborQuotes','previousPrice','priceNotes','historicalQuotes']) if (target[key] !== undefined) preserved[key] = target[key];
  Object.assign(target, JSON.parse(JSON.stringify(known)), preserved);
}
const bridge = JSON.parse(fs.readFileSync(path.join(ROOT, 'MISSING-PRICES-2026-10-IMPORT.json'), 'utf8')).newRows.find(row => row.id === 'B26-003');
if (bridge && !findItem('B26-003')) upsertItem({ ...bridge, category:'الكهرباء', confidence:'ضعيفة', transport:'unknown', qtyMode:'built_area', factor:0, calc:false, scope:'finishing', packages:['economic','semi','medium','luxury'], active:true });
// This reference is a disclosed derivation from 10,000–15,000 EGP per 100 m²,
// i.e. 100–150 EGP/m². Keep the separate lump-sum source row P119 unchanged.
const electricalBridge = findItem('B26-003');
if (electricalBridge) { electricalBridge.low = 100; electricalBridge.avg = 125; electricalBridge.high = 150; } 
// Do not proxy steel-by-diameter, tie-wire, or plastic-spacer prices without matching evidence.

// ============================================================
// 5. Add explicitly unpriced rows required by the engineer-approved BOQ structure.
// These stay missing until the engineer enters a local, scope-matched quote.
// ============================================================
const unpricedRows = [
  ['P162','حفر آلي ونقل ناتج الحفر شامل النقل','الحفر والأساسات','م³','سعر شامل للحفار والتحميل والنقل؛ أدخل عرضًا يحدد مسافة النقل والمقلب.'],
  ['P163','رمل ردم (توريد)','الحفر والأساسات','م³','سعر توريد الرمل فقط؛ أضف الهالك من إعدادات المنهجية، ولا يشمل مصنعية الردم والدك.'],
  ['P164','مياه خلط الخرسانة','الهيكل الخرساني','لتر','لا يوجد سعر مؤكد للوحدة؛ يُستخدم فقط إذا كانت المياه تحاسب كبند مستقل.'],
  ['P165','مصنعية الهيكل الخرساني شاملة الحدادة والنجارة والصب والشدة','الهيكل الخرساني','م³','بند مصنعية شامل واحد لكل م³ من القواعد حتى آخر سقف وفق عقد التنفيذ؛ لا يخلط مع توريد الخامات.'],
  ['P166','مياه خلط المونة','مواد البناء','لتر','سعر غير متاح؛ كمية المياه يحددها المهندس بحسب نوع المونة وظروف الموقع.'],
  ['P167','مصنعية تركيب باب داخلي','المصنعيات','باب','سعر تركيب فقط، بلا توريد الباب أو الإكسسوارات غير المشمولة بالعقد.'],
  ['P168','مصنعية تركيب شبابيك ألوميتال بالمتر المربع','المصنعيات','م²','سعر تركيب بالمتر المربع؛ لا يستبدل بسعر تركيب بالقطعة.'],
  ['P169','مصنعية تركيب طقم حمام','المصنعيات','طقم حمام','مصنعية تركيب الأطقم فقط، دون توريد الطقم أو أعمال تأسيس المواسير.'],
  ['P170','مصنعية تركيب مطبخ بالمتر الطولي','المصنعيات','م طولي','مصنعية تركيب فقط؛ يلزم التأكد من وحدة عرض المورد.'],
  ['P171','مصنعية ردم ودك','المصنعيات','م³','مصنعية الردم والدمك فقط على صافي الحجم؛ لا تشمل توريد الرمل.']
];
for (const [id,name,category,unit,note] of unpricedRows) {
  upsertItem({ id, name, category, unit, low:null, avg:null, high:null, date:'', source:note, status:'missing', confidence:'غير متاح', transport:'unknown', qtyMode:'manual', factor:0, calc:false, scope:'finishing', packages:['economic','semi','medium','luxury'], active:true });
}

// ============================================================
// 6. Create a small operational core and archive the unused bulletin long-tail.
// ============================================================
cleanPriceBook(book);
book.exportedAt = new Date().toISOString();
book.settings.boqWastePercentages = book.settings.boqWastePercentages && typeof book.settings.boqWastePercentages === 'object' ? book.settings.boqWastePercentages : {};

// The January bulletin introduced 291 product/size/brand variants that are not
// consumed by the current BOQ/takeoff rules. Keep every row for traceability,
// but remove them from default agent matching until they are linked to a rule.
const extendedRows = book.prices.filter(p => /^J26-\d{3}$/.test(String(p.id || '')));
for (const row of extendedRows) {
  row.previouslyActiveInV7 = row.active !== false;
  row.active = false;
  row.searchable = false;
  row.catalogTier = 'extended_archive';
  row.archivedReason = 'صف نشرة مرجعي غير مستخدم في قواعد المقايسة أو الحصر الحالية؛ يعاد تفعيله بعد ربطه ببند ووحدة وقاعدة حصر ومراجعة السعر محليًا.';
}
const extended = {
  app: book.app,
  schemaVersion: '1.0.0',
  version: 'extended-2026-01-v1',
  sourcePriceBookVersion: 'v7',
  source: 'نشرة أسعار مواد البناء — يناير 2026',
  generatedAt: new Date().toISOString(),
  rowCount: extendedRows.length,
  policy: 'أرشيف موسع خارج المطابقة الافتراضية. جميع الصفوف محفوظة للتتبع؛ لا تُستخدم في المقايسة الحالية قبل ربطها بقواعد الحصر وتحديث أسعارها.',
  rows: extendedRows
};
fs.writeFileSync(EXTENDED_PATH, JSON.stringify(extended, null, 2) + '\n');

book.prices = book.prices.filter(p => !/^J26-\d{3}$/.test(String(p.id || '')));
book.version = '2026-10-21-v8-core-catalog';
book.priceBookVersion = 'v8';
book.settings.extendedCatalogPath = 'api/_data/price-book-extended.v1.json';
book.settings.extendedCatalogRows = extendedRows.length;
book.settings.missingPriceBatch = 'agent-data-cleanup-2026-10-v8-core-catalog';
book.settings.missingPriceBatchDate = TODAY;
book.settings.missingPriceBatchNote = 'تم فصل صفوف الكتالوج الأساسية المستخدمة حاليًا عن 291 صف نشرة مرجعي غير مرتبط بقواعد الحصر. الصفوف الموسعة محفوظة في price-book-extended.v1.json وخارج المطابقة الافتراضية؛ لا توجد بيانات تاريخية محذوفة.';
book.knowledgeBase = { ...(book.knowledgeBase || {}), operationalCatalog: { version: 'v8', policy: 'core-first', extendedArchive: 'api/_data/price-book-extended.v1.json', excludedFromDefaultSearch: extendedRows.length, reason: 'rows not consumed by current BOQ/takeoff rules' } };

const active = book.prices.filter(p => p.active !== false);
const priced = active.filter(p => p.avg != null && p.avg !== '' && Number.isFinite(Number(p.avg)) && Number(p.avg) > 0);
console.log(`Operational rows: ${book.prices.length}; active: ${active.length}; priced: ${priced.length}; missing: ${active.length - priced.length}; coverage: ${Math.round(priced.length/active.length*1000)/10}%; extended archived rows: ${extendedRows.length}`);
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(book, null, 2) + '\n');
console.log(`Updated ${path.relative(ROOT, OUTPUT_PATH)} saved.`);
console.log(`Updated ${path.relative(ROOT, EXTENDED_PATH)} saved.`);
