create table if not exists champion_synergy_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue text not null,
  tier text,
  champion_id text references champions(id) on delete cascade,
  role text not null,
  ally_champion_id text references champions(id) on delete cascade,
  ally_role text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  delta_vs_average numeric,
  source text not null,
  updated_at timestamptz default now(),
  unique(patch, region, queue, tier, champion_id, role, ally_champion_id, ally_role)
);

grant select, insert, update, delete on table champion_synergy_stats to service_role;
