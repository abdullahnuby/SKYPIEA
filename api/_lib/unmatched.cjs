'use strict';
const crypto = require('node:crypto');
const db = require('./db.cjs');
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
  if (!db.configured()) return false;
  const text = redact(message);
  if (!text) return false;
  const textHash = crypto.createHash('sha256').update(normalizeArabic(text)).digest('hex');
  await db.query(
    `insert into public.unmatched_messages (normalized_text, text_hash, intent)
     values ($1, $2, $3)`,
    [text, textHash, String(intent || 'unknown').slice(0, 60)]
  );
  return true;
}
module.exports = { redact, recordUnmatched };
