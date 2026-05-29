-- ============================================================
-- SIR V2 — Migration 0007: health_metrics.capture_type
-- ============================================================
-- Agrega columna `capture_type` a health_metrics para distinguir el
-- tipo de captura que origino las rows agrupadas por capture_id.
-- Habilita el header dinamico del TimelineCardGrouped: el body line
-- ("Bascula · conf. high" / "WhatsApp con [persona]") y futuras
-- variantes se derivan de este valor.
--
-- Constraint enum permisivo:
--   - 'scale'    : captura de bascula (Mi Scale, Renpho, Garmin, etc.)
--   - 'whatsapp' : captura de WhatsApp (Fase post-bascula)
--   - NULL       : registro manual o legado pre-captura
--
-- Cuando aparezca un tipo nuevo de captura, ampliar el CHECK constraint
-- en una migration posterior (mismo patron que migration 0005 con type).
--
-- Backfill: las 11 rows que el usuario inserto hoy via /capture/scale
-- tienen capture_id IS NOT NULL pero capture_type NULL. Actualizar
-- esas a 'scale' para que el TimelineCardGrouped las pinte como
-- "Bascula · conf. high" (no como "Captura" generico sin tipo).
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0006.)
-- ============================================================

-- ─── 1. Columna nueva nullable ──────────────────────────────────────
alter table public.health_metrics
  add column if not exists capture_type text;

-- ─── 2. CHECK constraint enum permisivo ────────────────────────────
alter table public.health_metrics
  drop constraint if exists health_metrics_capture_type_check;

alter table public.health_metrics
  add constraint health_metrics_capture_type_check
  check (capture_type is null or capture_type in ('scale', 'whatsapp'));

-- ─── 3. Backfill rows existentes con capture_id pero sin capture_type ─
-- Las rows que estan en DB con capture_id NOT NULL hoy son TODAS de
-- captura bascula (es la unica fuente de capturas pre-0007). Por lo
-- tanto las marcamos 'scale'.
update public.health_metrics
   set capture_type = 'scale'
 where capture_id is not null
   and capture_type is null;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- columna existe + constraint activo:
-- select column_name, data_type from information_schema.columns
-- where table_name = 'health_metrics' and column_name = 'capture_type';
--
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'health_metrics_capture_type_check';
--
-- -- backfill aplicado:
-- select capture_type, count(*) from public.health_metrics
-- group by capture_type
-- order by capture_type nulls last;
--
-- esperado: { scale: 11+, NULL: 0+ }
