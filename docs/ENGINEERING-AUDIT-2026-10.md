# SKYPIEA + BENO — Engineering Audit (2026-10-21)

## Scope and status

This audit is based on the uploaded source archive, with changes recorded in `CHANGELOG.md` and `PRICE-BOOK-CORRECTIONS-v5.json`. It distinguishes source-level checks from deployment checks. This is an Alpha release, not a declaration of production readiness.

## Architecture found in the repository

- Landing page: `index.html`, `app.js`, `styles.css`, and `assets/`.
- BENO widget source: `widget/src/loader.js` and `widget/src/chat-chunk.js`; generated bundles are built from these sources.
- Public API: `api/tool.js` and `api/lead.js`; orchestration and input validation live in `api/_lib/engine.cjs`, `conversation.cjs`, `agent.cjs`, and `http.cjs`.
- Estimate engines: `engines/miyar-engine.js`, `miyar-takeoff.js`, `miyar-project-models.js`, `miyar-rates.js`, and the workflow/dialogue modules. Frozen engine hashes are checked by `tests/frozen-integrity.test.cjs`.
- Dialogue: deterministic normalization, synonym matching, fuzzy phrase similarity, negation handling, conversation context, and a controlled lexicon-learning loop. This is not a trained neural semantic model, and confidence scores are heuristics rather than calibrated probabilities.
- Price management: `/admin` and `api/admin/*`; price drafts and release history can be stored locally for development or in Supabase for production.
- Database resources: `supabase/schema.sql` and versioned migrations; production state requires the matching migrations and secret environment variables.

## Consequential findings and changes

1. **Estimate safety gate:** the prior adapter permitted a prominent amount once price coverage crossed a percentage threshold, even when required price or quantity gaps remained. The current code now requires no required price gaps and no required quantity gaps before setting `readyToShowAmount`; the threshold remains a minimum gate, not a substitute for completeness.
2. **Price book integrity:** v4 contained price-source regressions and mismatched units. v5 restores later, previously published records where appropriate, restores the original unit for a 50 kg cement bag and steel by tonne, separates a documented derived electrical reference into its own row, and leaves unsupported steel-diameter/tie-wire/spacer prices open. Details are in `PRICE-BOOK-CORRECTIONS-v5.json`.
3. **Coverage language:** numeric catalog coverage is not freshness, local verification, or engineering approval. The audit script reports status distribution, price age, and explicit data-quality issues separately.
4. **Conversation state:** boolean `false` is a valid, explicit answer for option slots and must not be treated as unanswered.
5. **Admin learning:** unmatched phrases must be explicitly mapped to an intent before adoption; a generic cluster label must not be taught as a catch-all intent.
6. **Production rate limiting:** Vercel/production requests fail closed when a durable limiter is not configured; the per-process limiter remains development-only.
7. **Generated artifacts:** bundle and build outputs must be regenerated from `widget/src/`; they must not be hand-edited.

## Remaining production gates

- Apply and verify the Supabase schema/migrations in the actual target project.
- Configure unique server-side admin secrets and the production origin allow-list; keep local demo mode disabled in production.
- Run a production-origin smoke test for account-free public estimate use, lead persistence, admin login, publication, and WhatsApp handoff.
- Obtain current, source-backed local quotations for stale and missing prices; review calculation assumptions against drawings before using estimates as a construction budget.
- Add a held-out engineering task benchmark and report its accuracy separately from deterministic unit tests.

## Verification

`npm test`, `npm run build`, `npm run check:secrets`, and `npm run audit:prices` are the repository-level gates. Actual Vercel/Supabase production behavior cannot be proven from source files alone.
