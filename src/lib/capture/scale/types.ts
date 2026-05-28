// SIR V2 — Scale capture types (Fase post-3a)
// Mapeo entre lo que retorna Claude Vision y nuestro HealthMetricType.

import type { HealthMetricType } from '@/types'

/**
 * Las 13 metricas que Mi Scale / Renpho / Garmin / Withings / Fitbit
 * tipicamente reportan. Cada una mapea 1:1 a un HealthMetricType + unit.
 */
export type ScaleMetric =
  | 'weight_kg'
  | 'bmi'
  | 'body_fat_percent'
  | 'muscle_mass_kg'
  | 'bone_mass_kg'
  | 'water_percent'
  | 'protein_percent'
  | 'visceral_fat_level'
  | 'metabolic_rate_kcal'
  | 'skeletal_muscle_mass_kg'
  | 'metabolic_age'
  | 'body_score'
  | 'ideal_weight_kg'

export const SCALE_METRICS_ORDER: readonly ScaleMetric[] = [
  'weight_kg',
  'bmi',
  'body_fat_percent',
  'muscle_mass_kg',
  'bone_mass_kg',
  'water_percent',
  'protein_percent',
  'visceral_fat_level',
  'metabolic_rate_kcal',
  'skeletal_muscle_mass_kg',
  'metabolic_age',
  'body_score',
  'ideal_weight_kg',
] as const

/**
 * Mapeo a HealthMetricType + unit canonica. Una entrada por ScaleMetric.
 * weight_kg comparte type con la metrica de peso existente (no es nueva).
 */
export const SCALE_METRIC_MAPPING: Record<
  ScaleMetric,
  { healthType: HealthMetricType; unit: string; label: string }
> = {
  weight_kg:               { healthType: 'weight',                  unit: 'kg',    label: 'Peso' },
  bmi:                     { healthType: 'bmi',                     unit: '',      label: 'IMC' },
  body_fat_percent:        { healthType: 'body_fat_percent',        unit: '%',     label: 'Grasa corporal' },
  muscle_mass_kg:          { healthType: 'muscle_mass_kg',          unit: 'kg',    label: 'Masa muscular' },
  bone_mass_kg:            { healthType: 'bone_mass_kg',            unit: 'kg',    label: 'Masa ósea' },
  water_percent:           { healthType: 'water_percent',           unit: '%',     label: 'Agua corporal' },
  protein_percent:         { healthType: 'protein_percent',         unit: '%',     label: 'Proteína' },
  visceral_fat_level:      { healthType: 'visceral_fat_level',      unit: 'nivel', label: 'Grasa visceral' },
  metabolic_rate_kcal:     { healthType: 'metabolic_rate_kcal',     unit: 'kcal',  label: 'Metab. basal' },
  skeletal_muscle_mass_kg: { healthType: 'skeletal_muscle_mass_kg', unit: 'kg',    label: 'Masa muscular esqueletal' },
  metabolic_age:           { healthType: 'metabolic_age',           unit: 'años',  label: 'Edad metabólica' },
  body_score:              { healthType: 'body_score',              unit: 'pts',   label: 'Score corporal' },
  ideal_weight_kg:         { healthType: 'ideal_weight_kg',         unit: 'kg',    label: 'Peso ideal' },
}

/**
 * JSON estricto que devuelve el endpoint /api/capture/scale.
 * Las metricas son opcionales — Vision solo retorna las que detecto.
 */
export interface ScaleCaptureExtracted {
  /** ISO 8601 con offset si el screenshot tiene fecha+hora legibles. null si no. */
  measured_at: string | null
  /** Subset de las 13 metricas — sólo las detectadas con confianza */
  metrics: Partial<Record<ScaleMetric, number>>
  confidence: 'high' | 'medium' | 'low'
  /** Notas breves del modelo en español (max ~200 chars) */
  raw_observations?: string
}

/** Error response del endpoint */
export interface ScaleCaptureError {
  error: string
  detail?: string
}
