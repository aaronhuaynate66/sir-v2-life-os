-- ============================================================
-- SIR V2 — Migration 0017: Habilitar Realtime para las tablas del Camino A
-- ============================================================
-- El sync en vivo cross-device (engine) se suscribe a postgres_changes de
-- estas tablas. Para que Supabase emita esos eventos, las tablas deben estar
-- en la publicación `supabase_realtime`. Esto las agrega.
--
-- ADITIVA y NO destructiva: solo ALTER PUBLICATION ADD TABLE. Idempotente
-- (no falla si alguna ya está). NO toca datos.
--
-- Sin esto, el sync en vivo igual FUNCIONA vía re-pull al recuperar foco de
-- la pestaña; Realtime solo agrega la propagación instantánea sin foco.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Alternativa por UI: Dashboard -> Database -> Replication -> publicación
--  supabase_realtime -> activar cada tabla.)
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
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public'
-- order by tablename;
-- ============================================================
