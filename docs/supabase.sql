-- Preparation ONLY. Not applied by Ecoscope and not a claim of cloud connection.
-- Owner reviews/applies in their Supabase SQL editor, then tests with two
-- different authenticated users. Never use a service-role key in browser code.
create extension if not exists postgis with schema extensions;

create table if not exists public.research_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  selection jsonb not null check (jsonb_typeof(selection) = 'object'),
  point extensions.geometry(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.research_selections enable row level security;
alter table public.research_selections force row level security;
revoke all on public.research_selections from anon;
grant select, insert, update, delete on public.research_selections to authenticated;
-- Re-applying these named policies is deliberately explicit/idempotent.
drop policy if exists research_owner_select on public.research_selections;
create policy research_owner_select on public.research_selections
for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists research_owner_insert on public.research_selections;
create policy research_owner_insert on public.research_selections
for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists research_owner_update on public.research_selections;
create policy research_owner_update on public.research_selections
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists research_owner_delete on public.research_selections;
create policy research_owner_delete on public.research_selections
for delete to authenticated using ((select auth.uid()) = user_id);
-- Cloud research synchronization and sign-in are NOT implemented/verified.
-- Do not add public read policies to bypass that missing integration.
