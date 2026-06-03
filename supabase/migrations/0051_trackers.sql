-- 0051 — Seguimiento / Trackers (trackers + tracker_points).
--
-- Un primitivo nuevo: un TRACKER monitorea en el tiempo una MÉTRICA EXTERNA
-- (un número que no vive en SIR — el precio de un vuelo, el saldo de una cuenta
-- ajena, los días que faltan para un torneo) y ALERTA cuando se cumple una
-- condición. Se engancha a un item del plan: a un objetivo (objective_id) O a
-- un paso/KR/tarea (objective_step_id). Caso disparador: seguir el precio del
-- vuelo Lima→Dammam para el objetivo "Ganar el Mundial de Bomberos".
--
-- Dos tablas:
--   - trackers       : la definición + el último valor (denormalizado para
--                      mostrar el resumen sin leer toda la serie) + la condición.
--   - tracker_points : la SERIE temporal (un punto por lectura). El último punto
--                      es la fuente de verdad de current_value; lo denormalizamos
--                      en trackers para el resumen compacto.
--
-- ADITIVA, IDEMPOTENTE, RLS por user_id (mismo patrón que objective_steps 0040:
-- text id, índices por user_id+FK, 4 policies auth.uid()=user_id).
--
-- FKs: objective_id → goals(id) ON DELETE CASCADE, objective_step_id →
-- objective_steps(id) ON DELETE CASCADE. Ambas nullable: un tracker cuelga de
-- UNO de los dos (lo valida la app, no forzamos CHECK para tolerar edición).
-- tracker_points.tracker_id → trackers(id) ON DELETE CASCADE: borrar el tracker
-- limpia su serie.
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase. El código cliente es
-- tolerante: si estas tablas no existen aún, el pull falla por-binding (se
-- loguea y sigue) sin romper el resto del sync; los trackers no persisten hasta
-- correr esto. El email/cron (fail-open) no manda nada si las tablas faltan.
--
-- (Número 0051: sigue a 0050_objective_steps_jira.)

-- ─── trackers ──────────────────────────────────────────────────────
create table if not exists public.trackers (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  -- Enganche: uno de los dos (objetivo o paso). Ambos nullable.
  objective_id       text references public.goals(id) on delete cascade,
  objective_step_id  text references public.objective_steps(id) on delete cascade,
  label              text not null,
  unit               text not null default '',
  -- Último valor (denormalizado del último tracker_point, para el resumen).
  current_value      numeric,
  current_value_date date,
  -- Condición/umbral. 'lte'/'gte' comparan current_value contra condition_value.
  -- 'days_until_lt' compara (condition_date - hoy) en días contra condition_value.
  condition_kind     text not null default 'lte'
                     check (condition_kind in ('lte', 'gte', 'days_until_lt')),
  condition_value    numeric not null default 0,
  condition_date     date,
  -- Si la última lectura es más vieja que esto, el tracker está "viejo" (stale).
  cadence_days       integer,
  last_updated       timestamptz,
  -- Idempotencia del email: qué alerta se notificó por última vez y cuándo, para
  -- no re-mandar el mismo aviso en cada corrida del cron.
  last_alert_kind    text check (last_alert_kind in ('met', 'stale')),
  last_alert_at      timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_trackers_user
  on public.trackers (user_id);
create index if not exists idx_trackers_user_objective
  on public.trackers (user_id, objective_id);
create index if not exists idx_trackers_user_step
  on public.trackers (user_id, objective_step_id);

alter table public.trackers enable row level security;

drop policy if exists "select own trackers" on public.trackers;
create policy "select own trackers" on public.trackers
  for select using (auth.uid() = user_id);

drop policy if exists "insert own trackers" on public.trackers;
create policy "insert own trackers" on public.trackers
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own trackers" on public.trackers;
create policy "update own trackers" on public.trackers
  for update using (auth.uid() = user_id);

drop policy if exists "delete own trackers" on public.trackers;
create policy "delete own trackers" on public.trackers
  for delete using (auth.uid() = user_id);

-- ─── tracker_points (serie temporal) ───────────────────────────────
create table if not exists public.tracker_points (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tracker_id  text not null references public.trackers(id) on delete cascade,
  value       numeric not null,
  date        date not null,
  source      text not null default 'manual_screenshot'
              check (source in ('manual_screenshot', 'manual_text', 'email')),
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_tracker_points_user_tracker
  on public.tracker_points (user_id, tracker_id);

alter table public.tracker_points enable row level security;

drop policy if exists "select own tracker_points" on public.tracker_points;
create policy "select own tracker_points" on public.tracker_points
  for select using (auth.uid() = user_id);

drop policy if exists "insert own tracker_points" on public.tracker_points;
create policy "insert own tracker_points" on public.tracker_points
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own tracker_points" on public.tracker_points;
create policy "update own tracker_points" on public.tracker_points
  for update using (auth.uid() = user_id);

drop policy if exists "delete own tracker_points" on public.tracker_points;
create policy "delete own tracker_points" on public.tracker_points
  for delete using (auth.uid() = user_id);

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('trackers','tracker_points');
-- select policyname from pg_policies where tablename='trackers' order by policyname;
-- select policyname from pg_policies where tablename='tracker_points' order by policyname;
-- select id, label, unit, current_value, condition_kind, condition_value
--   from public.trackers limit 20;
-- select tracker_id, value, date, source from public.tracker_points
--   order by tracker_id, date limit 50;
