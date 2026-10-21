'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Durable pricing evidence ledger (server-only).
//
// Two backends, same shape:
//   - local JSON file (development/tests and BENO_LOCAL_DEMO),
//   - Supabase REST (production) once the pricing-memory migration is applied.
//
// Rows are observations, not published prices. Chat/customer mentions default to
// unverified; only verified rows can influence confidence or suggestions.

const ROOT = path.resolve(__dirname, '../..');
const LOCAL_FILE = process.env.BENO_PRICING_FEEDBACK_FILE
  ? path.resolve(process.env.BENO_PRICING_FEEDBACK_FILE)
  : path.join(ROOT, '.local', 'beno-pricing-feedback.json');
const MAX_ROWS = 5000;
const KINDS = new Set(['quote', 'correction', 'confirmation', 'outcome']);
const SOURCE_TYPES = new Set(['admin', 'supplier', 'market', 'customer', 'chat', 'system']);
const OUTCOMES = new Set(['accepted', 'rejected', 'negotiated', 'unknown']);
const ALIASES = {
  priceId: ['priceId', 'price_id'],
  priceName: ['priceName', 'price_name'],
  sourceType: ['sourceType', 'source_type'],
  observedAt: ['observedAt', 'observed_at'],
  estimateId: ['estimateId', 'estimate_id'],
  createdAt: ['createdAt', 'created_at']
};

function dbConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function localEnabled() {
  if (process.env.BENO_PRICING_FEEDBACK_FILE) return true;
  return process.env.BENO_LOCAL_DEMO === '1' && process.env.NODE_ENV !== 'production';
}

function pick(input, key) {
  for (const name of ALIASES[key] || [key]) {
    if (input && input[name] !== undefined) return input[name];
  }
  return undefined;
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw Object.assign(new Error('observedAt must be YYYY-MM-DD.'), { status: 400 });
  const d = new Date(`${raw}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) throw Object.assign(new Error('observedAt is invalid.'), { status: 400 });
  return raw;
}

function normalizeRow(input, opts = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('pricing feedback row must be an object.'), { status: 400 });
  const priceId = cleanText(pick(input, 'priceId'), 60);
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(priceId)) throw Object.assign(new Error('priceId is required and must be a catalog id.'), { status: 400 });
  const book = opts.book;
  if (book && Array.isArray(book.prices) && !book.prices.some(row => String(row.id || '') === priceId)) {
    throw Object.assign(new Error(`Unknown price id: ${priceId}.`), { status: 400 });
  }
  const kind = cleanText(input.kind || 'quote', 20);
  if (!KINDS.has(kind)) throw Object.assign(new Error('kind must be quote, correction, confirmation, or outcome.'), { status: 400 });
  const value = numberOrNull(input.value ?? input.avg);
  if (kind !== 'outcome' && (!(value > 0) || value > 1e12)) throw Object.assign(new Error('value must be a positive number for a price observation.'), { status: 400 });
  if (kind === 'outcome' && value !== null && value <= 0) throw Object.assign(new Error('outcome value must be positive when supplied.'), { status: 400 });
  const low = numberOrNull(input.low);
  const high = numberOrNull(input.high);
  if (low !== null && low <= 0 || high !== null && high <= 0) throw Object.assign(new Error('low/high must be positive when supplied.'), { status: 400 });
  if (low !== null && high !== null && low > high) throw Object.assign(new Error('low must not exceed high.'), { status: 400 });
  const unit = input.unit === null || input.unit === undefined || input.unit === '' ? null : cleanText(input.unit, 40);
  if (unit && !unit.length) throw Object.assign(new Error('unit is invalid.'), { status: 400 });
  const sourceType = cleanText(pick(input, 'sourceType') || (opts.sourceType || 'admin'), 20);
  if (!SOURCE_TYPES.has(sourceType)) throw Object.assign(new Error('sourceType is invalid.'), { status: 400 });
  const source = cleanText(input.source || (sourceType === 'admin' ? 'إدخال إداري' : 'ملاحظة تسعير'), 180);
  if (!source) throw Object.assign(new Error('source is required.'), { status: 400 });
  const observedAt = dateOnly(pick(input, 'observedAt') || new Date());
  const verified = input.verified === undefined ? sourceType === 'admin' || sourceType === 'supplier' : input.verified === true;
  const note = cleanText(input.note || '', 300);
  const estimateId = cleanText(pick(input, 'estimateId') || '', 100);
  const outcome = cleanText(input.outcome || '', 20);
  if (outcome && !OUTCOMES.has(outcome)) throw Object.assign(new Error('outcome is invalid.'), { status: 400 });
  if (kind === 'outcome' && !outcome) throw Object.assign(new Error('outcome is required for an outcome row.'), { status: 400 });
  const createdAt = pick(input, 'createdAt') ? new Date(pick(input, 'createdAt')) : new Date();
  if (!Number.isFinite(createdAt.getTime())) throw Object.assign(new Error('createdAt is invalid.'), { status: 400 });
  return {
    id: cleanText(input.id || crypto.randomUUID(), 60),
    priceId,
    priceName: cleanText(pick(input, 'priceName') || '', 180),
    kind,
    value: value === null ? null : Number(value),
    low: low === null ? null : Number(low),
    high: high === null ? null : Number(high),
    unit,
    observedAt,
    source,
    sourceType,
    verified,
    note,
    estimateId,
    outcome,
    actor: cleanText(opts.actor || input.actor || 'system', 100),
    createdAt: createdAt.toISOString()
  };
}

function readLocal() {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  if (!fs.existsSync(LOCAL_FILE)) return { version: 1, rows: [] };
  try {
    const doc = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    return { version: Number(doc.version || 1), rows: Array.isArray(doc.rows) ? doc.rows : [] };
  } catch {
    return { version: 1, rows: [] };
  }
}

function writeLocal(doc) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  const tmp = `${LOCAL_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, rows: doc.rows.slice(-MAX_ROWS) }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, LOCAL_FILE);
}

function rowToRest(row) {
  return {
    price_id: row.priceId,
    price_name: row.priceName,
    kind: row.kind,
    value: row.value,
    low: row.low,
    high: row.high,
    unit: row.unit,
    observed_at: row.observedAt,
    source: row.source,
    source_type: row.sourceType,
    verified: row.verified,
    note: row.note,
    estimate_id: row.estimateId,
    outcome: row.outcome,
    actor: row.actor
  };
}

function restToRow(row) {
  return {
    id: String(row.id || ''),
    priceId: String(row.price_id || ''),
    priceName: String(row.price_name || ''),
    kind: String(row.kind || ''),
    value: numberOrNull(row.value),
    low: numberOrNull(row.low),
    high: numberOrNull(row.high),
    unit: row.unit ? String(row.unit) : null,
    observedAt: String(row.observed_at || ''),
    source: String(row.source || ''),
    sourceType: String(row.source_type || ''),
    verified: row.verified === true,
    note: String(row.note || ''),
    estimateId: String(row.estimate_id || ''),
    outcome: String(row.outcome || ''),
    actor: String(row.actor || ''),
    createdAt: String(row.created_at || '')
  };
}

async function dbRequest(pathname, options = {}) {
  const cfg = dbConfig();
  if (!cfg) throw Object.assign(new Error('Supabase is not configured for pricing feedback.'), { status: 503 });
  const response = await fetch(`${cfg.url}${pathname}`, {
    ...options,
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 250);
    const error = new Error(`Pricing feedback storage returned ${response.status}: ${detail}`);
    error.status = response.status === 404 || response.status === 400 ? 503 : 502;
    throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function recordRows(rows, opts = {}) {
  const list = (Array.isArray(rows) ? rows : []).map(row => normalizeRow(row, opts));
  if (!list.length) return { inserted: 0, available: true };
  const cfg = dbConfig();
  if (cfg && !localEnabled()) {
    await dbRequest('/rest/v1/beno_pricing_feedback', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(list.map(rowToRest))
    });
    return { inserted: list.length, available: true };
  }
  if (!localEnabled() && !cfg) throw Object.assign(new Error('Pricing feedback storage is not configured.'), { status: 503 });
  const doc = readLocal();
  const seen = new Set(doc.rows.map(row => `${row.priceId}|${row.kind}|${row.value}|${row.unit || ''}|${row.observedAt}|${row.sourceType}`));
  let inserted = 0;
  for (const row of list) {
    const key = `${row.priceId}|${row.kind}|${row.value}|${row.unit || ''}|${row.observedAt}|${row.sourceType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    doc.rows.push(row);
    inserted++;
  }
  writeLocal(doc);
  return { inserted, available: true };
}

async function listRows(opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 200), MAX_ROWS);
  const priceId = cleanText(opts.priceId || '', 60);
  const cfg = dbConfig();
  if (cfg && !localEnabled()) {
    const filter = priceId ? `&price_id=eq.${encodeURIComponent(priceId)}` : '';
    const rows = await dbRequest(`/rest/v1/beno_pricing_feedback?select=*${filter}&order=created_at.desc&limit=${limit}`);
    return { available: true, rows: (Array.isArray(rows) ? rows : []).map(restToRow) };
  }
  if (!localEnabled()) return { available: false, rows: [] };
  let rows = readLocal().rows;
  if (priceId) rows = rows.filter(row => String(row.priceId) === priceId);
  rows = rows.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { available: true, rows: rows.slice(0, limit) };
}

async function verifyRows(ids, verified, actor = 'admin') {
  const list = (Array.isArray(ids) ? ids : []).map(id => cleanText(id, 60)).filter(Boolean);
  if (!list.length) throw Object.assign(new Error('ids are required.'), { status: 400 });
  const cfg = dbConfig();
  if (cfg && !localEnabled()) {
    await dbRequest(`/rest/v1/beno_pricing_feedback?id=in.(${list.map(encodeURIComponent).join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ verified: verified === true, actor: cleanText(actor, 100) })
    });
    return { updated: list.length, available: true };
  }
  if (!localEnabled() && !cfg) throw Object.assign(new Error('Pricing feedback storage is not configured.'), { status: 503 });
  const doc = readLocal();
  let updated = 0;
  for (const row of doc.rows) {
    if (list.includes(String(row.id))) { row.verified = verified === true; row.actor = cleanText(actor, 100); updated++; }
  }
  writeLocal(doc);
  return { updated, available: true };
}

module.exports = {
  LOCAL_FILE,
  MAX_ROWS,
  KINDS,
  SOURCE_TYPES,
  normalizeRow,
  readLocal,
  writeLocal,
  recordRows,
  listRows,
  verifyRows
};
