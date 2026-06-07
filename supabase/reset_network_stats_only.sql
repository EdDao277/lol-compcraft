-- Drops and recreates only generated crawl/network stat tables.
-- This is more reliable than TRUNCATE + VACUUM FULL on Supabase free projects
-- because it immediately removes oversized table/index storage.

drop table if exists public.team_comp_signature_stats cascade;
drop table if exists public.champion_matchup_stats cascade;
drop table if exists public.champion_synergy_stats cascade;
drop table if exists public.champion_role_stats cascade;

create table public.champion_role_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue_id int not null,
  source_type text not null,
  champion_id text references public.champions(id) on delete cascade,
  role text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  confidence numeric not null default 0,
  updated_at timestamptz default now(),
  constraint champion_role_stats_network_unique unique (patch, region, queue_id, source_type, champion_id, role)
);

create table public.champion_synergy_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue text,
  queue_id int,
  tier text,
  champion_id text references public.champions(id) on delete cascade,
  role text not null,
  ally_champion_id text references public.champions(id) on delete cascade,
  ally_role text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  delta_vs_average numeric,
  confidence numeric not null default 0,
  source text,
  source_type text,
  updated_at timestamptz default now(),
  constraint champion_synergy_stats_network_unique unique (patch, region, queue_id, source_type, champion_id, role, ally_champion_id, ally_role)
);

create table public.champion_matchup_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue_id int not null,
  source_type text not null,
  champion_id text references public.champions(id) on delete cascade,
  role text not null,
  enemy_champion_id text references public.champions(id) on delete cascade,
  enemy_role text not null,
  matchup_type text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  delta_vs_baseline numeric,
  confidence numeric not null default 0,
  updated_at timestamptz default now(),
  constraint champion_matchup_stats_network_unique unique (patch, region, queue_id, source_type, champion_id, role, enemy_champion_id, enemy_role, matchup_type)
);

create table public.team_comp_signature_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue_id int not null,
  source_type text not null,
  signature text not null,
  has_frontline boolean not null default false,
  has_engage boolean not null default false,
  has_hard_engage boolean not null default false,
  has_peel boolean not null default false,
  has_disengage boolean not null default false,
  has_ap boolean not null default false,
  has_ad boolean not null default false,
  has_mixed_damage boolean not null default false,
  has_scaling boolean not null default false,
  has_poke boolean not null default false,
  has_dive boolean not null default false,
  has_pick boolean not null default false,
  has_waveclear boolean not null default false,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  confidence numeric not null default 0,
  updated_at timestamptz default now(),
  constraint team_comp_signature_stats_network_unique unique (patch, region, queue_id, source_type, signature)
);

grant select, insert, update, delete on table public.champion_role_stats to service_role;
grant select, insert, update, delete on table public.champion_synergy_stats to service_role;
grant select, insert, update, delete on table public.champion_matchup_stats to service_role;
grant select, insert, update, delete on table public.team_comp_signature_stats to service_role;

grant select on table public.champion_role_stats to anon, authenticated;
grant select on table public.champion_synergy_stats to anon, authenticated;
grant select on table public.champion_matchup_stats to anon, authenticated;
grant select on table public.team_comp_signature_stats to anon, authenticated;

alter table public.champion_role_stats disable row level security;
alter table public.champion_synergy_stats disable row level security;
alter table public.champion_matchup_stats disable row level security;
alter table public.team_comp_signature_stats disable row level security;
