-- 0061 — objective_steps: hora del día opcional para tareas (`due_time`).
--
-- CONTEXTO: `target_date` es columna `date` (sin componente horario), por eso
-- toda tarea cuya fecha es HOY cae en la sección "Vencen hoy" de /horario y nunca
-- en una franja del timeline de la vista Día. Decisión (no migrar el TIPO de
-- target_date — riesgoso para data existente): agregar una columna NUEVA y
-- opcional con SOLO la hora.
--
-- AGREGA (NULLABLE → 100% backward-compatible; KRs y tareas sin hora la dejan NULL):
--   - due_time : hora del día en formato 'HH:MM' 24h (reloj Lima). Sólo tiene
--                sentido junto a `target_date` (una hora sin fecha no ubica nada
--                en ningún día); el cliente sólo la guarda cuando hay fecha, pero
--                el check NO la acopla a target_date (mantiene la columna simple).
--
-- El "due date" sigue siendo `target_date` (date-only). /horario combina
-- target_date + due_time en reloj Lima (lib/horario/dayPlan) para ubicar la tarea
-- en su franja; sin due_time la tarea sigue cayendo en "Vencen hoy".
--
-- Migración ADITIVA e IDEMPOTENTE: sólo agrega una columna + 1 check. RLS ya
-- existe de 0040 (sin cambios). NADA destructivo, NADA de backfill.
--
-- SYNC LOCAL-FIRST + REALTIME: el adapter (lib/supabase/sync/adapters/
-- objectiveSteps.ts) ya mapea dueTime ↔ due_time. Igual que las columnas
-- Jira-light de 0050, la nueva columna viaja por el upsert/realtime existente
-- SIN tocar la publicación (las filas de objective_steps ya se replican enteras),
-- así que NO se modifica supabase_realtime acá.
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase (o vía el runner). El cliente
-- ya tolera la ausencia de esta columna (fromRow cae a undefined / coerceDueTime),
-- así que NO rompe nada antes de correrla.

-- 1) Hora del día (opcional).
alter table public.objective_steps
  add column if not exists due_time text;

-- 2) Check de formato 'HH:MM' 24h (idempotente). Permite NULL (campo opcional).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'objective_steps_due_time_check'
  ) then
    alter table public.objective_steps
      add constraint objective_steps_due_time_check
      check (due_time is null or due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'objective_steps' and column_name = 'due_time';
-- select conname from pg_constraint where conname = 'objective_steps_due_time_check';
