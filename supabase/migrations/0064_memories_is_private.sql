-- SIR V2 — 0064: memories.is_private (excluir / marcar privada una memoria)
--
-- Contexto: las memorias derivadas de conversaciones (POST /api/memories/derive)
-- pueden contener un hecho que Aaron considera sensible o que simplemente no
-- quiere en la vista general ni alimentando a la IA. Hoy "Descartar"
-- (is_obsolete, 0045) sirve para una derivación BASURA: la oculta y la deja
-- como tombstone. Pero un hecho LEGÍTIMO-pero-privado no es basura: querés
-- conservarlo, verlo aparte, y que NUNCA viaje a un prompt ni vuelva a la vista
-- general.
--
-- DISTINTO de is_obsolete a propósito:
--   - is_obsolete = mala derivación → se esconde, tombstone, no se re-deriva.
--   - is_private  = hecho real pero sensible → se conserva (visible bajo un
--                   affordance "privadas"), se EXCLUYE de toda IA y de la vista
--                   general, y la re-derivación no crea un equivalente (la firma
--                   normalizada de las privadas suprime las nuevas equivalentes).
--
-- EFECTO en el código:
--   - getMemoriesForPerson() filtra is_private=false → toda lectura que alimenta
--     IA (briefing, "Antes de contactar"/contactBrief, lista de la ficha) las
--     excluye por construcción.
--   - getPrivateMemoriesForPerson() las trae aparte para el affordance.
--   - /api/memories/derive suprime por firma cualquier memoria nueva equivalente
--     a una privada existente de esa persona (no las resucita).
--
-- ADITIVA e idempotente: solo agrega columnas con IF NOT EXISTS + default.
-- No toca datos existentes (todas quedan is_private=false). RLS ya existe sobre
-- memories; estas columnas viajan con esa misma política.

alter table public.memories
  add column if not exists is_private boolean not null default false;

alter table public.memories
  add column if not exists made_private_at timestamptz;

-- Índice parcial para el camino común (la ficha pide is_obsolete=false AND
-- is_private=false). La inmensa mayoría no está ni descartada ni privada, así
-- que el índice queda chico y acelera el filtro sin penalizar la escritura.
create index if not exists memories_visible_by_person_idx
  on public.memories (person_id, occurred_at desc)
  where is_obsolete = false and is_private = false;

comment on column public.memories.is_private is
  'true = memoria marcada privada/excluida por el usuario. Se conserva (visible aparte) pero se EXCLUYE de todo prompt de IA y de la vista general; la re-derivación suprime equivalentes por firma para no resucitarla.';
