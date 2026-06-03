-- 0050 — objective_steps: tareas ejecutables "Jira-light" (tiempos, criterios,
-- estado de workflow, prioridad, dependencias).
--
-- CONTEXTO: hasta 0041 una TAREA (kind='task') tenía título, fecha opcional
-- (target_date), nota corta (description) y el binario hecho/pendiente de
-- `status`. Esto la deja como un checkbox, no como algo ejecutable. Esta
-- migración la enriquece estilo Jira-light (es un OS personal mono-usuario: SIN
-- story points, sprints ni asignados).
--
-- AGREGA (todo NULLABLE → 100% backward-compatible; KRs los dejan en NULL):
--   - acceptance_criteria : "definición de hecho" verificable (texto).
--   - effort              : estimación de esfuerzo camiseta — S / M / L.
--   - priority            : low / med / high.
--   - task_status         : estado de workflow de 4 valores
--                           (todo / in_progress / blocked / done).
--   - blocked_by          : IDs de otras tareas del mismo objetivo que deben
--                           completarse antes ("depende de").
--
-- El "due date" REUSA la columna existente `target_date` (no se agrega otra).
--
-- task_status NO reemplaza a `status`: `status` sigue siendo la fuente de verdad
-- del rollup del KR (cuenta 'hecho' como completado) y de nextPendingLeaf. El
-- cliente mantiene ambos sincronizados (done↔hecho, in_progress↔en_progreso,
-- todo/blocked↔pendiente). Por eso NO hay backfill de task_status: las tareas
-- viejas derivan su estado efectivo desde `status` (lib/objectives/steps.ts).
--
-- Migración ADITIVA e IDEMPOTENTE: sólo agrega columnas + 2 checks. RLS ya existe
-- de 0040 (sin cambios). NADA destructivo, NADA de backfill con LLM.
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase (o vía el runner). El
-- cliente ya tolera la ausencia de estas columnas (fromRow cae a undefined), así
-- que NO rompe nada antes de correrla.

-- 1) Criterio de aceptación (definición de hecho).
alter table public.objective_steps
  add column if not exists acceptance_criteria text;

-- 2) Esfuerzo (camiseta).
alter table public.objective_steps
  add column if not exists effort text;

-- 3) Prioridad.
alter table public.objective_steps
  add column if not exists priority text;

-- 4) Estado de workflow de 4 valores.
alter table public.objective_steps
  add column if not exists task_status text;

-- 5) Dependencias: IDs de otras tareas del mismo objetivo (self-ref lógico, sin
--    FK dura para no complicar borrados — el cliente ignora IDs inexistentes).
alter table public.objective_steps
  add column if not exists blocked_by text[];

-- 6) Checks de dominio (idempotentes). Permiten NULL (campos opcionales).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'objective_steps_effort_check'
  ) then
    alter table public.objective_steps
      add constraint objective_steps_effort_check
      check (effort is null or effort in ('S', 'M', 'L'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'objective_steps_priority_check'
  ) then
    alter table public.objective_steps
      add constraint objective_steps_priority_check
      check (priority is null or priority in ('low', 'med', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'objective_steps_task_status_check'
  ) then
    alter table public.objective_steps
      add constraint objective_steps_task_status_check
      check (task_status is null or task_status in ('todo', 'in_progress', 'blocked', 'done'));
  end if;
end $$;

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'objective_steps'
--     and column_name in ('acceptance_criteria','effort','priority','task_status','blocked_by');
-- select conname from pg_constraint
--   where conname in (
--     'objective_steps_effort_check',
--     'objective_steps_priority_check',
--     'objective_steps_task_status_check');
