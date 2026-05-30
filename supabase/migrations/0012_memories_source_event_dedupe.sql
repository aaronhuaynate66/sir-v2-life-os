-- ============================================================
-- SIR V2 — Migration 0012: memories.source_event_id + dedupe index
-- ============================================================
-- Contexto (Sesion 4 — Memorias asociadas, PR #1 backend):
--
--   La tabla `memories` YA EXISTE desde migration 0001 con casi todo el
--   shape que Sesion 4 necesita. Migration 0010 le sumo:
--     - person_id text REFERENCES people(id) ON DELETE CASCADE
--     - source text (nullable, sin CHECK)
--     - quality_score int (1-5, nullable)
--     - observation_id text REFERENCES observations(id) ON DELETE SET NULL
--     - 'social' al type enum CHECK.
--
--   Para soportar el backfill desde relationships.history con upsert
--   idempotente, falta UNA cosa:
--     1. Columna source_event_id text — el id del RelationshipEvent
--        original (event.id || event.captureId).
--     2. Indice unico parcial (user_id, source_event_id) WHERE
--        source_event_id IS NOT NULL — habilita el ON CONFLICT DO NOTHING
--        del upsert para que re-correr el backfill no duplique rows.
--
-- ALCANCE: ADD COLUMN + CREATE INDEX. Sin DROP, sin alterar nullability
-- ni tipos. Riesgo: nulo. Tiempo: <1 segundo.
--
-- LO QUE NO ENTRA EN 0012 (intencional):
--   - Embeddings pgvector → diferido a Fase 3b.
--   - CHECK constraint del source enum ('whatsapp_capture','manual',
--     'inferred') → NO se agrega para no obligar a backfill de rows
--     viejas con source NULL o valores ad-hoc. Se enforza en TS (Memory
--     .source union) y en el caller (extract.ts solo escribe esos 3
--     valores). Cuando el dataset este limpio se puede sumar con
--     NOT VALID + VALIDATE en una migration futura.
--   - Renombre de occurred_at -> timestamp → cambio de schema sin
--     beneficio funcional + rompe el memoryAdapter actual.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0011.)
-- ============================================================

-- ─── 1. Columna source_event_id ─────────────────────────────────────
alter table public.memories
  add column if not exists source_event_id text;

-- ─── 2. Indice unico parcial — dedupe del upsert ────────────────────
-- WHERE source_event_id IS NOT NULL permite que multiples rows manuales
-- (sin source_event_id) coexistan sin colisionar. El upsert de
-- backfillMemoriesForPerson solo emite rows con source_event_id seteado,
-- asi que las dedupea correctamente y deja en paz las manuales.
create unique index if not exists uniq_memories_source_event
  on public.memories(user_id, source_event_id)
  where source_event_id is not null;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. columna existe + nullable:
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_name = 'memories' and column_name = 'source_event_id';
--
-- -- 2. indice unico parcial:
-- select indexname, indexdef from pg_indexes
-- where indexname = 'uniq_memories_source_event';
--
-- -- 3. dry-run del upsert (debe insertar la primera vez, no-op la segunda):
-- insert into public.memories
--   (id, user_id, type, title, content, occurred_at, source, source_event_id)
-- values
--   ('mem_diag_0012', auth.uid()::text, 'episodic', 'diag', 'diag',
--    now(), 'manual', 'evt_diag_0012')
-- on conflict (user_id, source_event_id) do nothing;
-- -- correr 2 veces; la 2da debe retornar "INSERT 0 0".
-- delete from public.memories where id = 'mem_diag_0012';
