'use strict';
// BENO dialogue-context layer (no LLM). Deterministic resolution of the human
// conversational signals that a single message cannot carry:
//   - discourse acts: change, cancel/undo, reuse ("نفس اللي فات"), compare,
//     clarify ("مش فاهم"), confirm, deny, plain answer;
//   - focus: which slot a bare number or a correction refers to, resolved from
//     the pending question, explicit keywords, state, then recent history;
//   - undo: replay the per-key value sequence from prior user turns and return
//     the value before the most recent change — honest "unknown" when absent;
//   - service hint: villa/building vs apartment, so the agent stops asking a
//     question the sentence already answered.
// Pure: no I/O, no environment reads, no clocks. History is supplied by the
// caller as [{ text, values, intent }] (oldest → newest), already parsed by the
// frozen parser + NLU, so this module never re-interprets raw Arabic numbers.

const nlu = require('./beno-nlu.js');
const normalize = nlu.normalize;
const tokenize = nlu.tokenize;

const RANGES = {
  area: [20, 5000],
  plotArea: [20, 1000000],
  floors: [1, 40],
  rooms: [1, 8],
  bathrooms: [1, 8],
  unitsPerFloor: [1, 30]
};

const LABELS = {
  area: 'مساحة الدور',
  plotArea: 'مساحة الأرض',
  floors: 'عدد الأدوار',
  rooms: 'عدد الغرف',
  bathrooms: 'عدد الحمامات',
  unitsPerFloor: 'وحدات الدور',
  pack: 'الباقة',
  scope: 'النطاق',
  type: 'نوع المشروع',
  location: 'الموقع',
  basement: 'البدروم',
  elevator: 'الأسانسير',
  kitchen: 'المطبخ',
  ac: 'التكييف',
  service: 'نوع المشروع'
};

// Slots a bare number may safely patch; text slots are patched only through an
// explicit keyword (so "خليها فاخر" never becomes a number).
const NUMERIC_KEYS = ['area', 'floors', 'rooms', 'bathrooms', 'unitsPerFloor', 'plotArea'];
const PATCHABLE_KEYS = [...NUMERIC_KEYS, 'pack', 'scope', 'type', 'location', 'basement', 'elevator', 'kitchen', 'ac'];

// Explicit slot keywords. Any hit wins over history-based focus.
const KEY_WORDS = {
  area: ['مساحه', 'مسطح', 'متر', 'مترمربع'],
  plotArea: ['ارض', 'قطعه', 'فدان', 'قيراط', 'قصبه'],
  floors: ['دور', 'ادوار', 'طابق', 'طوابق'],
  rooms: ['غرف', 'غرفه', 'اوض', 'اوضه', 'غرفه نوم'],
  bathrooms: ['حمام', 'حمامات', 'دوره مياه'],
  unitsPerFloor: ['وحدات', 'وحده', 'شقق بالدور', 'شقق في الدور'],
  pack: ['باقه', 'تشطيب', 'مستوي'],
  scope: ['نطاق', 'هيكل', 'مفتاح'],
  type: ['سكني', 'تجاري', 'اداري', 'محلات', 'مكاتب']
};

function cue(list) { return list.map(normalize); }

const CANCEL_CUES = cue(['بلاش', 'الغيه', 'الغيه', 'الغاء', 'الغي', 'الغيت', 'ارجع', 'ارجعها', 'رجوع', 'تراجع', 'تراجع عن', 'كنسل', 'شيل التعديل', 'الغي التعديل', 'بلاش كده', 'مش كده', 'كده غلط']);
const REUSE_CUES = cue(['نفس اللي فات', 'زي اللي فات', 'زى اللي فات', 'نفس المشروع', 'نفس البيانات', 'نفس الحاجه', 'على نفس', 'علي نفس', 'زي ما قلت', 'زى ما قلت', 'مثل ما قلت', 'كمل عليهم', 'كمل عليها', 'زي الاول', 'زى الاول']);
const CLARIFY_CUES = cue(['مش فاهم', 'مش فاهمه', 'مش واضح', 'وضح', 'وضحلي', 'اشرح', 'اشرحلي', 'فسر', 'بالتفصيل', 'يعني ايه', 'يعني إيه', 'ايه يعني', 'مقصود ايه', 'مش فاهم حاجه']);
const CHANGE_CUES = cue(['خلي', 'خليها', 'خليه', 'خليهم', 'خلى', 'غيرها', 'بدل', 'بدلها', 'عدل', 'عدلها', 'تعديل', 'زود', 'زودها', 'قلل', 'قللها', 'ارفع', 'ارفعها', 'نزل', 'نزلها', 'صحح', 'شيل']);
const CONFIRM_CUES = cue(['تمام', 'ماشي', 'اوك', 'اوكي', 'ok', 'حلو', 'كده تمام', 'سليم', 'ينفع', 'مضبوط', 'موافق']);
const DENY_CUES = cue(['لا', 'غلط', 'مش صح', 'قصدي', 'اقصد', 'بالغلط', 'مش عايز كده']);

const PACKAGES = {
  economic: cue(['اقتصادي', 'الاقتصادي', 'اقتصادى']),
  semi: cue(['نصف تشطيب', 'نص تشطيب', 'سيمي', 'semi']),
  medium: cue(['متوسط', 'المتوسط']),
  luxury: cue(['فاخر', 'الفاخر', 'لوكس', 'فخم'])
};

const PENDING_KEY = {
  area: 'area', floors: 'floors', rooms: 'rooms', bathrooms: 'bathrooms',
  package: 'pack', scope: 'scope'
};

// Word numbers are handled by the frozen parser for explicit slots; this tiny
// map only covers a bare "خليها تلات" style change without a unit word.
const WORD_NUMBERS = {
  واحد: 1, واحده: 1, اثنين: 2, اتنين: 2, تلات: 3, تلاته: 3, ثلاثه: 3,
  اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7,
  تمانيه: 8, تمانيه: 8, ثمانيه: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10
};

// 'والاقتصادي' → 'الاقتصادي': a leading و+ال connector never changes the cue.
function stripCueToken(token) {
  return token.length > 3 && token.startsWith('وال') ? token.slice(1) : token;
}

function containsPhrase(tokens, phrase) {
  const parts = String(phrase || '').split(' ').filter(Boolean).map(stripCueToken);
  if (!parts.length) return false;
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    let ok = true;
    for (let k = 0; k < parts.length; k++) if (stripCueToken(tokens[i + k]) !== parts[k]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

function anyPhrase(tokens, list) {
  return list.some(p => containsPhrase(tokens, p));
}

function inRange(key, value) {
  const range = RANGES[key];
  if (!range) return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= range[0] && n <= range[1];
}

function explicitKey(tokens) {
  for (const [key, words] of Object.entries(KEY_WORDS)) {
    if (words.some(w => tokens.includes(w))) return key;
  }
  return null;
}

function numericTokens(tokens) {
  const out = [];
  for (const t of tokens) {
    if (/^\d+(?:\.\d+)?$/.test(t)) out.push(Number(t));
    else if (WORD_NUMBERS[t] !== undefined) out.push(WORD_NUMBERS[t]);
  }
  return out;
}

// Numeric slots present in the current project state, most recently changed
// first. Recent history wins; state fills gaps.
function recentNumericKeys(state, history) {
  const seen = [];
  const push = k => { if (NUMERIC_KEYS.includes(k) && !seen.includes(k)) seen.push(k); };
  for (let i = (history || []).length - 1; i >= 0; i--) {
    const values = history[i] && history[i].values;
    if (!values || typeof values !== 'object') continue;
    for (const k of Object.keys(values)) push(k);
  }
  return seen;
}

function stateNumericKeys(state) {
  if (!state || typeof state !== 'object') return [];
  return Object.keys(state).filter(k => NUMERIC_KEYS.includes(k));
}

function pickNumericFocus(state, history, value, pendingKey) {
  if (pendingKey && inRange(pendingKey, value)) return pendingKey;
  const fromHistory = recentNumericKeys(state, history);
  const candidates = [...fromHistory, ...stateNumericKeys(state).filter(k => !fromHistory.includes(k))].filter(k => inRange(k, value));
  if (!candidates.length) return null;
  // area vs plotArea is a real ambiguity: never guess between land and built-up.
  if (candidates.includes('area') && candidates.includes('plotArea')) return null;
  const historic = candidates.filter(k => fromHistory.includes(k));
  if (historic.length) return historic[0]; // most recently changed plausible slot
  if (candidates.length === 1) return candidates[0];
  // Plausible for several slots with no recent-change signal: ask, never guess.
  return null;
}

function historyValues(history, key) {
  const out = [];
  for (const entry of (history || [])) {
    const values = entry && entry.values;
    if (!values || values[key] === undefined || values[key] === null) continue;
    out.push(values[key]);
  }
  return out;
}

function lastChangedKey(history) {
  for (let i = (history || []).length - 1; i >= 0; i--) {
    const values = history[i] && history[i].values;
    if (!values || typeof values !== 'object') continue;
    const keys = Object.keys(values).filter(k => PATCHABLE_KEYS.includes(k));
    if (keys.length) return keys[keys.length - 1];
  }
  return null;
}

function detectPackage(tokens) {
  for (const [pack, syns] of Object.entries(PACKAGES)) {
    if (anyPhrase(tokens, syns)) return pack;
  }
  return null;
}

function isQuestion(tokens, text) {
  return /[?？؟]/u.test(text) || tokens.includes('كام') || tokens.includes('ايه') || tokens.includes('الفرق') || tokens.includes('مقارنه') || tokens.includes('ولا');
}

function inferServiceHint(text, state) {
  const built = state && Number(state.floors) >= 2;
  const apartmentWord = /شقه|استوديو/u.test(text);
  const buildingWord = /عماره|مبني|فيلا|بيت|تجاري|اداري|محلات|مكاتب/u.test(text);
  if (!state || !state.service) {
    if (apartmentWord && !buildingWord) return { serviceHint: 'apartment', serviceCorrection: false };
    // Only the sentence may answer the service question; the stored floor count
    // is not a fresh statement, so an unrelated follow-up ("زي ما قلت") stays quiet.
    if (buildingWord) return { serviceHint: 'building', serviceCorrection: false };
    return { serviceHint: null, serviceCorrection: false };
  }
  // Correction: the client already chose apartment but describes a standalone
  // building with more than one floor ("مش شقة، دي فيلا دورين").
  if (state.service === 'apartment' && buildingWord && !apartmentWord && built) {
    return { serviceHint: 'building', serviceCorrection: true };
  }
  return { serviceHint: null, serviceCorrection: false };
}

function resolve(input) {
  const opts = input && typeof input === 'object' ? input : {};
  const message = String(opts.message || '');
  const text = normalize(message);
  const tokens = tokenize(message);
  const pending = opts.pending ? String(opts.pending) : null;
  const state = opts.state && typeof opts.state === 'object' ? opts.state : {};
  const history = Array.isArray(opts.history) ? opts.history : [];
  const values = opts.values && typeof opts.values === 'object' ? opts.values : {};
  const pendingKey = pending ? PENDING_KEY[pending] || null : null;

  const numbers = numericTokens(tokens);
  const keyFromWords = explicitKey(tokens);
  const patchSignal = numbers.length > 0 || keyFromWords !== null || Object.keys(values).length > 0;

  const cancelCue = anyPhrase(tokens, CANCEL_CUES);
  const reuseCue = anyPhrase(tokens, REUSE_CUES);
  const clarifyCue = anyPhrase(tokens, CLARIFY_CUES);
  const changeCue = anyPhrase(tokens, CHANGE_CUES);
  const confirmCue = anyPhrase(tokens, CONFIRM_CUES);
  const denyCue = anyPhrase(tokens, DENY_CUES);
  const packageWord = detectPackage(tokens);
  const comparisonCue = !!packageWord && isQuestion(tokens, message)
    && !changeCue && !tokens.includes('عايز') && !tokens.includes('عاوز') && !tokens.includes('اعمل') && !tokens.includes('اختار');

  let act = 'answer';
  if (cancelCue) act = 'cancel';
  else if (reuseCue) act = 'reuse';
  else if (comparisonCue) act = 'compare';
  else if (clarifyCue && !patchSignal) act = 'clarify';
  else if (changeCue || (denyCue && patchSignal)) act = 'change';
  else if (confirmCue) act = 'confirm';
  else if (denyCue) act = 'deny';

  const result = {
    act,
    focus: null,
    patches: {},
    revert: null,
    clearKeys: [],
    reuse: act === 'reuse',
    skipPending: false,
    compare: act === 'compare' ? { pack: packageWord } : null,
    clarify: null,
    askFocus: false,
    askValue: null,
    numbers,
    ...inferServiceHint(text, state)
  };

  if (act === 'change') {
    let focus = keyFromWords || pendingKey;
    if (!focus && numbers.length === 1) focus = pickNumericFocus(state, history, numbers[0], pendingKey);
    if (focus && numbers.length === 1 && inRange(focus, numbers[0]) && values[focus] === undefined) {
      result.patches[focus] = numbers[0];
    } else if (focus && numbers.length === 1 && NUMERIC_KEYS.includes(focus) && !inRange(focus, numbers[0])) {
      result.askFocus = true;
      result.focus = focus;
    } else if (focus) {
      result.focus = focus;
    } else if (numbers.length === 1 || Object.keys(values).length) {
      result.focus = lastChangedKey(history);
      if (!result.focus) result.askFocus = true;
    } else {
      result.askFocus = true;
    }
    return result;
  }

  if (act === 'cancel') {
    const key = lastChangedKey(history) || pendingKey;
    const sequence = key ? historyValues(history, key) : [];
    if (key && sequence.length >= 2) {
      result.focus = key;
      result.revert = { key, value: sequence[sequence.length - 2] };
    } else if (key && sequence.length === 1) {
      result.focus = key;
      result.askValue = key; // one known change only: the earlier value is unknown
    } else if (pending) {
      result.skipPending = true;
      result.focus = pendingKey;
    }
    return result;
  }

  if (act === 'clarify') {
    result.clarify = { key: pendingKey || keyFromWords || null };
    result.focus = result.clarify.key;
    return result;
  }

  if (act === 'confirm' || act === 'deny') {
    result.focus = pendingKey;
    return result;
  }

  if (act === 'compare') {
    result.focus = 'pack';
    return result;
  }

  // Plain answer: no discourse override. A bare number with a pending question is
  // left to the frozen parser (it already handles that flow); the context layer
  // only reports the focus for tracing.
  result.focus = pendingKey || keyFromWords || null;
  return result;
}

module.exports = { resolve, RANGES, LABELS, PATCHABLE_KEYS, NUMERIC_KEYS, PENDING_KEY };
