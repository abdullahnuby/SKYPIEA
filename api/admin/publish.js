'use strict';
const crypto = require('node:crypto');
const { send, readBody } = require('../_lib/http.cjs');
const auth = require('../_lib/admin-auth.cjs');
const store = require('../_lib/price-store.cjs');
const { validateBook, coverage } = require('../_lib/admin-price.cjs');
module.exports = async function adminPublish(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Allow', 'POST, OPTIONS'); res.end(); return; }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'POST, OPTIONS' });
  if (!auth.sameOrigin(req, res)) return;
  if (!auth.requireAdmin(req, res)) return;
  const id = crypto.randomUUID();
  try {
    const body = await readBody(req, 8192);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return send(res, 400, { ok: false, error: 'لا يقبل طلب النشر أي حقول.' });
    const state = await store.getAdminState();
    const book = validateBook(state.draft_book);
    const stats = coverage(book);
    const minimum = Number(book.settings.minCoverage ?? process.env.BENO_MIN_COVERAGE ?? 0.70);
    if (stats.coveragePercent / 100 < minimum) return send(res, 409, { ok: false, code: 'COVERAGE_TOO_LOW', error: `لا يمكن نشر الإصدار: تغطية الأسعار ${stats.coveragePercent}% والحد المطلوب ${Math.round(minimum * 100)}%. أكمل الأسعار أو عدّل الحد من الإعدادات بعد مراجعة واعية.`, stats, minimumCoveragePercent: Math.round(minimum * 100) });
    const updated = await store.publishBook(book, stats, 'admin');
    const pub = updated.published_book || book;
    return send(res, 200, { ok: true, message: 'تم نشر إصدار الأسعار الجديد. الحسابات الجديدة ستستخدمه الآن.', version: String(pub.priceBookVersion || pub.version), publishedAt: updated.published_at, stats });
  } catch (error) {
    const status = error.status || 503;
    if (status >= 500) process.stderr.write(`[beno-admin-publish] ${id} publish failure\n`);
    return send(res, status, { ok: false, error: status >= 500 ? 'فشل نشر الإصدار. تحقق من قاعدة البيانات ودالة النشر.' : String(error.message || 'تعذر النشر.'), requestId: id });
  }
};
