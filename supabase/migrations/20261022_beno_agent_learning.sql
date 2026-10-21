-- BENO agent continuous learning (no LLM).
-- 1) Verified lexicon additions: admin-adopted synonyms learned from unmatched
--    client messages. Merged into beno-nlu at request time (service-role only).
-- 2) Indexes for the existing supervisor review queries on unmatched_messages.

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

-- RLS: operators read via service role; no anon/authenticated route exists.
alter table public.beno_lexicon enable row level security;
