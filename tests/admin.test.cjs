'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'beno-admin-test-'));
const port = 43187 + Math.floor(Math.random() * 500);
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(root, 'scripts', 'local-server.cjs')], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), BENO_LOCAL_DEMO: '1', BENO_ADMIN_PASSWORD: 'admin-test-password-2026', BENO_ADMIN_SESSION_SECRET: 'a'.repeat(64), BENO_ADMIN_STATE_FILE: path.join(temp, 'price-state.json') }
});
let logs = '';
child.stdout.on('data', x => { logs += x.toString(); });
child.stderr.on('data', x => { logs += x.toString(); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchReady() {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`${origin}/admin`); if (r.ok) return r; } catch {} await wait(100); }
  throw new Error(`local test server did not start: ${logs}`);
}
async function json(url, options = {}) {
  const response = await fetch(`${origin}${url}`, { ...options, headers: { Origin: origin, ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) } });
  const body = await response.json();
  return { response, body };
}
(async () => {
  try {
    const page = await fetchReady(); assert.equal(page.status, 200); assert.match(await page.text(), /إدارة Beno/);
    const session0 = await json('/api/admin/session'); assert.equal(session0.body.configured, true); assert.equal(session0.body.authenticated, false);
    const bad = await json('/api/admin/session', { method:'POST', body:JSON.stringify({ action:'login', password:'wrong-password' }) }); assert.equal(bad.response.status, 401, JSON.stringify(bad.body));
    const login = await json('/api/admin/session', { method:'POST', body:JSON.stringify({ action:'login', password:'admin-test-password-2026' }) });
    assert.equal(login.response.status, 200); assert.equal(login.body.authenticated, true);
    const rawCookie = login.response.headers.get('set-cookie'); assert.ok(rawCookie && rawCookie.includes('beno_admin_session=')); const cookie = rawCookie.split(';')[0];
    const dash = await json('/api/admin/price-book', { headers:{ cookie } }); assert.equal(dash.response.status, 200); assert.ok(dash.body.draft.prices.length >= 146, 'the published catalog must keep at least the original 146 rows');
    const currentVersion = String(dash.body.published.version || 'v1');
    const nextVersion = `v${Number(currentVersion.replace(/\D/g, '')) + 1}`;
    const draft = JSON.parse(JSON.stringify(dash.body.draft)); draft.settings.minCoverage = 0.3; draft.settings.boqWastePercentages = { tile:8, masonryBrick:6 };
    draft.settings.resourceRates = {
      steelKgPerM2: { low:60, value:82, high:100 },
      tileWaste: { low:5, value:8, high:10 },
      floorTileM2PerM2Apartment: { low:0.70, value:0.80, high:0.82 },
      plasterSurfaceM2PerM2Built: { low:2, value:2.3, high:2.5 }
    };
    const save = await json('/api/admin/price-book', { method:'PUT', headers:{cookie}, body:JSON.stringify({book:draft}) }); assert.equal(save.response.status, 200);
    assert.ok(save.body.draft && Array.isArray(save.body.draft.prices), 'saving must return the normalized draft so the console can adopt server state');
    const normalized = await json('/api/admin/price-book', { headers:{cookie} }); assert.equal(normalized.response.status, 200);
    assert.equal(normalized.body.draft.settings.steelFactor, 0.082, 'frozen legacy steel factor should follow shared-rate edits');
    assert.equal(normalized.body.draft.settings.tileWastePercent, 8, 'frozen tile-waste setting should follow shared-rate edits');
    assert.equal(normalized.body.draft.settings.modelRates.floorTileM2PerM2Apartment.value, 0.8, 'project model rate should follow shared-rate edits');
    assert.equal(normalized.body.draft.settings.modelRates.plasterM2PerM2Built.value, 2.3, 'legacy model-rate alias should follow shared-rate edits');
    assert.equal(normalized.body.draft.settings.boqWastePercentages.tile, 8, 'engineer waste rate is saved independently from resource-consumption rates');
    assert.ok(Array.isArray(normalized.body.wasteDefinitions) && normalized.body.wasteDefinitions.some(x=>x.key==='tile'), 'admin supplies the complete editable waste-definition list');
    const invalidWaste = JSON.parse(JSON.stringify(normalized.body.draft)); invalidWaste.settings.boqWastePercentages.tile = 101;
    const invalidSave = await json('/api/admin/price-book', { method:'PUT', headers:{cookie}, body:JSON.stringify({book:invalidWaste}) });
    assert.equal(invalidSave.response.status, 400, 'invalid waste percentages must be rejected by the server');
    const outOfRange = JSON.parse(JSON.stringify(normalized.body.draft));
    outOfRange.settings.resourceRates.steelKgPerM2 = { low:60, value:150, high:100 };
    const outOfRangeSave = await json('/api/admin/price-book', { method:'PUT', headers:{cookie}, body:JSON.stringify({book:outOfRange}) });
    assert.equal(outOfRangeSave.response.status, 400, 'a central rate above its own high bound must still be rejected by the API');
    assert.match(String(outOfRangeSave.body.error), /steelKgPerM2/);
    const badRange = JSON.parse(JSON.stringify(normalized.body.draft));
    badRange.prices[0].avg = Number(badRange.prices[0].high) + 100;
    const badRangeSave = await json('/api/admin/price-book', { method:'PUT', headers:{cookie}, body:JSON.stringify({book:badRange}) });
    assert.equal(badRangeSave.response.status, 400, 'an average above the high price must still be rejected by the API');
    const publish = await json('/api/admin/publish', { method:'POST', headers:{cookie}, body:'{}' }); assert.equal(publish.response.status, 200, JSON.stringify(publish.body)); assert.equal(publish.body.version, nextVersion);
    const estimate = await json('/api/tool', { method:'POST', body:JSON.stringify({tool:'price-catalog.audit',state:{},args:{},sessionId:'admin-test'}) });
    assert.equal(estimate.response.status, 200); assert.equal(estimate.body.priceBookVersion, nextVersion);
    const noCookie = await json('/api/admin/price-book'); assert.equal(noCookie.response.status, 401);
    const logout = await json('/api/admin/session', { method:'POST', headers:{cookie}, body:JSON.stringify({action:'logout'}) }); assert.equal(logout.response.status, 200); assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/);
    console.log(`BENO admin integration passed: login/session, unauthorized blocking, price-book read/save, shared-rate and waste synchronization/validation, save-returns-draft contract, range rejection, coverage-gated publish, and active-engine adoption of ${nextVersion}.`);
  } catch (error) { console.error(error); console.error(logs); process.exitCode = 1; }
  finally { child.kill('SIGTERM'); await wait(250); fs.rmSync(temp, { recursive:true, force:true }); }
})();
