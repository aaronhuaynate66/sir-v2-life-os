-- ============================================================
-- SIR V2 — Migration 0018: REPLICA IDENTITY FULL para tablas del Camino A
-- ============================================================
-- FIX del DELETE en vivo (sync cross-device). Realtime evalúa la RLS sobre
-- la fila del evento. En DELETE usa la fila VIEJA; con REPLICA IDENTITY por
-- defecto (solo PK) el WAL no incluye `user_id`, así que la policy
-- `user_id = auth.uid()` no puede evaluarse sobre el row borrado y Realtime
-- SUPRIME el evento DELETE -> el observador nunca recibe el disparador y no
-- re-pullea. (CREATE/UPDATE sí propagan porque la fila nueva trae user_id.)
--
-- REPLICA IDENTITY FULL hace que el WAL incluya la fila vieja completa (con
-- user_id) -> Realtime evalúa la RLS y entrega el DELETE.
--
-- Efecto colateral conocido: mayor volumen de WAL (se loguea la fila vieja
-- entera en UPDATE/DELETE, no solo la PK). A esta escala es despreciable.
-- Sin impacto de correctitud.
--
-- ADITIVA y NO destructiva: solo ALTER TABLE ... REPLICA IDENTITY FULL.
-- Idempotente (solo altera las tablas que aún no están en FULL). NO toca datos.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'people',
    'relationships',
    'self_metrics',
    'health_metrics',
    'sleep_records',
    'goals',
    'signals',
    'finance_movements',
    'memories'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t
        and c.relreplident = 'f'  -- 'f' = full
    ) then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- relreplident esperado: 'f' (full) en las 9 tablas.
-- select c.relname,
--        case c.relreplident
--          when 'd' then 'default (PK)'
--          when 'f' then 'full'
--          when 'i' then 'index'
--          when 'n' then 'nothing'
--        end as replica_identity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname in ('people','relationships','self_metrics','health_metrics',
--                     'sleep_records','goals','signals','finance_movements','memories')
-- order by c.relname;
-- ============================================================
