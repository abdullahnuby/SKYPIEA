'use strict';
const { neon } = require('@neondatabase/serverless');

// Neon Postgres access for the serverless (Vercel-style) API.
//
// The API runs as short-lived Vercel functions on Node 20+, so we use the
// Neon serverless driver over HTTPS instead of a TCP pool. Every query is a
// single round trip, there is no connection lifecycle to leak between
// invocations, and the pooled connection string (-pooler) is still the right
// thing to hand to the driver.
//
// DATABASE_URL is provisioned by `neon deploy` from neon.ts (services.postgres)
// and written to .env.local for local development.

const URL_KEYS = ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL'];

let cached = null;

function databaseUrl() {
  for (const key of URL_KEYS) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return null;
}

function configured() {
  return Boolean(databaseUrl());
}

function client() {
  const url = databaseUrl();
  if (!url) {
    throw Object.assign(new Error('Neon Postgres is not configured. Set DATABASE_URL (run `neon deploy`).'), { status: 503 });
  }
  if (!cached || cached.url !== url) cached = { url, sql: neon(url) };
  return cached.sql;
}

// Returns an array of rows. Statements must use $1..$n placeholders.
async function query(text, params = []) {
  const rows = await client().query(text, params);
  return Array.isArray(rows) ? rows : [];
}

async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

// Runs a multi-statement SQL file (schema/bootstrap). The HTTP driver accepts a
// single statement per request, so the file is split on top-level semicolons.
async function runSqlFile(source) {
  let executed = 0;
  for (const statement of splitSql(source)) {
    await query(statement);
    executed++;
  }
  return executed;
}

// Splits SQL on semicolons while respecting single quotes, double quotes and
// dollar-quoted function bodies ($$ ... $$), which this schema uses.
function splitSql(source) {
  const text = String(source || '');
  const out = [];
  let current = '';
  let quote = null;
  let dollarTag = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (dollarTag) {
      current += ch;
      if (ch === '$' && text.startsWith(dollarTag, i)) {
        current += text.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (next === quote) { current += next; i++; continue; }
        quote = null;
      }
      continue;
    }
    if (ch === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      current += text.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === '$') {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(text.slice(i));
      if (match) { dollarTag = match[0]; current += match[0]; i += match[0].length - 1; continue; }
    }
    if (ch === ';') {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

module.exports = { configured, databaseUrl, query, one, runSqlFile, splitSql };
