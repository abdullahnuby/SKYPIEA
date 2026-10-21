'use strict';
const rates = require('../../engines/miyar-rates.js');
const boqMethodology = require('../../engines/miyar-boq-methodology.js');
const MAX_PRICE_ROWS = 3000;
function coverage(book) {
  const active = book.prices.filter(p => p.active !== false);
  const priced = active.filter(rates.hasUsablePrice);
  return { active: active.length, priced: priced.length, missing: active.length - priced.length, coveragePercent: active.length ? Math.round(priced.length / active.length * 1000) / 10 : 0 };
}
function cleanText(value, label, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw Object.assign(new Error(`${label} يجب أن يكون نصًا.`), { status: 400 });
  const result = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (result.length > max || (required && !result)) throw Object.assign(new Error(`${label} غير صالح.`), { status: 400 });
  return result;
}
function money(value, label, optional = true) {
  if (value === '' || value == null) { if (optional) return null; throw Object.assign(new Error(`${label} مطلوب.`), { status: 400 }); }
  if (typeof value === 'string' || !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 1e12) throw Object.assign(new Error(`${label} لازم يكون رقمًا موجبًا.`), { status: 400 });
  return Number(value);
}
function validateBook(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('ملف الأسعار غير صالح.'), { status: 400 });
  if (!Array.isArray(input.prices) || input.prices.length < 1 || input.prices.length > MAX_PRICE_ROWS) throw Object.assign(new Error(`عدد البنود يجب أن يكون بين 1 و${MAX_PRICE_ROWS}.`), { status: 400 });
  const book = JSON.parse(JSON.stringify(input));
  book.settings = book.settings && typeof book.settings === 'object' && !Array.isArray(book.settings) ? book.settings : {};
  const settingNumber = (key, fallback, min, max, includeMax = true) => {
    const v = book.settings[key] == null || book.settings[key] === '' ? fallback : Number(book.settings[key]);
    if (!Number.isFinite(v) || v < min || (includeMax ? v > max : v >= max)) throw Object.assign(new Error(`إعداد ${key} خارج النطاق المسموح.`), { status: 400 });
    book.settings[key] = v; return v;
  };
  settingNumber('margin', 15, 0, 100);
  settingNumber('minCoverage', 0.70, 0, 1);
  settingNumber('staleDays', 90, 1, 3650);
  book.settings.marginMode = book.settings.marginMode || 'comprehensive';
  if (!['comprehensive', 'supervision'].includes(book.settings.marginMode)) throw Object.assign(new Error('طريقة التسعير غير صحيحة.'), { status: 400 });
  for (const [key, fallback, max] of [['steelFactor',0.08,500],['concreteFactor',0.35,5],['basementSteelFactor',0.08,500],['basementConcreteFactor',0.35,5],['supervision',10,1000000]]) {
    if (book.settings[key] == null) book.settings[key] = fallback;
    const value = Number(book.settings[key]);
    if (!Number.isFinite(value) || value < 0 || value > max) throw Object.assign(new Error(`إعداد المعدل ${key} غير صالح.`), { status: 400 });
    book.settings[key] = value;
  }
  const savedRates = book.settings.resourceRates == null ? {} : book.settings.resourceRates;
  if (!savedRates || typeof savedRates !== 'object' || Array.isArray(savedRates)) throw Object.assign(new Error('resourceRates يجب أن يكون كائنًا.'), { status: 400 });
  const knownRates = new Set(Object.keys(rates.defaults));
  for (const [key, raw] of Object.entries(savedRates)) {
    if (!knownRates.has(key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error(`معدل استهلاك غير معروف أو غير صالح: ${key}`), { status: 400 });
    for (const field of ['value','low','high']) {
      if (raw[field] == null || raw[field] === '') continue;
      const n = Number(raw[field]);
      if (!Number.isFinite(n) || n <= 0 || n > 1e9) throw Object.assign(new Error(`${key}: قيمة ${field} يجب أن تكون موجبة.`), { status: 400 });
      raw[field] = n;
    }
    if (raw.low != null && raw.high != null && raw.low > raw.high) throw Object.assign(new Error(`${key}: الحد الأدنى أكبر من الحد الأعلى.`), { status: 400 });
    if (raw.value != null && ((raw.low != null && raw.value < raw.low) || (raw.high != null && raw.value > raw.high))) throw Object.assign(new Error(`${key}: القيمة المركزية خارج النطاق.`), { status: 400 });
  }
  const wasteSettings = book.settings.boqWastePercentages == null ? {} : book.settings.boqWastePercentages;
  if (!wasteSettings || typeof wasteSettings !== 'object' || Array.isArray(wasteSettings)) throw Object.assign(new Error('boqWastePercentages يجب أن يكون كائنًا.'), { status: 400 });
  const validWasteKeys = new Set(boqMethodology.WASTE_DEFINITIONS.map(item => item.key));
  for (const [key, raw] of Object.entries(wasteSettings)) {
    if (!validWasteKeys.has(key)) throw Object.assign(new Error(`نسبة هالك غير معروفة: ${key}`), { status: 400 });
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw Object.assign(new Error(`نسبة الهالك ${key} يجب أن تكون من 0 إلى 100%.`), { status: 400 });
    wasteSettings[key] = value;
  }
  book.settings.boqWastePercentages = wasteSettings;
  book.settings.resourceRates = savedRates;
  // Keep the frozen engines' compatibility settings synchronized with any shared-rate edit.
  // Several frozen paths still prioritize legacy keys or modelRates over resourceRates.
  const legacyTargets = {
    steelKgPerM2: ['steelFactor', 1 / 1000],
    concreteM3PerM2: ['concreteFactor', 1],
    basementSteelKgPerM2: ['basementSteelFactor', 1 / 1000],
    basementConcreteM3PerM2: ['basementConcreteFactor', 1],
    tileWaste: ['tileWastePercent', 1]
  };
  const modelAliases = {
    plasterSurfaceM2PerM2Built: ['plasterM2PerM2Built'],
    puttyKgPerM2Surface: ['puttyKgPerM2Apartment'],
    sealerLPerM2Surface: ['sealerLPerM2Apartment'],
    interiorPaintLPerM2Surface: ['paintLPerM2Apartment'],
    floorTileM2PerM2Apartment: ['floorTileM2PerM2Apartment'],
    wetTileM2PerM2Apartment: ['wetTileM2PerM2Apartment'],
    floorTileCementKgPerM2: ['tileCementKgPerM2'],
    floorTileSandM3PerM2: ['tileSandM3PerM2']
  };
  book.settings.modelRates = book.settings.modelRates && typeof book.settings.modelRates === 'object' && !Array.isArray(book.settings.modelRates) ? book.settings.modelRates : {};
  for (const key of Object.keys(savedRates)) {
    const resolved = rates.getRate(key, book.settings, 'resourceRates');
    const rate = { value: resolved.value, low: resolved.low, high: resolved.high };
    book.settings.resourceRates[key] = rate;
    book.settings.modelRates[key] = { ...rate };
    const legacy = legacyTargets[key];
    if (legacy) book.settings[legacy[0]] = rate.value * legacy[1];
    for (const alias of modelAliases[key] || []) book.settings.modelRates[alias] = { ...rate };
  }
  const ids = new Set();
  book.prices = book.prices.map((raw, index) => {
    const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : null;
    if (!p) throw Object.assign(new Error(`البند ${index + 1} غير صالح.`), { status: 400 });
    p.id = cleanText(String(p.id || `ADM-${String(index + 1).padStart(4, '0')}`), `معرّف البند ${index + 1}`, 60, true);
    if (ids.has(p.id)) throw Object.assign(new Error(`معرّف مكرر: ${p.id}`), { status: 400 });
    ids.add(p.id);
    p.name = cleanText(p.name, `اسم البند ${index + 1}`, 180, true);
    p.category = cleanText(p.category || 'غير مصنف', `تصنيف ${p.name}`, 120, true);
    p.unit = cleanText(p.unit, `وحدة ${p.name}`, 40, true);
    for (const key of ['low', 'avg', 'high']) p[key] = money(p[key], `${p.name}: ${key}`);
    if (p.low != null && p.avg != null && p.low > p.avg) throw Object.assign(new Error(`${p.name}: أقل سعر أكبر من المتوسط.`), { status: 400 });
    if (p.avg != null && p.high != null && p.avg > p.high) throw Object.assign(new Error(`${p.name}: المتوسط أكبر من أعلى سعر.`), { status: 400 });
    if (p.low != null && p.high != null && p.low > p.high) throw Object.assign(new Error(`${p.name}: أقل سعر أكبر من أعلى سعر.`), { status: 400 });
    p.status = cleanText(String(p.status || 'missing'), `حالة ${p.name}`, 32, true);
    if (!/^[a-z][a-z_-]{1,31}$/i.test(p.status)) throw Object.assign(new Error(`حالة السعر غير صالحة للبند ${p.name}.`), { status: 400 });
    p.source = cleanText(p.source || '', `مصدر ${p.name}`, 300);
    p.date = cleanText(p.date || '', `تاريخ ${p.name}`, 10);
    if (p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw Object.assign(new Error(`تاريخ السعر للبند ${p.name} يجب أن يكون YYYY-MM-DD.`), { status: 400 });
    p.transport = cleanText(String(p.transport || 'unknown'), `النقل ${p.name}`, 32);
    if (!['yes', 'no', 'unknown', 'not-applicable', 'included', 'excluded'].includes(p.transport)) throw Object.assign(new Error(`حالة النقل غير صالحة للبند ${p.name}.`), { status: 400 });
    p.active = p.active !== false;
    if (p.status !== 'missing') {
      const priceErrors = rates.validatePriceInput(p);
      if (priceErrors.length) throw Object.assign(new Error(`${p.name}: ${priceErrors.join(' ')}`), { status: 400 });
    }
    return p;
  });
  book.version = String(book.version || '1');
  return book;
}
module.exports = { validateBook, coverage };
