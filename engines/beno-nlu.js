(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./beno-lexicon.js') : (root.BENO_LEXICON || {}));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BENO_NLU = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (baseLexicon) {
  'use strict';

  // Deterministic language layer for BENO. It never invents numbers and never
  // decides prices: it classifies intent, resolves typed facts with confidence,
  // and hands everything to the deterministic engines for validation. Pure —
  // no I/O, no environment reads. The lexicon can be extended at runtime
  // (learning loop) through mergeAdditions().

  let lexiconVersion = null;
  const lexicon = {
    intents: Object.create(null),   // intent -> [{syn, weight}]
    negations: new Set(),
    slotFeatures: Object.create(null),
    packageKeywords: Object.create(null),
    scopeKeywords: Object.create(null),
    modelHints: Object.create(null),
    places: [],
    materials: []
  };

  function normalize(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ـ/g, '')
      .replace(/م²|م2/g, ' مترمربع ').replace(/متر مربع/g, ' مترمربع ')
      .replace(/[\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function addSynonym(intent, syn) {
    if (!Array.isArray(lexicon.intents[intent])) lexicon.intents[intent] = [];
    lexicon.intents[intent].push({ syn, weight: 1 });
  }

  function buildLexicon(source) {
    lexicon.intents = Object.create(null);
    lexicon.negations = new Set();
    lexicon.slotFeatures = Object.create(null);
    lexicon.packageKeywords = Object.create(null);
    lexicon.scopeKeywords = Object.create(null);
    lexicon.modelHints = Object.create(null);
    lexicon.places = [];
    lexicon.materials = [];
    lexiconVersion = null;
    if (!source || typeof source !== 'object') return;
    lexiconVersion = String(source.VERSION || 'unversioned');
    for (const [intent, list] of Object.entries(source.intents || {})) {
      if (!Array.isArray(list)) continue;
      lexicon.intents[intent] = list.map(s => ({ syn: normalize(s), weight: 1 }));
    }
    for (const neg of (source.negations || [])) lexicon.negations.add(normalize(neg));
    for (const [key, def] of Object.entries(source.slotFeatures || {})) {
      lexicon.slotFeatures[key] = { label: String(def.label || key), positive: (def.positive || []).map(normalize) };
    }
    for (const [key, list] of Object.entries(source.packageKeywords || {})) {
      lexicon.packageKeywords[key] = (Array.isArray(list) ? list : []).map(normalize);
    }
    for (const [key, list] of Object.entries(source.scopeKeywords || {})) {
      lexicon.scopeKeywords[key] = (Array.isArray(list) ? list : []).map(normalize);
    }
    for (const [model, list] of Object.entries(source.modelHints || {})) {
      lexicon.modelHints[model] = (Array.isArray(list) ? list : []).map(normalize);
    }
    lexicon.places = (source.places || []).map(normalize);
    lexicon.materials = (source.materials || []).filter(m => m && m.query).map(m => ({ query: String(m.query), terms: (m.terms || []).map(normalize) }));
  }
  buildLexicon(baseLexicon);

  // --- token helpers ---------------------------------------------------------
  const TOKEN_SPLIT = /[^\p{L}\p{N}]+/u;
  function tokenize(text) {
    return normalize(text).split(TOKEN_SPLIT).filter(Boolean);
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return Math.max(m, n);
    if (m > 24 || n > 24) return Math.max(m, n); // guard
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      const ai = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ai === b.charCodeAt(j - 1) ? 0 : 1));
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }

  // 1.0 exact · ≥0.72 fuzzy on ≤2 edits (short words demand exact).
  function tokenSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const d = editDistance(a, b);
    const lim = a.length >= 5 ? 2 : a.length >= 4 ? 1 : 0;
    if (d === 0) return 1;
    if (d > lim) return 0;
    return Math.max(0, 1 - d / Math.max(a.length, b.length)) * (d === 1 ? 0.85 : 0.72);
  }

  function phraseSimilarity(haystackTokens, synonym) {
    const synTokens = String(synonym || '').split(TOKEN_SPLIT).filter(Boolean);
    if (!synTokens.length) return 0;
    let best = 0;
    // Sliding window over the haystack comparing token-by-token with fuzzy match.
    // For multi-token synonyms every positional pair must match (>= 0.5) — a
    // partially matching window is rejected, so 'لماذا + أسماء' never matches
    // 'ماذا لو' or half a question keyword claiming a whole intent.
    for (let start = 0; start + synTokens.length <= haystackTokens.length; start++) {
      let score = 0, ok = true;
      for (let k = 0; k < synTokens.length; k++) {
        const s = tokenSimilarity(haystackTokens[start + k], synTokens[k]);
        if (s < 0.5) { ok = false; break; }
        score += s;
      }
      if (!ok) continue;
      best = Math.max(best, score / synTokens.length);
    }
    return best;
  }

  // Two negation classes, because distance means different things:
  // near   — 'مفيش/مش/بدون/من غير…' negates an anchor within 2 tokens back.
  // remove — 'شيل/شلنا/الغي/الغينا…' is a removal verb acting on the object
  //          immediately after it ('شلنا المصعد والمطبخ'):
  const REMOVE_NEGATIONS = ['شيل','شلنا','شيلوا','الغي','الغى','الغينا','الغيت','الالغاء','الغاء','شيله'];
  const removeNegations = new Set(REMOVE_NEGATIONS.map(normalize));
  // Desire/filler verbs that a 'مش' may cross before reaching its object:
  // 'مش عايز تأسيس تكييف' — the negation sits three tokens back.
  const DESIRE_VERBS = new Set(['عايز','عاوز','عايزه','عاوزه','عايزين','عاوزين','بحب','حابب','مطلوب','محتاج','محتاجين','تأسيس'].map(normalize));
  // Connector/article stripping: leading 'و' ('ومفيش'), then 'ال/لل' ('المطبخ').
  function stripWord(t) {
    if (t.length >= 4 && t[0] === 'و') t = t.slice(1);
    if (t.length >= 3 && t.startsWith('ال')) t = t.slice(2);
    else if (t.length >= 4 && t.startsWith('لل')) t = t.slice(2);
    return t;
  }
  function negationApplied(tokens, index) {
    // Definite-article and و-connector prefixes ('والمفيش','ومطبخ') are stripped
    // so connectors don't hide negations or anchors.
    for (let back = 1; back <= 3 && index - back >= 0; back++) {
      const t = stripWord(tokens[index - back]);
      if (lexicon.negations.has(t)) return true;
      if (removeNegations.has(t)) return back === 1; // removal verb binds to next object only
      if (!DESIRE_VERBS.has(t)) return false;        // filler walk keeps the span honest
    }
    return false;
  }

  function negativeSuffix(token) {
    // 'عايزش' / 'عاوزش' — desire verbs marked with the الش negation suffix only.
    return token.length >= 4 && token.endsWith('ش') && /^(?:عايز|عاوز)/.test(token.slice(0, -1));
  }

  // --- public API -------------------------------------------------------------
  function resolveIntent(text, opts = {}) {
    const tokens = tokenize(text);
    const pending = opts.pending || null;
    if (!tokens.length) return { intent: 'empty', score: 0, alternatives: [], tokens };
    // A single bare number while a question is pending is an answer, not an intent.
    if (pending && tokens.length <= 2 && tokens.every(t => /^\d+(?:\.\d+)?$/.test(t))) {
      return { intent: 'answer_pending', score: 0.9, alternatives: [], tokens };
    }
    const scores = [];
    for (const [intent, syns] of Object.entries(lexicon.intents)) {
      let best = 0, bestSyn = null;
      for (const { syn } of syns) {
        const s = phraseSimilarity(tokens, syn);
        if (s > best) { best = s; bestSyn = syn; }
      }
      if (best > 0) scores.push({ intent, score: Math.min(1, best), matchedSyn: bestSyn });
    }
    scores.sort((a, b) => b.score - a.score);
    if (!scores.length) return { intent: 'unknown', score: 0, alternatives: [], tokens };
    const top = scores[0];
    // Confidence floor: near-miss words like 'تماما→تمام' or casual overlap
    // cannot claim an intent at < 0.7 combined similarity.
    if (top.score < 0.7) return { intent: 'unknown', score: top.score, alternatives: scores.slice(1, 4), tokens, matchedSyn: top.matchedSyn };
    return { intent: top.intent, score: top.score, alternatives: scores.slice(1, 4), tokens, matchedSyn: top.matchedSyn };
  }

  function resolveSlots(text, opts = {}) {
    const tokens = tokenize(text);
    const facts = [];
    const push = (key, value, label, confidence, origin) => facts.push({ key, value, label, confidence, origin: origin || 'lexicon' });

    // Boolean feature slots with a class-aware negation window. 'ال التعريف'
    // ('المصعد','البدروم') and the 'و' connector ('والمطبخ') are stripped before
    // anchor comparison so the same anchor list stays short and readable.
    for (const [key, def] of Object.entries(lexicon.slotFeatures)) {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
    const bare = stripWord(token);
        const anchor = def.positive.find(p => token === p || bare === p);
        if (!anchor) continue;
        const neg = negationApplied(tokens, i) || negativeSuffix(bare);
        push(key, !neg, def.label, neg ? 0.85 : 0.95, 'feature_window');
        break;
      }
    }

    // Packages / scope / model hints — best score above threshold wins per group.
    const pickGroup = (group, slotName) => {
      let bestKey = null, bestScore = 0;
      for (const [key, syns] of Object.entries(group)) {
        for (const syn of syns) {
          const s = phraseSimilarity(tokens, syn);
          if (s > bestScore) { bestScore = s; bestKey = key; }
        }
      }
      if (bestKey && bestScore >= 0.6) push(slotName, bestKey, String(bestKey), Math.min(1, bestScore), 'keyword');
    };
    pickGroup(lexicon.packageKeywords, 'package');
    pickGroup(lexicon.scopeKeywords, 'scope');
    pickGroup(lexicon.modelHints, 'modelCode');

    // Locations — exact normalized token containment; multi-token places match
    // when all their tokens appear, and the richest match wins (so teaching
    // 'القرنه الجديده' beats the bare 'قرنه').
    let bestPlace=null,bestPlaceHits=0;
    for (const place of lexicon.places) {
      const parts=place.split(' ').filter(Boolean);
      const hits=parts.filter(p2=>tokens.includes(p2)).length;
      if (hits===parts.length&&hits>bestPlaceHits){bestPlace=place;bestPlaceHits=hits;}
    }
    if (bestPlace){ push('location',bestPlace,`الموقع: ${bestPlace}`,0.9,'place_list'); }

    // Materials (feeds the price_lookup flow).
    let matchedMaterial = null;
    for (const material of lexicon.materials) {
      for (const term of material.terms) {
        const s = phraseSimilarity(tokens, term);
        if (s >= 0.85 && (!matchedMaterial || s > matchedMaterial.score)) {
          matchedMaterial = { query: material.query, score: s };
        }
      }
    }
    return { facts, matchedMaterial, tokens };
  }

  function resolve(text, opts = {}) {
    const intentResult = resolveIntent(text, opts);
    const slots = resolveSlots(text, opts);
    const needsConfirmation = slots.facts
      .filter(f => f.confidence < 0.8)
      .map(f => ({ key: f.key, label: f.label, value: f.value, confidence: f.confidence }));
    return {
      intent: intentResult.intent,
      intentScore: intentResult.score,
      matchedSyn: intentResult.matchedSyn || null,
      alternatives: intentResult.alternatives || [],
      tokens: intentResult.tokens,
      facts: slots.facts,
      matchedMaterial: slots.matchedMaterial,
      needsConfirmation,
      lexiconVersion
    };
  }

  // Runtime lexicon extension — the learning loop feeds normalized additions here.
  function mergeAdditions(additions) {
    if (!additions || typeof additions !== 'object' || Array.isArray(additions)) throw new Error('lexicon additions must be an object.');
    const allowed = new Set(['intents', 'negations', 'slotFeatures', 'packageKeywords', 'scopeKeywords', 'modelHints', 'places', 'materials']);
    for (const [kind, entries] of Object.entries(additions)) {
      if (!allowed.has(kind)) throw new Error(`Unknown lexicon kind: ${kind}`);
      if (kind === 'intents') {
        for (const [intent, syns] of Object.entries(entries || {})) {
          for (const s of (Array.isArray(syns) ? syns : [syns])) {
            const syn = normalize(s);
            if (syn && syn.length >= 2 && syn.length <= 60 && !lexicon.intents[intent]?.some(x => x.syn === syn)) addSynonym(intent, syn);
          }
        }
      } else if (kind === 'negations') {
        for (const s of (Array.isArray(entries) ? entries : [])) { const syn = normalize(s); if (syn) lexicon.negations.add(syn); }
      } else if (kind === 'slotFeatures') {
        for (const [key, def] of Object.entries(entries || {})) {
          if (!lexicon.slotFeatures[key]) lexicon.slotFeatures[key] = { label: normalize(def?.label || key), positive: [] };
          for (const s of (Array.isArray(def?.positive) ? def.positive : [])) {
            const syn = normalize(s);
            if (syn && !lexicon.slotFeatures[key].positive.includes(syn)) lexicon.slotFeatures[key].positive.push(syn);
          }
        }
      } else if (kind === 'packageKeywords' || kind === 'scopeKeywords') {
        for (const [key, syns] of Object.entries(entries || {})) {
          lexicon[kind][key] = lexicon[kind][key] || [];
          for (const s of (Array.isArray(syns) ? syns : [syns])) {
            const syn = normalize(s);
            if (syn && !lexicon[kind][key].includes(syn)) lexicon[kind][key].push(syn);
          }
        }
      } else if (kind === 'modelHints') {
        for (const [model, syns] of Object.entries(entries || {})) {
          if (!/^(?:APT|BLD)-[A-Z-]{2,12}$/.test(model)) throw new Error('modelCode family naming required (APT-* / BLD-*).');
          lexicon.modelHints[model] = lexicon.modelHints[model] || [];
          for (const s of (Array.isArray(syns) ? syns : [syns])) {
            const syn = normalize(s);
            if (syn && !lexicon.modelHints[model].includes(syn)) lexicon.modelHints[model].push(syn);
          }
        }
      } else if (kind === 'places') {
        for (const s of (Array.isArray(entries) ? entries : [])) {
          const syn = normalize(s);
          if (syn && syn.length >= 2 && syn.length <= 40 && !lexicon.places.includes(syn)) lexicon.places.push(syn);
        }
      } else if (kind === 'materials') {
        for (const m of (Array.isArray(entries) ? entries : [])) {
          if (!m?.query) continue;
          const existing = lexicon.materials.find(x => x.query === normalize(m.query));
          const terms = (Array.isArray(m.terms) ? m.terms : [m.terms]).map(normalize).filter(Boolean);
          if (existing) for (const t of terms) if (!existing.terms.includes(t)) existing.terms.push(t);
          else lexicon.materials.push({ query: normalize(m.query), terms });
        }
      }
    }
    return lexiconVersion;
  }

  return {
    normalize, tokenize, editDistance, tokenSimilarity, phraseSimilarity,
    resolveIntent, resolveSlots, resolve, mergeAdditions, buildLexicon,
    get lexiconVersion() { return lexiconVersion; },
    getIntentKeys() { return Object.keys(lexicon.intents).sort(); }
  };
});
