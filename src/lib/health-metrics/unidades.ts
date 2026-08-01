// SIR V2 — UNA unidad canónica por métrica de salud. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Cada importador declaraba sus propias unidades, y no coincidían:
//
//   `capture/scale/types.ts`   bmi: ''      metabolic_rate_kcal: 'kcal'   body_score: 'pts'
//   `health/ingest/parse.ts`   heart_rate: 'lpm'   sleeping_heart_rate: 'lpm'
//
// Resultado medido en la base el 1-ago-2026: **8 métricas con unidades mezcladas**.
// `heart_rate` tenía `lpm` (33 filas), `bpm` (6) y `ppm` (10) — la misma cantidad
// escrita de tres formas. Y `respiratory_rate` tenía una fila en `ppm`, que es la
// unidad del pulso: copiada del bloque de al lado.
//
// No es cosmético: la unidad se MUESTRA junto al número y se usa para agrupar. Tres
// etiquetas para lo mismo parte una serie en tres, y una unidad equivocada le dice
// a Aaron que su frecuencia respiratoria son pulsaciones.
//
// La causa de fondo es que la unidad vivía junto a CADA importador en vez de junto a
// la MÉTRICA. Mientras siga así, cada importador nuevo vuelve a divergir.
//
// Canónicas en CASTELLANO, que es lo que él lee: `ppm` (pulsaciones por minuto), no
// `bpm`. [[idioma-espanol-peru]]
//
// PURO: cero red, cero DB.

/** La unidad canónica de cada métrica. La clave es el `health_metrics.type`. */
export const UNIDAD_CANONICA: Readonly<Record<string, string>> = {
  // Composición corporal
  weight: 'kg',
  bmi: 'kg/m2',
  body_fat_percent: '%',
  muscle_mass_kg: 'kg',
  skeletal_muscle_mass_kg: 'kg',
  bone_mass_kg: 'kg',
  water_percent: '%',
  protein_percent: '%',
  visceral_fat_level: 'nivel',
  metabolic_rate_kcal: 'kcal/d',
  metabolic_age: 'años',
  body_score: 'puntos',
  ideal_weight_kg: 'kg',
  // Cardio. `ppm` = pulsaciones por minuto (no 'bpm', no 'lpm').
  heart_rate: 'ppm',
  heart_rate_min: 'ppm',
  heart_rate_max: 'ppm',
  heart_rate_avg: 'ppm',
  sleeping_heart_rate: 'ppm',
  heart_rate_high_alerts: 'veces',
  hrv_avg: 'ms',
  hrv_min: 'ms',
  hrv_max: 'ms',
  vo2max: 'ml/kg·min',
  // Respiratorio / sangre
  blood_oxygen: '%',
  respiratory_rate: 'resp/min',
  // Actividad
  steps: 'pasos',
  active_energy: 'kcal',
  resting_energy: 'kcal',
  distance_km: 'km',
}

/**
 * La unidad que corresponde a una métrica. PURA.
 *
 * Si la métrica no está en el mapa devuelve la unidad recibida (o ''), en vez de
 * inventar una: una métrica nueva no debería quedarse sin unidad solo porque nadie
 * la agregó acá todavía. Pero si SÍ está en el mapa, **la canónica gana** — es el
 * punto entero del módulo, y por eso no acepta que el caller la sobreescriba.
 */
export function unidadDe(type: string, recibida?: string | null): string {
  const canonica = UNIDAD_CANONICA[type]
  if (canonica !== undefined) return canonica
  return (recibida ?? '').trim()
}

/** ¿La unidad recibida difiere de la canónica? PURA. Para loguear divergencias. */
export function unidadDivergente(type: string, recibida?: string | null): boolean {
  const canonica = UNIDAD_CANONICA[type]
  if (canonica === undefined) return false
  const r = (recibida ?? '').trim()
  return r !== '' && r !== canonica
}
