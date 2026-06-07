-- ============================================================
-- SIR V2 — Migration 0065: scope en daily_briefs (Brief semana/mes — /horario Fase 2)
-- ============================================================
-- Extiende el cache del "Brief del día" (daily_briefs, 0062) a los horizontes
-- SEMANA y MES de /horario. Como las tres vistas son ventanas MÓVILES que
-- arrancan HOY (Día = hoy; Semana = hoy..+6; Mes = hoy..+~31), el bucket de
-- cache de las tres es el MISMO día (date_bucket = hoy). Para que no colisionen,
-- agregamos una columna `scope` ('day' | 'week' | 'month') y movemos la
-- idempotencia a (user_id, scope, date_bucket): un brief por scope por día.
--
-- ADITIVA + IDEMPOTENTE: se puede correr más de una vez sin daño. Los briefs del
-- día ya cacheados quedan con scope='day' (el default backfilea las filas
-- viejas).
--
-- IMPORTANTE — fail-open: la ruta /api/horario/brief funciona AUNQUE esta
-- migración no se haya aplicado todavía (genera on-demand y simplemente no
-- cachea, y el resumen determinístico se muestra igual). Entre el deploy del
-- código nuevo y correr esta migración, NINGÚN brief cachea (incluido el del
-- día), porque las queries referencian la columna `scope` que aún no existe →
-- error → degradación a on-demand. Al aplicar 0065 vuelve el cache. Por eso es
-- seguro deployar el código antes de aplicar esta migración.
--
-- NO aplicar a mano si el runner de migraciones (CI `supabase db push`) ya está
-- activo. Si no, aplicar en Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Columna scope (default 'day' → backfill de filas existentes) ──
alter table public.daily_briefs
  add column if not exists scope text not null default 'day';

-- ─── 2. Mover la idempotencia a (user_id, scope, date_bucket) ─────────
-- El índice viejo (user_id, date_bucket) impediría tener day+week+month el
-- mismo día (mismo date_bucket) → se reemplaza por el compuesto con scope.
drop index if exists uq_daily_briefs_user_day;

create unique index if not exists uq_daily_briefs_user_scope_day
  on public.daily_briefs(user_id, scope, date_bucket);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select column_name, data_type, column_default from information_schema.columns
-- where table_schema = 'public' and table_name = 'daily_briefs' and column_name = 'scope';
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public' and tablename = 'daily_briefs' order by indexname;
