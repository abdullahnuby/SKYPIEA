'use strict';
const { send, readBody, rateLimit } = require('../_lib/http.cjs');
const auth = require('../_lib/admin-auth.cjs');
function clearCookie(req) { return auth.makeCookie(req, '', 0); }
module.exports = async function adminSession(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Allow', 'GET, POST, OPTIONS'); res.end(); return; }
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET, POST, OPTIONS' });
  if (req.headers?.origin && !auth.sameOrigin(req, res)) return;
  if (req.method === 'GET') return send(res, 200, { ok: true, configured: auth.configured(), authenticated: auth.verifySession(req) });
  if (!auth.sameOrigin(req, res)) return;
  const id = require('node:crypto').randomUUID();
  try {
    const body = await readBody(req, 8192);
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['login', 'logout'].includes(body.action)) return send(res, 400, { ok: false, error: 'طلب غير صالح.', requestId: id });
    if (body.action === 'logout') return send(res, 200, { ok: true, authenticated: false }, { 'Set-Cookie': clearCookie(req) });
    if (!auth.configured()) return send(res, 503, { ok: false, error: 'اضبط BENO_ADMIN_PASSWORD وBENO_ADMIN_SESSION_SECRET في بيئة التشغيل.' });
    const gate = await rateLimit(req, 'admin', 5, 15 * 60 * 1000);
    if (!gate.ok) return send(res, gate.unavailable ? 503 : 429, { ok: false, error: gate.unavailable ? 'تعذر التحقق من حدّ المحاولات. حاول لاحقًا.' : 'محاولات دخول كثيرة. حاول بعد قليل.' }, { 'Retry-After': String(gate.retryAfter) });
    if (typeof body.password !== 'string' || body.password.length > 256 || !auth.passwordMatches(body.password)) return send(res, 401, { ok: false, error: 'كلمة المرور غير صحيحة.' });
    return send(res, 200, { ok: true, authenticated: true }, { 'Set-Cookie': auth.makeCookie(req, auth.createSession()) });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) process.stderr.write(`[beno-admin-session] ${id} internal error\n`);
    return send(res, status, { ok: false, error: status >= 500 ? 'حدث خطأ أثناء الدخول.' : String(error.message || 'طلب غير صالح.') });
  }
};
