-- 0042 — Definición SMART del objetivo (goals.target / baseline / why).
--
-- Un objetivo deja de ser un título suelto: se define SMART.
--   - Specific   : title + description (ya existen).
--   - Measurable : `target` (la métrica/resultado medible, ej. "Pesar 75 kg",
--                  "Ahorrar S/5000") + `baseline` (dónde estás hoy, ej. "82 kg",
--                  "S/1200 ahorrados"). Texto libre: el "qué/cuánto", no forzamos
--                  unidad ni parsing — la concreción la calibra el helper IA.
--   - Achievable : implícito (revisado por el helper IA y el análisis de feasibility).
--   - Relevant   : `why` (por qué importa este objetivo).
--   - Time-bound : target_date (ya existe).
--
-- Migración ADITIVA e IDEMPOTENTE: 3 columnas text nullable. RLS de goals ya
-- existe (sin cambios). NADA destructivo. Tolerante: los objetivos viejos quedan
-- con target/baseline/why NULL y el cliente cae a undefined (la UI ofrece
-- "Hacer SMART" para completarlos).

alter table public.goals add column if not exists target   text;
alter table public.goals add column if not exists baseline text;
alter table public.goals add column if not exists why      text;

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'goals' and column_name in ('target','baseline','why');
-- select id, title, target, baseline, why from public.goals limit 20;
