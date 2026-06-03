-- ============================================================
-- SIR V2 — Migration 0058: person_links admite el nodo "yo" (self) como sujeto
-- ============================================================
-- Fase 1.5 del grafo de familia: además de aristas persona↔persona, queremos
-- vínculos SELF↔persona con parentesco específico ("María Isabel es mi madre",
-- "Nicolle es mi hermana"). El nodo "yo" es SINTÉTICO (id='self'); no es una
-- fila de `people`. Reusamos person_links con el SENTINEL person_a_id='self'
-- (en vez de una tabla nueva): mismo sync local-first, mismo Realtime (0052),
-- mismos `kind`. La columna pasa a ser "id de persona O 'self'".
--
-- Para permitir 'self' hay que SOLTAR la FK de person_a_id → people(id) (ese
-- valor no referencia ninguna persona). Se conserva la FK de person_b_id (el
-- familiar SIEMPRE es una persona real) con su ON DELETE CASCADE, así borrar
-- una persona limpia sus self-links automáticamente.
--
-- ¿Y la integridad que perdemos en person_a_id? El cliente ya propaga los
-- DELETE de aristas: removePerson() filtra localmente las person_links de
-- AMBOS extremos y el sync engine empuja ese delete por id (no depende del
-- cascade del lado A). Así que soltar esta FK no genera huérfanos en la
-- práctica. El índice único uniq_person_links sigue intacto (dedupe por
-- user_id, person_a_id, person_b_id, kind), también para 'self'.
--
-- ADITIVA respecto a datos (no toca filas). IDEMPOTENTE (drop ... if exists).
-- Guardada: no-op seguro si person_links no existe (0035 sin correr).
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'person_links'
  ) then
    -- La FK auto-nombrada por Postgres en 0035 es person_links_person_a_id_fkey.
    -- La soltamos si existe; si ya no está (re-run), es no-op.
    alter table public.person_links
      drop constraint if exists person_links_person_a_id_fkey;
  end if;
end $$;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- NO debe listar una FK sobre person_a_id; SÍ debe seguir la de person_b_id:
-- select conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conrelid = 'public.person_links'::regclass and contype = 'f'
-- order by conname;
--
-- -- el insert del self-link debe funcionar (ejemplo, ajustá los ids reales):
-- -- insert into public.person_links (id, user_id, person_a_id, person_b_id, kind)
-- -- values ('lnk_test', auth.uid(), 'self', '<id_de_maria>', 'madre');
-- ============================================================
