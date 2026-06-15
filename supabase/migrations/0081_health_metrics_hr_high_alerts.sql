-- ============================================================
-- SIR V2 — Migration 0081: tipo heart_rate_high_alerts en health_metrics
-- ============================================================
-- Conteo de ALERTAS DE FC ELEVADA por día (las que el wearable muestra en el
-- panel de FC). El extractor ya las leía (high_alerts) pero quedaban enterradas
-- en la nota de la fila de reposo → invisibles. Ahora son métrica propia, para
-- un panel de "días con alerta". Señal EPISÓDICA (conteo), no una medición.
-- ADITIVA, idempotente (drop + recreate del CHECK con el valor extra).
-- ============================================================

alter table public.health_metrics drop constraint if exists health_metrics_type_check;
alter table public.health_metrics add constraint health_metrics_type_check check (
  type in (
    'weight', 'blood_pressure', 'heart_rate', 'steps', 'calories', 'hydration', 'custom',
    'bmi', 'body_fat_percent', 'muscle_mass_kg', 'bone_mass_kg', 'water_percent',
    'protein_percent', 'visceral_fat_level', 'metabolic_rate_kcal',
    'skeletal_muscle_mass_kg', 'metabolic_age', 'body_score', 'ideal_weight_kg',
    'active_energy', 'resting_energy', 'vo2_max', 'blood_oxygen', 'distance_km',
    'heart_rate_min', 'heart_rate_max', 'heart_rate_avg', 'sleeping_heart_rate',
    'hrv_min', 'hrv_max', 'hrv_avg',
    -- Alertas de FC elevada (Migration 0081)
    'heart_rate_high_alerts'
  )
);
