-- ============================================================
-- SIR V2 — Migration 0022: memories columns safety (idempotente)
-- ============================================================
-- CONTEXTO (bug en prod 31/05/2026):
--   El endpoint /api/memories/derive (camino aditivo observations→memories)
--   falló con:
--     "column memories.source_event_id does not exist"
--   Diagnóstico: la migration 0012 (que agrega source_event_id + su unique
--   index) NUNCA se aplicó en producción. El feature asumió que estaba.
--
--   El FIX de código reancla la idempotencia en el PRIMARY KEY `id`
--   (determinístico, siempre existe) y usa `observation_id` (de 0010), así
--   que NO depende de source_event_id. Esta migration es la red de
--   seguridad: re-asegura, de forma idempotente, las columnas que el código
--   escribe — por si 0010 quedó parcialmente aplicada — y de paso restaura
--   lo de 0012 para des-romper el backfill legacy.
--
-- ALCANCE: SOLO `add column if not exists` + `create index if not exists`.
--   Sin DROP, sin alterar tipos ni nullability, sin tocar datos. Re-correrla
--   es no-op. Riesgo: nulo. Tiempo: <1 segundo.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0021.)
-- ============================================================

-- ─── 1. Columnas de 0010 (person_id, source, quality_score, observation_id)
alter table public.memories
  add column if not exists person_id text references public.people(id) on delete cascade;

alter table public.memories
  add column if not exists source text;

alter table public.memories
  add column if not exists quality_score int
  check (quality_score is null or quality_score between 1 and 5);

alter table public.memories
  add column if not exists observation_id text references public.observations(id) on delete set null;

-- ─── 2. Columna de 0012 (source_event_id) — restaura el backfill legacy ──
alter table public.memories
  add column if not exists source_event_id text;

-- ─── 3. Índices (idempotentes) ──────────────────────────────────────
create index if not exists idx_memories_user_person
  on public.memories(user_id, person_id)
  where person_id is not null;

create index if not exists idx_memories_observation
  on public.memories(observation_id)
  where observation_id is not null;

-- Unique parcial de 0012 (lo usa SOLO el backfill legacy; el camino nuevo
-- ancla en el PK `id`, no acá). WHERE source_event_id IS NOT NULL deja
-- coexistir filas manuales sin source_event_id.
create unique index if not exists uniq_memories_source_event
  on public.memories(user_id, source_event_id)
  where source_event_id is not null;

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- -- columnas presentes (esperado: las 5):
-- select column_name from information_schema.columns
-- where table_name = 'memories'
--   and column_name in ('person_id','source','quality_score','observation_id','source_event_id')
-- order by column_name;
--
-- -- índices presentes (esperado: los 3):
-- select indexname from pg_indexes
-- where tablename = 'memories'
--   and indexname in ('idx_memories_user_person','idx_memories_observation','uniq_memories_source_event')
-- order by indexname;
-- ============================================================
