# ENGINE-GAPS-WIDGET

Created for this widget release. No inherited engine defect was silently repaired. The six copied engine/dialogue source files match the alpha.8 release hashes; see `tests/frozen-engine-sha256.json` and `RELEASE-MANIFEST.json`.

## Confirmed inherited limitations

1. Source alpha.8's `docs/ENGINE-GAPS-ALPHA8.md` remains authoritative for engine model/takeoff/price assumptions, incomplete Luxor market rates, transport/date uncertainty, planning rates versus drawing BOQ, common-area measurements, and scenario-evaluation limits.
2. The seed catalog is incomplete and contains national substitute prices. Its `settings.margin` stays inside server-side data only. Production must set `BENO_MARGIN_PCT` explicitly and audit the new price book before deployment.
3. Project-model, legacy engine, and material-takeoff outputs use different field names and coverage definitions. The adapter maps them into a widget view model, but the coverage denominator may not align fully between model families; compare against engineer-approved golden totals before customer launch.
4. Project-model rates include planning assumptions. The widget cannot infer exact drawing-based quantities from area alone. The BOQ must show its estimate basis and gaps.

## Widget/integration gaps not closed in this alpha

1. **Distributed rate limiting is wired but not production-verified.** When Supabase credentials are configured and local-demo mode is off, requests call the `beno_consume_rate_limit` Postgres RPC with a hashed key. It fails closed if that RPC is unavailable. Apply `supabase/schema.sql` and verify the RPC/schema cache and rate windows in the actual project. Without Supabase credentials (local/demo), limiting is process-local and is not suitable for horizontally scaled production.
2. **Admin export adapter requires one-time binding.** The existing alpha.8 admin UI was not rewritten. `scripts/admin-price-export.js` provides the additive “تصدير ملف الأسعار (إصدار)” helper but its candidate globals are integration hooks, not confirmed alpha.8 APIs. Bind `makeExport()` to the actual admin state and verify a real export before using it.
3. **Unmatched-message logging is opt-in and has no review dashboard.** The path runs only when `BENO_LOG_UNMATCHED=1` and server-side Supabase credentials are present. It masks obvious phone/email and a few name/address prefixes, but arbitrary free text cannot be guaranteed anonymous. Publish a suitable privacy notice and review the text handling before enabling it for visitors. There is no automatic learning.
4. **Locale coverage is bounded.** The local parser has 170 curated phrases and 225/225 expected-field checks passing, including common Egyptian number words, digits, some local units, and Luxor place names. This does not prove complete Egyptian arithmetic grammar or verified conversion for every use of قيراط/فدان/قصبة. Ask for m² whenever conversion is ambiguous.
5. **WhatsApp navigation needs real-host verification.** The local Chromium test confirms the lead API saves a demo lead and creates a `wa.me` URL, but the sandbox blocks external navigation. Browser popup blockers and real-device behavior still need manual verification on the deployed origin.
6. **PDF export uses browser print.** There is no bundled PDF generation engine. CSV and share depend on browser capabilities.
7. **Full dialogue acceptance remains partial.** The browser suite exercises the main building estimate, details sheet, package comparison, lead path, fallback, and auto-open guard at 375/1440 in light/dark. The requested exhaustive suggestion-only crawler and all 15 golden transcripts across every service/model are not yet demonstrated. Keep this as a release gate before launch.
8. **Layout-shift budget is not measured in this sandbox.** The browser runner blocks normal localhost and file navigation, so the test uses `page.set_content` plus an intercepted synthetic origin; host computed styles and pre-open API traffic are checked, but formal CLS=0 and LCP impact require a normal origin and real landing deployment.
9. **No live Vercel/Supabase deployment was tested.** The local server and SQL are provided; credentials, domain allow-list, production storage, popup behavior, and deployed screenshots must be checked in the target environment.

## Engine issues not modified

Any source engine issue described in `docs/ENGINE-GAPS-ALPHA8.md` remains unfixed in this release. If runtime comparison finds a mismatch between raw engine output and the adapter, add a regression case and document it here; do not change frozen engine arithmetic as part of widget integration.
