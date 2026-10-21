# BENO Construction Pricing Agent — Architecture (No LLM)

## Product goal
BENO is not a chat wrapper or a price-per-square-metre calculator. It coordinates a domain-specific estimating workflow over the platform's editable construction price book, quantity rules, project state, deterministic BOQ engine, and explicit validation policies. The current prototype requires no LLM provider, language-model API, network calls, or API key.

## Agent workflow

The client-facing experience is a workbench, not a chat-only wrapper. It keeps four visible stages—project scope, quantity basis, pricing, and engineering review—while a deterministic rule engine selects the next missing high-impact fact. Natural language remains an input channel; quick response choices are generated from the active question. A generated estimate does not satisfy the final engineering-review gate.
1. **Capture project facts** — area basis, floor count, project type, scope, apartment template, package, basement, elevator, number of units per floor, bathrooms, and explicit optional items.
2. **Classify intent** — distinguish project setup, price lookup, price comparison, catalog audit, project status, cost-optimization exploration, estimate review, and a new project.
3. **Resolve one next action** — ask for a required missing fact, run a catalog lookup/audit/comparison, hand the stable project state to the estimator, or explain why a final result is blocked.
4. **Construct the BOQ** — produce ordered WBS-coded line items, use one selected brand for mutually exclusive material choices, and prevent options such as kitchens and AC from being included unless selected.
5. **Resolve quantity** — calculate only when an explicit quantity rule exists; otherwise request an editable take-off quantity. Area-based steel, concrete, finish, paint, and unit-count values are labelled as benchmarks rather than drawing take-off.
6. **Resolve rate** — use a matching active catalog row with unit, low/average/high price, source, date, status, confidence, and transport condition. Missing rates remain null.
7. **Validate and present** — show priced subtotal, range for priced lines, independent price and quantity gaps, stale rates, national substitute rates, and missing transport. Do not label a partial priced subtotal as a complete project total.
8. **Trace decisions** — the UI logs the recognized intent, facts changed, and rule-selected follow-up so operators can debug deterministic behavior.

## BOQ classification
The engine assigns ten divisions:
- 01 Studies, setup, permits, and indirect costs
- 02 Excavation, earthworks, and foundations
- 03 Concrete structure materials and systems
- 04 Masonry, plaster, and insulation
- 05 Electrical and low-current works
- 06 Plumbing, drainage, and water supply
- 07 Architectural finishes
- 08 Labor and workmanship
- 09 Elevator and special equipment
- 10 Explicit additional options

An administrator's explicit category takes precedence over keyword fallback. This prevents names containing generic terms such as cement from overriding the intended masonry/plaster category. Soil testing remains in earthworks; general concrete/steel testing remains under indirect/testing services as defined by the item category.

## Pricing methodology
- Unit rate is stored separately from quantity. Line cost = accepted quantity × average unit rate.
- The priced-line amount range uses low and high rates; missing bounds fall back to the entered average for that bound only.
- A line with both price and quantity missing is counted in both independent gap lists, not hidden by one missing field.
- A line with missing/invalid price never contributes a numeric amount.
- National substitute, estimate, stale price, and material rates without transport included are quality risks. National substitute prices are never relabelled as local verified rates automatically.
- Comprehensive mode applies the configured internal margin to the sum of currently priced lines; customer estimate UI does not disclose the margin percentage or a separate margin line. Supervision mode shows the separate configured supervision rate.
- Low/average/high totals apply the selected fee/margin rate to the corresponding priced-line totals. All such totals remain partial when rates or quantities are missing.

## Current implementation
- `index.html`: RTL engineering workbench, adaptive next-decision panel, fact ledger with provenance badges, collapsed session history, editable catalog, customer-estimate preview, BOQ table, and admin workspace.
- `miyar-conversation-ui.js`: renders the live workbench status, next deterministic question, completion progress, and fact provenance; transcript is an expandable audit trail rather than the primary product surface.
- `miyar-workflow-engine.js`: pure deterministic stage planner and intent-to-tool router. It computes scope/quantity/pricing/review stage state, reports open price/quantity gaps, names the next required action, and keeps engineering approval pending even when a numeric estimate exists.
- `miyar-engine.js`: deterministic classification, pricing BOQ, price-quality audit, Arabic project-field parsing, and next-action selection.
- `miyar-takeoff.js`: deterministic per-floor material/labor/equipment take-off, resource rollups, ready-mix/site-mix path separation, unit conversion for supported cases, rate-conflict warnings, and order-summary generation.
- `price-catalog-full.json` / `.csv`: exports synchronised from the same `freshSeed()` data embedded in the UI using `scripts/export-catalog.cjs`.
- `schema.sql`: draft PostgreSQL schema for a future shared backend; not wired up to the local-only prototype.
- `tests/catalog-smoke-test.cjs`: checks seed/JSON/CSV alignment, IDs, known prices, and gaps.
- `tests/engine.test.cjs`: checks classification, Arabic parsing, WBS ordering, option gating, manual quantity override, rate-range aggregation, missing-price/quantity behavior, and estimate readiness.
- `tests/takeoff.test.cjs`: checks quantity formulas, rate conflicts, two-floor material roll-up, unit conversion, and no double-counting between ready-mix and site-mix.
- `tests/workflow-engine.test.cjs`: checks deterministic stage completion, action selection, estimate-gap gates, required human-review gate, and tool routing.

## Resource take-off extension (19 October 2026)
- The current take-off engine accepts floor-specific area and take-off inputs, with the gross-area-based steel/concrete benchmark only as a labelled preliminary allowance.
- Site mix calculates cement/sand/aggregate/water from concrete volume; ready-mix supplies concrete volume as one material line and leaves pumping/placement as separate cost lines.
- Cement, sand, and aggregate orders roll up across floors. If any contributing quantity is unknown, known partial consumption remains visible while the full order quantity is not claimed complete.
- Supplied rates include contradictions; steel and structural cement contradictions are promoted as critical warnings, while plaster-cement range conflict is also surfaced.

## Deterministic agent layer (October 2026 — no LLM, by design)

The agent was upgraded from fixed regex replies to a deterministic language and decision stack. Every step is reproducible without any LLM provider; nothing in this layer calls a network model.

### Understanding layer (`engines/beno-lexicon.js` + `engines/beno-nlu.js`)
- `beno-lexicon.js` is versioned seed data: intent synonyms, negation words, boolean feature anchors (AC, elevator, kitchen, basement, AC, sewer), package/scope keywords, place hints, and material hints. All Arabic text is matched after folding (alef/ya/ta-marbuta/tashkeel normalisation); tokenisation strips punctuation and softens client-side bundling artifacts.
- `beno-nlu.js` matches phrases that **float** inside the sentence instead of exact full-string patterns, and applies explicit confidence thresholds so weak matches degrade instead of inventing facts. Every extracted fact carries its own confidence tier; the old frozen `miyar-engine` parser still fills anything the new layer does not catch.
- Negation is handled by two window classes with different reach: removal verbs (`شيل`, `الغي`, `شلنا`) act near the anchor, and desire-suffix negation (`عايزش`, `مش عايز تأسيس تكييف`) is allowed to sit up to three tokens back. A negation inside the window forces the boolean slot to `false`; suffixed desire verbs (`عايزش`) are detected directly.
- The stage is integrated additively in `api/_lib/conversation.cjs::infer()` — the frozen legacy engine is untouched, and new-layer feature truths (including negated `false` values) win only where the legacy layer found nothing or produced low-confidence conflict.

### Decision layer (`api/_lib/agent.cjs`)
- Builds the assistant reply from real registered facts only (no invented prices), then selects the **next question by information gain**: area 95, floors 85, packaging 70, and similar fixed weights.
- Special rules: elevator is promoted to 72 when the floor count is 8 or higher; confirmation is requested when facts conflict (e.g. land plot area smaller than the built-up area already registered); the reply always surfaces honest warnings when required facts are still missing.

### Server surfaces
- New tool `conversation.plan` (`api/_lib/engine.cjs`): one call returns extracted values, intent, needs-confirmation list, and the full decision plan. Unrecognised free text and non-planning intents are recorded for the learning log.
- `boq.explain` extended with `engines/beno-explain.js`: each BOQ line gains `narrative`, `quantityStory`, `priceStory`, and `costStory` generated strictly from line data. A missing price or quantity produces an honest gap statement; nothing is guessed.
- Prices, margin, and the coverage readiness gate stay server-side; the widget only receives the sanitised presentation models.

### Continuous learning loop (human-approved, still no LLM)
1. Unmatched or unplanned messages are logged via `api/_lib/unmatched.cjs` + `api/_lib/learn.cjs::fetchUnmatched`.
2. `clusterUnmatched` groups similar messages by token containment (threshold 0.45).
3. An admin reviews clusters in the management UI and adopts one as lexicon additions (`api/admin/agent.js`: GET clusters / POST adopt). Nothing enters the live lexicon without explicit approval.
4. Adopted rows land in the `beno_lexicon` table (migration `supabase/migrations/20261022_beno_agent_learning.sql`) with `verified=true`.
5. Next `conversation.plan` call calls `applyLearnedLexicon()` to refresh the NLU seam before planning; a unavailable back-end never blocks the request.

### Dialogue context layer (`engines/beno-context.js`)
- Single messages cannot carry a conversation; this layer adds the deterministic human signals the parser alone missed, always without an LLM:
  - **Discourse acts**: `change` ("خليها 250", "بدّلها"), `cancel/undo` ("بلاش", "ارجع"), `reuse` ("زي ما قلت", "نفس اللي فات"), `compare` ("طيب والاقتصادي؟"), `clarify` ("مش فاهم"), `confirm`, `deny`, and plain `answer`.
  - **Focus resolution**: a bare number is applied only to a slot where it is plausible. Candidates come from the pending question, explicit keywords, then recent history; if a number is valid for more than one slot with no recent signal — or for both land area and built-up area — the agent **asks instead of guessing**.
  - **Undo replay**: prior user turns are re-parsed deterministically and kept as per-key value sequences. "بلاش" restores the value before the most recent change. If only one change exists, the earlier value is unknown and the agent says so rather than fabricating one.
  - **Comparison questions never mutate the project**: "والاقتصادي؟" no longer silently switches the package; it returns `action:{type:'compare_packages'}` and keeps the stored package untouched.
  - **Service hint**: a villa/building description is recognised as a building (not silently mapped to an apartment), so the agent stops asking "شقة ولا عمارة؟" after the sentence already answered it.
- `conversation.plan` accepts up to 10 prior user messages as `history` strings; the server re-parses them with the same frozen parser + NLU. The widget keeps that short window in local storage and sends it each turn, so context works across reloads.
- Context-handled messages are not written to the unmatched-learning log; only genuinely unrecognised text feeds the human-approved loop.

### Verified end-to-end (local HTTP)
Full suite `node tests/run.cjs` — all 13 suites pass, including frozen-engine SHA256 integrity for the six frozen `miyar-*` files.
Live checks against a fresh `node scripts/local-server.cjs` run:
- `GET /api/tool` → 405 (POST-only contract).
- `conversation.plan` "عايز محاسبة لفيلا 300 متر على أرض 500 متر، 3 ادوار من غير أسانسير" → extracted `{area:300, floors:3, type:residential, elevator:false}` — the negation window turned "من غير أسانسير" into `elevator:false`.
- The same first message returns `serviceHint:'building'` and asks the package next (it does not re-ask area/floors).
- `خليها 250` after `فيلا 300 متر و3 ادوار` → `{area:250}` with "عدّلت" (not "سجلت"), and the next question is the package.
- `بلاش` after a floors change → `{floors:3}` restored, `action:{type:'revert'}`; `بلاش` right after a question skips that question.
- `زي ما قلت` → "ماشي على نفس بيانات المشروع" then the next highest-value question.
- `طيب والاقتصادي؟` → `action:{type:'compare_packages'}`, package untouched.
- `مش فاهم` while floors is pending → a plain-language explanation plus the same question buttons, with no invented facts.
- `مفيش تكييف` → `{ac:false}` intent `deny`; `شلنا المصعد` / `عايزش أسانسير` → `{elevator:false}`.
- `estimate.run` 120m²/2 floors → 31 BOQ lines, coverage 29% — the partial amount stays hidden and gaps are shown honestly.
- `boq.explain` code `01.01` → narrative with no price gap confirmation instead of a numeric fabrication.

Operations note for local development: on Windows a stale `node` process from a previous session can keep holding port 4173 and serve outdated code (symptom: `Unknown tool.` for tools that demonstrably exist). Fix: `Get-NetTCPConnection -LocalPort 4173` → `Stop-Process -Id <pid> -Force`, then restart the server.

## Limits (must remain explicit)
- The understanding layer is deterministic and phrase-based with floating-match windows; it is rule-driven language classification, not general natural-language comprehension. Its vocabulary grows only through the human-approved learning loop above — nothing is learned automatically and no statistical model is trained.
- No structural design, geotechnical conclusion, permit determination, or contract-grade quantity take-off can be inferred from gross floor area alone.
- Nationally published sources in the initial price book are substitutes, not verified Luxor quotations.
- LocalStorage is browser/device-local. There is no shared data store, authenticated admin account, or central audit log in this prototype.
- Do not claim ±10% accuracy until representative completed projects have been back-tested and the estimates calibrated.

## Production next steps
1. Add role-based authentication, server validation, shared database connectivity, revisions, audit log, and backups.
2. Version quantity rules and price-list snapshots so every saved estimate can be reproduced.
3. Collect three local supplier/contractor quotations for each major gap and store validity dates and transport scope.
4. Add a drawing take-off import flow and a review step by a qualified estimator/engineer.
5. Extend tests with golden BOQs from real projects and track absolute/percentage error by division, package, and building type.
