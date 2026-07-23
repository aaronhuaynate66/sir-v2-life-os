// SIR V2 — "recordatorio de data faltante".
//
// Idea de Aaron: "que me diga falta el peso". SIR conoce la data que Aaron sube
// SIEMPRE (peso/composición, sueño, FC/VFC del día) y le avisa qué le falta en su
// última subida — sin listar 10 tipos crudos: los AGRUPA en bundles legibles.
//
// Todo PURO: recibe primitivos (tipo + fecha local YYYY-MM-DD), no toca la red ni
// el store. El caller (tarjeta en /salud) adapta sus datos a estas entradas.
//
// "Habitual" se DERIVA del propio historial (no hardcodeado): un bundle es
// habitual si su métrica-clave apareció en ≥ umbral de los días con data en la
// ventana. Así se adapta a lo que Aaron realmente registra y a cambios de sensor.

/** Una lectura mínima: qué tipo y en qué día local cayó. */
export interface Reading {
  type: string
  /** Día local en formato YYYY-MM-DD (el caller convierte measured_at a Lima). */
  day: string
}

export interface MissingBundle {
  key: string
  label: string
  /** Última vez que se registró (YYYY-MM-DD) o null si nunca en la ventana. */
  lastSeen: string | null
}

export interface MissingDataResult {
  /** El día más reciente con CUALQUIER data (su última subida). null si no hay. */
  referenceDay: string | null
  /** Bundles habituales que faltaron en referenceDay. Vacío = está al día. */
  missing: MissingBundle[]
  /** Todos los bundles habituales detectados (para debug/UI secundaria). */
  habitual: string[]
}

/** Un bundle = un grupo de tipos que Aaron sube junto (una captura). La métrica
 *  CLAVE define si el bundle "está" ese día (evita falsos faltantes por un tipo
 *  suelto). El orden define la prioridad de display. */
interface BundleDef {
  key: string
  label: string
  /** Métrica cuya presencia marca el bundle como registrado ese día. */
  keyType: string
  /** Todos los tipos que pertenecen al bundle (para lastSeen y habitualidad). */
  types: string[]
}

/** El pseudo-tipo del sueño (viene de sleep_records, no de health_metrics). */
export const SLEEP_TYPE = 'sleep'

export const HEALTH_BUNDLES: BundleDef[] = [
  {
    key: 'bascula',
    label: 'Báscula (peso y composición)',
    keyType: 'weight',
    types: ['weight', 'bmi', 'body_fat_percent', 'skeletal_muscle_mass_kg', 'muscle_mass_kg', 'visceral_fat_level', 'metabolic_rate_kcal', 'water_percent', 'bone_mass_kg', 'protein_percent', 'metabolic_age', 'body_score', 'ideal_weight_kg'],
  },
  {
    key: 'sueno',
    label: 'Sueño',
    keyType: SLEEP_TYPE,
    // FC/VFC/SpO₂/respiración "promedio" salen del panel de sueño → van acá.
    types: [SLEEP_TYPE, 'sleeping_heart_rate', 'hrv_avg', 'respiratory_rate', 'blood_oxygen'],
  },
  {
    key: 'fc_vfc_dia',
    label: 'FC y VFC del día',
    // "del día" = los RANGOS min/max del reloj (no los promedios de sueño).
    keyType: 'heart_rate_min',
    types: ['heart_rate_min', 'heart_rate_max', 'hrv_min', 'hrv_max'],
  },
]

/** "hoy" / "ayer" / "hace N días" / "sin registro" entre dos YYYY-MM-DD. */
export function relativeDayLabel(day: string | null, today: string): string {
  if (!day) return 'sin registro'
  if (day === today) return 'hoy'
  const [ay, am, ad] = day.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
  if (diff === 1) return 'ayer'
  if (diff < 1) return 'hoy'
  return `hace ${diff} días`
}

/**
 * Bloque para el prompt de SIR: qué data habitual falta. '' si está al día.
 * Instruye a mencionarlo con naturalidad, sin convertirlo en spam.
 */
export function renderMissingDataBlock(missing: MissingBundle[], today: string): string {
  if (missing.length === 0) return ''
  const items = missing.map((m) => `${m.label} (última vez: ${relativeDayLabel(m.lastSeen, today)})`).join('; ')
  return [
    'DATA DE SALUD QUE AARON SUELE REGISTRAR Y AÚN NO ESTÁ EN SU ÚLTIMA SUBIDA:',
    items + '.',
    'Si viene al caso —te saluda, pregunta por su salud/energía/día, o no hay algo más urgente— recuérdaselo en UNA línea, casual, y dile que te mande la captura para procesarla. No insistas ni lo repitas si ya se lo dijiste en este chat, y no lo metas a la fuerza si está en otro tema.',
  ].join('\n')
}

/** Resta `days` días a un YYYY-MM-DD (aritmética de calendario, sin tz). */
function minusDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Calcula qué bundles habituales faltaron en la última subida.
 *
 * @param readings  todas las lecturas (tipo + día local) — incluir el pseudo-tipo
 *                  'sleep' por cada noche registrada.
 * @param todayLocal día local de hoy (YYYY-MM-DD) — define la ventana.
 * @param lookbackDays ventana de análisis (default 14).
 */
export function computeMissingHealthData(
  readings: Reading[],
  todayLocal: string,
  lookbackDays = 14,
): MissingDataResult {
  const windowStart = minusDays(todayLocal, lookbackDays - 1)
  const inWindow = readings.filter((r) => r.day >= windowStart && r.day <= todayLocal && !!r.day)
  if (inWindow.length === 0) return { referenceDay: null, missing: [], habitual: [] }

  // Días con cualquier data en la ventana → base para el umbral de "habitual".
  const daysWithData = new Set(inWindow.map((r) => r.day))
  const D = daysWithData.size
  // Umbral adaptativo: con poca historia basta 2 días; con harta, ≥60% de los días.
  const threshold = Math.max(2, Math.ceil(0.6 * D))

  // Días por tipo.
  const daysByType = new Map<string, Set<string>>()
  for (const r of inWindow) {
    if (!daysByType.has(r.type)) daysByType.set(r.type, new Set())
    daysByType.get(r.type)!.add(r.day)
  }

  const referenceDay = [...daysWithData].sort().at(-1) ?? null

  const habitual: string[] = []
  const missing: MissingBundle[] = []
  for (const b of HEALTH_BUNDLES) {
    // Días en que el bundle "estuvo" = días de su métrica-clave.
    const keyDays = daysByType.get(b.keyType) ?? new Set<string>()
    const isHabitual = keyDays.size >= threshold
    if (!isHabitual) continue
    habitual.push(b.key)
    // ¿Faltó en la última subida? (su clave no está en referenceDay)
    if (referenceDay && !keyDays.has(referenceDay)) {
      // Última vez visto = el día más reciente de CUALQUIER tipo del bundle.
      let lastSeen: string | null = null
      for (const t of b.types) {
        const ds = daysByType.get(t)
        if (ds) for (const d of ds) if (!lastSeen || d > lastSeen) lastSeen = d
      }
      missing.push({ key: b.key, label: b.label, lastSeen })
    }
  }

  return { referenceDay, missing, habitual }
}
