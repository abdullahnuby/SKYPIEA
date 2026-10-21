'use strict';
const crypto = require('node:crypto');
const { send, readBody } = require('../_lib/http.cjs');
const auth = require('../_lib/admin-auth.cjs');
const learn = require('../_lib/learn.cjs');
const store = require('../_lib/price-store.cjs');
const pricingStore = require('../_lib/pricing-feedback.cjs');
const pricingMemory = require('../_lib/pricing-memory.cjs');
const engine = require('../_lib/engine.cjs');
const { validateBook } = require('../_lib/admin-price.cjs');

// Supervisor endpoint for the continuous learning loops:
//   GET  → unmatched language clusters + verified lexicon + pricing intelligence
//   POST → adopt language clusters, record/verify price evidence, or apply an
//          evidence-backed suggestion to the *draft* book (never auto-publish).
// Same-origin + admin session, like the price-book endpoint.

function today() { return new Date().toISOString().slice(0, 10); }

async function loadAdminPricing() {
  const [state, history, feedback] = await Promise.all([
    store.getAdminState(),
    store.getPriceBookHistory(24),
    pricingStore.listRows({ limit: 500 })
  ]);
  const published = state.published_book || engine.loadBook().doc;
  const signals = pricingMemory.buildSignals(published, history, feedback.rows);
  return {
    state,
    published,
    history,
    feedback,
    signals,
    pricing: {
      available: history.length > 0 || feedback.available,
      feedbackAvailable: feedback.available,
      version: String(published.priceBookVersion || published.version || ''),
      historyVersions: history.length,
      summary: signals.summary,
      review: signals.reviewItems.slice(0, 25),
      recentFeedback: feedback.rows.slice(0, 25)
    }
  };
}

module.exports = async function adminAgent(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = crypto.randomUUID();
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Allow', 'GET, POST, OPTIONS'); res.end(); return; }
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { ok: false, error: 'Method not allowed.', requestId: id }, { Allow: 'GET, POST, OPTIONS' });
  if (req.headers?.origin && !auth.sameOrigin(req, res)) return;
  if (req.method === 'POST' && !auth.sameOrigin(req, res)) return;
  if (!auth.requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      const [unmatched, lexicon, pricing] = await Promise.all([
        learn.fetchUnmatched(200),
        learn.fetchVerifiedLexicon(),
        loadAdminPricing()
      ]);
      const clusters = unmatched.rows.length ? learn.clusterUnmatched(unmatched.rows).slice(0, 20) : [];
      return send(res, 200, {
        ok: true,
        learning: { available: unmatched.available && lexicon.available, unmatchedCount: unmatched.rows.length, clusters, verifiedCount: lexicon.rows.length, availableIntents: learn.availableIntents() },
        lexicon: lexicon.rows.slice(0, 80),
        pricing: pricing.pricing,
        requestId: id
      });
    }

    const body = await readBody(req, 128 * 1024);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { ok: false, error: 'Request must be a JSON object.', requestId: id });

    if (Array.isArray(body.feedback)) {
      const MAX = 60;
      if (!body.feedback.length || body.feedback.length > MAX) return send(res, 400, { ok: false, error: `أرسل بين 1 و${MAX} ملاحظة.`, requestId: id });
      const { state, published } = await loadAdminPricing();
      const rows = body.feedback.map(row => ({
        ...row,
        verified: row && row.verified !== undefined ? row.verified === true : body.verified !== false
      }));
      const result = await pricingStore.recordRows(rows, { book: state.draft_book || published, actor: 'admin' });
      return send(res, 200, { ok: true, message: 'تم تسجيل ملاحظات التسعير. الملاحظات الموثقة فقط تؤثر في درجة الثقة والاقتراحات.', inserted: result.inserted, requestId: id });
    }

    if (body.action === 'verify') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return send(res, 400, { ok: false, error: 'أرسل ids للملاحظات المطلوب اعتمادها.', requestId: id });
      const result = await pricingStore.verifyRows(ids, body.verified !== false, 'admin');
      return send(res, 200, { ok: true, message: body.verified === false ? 'تم إلغاء اعتماد الملاحظات المحددة.' : 'تم اعتماد الملاحظات المحددة؛ ستدخل في تقييم الأدلة القادم.', updated: result.updated, requestId: id });
    }

    if (body.action === 'apply') {
      const priceId = String(body.priceId || '').trim();
      if (!/^[A-Za-z0-9_-]{1,60}$/.test(priceId)) return send(res, 400, { ok: false, error: 'priceId غير صالح.', requestId: id });
      const pricing = await loadAdminPricing();
      const signal = pricing.signals.byId[priceId];
      if (!signal) return send(res, 404, { ok: false, error: 'البند غير موجود في الكتالوج المنشور.', requestId: id });
      const draft = JSON.parse(JSON.stringify(pricing.state.draft_book || pricing.published));
      const row = (draft.prices || []).find(p => String(p.id || '') === priceId);
      if (!row) return send(res, 404, { ok: false, error: 'البند غير موجود في المسودة.', requestId: id });

      let value = body.value === undefined || body.value === null || body.value === '' ? null : Number(body.value);
      let low = body.low === undefined || body.low === null || body.low === '' ? null : Number(body.low);
      let high = body.high === undefined || body.high === null || body.high === '' ? null : Number(body.high);
      if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 1e12)) return send(res, 400, { ok: false, error: 'value لازم يكون رقمًا موجبًا.', requestId: id });
      if (value === null) {
        if (!signal.suggestion) return send(res, 409, { ok: false, error: 'لا توجد أدلة موثقة كافية لاقتراح سعر لهذا البند. سجّل ثلاث ملاحظات موثقة على الأقل بوحدة مطابقة.', requestId: id });
        value = signal.suggestion.value;
      }
      if (low === null) low = signal.suggestion && signal.suggestion.low !== null ? signal.suggestion.low : value;
      if (high === null) high = signal.suggestion && signal.suggestion.high !== null ? signal.suggestion.high : value;
      if (!(low <= value && value <= high)) return send(res, 400, { ok: false, error: 'لازم يكون أقل سعر ≤ المتوسط ≤ أعلى سعر.', requestId: id });
      if (!row.unit) return send(res, 400, { ok: false, error: 'البند ليس له وحدة؛ لا يمكن اقتراح سعر بوحدة غير معروفة.', requestId: id });

      const note = String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      row.low = Number(low); row.avg = Number(value); row.high = Number(high);
      row.status = 'estimate';
      row.date = today();
      row.source = `مراجعة تعلّم التسعير: ${signal.suggestion ? `${signal.suggestion.evidenceCount} ملاحظة موثقة` : 'إدخال إداري'}${note ? ` — ${note}` : ''}`.slice(0, 300);
      validateBook(draft);
      await store.saveDraft(draft, 'admin');
      return send(res, 200, {
        ok: true,
        message: 'تم تحديث المسودة فقط. راجع القيمة ثم انشر الإصدار لتصل للزوار.',
        published: false,
        priceId,
        value: row.avg,
        low: row.low,
        high: row.high,
        status: row.status,
        source: row.source,
        signal: { confidence: signal.confidence, evidence: signal.evidence, suggestion: signal.suggestion },
        requestId: id
      });
    }

    const entries = Array.isArray(body?.entries) ? body.entries : null;
    if (!entries) return send(res, 400, { ok: false, error: 'أرسل entries كقائمة {kind,key,value} أو feedback/action صالحًا.', requestId: id });
    const MAX = 40;
    if (entries.length > MAX) return send(res, 400, { ok: false, error: `الحد الأقصى ${MAX} إضافة في المرة.`, requestId: id });
    const result = await learn.insertLexiconRows(entries);
    await learn.applyLearnedLexicon(true);
    return send(res, 200, { ok: true, message: 'تم اعتماد الإضافات؛ الفهم الرحمن يشتغل بيها مباشرة.', inserted: result.inserted, requestId: id });
  } catch (error) {
    const status = error.status || 503;
    if (status >= 500) process.stderr.write(`[beno-admin-agent] ${id} storage failure\n`);
    return send(res, status, { ok: false, error: status >= 500 ? 'تعذر الوصول لقاعدة بيانات التعلم. راجع إعداد Supabase وترحيل 20261022_beno_agent_learning.sql و20261023_beno_pricing_memory.sql.' : String(error.message || 'طلب غير صالح.').slice(0, 300), requestId: id });
  }
};
