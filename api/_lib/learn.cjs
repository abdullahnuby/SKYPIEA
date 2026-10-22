'use strict';
const crypto = require('node:crypto');
const nlu = require('../../engines/beno-nlu.js');
const db = require('./db.cjs');

// Continuous-learning loop for BENO (no LLM): the unmatched-message store is
// clustered by normalized-token similarity; a supervisor (admin) reviews the
// clusters and adopts them as verified lexicon additions. Verified additions
// are merged into beno-nlu at request time with a short TTL cache.
// Pure logic (clusterUnmatched, toLexiconAdditions) is exported for tests.

const CLUSTER_CACHE_TTL = 60_000;

function tokensOf(text) {
  return String(text || '').split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1);
}

function containment(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  return inter / Math.min(aSet.size, bSet.size);
}

// rows: [{ normalized_text, text_hash?, intent?, created_at? }]
function clusterUnmatched(rows, threshold = 0.45) {
  const clean = (Array.isArray(rows) ? rows : [])
    .map(r => ({ text: String(r.normalized_text || '').trim().slice(0, 300), intent: String(r.intent || '').slice(0, 40) }))
    .filter(r => r.text);
  const clusters = [];
  for (const row of clean) {
    const tokens = new Set(tokensOf(row.text));
    let best = null, bestScore = 0;
    for (const cluster of clusters) {
      const score = containment(tokens, cluster.tokens);
      if (score > bestScore) { bestScore = score; best = cluster; }
    }
    if (best && bestScore >= threshold) {
      best.size++;
      best.tokens = new Set([...best.tokens, ...tokens]);
      if (!best.samples.some(s => s.text === row.text) && best.samples.length < 5) best.samples.push(row.text);
    } else {
      clusters.push({ tokens, size: 1, samples: [row.text], intents: new Set([row.intent || 'unknown']) });
    }
  }
  return clusters
    .map(c => ({ size: c.size, samples: c.samples.slice(0, 5), intents: [...c.intents].slice(0, 3) }))
    .sort((a, b) => b.size - a.size);
}

// Verified lexicon rows → nlu additions shape.
function toLexiconAdditions(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array of verified lexicon rows.');
  const additions = {};
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const kind = String(row.kind || '').trim();
    if (!['intents','negations','slotFeatures','packageKeywords','scopeKeywords','modelHints','places','materials'].includes(kind)) continue;
    const key = String(row.key || '').trim();
    const value = String(row.value || '').trim();
    if (!value || value.length > 80) continue;
    if (kind === 'intents' || kind === 'packageKeywords' || kind === 'scopeKeywords') {
      if (!key) continue;
      additions[kind] = additions[kind] || {};
      additions[kind][key] = additions[kind][key] || [];
      additions[kind][key].push(value);
    } else if (kind === 'modelHints') {
      if (!/^(?:APT|BLD)-[A-Z-]{2,12}$/.test(key)) continue;
      additions.modelHints = additions.modelHints || {};
      additions.modelHints[key] = additions.modelHints[key] || [];
      additions.modelHints[key].push(value);
    } else if (kind === 'materials') {
      if (!key) continue;
      additions.materials = additions.materials || [];
      additions.materials.push({ query: key, terms: [value] });
    } else {
      additions[kind] = additions[kind] || [];
      additions[kind].push(value);
    }
  }
  return additions;
}

// --- runtime helpers (Neon Postgres, guarded) ---------------------------------
function backendAvailable() {
  return db.configured();
}

async function fetchUnmatched(limit = 200) {
  if (!backendAvailable()) return { available: false, rows: [] };
  const capped = Math.min(Math.max(1, Number(limit) || 200), 500);
  const rows = await db.query(
    `select normalized_text, intent, created_at from public.unmatched_messages
      order by created_at desc limit $1`,
    [capped]
  );
  return { available: true, rows: Array.isArray(rows) ? rows : [] };
}

async function fetchVerifiedLexicon() {
  if (!backendAvailable()) return { available: false, rows: [] };
  const rows = await db.query(
    `select kind, key, value from public.beno_lexicon
      where verified = true order by created_at desc limit 300`
  );
  return { available: true, rows: Array.isArray(rows) ? rows : [] };
}

async function insertLexiconRows(entries) {
  if (!backendAvailable()) throw Object.assign(new Error('Neon Postgres is not configured.'), { status: 503 });
  const allowedIntents = new Set(nlu.getIntentKeys());
  const rows = (Array.isArray(entries) ? entries : []).map(e => ({
    kind: String(e.kind || ''), key: String(e.key || ''), value: String(e.value || ''),
    verified: e.verified !== false, source: String(e.source || 'admin').slice(0, 40)
  })).filter(r => r.kind && r.value && r.value.length <= 80 && (r.kind !== 'intents' || allowedIntents.has(r.key)));
  if (!rows.length) throw new Error('No valid lexicon rows to insert.');
  await db.query(
    `insert into public.beno_lexicon (kind, key, value, verified, source)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::boolean[], $5::text[])`,
    [
      rows.map(r => r.kind),
      rows.map(r => r.key),
      rows.map(r => r.value),
      rows.map(r => r.verified),
      rows.map(r => r.source)
    ]
  );
  return { inserted: rows.length };
}

// Runtime merge with TTL cache — verified learning feeds the mental lexicon.
let cache = { at: 0, applied: false, count: 0 };
async function applyLearnedLexicon(force = false) {
  if (force) cache = { at: 0, applied: false, count: 0 };
  if (cache.applied && Date.now() - cache.at < CLUSTER_CACHE_TTL) return { applied: true, count: cache.count, cached: true };
  const result = await (async () => {
    try {
      const { rows } = await fetchVerifiedLexicon();
      if (!rows.length) return 0;
      const additions = toLexiconAdditions(rows);
      nlu.mergeAdditions(additions);
      return rows.length;
    } catch (error) {
      if (error.status) throw error;
      return 0;
    }
  })();
  cache = { at: Date.now(), applied: true, count: result };
  return { applied: true, count: result, cached: false };
}

module.exports = { clusterUnmatched, toLexiconAdditions, fetchUnmatched, fetchVerifiedLexicon, insertLexiconRows, applyLearnedLexicon, availableIntents: () => nlu.getIntentKeys(), CLUSTER_CACHE_TTL };
