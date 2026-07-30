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
  /** 'watch' = desvío leve; 'alert' = muchas señales, un desvío GRANDE, o varios
   *  días empeorando seguidos. */
  severity: 'watch' | 'alert'
  /** Señales adversas detectadas (etiquetas cortas, para debug/telemetría). */
  signals: string[]
  /** Línea calma para el brief/chat. */
  text: string
  /** Días consecutivos empeorando hasta el último con datos (0 = solo hoy). */
  diasEmpeorando: number
}

/**
 * Cuánto se pasó del umbral, como fracción. 0.35 = 35% más allá del borde.
 *
 * POR QUÉ EXISTE (fallo real, visto el 29-jul-2026): la severidad se decidía SOLO
 * contando cuántas señales cruzaban el umbral, sin mirar CUÁNTO. Con la data real
 * de Aaron —VFC 34 ms (su piso son 54) y FC en sueño 68 (su techo 55), dos días
 * después de un trauma facial y con tramadol— salían 2 señales de 4 y por lo tanto
 * "watch", con el cierre "puede ser una noche floja". Una VFC de 53 y una de 34
 * daban exactamente el mismo veredicto.
 */
function excesoRelativo(valor: number, umbral: number, direccion: 'debajo' | 'encima'): number {
  if (umbral <= 0) return 0
  const exceso = direccion === 'debajo' ? umbral - valor : valor - umbral
  return Math.max(0, exceso / umbral)
}

/** A partir de acá el desvío ya no es "una noche floja". */
const DESVIO_GRANDE = 0.2

/**
 * Días consecutivos empeorando, mirando hacia atrás desde el último con datos.
 *
 * Un día es peor que el anterior si la VFC bajó o la FC en sueño subió de forma
 * apreciable. El umbral mínimo evita contar el ruido normal noche a noche.
 *
 * POR QUÉ: el módulo miraba UN solo día. Tres días seguidos en caída monotónica
 * —VFC 55→49→34 y FC 53→58→68— dicen algo muy distinto que una noche mala, y esa
 * es justo la diferencia entre "ojo con el ritmo de hoy" y "esto lleva tres días".
 */
export function diasEmpeorandoSeguidos(recent: DailyVitals[]): number {
  const serie = (recent ?? [])
    .filter((d) => d && typeof d.date === 'string')
    .filter((d) => typeof d.hrvAvg === 'number' || typeof d.sleepingHr === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  let racha = 0
  for (let i = serie.length - 1; i > 0; i--) {
    const hoy = serie[i], ayer = serie[i - 1]
    const vfcPeor = typeof hoy.hrvAvg === 'number' && typeof ayer.hrvAvg === 'number' && hoy.hrvAvg <= ayer.hrvAvg - 3
    const fcPeor = typeof hoy.sleepingHr === 'number' && typeof ayer.sleepingHr === 'number' && hoy.sleepingHr >= ayer.sleepingHr + 2
    if (!vfcPeor && !fcPeor) break
    racha++
  }
  return racha
}

/** Contexto que el caller conoce y el módulo no (vive en la DB). Sirve para que
 *  la línea no diga "puede ser una noche floja" cuando hay un trauma registrado. */
export interface VitalsContext {
  /** Evento reciente que explique la carga: trauma, cirugía, enfermedad. */
  eventoReciente?: string | null
  /** Cita médica próxima, para sugerir que lo mencione ahí. */
  citaProxima?: string | null
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
export function vitalsAnomaly(
  recent: DailyVitals[],
  ranges: VitalsRanges = DEFAULT_RANGES,
  contexto: VitalsContext = {},
): VitalsAlert | null {
  const day = latestWithData(recent ?? [])
  if (!day) return null

  const signals: string[] = []
  let desvioMaximo = 0
  const num = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null

  const hrv = num(day.hrvAvg)
  const hr = num(day.sleepingHr)
  const rr = num(day.respRate)
  const alerts = num(day.highHrAlerts)

  if (hrv !== null && hrv < ranges.hrvAvgMin) {
    signals.push('VFC baja')
    desvioMaximo = Math.max(desvioMaximo, excesoRelativo(hrv, ranges.hrvAvgMin, 'debajo'))
  }
  if (hr !== null && hr > ranges.sleepingHrMax) {
    signals.push('FC en reposo elevada')
    desvioMaximo = Math.max(desvioMaximo, excesoRelativo(hr, ranges.sleepingHrMax, 'encima'))
  }
  if (rr !== null && rr > ranges.respRateMax) {
    signals.push('respiración acelerada')
    desvioMaximo = Math.max(desvioMaximo, excesoRelativo(rr, ranges.respRateMax, 'encima'))
  }
  if (alerts !== null && alerts > ranges.highHrAlertsMax) {
    signals.push('varias alertas de FC elevada')
    // A propósito NO entra en `desvioMaximo`: es un CONTEO chico, así que el desvío
    // relativo se dispara sin querer decir nada (de 3 a 12 alertas da 300% y
    // escalaba el 14-jul a 'alert' cuando la FC solo estaba 3 pulsaciones arriba).
    // La magnitud solo tiene sentido en las señales continuas.
  }

  // Una sola señal desviada es ruido; exigimos al menos dos correlacionadas.
  if (signals.length < 2) return null

  const diasEmpeorando = diasEmpeorandoSeguidos(recent ?? [])

  // La severidad ya no sale solo de CONTAR señales: también escala si una se pasó
  // mucho del umbral, o si la caída lleva varios días seguidos. Con 2 señales
  // apenas al borde sigue siendo 'watch'; con la VFC 37% bajo su piso, no.
  const severity: VitalsAlert['severity'] =
    signals.length >= 3 || desvioMaximo >= DESVIO_GRANDE || diasEmpeorando >= 3 ? 'alert' : 'watch'

  const lista = signals.length === 2
    ? `${signals[0]} y ${signals[1]}`
    : `${signals.slice(0, -1).join(', ')} y ${signals[signals.length - 1]}`

  // La TENDENCIA se nombra, porque tres días en caída no es lo mismo que una noche
  // mala y es lo que separa "ojo con el ritmo de hoy" de "esto ya lleva días".
  const tendencia = diasEmpeorando >= 2
    ? ` Van ${diasEmpeorando} días seguidos empeorando, no es solo hoy.`
    : ''

  // Y si hay un evento que lo explique, se nombra en vez de sugerir que fue una
  // noche floja: decirle "dormiste mal" a alguien que tuvo un trauma hace dos días
  // es hacerle ruido con algo que él ya sabe por qué pasa.
  const porQue = contexto.eventoReciente
    ? ` Cuadra con ${contexto.eventoReciente}: el cuerpo sigue gastando en recuperarse.`
    : ''

  const queHacer = severity === 'alert'
    ? (contexto.citaProxima
        ? ` Hoy no fuerces —nada de carga ni entrenamiento—, hidrátate y duerme lo que puedas. Y menciónalo en ${contexto.citaProxima}: una FC en reposo así de alta y una VFC así de baja son datos que valen en consulta.`
        : ' Hoy no fuerces —nada de carga ni entrenamiento—, hidrátate y duerme lo que puedas. Si aparece fiebre o malestar, anótalo y consulta.')
    : ' Puede ser una noche floja o el cuerpo empezando a pedir pausa. Ojo con el ritmo de hoy.'

  return {
    severity, signals, diasEmpeorando,
    text: `Señales del cuerpo desviadas juntas: ${lista}.${tendencia}${porQue}${queHacer}`,
  }
}
