-- One-time migration for an existing BENO Supabase project.
-- Safe to run after the original schema; creates private price-book state, release history, and atomic publish RPC.


-- Allow a separate durable, hashed login-attempt bucket.
create or replace function public.beno_consume_rate_limit(
  p_key text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_hits integer;
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
revoke execute on function public.beno_consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.beno_consume_rate_limit(text,text,integer,integer) to service_role;

-- BENO price administration: private persistent draft, active book, and immutable releases.
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

alter table public.beno_price_book_state enable row level security;
alter table public.beno_price_book_versions enable row level security;
revoke all on public.beno_price_book_state, public.beno_price_book_versions from public, anon, authenticated;
grant select, insert, update on public.beno_price_book_state to service_role;
grant select, insert on public.beno_price_book_versions to service_role;

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
revoke all on function public.beno_publish_price_book(jsonb,numeric,text) from public, anon, authenticated;
grant execute on function public.beno_publish_price_book(jsonb,numeric,text) to service_role;

comment on table public.beno_price_book_state is 'Server-only current BENO draft and published price books. Never expose the service-role key or table to clients.';
comment on table public.beno_price_book_versions is 'Server-only immutable snapshots of approved BENO price-book releases.';
