-- SIR V2 — 0045: memories.is_obsolete (soft-delete de memorias derivadas)
--
-- Contexto: una captura ilegible (LinkedIn de página entera) derivó memorias
-- basura. El usuario necesita poder DESCARTAR una memoria mala desde la ficha,
-- igual que ya descarta una captura (observations.is_obsolete).
--
-- Soft-delete (no DELETE) a propósito: la derivación es idempotente por el
-- PRIMARY KEY determinístico (mem_obs:<obsId>:<n>). Si borráramos la fila,
-- "Derivar desde mis conversaciones" la RESUCITARÍA en el próximo run. Con
-- is_obsolete=true la fila queda como tombstone: el probe de "ya cubierta"
-- la sigue viendo (no re-deriva) y la vista curada la oculta.
--
-- ADITIVA e idempotente: solo agrega columnas con IF NOT EXISTS + default.
-- No toca datos existentes (todas las memorias quedan is_obsolete=false).

alter table public.memories
  add column if not exists is_obsolete boolean not null default false;

alter table public.memories
  add column if not exists obsoleted_at timestamptz;

alter table public.memories
  add column if not exists obsoleted_reason text;

-- Índice parcial: la ficha pide siempre is_obsolete=false. Acelera el filtro
-- sin penalizar el caso común (la inmensa mayoría no está descartada).
create index if not exists memories_active_by_person_idx
  on public.memories (person_id, occurred_at desc)
  where is_obsolete = false;

comment on column public.memories.is_obsolete is
  'true = memoria descartada por el usuario (mala derivación). Oculta de la ficha; el probe de idempotencia la conserva como tombstone para no re-derivar.';
