-- Development-only permissions for the current no-auth frontend.
-- Use this while CompCraft has no Supabase Auth. Tighten these policies before production.

grant usage on schema public to anon, authenticated;

grant select on table public.champions to anon, authenticated;
grant select on table public.champion_synergy_stats to anon, authenticated;

grant select, insert, update, delete on table public.teams to anon, authenticated;
grant select, insert, update, delete on table public.players to anon, authenticated;
grant select, insert, update, delete on table public.player_champions to anon, authenticated;

alter table public.teams disable row level security;
alter table public.players disable row level security;
alter table public.player_champions disable row level security;
alter table public.champions disable row level security;
alter table public.champion_synergy_stats disable row level security;
