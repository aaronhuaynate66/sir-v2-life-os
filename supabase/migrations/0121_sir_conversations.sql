-- ============================================================
-- SIR V2 — Migration 0121: sir_conversations (C3 — RAG cross-session)
-- ============================================================
-- Fase 3d del plan: "memoria que aprende por interacción". Hasta ahora cada
-- pregunta a SIR (/api/sir/ask) era stateless — recuperaba memorias de personas
-- pero NO recordaba lo conversado en sesiones anteriores. Esta tabla persiste
-- cada intercambio (pregunta + respuesta) con su embedding, para que la PRÓXIMA
-- pregunta (aunque sea en otra sesión, otro día) traiga por similitud lo que ya
-- se habló → continuidad real ("la semana pasada me dijiste…").
--
-- Mismo patrón que memories.embedding (0015): pgvector, índice HNSW cosine, RPC
-- match_* con SECURITY INVOKER + filtro auth.uid() (defense-in-depth).
-- Dimensión 1536 = OpenAI text-embedding-3-small (src/lib/embeddings/client.ts).
--
-- IMPORTANTE — fail-open: /api/sir/ask funciona AUNQUE esta tabla no exista aún
-- (no recupera ni persiste conversaciones, y responde igual). Seguro deployar el
-- código antes de aplicar la migración.
--
-- NO aplicar a mano si el runner de migraciones (CI `supabase db push`) está
-- activo. Si no, aplicar en Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Extensión (idempotente; ya activa desde 0015) ───────────────
create extension if not exists vector;

-- ─── 2. Tabla ───────────────────────────────────────────────────────
create table if not exists public.sir_conversations (
  id               text primary key default gen_random_uuid()::text,
  user_id          text not null,
  question         text not null,
  answer           text not null,
  embedding        vector(1536),
  embedding_model  text,
  created_at       timestamptz not null default now()
);

-- ─── 3. Índice HNSW (cosine), parcial sobre filas embeddeadas ───────
create index if not exists idx_sir_conversations_embedding_hnsw
  on public.sir_conversations using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists idx_sir_conversations_user_created
  on public.sir_conversations(user_id, created_at desc);

-- ─── 4. RLS (owner-only, mismo patrón que memories) ─────────────────
alter table public.sir_conversations enable row level security;

drop policy if exists "select own sir_conversations" on public.sir_conversations;
create policy "select own sir_conversations"
  on public.sir_conversations for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own sir_conversations" on public.sir_conversations;
create policy "insert own sir_conversations"
  on public.sir_conversations for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own sir_conversations" on public.sir_conversations;
create policy "delete own sir_conversations"
  on public.sir_conversations for delete
  using (auth.uid()::text = user_id);

-- ─── 5. RPC de búsqueda por similitud ───────────────────────────────
-- Devuelve las conversaciones más parecidas a la query. `exclude_after` deja
-- fuera las MUY recientes (las de esta misma sesión ya viajan en el history del
-- request → no queremos que además reboten por el recall). similarity = 1 - cos.
create or replace function public.match_sir_conversations(
  query_embedding vector(1536),
  match_count int default 5,
  similarity_threshold float default 0.0,
  exclude_after timestamptz default now()
)
returns table (
  id text,
  question text,
  answer text,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.question,
    c.answer,
    c.created_at,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.sir_conversations c
  where c.user_id = auth.uid()::text  -- user_id es TEXT (no uuid): castear evita 42883
    and c.embedding is not null
    and c.created_at < exclude_after
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'sir_conversations';
-- select proname from pg_proc where proname = 'match_sir_conversations';
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'sir_conversations';
