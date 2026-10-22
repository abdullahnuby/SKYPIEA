'use strict';
const fs = require('node:fs');
const path = require('node:path');
const engine = require('./engine.cjs');
const db = require('./db.cjs');
const ROOT = path.resolve(__dirname, '../..');
const BOOK_DIR = path.join(ROOT, 'api', '_data');
const LOCAL_FILE = process.env.BENO_ADMIN_STATE_FILE ? path.resolve(process.env.BENO_ADMIN_STATE_FILE) : path.join(ROOT, '.local', 'beno-price-book-state.json');
const LOCAL_DIR = path.dirname(LOCAL_FILE);
function localStorageEnabled() { return process.env.BENO_LOCAL_DEMO === '1' && process.env.NODE_ENV !== 'production'; }
function bookVersionNumber(book) {
  const raw = String((book && (book.priceBookVersion || book.version)) || 'v1');
  const match = raw.match(/v?(\d+)/i);
  return match ? Number(match[1]) : 1;
}
function dbConfig() {
  if (!db.configured() || localStorageEnabled()) return null;
  return { driver: 'neon' };
}
function initialBook() {
  const doc = JSON.parse(JSON.stringify(engine.loadBook().doc));
  doc.settings = { ...(doc.settings || {}) };
  if (process.env.BENO_MARGIN_PCT !== undefined) doc.settings.margin = Number(process.env.BENO_MARGIN_PCT);
  else if (doc.settings.margin == null) doc.settings.margin = 15;
  if (process.env.BENO_MARGIN_MODE !== undefined) doc.settings.marginMode = process.env.BENO_MARGIN_MODE;
  else if (doc.settings.marginMode == null) doc.settings.marginMode = 'comprehensive';
  if (process.env.BENO_MIN_COVERAGE !== undefined) doc.settings.minCoverage = Number(process.env.BENO_MIN_COVERAGE);
  else if (doc.settings.minCoverage == null) doc.settings.minCoverage = 0.70;
  if (doc.settings.staleDays == null) doc.settings.staleDays = 90;
  return doc;
}
function normalizeState(state) {
  if (!state) return null;
  return {
    id: 'current', draft_book: state.draft_book || state.draftBook,
    published_book: state.published_book || state.publishedBook,
    version: Number(state.version || 1), updated_at: state.updated_at || state.updatedAt || null,
    updated_by: state.updated_by || state.updatedBy || 'system',
    published_at: state.published_at || state.publishedAt || null,
    published_by: state.published_by || state.publishedBy || 'system',
    versions: Array.isArray(state.versions) ? state.versions : undefined
  };
}
function readLocalState() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  if (!fs.existsSync(LOCAL_FILE)) {
    const book = initialBook();
    const now = new Date().toISOString();
    const version = bookVersionNumber(book);
    const state = { id: 'current', draft_book: book, published_book: book, version, updated_at: now, updated_by: 'local-init', published_at: now, published_by: 'local-init', versions: [{ version: `v${version}`, published_at: now, published_by: 'local-init', coverage_percent: null, active_items: book.prices.length, priced_items: null }] };
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    return normalizeState(state);
  }
  const state = normalizeState(JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')));
  // Migrate only the untouched local seed: if an admin has saved a draft or
  // published, their work is never overwritten. This keeps a developer machine
  // from serving an old v1 state after a newer price-book file is committed.
  const latest = initialBook();
  const latestVersion = bookVersionNumber(latest);
  const stateVersion = Math.max(Number(state.version || 1), bookVersionNumber(state.published_book));
  if (stateVersion < latestVersion && state.published_by === 'local-init' && state.updated_by === 'local-init') {
    const now = new Date().toISOString();
    state.draft_book = latest; state.published_book = latest; state.version = latestVersion;
    state.updated_at = now; state.updated_by = 'local-init'; state.published_at = now; state.published_by = 'local-init';
    state.versions = [{ version: `v${latestVersion}`, published_at: now, published_by: 'local-init', coverage_percent: null, active_items: latest.prices.length, priced_items: null }, ...(state.versions || [])].slice(0, 30);
    writeLocalState(state);
  }
  return state;
}
function writeLocalState(state) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const tmp = `${LOCAL_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, LOCAL_FILE);
  return normalizeState(state);
}
async function getDbState() {
  const rows = await db.query('select * from public.beno_price_book_state where id = $1', ['current']);
  if (rows[0]) return normalizeState(rows[0]);
  const book = initialBook(), now = new Date().toISOString();
  await db.query(
    `insert into public.beno_price_book_state
       (id, draft_book, published_book, version, updated_at, updated_by, published_at, published_by)
     values ('current', $1::jsonb, $1::jsonb, $2, $3, 'system-initialization', $3, 'system-initialization')
     on conflict (id) do nothing`,
    [JSON.stringify(book), bookVersionNumber(book), now]
  );
  const retry = await db.query('select * from public.beno_price_book_state where id = $1', ['current']);
  if (!retry[0]) throw Object.assign(new Error('Could not initialize BENO price-book state. Apply neon/schema.sql first.'), { status: 503 });
  return normalizeState(retry[0]);
}
async function getAdminState() {
  if (!dbConfig() && !localStorageEnabled()) throw Object.assign(new Error('إعداد تخزين الأسعار غير مكتمل. اضبط DATABASE_URL على Neon وطبّق neon/schema.sql.'), { status: 503 });
  const state = dbConfig() ? await getDbState() : readLocalState();
  if (dbConfig()) {
    const history = await db.query(
      `select version, published_at, published_by, coverage_percent::float8 as coverage_percent, active_items, priced_items
         from public.beno_price_book_versions order by published_at desc limit 12`
    );
    state.versions = Array.isArray(history) ? history : [];
  }
  return state;
}
async function saveDraft(book, actor = 'admin') {
  if (!dbConfig() && !localStorageEnabled()) throw Object.assign(new Error('تخزين الأسعار الدائم غير مهيأ.'), { status: 503 });
  if (!dbConfig()) {
    const state = readLocalState();
    state.draft_book = book; state.updated_at = new Date().toISOString(); state.updated_by = actor;
    return writeLocalState(state);
  }
  await getDbState();
  await db.query(
    `update public.beno_price_book_state
        set draft_book = $1::jsonb, updated_at = now(), updated_by = $2
      where id = 'current'`,
    [JSON.stringify(book), actor]
  );
  return getDbState();
}
async function publishBook(book, stats, actor = 'admin') {
  if (!dbConfig() && !localStorageEnabled()) throw Object.assign(new Error('تخزين الأسعار الدائم غير مهيأ.'), { status: 503 });
  if (!dbConfig()) {
    const state = readLocalState(); const next = Math.max(Number(state.version || 1), bookVersionNumber(state.published_book), bookVersionNumber(book)) + 1; const now = new Date().toISOString();
    const published = JSON.parse(JSON.stringify(book)); published.priceBookVersion = `v${next}`; published.version = `v${next}`; published.publishedAt = now;
    state.draft_book = published; state.published_book = published; state.version = next; state.updated_at = now; state.updated_by = actor; state.published_at = now; state.published_by = actor;
    state.versions = [{ version: `v${next}`, published_at: now, published_by: actor, coverage_percent: stats.coveragePercent, active_items: stats.active, priced_items: stats.priced, price_book: published }, ...(state.versions || [])].slice(0, 30);
    writeLocalState(state); return state;
  }
  await getDbState();
  await db.query('select public.beno_publish_price_book($1::jsonb, $2::numeric, $3::text)', [JSON.stringify(book), Number(stats.coveragePercent) || 0, actor]);
  return getDbState();
}
async function getPublishedBook() {
  if (!dbConfig()) {
    if (localStorageEnabled()) { try { const state = readLocalState(); return state.published_book || null; } catch { return null; } }
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('Persistent price-book storage is not configured.'), { status: 503 });
    return null;
  }
  const rows = await db.query('select published_book, version from public.beno_price_book_state where id = $1', ['current']);
  if (rows[0]?.published_book) return rows[0].published_book;
  return null;
}

// Every published version is a human decision. The learning layer reads these
// snapshots to detect real price movement instead of guessing it. Committed
// price-book files are the seed history; database/local snapshots win on conflict.
function dataBookHistory() {
  try {
    const files = fs.readdirSync(BOOK_DIR)
      .filter(name => /^price-book\.v\d+\.json$/.test(name))
      .sort((a, b) => bookVersionNumber({ version: a }) - bookVersionNumber({ version: b }));
    const out = [];
    for (const name of files) {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(BOOK_DIR, name), 'utf8'));
        if (!doc || !Array.isArray(doc.prices)) continue;
        const version = String(doc.priceBookVersion || doc.version || name.match(/v\d+/)?.[0] || '');
        out.push({ version, publishedAt: doc.publishedAt || doc.exportedAt || null, prices: doc.prices });
      } catch { /* a malformed seed file never blocks the active book */ }
    }
    return out;
  } catch {
    return [];
  }
}

async function getPriceBookHistory(limit = 24) {
  const cap = Math.min(Math.max(2, Number(limit) || 24), 100);
  const byVersion = new Map();
  for (const entry of dataBookHistory()) if (entry.version) byVersion.set(entry.version, entry);
  if (dbConfig()) {
    try {
      const rows = await db.query(
        `select version, price_book, published_at from public.beno_price_book_versions
          order by published_at asc limit $1`,
        [cap]
      );
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const book = row.price_book;
        if (!book || !Array.isArray(book.prices)) continue;
        const version = String(row.version || book.priceBookVersion || book.version || '');
        if (version) byVersion.set(version, { version, publishedAt: row.published_at || book.publishedAt || null, prices: book.prices });
      }
    } catch { /* the committed seed history remains usable */ }
  } else if (localStorageEnabled()) {
    try {
      const state = readLocalState();
      for (const entry of (state.versions || [])) {
        const book = entry.price_book;
        if (!book || !Array.isArray(book.prices)) continue;
        const version = String(entry.version || book.priceBookVersion || book.version || '');
        if (version) byVersion.set(version, { version, publishedAt: entry.published_at || entry.publishedAt || book.publishedAt || null, prices: book.prices });
      }
    } catch { /* ignore local history failures */ }
  }
  return [...byVersion.values()]
    .sort((a, b) => bookVersionNumber(a) - bookVersionNumber(b))
    .slice(-cap);
}
module.exports = { dbConfig, initialBook, getAdminState, saveDraft, publishBook, getPublishedBook, getPriceBookHistory, readLocalState, writeLocalState };
