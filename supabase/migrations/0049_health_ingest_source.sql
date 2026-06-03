-- ============================================================
-- SIR V2 — Migration 0049: Apple Health ingest (source + idempotencia)
-- ============================================================
-- Habilita el endpoint POST /api/health/ingest (Health Auto Export → SIR).
-- Es ADITIVO y seguro sobre filas existentes:
--
--   1. health_metrics + sleep_records: columna `source` (origen del dato:
--      'manual' / 'apple_health' / etc.) — nullable, no rompe filas legadas.
--   2. health_metrics + sleep_records: columna `external_id` (clave de dedupe
--      determinística por (usuario, métrica, día) — ej. "ah:resting_heart_rate:
--      2026-06-02"). El registro manual deja `external_id` NULL.
--   3. health_metrics.type: expandir el enum con 5 métricas de actividad de
--      Apple Health (energía activa/reposo, VO2máx, oxígeno en sangre, distancia).
--   4. Idempotencia: índice UNIQUE (user_id, external_id) en ambas tablas.
--      Los NULL son distintos en un unique index de Postgres → las filas
--      manuales (external_id NULL) NUNCA colisionan; sólo se deduplican las
--      filas de Apple. Sirve además de ARBITER para el upsert ON CONFLICT.
--
-- RLS: ya está habilitado en ambas tablas (migration 0001) con políticas por
--      auth.uid() = user_id. La ingesta corre con SERVICE ROLE (bypassa RLS) y
--      setea user_id explícito; NO requiere políticas nuevas. Las lecturas del
--      cliente siguen acotadas por las políticas existentes.
--
-- NO APLICAR A MANO: lo corre el runner CI (supabase db push). Ver docs/MIGRATIONS.md.
-- ============================================================

-- ─── 1+2. health_metrics: source + external_id ──────────────────────
alter table public.health_metrics add column if not exists source text;
alter table public.health_metrics add column if not exists external_id text;

alter table public.health_metrics drop constraint if exists health_metrics_source_check;
alter table public.health_metrics add constraint health_metrics_source_check
  check (source is null or source in ('manual', 'apple_health', 'scale', 'whatsapp'));

-- ─── 3. Expandir enum de health_metrics.type con métricas de actividad ─
alter table public.health_metrics drop constraint if exists health_metrics_type_check;
alter table public.health_metrics add constraint health_metrics_type_check check (
  type in (
    -- existentes (Fase 0-2)
    'weight', 'blood_pressure', 'heart_rate', 'steps', 'calories', 'hydration', 'custom',
    -- body composition (Migration 0005)
    'bmi', 'body_fat_percent', 'muscle_mass_kg', 'bone_mass_kg', 'water_percent',
    'protein_percent', 'visceral_fat_level', 'metabolic_rate_kcal',
    'skeletal_muscle_mass_kg', 'metabolic_age', 'body_score', 'ideal_weight_kg',
    -- actividad de Apple Health (Migration 0049)
    'active_energy', 'resting_energy', 'vo2_max', 'blood_oxygen', 'distance_km',
    -- frecuencia cardíaca: reposo va a 'heart_rate' (señal principal). La FC
    -- general del día es una distribución → se guarda como rango (mín/máx/prom),
    -- nunca como "reposo". 'sleeping_heart_rate' = FC durante el sueño.
    'heart_rate_min', 'heart_rate_max', 'heart_rate_avg', 'sleeping_heart_rate'
  )
);

-- ─── 4. Idempotencia: unique(user_id, external_id) ──────────────────
-- Index NO parcial a propósito: los NULL son distintos entre sí, así que las
-- filas manuales (external_id NULL) conviven sin conflicto, y Postgres puede
-- usarlo como arbiter del ON CONFLICT (user_id, external_id) del upsert.
create unique index if not exists uq_health_metrics_user_external
  on public.health_metrics(user_id, external_id);

-- ─── 5+6. sleep_records: source + external_id + unique ──────────────
alter table public.sleep_records add column if not exists source text;
alter table public.sleep_records add column if not exists external_id text;

alter table public.sleep_records drop constraint if exists sleep_records_source_check;
alter table public.sleep_records add constraint sleep_records_source_check
  check (source is null or source in ('manual', 'apple_health'));

create unique index if not exists uq_sleep_records_user_external
  on public.sleep_records(user_id, external_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- -- columnas nuevas:
-- select table_name, column_name from information_schema.columns
-- where table_name in ('health_metrics','sleep_records')
--   and column_name in ('source','external_id') order by 1,2;
--
-- -- enum expandido:
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'health_metrics_type_check';
--
-- -- unique indexes:
-- select indexname from pg_indexes
-- where indexname in ('uq_health_metrics_user_external','uq_sleep_records_user_external');
