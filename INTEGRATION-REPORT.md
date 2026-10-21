# Integration verification — SKYPIEA + Beno

## Current release

- Release: `1.0.0-alpha.13` (SKYPIEA company landing page + redesigned Beno widget welcome).
- Operational core catalog: `api/_data/price-book.v8.json`; 183 active rows (165 priced, 18 explicit gaps). The 291 unused January-bulletin variants are preserved in `api/_data/price-book-extended.v1.json` and excluded from default matching.
- Numeric price coverage: 165/183 core active rows (90.2%). This checks only for a positive average, not freshness, locality, supplier verification, transport inclusion, valid quantities or engineering approval. The core book has 37 stale/undated prices; the extended archive retains 291 rows not currently used by BOQ/takeoff rules.
- Price-quality review found 37 active core rows older than 90 days or undated and 18 explicit open price gaps; the unused 291 January-bulletin variants are retained in a separate non-searchable archive. Twelve duplicate/conflicting catalog rows were deactivated with reason/canonical references retained. The estimate API now withholds the prominent total when a required price or quantity gap exists.

- Alpha.12: استُعيدت صفحة SKYPIEA بوصفها صفحة شركة هندسية وتكنولوجية متكاملة. عادت قطاعات الشركة وخدماتها ومنهجية العمل وقسم التعريف بالشركة ونموذج التواصل، وأُبقي Beno منتجًا متخصصًا داخل قطاع التكنولوجيا وبقسم مميز منفصل يفتح نفس تجربة الشات. عنوان الصفحة ووصف المشاركة الاجتماعية يخصان SKYPIEA، واختبارات القبول تتحقق من وجود جميع الأقسام في اللغتين العربية والإنجليزية على الموبايل والكمبيوتر.
- Alpha.13: أُعيد تصميم الويجت العائمة نفسها، مع علامة Beno وحالة مرئية، ورسالة ترحيب تظهر تلقائيًا بعد نحو 1.9 ثانية وتشرح للزائر دور المساعد. «جرّب Beno» تفتح مساحة العمل، و«مش دلوقتي» تخفي الرسالة؛ لا تُفتح لوحة المحادثة تلقائيًا على صفحة الشركة، ويُمنع تكرار الترحيب في جلسة التصفح نفسها. يمكن التحكم فيه عبر `data-welcome`. اختبارات القبول تغطي ظهور الترحيب على الموبايل والكمبيوتر دون تمرير أفقي أو أخطاء.
- Alpha.10: أعيد بناء واجهة محادثة Beno كمساحة عمل هندسية واسعة، مع ترحيب تفاعلي، ملف مشروع ومؤشرات تغطية متصلة بالحالة الفعلية، أزرار للمقايسة والنواقص والافتراضات، نسخ ردود، مؤشر نشاط للشبكة، ومحرر متعدد الأسطر. أضيفت اختبارات متصفح مخصصة لمساحة العمل.

- One repository root and one Vercel project: static output from `dist/` and serverless endpoints under `api/`.
- Landing page: `index.html`, `app.js`, `styles.css` and assets.
- Beno widget: `widget/src/loader.js` and `widget/src/chat-chunk.js`, built into the root bundles and copied into `dist/`.
- BOQ display uses `engines/miyar-wbs.js` for `execution stage → work package → line kind`; material/labor rows are grouped under the same work package, and CSV/print/detail views share the hierarchy. Alpha.5 changes the project/take-off calculation logic too: excavation scope, supply/labor split, waste on supplies only, and purchase quantities are calculation inputs, not presentation-only classifications. The details sheet includes per-line quantity editing, recalculation and reset; per-project quantity overrides currently persist in local browser storage, while shared prices/resource rates/waste percentages are managed through `/admin`.
- Public API: `/api/tool` and `/api/lead`; admin APIs under `/api/admin/*`.
- Calculation and conversation logic lives in `engines/` and `api/_lib/`; no LLM API is needed for the current deterministic dialogue or estimate paths.
- Price administration stores releases locally for development or in private Supabase tables for production.
- The active agent data now includes `api/_data/boq-knowledge.v1.json` (work scopes, includes/excludes, waste rules and domain synonyms), canonical catalog metadata (`workPackage`, `itemKind`, `priceScope`, `engineerReview`), and centralized rate defaults in `engines/miyar-rates.js`. The migration preserves old row IDs and `sourceCategory`, and deactivated duplicates remain in the file for audit but are excluded from active matching.

## Alpha.13 — redesigned floating widget and automatic welcome

- The launcher now has a distinctive Beno identity, engineering role, and online status.
- A compact welcome message appears after about 1.9 seconds, introduces Beno, and offers “Try Beno” or “Not now”; it does not automatically open the full chat on the company landing page. The message is dismissed when the visitor starts or closes it and is shown only once per browser tab session.
- `data-welcome="false"` disables the welcome message; `data-autoopen="false" data-welcome="true"` keeps the welcome visible without opening the full chat automatically.
- `npm run test:landing`: passed on mobile/desktop with welcome flow enabled; no horizontal overflow, no JavaScript errors, welcome CTA opens the chat, and the full chat remains closed until clicked.

## Alpha.10 — expanded Beno engineering workspace

- Desktop presents Beno in a centered, wide work surface (tested at 1236 px) with the conversation and project context side-by-side. Mobile uses a full-screen conversation with the project context available through a drawer.
- A three-card starter surface routes to existing service selections; no forced multi-step flow, sign-up or dashboard was introduced.
- Multiline message composer: Enter sends and Shift+Enter inserts a line. Reply-copy controls, request activity indicator, project-context status, estimate/gaps/assumptions actions and Escape-to-close are covered by workspace browser smoke.
- Mobile header subtitle is constrained to one clipped/ellipsized line to avoid overlapping the action buttons.
- `npm run test:workspace`: passed on desktop-light, mobile-light and mobile-dark; 0 console errors.
- `npm run test:landing`: passed on mobile and desktop; 16 CTAs per viewport, chat stays closed by default, prompt prefill works without auto-submit, no horizontal overflow, 0 console errors.
- `npm run test:browser`: passed on mobile/desktop in light/dark modes, 14 API requests observed; quantity overrides round-trip, headline amount remains hidden while required gaps exist, Escape-to-close and failure fallback pass, 0 console errors.
- `npm test`: all 18 Node test suites passed. `npm run test:admin:browser` and `npm run check:secrets` passed.
- Scope note: Alpha.10 changes the experience and client interaction layer; it does not add an external LLM API. Dialogue, knowledge matching and estimates continue through existing deterministic logic and APIs.

## Verification results

- `npm test`: passed, 18/18 Node test suites, including `boq-organization.test.cjs` and `agent-knowledge.test.cjs`.
- `npm run build`: passed, including both catalog and agent-knowledge integrity gates.
- `npm run audit:knowledge`: passed; the rate registry now covers 68 defaults, all active catalog rows have a canonical work-package/classification, and 12 duplicate/conflicting rows are excluded from active matching.
- `npm run check:secrets`: passed for client bundles.
- `npm run audit:prices`: passed; detailed results are in `PRICE-BOOK-QUALITY-REPORT.json`.
- `npm run report:gaps`: passed; refreshed report is in `PRICE-GAPS-REPORT.json` and `docs/PRICE-GAPS-2026-01.md`.
- `npm run test:browser`: passed in mobile/desktop and light/dark combinations. No console errors; host CSS unchanged; no API call before opening; amount hidden while required gaps remain; per-line quantity edit → estimate recalculation round-trip, lead API round trip and failure fallback verified.
- `npm run test:admin:browser`: passed with a mocked API for admin UI interactions. Real local API behavior is covered by `tests/admin.test.cjs`.
- The source-integrity suite records the approved Alpha.5 baseline; the two engines changed for the requested scope/waste behavior have updated expected hashes, while the other frozen engine sources remain unchanged.

## Known limits / production gates

- No deployment was performed on the live Vercel project and no target Supabase credentials were supplied. Real production migration execution, RLS, persistent lead storage, durable rate limiting and admin setup are therefore not verified.
- The browser smoke test uses a synthetic origin and blocks external WhatsApp navigation; it verifies URL construction, not the real external hand-off or production layout metrics.
- 37 active core priced rows are stale/undated by the 90-day policy; local-rate count is reported in the current `PRICE-BOOK-QUALITY-REPORT.json`. The 18 missing prices and default wastage rates must be reviewed by an engineer; wastage defaults are editable starting assumptions, not mandated norms. Current local supplier quotations and source review are still required.
- A construction estimate is not a take-off from engineering drawings unless quantities are actually derived from reviewed drawings or manually approved quantities. Per-line edits currently persist in the user’s browser, not as a shared project record in the production database. Human engineering review remains required.


## Alpha.6 — concise BOQ presentation

The first view groups required resource lines into main rows by work package and cost type. Detailed components, individual units, quantities, unit prices, sources, waste and quantity editing remain available when a group is expanded. Main-view counts exclude note-only and optional rows. A two-storey residential-building test reduces 116 detailed lines to 33 main rows; apartment fixture reduces 31 to 19. This affects presentation only, not calculation quantities or price book rates.
