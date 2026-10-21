'use strict';
const assert = require('node:assert/strict');
const context = require('../engines/beno-context.js');
const conversation = require('../api/_lib/conversation.cjs');
const agent = require('../api/_lib/agent.cjs');
const { handleTool } = require('../api/_lib/engine.cjs');

function historyOf(texts) {
  return texts.map(text => {
    const parsed = conversation.infer(text, null, {});
    return { text, values: parsed.values, intent: parsed.intent };
  });
}

function resolve(message, opts = {}) {
  return context.resolve({
    message,
    pending: opts.pending || null,
    state: opts.state || {},
    history: opts.history || historyOf(opts.turns || []),
    values: opts.values || {}
  });
}

// --- determinism: identical input → identical output -----------------------
assert.deepEqual(
  resolve('خليها 250', { state: { area: 300, floors: 3 }, turns: ['فيلا 300 متر و3 ادوار'] }),
  resolve('خليها 250', { state: { area: 300, floors: 3 }, turns: ['فيلا 300 متر و3 ادوار'] }),
  'context resolution must be pure/deterministic'
);

// --- change with a bare number: focus from plausibility + recency ----------
const areaChange = resolve('خليها 250', { state: { area: 300, floors: 3 }, turns: ['فيلا 300 متر و3 ادوار'] });
assert.equal(areaChange.act, 'change');
assert.equal(areaChange.patches.area, 250, '250 is only plausible as an area, not a floor count');

const floorChange = resolve('خليها 4', { state: { area: 300, floors: 3 }, turns: ['فيلا 300 متر و3 ادوار'] });
assert.equal(floorChange.act, 'change');
assert.equal(floorChange.patches.floors, 4, '4 is only plausible as a floor count');

// A genuinely ambiguous number (valid as area AND floors, no history signal) must ask, not guess.
const ambiguous = resolve('خليها 30', { state: { area: 300, floors: 3 } });
assert.equal(ambiguous.askFocus, true);
assert.deepEqual(ambiguous.patches, {});

// --- undo: replay per-key history and restore the previous value -----------
const undo = resolve('بلاش', { state: { area: 300, floors: 4 }, turns: ['فيلا 300 متر و3 ادوار', 'خليها 4 ادوار'] });
assert.equal(undo.act, 'cancel');
assert.deepEqual(undo.revert, { key: 'floors', value: 3 });

// One change only → the earlier value is unknown; never fabricate it.
const undoUnknown = resolve('ارجع', { state: { floors: 4 }, turns: ['خليها 4 ادوار'] });
assert.equal(undoUnknown.act, 'cancel');
assert.equal(undoUnknown.askValue, 'floors');
assert.equal(undoUnknown.revert, null);

// Cancelling an open question (no change yet) skips that question.
const skip = resolve('بلاش', { state: { area: 200 }, pending: 'floors', turns: [] });
assert.equal(skip.act, 'cancel');
assert.equal(skip.skipPending, true);

// --- reuse / comparison / clarification -----------------------------------
assert.equal(resolve('زي ما قلت', { state: { area: 200 } }).act, 'reuse');
assert.equal(resolve('نفس المشروع بس', { state: { area: 200 } }).act, 'reuse');

const compare = resolve('طيب والاقتصادي؟', { state: { area: 120, floors: 2 } });
assert.equal(compare.act, 'compare');
assert.deepEqual(compare.compare, { pack: 'economic' });

const clarify = resolve('مش فاهم', { pending: 'floors', state: { area: 120 } });
assert.equal(clarify.act, 'clarify');
assert.equal(clarify.clarify.key, 'floors');

// --- confirm / deny --------------------------------------------------------
assert.equal(resolve('تمام', { pending: 'area' }).act, 'confirm');
assert.equal(resolve('لا غلط', { state: { area: 200 } }).act, 'deny');

// --- service hint: villa/building vs apartment ----------------------------
assert.equal(resolve('فيلا دورين', { state: {} }).serviceHint, 'building');
assert.equal(resolve('عمارة سكنية جديدة', { state: {} }).serviceHint, 'building');
assert.equal(resolve('شقة تشطيب 120 متر', { state: {} }).serviceHint, 'apartment');

// --- agent integration: act-aware replies and value flow -------------------
const areaParsed = conversation.infer('خليها 250', 'area', {});
const areaPlan = agent.planConversation({
  parsed: { ...areaParsed, values: areaParsed.values },
  state: { area: 300, floors: 3, service: 'building' },
  pending: null,
  history: historyOf(['فيلا 300 متر و3 ادوار']),
  message: 'خليها 250'
});
assert.equal(areaPlan.act, 'change');
assert.equal(areaPlan.values.area, 250);
assert.match(areaPlan.reply, /عدّلت/);
assert.doesNotMatch(areaPlan.reply, /^سجلت:/);

const undoPlan = agent.planConversation({
  parsed: { values: {}, found: [], intent: 'unknown' },
  state: { area: 300, floors: 4, service: 'building' },
  pending: null,
  history: historyOf(['فيلا 300 متر و3 ادوار', 'خليها 4 ادوار']),
  message: 'بلاش'
});
assert.equal(undoPlan.act, 'cancel');
assert.equal(undoPlan.values.floors, 3);
assert.match(undoPlan.reply, /رجّعت/);
assert.equal(undoPlan.action.type, 'revert');

const comparePlan = agent.planConversation({
  parsed: { values: { pack: 'economic' }, found: ['مستوى التشطيب: اقتصادي'], intent: 'unknown' },
  state: { area: 120, floors: 2, service: 'building', pack: 'medium' },
  pending: null,
  history: [],
  message: 'طيب والاقتصادي؟'
});
assert.equal(comparePlan.act, 'compare');
assert.equal(comparePlan.values.pack, undefined, 'a comparison question must not mutate the package');
assert.equal(comparePlan.action.type, 'compare_packages');

// --- engine integration: conversation.plan carries history-focus + undo ---
const engineChange = handleTool({
  tool: 'conversation.plan',
  state: { type: 'residential', area: 300, floors: 3 },
  args: { message: 'خليها 250', history: ['فيلا 300 متر و3 ادوار'] }
});
assert.equal(engineChange.values.area, 250);
assert.equal(engineChange.plan.act, 'change');
assert.equal(engineChange.unmatched, false, 'context-handled messages are not unmatched');

const engineUndo = handleTool({
  tool: 'conversation.plan',
  state: { type: 'residential', area: 300, floors: 4 },
  args: { message: 'بلاش', history: ['فيلا 300 متر و3 ادوار', 'خليها 4 ادوار'] }
});
assert.equal(engineUndo.values.floors, 3);
assert.equal(engineUndo.plan.act, 'cancel');

const engineCompare = handleTool({
  tool: 'conversation.plan',
  state: { type: 'residential', area: 120, floors: 2, pack: 'medium' },
  args: { message: 'طيب والاقتصادي؟' }
});
assert.equal(engineCompare.values.pack, undefined);
assert.equal(engineCompare.plan.action.type, 'compare_packages');
assert.equal(engineCompare.unmatched, false);

const engineClarify = handleTool({
  tool: 'conversation.plan',
  state: { type: 'residential', area: 120 },
  args: { message: 'مش فاهم', pending: 'floors' }
});
assert.equal(engineClarify.plan.act, 'clarify');
assert.equal(engineClarify.unmatched, false);
assert.match(engineClarify.plan.reply, /بمعنى أبسط/);

const engineVilla = handleTool({
  tool: 'conversation.plan',
  state: {},
  args: { message: 'فيلا دورين ومساحة الدور 200 متر' }
});
assert.equal(engineVilla.plan.serviceHint, 'building', 'villa/building is not treated as an apartment question');

// --- regression: "من غير" is a negation, not the change verb "غير" ---------
const firstBrief = handleTool({
  tool: 'conversation.plan',
  state: {},
  args: { message: 'عايز محاسبة لفيلا 300 متر على أرض 500 متر، 3 ادوار من غير أسانسير' }
});
assert.notEqual(firstBrief.plan.act, 'change');
assert.equal(firstBrief.plan.serviceHint, 'building');
assert.match(firstBrief.plan.reply, /سجلت/);
assert.doesNotMatch(firstBrief.plan.reply, /عدّلت/);

// --- regression: contextual replies never re-ask the service blindly ------
assert.doesNotMatch(engineClarify.plan.reply, /عايز تسعير لشقة ولا عمارة/);
assert.doesNotMatch(engineClarify.plan.reply, /بمعنى أبسط: .*عدد الأدوار كام.*عدد الأدوار كام/);

const engineReuse = handleTool({
  tool: 'conversation.plan',
  state: { type: 'residential', area: 300, floors: 3 },
  args: { message: 'زي ما قلت' }
});
assert.equal(engineReuse.plan.act, 'reuse');
assert.match(engineReuse.plan.reply, /نفس بيانات المشروع/);
assert.doesNotMatch(engineReuse.plan.reply, /عايز تسعير لشقة ولا عمارة/);

// A change never re-asks the slot it just changed.
const engineChangeAgain = handleTool({
  tool: 'conversation.plan',
  state: { type: 'residential', area: 300, floors: 3 },
  args: { message: 'خليها 250', history: ['فيلا 300 متر و3 ادوار'] }
});
assert.doesNotMatch(engineChangeAgain.plan.reply, /مساحة الدور\/الوحدة المبني كام متر مربع/);

console.log('beno-context tests passed: change focus, undo replay, reuse, comparison, clarification, confirm/deny, service hints, agent + engine wiring.');
