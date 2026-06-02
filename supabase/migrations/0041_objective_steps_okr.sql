-- 0041 — objective_steps pasa a modelo OKR de 2 niveles (KR → tareas).
--
-- ANTES (0040): objective_steps era PLANO — un objetivo (goals) tenía una lista
-- de pasos sueltos. La generación con IA salía abstracta y no había nivel
-- intermedio entre "objetivo" y "acción concreta".
--
-- AHORA: modelo OKR/agile. Cada fila de objective_steps es:
--   - un RESULTADO CLAVE (kind='key_result'): cuelga del objetivo (objective_id),
--     con parent_id NULL. Es un outcome medible del objetivo.
--   - una TAREA (kind='task'): cuelga de un KR (parent_id → objective_steps.id),
--     y conserva objective_id = el del objetivo (denormalizado, para queries y
--     RLS por objetivo sin join). Es la acción concreta/logística (la hoja).
--
-- El progreso del KR = rollup de sus tareas; el del objetivo = rollup de sus KRs
-- (la matemática vive en lib/objectives/steps.ts, no en SQL).
--
-- Migración ADITIVA e IDEMPOTENTE: sólo agrega 2 columnas + 1 FK self + 1 índice
-- + 1 check. RLS ya existe de 0040 (sin cambios). NADA destructivo.
--
-- BACKFILL automático: los pasos existentes de 0040 quedan como kind='key_result'
-- con parent_id NULL (el default de la columna nueva los cubre sin UPDATE) — es
-- decir, los "pasos" viejos se reinterpretan como KRs del objetivo, sin tareas.
-- Coherente: un KR sin tareas es válido (se juzga por su propio status).
--
-- FK self con ON DELETE CASCADE: borrar un KR limpia sus tareas. Borrar el
-- objetivo (goals) ya cascada a todas sus filas vía objective_id (0040).
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase (o vía el runner de
-- migraciones). El cliente ya tolera la ausencia de estas columnas (fromRow cae
-- a kind='key_result'/parent_id ausente), así que NO rompe nada antes de correr.

-- 1) Columna kind: discrimina KR de tarea. Default 'key_result' → backfill de
--    las filas de 0040 como KRs.
alter table public.objective_steps
  add column if not exists kind text not null default 'key_result';

-- 2) Columna parent_id: FK self. NULL = KR (cuelga del objetivo). No-NULL = tarea
--    (cuelga de un KR). ON DELETE CASCADE: borrar el KR borra sus tareas.
alter table public.objective_steps
  add column if not exists parent_id text
    references public.objective_steps(id) on delete cascade;

-- 3) Check de kind (idempotente: sólo si no existe ya el constraint).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'objective_steps_kind_check'
  ) then
    alter table public.objective_steps
      add constraint objective_steps_kind_check
      check (kind in ('key_result', 'task'));
  end if;
end $$;

-- 4) Índice para resolver las tareas de un KR (lookup por parent_id).
create index if not exists idx_objective_steps_parent
  on public.objective_steps (parent_id);

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'objective_steps' and column_name in ('kind','parent_id');
-- select conname from pg_constraint where conname = 'objective_steps_kind_check';
-- select kind, count(*) from public.objective_steps group by kind;
-- select id, kind, parent_id, objective_id, title
--   from public.objective_steps order by objective_id, parent_id nulls first, sort_order;
