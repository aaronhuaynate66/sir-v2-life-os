-- 0139 — Vincular una tarea de objetivo a su evento en Google Calendar.
--
-- "Push de tareas a Google" (extiende el push de planes, #633). Cuando SIR
-- empuja una tarea (objective_steps con target_date) al Google Calendar del
-- usuario, guarda el id del evento de Google para marcar "ya agendada" y no
-- duplicar. Nullable = no empujada. Aditiva, idempotente.
--
-- NOTA: el adapter del store (objectiveSteps.ts `toRow`) NO escribe esta columna,
-- así que un upsert del store la PRESERVA (Postgres ON CONFLICT solo toca las
-- columnas provistas). La escribe únicamente el route de push (server-side).

alter table public.objective_steps
  add column if not exists gcal_event_id text;

comment on column public.objective_steps.gcal_event_id is
  'Id del evento en Google Calendar si la tarea fue empujada. null = no empujada. La escribe solo el route push-to-google; el sync del store la preserva.';
