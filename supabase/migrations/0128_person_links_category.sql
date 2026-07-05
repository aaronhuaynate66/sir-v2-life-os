-- 0128 — Categoría de la arista persona↔persona (familia | profesional | social).
--
-- CONTEXTO. person_links (0035) nació para FAMILIA: kind es un parentesco y toda
-- la lógica (inferencia transitiva, labels, sugerencias) asume vínculos familiares.
-- Eso dejó 15·7 (inteligencia de red: caminos, presentaciones, lazos débiles)
-- BLOQUEADO por data: el grafo person↔person no tenía forma de expresar un vínculo
-- PROFESIONAL o SOCIAL ("Y conoce a X del trabajo", "son amigos") — solo familia.
--
-- Esta columna abre el grafo: `category` distingue el DOMINIO de la arista.
--   • NULL o 'familia'   → arista familiar (comportamiento pre-0128, back-compat).
--   • 'profesional'      → vínculo laboral (colega, ex-jefe, cliente, proveedor…).
--   • 'social'           → vínculo social no-familiar (conocido, amigo de…).
-- El ROL específico de las aristas no-familiares vive en `kind` (valores nuevos
-- como 'colega', 'jefe', 'cliente') + el `context` libre (0107).
--
-- La lógica de FAMILIA filtra por category IS NULL OR category = 'familia', así
-- las aristas nuevas no contaminan la inferencia/labels de parentesco. El motor de
-- red (15·7) traza caminos sobre TODAS las aristas sin importar la categoría.
--
-- Aditiva. NULLABLE. Idempotente. Cero backfill: los registros viejos quedan NULL
-- (= familia) y siguen funcionando igual.

alter table public.person_links
  add column if not exists category text;

comment on column public.person_links.category is
  'Dominio de la arista: NULL/''familia'' (parentesco, pre-0128) | ''profesional'' | ''social''. La lógica de familia filtra a familia; el motor de red usa todas.';

-- Índice parcial para el capturador/motor de red: listar aristas no-familiares.
create index if not exists idx_person_links_category
  on public.person_links (user_id, category)
  where category is not null;

-- Verificación:
-- select category, count(*) from public.person_links group by category;
