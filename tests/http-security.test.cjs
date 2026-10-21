'use strict';
const assert = require('node:assert/strict');
const http = require('../api/_lib/http.cjs');

const keys = ['VERCEL','NODE_ENV','BENO_LOCAL_DEMO','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','BENO_DURABLE_RATE_LIMIT'];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
(async () => {
  try {
    for (const k of keys) delete process.env[k];
    process.env.VERCEL = '1';
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const noBackend = await http.rateLimit(req, 'tool', 40, 60000);
    assert.deepEqual({ok:noBackend.ok,unavailable:noBackend.unavailable},{ok:false,unavailable:true},'production must fail closed without durable rate limit configuration');
    process.env.SUPABASE_URL = 'https://db.example.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'; process.env.BENO_DURABLE_RATE_LIMIT = '0';
    const disabled = await http.rateLimit(req, 'tool', 40, 60000);
    assert.equal(disabled.unavailable,true,'production cannot opt out of durable rate limiting');
    delete process.env.VERCEL; delete process.env.NODE_ENV; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.BENO_DURABLE_RATE_LIMIT;
    const local = await http.rateLimit(req, 'tool', 40, 60000);
    assert.equal(local.localOnly,true,'local development can use process-local throttling');
    console.log('HTTP security tests passed: production fails closed without a durable limiter; local development retains an in-process fallback.');
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
