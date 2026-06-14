-- 0077 — Entidad EMPRESA/holding como info guardable (escalón 3, graduación).
--
-- Hasta hoy la ficha /empresas/[slug] era 100% computada (gente + registro).
-- No había dónde GUARDAR información de la empresa. Esta tabla la convierte en
-- entidad: el usuario (o un futuro scrape/LLM) carga descripción, web, notas,
-- ancladas al slug de la organización. Es CONTEXTO, no una persona.
--
-- Aditiva, RLS por user_id, idempotente. Una fila por (user_id, org_slug).

create table if not exists public.org_profiles (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_slug     text not null,
  name         text,
  website      text,
  description  text,
  sectors      text[] not null default '{}',
  notes        text,
  source       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists uniq_org_profiles_user_slug
  on public.org_profiles (user_id, org_slug);

alter table public.org_profiles enable row level security;

drop policy if exists "select own org_profiles" on public.org_profiles;
create policy "select own org_profiles" on public.org_profiles
  for select using (auth.uid() = user_id);
drop policy if exists "insert own org_profiles" on public.org_profiles;
create policy "insert own org_profiles" on public.org_profiles
  for insert with check (auth.uid() = user_id);
drop policy if exists "update own org_profiles" on public.org_profiles;
create policy "update own org_profiles" on public.org_profiles
  for update using (auth.uid() = user_id);
drop policy if exists "delete own org_profiles" on public.org_profiles;
create policy "delete own org_profiles" on public.org_profiles
  for delete using (auth.uid() = user_id);
