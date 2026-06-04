-- 0060 — Ancla del año (goals.is_anchor / anchor_subtitle).
--
-- El componente "TU AÑO" (brújula anual en Mission Control) necesita saber
-- cuál es el OBJETIVO ANCLA: el norte del año, elegido por el usuario. Solo
-- uno a la vez (la invariante "un ancla" se garantiza en el cliente:
-- useGoalStore.setAnchor desmarca el resto al marcar uno).
--
--   - is_anchor       : boolean, default false. El objetivo marcado como ancla.
--   - anchor_subtitle : text nullable. Detalle corto opcional del ancla
--                       (ej. "Al Khobar · Taekwondo +80kg"). Si está vacío, la
--                       brújula deriva el subtítulo del target/descripción.
--
-- Migración ADITIVA e IDEMPOTENTE: 2 columnas. RLS de goals ya existe (sin
-- cambios). NADA destructivo. Tolerante: los objetivos viejos quedan con
-- is_anchor=false y anchor_subtitle NULL; sin ancla marcada el componente
-- degrada con gracia (usa el objetivo activo de mayor prioridad+fecha más
-- lejana del año, o omite la sección).

alter table public.goals add column if not exists is_anchor       boolean not null default false;
alter table public.goals add column if not exists anchor_subtitle text;

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'goals' and column_name in ('is_anchor','anchor_subtitle');
-- select id, title, is_anchor, anchor_subtitle from public.goals where is_anchor;
