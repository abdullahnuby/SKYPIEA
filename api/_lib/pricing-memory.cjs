'use strict';
// BENO pricing intelligence (no LLM, no network).
//
// This module turns *evidence* into deterministic pricing signals:
//   - published price-book versions (admin decisions are labels),
//   - verified human/supplier observations (quotes, corrections, confirmations),
//   - optional unverified chat mentions (kept separate; never used to suggest).
//
// It never changes a price on its own and never invents a missing one. A signal
// only describes freshness, agreement, trend, and a clearly-labelled suggestion
// that an admin must review and apply to the draft book.

const DAY_MS = 86_400_000;
const KINDS = new Set(['quote', 'correction', 'confirmation', 'outcome']);
const SOURCE_TYPES = new Set(['admin', 'supplier', 'market', 'customer', 'chat', 'published', 'system']);
const PRICE_KINDS = new Set(['quote', 'correction', 'confirmation']);

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isoDay(value) {
  const d = value instanceof Date ? value : parseDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function ageDays(value, now = Date.now()) {
  const d = value instanceof Date ? value : parseDate(value);
  if (!d) return null;
  return Math.max(0, Math.floor((Number(now) - d.getTime()) / DAY_MS));
}

function normalizeUnit(unit) {
  return String(unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/م²|م2/g, 'م2')
    .replace(/م³|م3/g, 'م3')
    .replace(/كجم|كيلوجرام/g, 'كجم')
    .replace(/كيلو/g, 'كجم')
    .replace(/جنيه|ج\.م|egp/g, 'جنيه')
    .replace(/\s+/g, ' ')
    .trim();
}

function unitsCompatible(a, b) {
  const ua = normalizeUnit(a);
  const ub = normalizeUnit(b);
  if (!ua || !ub) return false;
  return ua === ub;
}

function isUsablePrice(row) {
  if (!row || row.active === false || row.status === 'missing') return false;
  return positive(row.avg) !== null;
}

function recencyWeight(days) {
  if (days === null) return 0.35;
  if (days <= 30) return 1;
  if (days <= 90) return 0.8;
  if (days <= 180) return 0.55;
  if (days <= 365) return 0.3;
  return 0.15;
}

function sourceWeight(sourceType) {
  switch (String(sourceType || '')) {
    case 'published': return 1;
    case 'admin': return 1;
    case 'supplier': return 0.95;
    case 'market': return 0.75;
    case 'customer': return 0.55;
    case 'chat': return 0.4;
    default: return 0.5;
  }
}

function observation(input, now) {
  const value = positive(input && (input.value ?? input.avg));
  if (value === null) return null;
  return {
    value,
    low: positive(input.low),
    high: positive(input.high),
    unit: input.unit ? String(input.unit).slice(0, 40) : null,
    date: isoDay(input.date || input.observedAt || input.publishedAt),
    source: String(input.source || '').slice(0, 180),
    sourceType: SOURCE_TYPES.has(input.sourceType) ? input.sourceType : 'system',
    verified: input.verified !== false,
    version: input.version ? String(input.version).slice(0, 40) : null,
    days: ageDays(input.date || input.observedAt || input.publishedAt, now)
  };
}

function versionObservations(versions, priceId, now) {
  const list = [];
  for (const version of (Array.isArray(versions) ? versions : [])) {
    const prices = Array.isArray(version && version.prices) ? version.prices : [];
    const row = prices.find(p => p && String(p.id || '') === String(priceId));
    if (!row || !isUsablePrice(row)) continue;
    const obs = observation({
      value: row.avg,
      low: row.low,
      high: row.high,
      unit: row.unit,
      date: version.publishedAt || version.published_at || row.date,
      source: `إصدار ${version.version || version.priceBookVersion || ''}`.trim(),
      sourceType: 'published',
      verified: true,
      version: version.version || version.priceBookVersion || null
    }, now);
    if (obs) list.push(obs);
  }
  return list;
}

function feedbackObservations(rows, priceId, rowUnit, now, verifiedOnly) {
  const list = [];
  for (const feedback of (Array.isArray(rows) ? rows : [])) {
    if (!feedback || String(feedback.priceId || feedback.price_id || '') !== String(priceId)) continue;
    const kind = String(feedback.kind || 'quote');
    if (!PRICE_KINDS.has(kind)) continue;
    const verified = feedback.verified === true;
    if (verifiedOnly && !verified) continue;
    if (!verifiedOnly && verified) continue;
    const unit = feedback.unit ? String(feedback.unit) : null;
    if (unit && rowUnit && !unitsCompatible(unit, rowUnit)) continue;
    const obs = observation({
      value: feedback.value ?? feedback.avg,
      low: feedback.low,
      high: feedback.high,
      unit,
      date: feedback.observedAt || feedback.observed_at || feedback.createdAt || feedback.created_at,
      source: feedback.source || 'ملاحظة تسعير',
      sourceType: feedback.sourceType || feedback.source_type || 'admin',
      verified,
      version: null
    }, now);
    if (obs) list.push(obs);
  }
  return list;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(obs => {
    const key = `${obs.value}|${obs.date || ''}|${obs.sourceType}|${obs.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function weightedMedian(list) {
  if (!list.length) return null;
  const rows = list.map(obs => ({
    value: obs.value,
    weight: recencyWeight(obs.days) * sourceWeight(obs.sourceType) * (obs.verified ? 1 : 0.25)
  })).sort((a, b) => a.value - b.value);
  const total = rows.reduce((sum, x) => sum + x.weight, 0);
  if (!(total > 0)) return null;
  let acc = 0;
  for (const row of rows) {
    acc += row.weight;
    if (acc >= total / 2) return row.value;
  }
  return rows[rows.length - 1].value;
}

function percentile(list, p) {
  const values = list.map(obs => obs.value).sort((a, b) => a - b);
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)));
  return values[index];
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function trendFrom(current, prior) {
  const c = positive(current), p = positive(prior);
  if (c === null || p === null || c === p) return { percent: 0, direction: 'stable' };
  const percent = round(((c - p) / p) * 100, 1);
  return { percent, direction: percent > 0 ? 'up' : 'down' };
}

function latestPriorObservation(current, observations) {
  if (!observations.length) return null;
  const currentDate = current && current.date ? parseDate(current.date) : null;
  const eligible = observations.filter(obs => {
    if (!currentDate || !obs.date) return true;
    const d = parseDate(obs.date);
    return !d || d.getTime() < currentDate.getTime();
  });
  const pool = (eligible.length ? eligible : observations).slice().sort((a, b) => {
    const ad = parseDate(a.date), bd = parseDate(b.date);
    return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
  });
  return pool[0] || null;
}

function deriveSignal(row, opts = {}) {
  const now = Number(opts.now || Date.now());
  const staleDays = Math.max(1, Number(opts.staleDays || 90));
  const versions = Array.isArray(opts.versions) ? opts.versions : [];
  const feedback = Array.isArray(opts.feedback) ? opts.feedback : [];
  const priceId = String(row && (row.id || row.priceId) || '');
  const unit = row && row.unit ? String(row.unit) : null;

  if (!row || !priceId) {
    return {
      priceId, name: '', unit, current: null, status: 'missing', date: null, ageDays: null,
      stale: true, trend: { direction: 'unknown', percent: null }, evidence: { verified: 0, unverified: 0, versions: 0, feedback: 0, lastVerifiedAt: null },
      confidence: { score: 0, label: 'منخفضة' }, flags: ['missing', 'unknown'], suggestion: null, review: { needed: true, priority: 95, reasons: ['بند غير معروف'] }
    };
  }

  const currentValue = positive(row.avg);
  const usable = isUsablePrice(row);
  const currentDate = row.date || null;
  const currentAge = ageDays(currentDate, now);
  const stale = usable && (currentAge === null || currentAge > staleDays);
  const unknownDate = usable && currentAge === null;

  const versionsObs = dedupe(versionObservations(versions, priceId, now));
  const verifiedObs = dedupe(feedbackObservations(feedback, priceId, unit, now, true));
  const unverifiedObs = dedupe(feedbackObservations(feedback, priceId, unit, now, false));
  // Trend is about published admin decisions, not a later chat/quote mention.
  const priorObs = versionsObs
    .filter(obs => obs.value !== currentValue || (obs.date && currentDate && obs.date !== currentDate))
    .sort((a, b) => {
      const ad = parseDate(a.date), bd = parseDate(b.date);
      return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
    });
  const prior = latestPriorObservation({ date: currentDate }, priorObs);
  const trend = usable && prior ? trendFrom(currentValue, prior.value) : { direction: 'unknown', percent: null };

  const evidenceObs = [...versionsObs, ...verifiedObs];
  const distinctDates = new Set(evidenceObs.map(o => o.date).filter(Boolean)).size;
  const distinctSources = new Set(evidenceObs.map(o => o.sourceType)).size;
  const values = evidenceObs.map(o => o.value);
  const median = weightedMedian(evidenceObs);
  const spread = values.length >= 3 && median ? (Math.max(...values) - Math.min(...values)) / median : 0;
  const conflicting = values.length >= 3 && spread > 0.35 && (distinctDates >= 2 || distinctSources >= 2);

  let confidenceScore = 0;
  if (usable) confidenceScore += 40;
  if (currentAge !== null) confidenceScore += currentAge <= 30 ? 22 : currentAge <= 90 ? 16 : currentAge <= 180 ? 9 : 3;
  if (usable && String(row.status || '') === 'local') confidenceScore += 8;
  if (usable && String(row.status || '') === 'national') confidenceScore += 2;
  confidenceScore += Math.min(18, verifiedObs.length * 6);
  confidenceScore += Math.min(8, versionsObs.length * 2);
  if (conflicting) confidenceScore -= 18;
  if (stale) confidenceScore -= 8;
  if (!usable) confidenceScore = Math.min(confidenceScore, 12);
  confidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));
  const confidenceLabel = confidenceScore >= 75 ? 'مرتفعة' : confidenceScore >= 50 ? 'متوسطة' : 'منخفضة';

  const flags = [];
  if (!usable) flags.push('missing');
  if (stale) flags.push('stale');
  if (unknownDate) flags.push('unknown-date');
  if (conflicting) flags.push('conflicting');
  if (values.length < 2) flags.push('thin-evidence');
  if (trend.direction === 'up' || trend.direction === 'down') flags.push(`trend-${trend.direction}`);
  if (confidenceScore < 50) flags.push('low-confidence');

  // A suggestion is evidence-only, unit-safe, and never automatic. It requires
  // at least three independent observations and a known compatible unit.
  let suggestion = null;
  const suggestionPool = [...versionsObs, ...verifiedObs].filter(obs => {
    if (!unit) return false;
    return obs.unit ? unitsCompatible(obs.unit, unit) : false;
  });
  const suggestionDates = new Set(suggestionPool.map(o => o.date).filter(Boolean));
  if (suggestionPool.length >= 3 && suggestionDates.size >= 2) {
    const value = weightedMedian(suggestionPool);
    const low = percentile(suggestionPool, 0.2);
    const high = percentile(suggestionPool, 0.8);
    if (value !== null) {
      suggestion = {
        value: round(value, 2),
        low: round(low, 2),
        high: round(high, 2),
        unit,
        evidenceCount: suggestionPool.length,
        method: 'weighted-median',
        requiresApproval: true,
        deviationPercent: usable && currentValue ? round(((value - currentValue) / currentValue) * 100, 1) : null
      };
    }
  }

  const reviewReasons = [];
  if (!usable) reviewReasons.push('لا يوجد سعر منشور');
  if (stale) reviewReasons.push('السعر أقدم من حد المراجعة');
  if (conflicting) reviewReasons.push('الأدلة متعارضة');
  if (confidenceScore < 50) reviewReasons.push('درجة الثقة منخفضة');
  if (suggestion && suggestion.deviationPercent !== null && Math.abs(suggestion.deviationPercent) >= 10) reviewReasons.push('دليل التسعير يختلف عن السعر المنشور');
  if (trend.percent !== null && Math.abs(trend.percent) >= 15) reviewReasons.push('تغير واضح عن آخر إصدار');
  if (unknownDate) reviewReasons.push('تاريخ السعر غير معروف');
  let priority = 0;
  if (!usable) priority += suggestion ? 100 : 75;
  if (conflicting) priority += 95;
  if (suggestion && suggestion.deviationPercent !== null && Math.abs(suggestion.deviationPercent) >= 10) priority += 85;
  if (stale) priority += 40;
  if (confidenceScore < 50) priority += 20;
  if (trend.percent !== null && Math.abs(trend.percent) >= 15) priority += 25;
  if (unknownDate) priority += 15;

  return {
    priceId,
    name: String(row.name || ''),
    unit,
    current: usable ? currentValue : null,
    status: String(row.status || (usable ? 'priced' : 'missing')),
    date: currentDate ? String(currentDate) : null,
    ageDays: currentAge,
    stale,
    trend,
    evidence: {
      verified: evidenceObs.length,
      unverified: unverifiedObs.length,
      versions: versionsObs.length,
      feedback: verifiedObs.length,
      distinctDates,
      lastVerifiedAt: evidenceObs.map(o => o.date).filter(Boolean).sort().slice(-1)[0] || null
    },
    confidence: { score: confidenceScore, label: confidenceLabel },
    flags,
    suggestion,
    review: {
      needed: reviewReasons.length > 0,
      priority,
      reasons: reviewReasons
    }
  };
}

// Public, non-sensitive projection. Unpublished suggestions stay admin-only.
function publicSignal(signal) {
  if (!signal) return null;
  return {
    confidence: signal.confidence,
    stale: signal.stale,
    ageDays: signal.ageDays,
    date: signal.date,
    trend: signal.trend,
    evidenceCount: signal.evidence.verified,
    lastVerifiedAt: signal.evidence.lastVerifiedAt,
    reviewSuggested: signal.review.needed,
    flags: signal.flags.slice(0, 8)
  };
}

function buildSignals(book, versions = [], feedback = [], opts = {}) {
  const prices = Array.isArray(book && book.prices) ? book.prices : [];
  const byId = Object.create(null);
  for (const row of prices) {
    if (!row || row.active === false) continue;
    const signal = deriveSignal(row, {
      versions,
      feedback,
      now: opts.now,
      staleDays: opts.staleDays || (book && book.settings && book.settings.staleDays) || 90
    });
    byId[signal.priceId] = signal;
  }
  const all = Object.values(byId);
  const reviewItems = all.filter(s => s.review.needed)
    .sort((a, b) => b.review.priority - a.review.priority || String(a.name).localeCompare(String(b.name), 'ar'))
    .map(s => ({
      priceId: s.priceId,
      name: s.name,
      unit: s.unit,
      current: s.current,
      status: s.status,
      date: s.date,
      ageDays: s.ageDays,
      stale: s.stale,
      trend: s.trend,
      confidence: s.confidence,
      flags: s.flags,
      suggestion: s.suggestion,
      reasons: s.review.reasons,
      priority: s.review.priority
    }));
  const summary = {
    rows: all.length,
    priced: all.filter(s => s.current !== null).length,
    missing: all.filter(s => s.current === null).length,
    stale: all.filter(s => s.stale).length,
    lowConfidence: all.filter(s => s.confidence.score < 50).length,
    conflicting: all.filter(s => s.flags.includes('conflicting')).length,
    suggested: all.filter(s => s.suggestion).length,
    reviewNeeded: reviewItems.length,
    verifications: all.reduce((sum, s) => sum + s.evidence.verified, 0),
    unverifiedMentions: all.reduce((sum, s) => sum + s.evidence.unverified, 0),
    lastVerifiedAt: all.map(s => s.evidence.lastVerifiedAt).filter(Boolean).sort().slice(-1)[0] || null
  };
  return { byId, all, reviewItems, summary };
}

function annotateLookupResult(result, signals) {
  if (!result || !signals || !signals.byId) return result;
  const signal = signals.byId[String(result.priceId || '')];
  if (!signal) return result;
  const publicView = publicSignal(signal);
  const notes = [];
  if (signal.trend.direction === 'up') notes.push(`السعر أعلى ${Math.abs(signal.trend.percent)}% من آخر إصدار منشور.`);
  else if (signal.trend.direction === 'down') notes.push(`السعر أقل ${Math.abs(signal.trend.percent)}% من آخر إصدار منشور.`);
  if (signal.evidence.feedback > 0 && signal.evidence.lastVerifiedAt) notes.push(`آخر تأكيد تسعير موثق: ${signal.evidence.lastVerifiedAt}.`);
  if (signal.confidence.score < 50) notes.push('درجة الثقة في هذا السعر منخفضة؛ يحتاج تأكيدًا محليًا قبل الاعتماد.');
  if (signal.flags.includes('conflicting')) notes.push('توجد ملاحظات سعر متعارضة لهذا البند؛ راجعها قبل استخدام السعر.');
  if (signal.flags.includes('unknown-date')) notes.push('تاريخ السعر غير مسجل؛ لا يمكن الحكم على حداثته.');
  if (!notes.length && signal.stale) notes.push('السعر قديم ويحتاج تأكيدًا محليًا.');
  return { ...result, intelligence: { ...publicView, note: notes.join(' ') || undefined } };
}

function annotateLookupResults(results, signals) {
  return (Array.isArray(results) ? results : []).map(r => annotateLookupResult(r, signals));
}

function rankScore(signal) {
  if (!signal) return 0;
  return signal.confidence.score * 10 + (signal.current !== null ? 15 : 0) + (signal.stale ? -20 : 0) - (signal.flags.includes('conflicting') ? 25 : 0);
}

function estimateIntelligence(view, signals) {
  if (!view || !signals) return null;
  const lines = (Array.isArray(view.lines) ? view.lines : []).map(line => {
    const signal = signals.byId[String(line.priceId || '')];
    return signal ? { ...line, pricing: publicSignal(signal) } : line;
  });
  const flagged = lines.filter(line => line.pricing && line.pricing.reviewSuggested);
  const stale = lines.filter(line => line.pricing && line.pricing.stale);
  const low = lines.filter(line => line.pricing && line.pricing.confidence && line.pricing.confidence.score < 50);
  const conflicting = lines.filter(line => line.pricing && Array.isArray(line.pricing.flags) && line.pricing.flags.includes('conflicting'));
  const notes = [];
  if (stale.length) notes.push(`${stale.length} بند مسعّر ببيانات قديمة ويحتاج تأكيدًا محليًا.`);
  if (low.length) notes.push(`${low.length} بند بدرجة ثقة منخفضة في التسعير.`);
  if (conflicting.length) notes.push(`${conflicting.length} بند له ملاحظات سعر متعارضة.`);
  return {
    lines,
    linesWithPricing: lines.filter(line => line.pricing).length,
    flaggedCount: flagged.length,
    staleCount: stale.length,
    lowConfidenceCount: low.length,
    conflictingCount: conflicting.length,
    notes,
    sourceNote: 'إشارات التعلّم وصفية فقط؛ لا تغيّر أي رقم في المقايسة ولا تُنشر تلقائيًا.'
  };
}

// --- chat/correction extraction ------------------------------------------------
// A narrow, conservative detector for a *price mention* in a client message.
// It never becomes a published price: the result is stored as an unverified
// observation and must be reviewed by an admin. Unknown units stay unknown.

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
    .replace(/م²|م2/g, ' م2 ').replace(/م³|م3/g, ' م3 ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(['بكام', 'بكم', 'سعر', 'السعر', 'ثمن', 'الثمن', 'كام', 'بقى', 'بقت', 'وصل', 'وصلت', 'عرض', 'عرضنا', 'مورد', 'المورد', 'اشتريت', 'شراء', 'بيع', 'النهارده', 'اليوم', 'دلوقتي', 'لو', 'سمحت', 'يا', 'مهندس', 'من', 'في', 'على', 'عن', 'هو', 'هي', 'ده', 'دي', 'ال', 'و']);

function tokensForMatch(text) {
  return normalizeText(text).split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+(?:\.\d+)?$/.test(t))
    .map(t => t.length >= 4 && t.startsWith('ال') ? t.slice(2) : t);
}

function matchPriceRow(text, prices) {
  const tokens = [...new Set(tokensForMatch(text))];
  if (!tokens.length) return null;
  let bestScore = 0;
  let best = [];
  for (const row of (Array.isArray(prices) ? prices : [])) {
    if (!row || row.active === false || !row.id) continue;
    const hay = normalizeText([row.name, ...(Array.isArray(row.aliases) ? row.aliases : []), row.category].join(' '));
    const words = new Set(hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    let hits = 0;
    for (const token of tokens) {
      if (words.has(token) || words.has(`ال${token}`) || (token.length >= 4 && hay.includes(token))) hits++;
    }
    if (!hits) continue;
    const score = hits / Math.max(2, Math.min(tokens.length, 4));
    if (score > bestScore) { bestScore = score; best = [row]; }
    else if (score === bestScore) best.push(row);
  }
  if (bestScore < 0.5 || !best.length) return null;
  // Ambiguity is not evidence: several equally good catalog rows means we cannot
  // safely attribute the mentioned price to one of them.
  const locals = best.filter(row => String(row.status || '') === 'local');
  if (locals.length === 1) return { row: locals[0], score: bestScore };
  return best.length === 1 ? { row: best[0], score: bestScore } : null;
}

const UNIT_AFTER = [
  [/(?:جنيه|ج\.?\s*م|egp)\s*$/, null],
  [/(?:للطن|لطن|الطن|طن)\s*$/, 'طن'],
  [/(?:للمتر\s*المربع|للمتر\s*المسطح|م2|متر\s*مربع)\s*$/, 'م2'],
  [/(?:للمتر\s*المكعب|م3|متر\s*مكعب)\s*$/, 'م3'],
  [/(?:للمتر|متر)\s*$/, 'م'],
  [/(?:للكيلو|للكجم|كجم|كيلو)\s*$/, 'كجم'],
  [/(?:للشيكاره|للشكارة|شيكاره|شكارة)\s*$/, 'شيكارة'],
  [/(?:للفرده|للفردة|للوحده|للوحدة|فرده|وحدة)\s*$/, 'وحدة']
];

function detectPriceObservation(message, book, opts = {}) {
  const raw = String(message || '').slice(0, 500);
  if (!raw.trim()) return null;
  const text = normalizeText(raw);
  const hasPriceCue = /(?:بكام|بكم|سعر|ثمن|بقى|بقت|وصل|وصلت|عرض|مورد|اشتريت|تكلفه|جنيه|ج\.?\s*م|egp)/u.test(text);
  if (!hasPriceCue) return null;
  const prices = Array.isArray(book && book.prices) ? book.prices : [];
  if (!prices.length) return null;

  // A number immediately followed by a currency/unit, or a price-cue sentence.
  const re = /(?:^|[^\p{L}\p{N}])(\d{1,7}(?:[.,]\d+)?)\s*([\p{L}0-9²³./]+)?/gu;
  const candidates = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    const value = positive(String(match[1]).replace(',', '.'));
    if (value === null || value < 10) continue;
    const attached = match[2] ? normalizeText(match[2]) : '';
    const tail = `${attached} ${text.slice(match.index + match[0].length, match.index + match[0].length + 24)}`.trim();
    const before = text.slice(Math.max(0, match.index - 24), match.index);
    let unit = null;
    for (const [pattern, mapped] of UNIT_AFTER) {
      if (pattern.test(tail)) { unit = mapped; break; }
    }
    if (!unit) {
      // A bare number is accepted only in an explicit price sentence and when
      // it is large enough to be a price, not an area/room count.
      if (!/(?:بكام|بكم|سعر|ثمن|بقى|بقت|وصل|وصلت|عرض|مورد|اشتريت|تكلفه)\s*$/u.test(before) && value < 100) continue;
      if (value < 100) continue;
    }
    candidates.push({ value, unit });
  }
  if (!candidates.length) return null;

  const material = matchPriceRow(raw, prices);
  if (!material) return null;
  const rowUnit = material.row.unit ? String(material.row.unit) : null;
  const compatible = candidates.filter(c => !c.unit || !rowUnit || unitsCompatible(c.unit, rowUnit));
  const chosen = (compatible.length ? compatible : candidates).slice(-1)[0];
  if (!chosen) return null;
  // A unit that contradicts the catalog unit is not a usable observation.
  if (chosen.unit && rowUnit && !unitsCompatible(chosen.unit, rowUnit)) return null;

  return {
    priceId: String(material.row.id),
    priceName: String(material.row.name || ''),
    kind: 'quote',
    value: chosen.value,
    unit: chosen.unit || null,
    observedAt: isoDay(opts.now || Date.now()),
    source: 'ذكر سعر في محادثة',
    sourceType: 'customer',
    verified: false,
    note: 'ملاحظة سعر من محادثة — تحتاج مراجعة بشرية قبل الاستخدام.'
  };
}

module.exports = {
  DAY_MS,
  KINDS,
  SOURCE_TYPES,
  normalizeText,
  normalizeUnit,
  unitsCompatible,
  isUsablePrice,
  ageDays,
  observation,
  versionObservations,
  feedbackObservations,
  weightedMedian,
  percentile,
  deriveSignal,
  publicSignal,
  buildSignals,
  annotateLookupResult,
  annotateLookupResults,
  rankScore,
  estimateIntelligence,
  detectPriceObservation
};
