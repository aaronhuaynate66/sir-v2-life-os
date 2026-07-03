-- ============================================================
-- SIR V2 — Migration 0120: tabla ai_daily_cache (cache diaria de respuestas IA)
-- ============================================================
-- V2 del plan: hoy cada click en "Pensar con SIR" (/api/reason) o en evaluar una
-- decisión (/api/decision) dispara una llamada Sonnet, aunque el input sea el
-- mismo día tras día. Esta tabla cachea la respuesta generada por (user, kind,
-- cache_key) para que repetir la misma acción el mismo día sea idempotente y
-- barato — mismo espíritu que daily_briefs (0062) y action_suggestions (0048),
-- pero genérico (una tabla para varios "kind" de respuesta IA).
--
-- Claves de cache_key:
--   - kind='reason'   → cache_key = día en Lima (YYYY-MM-DD). El "foco del día"
--                        es estable; una lectura de 12 lentes por día. Regenerar
--                        (force) hace UPSERT sobre la fila del día.
--   - kind='decision' → cache_key = día + hash corto del texto normalizado de la
--                        decisión. Evaluar DOS VECES la misma decisión el mismo
--                        día devuelve lo cacheado; decisiones distintas no chocan.
--
-- IMPORTANTE — fail-open: /api/reason y /api/decision funcionan AUNQUE esta tabla
-- no exista todavía (generan on-demand y no cachean). Es seguro deployar el
-- código antes de aplicar la migración; al aplicarla vuelve el cache.
--
-- NO aplicar a mano si el runner de migraciones (CI `supabase db push`) está
-- activo. Si no, aplicar en Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.ai_daily_cache (
  user_id      text not null,
  kind         text not null,
  cache_key    text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, kind, cache_key)
);

-- ─── 2. RLS (owner-only, mismo patrón que daily_briefs/0062) ────────
alter table public.ai_daily_cache enable row level security;

drop policy if exists "select own ai_daily_cache" on public.ai_daily_cache;
create policy "select own ai_daily_cache"
  on public.ai_daily_cache for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own ai_daily_cache" on public.ai_daily_cache;
create policy "insert own ai_daily_cache"
  on public.ai_daily_cache for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own ai_daily_cache" on public.ai_daily_cache;
create policy "update own ai_daily_cache"
  on public.ai_daily_cache for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own ai_daily_cache" on public.ai_daily_cache;
create policy "delete own ai_daily_cache"
  on public.ai_daily_cache for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'ai_daily_cache';
-- select policyname from pg_policies
-- where schemaname = 'public' and tablename = 'ai_daily_cache' order by policyname;
