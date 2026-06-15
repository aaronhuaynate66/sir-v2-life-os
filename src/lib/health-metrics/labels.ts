// SIR V2 — Labels en español para tipos de health_metrics.
// Single source of truth — consumido por /self, /timeline y cualquier UI
// que muestre métricas. La fuente de verdad anterior estaba duplicada
// (sólo en el timeline adapter); este modulo la unifica.

import type { HealthMetricType } from '@/types'

export const HEALTH_METRIC_LABELS: Record<HealthMetricType, string> = {
  // Tipos pre-existentes (Fase 0-2)
  weight: 'Peso',
  blood_pressure: 'Presión',
  heart_rate: 'Ritmo cardíaco',
  steps: 'Pasos',
  calories: 'Calorías',
  hydration: 'Hidratación',
  custom: 'Custom',

  // Tipos nuevos de Captura Báscula (Migration 0005)
  bmi: 'IMC',
  body_fat_percent: 'Grasa corporal',
  muscle_mass_kg: 'Masa muscular',
  bone_mass_kg: 'Masa ósea',
  water_percent: 'Agua corporal',
  protein_percent: 'Proteína',
  visceral_fat_level: 'Grasa visceral',
  metabolic_rate_kcal: 'Metab. basal',
  skeletal_muscle_mass_kg: 'Masa musc. esquelet.',
  metabolic_age: 'Edad metabólica',
  body_score: 'Score corporal',
  ideal_weight_kg: 'Peso ideal',

  // Tipos de Apple Health (Migration 0049)
  active_energy: 'Energía activa',
  resting_energy: 'Energía en reposo',
  vo2_max: 'VO₂ máx',
  blood_oxygen: 'Oxígeno en sangre',
  distance_km: 'Distancia',
  // FC: 'heart_rate' = reposo (señal principal). Estas son el rango diario.
  heart_rate_min: 'FC mínima',
  heart_rate_max: 'FC máxima',
  heart_rate_avg: 'FC promedio',
  sleeping_heart_rate: 'FC durante el sueño',
  // VFC / HRV en milisegundos (Migration 0079)
  hrv_min: 'VFC mínima',
  hrv_max: 'VFC máxima',
  hrv_avg: 'VFC',
}

/**
 * Devuelve el label en español o el `type` crudo como fallback (debería
 * ser inalcanzable porque el Record cubre todos los HealthMetricType).
 */
export function getHealthMetricLabel(type: HealthMetricType): string {
  return HEALTH_METRIC_LABELS[type] ?? type
}
