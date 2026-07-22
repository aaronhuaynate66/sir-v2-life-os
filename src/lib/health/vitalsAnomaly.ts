// SIR V2 — Detección de anomalías en signos vitales (cerrar el gap salud→aviso).
//
// La báscula/anillo ya vuelca a health_metrics VFC, FC en sueño, frecuencia
// respiratoria y alertas de FC elevada. Cuando VARIAS de esas señales se
// desvían adversamente el mismo día, es el patrón de un cuerpo bajo carga
// (incubando algo, fiebre, estrés agudo, mala recuperación). UNA sola señal
// desviada es ruido; la fuerza está en la correlación multi-señal.
//
// El 15-jul-2026 Aaron estaba enfermo y las 4 señales gritaban a la vez, pero
// SIR no dijo nada. Esto cierra ese hueco: devuelve UNA línea calma para el
// brief/chat cuando el cuerpo lo pide. PURA (sin DB, sin React).
//
// Filosofía (igual que bodySignal): bienestar > alarma. NO es diagnóstico
// clínico ni consejo médico; nombra lo que los datos muestran e invita a
// cuidarse. Sin emoji, sin etiquetas de enfermedad.

/** Signos vitales de un día (los campos ausentes se ignoran). */
export interface DailyVitals {
  /** 'YYYY-MM-DD'. */
  date: string
  /** VFC promedio del sueño (ms). Bajar = peor recuperación. */
  hrvAvg?: number | null
  /** FC promedio durante el sueño (bpm). Subir = cuerpo trabajando. */
  sleepingHr?: number | null
  /** Frecuencia respiratoria promedio (rpm). Subir = carga. */
  respRate?: number | null
  /** Conteo de alertas de FC elevada del día. */
  highHrAlerts?: number | null
}

/** Umbrales adversos (el rango personal de Zepp de Aaron por defecto). Un valor
 *  por debajo (VFC) o por encima (resto) de estos cuenta como señal adversa. */
export interface VitalsRanges {
  hrvAvgMin: number
  sleepingHrMax: number
  respRateMax: number
  highHrAlertsMax: number
}

export const DEFAULT_RANGES: VitalsRanges = {
  hrvAvgMin: 54, // VFC prom < 54 ms → recuperación baja
  sleepingHrMax: 55, // FC sueño > 55 bpm → elevada
  respRateMax: 17, // respiración > 17 rpm → elevada
  highHrAlertsMax: 3, // > 3 alertas de FC en el día → muchas
}

export interface VitalsAlert {
  /** 'watch' = 2 señales; 'alert' = 3 o más. */
  severity: 'watch' | 'alert'
  /** Señales adversas detectadas (etiquetas cortas, para debug/telemetría). */
  signals: string[]
  /** Línea calma para el brief/chat. */
  text: string
}

/** El día más reciente con al menos una señal presente. */
function latestWithData(recent: DailyVitals[]): DailyVitals | null {
  const withData = recent
    .filter((d) => d && typeof d.date === 'string')
    .filter((d) => [d.hrvAvg, d.sleepingHr, d.respRate, d.highHrAlerts].some((v) => typeof v === 'number' && Number.isFinite(v)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  return withData[0] ?? null
}

/**
 * Detecta si el cuerpo muestra carga fisiológica (multi-señal) en el día más
 * reciente con datos. Devuelve una alerta calma, o null si <2 señales adversas.
 */
export function vitalsAnomaly(recent: DailyVitals[], ranges: VitalsRanges = DEFAULT_RANGES): VitalsAlert | null {
  const day = latestWithData(recent ?? [])
  if (!day) return null

  const signals: string[] = []
  const num = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null

  const hrv = num(day.hrvAvg)
  const hr = num(day.sleepingHr)
  const rr = num(day.respRate)
  const alerts = num(day.highHrAlerts)

  if (hrv !== null && hrv < ranges.hrvAvgMin) signals.push('VFC baja')
  if (hr !== null && hr > ranges.sleepingHrMax) signals.push('FC en reposo elevada')
  if (rr !== null && rr > ranges.respRateMax) signals.push('respiración acelerada')
  if (alerts !== null && alerts > ranges.highHrAlertsMax) signals.push('varias alertas de FC elevada')

  // Una sola señal desviada es ruido; exigimos al menos dos correlacionadas.
  if (signals.length < 2) return null

  const severity: VitalsAlert['severity'] = signals.length >= 3 ? 'alert' : 'watch'
  const lista = signals.length === 2
    ? `${signals[0]} y ${signals[1]}`
    : `${signals.slice(0, -1).join(', ')} y ${signals[signals.length - 1]}`

  const cierre = severity === 'alert'
    ? 'Tu cuerpo parece estar bajo carga (incubando algo, fiebre o mucho estrés). Prioriza descanso e hidratación hoy; si aparece malestar o fiebre, anótalo.'
    : 'Puede ser una noche floja o el cuerpo empezando a pedir pausa. Ojo con el ritmo de hoy.'

  return { severity, signals, text: `Señales del cuerpo desviadas juntas: ${lista}. ${cierre}` }
}
