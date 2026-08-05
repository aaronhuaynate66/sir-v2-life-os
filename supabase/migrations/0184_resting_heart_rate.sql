-- SIR V2 — 0184: falta un tipo, y por eso se perdía un dato que Aaron ya había dado.
--
-- ═══ POR QUÉ ════════════════════════════════════════════════════════════════
--
-- El 4-ago-2026 mandó 19 capturas de la app de la balanza. Entre ellas, la
-- "Frecuencia cardíaca en reposo" de tres días: 45 (1-ago), 53 (2-ago), 50 (3-ago).
--
-- No se pudo cargar: `health_metrics_type_check` no tiene un tipo para eso. Los que
-- existen son otra medida —`sleeping_heart_rate` es el promedio DURANTE el sueño y
-- `heart_rate_avg` es el promedio del día—, y meterlo en `heart_rate` habría sido
-- peor: esa serie ya arrastra el problema de mezclar reposo real (43-53) con
-- lecturas de pie (hasta 115), y mezcladas cualquier detector canta.
--
-- Se dejó el dato afuera en vez de etiquetarlo mal. Esto abre el tipo correcto.
--
-- La FC en reposo importa por sí sola en su caso: es el marcador de recuperación que
-- el plan del Mundial sigue, y en un atleta con bradicardia fisiológica (43-53) un
-- salto a 60 dice algo que el promedio del día esconde.
--
-- Solo relaja el CHECK: no toca datos, no borra nada, es reversible.
-- Fuente de verdad de la lista: lib/health-metrics/labels.ts.

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
    'respiratory_rate',
    -- NUEVO: la FC en reposo que reporta el reloj, distinta del promedio del día y
    -- del promedio durante el sueño.
    'resting_heart_rate'
  )
);

-- Verificación (debe insertar sin error):
-- insert into health_metrics (id,user_id,type,value,unit,measured_at,source)
-- values ('chk:rhr', '<uid>', 'resting_heart_rate', 50, 'bpm', now(), 'manual')
-- on conflict (id) do nothing;
-- delete from health_metrics where id = 'chk:rhr';
