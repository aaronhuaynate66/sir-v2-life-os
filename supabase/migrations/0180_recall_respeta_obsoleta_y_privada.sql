-- 0180 — El recall de memorias RESPETA `is_obsolete` y `is_private`.
--
-- ═══ EL BUG ═══════════════════════════════════════════════════════════════════
--
-- Medido el 30-jul-2026: **700 de las 1,295 memorias de Aaron (54%) están marcadas
-- `is_obsolete = true`**, todas con `obsoleted_reason = 'ruido de import (BUG-005)'`,
-- puestas el 6-jul. Y **las 700 tienen embedding**, así que **las 700 competían en
-- el recall**: ni `match_memories` (0162) ni `match_memories_hybrid` (0164) miraban
-- la columna. Alguien hizo el trabajo de identificar el ruido y marcarlo, y el
-- retrieval ignoraba la marca.
--
-- Qué son esas 700: **698 son registros de llamadas** de la importación de WhatsApp
-- ("📞 Llamada de voz perdida · 18:27"), `type='episodic'`, de 33 caracteres
-- promedio. Nadie le pregunta a SIR por una llamada perdida a las 18:27, pero sí
-- ocupaban lugar en el pool de candidatos de cada consulta — más de la mitad del
-- universo del que el recall elige.
--
-- `is_private` va en el mismo arreglo aunque hoy no haya ninguna (medido: 0 filas).
-- La feature de "marcar memoria como privada — fuera de la IA" existe en la app, así
-- que sin este filtro la PRIMERA memoria que Aaron marque privada se le manda igual
-- al modelo. Arreglarlo ahora cuesta una línea; descubrirlo después cuesta confianza.
--
-- ═══ POR QUÉ `is not true` Y NO `= false` ════════════════════════════════════
--
-- Las dos columnas admiten NULL en filas viejas, y en SQL `null = false` es NULL, o
-- sea la fila se descarta. Con `is not true` una memoria sin marcar sigue entrando,
-- que es el default correcto: lo que no se declaró ruido, no es ruido.
--
-- ═══ LO QUE NO HACE ══════════════════════════════════════════════════════════
--
-- No borra nada. Las 700 filas quedan donde están, con su marca y su razón — siguen
-- disponibles para la bitácora, las métricas de contacto y para revertir esto si
-- hiciera falta. Lo único que cambia es de dónde elige el recall.
--
-- OJO — hay 2 falsos positivos en esas 700, verificados a mano, y se desmarcan
-- aparte (script `scripts/desmarcar-memorias.mjs`): dos memorias reales sobre una
-- pelea con Diana por el Mundial quedaron atrapadas en el barrido de BUG-005. HOY
-- están en el recall justo porque el filtro no existía, así que aplicar esta
-- migración sin desmarcarlas dejaría a SIR ciego a ese conflicto. Van juntas.

-- ─── match_memories (vector puro) ────────────────────────────────────────────
--
-- Este RPC tiene DOS consumidores con intenciones distintas, y eso decide el diseño:
--   · `askSir` lo usa de fallback del híbrido → es la IA leyendo. No debe ver ni
--     obsoletas ni privadas.
--   · `/api/search` es la búsqueda MANUAL de Aaron en su propia memoria.
--
-- Y "privada" en este repo significa **fuera de la IA**, no oculta para Aaron (la
-- feature es "excluir de la IA, no se re-deriva"). Filtrar `is_private` a secas acá
-- le escondería a Aaron sus propias memorias privadas en su propio buscador, que es
-- lo contrario de lo que la feature promete. De ahí el parámetro:
-- `p_incluir_privadas` con default **false** — el default protege el camino de la IA,
-- y el buscador opta explícitamente por verlas.
--
-- Las OBSOLETAS se excluyen siempre: son ruido de import declarado, no contenido de
-- Aaron. Si algún día hay que verlas, se consultan por la tabla.
--
-- Hay que DROPEAR para cambiar la aridad (create-or-replace no puede). Los callers
-- pasan args por NOMBRE, así que omitir el nuevo param sigue funcionando durante la
-- ventana de deploy.
drop function if exists public.match_memories(vector(1536), int, float, uuid);

create or replace function public.match_memories(
  query_embedding vector(1536),
  match_count int default 10,
  similarity_threshold float default 0.0,
  p_user_id uuid default null,
  p_incluir_privadas boolean default false
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
    and m.is_obsolete is not true
    and (p_incluir_privadas or m.is_private is not true)
    and 1 - (m.embedding <=> query_embedding) >= similarity_threshold
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

comment on function public.match_memories is
  'Recall vectorial de memories. Excluye is_obsolete siempre; is_private salvo p_incluir_privadas=true, que usa la búsqueda manual de Aaron (privada = fuera de la IA, no oculta para él). Mig 0180.';

-- ─── match_memories_hybrid (vector + FTS con RRF) ────────────────────────────
-- El filtro va en LAS DOS ramas: si solo estuviera en una, el `union` de ids las
-- volvería a meter por la otra puerta.
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
  vec as (
    select
      m.id,
      row_number() over (order by m.embedding <=> query_embedding) as rank,
      1 - (m.embedding <=> query_embedding) as similarity
    from public.memories m, owner
    where m.user_id = owner.uid
      and m.embedding is not null
      and m.is_obsolete is not true
      and m.is_private is not true
      and 1 - (m.embedding <=> query_embedding) >= 0.15
    order by m.embedding <=> query_embedding
    limit 50
  ),
  fts as (
    select
      m.id,
      row_number() over (
        order by ts_rank_cd(m.search_vector, websearch_to_tsquery('spanish', query_text)) desc
      ) as rank,
      ts_rank_cd(m.search_vector, websearch_to_tsquery('spanish', query_text)) as fts_rank
    from public.memories m, owner
    where m.user_id = owner.uid
      and m.is_obsolete is not true
      and m.is_private is not true
      and query_text is not null
      and query_text <> ''
      and m.search_vector @@ websearch_to_tsquery('spanish', query_text)
    order by ts_rank_cd(m.search_vector, websearch_to_tsquery('spanish', query_text)) desc
    limit 50
  ),
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
  'Recall híbrido de memories (vector + FTS, RRF). Excluye is_obsolete/is_private en AMBAS ramas (0180): el 54% del store estaba marcado como ruido de import y competía igual.';

-- Índice parcial: casi todas las consultas del recall filtran por estas dos, así
-- que conviene que el planner tenga por dónde entrar sin escanear las obsoletas.
create index if not exists idx_memories_recall_vivas
  on public.memories(user_id)
  where is_obsolete is not true and is_private is not true;
