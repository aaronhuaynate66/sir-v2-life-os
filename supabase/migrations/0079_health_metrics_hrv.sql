-- ============================================================
-- SIR V2 — Migration 0079: tipos hrv_min/max/avg en health_metrics
-- ============================================================
-- VFC / HRV (variabilidad de la frecuencia cardíaca) en MILISEGUNDOS — métrica
-- distinta de la FC (bpm). Se guarda como rango diario (mín/máx) + promedio.
-- ADITIVA, idempotente (drop + recreate del CHECK con los 3 valores extra).
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
    -- VFC/HRV (Migration 0079)
    'hrv_min', 'hrv_max', 'hrv_avg'
  )
);
