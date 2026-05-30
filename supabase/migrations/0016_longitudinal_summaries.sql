-- ============================================================
-- SIR V2 — Migration 0016: Resumenes longitudinales (Fase 3c)
-- ============================================================
-- Cache + historial de los resumenes periodicos (semanal por ahora) que el
-- LLM genera sobre el historial del usuario (person_logs + observations +
-- memories). Cada generacion = un row inmutable; se conservan todos para
-- ver la evolucion semana a semana.
--
-- Mismo patron RLS que person_synthesis (migration 0010): user_id uuid +
-- 4 policies (select/insert/update/delete) sobre auth.uid().
--
-- ADITIVA y NO destructiva: solo CREATE TABLE / INDEX / POLICY.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

create table if not exists public.longitudinal_summaries (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- Tipo de periodo. Hoy 'weekly'; deja lugar a 'monthly' etc. sin migrar.
  period_kind       text not null default 'weekly' check (period_kind in ('weekly', 'monthly')),
  period_start      date not null,
  period_end        date not null,
  summary_text      text not null,
  -- Conteos de las fuentes que alimentaron el resumen (trazabilidad).
  source_counts     jsonb not null default '{}'::jsonb,
  model_used        text not null,
  input_tokens      int,
  output_tokens     int,
  generated_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────────
create index if not exists idx_longitudinal_user_period
  on public.longitudinal_summaries(user_id, period_end desc);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.longitudinal_summaries enable row level security;

drop policy if exists "select own longitudinal summaries" on public.longitudinal_summaries;
create policy "select own longitudinal summaries"
  on public.longitudinal_summaries for select
  using (auth.uid() = user_id);

drop policy if exists "insert own longitudinal summaries" on public.longitudinal_summaries;
create policy "insert own longitudinal summaries"
  on public.longitudinal_summaries for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own longitudinal summaries" on public.longitudinal_summaries;
create policy "update own longitudinal summaries"
  on public.longitudinal_summaries for update
  using (auth.uid() = user_id);

drop policy if exists "delete own longitudinal summaries" on public.longitudinal_summaries;
create policy "delete own longitudinal summaries"
  on public.longitudinal_summaries for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select table_name from information_schema.tables
-- where table_schema='public' and table_name='longitudinal_summaries';
-- select tablename, rowsecurity from pg_tables
-- where schemaname='public' and tablename='longitudinal_summaries';
-- select policyname from pg_policies
-- where schemaname='public' and tablename='longitudinal_summaries' order by policyname;
-- ============================================================
