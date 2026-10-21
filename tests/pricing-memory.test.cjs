'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'beno-pricing-memory-'));
process.env.BENO_PRICING_FEEDBACK_FILE = path.join(temp, 'feedback.json');

const pm = require('../api/_lib/pricing-memory.cjs');
const store = require('../api/_lib/pricing-feedback.cjs');
const engine = require('../api/_lib/engine.cjs');
const book = engine.loadBook().doc;
const now = Date.parse('2026-10-21T12:00:00Z');

// --- pure signal derivation -------------------------------------------------
const row = { id: 'P1', name: 'حديد تسليح', unit: 'طن', avg: 4000, low: 3950, high: 4050, date: '2026-10-01', status: 'local', active: true };
const versions = [
  { version: 'v1', publishedAt: '2026-01-01', prices: [{ ...row, avg: 3000, low: 2900, high: 3100, date: '2026-01-01', status: 'national' }] },
  { version: 'v2', publishedAt: '2026-07-01', prices: [{ ...row, avg: 3800, low: 3700, high: 3900, date: '2026-07-01', status: 'national' }] }
];
const verifiedFeedback = [
  { priceId: 'P1', kind: 'quote', value: 4100, unit: 'طن', observedAt: '2026-10-10', source: 'مورد أ', sourceType: 'supplier', verified: true },
  { priceId: 'P1', kind: 'quote', value: 4200, unit: 'طن', observedAt: '2026-10-15', source: 'مورد ب', sourceType: 'supplier', verified: true },
  { priceId: 'P1', kind: 'correction', value: 4300, unit: 'طن', observedAt: '2026-10-18', source: 'مراجعة إدارية', sourceType: 'admin', verified: true }
];
const signal = pm.deriveSignal(row, { versions, feedback: verifiedFeedback, now, staleDays: 90 });
assert.equal(signal.current, 4000);
assert.equal(signal.trend.direction, 'up');
assert.equal(signal.trend.percent, 5.3);
assert.ok(signal.evidence.verified >= 5, `versions + verified feedback counted: ${signal.evidence.verified}`);
assert.equal(signal.evidence.unverified, 0);
assert.ok(signal.confidence.score >= 70, `confidence with fresh local evidence: ${signal.confidence.score}`);
assert.ok(signal.suggestion && signal.suggestion.requiresApproval, 'evidence-backed suggestion');
assert.equal(signal.suggestion.unit, 'طن');
assert.ok(signal.suggestion.evidenceCount >= 3);
assert.ok(signal.suggestion.low <= signal.suggestion.value && signal.suggestion.value <= signal.suggestion.high);
assert.equal(signal.suggestion.method, 'weighted-median');

// Unverified mentions never create a suggestion or lift confidence.
const unverified = pm.deriveSignal({ ...row, avg: null, status: 'missing', date: null }, {
  versions: [], feedback: verifiedFeedback.map(x => ({ ...x, verified: false })), now
});
assert.equal(unverified.suggestion, null);
assert.equal(unverified.evidence.verified, 0);
assert.ok(unverified.evidence.unverified >= 3);
assert.ok(unverified.flags.includes('missing'));
assert.ok(unverified.confidence.score < 20);

// Unit mismatch is not evidence for a suggestion.
const mismatch = pm.deriveSignal(row, {
  versions,
  feedback: verifiedFeedback.map(x => ({ ...x, unit: 'م²' })),
  now
});
assert.equal(mismatch.suggestion, null, 'different unit cannot feed a price suggestion');

// An outdated price is flagged and a large evidence deviation is a review item.
const stale = pm.deriveSignal({ ...row, date: '2025-01-01' }, { versions: [], feedback: verifiedFeedback, now, staleDays: 90 });
assert.equal(stale.stale, true);
assert.ok(stale.flags.includes('stale'));
assert.ok(stale.review.needed);

// --- aggregation and lookup signals -----------------------------------------
const signals = pm.buildSignals(book, [
  { version: 'v3', publishedAt: '2026-09-01', prices: book.prices.map(p => ({ ...p, avg: p.avg == null ? null : Number(p.avg) * 0.9 })) }
], [], { now });
assert.equal(signals.summary.rows, book.prices.length);
assert.ok(signals.summary.priced > 0);
assert.ok(signals.summary.missing > 0);
assert.ok(signals.summary.stale > 0);
assert.ok(Array.isArray(signals.reviewItems));
assert.ok(signals.reviewItems.length > 0);
assert.ok(signals.reviewItems[0].reasons.length > 0);

const lookup = pm.annotateLookupResult({ priceId: 'P001', name: 'أسمنت السويس', price: '3,850 جنيه' }, signals);
assert.ok(lookup.intelligence);
assert.equal(typeof lookup.intelligence.confidence.label, 'string');
assert.ok(lookup.intelligence.evidenceCount >= 0);
assert.equal(lookup.intelligence.suggestion, undefined, 'public projection never exposes unpublished suggestions');

// --- chat/correction extraction ---------------------------------------------
assert.equal(pm.detectPriceObservation('سعر أسمنت السويس بقى 4000 جنيه', book).priceId, 'P001');
assert.equal(pm.detectPriceObservation('عرض مورد لأسمنت سيناء 4100 جنيه للطن', book).unit, 'طن');
assert.equal(pm.detectPriceObservation('سعر حديد عز 40290 جنيه', book).priceId, 'P006');
assert.equal(pm.detectPriceObservation('شقة 120 متر', book), null, 'area is not a price');
assert.equal(pm.detectPriceObservation('بكام أسمنت السويس', book), null, 'no numeric observation');
assert.equal(pm.detectPriceObservation('سعر أسمنت السويس 120 متر', book), null, 'unit conflict is rejected');
assert.equal(pm.detectPriceObservation('الحديد 38000', book), null, 'ambiguous material is not attributed');

// --- feedback store roundtrip ------------------------------------------------
(async () => {
  const fixtureBook = { prices: [
    { id: 'P1', name: 'حديد تسليح', unit: 'طن', active: true },
    { id: 'P2', name: 'أسمنت', unit: 'طن', active: true }
  ] };
  const first = await store.recordRows([
    { priceId: 'P1', kind: 'quote', value: 4100, unit: 'طن', source: 'مورد أ', sourceType: 'supplier', observedAt: '2026-10-10' },
    { priceId: 'P1', kind: 'quote', value: 4100, unit: 'طن', source: 'مورد أ', sourceType: 'supplier', observedAt: '2026-10-10' }
  ], { book: fixtureBook });
  assert.equal(first.inserted, 1, 'duplicate observations are deduped');
  const listed = await store.listRows({ limit: 20 });
  assert.equal(listed.available, true);
  assert.equal(listed.rows.length, 1);
  assert.equal(listed.rows[0].verified, true, 'supplier rows are verified by default');
  const verified = await store.verifyRows([listed.rows[0].id], false, 'admin');
  assert.equal(verified.updated, 1);
  const after = await store.listRows({ limit: 20 });
  assert.equal(after.rows[0].verified, false);
  assert.throws(() => store.normalizeRow({ priceId: 'NOPE', kind: 'quote', value: 10 }, { book: fixtureBook }), /Unknown price id/);
  assert.throws(() => store.normalizeRow({ priceId: 'P1', kind: 'quote', value: 0 }, { book: fixtureBook }), /positive number/);
  assert.throws(() => store.normalizeRow({ priceId: 'P1', kind: 'outcome', outcome: 'accepted' }, { book: fixtureBook }), /outcome/);

  // Engine integration: the public estimate is annotated, never re-priced.
  const state = { service: 'building', modelCode: 'BLD-NEW-RES', type: 'residential', pack: 'medium', scope: 'turnkey', area: 180, floors: 3, rooms: 3, bathrooms: 2, unitsPerFloor: 1, basement: false, elevator: false, kitchen: false, ac: false, location: 'الأقصر' };
  const history = [{ version: 'v3', publishedAt: '2026-09-01', prices: book.prices.map(p => ({ ...p, avg: p.avg == null ? null : Number(p.avg) * 0.9 })) }];
  const estimateSignals = pm.buildSignals(book, history, [], { now });
  const smart = engine.handleTool({ tool: 'estimate.run', state, args: {}, sessionId: 'pricing-memory' }, null, { pricingSignals: estimateSignals });
  assert.ok(smart.estimate.pricingIntelligence);
  assert.ok(smart.estimate.pricingIntelligence.linesWithPricing > 0);
  assert.ok(Array.isArray(smart.estimate.pricingIntelligence.notes));
  assert.equal(smart.estimate.pricingIntelligence.sourceNote.includes('لا تغيّر'), true);

  const search = engine.handleTool({ tool: 'price-catalog.search', state: {}, args: { query: 'أسمنت السويس' }, sessionId: 'pricing-memory' }, null, { pricingSignals: estimateSignals });
  assert.equal(search.found, true);
  assert.ok(search.results[0].priceId);
  assert.ok(search.results[0].intelligence);

  console.log(`Pricing-memory tests passed: signals=${signals.summary.rows}, review=${signals.summary.reviewNeeded}, suggestions=${signals.summary.suggested}, feedbackStore=local, engine=annotated-only.`);
  fs.rmSync(temp, { recursive: true, force: true });
})().catch(error => {
  console.error(error);
  fs.rmSync(temp, { recursive: true, force: true });
  process.exitCode = 1;
});
