-- CompCraft ML artifact storage setup.
-- Paste this into Supabase SQL Editor for an existing project.
-- It creates a public Storage bucket for model artifacts plus a small metadata table.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'compcraft-ml-artifacts',
  'compcraft-ml-artifacts',
  true,
  209715200,
  array['application/octet-stream', 'application/json', 'application/gzip', 'application/x-gzip']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read CompCraft ML artifacts" on storage.objects;
create policy "Public read CompCraft ML artifacts"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'compcraft-ml-artifacts');

drop policy if exists "Service role manages CompCraft ML artifacts" on storage.objects;
create policy "Service role manages CompCraft ML artifacts"
on storage.objects for all
to service_role
using (bucket_id = 'compcraft-ml-artifacts')
with check (bucket_id = 'compcraft-ml-artifacts');

create table if not exists public.ml_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_key text not null unique,
  storage_bucket text not null default 'compcraft-ml-artifacts',
  storage_path text not null,
  public_url text not null,
  content_type text not null,
  byte_size bigint not null,
  sha256 text not null,
  description text,
  is_active boolean not null default true,
  uploaded_at timestamptz default now()
);

grant select, insert, update, delete on table public.ml_artifacts to service_role;
grant select on table public.ml_artifacts to anon, authenticated;
alter table public.ml_artifacts disable row level security;
