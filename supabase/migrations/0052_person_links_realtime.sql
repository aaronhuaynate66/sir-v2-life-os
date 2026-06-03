-- ============================================================
-- SIR V2 — Migration 0052: Realtime para person_links (Camino A)
-- ============================================================
-- person_links (aristas de familia persona↔persona, migration 0035) entró al
-- sync local-first pero NUNCA se sumó a la publicación de Realtime ni se le
-- puso REPLICA IDENTITY FULL. Las migraciones 0017/0018 (que configuraron el
-- Camino A) son anteriores a 0035, así que la tabla quedó afuera: el sync en
-- vivo igual funciona vía re-pull al recuperar foco, pero NO propaga
-- INSERT/UPDATE/DELETE instantáneamente cross-device como el resto.
--
-- Esta migración la alinea con el MISMO patrón de las otras tablas Camino A:
--   1) la agrega a la publicación `supabase_realtime` (si falta), y
--   2) le pone REPLICA IDENTITY FULL (si no la tiene) — necesario para que
--      Realtime evalúe la RLS sobre la fila VIEJA y entregue los DELETE
--      (mismo fix que 0018).
--
-- ADITIVA, NO destructiva, IDEMPOTENTE. NO toca datos. Guardada: si la tabla
-- public.person_links todavía no existe (0035 sin correr), es un no-op seguro
-- — corré primero 0035 y después esta.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

do $$
begin
  -- Solo si la tabla existe (0035 ya corrida).
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'person_links'
  ) then

    -- 1) Sumar a la publicación de Realtime (si no está).
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'person_links'
    ) then
      alter publication supabase_realtime add table public.person_links;
    end if;

    -- 2) REPLICA IDENTITY FULL (si no está ya en 'f' = full).
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'person_links'
        and c.relreplident = 'f'
    ) then
      alter table public.person_links replica identity full;
    end if;

  end if;
end $$;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- debe listar person_links:
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public'
--   and tablename = 'person_links';
--
-- -- replica identity esperada: 'f' (full):
-- select c.relname,
--        case c.relreplident when 'f' then 'full' else c.relreplident::text end as replica_identity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'person_links';
-- ============================================================
