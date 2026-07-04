-- SIR V2 — Sueño de alta fidelidad, Fase 1 (SF·F1).
--
-- Hasta hoy `sleep_records` solo tenía data USABLE de duración + calidad 1-10.
-- Todo lo rico que Aaron da a diario (score 0-100 real, despertares, fases del
-- sueño en minutos) se aplastaba a PROSA en `notes` y ningún motor lo leía.
-- Esta migración rescata esos campos como columnas ESTRUCTURADAS para que F2
-- (lectura de calidad/continuidad) y F3 (cruce + predicción) puedan usarlos.
--
-- Todo NULLABLE y aditivo: las filas viejas quedan con NULL, los caminos que no
-- tienen el dato no escriben nada, nada se rompe (fail-open).

alter table public.sleep_records
  -- Puntuación de calidad tal como la reporta la app (0-100). NO confundir con
  -- `quality` (1-10, derivada con pérdida): esta es la fuente real.
  add column if not exists score       int,
  -- Cantidad de despertares durante la noche.
  add column if not exists awakenings  int,
  -- Fases del sueño en MINUTOS (cada app expone las que muestra).
  add column if not exists deep_min    int,
  add column if not exists light_min   int,
  add column if not exists rem_min     int,
  add column if not exists awake_min   int;

alter table public.sleep_records
  add constraint sleep_records_score_range      check (score is null or (score between 0 and 100)) not valid,
  add constraint sleep_records_awakenings_nonneg check (awakenings is null or awakenings >= 0)      not valid,
  add constraint sleep_records_deep_nonneg       check (deep_min is null or deep_min >= 0)          not valid,
  add constraint sleep_records_light_nonneg      check (light_min is null or light_min >= 0)        not valid,
  add constraint sleep_records_rem_nonneg        check (rem_min is null or rem_min >= 0)            not valid,
  add constraint sleep_records_awake_nonneg      check (awake_min is null or awake_min >= 0)        not valid;

comment on column public.sleep_records.score      is 'Puntuación de calidad 0-100 de la app (fuente real; quality 1-10 es derivada).';
comment on column public.sleep_records.awakenings is 'Cantidad de despertares durante la noche.';
comment on column public.sleep_records.deep_min   is 'Minutos de sueño profundo.';
comment on column public.sleep_records.light_min  is 'Minutos de sueño liviano/core.';
comment on column public.sleep_records.rem_min    is 'Minutos de sueño REM.';
comment on column public.sleep_records.awake_min  is 'Minutos de vigilia durante la noche.';
