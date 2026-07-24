-- ============================================================
-- SIR V2 — Migration 0164: HYBRID RECALL sobre memories (vector + full-text, RRF)
-- ============================================================
-- Ola 3. Hoy el recall de `memories` es 100% VECTOR puro (match_memories, mig 0162,
-- cosine <=>). Eso pierde coincidencias LÉXICAS exactas que el embedding difumina:
-- nombres propios, montos, jerga, tokens raros ("Marlab", "RIT", "Boticas Jhodaal").
-- Una memoria que menciona literalmente "Marlab" puede quedar por debajo del umbral
-- vectorial 0.30 aunque sea EL dato que se pregunta.
--
-- Este migración agrega la capa full-text que faltaba (memories NO tenía tsvector,
-- a diferencia de chat_messages [0145] y journal_entries [0116]) y un RPC nuevo que
-- FUSIONA vector + FTS con Reciprocal Rank Fusion (RRF).
--
-- Por qué RRF y no sumar scores: cosine (0..1) y ts_rank_cd (0..~1, escala distinta)
-- no son comparables; normalizarlos es frágil. RRF ignora las magnitudes y solo usa
-- el RANGO en cada lista → score = Σ 1/(k + rank). Un doc que aparece en AMBAS listas
-- se refuerza; uno fuerte en una sola igual entra. Es el estándar de la industria para
-- híbridos y no requiere re-tunear thresholds entre escalas.
--
-- ADITIVO y sin romper: NO toca match_memories (0162) ni sus 2 consumidores
-- (askSir, /api/search). match_memories_hybrid es una función NUEVA. El cableo de
-- askSir va en el mismo PR pero con fallback a match_memories durante la ventana de
-- deploy (si el RPC aún no existe, el recall no se apaga).
-- ============================================================

-- ─── 1. tsvector generado + índice GIN ──────────────────────────────
-- Columna GENERADA (stored): siempre en sync con title/content, cero mantenimiento,
-- cero backfill. Config 'spanish' = mismo analizador que el resto del retrieval FTS.
alter table public.memories
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored;

create index if not exists idx_memories_search_vector
  on public.memories using gin (search_vector);

comment on column public.memories.search_vector is
  'FTS (español) de title+content para el híbrido de recall. Ver match_memories_hybrid y src/lib/sir/askSir.ts (Ola 3).';

-- ─── 2. match_memories_hybrid (vector + FTS, RRF) ───────────────────
-- Mantiene el patrón user_id explícito de 0162: coalesce(p_user_id, auth.uid()).
-- Sin p_user_id → auth.uid() (web); con p_user_id → service-role (Telegram/crons).
-- Devuelve el MISMO shape base que match_memories + columnas extra de diagnóstico
-- (fts_rank, rrf_score) que el consumidor puede ignorar.
create or replace function public.match_memories_hybrid(
  query_embedding vector(1536),
  query_text text,
  match_count int default 10,
  rrf_k int default 60,
  p_user_id uuid default null
)
returns table (
  id text,
  title text,
  content text,
  type text,
  person_id text,
  occurred_at timestamptz,
  importance int,
  similarity float,
  fts_rank float,
  rrf_score float
)
language sql
stable
as $$
  with owner as (
    select coalesce(p_user_id, auth.uid()) as uid
  ),
  -- Rama VECTOR: top candidatos por cercanía coseno. Piso 0.15 (el "ruido" medido)
  -- para no fusionar vectores random; NO el 0.30 estricto de match_memories a
  -- propósito → deja que borderline (0.15–0.30) participe si el FTS lo corrobora
  -- (ese es justo el hit que el vector puro perdía).
  vec as (
    select
      m.id,
      row_number() over (order by m.embedding <=> query_embedding) as rank,
      1 - (m.embedding <=> query_embedding) as similarity
    from public.memories m, owner
    where m.user_id = owner.uid
      and m.embedding is not null
      and 1 - (m.embedding <=> query_embedding) >= 0.15
    order by m.embedding <=> query_embedding
    limit 50
  ),
  -- Rama FTS: solo filas que MATCHEAN el tsquery (websearch español). Sin ruido por
  -- construcción. query_text vacío → tsquery vacío → 0 filas (cae a vector puro).
  fts as (
    select
      m.id,
      row_number() over (
        order by ts_rank_cd(m.search_vector, websearch_to_tsquery('spanish', query_text)) desc
      ) as rank,
      ts_rank_cd(m.search_vector, websearch_to_tsquery('spanish', query_text)) as fts_rank
    from public.memories m, owner
    where m.user_id = owner.uid
      and query_text is not null
      and query_text <> ''
      and m.search_vector @@ websearch_to_tsquery('spanish', query_text)
    order by ts_rank_cd(m.search_vector, websearch_to_tsquery('spanish', query_text)) desc
    limit 50
  ),
  -- Universo de candidatos = unión de ambas ramas (≤100). Maneja el select final
  -- desde acá (join a memories por PK) en vez de escanear toda la tabla.
  ids as (
    select id from vec
    union
    select id from fts
  )
  select
    m.id,
    m.title,
    m.content,
    m.type,
    m.person_id,
    m.occurred_at,
    m.importance,
    coalesce(vec.similarity, 0)::float as similarity,
    coalesce(fts.fts_rank, 0)::float as fts_rank,
    (coalesce(1.0 / (rrf_k + vec.rank), 0) + coalesce(1.0 / (rrf_k + fts.rank), 0))::float as rrf_score
  from ids
  join public.memories m on m.id = ids.id
  left join vec on vec.id = ids.id
  left join fts on fts.id = ids.id
  order by rrf_score desc
  limit greatest(1, least(match_count, 50));
$$;

comment on function public.match_memories_hybrid is
  'Recall híbrido de memories: fusiona vector (cosine) + full-text (español) con RRF. Ola 3. Reemplaza a match_memories en askSir con fallback durante deploy.';
