'use strict';
const assert = require('node:assert/strict');
const agent = require('../engines/miyar-dialogue-agent.js');

let r = agent.handle('عايز أشطب شقة 120 متر على الطوب، 3 غرف، 2 حمام، اقتصادي، على المفتاح', agent.freshState());
assert.equal(r.state.modelCode, 'APT-BRICK');
assert.equal(r.state.area, 120);
assert.equal(r.state.roomsPerApartment, 3);
assert.equal(r.state.bathrooms, 2);
assert.equal(r.state.package, 'economic');
assert.equal(r.action, 'confirm');

r = agent.handle('عمارة سكنية مساحة 220 متر 5 أدوار', agent.freshState());
assert.equal(r.action, 'ask');
assert.equal(r.question.key, 'areaBasis', 'The agent must clarify floor area versus total area instead of guessing');
r = agent.handle('مساحة الدور الواحد', r.state);
assert.equal(r.state.areaBasis, 'floor');
assert.equal(r.state.area, 220);

r = agent.handle('سعر طن الحديد كام؟', agent.freshState());
assert.equal(r.action, 'price_lookup');

r = agent.handle('عايز أبني عمارة سكنية 5 أدوار مساحة الدور 220 متر، شقتين في الدور، على المفتاح، تشطيب متوسط، بدون بدروم وعايز أسانسير', agent.freshState());
assert.equal(r.state.floors, 5);
assert.equal(r.state.area, 220);
assert.equal(r.state.unitsPerFloor, 2);
assert.equal(r.state.elevator, true);
r = agent.handle('خليها 6 أدوار', r.state);
assert.equal(r.state.floors, 6, 'Agent must accept mid-conversation correction without restarting');



// Negative colloquial edits must override a previous affirmative value.
r = agent.handle('مش عاوز أسانسير', r.state);
assert.equal(r.state.elevator, false, 'The colloquial negative “مش عاوز أسانسير” must remove the elevator option');
r = agent.handle('شيل المطبخ', r.state);
assert.equal(r.state.kitchen, false, 'Removal verbs must remove optional kitchen scope');

// Tool-like questions must not mutate the active project, and “what-if” must be classified.
const activeState = r.state;
const beforeTool = JSON.stringify(activeState);
const tool = agent.handle('سعر طن الحديد كام؟', activeState);
assert.equal(tool.action, 'price_lookup');
assert.equal(JSON.stringify(tool.state), beforeTool, 'Price lookup must not alter the active project facts');
assert.equal(agent.classifyIntent('قارن أسعار الحديد والأسمنت'), 'compare_prices');
assert.equal(agent.classifyIntent('ليه بتسألني عن المساحة؟', activeState), 'why');
assert.equal(agent.classifyIntent('لو خليناها 8 أدوار', activeState), 'scenario');
const scenario = agent.handle('لو خليناها 8 أدوار', activeState);
assert.equal(scenario.action, 'scenario');
assert.equal(scenario.state.floors, 8);
assert.equal(activeState.floors, 6, 'The UI must keep the original state and pass a clone to scenario evaluation');


// Turnkey scope should remain explicit in the compact engineering brief.
r = agent.handle('عايز أبني عمارة سكنية مساحة الدور 220 متر 5 أدوار على المفتاح تشطيب متوسط', agent.freshState());
assert.equal(r.state.scope, 'turnkey');
assert.ok(agent.projectSummary(r.state).some(x => x === 'النطاق: على المفتاح'), 'Project brief must not relabel turnkey as finishing only');

console.log('BENO conversation agent tests passed: compact project briefing, ambiguity clarification, price lookup, and conversational edits.');
