# Review Log — 2026-10-21

All screenshots below come from Chromium. The runner blocks ordinary `localhost` and `file://` navigation, so tests load the page with `page.set_content` and route a synthetic origin to the real local Node API. This still executes the real loader, UI chunk, and API handlers, but does **not** establish production-origin CLS/LCP or real external WhatsApp navigation.

## Round 1 — Loader setup / initial open

- **Before:** `tests/artifacts/round-1-before-loader-fix.png`. Clicking the launcher did not open a conversation because the widget config/Shadow DOM references were not seeded before the lazy chunk read them.
- **Change:** initialize loader configuration and host references synchronously before any chunk can load.
- **After:** `tests/artifacts/desktop-light-02-welcome.png` (visible panel and choices) and `tests/artifacts/browser-smoke-report.json` (four viewport runs, zero console errors).

## Round 2 — First-message UX

- **Before:** `tests/artifacts/round-2-before-duplicate-greeting-fix.png`. A separate greeting was followed immediately by another greeting inside the service-choice message.
- **Change:** render the welcome and the service choices as one single message; retain the single message + three quick choices behavior.
- **After:** `tests/artifacts/mobile-light-02-welcome.png` (one greeting, three choices).

## Round 3 — Customer-facing BOQ labels

- **Before:** `tests/artifacts/round-3-before-line-label-cleanup.png`. Internal engine codes appeared beside the material names, making the sheet look like a debug view.
- **Change:** show human-readable item titles; for repeated per-floor rows append the floor label while retaining codes only for search/matching. Frozen engine responses remain untouched.
- **After:** `tests/artifacts/mobile-light-04-detail-sheet.png` (readable Arabic labels and floor context).

## Final automated review

- `npm test`: **8/8 Node test suites passed**; frozen engine hashes match; 9 API tools covered; partial catalog coverage=40% hides main amount, TEST ONLY fixture coverage=73% permits it; 170 Arabic phrases with 225/225 expected-field checks.
- `npm run check:secrets`: passed client bundle secret-pattern scan.
- `npm run test:browser`: passed four viewport/theme flows; 0 pre-open API calls; host CTA computed styles unchanged; 132 BOQ rows; four package cards; Escape close; auto-open timing and typing suppression; local demo lead save; graceful tool failure fallback; no console errors.
- Bundle size: loader **2,584 bytes gzip** (budget ≤6 KB); UI chunk **19,403 bytes gzip** (budget ≤90 KB).
- **Not verified:** production-origin CLS=0/LCP impact, auto-open persistence across a true origin navigation, external `wa.me` navigation, real Supabase RPC/deployment, the full suggestion-only conversation crawler and all 15 requested golden transcripts. These remain explicit release gates; do not claim production readiness.


## Round 4 — BENO / Beno rebrand

- Updated the customer-facing identity, welcome, assistant avatar, asset filenames, public browser API (`window.BenoChat`), CSS namespace, embed examples, package metadata, API session header and server config names.
- Updated the Supabase rate-limit RPC/table names and added `supabase/migrations/20261021_rebrand_rate_limit.sql` for an existing alpha schema.
- Rebuilt and reran tests after the rename. The welcome screenshot `tests/artifacts/mobile-light-02-welcome.png` now shows BENO / Beno.
- The six frozen computational/dialogue engine files remain unchanged; their original filenames and exports are retained to preserve source compatibility and SHA-256 integrity.
