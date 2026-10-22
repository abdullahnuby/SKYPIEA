# Security and Privacy

- Engine files, raw catalog and margin settings are server-side only; client bundle scan rejects selected secret/margin patterns.
- `vercel.json` blocks direct access to `/api/_data/*`; verify this on the real Vercel deployment after every routing change.
- The client writes user facts into `localStorage` inside `try/catch`, and asks for explicit lead-contact consent before sending name/phone. It does not persist personal details in widget storage.
- User text is added via `textContent`, not rendered as HTML. Print HTML escapes line content.
- `/api/lead` checks Egyptian phone pattern, required consent, minimum form duration and hidden honeypot. Error responses omit stack traces; server errors log a request ID and brief internal message, without the request body.
- Neon Postgres credentials (`DATABASE_URL`), margin config and optional owner webhook are server-only environment variables.
- `neon/schema.sql` keeps all tables in the `public` schema behind a private, server-only connection string. There is no browser-facing data API: the app is the only client and connects with the project role, so no anon/authenticated policies exist to misconfigure.
- The server-side rate-limit path calls the `beno_consume_rate_limit` Postgres function when `DATABASE_URL` is set and local demo mode is off; database errors fail closed. The end-to-end run in `npm run test:neon` verifies the function against the real branch. Local/demo mode or a missing `DATABASE_URL` uses a per-process fallback, not a globally consistent limit. Configure retention/cleanup for `beno_rate_limits` before public production traffic.
- `unmatched_messages` logging is disabled unless `BENO_LOG_UNMATCHED=1` and Neon is configured. Before enabling, publish a clear privacy statement; message text is masked for phone numbers/emails and simple name-introduction patterns, but free-text anonymization cannot be guaranteed.
- No automatic learning occurs from unmatched messages. Review and curate examples manually.
- `/admin` is a public static shell only; data APIs require a signed HttpOnly, SameSite=Strict session, exact same-origin mutations, and server environment credentials. Admin credentials are never embedded in HTML/JS.
- Admin password attempts use the durable `admin` scope in `beno_consume_rate_limit` when Neon is configured. Sessions expire after 8 hours.
- Draft price books and immutable publication snapshots are stored in the private Neon tables `beno_price_book_state` and `beno_price_book_versions`, reachable only through the server connection string. Production must not use `BENO_LOCAL_DEMO=1`.
- `localStorage` only can be cleared by the visitor using the widget's clear-data control. Database leads must be removed through a documented operator process after the request is verified.

## Deployment checklist

[ ] Explicit CORS allowlist
[ ] Direct static access to price book returns 404
[ ] No API response contains any `margin*` field or raw price-book payload
[ ] No `DATABASE_URL` or raw catalog in client bundles
[ ] Neon branch reachable only through server-side `DATABASE_URL` (no browser data API)
[ ] Postgres rate-limit function verified on the real deployment (`npm run db:check`, `npm run test:neon`); retention/cleanup configured
[ ] Admin session login, rate limiting, private price-book tables, and atomic publish function verified on Vercel/Neon
[ ] Unique production BENO_ADMIN_PASSWORD and BENO_ADMIN_SESSION_SECRET set in Vercel; BENO_LOCAL_DEMO unset
[ ] Consent/privacy copy reviewed
[ ] Current local market prices and transport validated
[ ] Data deletion process tested
