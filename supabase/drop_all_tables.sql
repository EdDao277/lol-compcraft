-- CompCraft destructive reset.
-- This deletes all CompCraft tables and all data in them.
-- Paste into Supabase SQL Editor only when you intentionally want a clean rebuild.

drop table if exists public.player_champions cascade;
drop table if exists public.players cascade;
drop table if exists public.champion_metadata cascade;
drop table if exists public.ml_artifacts cascade;
drop table if exists public.team_comp_signature_stats cascade;
drop table if exists public.champion_matchup_stats cascade;
drop table if exists public.champion_synergy_stats cascade;
drop table if exists public.champion_role_stats cascade;
drop table if exists public.champions cascade;
drop table if exists public.teams cascade;
