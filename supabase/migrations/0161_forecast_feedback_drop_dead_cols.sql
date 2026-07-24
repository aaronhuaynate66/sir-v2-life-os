-- 0161 — Limpieza: forecast_feedback.intensity y .note eran DEAD STORAGE.
-- La ruta las validaba/escribía pero la UI (FeedbackBox) nunca las enviaba
-- (siempre null) y ningún lector las consumía (recalibrate usa `label`). Se
-- quitan del schema junto con su manejo en la ruta. Reversible: re-agregar
-- columnas nullable si en el futuro se recolectan de verdad.

alter table public.forecast_feedback
  drop column if exists intensity,
  drop column if exists note;
