-- 0134 — Reparar drift del check de health_metrics.type.
--
-- HALLAZGO (08-jul-2026, verificado contra la DB real): el constraint
-- health_metrics_type_check EN VIVO no incluye 'hrv_avg' (rechaza el insert),
-- aunque el texto de 0082 sí lo lista y la app lo ESCRIBE (captura de FC/VFC →
-- lib/health-metrics/labels.ts tiene hrv_avg = 'VFC'). O sea: en prod, guardar
-- el promedio de VFC de una captura falla silenciosamente por el check viejo.
--
-- Esta migración RE-ASSERTA el check con la lista canónica completa (idéntica a
-- la de 0082 + hrv_avg), de forma idempotente. Aditiva: solo AMPLÍA los valores
-- permitidos; no toca datos. Fuente de verdad: lib/health-metrics/labels.ts.

alter table public.health_metrics drop constraint if exists health_metrics_type_check;
alter table public.health_metrics add constraint health_metrics_type_check check (
  type in (
    'weight', 'blood_pressure', 'heart_rate', 'steps', 'calories', 'hydration', 'custom',
    'bmi', 'body_fat_percent', 'muscle_mass_kg', 'bone_mass_kg', 'water_percent',
    'protein_percent', 'visceral_fat_level', 'metabolic_rate_kcal',
    'skeletal_muscle_mass_kg', 'metabolic_age', 'body_score', 'ideal_weight_kg',
    'active_energy', 'resting_energy', 'vo2_max', 'blood_oxygen', 'distance_km',
    'heart_rate_min', 'heart_rate_max', 'heart_rate_avg', 'sleeping_heart_rate',
    'hrv_min', 'hrv_max', 'hrv_avg', 'heart_rate_high_alerts',
    'respiratory_rate'
  )
);

-- Verificación:
-- insert into health_metrics (id,user_id,type,value,unit,measured_at,source)
--   values ('probe',auth.uid(),'hrv_avg',67,'ms',now(),'manual'); -- debe pasar
