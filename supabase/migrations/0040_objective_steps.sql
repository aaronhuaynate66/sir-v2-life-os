-- 0040 — Pasos/hitos accionables por objetivo (objective_steps).
--
-- Un objetivo (goals) deja de ser inerte: se descompone en PASOS concretos y
-- ordenados que llevan a cumplirlo. Cada paso pertenece a un objetivo
-- (objective_id → goals.id ON DELETE CASCADE: borrar el objetivo limpia sus
-- pasos) y a un usuario (user_id, RLS). El progreso del objetivo pasa a
-- calcularse del rollup de pasos hechos/total cuando hay pasos.
--
-- Aditiva, idempotente, RLS por user_id. Mismo patrón que el resto del store
-- (text id, índice por user_id+FK, 4 policies auth.uid()=user_id).
--
-- NOTA columna `sort_order` (no `order`): `order` es palabra reservada en SQL
-- y además un parámetro especial de PostgREST → la nombramos sort_order para
-- evitar ambigüedad en el upsert del sync engine.
--
-- (Número 0040: se deja margen tras 0035 para no colisionar con otra sesión
-- que pueda tomar 0036-0039.)
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase. El código cliente ya es
-- tolerante: si esta tabla no existe aún, el pull falla por-binding (se loguea
-- y sigue) sin romper el sync de goals; los pasos no persisten hasta correr
-- esto. El upsert de un paso huérfano (objetivo aún no en DB) lo rechaza la FK
-- y el engine reintenta (1s/4s/16s) cuando el objetivo aterriza.

create table if not exists public.objective_steps (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  objective_id text not null references public.goals(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  target_date  date,
  status       text not null default 'pendiente'
               check (status in ('pendiente', 'en_progreso', 'hecho')),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_objective_steps_user_objective
  on public.objective_steps (user_id, objective_id);

alter table public.objective_steps enable row level security;

drop policy if exists "select own objective_steps" on public.objective_steps;
create policy "select own objective_steps" on public.objective_steps
  for select using (auth.uid() = user_id);

drop policy if exists "insert own objective_steps" on public.objective_steps;
create policy "insert own objective_steps" on public.objective_steps
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own objective_steps" on public.objective_steps;
create policy "update own objective_steps" on public.objective_steps
  for update using (auth.uid() = user_id);

drop policy if exists "delete own objective_steps" on public.objective_steps;
create policy "delete own objective_steps" on public.objective_steps
  for delete using (auth.uid() = user_id);

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='objective_steps';
-- select policyname from pg_policies where tablename = 'objective_steps' order by policyname;
-- select * from public.objective_steps order by objective_id, sort_order limit 20;
