-- ============================================================
-- SIR V2 — Migration 0015: Busqueda semantica (Fase 3b) — pgvector
-- ============================================================
-- Habilita pgvector + columna de embedding en `memories` + indice HNSW
-- (cosine) + funcion RPC match_memories para busqueda por similitud.
--
-- Dimension 1536 = OpenAI text-embedding-3-small (default del proyecto;
-- ver src/lib/embeddings/client.ts). Si se cambia de proveedor/modelo,
-- ajustar la dimension de la columna + reindexar + re-embeddear.
--
-- ADITIVA y NO destructiva: solo CREATE EXTENSION / ADD COLUMN / CREATE
-- INDEX / CREATE FUNCTION. No toca datos existentes.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (pgvector viene disponible en Supabase; CREATE EXTENSION lo activa.)
-- ============================================================

-- ─── 1. Extension ───────────────────────────────────────────────────
create extension if not exists vector;

-- ─── 2. Columnas en memories ────────────────────────────────────────
alter table public.memories add column if not exists embedding       vector(1536);
alter table public.memories add column if not exists embedding_model  text;

-- ─── 3. Indice HNSW (cosine). Parcial: solo filas ya embeddeadas ─────
create index if not exists idx_memories_embedding_hnsw
  on public.memories using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- ─── 4. RPC de busqueda por similitud ───────────────────────────────
-- SECURITY INVOKER (default): respeta RLS. Ademas filtra user_id =
-- auth.uid() explicito (defense-in-depth). Devuelve similarity = 1 - cosine
-- distance (1.0 = identico, 0 = ortogonal).
create or replace function public.match_memories(
  query_embedding vector(1536),
  match_count int default 10,
  similarity_threshold float default 0.0
)
returns table (
  id text,
  title text,
  content text,
  type text,
  person_id text,
  occurred_at timestamptz,
  importance int,
  similarity float
)
language sql
stable
as $$
  select
    m.id,
    m.title,
    m.content,
    m.type,
    m.person_id,
    m.occurred_at,
    m.importance,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = auth.uid()
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) >= similarity_threshold
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. extension:
-- select extname from pg_extension where extname = 'vector';
--
-- -- 2. columnas:
-- select column_name, data_type, udt_name from information_schema.columns
-- where table_name = 'memories' and column_name in ('embedding','embedding_model');
--
-- -- 3. indice:
-- select indexname from pg_indexes where indexname = 'idx_memories_embedding_hnsw';
--
-- -- 4. funcion:
-- select proname from pg_proc where proname = 'match_memories';
--
-- -- 5. smoke test (con un vector dummy de ceros — deberia devolver 0 filas
-- --    hasta que existan embeddings):
-- select * from public.match_memories(array_fill(0::float, array[1536])::vector, 5, 0.0);
-- ============================================================
