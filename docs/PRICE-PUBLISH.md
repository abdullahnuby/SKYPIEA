# Price Book Publish

1. Open the existing admin dashboard and export the current pricing data. `scripts/admin-price-export.js` is the small additive integration helper for a dedicated **تصدير ملف الأسعار (إصدار)** button; it deliberately does not replace the dashboard or overwrite its existing export.
2. Connect `makeExport()` to the admin's actual data source. The provided helper searches `window.BENO_ADMIN_STATE`, `window.BENO_STATE`, or `window.BENO_APP_STATE`; these names are integration hooks, not a claim that alpha.8 exposes them by default. If the panel uses another store, replace that one adapter with the real reference.
3. Save the JSON export outside the web root and run:

```bash
node scripts/publish-price-book.cjs ./beno-price-book-export.json
# only after reviewing the printed gap report and accepting the low-coverage publication decision:
node scripts/publish-price-book.cjs ./beno-price-book-export.json --force
```

Validation checks the presence of `prices[]`, names/units, numeric positive price values, low/average/high order, dates, and active-item coverage. It prints largest missing divisions and warns about national substitutes or unknown transport. Publication is rejected below `BENO_MIN_COVERAGE` unless `--force` is explicitly supplied.

Every publish creates `api/_data/price-book.vN.json` with a new `priceBookVersion`, and writes `PRICE-BOOK-PUBLISH-REPORT.json` with SHA-256. Published files are immutable: never edit a published version in place; commit and redeploy to make a new version active. The latest numeric version is selected by the server. The price book path must be blocked from direct static requests in deployment.

**Current baseline (2026-10-21):** `api/_data/price-book.v8.json` is the source catalog selected by the server. Historical `v1` remains archived and is not the active book. Run `npm run audit:prices` before building or reviewing a catalog. The compact operational core has 183 active rows (165 with numeric prices and 18 open gaps; 90.2% nominal coverage). Thirty-seven active core prices are stale or undated under the 90-day threshold. The 291 unreferenced January-bulletin variants are preserved in `api/_data/price-book-extended.v1.json` with default search disabled; they are not deleted, and must be linked to a BOQ/takeoff rule and re-reviewed before activation. Twelve duplicate/conflicting records remain inactive with canonical references for traceability. This catalog is not a verified current local supplier price list and is not production approval.
