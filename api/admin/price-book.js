'use strict';
const crypto = require('node:crypto');
const { send, readBody } = require('../_lib/http.cjs');
const auth = require('../_lib/admin-auth.cjs');
const store = require('../_lib/price-store.cjs');
const { validateBook, coverage } = require('../_lib/admin-price.cjs');
const rateRegistry = require('../../engines/miyar-rates.js');
const boqMethodology = require('../../engines/miyar-boq-methodology.js');
module.exports = async function adminPriceBook(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Allow', 'GET, PUT, OPTIONS'); res.end(); return; }
  if (!['GET', 'PUT'].includes(req.method)) return send(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET, PUT, OPTIONS' });
  if (req.headers?.origin && !auth.sameOrigin(req, res)) return;
  if (req.method === 'PUT' && !auth.sameOrigin(req, res)) return;
  if (!auth.requireAdmin(req, res)) return;
  const id = crypto.randomUUID();
  try {
    if (req.method === 'GET') {
      const state = await store.getAdminState();
      const book = validateBook(state.draft_book);
      const published = state.published_book || {};
      return send(res, 200, { ok: true, draft: book, published: { version: String(published.priceBookVersion || published.version || `v${state.version || 1}`), publishedAt: state.published_at, publishedBy: state.published_by, stats: coverage(published) }, draftStats: coverage(book), updatedAt: state.updated_at, updatedBy: state.updated_by, versions: (state.versions || []).slice(0, 12), rateDefinitions: Object.entries(rateRegistry.defaults).map(([key, value]) => ({ key, ...value })), wasteDefinitions: boqMethodology.WASTE_DEFINITIONS });
    }
    const body = await readBody(req, 2 * 1024 * 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['book'].includes(k)) || !body.book) return send(res, 400, { ok: false, error: 'أرسل book فقط لحفظ المسودة.' });
    const book = validateBook(body.book);
    const state = await store.saveDraft(book, 'admin');
    return send(res, 200, { ok: true, message: 'تم حفظ المسودة. لم تتغير أسعار الزوار بعد.', draft: state.draft_book, draftStats: coverage(state.draft_book), updatedAt: state.updated_at });
  } catch (error) {
    const status = error.status || 503;
    if (status >= 500) process.stderr.write(`[beno-admin-price-book] ${id} storage failure\n`);
    return send(res, status, { ok: false, error: status >= 500 ? 'تعذر الوصول لتخزين الأسعار. تأكد من إعداد Neon (DATABASE_URL) وتشغيل neon/schema.sql.' : String(error.message || 'ملف الأسعار غير صالح.').slice(0, 500), requestId: id });
  }
};
