'use strict';
const crypto = require('node:crypto');
const { send } = require('./http.cjs');
const COOKIE = 'beno_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
function configured() {
  return String(process.env.BENO_ADMIN_PASSWORD || '').length >= 12 && String(process.env.BENO_ADMIN_SESSION_SECRET || '').length >= 32;
}
function parseCookies(req) {
  const source = String(req.headers?.cookie || '');
  const out = {};
  for (const part of source.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function sign(payload) {
  return crypto.createHmac('sha256', process.env.BENO_ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}
function makeCookie(req, token, maxAge = SESSION_SECONDS) {
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' || !!req.socket?.encrypted;
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomBytes(12).toString('hex') })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function verifySession(req) {
  if (!configured()) return false;
  const token = parseCookies(req)[COOKIE];
  if (!token || token.length > 2048) return false;
  const split = token.lastIndexOf('.');
  if (split < 1) return false;
  const payload = token.slice(0, split), signature = token.slice(split + 1);
  const expected = sign(payload);
  const actualBuf = Buffer.from(signature), expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) return false;
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return Number.isFinite(data.exp) && data.exp > Math.floor(Date.now() / 1000); }
  catch { return false; }
}
function sameOrigin(req, res, allowMissing = false) {
  const origin = String(req.headers?.origin || '');
  if (!origin && allowMissing) return true;
  const host = String(req.headers?.host || '').toLowerCase();
  let valid = false;
  try { const u = new URL(origin); valid = !!host && u.host.toLowerCase() === host && ['http:', 'https:'].includes(u.protocol); } catch {}
  if (!valid) send(res, 403, { ok: false, error: 'Origin is not allowed.' });
  return valid;
}
function passwordMatches(input) {
  const supplied = crypto.createHash('sha256').update(String(input || '')).digest();
  const expected = crypto.createHash('sha256').update(String(process.env.BENO_ADMIN_PASSWORD || '')).digest();
  return crypto.timingSafeEqual(supplied, expected) && configured();
}
function requireAdmin(req, res) {
  if (!configured()) { send(res, 503, { ok: false, error: 'إعداد دخول لوحة الإدارة غير مكتمل. أضف BENO_ADMIN_PASSWORD وBENO_ADMIN_SESSION_SECRET.' }); return false; }
  if (!verifySession(req)) { send(res, 401, { ok: false, error: 'انتهت الجلسة. سجّل الدخول مرة أخرى.' }); return false; }
  return true;
}
module.exports = { COOKIE, SESSION_SECONDS, configured, makeCookie, createSession, verifySession, sameOrigin, passwordMatches, requireAdmin };
