# Security and Privacy

- Engine files, raw catalog and margin settings are server-side only; client bundle scan rejects selected secret/margin patterns.
- `vercel.json` blocks direct access to `/api/_data/*`; verify this on the real Vercel deployment after every routing change.
- The client writes user facts into `localStorage` inside `try/catch`, and asks for explicit lead-contact consent before sending name/phone. It does not persist personal details in widget storage.
- User text is added via `textContent`, not rendered as HTML. Print HTML escapes line content.
- `/api/lead` checks Egyptian phone pattern, required consent, minimum form duration and hidden honeypot. Error responses omit stack traces; server errors log a request ID and brief internal message, without the request body.
- Supabase service key, margin config and optional owner webhook are server-only environment variables.
- `supabase/schema.sql` enables RLS on user-contact data and has no permissive anon policies; writes should be done by server using service role.
- The server-side rate-limit path is wired to the `beno_consume_rate_limit` Supabase RPC when Supabase credentials are set and local demo mode is off; RPC errors fail closed. This connection has not been verified on the target Supabase/Vercel deployment. Local/demo mode or missing credentials uses a per-process fallback, not a globally consistent limit. Verify RPC permissions, behavior, and rate-limit-row retention/cleanup before public production traffic.
- `unmatched_messages` logging is disabled unless `BENO_LOG_UNMATCHED=1` and Supabase is configured. Before enabling, publish a clear privacy statement; message text is masked for phone numbers/emails and simple name-introduction patterns, but free-text anonymization cannot be guaranteed.
- No automatic learning occurs from unmatched messages. Review and curate examples manually.
- `/admin` is a public static shell only; data APIs require a signed HttpOnly, SameSite=Strict session, exact same-origin mutations, and server environment credentials. Admin credentials are never embedded in HTML/JS.
- Admin password attempts use the durable `admin` scope in `beno_consume_rate_limit` when Supabase is configured; apply the admin migration before production. Sessions expire after 8 hours.
- Draft price books and immutable publication snapshots are stored in private Supabase tables `beno_price_book_state` and `beno_price_book_versions`; RLS denies anon/authenticated access. Production must not use `BENO_LOCAL_DEMO=1`.
- `localStorage` only can be cleared by the visitor using the widget's clear-data control. Database leads must be removed through a documented operator process after the request is verified.

## Deployment checklist

[ ] Explicit CORS allowlist
[ ] Direct static access to price book returns 404
[ ] No API response contains any `margin*` field or raw price-book payload
[ ] No service-role key or raw catalog in client bundles
[ ] Supabase RLS enabled and anonymous reads/writes denied
[ ] Supabase RPC distributed rate limit verified on the real deployment; retention/cleanup configured
[ ] Admin session login, rate limiting, private price-book tables, and atomic publish RPC verified on Vercel/Supabase
[ ] Unique production BENO_ADMIN_PASSWORD and BENO_ADMIN_SESSION_SECRET set in Vercel; BENO_LOCAL_DEMO unset
[ ] Consent/privacy copy reviewed
[ ] Current local market prices and transport validated
[ ] Data deletion process tested
