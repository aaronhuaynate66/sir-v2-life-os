-- 0063 — Notas privadas (texto libre) por persona.
--
-- Suma una columna de PROSA libre a la tabla de información sensible
-- (person_sensitive_data, 0025). Es un lugar para contexto sensible en
-- palabras (temas personales/salud-adyacentes que NO van en el resumen
-- general ni en ninguna vista pública de la ficha).
--
-- POR QUÉ ACÁ y no en `people.notes`:
--   `people.notes` SÍ viaja a la IA (ej. daily-actions/message arma el prompt
--   con person.notes). `person_sensitive_data` es la tabla aislada por diseño:
--   no la lee ningún engine, builder de grafo, embedding ni síntesis, y no
--   aparece en dossier/CSV/summaries. Por eso las notas privadas viven acá.
--
-- Reglas de manejo (enforced en el código, no por SQL):
--   - NUNCA entra a un prompt de IA (síntesis "Lo personal", briefing, brief
--     del día, alineación, daily-actions, generación de mensajes, etc.).
--   - NUNCA se exporta/imprime (dossier ni CSV).
--   - Solo se muestra dentro de su propia sección sensible (plegada).
--
-- Aditiva, idempotente. RLS ya existe (heredada de la tabla). Viaja por el
-- mismo camino que los otros campos sensibles (/api/person-sensitive).
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase.

alter table public.person_sensitive_data
  add column if not exists private_notes text default '';

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'person_sensitive_data' and column_name = 'private_notes';
