# API Contract

All payloads are JSON. The browser receives a formatted view-model, never the raw engine result or catalog. APIs accept `POST` and `OPTIONS`, enforce a size limit, configured-origin CORS policy, rate limiting, and errors without stack traces. Configure `ALLOWED_ORIGINS` to an explicit comma-separated origin list.

## `POST /api/tool`

```json
{"tool":"estimate.run","state":{"service":"building","type":"residential","area":160,"floors":3,"pack":"medium","scope":"turnkey"},"args":{},"sessionId":"random-session-id"}
```

Allowed tools: `estimate.run`, `package.compare`, `boq.explain`, `price-catalog.search`, `resource.takeoff`, `price-catalog.audit`, `scenario.evaluate`, `project.assumptions`, `conversation.extract`.

Top-level keys: `tool`, `state`, `args`, `sessionId`. Unknown keys in request, project state, and tool arguments are rejected. Area is constrained to 20–5000 m², floors to 1–40, room and bathroom count to 1–8, and units per floor to 1–30. Tool-specific `args` are validated.

A successful estimate response includes `estimateId`, `priceBookVersion`, `estimate`, and limited workflow progress. The estimate includes formatted prices, coverage, ranges, sanitized line details, assumptions and gaps. If coverage is below `BENO_MIN_COVERAGE`, the main amount is `null` and the label explains that prices need completing. Price data source/date/status may be shown, but no raw price-book payload or margin percentage is returned.

`boq.explain` takes `{ "code": "..." }`; `price-catalog.search` takes `{ "query": "..." }`; `package.compare` takes optional `{ "packages": ["economic","semi","medium","luxury"] }`; `scenario.evaluate` takes `{ "changes": { ... }, "approve": false }`. Scenario evaluation is hypothetical; `approve` does not modify the saved project unless client-side interaction separately applies the change. `conversation.extract` takes `{ "message": "...", "pending": "area" }`.

## `POST /api/lead`

```json
{"name":"اسم العميل","phone":"01012345678","consent":true,"estimateId":"uuid","projectFacts":{"coveragePercent":48},"website":"","startedAt":1790000000000}
```

Requires name, valid Egyptian mobile, explicit `consent:true`, estimate reference and project summary. Hidden `website` is a honeypot; `startedAt` must be at least 2.5 seconds old. Success returns a reference. The browser then opens `wa.me` with an explicit summary. Production storage requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; local mode keeps entries in memory only. Do not expose service-role keys through `NEXT_PUBLIC_*` or `data-*`.

## Error shape

```json
{"ok":false,"error":"رسالة قصيرة","requestId":"..."}
```

## Operational caveat

When `SUPABASE_URL` and a server-side Supabase key are configured, and local-demo mode is off, the handlers call the `beno_consume_rate_limit` RPC and fail closed if that RPC errors. The wiring and SQL function are included, but the RPC has not been verified against the target deployed Supabase project. With credentials absent, or with `BENO_LOCAL_DEMO=1`, the fallback limiter is per Node process and is not globally consistent across Vercel serverless instances. Verify the RPC, permissions, retention/cleanup, and observed behavior on the deployed environment before public production traffic.
