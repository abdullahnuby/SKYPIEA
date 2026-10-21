# BENO Skills Inventory — 2026-10-21

## Implemented in the current repository

- **Arabic/English landing page:** responsive static content and contact handoff.
- **Estimate conversation:** guided project type, size, floors, package, scope, options, and free-text updates.
- **BOQ estimate engine:** deterministic models, unit prices, ranges, assumptions, warnings, price gaps, and quantity gaps.
- **Resource take-off:** material and labor quantities, explicit unit conversion, manual quantity overrides, and per-floor data.
- **Price lookup and package comparison:** catalogue-backed; outputs carry price-book version and source information.
- **BOQ explanation:** line-level quantity/price/cost explanations based on the stored result, without making up missing values.
- **Admin price book:** edit draft, validate prices, adjust shared consumption rates, export/import JSON, publish releases, and inspect history.
- **Controlled phrase learning:** unmatched phrases are clustered, reviewed, and added only through explicit supervisor approval.
- **Lead capture:** explicit contact consent, request validation, server-side persistence in production configuration, and WhatsApp handoff.
- **CSV export and browser print:** available for estimate details; print-to-PDF remains browser printing, not a separately generated and validated PDF.

## Partial or absent capabilities

- **Semantic retrieval / trained language model:** absent. The current natural-language layer is deterministic lexical/fuzzy matching with explicit negation rules. Its scores are heuristics.
- **General task executor:** partial. There is conversation/workflow routing, but no general checkpoint/resume engine for arbitrary multi-step tasks.
- **Durable episodic/procedural memory:** absent beyond conversation state and the narrow reviewed learning stores.
- **Excel/Word/PDF file processing:** absent as first-class file automation.
- **Engineering validation benchmark:** partial. Unit tests and a language corpus exist, but a held-out collection of independently reviewed engineering estimates is still needed.

## Release acceptance

A skill is not considered production-ready solely because a unit test passes. It needs a defined input schema, preconditions, safe failure behavior, an auditable result, and an independently checked acceptance test for the relevant real-world environment.
