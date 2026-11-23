-- Smart Grid AI isolated persistence layer.
-- Review and apply only after confirming the target Supabase project.
-- This script does not touch public schema or existing application tables.

create schema if not exists spot_grid;
revoke all on schema spot_grid from public, anon, authenticated;
grant usage on schema spot_grid to service_role;

create table if not exists spot_grid.market_snapshots (
    id bigint generated always as identity primary key,
    exchange text not null,
    symbol text not null,
    timeframe text,
    observed_at timestamptz not null,
    payload jsonb not null,
    created_at timestamptz not null default now()
);
create index if not exists market_snapshots_symbol_time_idx
    on spot_grid.market_snapshots (exchange, symbol, observed_at desc);

create table if not exists spot_grid.news_events (
    id uuid primary key default gen_random_uuid(),
    source_key text not null,
    source_category text not null check (source_category in ('crypto_media','exchange_official','macro_calendar','social')),
    trust_tier text not null check (trust_tier in ('official','reputable','unverified')),
    canonical_url text,
    dedupe_key text not null unique,
    published_at timestamptz,
    fetched_at timestamptz not null default now(),
    symbols text[] not null default '{}',
    event_type text,
    sentiment_score numeric(6,5) check (sentiment_score between -1 and 1),
    summary text,
    content_hash text,
    payload jsonb not null default '{}'::jsonb
);
create index if not exists news_events_published_idx
    on spot_grid.news_events (published_at desc);
create index if not exists news_events_symbols_gin_idx
    on spot_grid.news_events using gin (symbols);

create table if not exists spot_grid.bot_signals (
    id uuid primary key default gen_random_uuid(),
    bot_key text not null,
    exchange text not null,
    symbol text not null,
    side text not null check (side in ('BUY','SELL','HOLD')),
    confidence numeric(6,5) not null check (confidence between 0 and 1),
    reason text not null,
    evidence jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    expires_at timestamptz
);
create index if not exists bot_signals_symbol_time_idx
    on spot_grid.bot_signals (exchange, symbol, created_at desc);

create table if not exists spot_grid.decisions (
    id uuid primary key default gen_random_uuid(),
    exchange text not null,
    symbol text not null,
    decision text not null check (decision in ('BUY','SELL','HOLD')),
    confidence numeric(6,5) not null check (confidence between 0 and 1),
    signal_ids uuid[] not null default '{}',
    model_versions jsonb not null default '{}'::jsonb,
    risk_allowed boolean not null default false,
    reason_codes text[] not null default '{}',
    created_at timestamptz not null default now()
);
create index if not exists decisions_symbol_time_idx
    on spot_grid.decisions (exchange, symbol, created_at desc);

create table if not exists spot_grid.portfolio_reservations (
    id uuid primary key default gen_random_uuid(),
    exchange text not null,
    asset text not null,
    strategy text not null,
    amount numeric(28,12) not null check (amount > 0),
    status text not null check (status in ('reserved','partially_consumed','released','consumed')),
    reference_key text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists portfolio_reservations_asset_status_idx
    on spot_grid.portfolio_reservations (exchange, asset, status);

create table if not exists spot_grid.order_intents (
    id uuid primary key default gen_random_uuid(),
    client_order_id text not null unique,
    exchange text not null,
    symbol text not null,
    side text not null check (side in ('BUY','SELL')),
    quantity numeric(28,12) not null check (quantity > 0),
    limit_price numeric(28,12) check (limit_price is null or limit_price > 0),
    strategy text not null,
    reservation_id uuid references spot_grid.portfolio_reservations(id),
    mode text not null default 'paper' check (mode = 'paper'),
    status text not null default 'created'
        check (status in ('created','open','partially_filled','filled','cancelled','rejected')),
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists order_intents_symbol_status_idx
    on spot_grid.order_intents (exchange, symbol, status);

create table if not exists spot_grid.trade_outcomes (
    id uuid primary key default gen_random_uuid(),
    order_intent_id uuid not null references spot_grid.order_intents(id),
    filled_quantity numeric(28,12) not null default 0,
    average_fill_price numeric(28,12),
    fees_quote numeric(28,12) not null default 0,
    estimated_slippage_quote numeric(28,12) not null default 0,
    realized_net_pnl_quote numeric(28,12),
    label text check (label in ('profitable','unprofitable','breakeven','incomplete')),
    horizon_seconds integer,
    closed_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists trade_outcomes_closed_idx
    on spot_grid.trade_outcomes (closed_at desc);

create table if not exists spot_grid.model_registry (
    id uuid primary key default gen_random_uuid(),
    model_name text not null,
    version text not null,
    status text not null check (status in ('candidate','approved','active','archived','rejected')),
    artifact_uri text,
    artifact_checksum text,
    feature_schema jsonb not null default '{}'::jsonb,
    metrics jsonb not null default '{}'::jsonb,
    train_start timestamptz,
    train_end timestamptz,
    evaluated_at timestamptz,
    manual_approval_reference text,
    created_at timestamptz not null default now(),
    unique (model_name, version)
);
create index if not exists model_registry_name_status_idx
    on spot_grid.model_registry (model_name, status);

create table if not exists spot_grid.training_runs (
    id uuid primary key default gen_random_uuid(),
    model_name text not null,
    candidate_version text not null,
    dataset_start timestamptz not null,
    dataset_end timestamptz not null,
    train_metrics jsonb not null default '{}'::jsonb,
    validation_metrics jsonb not null default '{}'::jsonb,
    test_metrics jsonb not null default '{}'::jsonb,
    walk_forward_metrics jsonb not null default '{}'::jsonb,
    leakage_check_passed boolean not null default false,
    paper_observations integer not null default 0,
    status text not null check (status in ('queued','running','evaluated','failed','rejected','awaiting_manual_approval')),
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now(),
    check (dataset_start < dataset_end)
);

create table if not exists spot_grid.risk_events (
    id uuid primary key default gen_random_uuid(),
    exchange text not null,
    symbol text,
    severity text not null check (severity in ('info','warning','critical')),
    reason_code text not null,
    context jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Defense in depth: no Data API access for anon/authenticated.
do $$
declare
    t record;
begin
    for t in
        select tablename
        from pg_tables
        where schemaname = 'spot_grid'
    loop
        execute format('alter table spot_grid.%I enable row level security', t.tablename);
        execute format('revoke all on table spot_grid.%I from public, anon, authenticated', t.tablename);
        execute format('grant all on table spot_grid.%I to service_role', t.tablename);
    end loop;
end $$;

grant usage, select on all sequences in schema spot_grid to service_role;
