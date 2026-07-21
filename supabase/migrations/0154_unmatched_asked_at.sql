-- 0154 — unmatched_social_activity.asked_at: throttle del "¿quién es quién?".
--
-- SIR pregunta por Telegram quién es cada handle sin asignar. Para no re-preguntar
-- lo mismo cada noche, marcamos cuándo se preguntó. NULL = todavía no preguntado.
-- Aditivo.

alter table public.unmatched_social_activity
  add column if not exists asked_at timestamptz;

comment on column public.unmatched_social_activity.asked_at is
  'Cuándo SIR preguntó por Telegram "¿quién es este handle?". NULL = sin preguntar. Evita re-preguntar.';
