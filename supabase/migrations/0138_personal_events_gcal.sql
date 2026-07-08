-- 0138 — Vincular un plan personal a su evento en Google Calendar.
--
-- "Push de planes a Google" (sync bidireccional, Fase 2): cuando SIR crea un
-- personal_event en el Google Calendar del usuario, guardamos el id del evento de
-- Google acá para (a) marcar el plan como "ya agendado en Google" en la UI y
-- (b) no duplicarlo si se vuelve a tocar el botón. Nullable = plan sin empujar.
-- Aditiva, idempotente.

alter table public.personal_events
  add column if not exists gcal_event_id text;

comment on column public.personal_events.gcal_event_id is
  'Id del evento en Google Calendar si el plan fue empujado (POST /api/personal-events/[id]/push-to-google). null = no empujado.';
