# Local Test Report — 2026-10-21

## Automated Node suites

`npm test`: **passed, 8/8 suites**

- Frozen engine arithmetic: 31 BOQ lines, 18 price gaps, 11 quantity gaps.
- Frozen takeoff: 78 resource lines, 45 price gaps, 15 quantity gaps.
- Frozen project models: 10 models.
- Frozen conversation agent and workflow engine suites passed.
- Frozen-source integrity: all six SHA-256 values match the release fixture.
- API adapter: nine tool names exercised. Source catalog: 40% coverage, no primary amount. TEST ONLY synthetic fixture: 73%, primary amount allowed. Schema and sensitive-field checks passed.
- Egyptian Arabic parser: 170 distinct curated phrases and 225/225 expected-field checks.

`npm run check:secrets`: passed the client bundle secret-pattern scan.

## Browser acceptance smoke

`npm run test:browser`: passed using system Chromium and the real local Node API. Navigation to `localhost` and `file://` is blocked by the execution sandbox, so the test uses `page.set_content`, intercepts a synthetic test origin, and bridges API calls back to the local server. The external `wa.me` destination is captured before navigation because external navigation is similarly blocked.

- 375px and 1440px viewports, light and dark: four flows passed.
- No API requests before opening the widget.
- Computed host CTA styles identical before/after widget injection.
- 132 BOQ lines rendered in the detail sheet; four package cards rendered.
- Escape close, automatic open, suppression while a host field is focused, local demo lead save and server-failure fallback passed.
- Zero console/page errors in the four main viewport flows.
- Formal CLS/LCP measurement, true-origin 7-day persistence after reload, and actual external WhatsApp navigation were not measured.

## Build size

- Initial loader: 6,036 bytes raw / 2,584 bytes gzip (budget: ≤6 KiB gzip).
- UI chunk: 70,219 bytes raw / 19,403 bytes gzip (budget: ≤90 KiB gzip).

This report is local acceptance evidence, not a production certification. Refer to `ENGINE-GAPS-WIDGET.md` for remaining release gates.


## Unified project integration addendum

The combined SKYPIEA + BENO root-package build and serverless API layout was checked by `tests/unified-project.test.cjs`. The test confirms the landing page embeds `/beno-chat.js`, the built `dist/` contains both widget files, the Vercel config includes `api/*.js` functions, and `/api/_data/.*` is guarded with a 404 route. The build and all 9 Node test suites pass in this source environment. A live Vercel/Supabase deployment remains unverified.
