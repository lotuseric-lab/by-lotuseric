-- Mirrors Supabase migration 20261125113301_add_spot_grid_paper_runtime.
create table if not exists spot_grid.paper_balances (
    exchange text not null check (exchange in ('okx','binance','bybit')),
    asset text not null,
    free_amount numeric(30,12) not null default 0 check (free_amount >= 0),
    updated_at timestamptz not null default now(),
    primary key (exchange, asset)
);
create table if not exists spot_grid.grid_sessions (
    id uuid primary key default gen_random_uuid(),
    exchange text not null check (exchange in ('okx','binance','bybit')),
    symbol text not null check (symbol ~ '^[A-Z0-9]+/USDT$'),
    timeframe text not null,
    status text not null default 'PREVIEW' check (status in ('PREVIEW','PAPER_READY','PAUSED','STOPPED','REJECTED')),
    budget_usdt numeric(30,12) not null check (budget_usdt > 0),
    grid_count integer not null check (grid_count between 4 and 30),
    lower_price numeric(30,12),
    upper_price numeric(30,12),
    reference_price numeric(30,12),
    plan jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists grid_sessions_exchange_status_created_idx
    on spot_grid.grid_sessions(exchange, status, created_at desc);
create index if not exists paper_balances_exchange_asset_idx
    on spot_grid.paper_balances(exchange, asset);
alter table spot_grid.paper_balances enable row level security;
alter table spot_grid.grid_sessions enable row level security;
revoke all on spot_grid.paper_balances from anon, authenticated;
revoke all on spot_grid.grid_sessions from anon, authenticated;
grant select, insert, update, delete on spot_grid.paper_balances to service_role;
grant select, insert, update, delete on spot_grid.grid_sessions to service_role;
grant usage on schema spot_grid to service_role;
