-- ============================================================
-- SIR V2 — Migration 0048: tabla action_suggestions (Daily Actions)
-- ============================================================
-- Cache de los MENSAJES COPIABLES de Daily Actions (GEMA A, portada de v1
-- `action_suggestions`). El scoring/ranking es puro y client-side (no se
-- persiste); acá SOLO cacheamos el texto generado por el LLM para que pedir
-- el mismo mensaje el mismo día sea idempotente y barato (un Haiku por
-- persona/día como máximo).
--
-- Clave de idempotencia: (user_id, person_id, date_bucket). Igual que v1.
--
-- IMPORTANTE — fail-open: la ruta /api/daily-actions/message funciona AUNQUE
-- esta tabla no exista todavía (genera on-demand y simplemente no cachea). Por
-- eso es seguro deployar el código antes de aplicar esta migración.
--
-- NO aplicar a mano si el runner de migraciones (CI `supabase db push`) ya está
-- activo. Si no, aplicar en Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.action_suggestions (
  id                  text primary key default gen_random_uuid()::text,
  user_id             text not null,
  person_id           text not null references public.people(id) on delete cascade,
  date_bucket         date not null default current_date,
  kind                text not null default 'contact',
  action_text         text not null default '',
  timing_reason       text not null default '',
  message_suggestion  text not null,
  impact_prediction   text not null default '',
  created_at          timestamptz not null default now()
);

-- ─── 2. Idempotencia por día + índice de lectura ────────────────────
create unique index if not exists uq_action_suggestions_user_person_day
  on public.action_suggestions(user_id, person_id, date_bucket);

-- ─── 3. RLS (owner-only, mismo patrón que person_logs/0013) ─────────
alter table public.action_suggestions enable row level security;

drop policy if exists "select own action_suggestions" on public.action_suggestions;
create policy "select own action_suggestions"
  on public.action_suggestions for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own action_suggestions" on public.action_suggestions;
create policy "insert own action_suggestions"
  on public.action_suggestions for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own action_suggestions" on public.action_suggestions;
create policy "update own action_suggestions"
  on public.action_suggestions for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own action_suggestions" on public.action_suggestions;
create policy "delete own action_suggestions"
  on public.action_suggestions for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'action_suggestions';
-- select policyname from pg_policies
-- where schemaname = 'public' and tablename = 'action_suggestions' order by policyname;
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'action_suggestions';
