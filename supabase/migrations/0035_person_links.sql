-- 0035 — Aristas de familia persona↔persona (person_links).
--
-- Modela vínculos familiares ENTRE personas (ej. Diana → su padre), que el
-- grafo dibuja como aristas de familia. Antes el grafo era una estrella
-- self→persona; esto agrega aristas persona↔persona. person_a_id = sujeto
-- (la ficha), person_b_id = el familiar. `kind` = parentesco (padre/madre/…).
--
-- Aditiva, idempotente, RLS por user_id. Ambos extremos referencian people
-- con ON DELETE CASCADE (borrar una persona limpia sus aristas).
--
-- (Número 0035: se deja margen tras 0030 para no colisionar con otra sesión
-- que pueda tomar 0031-0034.)
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase. El código cliente ya es
-- tolerante: si esta tabla no existe aún, el pull falla por-binding (se loguea
-- y sigue) sin romper el sync de people/relationships; los links no persisten
-- hasta correr esto.

create table if not exists public.person_links (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_a_id  text not null references public.people(id) on delete cascade,
  person_b_id  text not null references public.people(id) on delete cascade,
  kind         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_person_links_user_a
  on public.person_links (user_id, person_a_id);

-- Dedupe: un mismo vínculo (mismo parentesco) no se repite.
create unique index if not exists uniq_person_links
  on public.person_links (user_id, person_a_id, person_b_id, kind);

alter table public.person_links enable row level security;

drop policy if exists "select own person_links" on public.person_links;
create policy "select own person_links" on public.person_links
  for select using (auth.uid() = user_id);

drop policy if exists "insert own person_links" on public.person_links;
create policy "insert own person_links" on public.person_links
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own person_links" on public.person_links;
create policy "update own person_links" on public.person_links
  for update using (auth.uid() = user_id);

drop policy if exists "delete own person_links" on public.person_links;
create policy "delete own person_links" on public.person_links
  for delete using (auth.uid() = user_id);

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select policyname from pg_policies where tablename = 'person_links';
-- select * from public.person_links order by created_at desc limit 10;
