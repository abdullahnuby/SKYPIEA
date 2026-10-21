'use strict';
const crypto = require('node:crypto');
const { normalizeArabic } = require('../../engines/miyar-engine.js');
function redact(text) {
  let value = String(text || '').slice(0, 2000);
  value = value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[بريد محذوف]');
  value = value.replace(/(?:\+?20|0020)?[\s()-]*01[0125](?:[\s()-]*\d){8}/g, '[رقم محذوف]');
  value = value.replace(/(?:اسمي|انا اسمي|أنا اسمي|اسمى)\s+[\p{L}]+(?:\s+[\p{L}]+){0,2}/giu, '[اسم محذوف]');
  value = value.replace(/(?:عنواني|عنوان البيت|عنوان الشغل)\s*[:：]?\s*[^،؛\n]{3,90}/giu, '[عنوان محذوف]');
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
async function recordUnmatched(message, intent) {
  if (process.env.BENO_LOG_UNMATCHED !== '1') return false;
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return false;
  const text = redact(message);
  if (!text) return false;
  const textHash = crypto.createHash('sha256').update(normalizeArabic(text)).digest('hex');
  const response = await fetch(`${url}/rest/v1/unmatched_messages`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ normalized_text: text, text_hash: textHash, intent: String(intent || 'unknown').slice(0, 60) })
  });
  if (!response.ok) throw new Error(`unmatched-log failed (${response.status})`);
  return true;
}
module.exports = { redact, recordUnmatched };
