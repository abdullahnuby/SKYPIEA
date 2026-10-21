'use strict';
const assert = require('node:assert/strict');
const workflow = require('../engines/miyar-workflow-engine.js');

let p = workflow.plan({}, { nextQuestion: { key: 'model', text: 'اختيار المشروع' } });
assert.equal(p.action.type, 'choose_service');
assert.equal(p.currentStage, 'scope');
assert.equal(p.progressPercent, 0);
assert.equal(p.stages.length, 4);

p = workflow.plan({ modelCode: 'APT-BRICK', projectKind: 'apartment', area: 120, scope: 'turnkey' });
assert.equal(p.action.type, 'run_estimate');
assert.equal(p.progressPercent, 50);
assert.equal(p.currentStage, 'pricing');

p = workflow.plan({ modelCode: 'BLD-NEW-RES', projectKind: 'building', area: 220, floors: 5, scope: 'turnkey' }, { nextQuestion: { key: 'package', text: 'اختيار مستوى التشطيب' } });
assert.equal(p.action.type, 'ask_field');
assert.equal(p.action.key, 'package');
assert.equal(p.stages[0].complete, true);
assert.equal(p.stages[1].complete, true);
assert.equal(p.progressPercent, 50);

p = workflow.plan({ modelCode: 'APT-BRICK', projectKind: 'apartment', area: 120, scope: 'turnkey' }, { estimate: { priceGaps: [{ item: 'دهان' }], quantityGaps: [{ item: 'حديد' }] } });
assert.equal(p.action.type, 'review_gaps');
assert.equal(p.gaps.total, 2);
assert.equal(p.stages[2].complete, false, 'An estimate with gaps must not mark pricing complete');
assert.equal(p.currentStage, 'pricing');
assert.equal(p.gates.engineeringReviewRequired, true);

p = workflow.plan({ modelCode: 'APT-BRICK', projectKind: 'apartment', area: 120, scope: 'turnkey' }, { estimate: { priceGaps: [], quantityGaps: [] } });
assert.equal(p.action.type, 'engineering_review');
assert.equal(p.stages[2].complete, true);
assert.equal(p.stages[3].complete, false, 'The deterministic engine never approves its own estimate');
assert.equal(p.progressPercent, 75);

let r = workflow.routeIntent('price_lookup');
assert.equal(r.tool, 'price-catalog.search');
assert.equal(r.mode, 'read');
assert.equal(r.mutatesProject, false);
r = workflow.routeIntent('calculate');
assert.equal(r.tool, 'estimate.run');
assert.equal(r.mutatesProject, true);
r = workflow.routeIntent('scenario');
assert.equal(r.tool, 'scenario.evaluate');
assert.equal(r.mutatesProject, false, 'Hypothetical scenario must not mutate active project facts');
r = workflow.routeIntent('unclassified-intent');
assert.equal(r.tool, 'intent.clarify');
assert.equal(r.mode, 'clarify');

console.log('BENO workflow engine tests passed: stage planning, next-action selection, gap gates, human-review gate, and deterministic tool routing.');
