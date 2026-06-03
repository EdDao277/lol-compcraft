-- CompCraft complete Supabase setup.
-- Paste this into the Supabase SQL Editor after creating a fresh project,
-- or after running drop_all_tables.sql.

create extension if not exists pgcrypto;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  primary_role text not null,
  created_at timestamptz default now()
);

create table if not exists champions (
  id text primary key,
  riot_key int,
  name text not null,
  title text,
  image_url text,
  riot_tags text[],
  created_at timestamptz default now()
);

create table if not exists champion_metadata (
  champion_id text primary key references champions(id) on delete cascade,
  roles text[],
  damage_type text,
  comp_tags text[],
  utility_tags text[],
  lane_tags text[],
  threat_tags text[],
  weakness_tags text[],
  counter_tags text[],
  blind_pick_score int default 5,
  flex_value int default 1,
  early_pick_value int default 5,
  late_pick_value int default 5,
  synergies text[],
  counters text[],
  countered_by text[],
  notes text
);

create table if not exists player_champions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  champion_id text references champions(id) on delete cascade,
  role text not null,
  comfort_score int default 5,
  created_at timestamptz default now()
);

create table if not exists draft_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  side text not null,
  mode text default 'manual',
  result text,
  created_at timestamptz default now()
);

create table if not exists draft_actions (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid references draft_sessions(id) on delete cascade,
  team text not null,
  action_type text not null,
  champion_id text references champions(id),
  role text,
  assigned_player_slot int,
  action_order int not null,
  created_at timestamptz default now()
);

create table if not exists enemy_pool_champions (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid references draft_sessions(id) on delete cascade,
  role text,
  champion_id text references champions(id),
  created_at timestamptz default now()
);

create table if not exists recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid references draft_sessions(id) on delete cascade,
  recommendation_type text not null,
  champion_id text references champions(id),
  player_id uuid references players(id),
  score numeric,
  was_selected boolean default false,
  reasons text[],
  risks text[],
  created_at timestamptz default now()
);

create table if not exists champion_role_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue_id int not null,
  source_type text not null,
  champion_id text references champions(id) on delete cascade,
  role text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  confidence numeric not null default 0,
  updated_at timestamptz default now(),
  unique (patch, region, queue_id, source_type, champion_id, role)
);

create table if not exists champion_synergy_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue text,
  queue_id int,
  tier text,
  champion_id text references champions(id) on delete cascade,
  role text not null,
  ally_champion_id text references champions(id) on delete cascade,
  ally_role text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  delta_vs_average numeric,
  confidence numeric not null default 0,
  source text,
  source_type text,
  updated_at timestamptz default now()
);

alter table public.champion_synergy_stats add column if not exists confidence numeric not null default 0;
alter table public.champion_synergy_stats add column if not exists queue_id int;
alter table public.champion_synergy_stats add column if not exists source_type text;
alter table public.champion_synergy_stats alter column queue drop not null;
alter table public.champion_synergy_stats alter column source drop not null;
alter table public.champion_synergy_stats drop constraint if exists champion_synergy_stats_source_unique;
alter table public.champion_synergy_stats drop constraint if exists champion_synergy_stats_patch_region_queue_tier_champion_id_role_ally_champion_id_ally_role_key;
alter table public.champion_synergy_stats drop constraint if exists champion_synergy_stats_network_unique;
alter table public.champion_synergy_stats
  add constraint champion_synergy_stats_network_unique
  unique (patch, region, queue_id, source_type, champion_id, role, ally_champion_id, ally_role);

create table if not exists champion_matchup_stats (
  id uuid primary key default gen_random_uuid(),
  patch text not null,
  region text not null,
  queue_id int not null,
  source_type text not null,
  champion_id text references champions(id) on delete cascade,
  role text not null,
  enemy_champion_id text references champions(id) on delete cascade,
  enemy_role text not null,
  matchup_type text not null,
  games int not null,
  wins int not null,
  win_rate numeric not null,
  delta_vs_baseline numeric,
  confidence numeric not null default 0,
  updated_at timestamptz default now(),
  unique (patch, region, queue_id, source_type, champion_id, role, enemy_champion_id, enemy_role, matchup_type)
);

create table if not exists team_comp_signature_stats (
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
  unique (patch, region, queue_id, source_type, signature)
);

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Development-only permissions for the current no-auth frontend.
-- Tighten this before publishing a shared/public production app.
grant usage on schema public to anon, authenticated;

grant select on table public.champions to anon, authenticated;
grant select on table public.champion_metadata to anon, authenticated;
grant select on table public.champion_role_stats to anon, authenticated;
grant select on table public.champion_synergy_stats to anon, authenticated;
grant select on table public.champion_matchup_stats to anon, authenticated;
grant select on table public.team_comp_signature_stats to anon, authenticated;

grant select, insert, update, delete on table public.teams to anon, authenticated;
grant select, insert, update, delete on table public.players to anon, authenticated;
grant select, insert, update, delete on table public.player_champions to anon, authenticated;

alter table public.teams disable row level security;
alter table public.players disable row level security;
alter table public.player_champions disable row level security;
alter table public.champions disable row level security;
alter table public.champion_metadata disable row level security;
alter table public.champion_role_stats disable row level security;
alter table public.champion_synergy_stats disable row level security;
alter table public.champion_matchup_stats disable row level security;
alter table public.team_comp_signature_stats disable row level security;
