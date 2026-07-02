-- ============================================================
-- SIR V2 — Migration 0110: person_cycles (ciclo menstrual de terceros)
-- ============================================================
-- Aaron necesita registrar el ciclo de Diana (y potencialmente otras
-- personas cercanas) para cruzar con SU propio estado (mood, energía,
-- interacciones): "el lunes ella todavía tenía un resto de regla" no
-- puede quedar como texto libre en el detail de un moment — así no
-- se puede correlacionar.
--
-- Diseño:
--   - Cada row = un DÍA con estado (bleeding | pms | mid_cycle | ovulation |
--     luteal | unknown). Es la unidad más granular para cruzar con logs
--     diarios (mood, sleep, self-metrics).
--   - Fuente: quién lo registró — 'aaron' cuando Aaron lo observa/reporta,
--     'self_report' cuando la persona lo confirma. Default 'aaron'.
--   - Confidence explícita (alta/media/baja) — Aaron muchas veces infiere.
--
-- Aditiva, RLS por user_id. Sensible: no entra a IA general, tiene su
-- propio path de opt-in en la correlación longitudinal.
-- ============================================================

create table if not exists public.person_cycles (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  person_id     text not null references public.people(id) on delete cascade,
  -- Día del evento. Un día por row (fácil de cruzar con person_logs.logged_at).
  date          date not null,
  -- Fase del ciclo ese día.
  phase         text not null check (phase in ('bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown')),
  -- Confianza en el dato (alto=confirmado por ella; medio=Aaron infiere;
  -- bajo=estimación gruesa).
  confidence    text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  -- Quién dio el dato ('aaron' | 'self_report').
  source        text not null default 'aaron' check (source in ('aaron', 'self_report')),
  -- Nota libre corta (opcional). NO entra a IA general.
  note          text,
  created_at    timestamptz not null default now()
);

-- Unique por (user_id, person_id, date) → una entry por persona por día.
create unique index if not exists person_cycles_uniq
  on public.person_cycles (user_id, person_id, date);

-- Índice para consulta "todas las entries de X persona" (típico de la ficha).
create index if not exists person_cycles_by_person
  on public.person_cycles (user_id, person_id, date desc);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.person_cycles enable row level security;

drop policy if exists "select own person_cycles" on public.person_cycles;
create policy "select own person_cycles"
  on public.person_cycles for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own person_cycles" on public.person_cycles;
create policy "insert own person_cycles"
  on public.person_cycles for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own person_cycles" on public.person_cycles;
create policy "update own person_cycles"
  on public.person_cycles for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own person_cycles" on public.person_cycles;
create policy "delete own person_cycles"
  on public.person_cycles for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (SQL Editor):
--   select column_name, data_type from information_schema.columns
--     where table_name='person_cycles' order by ordinal_position;
-- ============================================================
