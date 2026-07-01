-- 0107 — Metadata declarativa de aristas persona↔persona (weight/context/source/confidence).
--
-- CONTEXTO. person_links (mig 0035) hasta acá modelaba VÍNCULOS FAMILIARES
-- persona↔persona con la mínima estructura para dibujar aristas en el grafo:
-- (person_a_id, person_b_id, kind). No había forma de:
--   1. Guardar el PESO declarado de la arista (ej. "colegas cercanos" > "colegas").
--   2. Registrar el CONTEXTO ("mismo equipo del área TAC en GRUPO HNG").
--   3. Trazar el ORIGEN de la arista (source: batch de LinkedIn, manual, IA, etc.).
--   4. Marcar la CONFIANZA del dato (high/medium/low), heredada del pipeline
--      de captura (mismo esquema que observations.confidence).
--
-- Estas 4 columnas cierran el gap detectado por el generador de
-- data/seed-batches/2026-07-01-linkedin-hng.json (Fabiola ↔ Cristina, colegas
-- del área TAC con contexto declarado). Sin ellas, la arista tipada existía
-- pero el peso vivía en un texto libre (observaciones) — la lectura en el
-- grafo era inútil.
--
-- IMPORTANTE. `edge_weights` (mig 0106) NO es lo mismo: guarda el DELTA
-- APRENDIDO por refuerzo Hebbian (F3), no la metadata declarativa de la
-- arista. Un edge puede tener peso base declarado acá + delta aprendido
-- en edge_weights → weight efectivo = base + delta.
--
-- Aditiva. NULLABLE. Back-compat: registros pre-0107 quedan con NULL en las
-- 4 columnas nuevas y siguen funcionando (kind sigue siendo la fuente de
-- verdad de qué es la arista).

alter table public.person_links
  add column if not exists weight     integer,
  add column if not exists context    text,
  add column if not exists source     text,
  add column if not exists confidence text;

-- weight: rango sugerido 0-10 (misma escala que importance_score de people).
-- 0 = arista técnica (misma empresa por ubicación), 10 = arista central
-- (co-founder, pareja, etc.). NULL = sin peso declarado (comportamiento pre-0107).
comment on column public.person_links.weight is
  'Peso declarado de la arista (0-10). NULL = sin peso. No confundir con edge_weights (delta Hebbian).';

-- context: descripción libre del vínculo, para lectura humana en el grafo y
-- para la narrativa IA. Ej: "colegas del área TAC en GRUPO HNG desde 2026-01".
comment on column public.person_links.context is
  'Contexto libre del vínculo (para tooltip del grafo y narrativa IA).';

-- source: de dónde vino la arista. Valores esperados:
--   'manual'          — el usuario la marcó a mano en la ficha
--   'linkedin_batch'  — importada desde export de LinkedIn (seed-people.mjs)
--   'router'          — creada por /relato al procesar un pegue
--   'inference'       — inferida por SIR (ej. mismos moments, mismo goal)
comment on column public.person_links.source is
  'Origen de la arista: manual | linkedin_batch | router | inference | …';

-- confidence: mismo enum que observations.confidence.
comment on column public.person_links.confidence is
  'Confianza en el vínculo: high | medium | low. Deriva del pipeline que lo creó.';

-- Índice de peso para queries "top N vínculos" en el grafo (fail-safe: los
-- NULL van al final). No es único.
create index if not exists idx_person_links_weight_desc
  on public.person_links (user_id, weight desc nulls last);

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, is_nullable
-- from information_schema.columns where table_name = 'person_links'
-- order by ordinal_position;
--
-- select * from public.person_links where weight is not null order by weight desc limit 10;
