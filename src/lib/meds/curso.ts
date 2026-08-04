// SIR V2 — Progreso de un curso de medicación. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 3-ago-2026: *"el conteo de todas esas medicinas en sir para tener un super
// registro historico"*.
//
// Antes solo existía un gráfico de barras de los últimos 14 días calculado en el
// navegador sobre las 200 últimas filas. No respondía la pregunta de un tratamiento:
// **¿cuántas me faltan?** Eso necesita saber lo ESPERADO, y lo esperado solo existe
// desde que hay recetas (mig 0183).

/** Un ítem de receta, con su pauta. */
export interface ItemCurso {
  id: string
  medName: string
  dose: string | null
  /** Tomas por día. Si viene `everyHours`, se deriva de ahí. */
  timesPerDay: number | null
  everyHours: number | null
  durationDays: number | null
  indication: string | null
}

export interface ProgresoItem {
  itemId: string
  medName: string
  dose: string | null
  /** Cuántas tomas se esperan en TODO el curso. null si la pauta no lo define. */
  esperadas: number | null
  tomadas: number
  /** Cuántas deberían estar tomadas A HOY (no al final del curso). */
  esperadasHoy: number | null
  /** esperadasHoy − tomadas, nunca negativo. null si no se puede calcular. */
  atrasadas: number | null
  /** Tomas registradas HOY. */
  tomadasHoy: number
  /**
   * Dosis de HOY que faltan. Es la métrica válida para un tratamiento CRÓNICO.
   *
   * ═══ POR QUÉ EXISTE, APARTE DE `atrasadas` ═══
   * El topiramato de Aaron empezó el 10-jul y lo toma todas las noches, pero nunca lo
   * registró en la app. `atrasadas` daba **25** y el panel lo pintaba en rojo, como si
   * se hubiera saltado 25 dosis. Lo que falta ahí es el REGISTRO, no el medicamento.
   * Un tratamiento sin fecha de fin no tiene deuda acumulada contra la cual atrasarse:
   * la única pregunta útil es "¿ya tomaste la de hoy?".
   */
  pendientesHoy: number | null
  /** Día del curso en que estamos, 1-based. null si aún no empezó. */
  diaActual: number | null
  terminado: boolean
}

/** Tomas por día que declara la pauta. `every_hours` gana si está. PURA. */
export function tomasPorDia(item: Pick<ItemCurso, 'timesPerDay' | 'everyHours'>): number | null {
  if (item.everyHours && item.everyHours > 0) {
    // 24/24 = 1 al día; 24/8 = 3 al día. Una pauta de más de un día (48 h) da
    // fracción a propósito: 0.5/día es correcto y el cálculo de esperadas lo usa.
    return 24 / item.everyHours
  }
  if (item.timesPerDay && item.timesPerDay > 0) return item.timesPerDay
  return null
}

/** Días transcurridos del curso a `hoy`, 1-based. null si empieza después. PURA. */
export function diaDelCurso(startedOn: string, hoy: string): number | null {
  const a = Date.parse(`${startedOn}T00:00:00Z`)
  const b = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (b < a) return null
  return Math.floor((b - a) / 86_400_000) + 1
}

/**
 * Progreso de un ítem. `tomadas` viene contado de `med_intakes`. PURA.
 *
 * `esperadasHoy` se topea a la duración: pasado el curso no sigue acumulando deuda.
 */
export function progresoDeItem(
  item: ItemCurso,
  startedOn: string,
  tomadas: number,
  hoy: string,
  tomadasHoy = 0,
): ProgresoItem {
  const porDia = tomasPorDia(item)
  const dia = diaDelCurso(startedOn, hoy)
  const dur = item.durationDays
  const esperadas = porDia !== null && dur !== null ? Math.round(porDia * dur) : null
  const diasContables = dia === null ? null : dur === null ? dia : Math.min(dia, dur)
  const esperadasHoy = porDia !== null && diasContables !== null ? Math.round(porDia * diasContables) : null
  const terminado = dur !== null && dia !== null && dia > dur
  return {
    itemId: item.id,
    medName: item.medName,
    dose: item.dose,
    esperadas,
    tomadas,
    esperadasHoy,
    atrasadas: esperadasHoy === null ? null : Math.max(0, esperadasHoy - tomadas),
    tomadasHoy,
    // Sólo si el curso está vivo y ya arrancó: pasado el final no falta nada hoy.
    pendientesHoy:
      porDia === null || dia === null || terminado ? null : Math.max(0, Math.round(porDia) - tomadasHoy),
    diaActual: dia,
    terminado,
  }
}

/**
 * Las tomas de HOY que ya se registraron para un ítem, dado el set de timestamps.
 * Se cuenta por día de Lima (offset fijo −05:00, Perú no tiene horario de verano).
 * PURA.
 */
export function tomasDeHoy(takenAtIso: readonly string[], hoy: string): number {
  let n = 0
  for (const t of takenAtIso ?? []) {
    const ms = Date.parse(t)
    if (!Number.isFinite(ms)) continue
    if (new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10) === hoy) n++
  }
  return n
}

/**
 * Dedupe de tomas por ráfaga: registros del MISMO medicamento a segundos de
 * distancia son un doble tap del botón, no dos tomas. PURA.
 *
 * ═══ POR QUÉ ═══
 * Medido el 3-ago-2026 en la data real: `med_intakes` tenía 35 filas pero solo ~15
 * eventos. Hay ráfagas de 3 y 4 registros con 1-2 segundos de diferencia (3-jul
 * 18:36:01/03/05/06; 12-jul 19:50:49/51/52/53). Contar las 35 infla el histórico y
 * arruina cualquier cuenta de adherencia — y sobre todo, para un fármaco con techo
 * de dosis diaria decir que tomó 4 cuando tomó 1 es peor que no contar.
 */
export const VENTANA_RAFAGA_MS = 60_000

export function dedupeRafagas(
  tomas: ReadonlyArray<{ name: string; takenAt: string }>,
  ventanaMs: number = VENTANA_RAFAGA_MS,
): Array<{ name: string; takenAt: string }> {
  const ordenadas = [...(tomas ?? [])]
    .filter((t) => t?.name && Number.isFinite(Date.parse(t.takenAt)))
    .sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt))
  const out: Array<{ name: string; takenAt: string }> = []
  const ultima = new Map<string, number>()
  for (const t of ordenadas) {
    const ms = Date.parse(t.takenAt)
    const prev = ultima.get(t.name)
    if (prev !== undefined && ms - prev < ventanaMs) continue
    ultima.set(t.name, ms)
    out.push(t)
  }
  return out
}
