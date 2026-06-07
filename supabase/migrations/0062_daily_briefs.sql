-- ============================================================
-- SIR V2 — Migration 0062: tabla daily_briefs (Brief del día — /horario Fase 2)
-- ============================================================
-- Cache del "Brief del día" generado por IA en /horario. El brief se arma con
-- señales que el sistema YA tiene (eventos, tareas que vencen hoy, huecos
-- libres, fechas que se acercan, relaciones a atender) y el modelo sólo las
-- REFORMULA. Acá SOLO cacheamos el texto generado para que pedir el brief del
-- mismo día sea idempotente y barato (un Sonnet por día como máximo), igual que
-- action_suggestions (0048) cachea los mensajes de Daily Actions.
--
-- Clave de idempotencia: (user_id, date_bucket). Un brief por día. "Regenerar"
-- hace UPSERT sobre la misma fila (sobrescribe el brief del día).
--
-- IMPORTANTE — fail-open: la ruta /api/horario/brief funciona AUNQUE esta tabla
-- no exista todavía (genera on-demand y simplemente no cachea, y el resumen
-- determinístico se muestra igual). Por eso es seguro deployar el código antes
-- de aplicar esta migración.
--
-- NO aplicar a mano si el runner de migraciones (CI `supabase db push`) ya está
-- activo. Si no, aplicar en Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.daily_briefs (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null,
  date_bucket  date not null default current_date,
  brief        text not null,
  focus        text not null default '',
  created_at   timestamptz not null default now()
);

-- ─── 2. Idempotencia por día ────────────────────────────────────────
create unique index if not exists uq_daily_briefs_user_day
  on public.daily_briefs(user_id, date_bucket);

-- ─── 3. RLS (owner-only, mismo patrón que action_suggestions/0048) ──
alter table public.daily_briefs enable row level security;

drop policy if exists "select own daily_briefs" on public.daily_briefs;
create policy "select own daily_briefs"
  on public.daily_briefs for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own daily_briefs" on public.daily_briefs;
create policy "insert own daily_briefs"
  on public.daily_briefs for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own daily_briefs" on public.daily_briefs;
create policy "update own daily_briefs"
  on public.daily_briefs for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own daily_briefs" on public.daily_briefs;
create policy "delete own daily_briefs"
  on public.daily_briefs for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'daily_briefs';
-- select policyname from pg_policies
-- where schemaname = 'public' and tablename = 'daily_briefs' order by policyname;
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'daily_briefs';
