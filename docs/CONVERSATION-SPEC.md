# Conversation Specification

The runtime is deterministic and uses short Egyptian Arabic messages. It does not call an LLM. The independent `api/_lib/conversation.cjs` normalizes Arabic/Indic digits, selected colloquial number words, project scope/package terms, floor/area facts, material keywords and common Luxor place names, then reuses the frozen alpha.8 dialogue agent where possible. The parser is a compact rule-assisted extractor, not a general understanding guarantee.

## Ground rules

- A user message is reflected as an acknowledgement before returning to the pending question.
- Only one information request is presented at once. The UI captures side facts from the same message and re-asks the pending field.
- After repeated non-understanding, visible choices and numeric controls remain available; the system should not pretend certainty.
- Defaults and unprovided facts are shown as assumptions. A missing price never becomes an invented price.
- The first estimate attempt is capped by the front-end's question sequence; unanswered optional features remain excluded/explicitly assumed as represented by the engine.
- Greetings, thanks, unknown details, price questions, package comparison, missing information, scenario removal and request for a human engineer have specific UI paths.
- A hypothetical scenario is not committed without the customer's selection/approval.
- The persistent notice is “مساعد هندسي آلي — التقدير أولي”.

## Interpreting inputs

The parser supports selected spoken numbers (e.g. `دورين`, `تلات أدوار`, `ألف ومية متر`), Arabic/Persian numerals and material aliases. Units like قيراط/فدان/قصبة may not all be converted precisely in the current parser; see `ENGINE-GAPS-WIDGET.md`. Avoid using an unverified conversion for estimate area; ask the visitor to provide m² when uncertain.

## Repeat control

Alternative response copy is selected from deterministic pools. However, not every state in the inherited dialogue agent is fully integrated into widget-specific UI, and an absolute guarantee of no identical adjacent text has not yet been proven by the required exhaustive transcript crawler. Treat this as an alpha validation gap until `npm test` and the browser transcript suite establish it.
