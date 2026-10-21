# SKYPIEA + BENO — Implementation Roadmap

## P0 — Safety and source integrity

- Keep the main amount hidden whenever a required price or quantity is missing.
- Keep user-facing numbers tied to a named price-book version and expose local/national/estimated source status.
- Preserve newer verified inputs when importing older bulletins. Reject unit/name mismatches and unsupported derived values.
- Require durable rate limiting, secure admin sessions, same-origin write protection, and server-only credentials in production.
- Keep a regression suite for Arabic negation, explicit `false` answers, numeric ambiguity, and interrupted requests.

**Acceptance:** all Node suites, catalog audit, build, bundle-secret scan, and browser smoke pass; no primary amount appears for an estimate with required gaps.

## P1 — Engineering-estimate quality

- Expand independent test projects with known quantities, price sources, and manually reviewed totals.
- Separate price coverage, quantity coverage, price freshness, source locality, transport inclusion, and human-review status in all reporting.
- Provide an admin workflow for reviewing outdated prices and retaining provenance for changes.
- Check unit conversion consistency between catalogue rows, BOQ models, and resource take-off.
- Keep derived rates visibly labeled as estimates and require evidence before treating them as local market prices.

**Acceptance:** a repeatable engineering validation report lists expected versus computed quantities/totals, tolerances, unresolved assumptions, and source provenance.

## P2 — Dialogue and controlled learning

- Expand the held-out Egyptian Arabic paraphrase set; measure intent and slot extraction, not only test-case passing.
- Require a supervisor to select an intent before adopting an unmatched phrase.
- Keep unverified customer price mentions separate from published catalogue prices.
- Add reversible revisions for learned synonyms and price changes.

**Acceptance:** no unmatched phrase changes production interpretation until it is mapped, reviewed, and approved; all learning actions are auditable and reversible.

## P3 — Operational readiness

- Verify target Supabase policies and migrations, production rate limit RPC, admin secrets, and origin rules.
- Exercise the complete lead-to-human workflow on the deployed domain.
- Add CI execution for Node tests, catalog checks, build and bundle-secret scan on every proposed release.
- Publish release notes generated from current checks and the exact catalogue version.

**Acceptance:** deployment smoke report is attached to the release; production limits and data persistence are observed, not assumed.
