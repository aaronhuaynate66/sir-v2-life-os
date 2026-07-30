// SIR V2 — ¿hay algo CARDÍACO que merece un especialista? (y el reporte para llevarle)
//
// PEDIDO DE AARON (30-jul-2026), textual: *"sería bueno, de antes de mandarme al
// cardiólogo, que SIR tenga un algoritmo o agente que detecte 'acá hay algo mal en
// el corazón', y ya con eso decirme: tienes que ir al cardiólogo a ver esto, y con
// esta data o reporte"*.
//
// EN QUÉ SE DIFERENCIA DE `vitalsAnomaly` (#1018). Ese mira UN día y dice "tu
// cuerpo está bajo carga" — estado agudo, se resuelve durmiendo. Esto mira SEMANAS
// y contesta una pregunta distinta: *¿este patrón necesita un cardiólogo?*
//
// EL PROBLEMA CENTRAL, Y POR QUÉ NO ES UN UMBRAL. Casi todo lo que sube la FC y
// baja la VFC **no es del corazón**: falta de sueño, alcohol, un resfrío, un golpe,
// deshidratación, sobreentrenamiento, calor, estrés. Un detector que grite con cada
// desviación manda a Aaron al cardiólogo cinco veces al mes y deja de servir. El
// caso del 27→30 jul lo muestra entero: tras el traumatismo facial del 27, la VFC
// cayó 98→34 y la FC en sueño subió 47→68 en tres días, y la noche del 30 volvió a
// 82 / 48 —dentro de su rango personal— sola. Eso NO es cardíaco: es una respuesta
// inflamatoria que se resolvió, y el sistema tiene que poder decirlo.
//
// Por eso la lógica es de DESCARTE, no de umbral:
//   1. ¿Hay una desviación real y sostenida, medida contra SU línea base?
//   2. ¿Hay un evento registrado que la explique (golpe, enfermedad, viaje)?
//   3. ¿Volvió a la línea base por sí sola?
// Solo se escala cuando hay desviación sostenida, SIN evento que la explique, y
// SIN recuperación. Ahí sí: "anda al cardiólogo a ver esto", con el reporte.
//
// LA TRAMPA DE LOS DATOS, MEDIDA EL 30-jul: `health_metrics.type='heart_rate'`
// es una serie MIXTA. Tiene FC en reposo real (43, 45, 51, 53 — `source='manual'`)
// y lecturas de la báscula de pie (49, 71, y un 115 del 30-jul que la app marcó
// "Alta"), que se toman parado, recién levantado y con el sensor menos confiable
// que existe. Meter las dos en la misma serie fabrica picos que cualquier detector
// leería como taquicardia. Por eso `CardioDay.restingHr` se construye SOLO con la
// fuente confiable y este módulo NUNCA recibe la lectura de báscula como FC de
// reposo — es la primera línea de defensa contra el falso positivo.
//
// NO ES DIAGNÓSTICO. No nombra enfermedades ni las insinúa. Describe series,
// desviaciones y duraciones, dice qué se descartó, y arma preguntas para que las
// conteste un médico. La decisión clínica es del cardiólogo, siempre.
//
// PURO: cero red, cero IA, cero DB. El "ahora" se inyecta.

/** Un día de señales cardíacas. Los campos ausentes se ignoran, no valen 0. */
export interface CardioDay {
  /** 'YYYY-MM-DD'. */
  date: string
  /**
   * FC en reposo (bpm) de FUENTE CONFIABLE. Nunca la lectura de una báscula de
   * bioimpedancia: se mide de pie y se va 60 bpm por encima de la real.
   */
  restingHr?: number | null
  /** FC promedio durante el sueño (bpm). La señal más estable que tiene. */
  sleepingHr?: number | null
  /** VFC promedio del sueño (ms). Baja = peor recuperación. */
  hrvAvg?: number | null
  /** SpO₂ promedio del sueño (%). */
  spo2?: number | null
  /** Frecuencia respiratoria promedio (rpm). */
  respRate?: number | null
}

/** Algo registrado que puede EXPLICAR una desviación sin que sea del corazón. */
export interface CardioEvent {
  /** 'YYYY-MM-DD' en que empezó. */
  date: string
  /** Cómo llamarlo en el reporte ("traumatismo facial", "resfrío"). */
  label: string
  /** Días que razonablemente puede seguir afectando al cuerpo. */
  ventanaDias?: number
}

/**
 * Rango personal del reloj (Zepp lo calcula con el histórico de Aaron). Se usa el
 * suyo y no una tabla poblacional: 48 bpm en sueño es normal PARA ÉL y sería
 * bradicardia para otro. Si no se conoce, se deriva de la línea base observada.
 */
export interface CardioRange {
  restingHrMax?: number
  sleepingHrMax?: number
  hrvMin?: number
  spo2Min?: number
  respRateMax?: number
}

export type CardioPattern =
  /** FC (reposo o sueño) por encima de su techo, varios días seguidos. */
  | 'fc_elevada_sostenida'
  /** VFC por debajo de su piso, varios días seguidos. */
  | 'vfc_deprimida_sostenida'
  /** FC sube y VFC baja a la vez: la firma del sistema autónomo bajo carga. */
  | 'desacople_autonomico'
  /** La línea base misma se corrió hacia arriba entre dos ventanas de 14 días. */
  | 'deriva_de_linea_base'
  /** Empezó hace tiempo y NUNCA volvió a la línea base. El disparador real. */
  | 'sin_recuperacion'
  /** SpO₂ baja + respiración alta: eje respiratorio, no cardíaco. Va aparte. */
  | 'senal_respiratoria'
  /**
   * UN día muy fuera de lo suyo, sin necesidad de racha. Es el único patrón que
   * justifica interrumpir a Aaron el mismo día: el 15-jul su VFC fue 18 ms con
   * una base de 66 (−73%) y su FC en sueño 88 — nadie le dijo nada ese día.
   * NO significa "algo del corazón": significa "hoy no cargues".
   */
  | 'anomalia_aguda'

export type CardioLevel =
  /** Nada que decir. */
  | 'ninguno'
  /** Hay desviación, pero está explicada por un evento o ya se recuperó. */
  | 'observar'
  /** Desviación sostenida, sin explicación y sin recuperación → especialista. */
  | 'consultar'

export interface CardioFinding {
  pattern: CardioPattern
  /** Qué se vio, en una línea, con los números. */
  detalle: string
  /** Días que lleva el patrón. */
  dias: number
  /** El evento registrado que lo explica, si hay alguno. */
  explicadoPor?: string
}

export interface CardioVerdict {
  level: CardioLevel
  findings: CardioFinding[]
  /** Línea para el chat/brief. null si no hay nada que decir. */
  text: string | null
  /** Serie que sostiene el veredicto, para que Aaron la pueda mirar. */
  baseline: CardioBaseline | null
}

export interface CardioBaseline {
  /** Mediana de los días con dato, por señal. */
  restingHr: number | null
  sleepingHr: number | null
  hrvAvg: number | null
  /** Cuántos días con al menos una señal entraron al cálculo. */
  n: number
}

/** Días seguidos desviado para que deje de ser una noche floja. */
export const DIAS_SOSTENIDO = 3
/**
 * Sin volver a la línea base por más de esto, la explicación "fue un golpe / un
 * virus" deja de alcanzar. 10 días es el margen del que una respuesta
 * inflamatoria aguda ya debería haber salido.
 */
export const DIAS_SIN_RECUPERAR = 10
/**
 * Días que tiene que durar un desacople (FC arriba + VFC abajo) para escalar por
 * sí solo. Menos que esto es indistinguible de un virus que aún no dio la cara.
 */
export const DIAS_DESACOPLE_ESCALA = 5
/**
 * Caída de VFC respecto de su referencia que califica como anomalía AGUDA de un
 * solo día. 40% es mucho más que la variación normal noche a noche (que en su
 * serie ronda el 15-20%) y deja fuera las noches simplemente flojas.
 */
export const AGUDA_CAIDA_VFC = 0.4
/** Exceso de FC en sueño sobre su referencia que califica como agudo. */
export const AGUDA_EXCESO_FC = 0.25
/** Cuánto tiene que correrse la mediana entre ventanas para llamarlo deriva. */
export const DERIVA_BPM = 5
/** Ventana de cada mitad al comparar derivas. */
export const VENTANA_DERIVA = 14
/** Margen por defecto de una ventana de evento, si el evento no lo trae. */
export const VENTANA_EVENTO_DIAS = 7

const DAY = 86_400_000

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY)
}

function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Percentil con interpolación lineal. null si no hay datos. */
function percentil(xs: number[], p: number): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  if (v.length === 1) return v[0]
  const i = p * (v.length - 1)
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo)
}

const num = (x: number | null | undefined): number | null =>
  typeof x === 'number' && Number.isFinite(x) ? x : null

/** Días ordenados del más viejo al más nuevo, sin duplicados de fecha. */
function ordenar(days: CardioDay[]): CardioDay[] {
  const porFecha = new Map<string, CardioDay>()
  for (const d of days) if (d?.date) porFecha.set(d.date, d)
  return [...porFecha.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Línea base de Aaron a partir de sus propios días. Mediana y no promedio: un
 * solo día malo no puede mover el piso contra el que se compara todo lo demás.
 */
export function computeBaseline(days: CardioDay[]): CardioBaseline | null {
  const ds = ordenar(days)
  if (ds.length === 0) return null
  const conAlgo = ds.filter((d) => num(d.restingHr) !== null || num(d.sleepingHr) !== null || num(d.hrvAvg) !== null)
  if (conAlgo.length === 0) return null
  return {
    restingHr: median(ds.map((d) => num(d.restingHr)).filter((x): x is number => x !== null)),
    sleepingHr: median(ds.map((d) => num(d.sleepingHr)).filter((x): x is number => x !== null)),
    hrvAvg: median(ds.map((d) => num(d.hrvAvg)).filter((x): x is number => x !== null)),
    n: conAlgo.length,
  }
}

/**
 * Techos/pisos efectivos. El rango declarado por el reloj gana; si falta, se
 * derivan de una REFERENCIA ROBUSTA, que no es la mediana.
 *
 * POR QUÉ NO LA MEDIANA (el bug que tuvo este módulo antes de existir en prod):
 * si la desviación dura lo suficiente, se vuelve la mayoría de los datos y la
 * mediana se muda con ella — 12 de 20 días con FC 72 dan mediana 72, techo 80, y
 * el detector concluye que todo está normal justo cuando más pasa. Se defiende
 * solo mirando el LADO SANO de la distribución: percentil 25 para la FC (sano =
 * bajo) y 75 para la VFC (sano = alto). Así, aunque la mayoría de los días esté
 * mal, la referencia sigue siendo el Aaron de sus mejores noches.
 */
function limites(ds: CardioDay[], range?: CardioRange) {
  const hrs = ds.map((d) => num(d.sleepingHr)).filter((x): x is number => x !== null)
  const rest = ds.map((d) => num(d.restingHr)).filter((x): x is number => x !== null)
  const hrv = ds.map((d) => num(d.hrvAvg)).filter((x): x is number => x !== null)
  const refHr = percentil(hrs, 0.25)
  const refRest = percentil(rest, 0.25)
  const refHrv = percentil(hrv, 0.75)
  return {
    // Las referencias crudas salen también: la anomalía AGUDA se mide como
    // porcentaje contra ellas, no contra el techo.
    refHr, refHrv,
    // +8 bpm sobre su referencia absorbe la variación normal noche a noche sin
    // tragarse una elevación real.
    sleepingHrMax: range?.sleepingHrMax ?? (refHr !== null ? Math.round(refHr + 8) : null),
    restingHrMax: range?.restingHrMax ?? (refRest !== null ? Math.round(refRest + 10) : null),
    // La VFC es asimétrica: cae mucho más de lo que sube. -30% de su referencia.
    hrvMin: range?.hrvMin ?? (refHrv !== null ? Math.round(refHrv * 0.7) : null),
    spo2Min: range?.spo2Min ?? 94,
    respRateMax: range?.respRateMax ?? 18,
  }
}

/** Cuenta los días desviados al FINAL de la serie (racha vigente hoy). */
function rachaFinal(ds: CardioDay[], desviado: (d: CardioDay) => boolean | null): number {
  let n = 0
  for (let i = ds.length - 1; i >= 0; i--) {
    const v = desviado(ds[i])
    if (v === null) continue // día sin ese dato: no corta la racha ni la suma
    if (!v) break
    n++
  }
  return n
}

/** El evento que cubre esa fecha, si hay alguno. */
function eventoQueExplica(fecha: string, eventos: CardioEvent[]): CardioEvent | null {
  for (const e of eventos) {
    if (!e?.date) continue
    const d = dayDiff(fecha, e.date)
    if (d >= 0 && d <= (e.ventanaDias ?? VENTANA_EVENTO_DIAS)) return e
  }
  return null
}

/**
 * Diagnostica la serie. `now` solo se usa para saber cuál es "el último día":
 * si el reloj dejó de sincronizar, no se inventa nada — se razona sobre el
 * último día CON dato y se dice cuál es.
 */
export function assessCardio(
  days: CardioDay[],
  opts: { eventos?: CardioEvent[]; range?: CardioRange } = {},
): CardioVerdict {
  const ds = ordenar(days)
  const base = computeBaseline(ds)
  if (!base || ds.length < DIAS_SOSTENIDO) {
    return { level: 'ninguno', findings: [], text: null, baseline: base }
  }
  const eventos = opts.eventos ?? []
  const lim = limites(ds, opts.range)
  const ultimo = ds[ds.length - 1]
  const findings: CardioFinding[] = []

  // —— FC elevada sostenida ————————————————————————————————————————————————
  const fcAlta = (d: CardioDay): boolean | null => {
    const s = num(d.sleepingHr)
    const r = num(d.restingHr)
    if (s === null && r === null) return null
    if (s !== null && lim.sleepingHrMax !== null && s > lim.sleepingHrMax) return true
    if (r !== null && lim.restingHrMax !== null && r > lim.restingHrMax) return true
    return false
  }
  const rachaFc = rachaFinal(ds, fcAlta)
  if (rachaFc >= DIAS_SOSTENIDO) {
    const s = num(ultimo.sleepingHr)
    findings.push({
      pattern: 'fc_elevada_sostenida',
      dias: rachaFc,
      detalle: s !== null && base.sleepingHr !== null
        ? `FC en sueño ${s} bpm, ${rachaFc} días seguidos sobre tu techo (${lim.sleepingHrMax}); tu mediana es ${base.sleepingHr}`
        : `FC en reposo sobre tu techo (${lim.restingHrMax}) ${rachaFc} días seguidos`,
      explicadoPor: eventoQueExplica(ultimo.date, eventos)?.label,
    })
  }

  // —— VFC deprimida sostenida ————————————————————————————————————————————
  const vfcBaja = (d: CardioDay): boolean | null => {
    const h = num(d.hrvAvg)
    if (h === null) return null
    return lim.hrvMin !== null ? h < lim.hrvMin : false
  }
  const rachaVfc = rachaFinal(ds, vfcBaja)
  if (rachaVfc >= DIAS_SOSTENIDO) {
    findings.push({
      pattern: 'vfc_deprimida_sostenida',
      dias: rachaVfc,
      detalle: `VFC ${num(ultimo.hrvAvg)} ms, ${rachaVfc} días seguidos bajo tu piso (${lim.hrvMin}); tu mediana es ${base.hrvAvg}`,
      explicadoPor: eventoQueExplica(ultimo.date, eventos)?.label,
    })
  }

  // —— Desacople: las dos a la vez ————————————————————————————————————————
  // Vale más que la suma de las partes: FC arriba con VFC abajo es la firma del
  // sistema autónomo bajo carga, no de una noche corta.
  if (rachaFc >= DIAS_SOSTENIDO && rachaVfc >= DIAS_SOSTENIDO) {
    findings.push({
      pattern: 'desacople_autonomico',
      dias: Math.min(rachaFc, rachaVfc),
      detalle: `FC arriba y VFC abajo al mismo tiempo, ${Math.min(rachaFc, rachaVfc)} días`,
      explicadoPor: eventoQueExplica(ultimo.date, eventos)?.label,
    })
  }

  // —— Deriva de la línea base ————————————————————————————————————————————
  // Distinto de una racha: acá lo que se corrió es el piso, y eso una racha de 3
  // días no lo ve. Es el patrón que un chequeo anual sí notaría.
  if (ds.length >= VENTANA_DERIVA * 2) {
    const reciente = ds.slice(-VENTANA_DERIVA)
    const previo = ds.slice(-VENTANA_DERIVA * 2, -VENTANA_DERIVA)
    const mr = median(reciente.map((d) => num(d.sleepingHr)).filter((x): x is number => x !== null))
    const mp = median(previo.map((d) => num(d.sleepingHr)).filter((x): x is number => x !== null))
    if (mr !== null && mp !== null && mr - mp >= DERIVA_BPM) {
      findings.push({
        pattern: 'deriva_de_linea_base',
        dias: VENTANA_DERIVA,
        detalle: `tu FC en sueño típica pasó de ${mp} a ${mr} bpm entre las últimas dos quincenas`,
      })
    }
  }

  // —— Señal respiratoria (eje aparte, NO cardíaco) ————————————————————————
  const spo2 = num(ultimo.spo2)
  const rr = num(ultimo.respRate)
  if (spo2 !== null && spo2 < lim.spo2Min && rr !== null && rr > lim.respRateMax) {
    findings.push({
      pattern: 'senal_respiratoria',
      dias: 1,
      detalle: `SpO₂ ${spo2}% y respiración ${rr} rpm — eso apunta a la respiración durante el sueño, no al corazón`,
    })
  }

  // —— Anomalía AGUDA de UN día ————————————————————————————————————————————
  // El único patrón que justifica interrumpirlo el mismo día. No espera racha:
  // el 15-jul su VFC fue 18 con base 66 y su FC en sueño 88, y nadie le dijo
  // nada. Se mide como PORCENTAJE contra su referencia, no contra el techo,
  // porque lo que importa acá es la magnitud, no cruzar un borde.
  const hoyHrv = num(ultimo.hrvAvg)
  const hoyHr = num(ultimo.sleepingHr)
  const caidaVfc = hoyHrv !== null && lim.refHrv !== null && lim.refHrv > 0
    ? (lim.refHrv - hoyHrv) / lim.refHrv
    : null
  const excesoFc = hoyHr !== null && lim.refHr !== null && lim.refHr > 0
    ? (hoyHr - lim.refHr) / lim.refHr
    : null
  const agudoVfc = caidaVfc !== null && caidaVfc >= AGUDA_CAIDA_VFC
  const agudoFc = excesoFc !== null && excesoFc >= AGUDA_EXCESO_FC
  if (agudoVfc || agudoFc) {
    const partes: string[] = []
    if (agudoVfc) partes.push(`VFC ${hoyHrv} ms cuando lo tuyo es ~${Math.round(lim.refHrv!)} (${Math.round(caidaVfc! * 100)}% abajo)`)
    if (agudoFc) partes.push(`FC en sueño ${hoyHr} cuando lo tuyo es ~${Math.round(lim.refHr!)}`)
    findings.push({
      pattern: 'anomalia_aguda',
      dias: 1,
      detalle: partes.join(' y '),
      explicadoPor: eventoQueExplica(ultimo.date, eventos)?.label,
    })
  }

  // —— ¿Volvió a la línea base? ————————————————————————————————————————————
  // La pregunta que decide todo. Un episodio que se recuperó solo no manda a
  // nadie al cardiólogo, por fuerte que haya sido el pico.
  const hoyDesviado = fcAlta(ultimo) === true || vfcBaja(ultimo) === true
  if (!hoyDesviado && findings.length === 0) {
    // Se busca el episodio más reciente para poder decir que YA PASÓ.
    const episodio = episodioReciente(ds, fcAlta, vfcBaja)
    if (episodio) {
      return {
        level: 'observar',
        findings: [],
        baseline: base,
        text: `Tus señales del corazón volvieron a tu rango normal (${describeUltimo(ultimo, base)}). Entre el ${episodio.desde} y el ${episodio.hasta} estuvieron fuera${eventoQueExplica(episodio.desde, eventos) ? `, justo después de ${eventoQueExplica(episodio.desde, eventos)!.label}` : ''}, y se acomodaron solas. No hay nada acá que llevarle a un cardiólogo.`,
      }
    }
    return { level: 'ninguno', findings: [], text: null, baseline: base }
  }

  if (findings.length === 0) {
    return { level: 'ninguno', findings: [], text: null, baseline: base }
  }

  // —— Nivel ————————————————————————————————————————————————————————————————
  // Se escala solo si el patrón NO tiene evento que lo explique y ya lleva más
  // de lo que una causa aguda justifica.
  // La anomalía aguda NO cuenta para escalar: es de UN día por definición, y un
  // día extremo es casi siempre un virus, alcohol o cuatro horas de sueño. Su
  // urgencia es de OTRO tipo (no cargues hoy) y la resuelve `cardioSurface`.
  const cardiacos = findings.filter(
    (f) => f.pattern !== 'senal_respiratoria' && f.pattern !== 'anomalia_aguda',
  )
  const sinExplicar = cardiacos.filter((f) => !f.explicadoPor)
  const masLargo = Math.max(0, ...cardiacos.map((f) => f.dias))
  // El desacople pesa más que una señal sola, pero NO escala a los 3 días: FC
  // arriba con VFC abajo es también el patrón de un resfrío que todavía no dio
  // la cara. Se le exige durar.
  const escalar =
    sinExplicar.length > 0 &&
    (masLargo >= DIAS_SIN_RECUPERAR ||
      sinExplicar.some((f) => f.pattern === 'desacople_autonomico' && f.dias >= DIAS_DESACOPLE_ESCALA) ||
      sinExplicar.some((f) => f.pattern === 'deriva_de_linea_base'))

  // El día extremo habla PRIMERO, aunque haya otros patrones: es lo único que
  // cambia lo que Aaron hace hoy.
  const aguda = findings.find((f) => f.pattern === 'anomalia_aguda')
  if (aguda && !escalar) {
    return {
      level: 'observar',
      findings,
      baseline: base,
      text: `Anoche tu cuerpo quedó bastante fuera de lo tuyo: ${aguda.detalle}. Hoy no cargues${aguda.explicadoPor ? ` — encaja con ${aguda.explicadoPor}` : ''}. Un día así casi nunca es del corazón: suele ser un virus incubando, alcohol, o pocas horas. Si mañana sigue igual te lo vuelvo a decir, y si se repite varios días lo miramos en serio.`,
    }
  }

  if (escalar) {
    cardiacos.push({
      pattern: 'sin_recuperacion',
      dias: masLargo,
      detalle: `lleva ${masLargo} días sin volver a tu línea base y no hay nada registrado que lo explique`,
    })
    return {
      level: 'consultar',
      findings: cardiacos,
      baseline: base,
      text: `Esto ya no parece una mala racha: ${cardiacos[0].detalle}. Lleva ${masLargo} días y no hay nada registrado que lo explique — vale que lo vea un cardiólogo. Te armo el reporte con la serie para que llegues con datos, no con una sensación.`,
    }
  }

  const explicacion = cardiacos.find((f) => f.explicadoPor)?.explicadoPor
  return {
    level: 'observar',
    findings,
    baseline: base,
    text: explicacion
      ? `${cardiacos[0]?.detalle ?? findings[0].detalle}. Encaja con ${explicacion}, así que por ahora es eso y no el corazón. Lo sigo mirando: si en ${DIAS_SIN_RECUPERAR} días no vuelve a tu rango, cambia la conversación.`
      : `${findings[0].detalle}. Todavía es corto para sacar conclusiones — lo sigo mirando.`,
  }
}

/** El último tramo de días desviados que ya terminó (para decir "esto ya pasó"). */
function episodioReciente(
  ds: CardioDay[],
  fcAlta: (d: CardioDay) => boolean | null,
  vfcBaja: (d: CardioDay) => boolean | null,
): { desde: string; hasta: string } | null {
  let hasta: string | null = null
  let desde: string | null = null
  for (let i = ds.length - 1; i >= 0; i--) {
    const mal = fcAlta(ds[i]) === true || vfcBaja(ds[i]) === true
    if (mal) {
      if (hasta === null) hasta = ds[i].date
      desde = ds[i].date
    } else if (hasta !== null) {
      break
    }
  }
  return hasta && desde ? { desde, hasta } : null
}

function describeUltimo(d: CardioDay, base: CardioBaseline): string {
  const partes: string[] = []
  const s = num(d.sleepingHr)
  const h = num(d.hrvAvg)
  if (s !== null) partes.push(`FC en sueño ${s}`)
  if (h !== null) partes.push(`VFC ${h}`)
  if (partes.length === 0) return `mediana FC ${base.sleepingHr ?? '?'}`
  return partes.join(', ')
}

/**
 * El reporte para llevarle al médico — la segunda mitad del pedido de Aaron
 * ("y con esta data o reporte"). Texto plano, sin markdown: se manda por
 * Telegram, se copia a un mail o se lee en el consultorio desde el celular.
 *
 * Dice lo que se vio, contra qué se comparó, qué se descartó y qué preguntar.
 * NO propone un diagnóstico: las preguntas son para que las conteste el médico.
 */
export function construirReporte(
  v: CardioVerdict,
  days: CardioDay[],
  opts: { eventos?: CardioEvent[]; nombre?: string; hoy?: string } = {},
): string {
  const ds = ordenar(days)
  if (ds.length === 0 || !v.baseline) return 'Todavía no hay suficientes noches medidas para armar un reporte.'
  const L: string[] = []
  const quien = opts.nombre ?? 'Aaron'
  const hoy = opts.hoy ?? ds[ds.length - 1].date

  L.push(`REPORTE DE SEÑALES CARDÍACAS — ${quien} — ${hoy}`)
  L.push('')
  L.push('Generado por SIR a partir de mediciones de reloj y báscula. NO es un diagnóstico:')
  L.push('es la serie de datos ordenada para que la lea un médico.')
  L.push('')
  L.push(`LÍNEA BASE (mediana de ${v.baseline.n} días medidos)`)
  if (v.baseline.sleepingHr !== null) L.push(`  FC en sueño: ${v.baseline.sleepingHr} bpm`)
  if (v.baseline.restingHr !== null) L.push(`  FC en reposo: ${v.baseline.restingHr} bpm`)
  if (v.baseline.hrvAvg !== null) L.push(`  VFC (variabilidad): ${v.baseline.hrvAvg} ms`)
  L.push('')
  L.push('QUÉ SE OBSERVÓ')
  if (v.findings.length === 0) {
    L.push('  Sin desviaciones sostenidas al día de hoy.')
  } else {
    for (const f of v.findings) {
      L.push(`  · ${f.detalle}${f.explicadoPor ? ` — coincide con: ${f.explicadoPor}` : ''}`)
    }
  }
  L.push('')
  L.push(`SERIE DE LOS ÚLTIMOS ${Math.min(ds.length, 21)} DÍAS MEDIDOS`)
  L.push('  fecha        FC sueño   VFC    FC reposo   SpO2')
  for (const d of ds.slice(-21)) {
    const c = (x: number | null | undefined, w: number) => String(num(x) ?? '-').padStart(w)
    L.push(`  ${d.date}   ${c(d.sleepingHr, 6)}  ${c(d.hrvAvg, 5)}   ${c(d.restingHr, 8)}  ${c(d.spo2, 5)}`)
  }
  const eventos = opts.eventos ?? []
  if (eventos.length) {
    L.push('')
    L.push('CONTEXTO REGISTRADO EN ESAS FECHAS')
    for (const e of eventos) L.push(`  ${e.date} — ${e.label}`)
  }
  L.push('')
  L.push('QUÉ SE DESCARTÓ ANTES DE TRAER ESTO')
  L.push('  · Lecturas de báscula de pie: excluidas de la FC en reposo (sensor por los pies,')
  L.push('    se va decenas de bpm por encima de la real).')
  L.push('  · Días sueltos fuera de rango: no se reportan; se exige una racha sostenida.')
  L.push('  · Desviaciones que coinciden con un evento registrado (golpe, enfermedad) y que')
  L.push('    vuelven solas a la línea base: se marcan como explicadas, no se escalan.')
  L.push('')
  L.push('PREGUNTAS PARA EL MÉDICO')
  if (v.level === 'consultar') {
    L.push('  · ¿Esta desviación sostenida amerita un electrocardiograma o un Holter de 24 h?')
    L.push('  · ¿Conviene revisar tiroides, hemograma o hierro antes de mirar el corazón?')
    L.push('  · Con estos valores, ¿hay alguna restricción para entrenar en este momento?')
  } else {
    L.push('  · ¿Estos rangos son esperables para alguien de su edad y carga de entrenamiento?')
    L.push('  · ¿Qué valor o patrón sí ameritaría una consulta, para saber cuándo volver?')
  }
  L.push('')
  L.push('Cualquier decisión clínica es del médico. Este reporte solo ordena la data.')
  return L.join('\n')
}
