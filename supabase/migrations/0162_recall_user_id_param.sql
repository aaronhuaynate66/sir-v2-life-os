-- 0162 — match_memories / match_sir_conversations aceptan un user_id EXPLÍCITO.
--
-- BUG (Ola 2, fundación): ambos RPCs de recall filtraban SOLO por auth.uid().
-- askSir se reusa por el webhook de Telegram y los crons con cliente SERVICE-ROLE,
-- donde auth.uid() es NULL → el recall (memorias largas + conversaciones pasadas)
-- devolvía VACÍO en Telegram, el canal principal de Aaron. SIR quedaba ciego a su
-- memoria por ahí (parte del "SIR se siente tonto").
--
-- FIX: parámetro p_user_id opcional al final. coalesce(p_user_id, auth.uid())
-- mantiene EXACTO el comportamiento web (RLS + auth.uid() de defensa; pasar el
-- propio id no cambia nada) y habilita el filtro correcto bajo service-role.
-- SECURITY INVOKER se conserva: en cliente autenticado la RLS de la tabla sigue
-- acotando a las filas del usuario aunque p_user_id fuera otro; service-role
-- (que sí saltea RLS) solo se usa server-side y pasa el owner id de confianza.
--
-- Se DROPEA la firma vieja y se recrea (create-or-replace no puede cambiar la
-- aridad). Los callers pasan los args por NOMBRE, así que omitir p_user_id sigue
-- funcionando durante la ventana de deploy (default null → auth.uid()).

-- ─── match_memories (memories.user_id es uuid) ──────────────────────
drop function if exists public.match_memories(vector(1536), int, float);

create or replace function public.match_memories(
  query_embedding vector(1536),
  match_count int default 10,
  similarity_threshold float default 0.0,
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
  where m.user_id = coalesce(p_user_id, auth.uid())
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) >= similarity_threshold
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

-- ─── match_sir_conversations (sir_conversations.user_id es text) ────
drop function if exists public.match_sir_conversations(vector(1536), int, float, timestamptz);

create or replace function public.match_sir_conversations(
  query_embedding vector(1536),
  match_count int default 5,
  similarity_threshold float default 0.0,
  exclude_after timestamptz default now(),
  p_user_id text default null
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
  where c.user_id = coalesce(p_user_id, auth.uid()::text)
    and c.embedding is not null
    and c.created_at < exclude_after
    and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;
