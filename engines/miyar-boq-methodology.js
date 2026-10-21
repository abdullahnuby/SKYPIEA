'use strict';

// Editable BOQ defaults. Percentages are starting values, not statutory norms;
// the engineer may override each percentage in the protected Admin panel.
const WASTE_DEFINITIONS = [
  { key:'backfillSand', label:'رمل الردم', category:'الأعمال الترابية', unit:'%', defaultPercent:5, note:'يطبق على توريد الرمل فقط؛ مصنعية الردم على صافي الحجم.' },
  { key:'concreteCement', label:'أسمنت الخرسانة', category:'الخرسانة المسلحة', unit:'%', defaultPercent:3, note:'فاقد توريد استرشادي؛ راجع طريقة التعبئة والتخزين وتصميم الخلطة.' },
  { key:'concreteSand', label:'رمل الخرسانة', category:'الخرسانة المسلحة', unit:'%', defaultPercent:5, note:'فاقد توريد استرشادي؛ لا يغني عن اعتماد مكونات الخلطة.' },
  { key:'concreteAggregate', label:'زلط/سن الخرسانة', category:'الخرسانة المسلحة', unit:'%', defaultPercent:5, note:'فاقد توريد استرشادي.' },
  { key:'concreteWater', label:'مياه خلط الخرسانة', category:'الخرسانة المسلحة', unit:'%', defaultPercent:0, note:'الكمية الأساسية من معدل الخلطة؛ يعتمد السعر وطريقة التوريد على الموقع.' },
  { key:'concreteSteel', label:'حديد التسليح', category:'الخرسانة المسلحة', unit:'%', defaultPercent:3, note:'يسري على وزن التوريد فقط. الهالك الفعلي يتأثر بالتفريد والاستفادة من الأطوال.' },
  { key:'bindingWire', label:'سلك ربط الحديد', category:'الخرسانة المسلحة', unit:'%', defaultPercent:5, note:'فاقد توريد استرشادي.' },
  { key:'masonryBrick', label:'الطوب', category:'مباني الطوب والمونة', unit:'%', defaultPercent:5, note:'يضاف على كمية شراء الطوب وليس مساحة مصنعية المباني.' },
  { key:'masonryCement', label:'أسمنت مونة المباني', category:'مباني الطوب والمونة', unit:'%', defaultPercent:3, note:'فاقد توريد استرشادي.' },
  { key:'masonrySand', label:'رمل مونة المباني', category:'مباني الطوب والمونة', unit:'%', defaultPercent:5, note:'فاقد توريد استرشادي.' },
  { key:'plasterCement', label:'أسمنت المحارة والطرطشة', category:'المحارة والبياض', unit:'%', defaultPercent:3, note:'فاقد توريد استرشادي.' },
  { key:'plasterSand', label:'رمل المحارة والطرطشة', category:'المحارة والبياض', unit:'%', defaultPercent:5, note:'فاقد توريد استرشادي.' },
  { key:'paintSealer', label:'السيلر', category:'أعمال الدهانات', unit:'%', defaultPercent:5, note:'يحسب بعد تحديد عدد الأوجه ومعدل التغطية الفعلي.' },
  { key:'paintPutty', label:'المعجون', category:'أعمال الدهانات', unit:'%', defaultPercent:10, note:'يحسب بعد تحديد عدد السكاكين وحالة السطح.' },
  { key:'paintFinish', label:'البلاستيك/طبقات الدهان', category:'أعمال الدهانات', unit:'%', defaultPercent:10, note:'يحسب على خامة الدهان فقط؛ المصنعية على المسطح المنفذ.' },
  { key:'tile', label:'السيراميك والبورسلين', category:'الأرضيات', unit:'%', defaultPercent:7.5, note:'يطبق على توريد البلاط فقط ولا يرفع كمية المصنعية.' },
  { key:'mortarCement', label:'أسمنت مونة الأرضيات والرخام', category:'الأرضيات', unit:'%', defaultPercent:3, note:'فاقد توريد استرشادي.' },
  { key:'mortarSand', label:'رمل مونة الأرضيات والرخام', category:'الأرضيات', unit:'%', defaultPercent:5, note:'فاقد توريد استرشادي.' },
  { key:'waterproofing', label:'مواد العزل', category:'العزل', unit:'%', defaultPercent:5, note:'إذا كانت الكمية تشمل التراكب والوزرات بالفعل، اجعل النسبة هنا صفرًا لمنع التكرار.' },
  { key:'electricalMaterials', label:'الخامات الكهربائية', category:'الكهرباء', unit:'%', defaultPercent:5, note:'لا يطبق على المصنعية أو عدد النقاط.' },
  { key:'plumbingMaterials', label:'خامات السباكة والصرف', category:'السباكة', unit:'%', defaultPercent:5, note:'لا يطبق على مصنعية النقاط.' },
  { key:'gypsumMaterials', label:'خامات الجبس بورد', category:'الأسقف', unit:'%', defaultPercent:5, note:'على مواد التوريد فقط، وليس مصنعية التركيب.' },
  { key:'otherMaterials', label:'الخامات الأخرى', category:'عام', unit:'%', defaultPercent:3, note:'مخصص افتراضي للبنود المادية غير المصنفة أعلاه؛ راجع البند قبل الاعتماد.' }
];

const DEFINITIONS_BY_KEY = new Map(WASTE_DEFINITIONS.map(item => [item.key, item]));

function wasteKeyFor(line = {}) {
  const code = String(line.code || line.key || '').toUpperCase();
  const name = String(line.item || line.title || line.name || '');
  const text = `${code} ${name}`;
  const kind = String(line.kind || line.type || 'material').toLowerCase();
  if (!['material','supply','توريد','خامات'].includes(kind)) return null;
  if (/FOUND-EXC|EXCAVATION|SPOIL|BACKFILL/.test(code) || /حفر|ناتج الحفر|مصنعية الردم|ردم ودك/.test(name)) return /رمل ردم|توريد رمل الردم/.test(name) || /BACKFILL.*(?:SAND|MAT)/.test(code) ? 'backfillSand' : null;
  if (/WATERPROOF|INSULATION|BITUMEN|MEMBRANE/.test(code) || /عزل مائي|عزل حراري|رولات عزل|بيتومين|ألواح عزل/.test(name)) return 'waterproofing';
  if (/MASONRY|HALF-BRICK|FULL-BRICK/.test(code) || /طوب أحمر|طوب بلوك/.test(name)) return 'masonryBrick';
  if (/MASONRY.*CEMENT|HALF-CEMENT|FULL-CEMENT/.test(code) || /أسمنت مونة (?:حائط|المباني)|أسمنت مباني/.test(name)) return 'masonryCement';
  if (/MASONRY.*SAND|HALF-SAND|FULL-SAND/.test(code) || /رمل مونة (?:حائط|المباني)|رمل مباني/.test(name)) return 'masonrySand';
  if (/CONCRETE.*CEMENT|FOUND.*CEMENT|BASEMENT.*CEMENT/.test(code) || /أسمنت خلط الخرسانة/.test(name)) return 'concreteCement';
  if (/CONCRETE.*SAND|FOUND.*SAND|BASEMENT.*SAND/.test(code) || /رمل خلطة الخرسانة/.test(name)) return 'concreteSand';
  if (/CONCRETE.*(?:AGG|STONE)|FOUND.*(?:AGG|STONE)|BASEMENT.*(?:AGG|STONE)/.test(code) || /زلط\/سن خلطة الخرسانة/.test(name)) return 'concreteAggregate';
  if (/CONCRETE.*WATER/.test(code) || /ماء خلط الخرسانة/.test(name)) return 'concreteWater';
  if (/STEEL|REBAR/.test(code) || /حديد تسليح/.test(name)) return 'concreteSteel';
  if (/BINDING-WIRE|(?:STEEL|REBAR).*WIRE/.test(code) || /سلك ربط الحديد/.test(name)) return 'bindingWire';
  if (/PLASTER|SPLASH|FACADE-CEMENT/.test(code) || /أسمنت (?:المحارة|الطرطشة|البياض)/.test(name)) return 'plasterCement';
  if (/FACADE-SAND|PLASTER-SAND|SPLASH-SAND/.test(code) || /رمل (?:المحارة|الطرطشة|البياض)/.test(name)) return 'plasterSand';
  if (/PUTTY|معجون/.test(code + ' ' + name)) return 'paintPutty';
  if (/SEALER|سيلر/.test(code + ' ' + name)) return 'paintSealer';
  if (/PAINT|بلاستيك داخلي|بلاستيك خارجي|دهان/.test(code + ' ' + name)) return 'paintFinish';
  if (/WET-TILE|FLOOR-TILE|TILE-FLOOR|TILE-MATERIAL/.test(code) || /سيراميك|بورسلين|بلاط أرضيات/.test(name)) {
    if (/CEMENT|أسمنت مونة/.test(code + ' ' + name)) return 'mortarCement';
    if (/SAND|رمل مونة/.test(code + ' ' + name)) return 'mortarSand';
    return 'tile';
  }
  if (/MARBLE|GRANITE/.test(code) || /رخام|جرانيت/.test(name)) return 'tile';
  if (/ELEC|WIRE|CABLE|SWITCH|SOCKET|PANEL|LIGHT/.test(code) || /خامات كهرباء|كابلات|أسلاك كهرباء|مفاتيح وبرايز/.test(name)) return 'electricalMaterials';
  if (/PLUMB|SANITARY|WATER-POINT|DRAIN-POINT|SEWER/.test(code) || /خامات سباكة|مواسير مياه|مواسير صرف|أطقم صحية/.test(name)) return 'plumbingMaterials';
  if (/GYPSUM|CEILING/.test(code) || /جبس بورد|ألواح جبس/.test(name)) return 'gypsumMaterials';
  if (/FORMWORK/.test(code) || /إيجار شدة|توريد شدة/.test(name)) return null;
  if (/material|خامات|توريد/.test(kind)) return 'otherMaterials';
  return null;
}

function getWastePercent(settings = {}, line = {}) {
  const key = line.wasteKey || wasteKeyFor(line);
  if (!key || !DEFINITIONS_BY_KEY.has(key)) return Math.max(0, Number(line.wastePercent) || 0);
  const configured = settings.boqWastePercentages && settings.boqWastePercentages[key];
  if (configured !== undefined && configured !== null && configured !== '') {
    const value = Number(configured);
    if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
  }
  if (line.wastePercent !== undefined && line.wastePercent !== null && line.wastePercent !== '') return Math.min(100, Math.max(0, Number(line.wastePercent) || 0));
  if (key === 'tile' && settings.tileWastePercent !== undefined && settings.tileWastePercent !== null && Number.isFinite(Number(settings.tileWastePercent))) return Math.min(100, Math.max(0, Number(settings.tileWastePercent)));
  return DEFINITIONS_BY_KEY.get(key).defaultPercent;
}

module.exports = { WASTE_DEFINITIONS, wasteKeyFor, getWastePercent };
