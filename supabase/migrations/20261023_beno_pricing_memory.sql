-- BENO pricing-learning evidence ledger (no LLM, server-only).
-- Observations never publish prices. Only verified rows can influence confidence
-- and evidence-backed suggestions; an admin must still apply a suggestion to the
-- draft book and publish it explicitly.

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

alter table public.beno_pricing_feedback enable row level security;
revoke all on public.beno_pricing_feedback from public, anon, authenticated;
grant select, insert, update on public.beno_pricing_feedback to service_role;

comment on table public.beno_pricing_feedback is 'Server-only pricing evidence (quotes/corrections/outcomes). Observations are not published prices; verified evidence may inform admin-reviewed suggestions.';
