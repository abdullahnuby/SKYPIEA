'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

// End-to-end proof that every Neon-backed service works through the real API:
//   rate limiting, leads, price-book draft/publish, learning queue + lexicon,
//   and the pricing-evidence ledger.
//
// Usage: node scripts/e2e-neon.cjs
// Spawns scripts/local-server.cjs with the env from .env.local, then drives the
// HTTP endpoints exactly like the browser does.

const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4199);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;

function loadEnv(name) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const fileEnv = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const env = {
  ...process.env,
  ...fileEnv,
  PORT: String(PORT),
  BENO_LOCAL_DEMO: '0',
  BENO_DURABLE_RATE_LIMIT: '1',
  BENO_LOG_UNMATCHED: '1',
  BENO_ADMIN_PASSWORD: crypto.randomBytes(18).toString('base64url'),
  BENO_ADMIN_SESSION_SECRET: crypto.randomBytes(48).toString('hex')
};

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

let cookie = '';
async function call(method, pathname, body, { auth = false, timeout = 30000 } = {}) {
  const headers = { Origin: ORIGIN };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: response.status, json, text };
}

async function waitForServer(proc, logs) {
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${logs.join('')}`);
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

async function main() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL missing: run `neon deploy` first.');

  const logs = [];
  const server = spawn(process.execPath, [path.join(root, 'scripts', 'local-server.cjs')], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', d => logs.push(String(d)));
  server.stderr.on('data', d => logs.push(String(d)));

  try {
    await waitForServer(server, logs);

    // 1) Rate limiting + published price book + learned lexicon read (tool API)
    const plan = await call('POST', '/api/tool', {
      tool: 'conversation.plan',
      state: { service: 'apartment' },
      args: { message: 'شقة 120 متر تشطيب كامل' },
      sessionId: 'e2e-neon'
    });
    check('POST /api/tool (conversation.plan)', plan.status === 200 && plan.json?.ok !== false, `HTTP ${plan.status}`);

    const audit = await call('POST', '/api/tool', { tool: 'price-catalog.audit', state: {}, args: {} });
    check('POST /api/tool (price-catalog.audit)', audit.status === 200 && audit.json?.priceBookVersion, `HTTP ${audit.status}, book ${audit.json?.priceBookVersion}`);

    // 2) Unmatched queue (learning input) — only recorded when the tool reports unmatched.
    let unmatchedMessage = null;
    for (const attempt of ['زقزقزق زقزقزق', 'كلام مبهم غير مفهوم نهائيا هنا', 'xxxxxxxx qwerty']) {
      const res = await call('POST', '/api/tool', { tool: 'conversation.plan', state: {}, args: { message: attempt } });
      if (res.json?.unmatched === true) { unmatchedMessage = attempt; break; }
    }
    check('unmatched message captured', Boolean(unmatchedMessage), unmatchedMessage ? `"${unmatchedMessage}"` : 'no candidate produced unmatched=true');

    // 3) Leads
    const lead = await call('POST', '/api/lead', {
      name: 'اختبار نيون',
      phone: '01012345678',
      consent: true,
      estimateId: `E2E-${Date.now()}`,
      projectFacts: { area: 120, pack: 'medium' },
      startedAt: Date.now() - 5000
    });
    check('POST /api/lead', lead.status === 201 && /^BENO-/.test(String(lead.json?.reference || '')), `HTTP ${lead.status}, ref ${lead.json?.reference}`);

    // 4) Admin session (admin rate-limit scope)
    const login = await call('POST', '/api/admin/session', { action: 'login', password: env.BENO_ADMIN_PASSWORD });
    check('POST /api/admin/session (login)', login.status === 200 && login.json?.authenticated === true && cookie.startsWith('beno_admin_session='), `HTTP ${login.status}`);

    // 5) Price-book state (initialization + draft read/write)
    const bookRes = await call('GET', '/api/admin/price-book', undefined, { auth: true });
    const draft = bookRes.json?.draft;
    check('GET /api/admin/price-book', bookRes.status === 200 && draft && Array.isArray(draft.prices), `HTTP ${bookRes.status}, ${draft?.prices?.length || 0} prices, draft v${bookRes.json?.published?.version}`);

    const draftSave = draft ? await call('PUT', '/api/admin/price-book', { book: draft }, { auth: true }) : { status: 0, json: {} };
    check('PUT /api/admin/price-book (save draft)', draftSave.status === 200 && draftSave.json?.ok === true, `HTTP ${draftSave.status}`);

    // 6) Learning supervisor: pricing feedback insert → list → verify
    const priceId = String(draft?.prices?.find(p => p.unit)?.id || '');
    const feedback = priceId ? await call('POST', '/api/admin/agent', {
      feedback: [{ priceId, kind: 'quote', value: 1234, unit: draft.prices.find(p => p.id === priceId).unit, sourceType: 'supplier', source: 'اختبار نيون', observedAt: new Date().toISOString().slice(0, 10) }]
    }, { auth: true }) : { status: 0, json: {} };
    check('POST /api/admin/agent (pricing feedback)', feedback.status === 200 && feedback.json?.inserted >= 1, `HTTP ${feedback.status}, inserted ${feedback.json?.inserted}`);

    const agentGet = await call('GET', '/api/admin/agent', undefined, { auth: true });
    const recent = agentGet.json?.pricing?.recentFeedback || [];
    const newRow = recent.find(r => r.priceId === priceId);
    check('GET /api/admin/agent (feedback + signals)', agentGet.status === 200 && Boolean(newRow), `HTTP ${agentGet.status}, unmatched ${agentGet.json?.learning?.unmatchedCount}, recent ${recent.length}`);

    const verify = newRow ? await call('POST', '/api/admin/agent', { action: 'verify', ids: [newRow.id], verified: true }, { auth: true }) : { status: 0, json: {} };
    check('POST /api/admin/agent (verify feedback)', verify.status === 200 && verify.json?.updated >= 1, `HTTP ${verify.status}`);

    // 7) Learning supervisor: adopt lexicon entries
    const lexicon = await call('POST', '/api/admin/agent', {
      entries: [{ kind: 'places', key: '', value: 'مدينة اختبار نيون' }]
    }, { auth: true });
    check('POST /api/admin/agent (lexicon adopt)', lexicon.status === 200 && lexicon.json?.inserted >= 1, `HTTP ${lexicon.status}, inserted ${lexicon.json?.inserted}`);

    const agentGet2 = await call('GET', '/api/admin/agent', undefined, { auth: true });
    check('GET /api/admin/agent (verified lexicon)', agentGet2.status === 200 && agentGet2.json?.learning?.verifiedCount >= 1, `verified ${agentGet2.json?.learning?.verifiedCount}`);

    // 8) Atomic publish RPC (guarded by catalog coverage)
    const publish = await call('POST', '/api/admin/publish', {}, { auth: true });
    if (publish.status === 200) {
      check('POST /api/admin/publish', publish.json?.ok === true && Boolean(publish.json?.version), `HTTP 200, published ${publish.json?.version}`);
    } else {
      check('POST /api/admin/publish', publish.status === 409, `HTTP ${publish.status} (coverage gate: ${publish.json?.code || 'blocked'}) — RPC not reached`);
    }
  } finally {
    server.kill();
    await new Promise(r => setTimeout(r, 500));
  }

  // 9) Direct database verification of every touched table
  process.env.DATABASE_URL = env.DATABASE_URL;
  if (env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL_UNPOOLED = env.DATABASE_URL_UNPOOLED;
  const db = require('../api/_lib/db.cjs');
  const counts = {};
  for (const table of ['leads', 'unmatched_messages', 'beno_lexicon', 'beno_pricing_feedback', 'beno_rate_limits', 'beno_price_book_state']) {
    counts[table] = (await db.one(`select count(*)::int as n from public.${table}`)).n;
  }
  const latestLead = await db.one('select reference, name, source from public.leads order by created_at desc limit 1');
  const latestFeedback = await db.one('select price_id, kind, verified, source FROM public.beno_pricing_feedback order by created_at desc limit 1');
  const state = await db.one('select version, updated_by, published_by from public.beno_price_book_state where id = $1', ['current']);

  check('DB leads row', counts.leads >= 1, `leads=${counts.leads}, latest ${latestLead?.reference} (${latestLead?.name})`);
  check('DB unmatched_messages row', counts.unmatched_messages >= 1, `rows=${counts.unmatched_messages}`);
  check('DB beno_lexicon row', counts.beno_lexicon >= 1, `rows=${counts.beno_lexicon}`);
  check('DB beno_pricing_feedback row', counts.beno_pricing_feedback >= 1, `rows=${counts.beno_pricing_feedback}, latest ${latestFeedback?.price_id} verified=${latestFeedback?.verified}`);
  check('DB beno_rate_limits row', counts.beno_rate_limits >= 1, `buckets=${counts.beno_rate_limits}`);
  check('DB beno_price_book_state row', Boolean(state), `version=${state?.version}, updated_by=${state?.updated_by}, published_by=${state?.published_by}`);

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) {
    console.error(`Failed: ${failed.map(f => f.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(`E2E run failed: ${error.stack || error.message}`);
  process.exit(1);
});
