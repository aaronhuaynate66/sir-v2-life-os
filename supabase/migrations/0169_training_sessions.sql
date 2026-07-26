-- 0169 — Sesiones de entrenamiento: el plan del Mundial necesita saber si se cumple.
--
-- El 25-jul se cargó la periodización de 15 semanas del Mundial (4 bloques) y un
-- tracker de "sesiones por semana ≥4"… sin ningún lugar donde marcar una sesión.
-- Un plan que no se puede medir es una intención.
--
-- No alcanza con un hábito booleano ("entrené sí/no"): la periodización distingue
-- FUERZA (bloque 1, donde se gana el músculo que necesita para no caerse de
-- categoría) de técnica, sparring o acondicionamiento. Sin el tipo, no se puede
-- decir "llevas 2 de 3 sesiones de fuerza esta semana".
--
-- user_id TEXT (mismo patrón que chat_feedback/brief_mutes): el webhook de
-- Telegram escribe bajo service-role pasando el owner id.

create table if not exists public.training_sessions (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  -- Día de Lima (YYYY-MM-DD): la semana de entrenamiento es local, no UTC.
  date          text not null,
  kind          text not null default 'otro'
                check (kind in ('fuerza', 'tecnica', 'sparring', 'acondicionamiento', 'competencia', 'otro')),
  duration_min  integer,
  intensity     text check (intensity in ('baja', 'media', 'alta')),
  notes         text,
  /** Objetivo al que aporta (el Mundial). Suelto: una sesión puede no colgar de nada. */
  objective_id  text,
  source        text not null default 'chat',
  created_at    timestamptz not null default now()
);

create index if not exists idx_training_user_date
  on public.training_sessions(user_id, date desc);
create index if not exists idx_training_user_kind
  on public.training_sessions(user_id, kind, date desc);

alter table public.training_sessions enable row level security;

drop policy if exists "select own training_sessions" on public.training_sessions;
create policy "select own training_sessions" on public.training_sessions for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own training_sessions" on public.training_sessions;
create policy "insert own training_sessions" on public.training_sessions for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own training_sessions" on public.training_sessions;
create policy "update own training_sessions" on public.training_sessions for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
drop policy if exists "delete own training_sessions" on public.training_sessions;
create policy "delete own training_sessions" on public.training_sessions for delete
  using (auth.uid()::text = user_id);
