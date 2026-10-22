-- SKYPIEA + BENO — Neon Postgres schema.
--
-- Apply with: npm run db:schema   (uses DATABASE_URL from .env.local)
--
-- This is the Neon port of supabase/schema.sql + the two learning migrations.
-- Supabase-specific policies/roles are dropped: Neon has no PostgREST and the
-- app is the only client, connecting server-side with the project role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Leads submitted from the BENO chat widget (explicit consent only)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('BENO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (phone ~ '^(\+20|0020|0)?1[0125][0-9]{8}$'),
  consent boolean not null check (consent = true),
  estimate_id text not null,
  project_facts jsonb not null default '{}'::jsonb,
  source text not null default 'beno-chat-widget',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists leads_created_at_idx on public.leads(created_at desc);

-- ---------------------------------------------------------------------------
-- Optional immutable sanitized estimate snapshots (never margin fields)
-- ---------------------------------------------------------------------------
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  estimate_id text not null unique,
  price_book_version text not null,
  project_facts jsonb not null,
  sanitized_view_model jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Opt-in operational review queue for messages BENO could not parse
-- ---------------------------------------------------------------------------
create table if not exists public.unmatched_messages (
  id uuid primary key default gen_random_uuid(),
  normalized_text text not null check (char_length(normalized_text) <= 2000),
  text_hash text not null,
  intent text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text
);
create index if not exists unmatched_messages_created_at_idx on public.unmatched_messages(created_at desc);

-- ---------------------------------------------------------------------------
-- Verified lexicon additions adopted by an admin (continuous learning)
-- ---------------------------------------------------------------------------
create table if not exists public.beno_lexicon (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('intents','negations','slotFeatures','packageKeywords','scopeKeywords','modelHints','places','materials')),
  key text not null default '',
  value text not null check (char_length(value) between 2 and 80),
  verified boolean not null default false,
  source text not null default 'admin' check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists beno_lexicon_verified_idx on public.beno_lexicon (verified, created_at desc);

-- ---------------------------------------------------------------------------
-- Durable rate-limit buckets (the app sends only a SHA-256 key)
-- ---------------------------------------------------------------------------
create table if not exists public.beno_rate_limits (
  bucket_key text not null,
  scope text not null,
  window_start timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket_key, scope)
);

create or replace function public.beno_consume_rate_limit(
  p_key text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_hits integer;
begin
  if p_key is null or length(p_key) <> 64 or p_scope not in ('tool','lead','admin')
     or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit arguments';
  end if;
  insert into public.beno_rate_limits(bucket_key, scope, window_start, hits)
  values (p_key, p_scope, now(), 1)
  on conflict (bucket_key, scope) do update
    set window_start = case
          when public.beno_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) then now()
          else public.beno_rate_limits.window_start end,
        hits = case
          when public.beno_rate_limits.window_start <= now() - make_interval(secs => p_window_seconds) then 1
          else public.beno_rate_limits.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- BENO price administration: private draft, active book, immutable releases
-- ---------------------------------------------------------------------------
create table if not exists public.beno_price_book_state (
  id text primary key check (id = 'current'),
  draft_book jsonb not null,
  published_book jsonb not null,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'system',
  published_at timestamptz not null default now(),
  published_by text not null default 'system'
);

create table if not exists public.beno_price_book_versions (
  version text primary key,
  price_book jsonb not null,
  coverage_percent numeric not null check (coverage_percent >= 0 and coverage_percent <= 100),
  active_items integer not null check (active_items >= 0),
  priced_items integer not null check (priced_items >= 0 and priced_items <= active_items),
  published_by text not null,
  published_at timestamptz not null default now()
);
create index if not exists beno_price_book_versions_published_at_idx on public.beno_price_book_versions(published_at desc);

create or replace function public.beno_publish_price_book(
  p_book jsonb,
  p_coverage numeric,
  p_actor text default 'admin'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_current public.beno_price_book_state%rowtype;
  v_next bigint;
  v_version text;
  v_now timestamptz := now();
  v_book jsonb;
  v_active integer;
  v_priced integer;
begin
  if p_book is null or jsonb_typeof(p_book) <> 'object' or jsonb_typeof(p_book->'prices') <> 'array'
     or p_coverage is null or p_coverage < 0 or p_coverage > 100 then
    raise exception 'invalid price book publish payload';
  end if;
  select * into v_current from public.beno_price_book_state where id = 'current' for update;
  if not found then raise exception 'price book state is not initialized'; end if;
  v_next := v_current.version + 1;
  v_version := 'v' || v_next::text;
  v_book := jsonb_set(p_book, '{priceBookVersion}', to_jsonb(v_version), true);
  v_book := jsonb_set(v_book, '{version}', to_jsonb(v_version), true);
  v_book := jsonb_set(v_book, '{publishedAt}', to_jsonb(v_now::text), true);
  v_active := (select count(*) from jsonb_array_elements(v_book->'prices') as items(item) where coalesce((item->>'active')::boolean, true));
  v_priced := (select count(*) from jsonb_array_elements(v_book->'prices') as items(item) where coalesce((item->>'active')::boolean, true) and coalesce(item->>'status','missing') <> 'missing' and nullif(item->>'avg','') is not null and (item->>'avg')::numeric > 0);
  update public.beno_price_book_state
     set draft_book = v_book, published_book = v_book, version = v_next,
         updated_at = v_now, updated_by = left(coalesce(p_actor,'admin'),100),
         published_at = v_now, published_by = left(coalesce(p_actor,'admin'),100)
   where id = 'current';
  insert into public.beno_price_book_versions(version, price_book, coverage_percent, active_items, priced_items, published_by, published_at)
  values (v_version, v_book, round(p_coverage,1), v_active, v_priced, left(coalesce(p_actor,'admin'),100), v_now);
  return jsonb_build_object('version',v_version,'published_at',v_now,'active_items',v_active,'priced_items',v_priced,'coverage_percent',round(p_coverage,1));
end;
$$;

-- ---------------------------------------------------------------------------
-- Pricing-learning evidence ledger (observations never publish prices)
-- ---------------------------------------------------------------------------
create table if not exists public.beno_pricing_feedback (
  id uuid primary key default gen_random_uuid(),
  price_id text not null check (char_length(price_id) between 1 and 60),
  price_name text not null default '',
  kind text not null check (kind in ('quote', 'correction', 'confirmation', 'outcome')),
  value numeric check (value is null or value > 0),
  low numeric check (low is null or low > 0),
  high numeric check (high is null or high > 0),
  unit text check (unit is null or char_length(unit) <= 40),
  observed_at date not null default current_date,
  source text not null check (char_length(source) between 1 and 180),
  source_type text not null default 'admin' check (source_type in ('admin', 'supplier', 'market', 'customer', 'chat', 'system')),
  verified boolean not null default false,
  note text not null default '' check (char_length(note) <= 300),
  estimate_id text not null default '' check (char_length(estimate_id) <= 100),
  outcome text not null default '' check (outcome in ('', 'accepted', 'rejected', 'negotiated', 'unknown')),
  actor text not null default 'system' check (char_length(actor) <= 100),
  created_at timestamptz not null default now(),
  check (low is null or high is null or low <= high),
  check (low is null or value is null or low <= value),
  check (high is null or value is null or value <= high)
);
create index if not exists beno_pricing_feedback_price_idx on public.beno_pricing_feedback (price_id, observed_at desc);
create index if not exists beno_pricing_feedback_verified_idx on public.beno_pricing_feedback (verified, observed_at desc);
create index if not exists beno_pricing_feedback_created_idx on public.beno_pricing_feedback (created_at desc);

comment on table public.leads is 'Contact information submitted with explicit consent; server-side access only.';
comment on table public.quotes is 'Optional immutable sanitized estimate snapshots. Never store margin fields here.';
comment on table public.unmatched_messages is 'Opt-in operational review queue; raw PII should not be stored.';
comment on table public.beno_rate_limits is 'Distributed IP/session throttling buckets keyed by SHA-256.';
comment on table public.beno_price_book_state is 'Server-only current BENO draft and published price books.';
comment on table public.beno_price_book_versions is 'Server-only immutable snapshots of approved BENO price-book releases.';
comment on table public.beno_pricing_feedback is 'Server-only pricing evidence. Observations are not published prices.';
