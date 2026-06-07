-- CompCraft network stats repair script.
-- Run this in Supabase SQL Editor if stats uploads fail with:
-- - missing ON CONFLICT constraint errors
-- - permission denied for service_role

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.champions to service_role;
grant select, insert, update, delete on table public.champion_role_stats to service_role;
grant select, insert, update, delete on table public.champion_synergy_stats to service_role;
grant select, insert, update, delete on table public.champion_matchup_stats to service_role;
grant select, insert, update, delete on table public.team_comp_signature_stats to service_role;

alter table public.champion_role_stats drop constraint if exists champion_role_stats_network_unique;
alter table public.champion_role_stats
  add constraint champion_role_stats_network_unique
  unique (patch, region, queue_id, source_type, champion_id, role);

alter table public.champion_synergy_stats add column if not exists confidence numeric not null default 0;
alter table public.champion_synergy_stats add column if not exists queue_id int;
alter table public.champion_synergy_stats add column if not exists source_type text;
alter table public.champion_synergy_stats alter column queue drop not null;
alter table public.champion_synergy_stats alter column source drop not null;
update public.champion_synergy_stats
set source_type = coalesce(source_type, source),
    source = coalesce(source, source_type)
where source_type is null or source is null;

alter table public.champion_synergy_stats drop constraint if exists champion_synergy_stats_source_unique;
alter table public.champion_synergy_stats drop constraint if exists champion_synergy_stats_patch_region_queue_tier_champion_id_role_ally_champion_id_ally_role_key;
alter table public.champion_synergy_stats drop constraint if exists champion_synergy_stats_network_unique;
alter table public.champion_synergy_stats
  add constraint champion_synergy_stats_network_unique
  unique (patch, region, queue_id, source_type, champion_id, role, ally_champion_id, ally_role);

alter table public.champion_matchup_stats drop constraint if exists champion_matchup_stats_network_unique;
alter table public.champion_matchup_stats
  add constraint champion_matchup_stats_network_unique
  unique (patch, region, queue_id, source_type, champion_id, role, enemy_champion_id, enemy_role, matchup_type);

alter table public.team_comp_signature_stats drop constraint if exists team_comp_signature_stats_network_unique;
alter table public.team_comp_signature_stats
  add constraint team_comp_signature_stats_network_unique
  unique (patch, region, queue_id, source_type, signature);

alter table public.champions disable row level security;
alter table public.champion_role_stats disable row level security;
alter table public.champion_synergy_stats disable row level security;
alter table public.champion_matchup_stats disable row level security;
alter table public.team_comp_signature_stats disable row level security;
