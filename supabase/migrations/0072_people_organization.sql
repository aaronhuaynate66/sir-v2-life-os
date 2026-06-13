-- 0072 — Organización estructurada en people (empresa + grupo/holding).
--
-- POR QUÉ: hasta hoy la pertenencia organizacional de una persona vivía como
-- texto libre (bio de LinkedIn, notas, tags). SIR no "sabía" que K2 es del
-- Grupo HNG; solo había strings sueltos. Eso impedía toda inteligencia de red:
-- ni hilos profesionales en el grafo, ni cruce en el briefing.
--
-- QUÉ: dos campos opcionales por persona:
--   - organization : empleador / empresa específica (ej. "K2 Seguridad y Resguardo").
--   - org_group    : grupo / holding al que pertenece (ej. "Grupo HNG").
-- La conexión profesional entre dos personas se deriva de compartir org_group
-- (fallback organization). org_group es la clave de unión del holding: Alex
-- (Grupo HNG) y Francisco (K2 → grupo Grupo HNG) quedan conectados.
--
-- Aditiva, idempotente, nullable. Reads pre-migración son tolerantes (el
-- adapter cae a undefined si la columna no existe todavía).
--
-- ACCIÓN: la aplica el runner de migraciones en el merge a main.

alter table public.people add column if not exists organization text;
alter table public.people add column if not exists org_group text;

-- Índice para resolver "colegas" (misma org_group) por usuario sin full scan.
create index if not exists idx_people_user_org_group
  on public.people (user_id, org_group)
  where org_group is not null;
