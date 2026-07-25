// SIR V2 — ¿La TENDENCIA del peso me saca de mi categoría antes del evento? PURO.
//
// POR QUÉ (docs/CABLEADO.md, cruce #4): el aviso de peso del Mundial mira la
// ÚLTIMA lectura contra la categoría y nada más. Eso no ve venir el problema.
//
// Caso real de Aaron (25-jul-2026): categoría **+80 kg**, peso 81.4 kg → "dentro
// de rango", cero alertas. Pero viene bajando ~0.7 kg/mes desde mayo: a ese ritmo
// toca 80.0 kg a fines de SEPTIEMBRE, seis semanas ANTES del Mundial (7-nov). Y
// mientras tanto su chequeo médico dice "sobrepeso, IMC 27.4" y todo el mundo
// —incluido SIR— lo empuja a seguir bajando.
//
// Los dos objetivos son legítimos y opuestos: bajar grasa es salud, mantenerse
// sobre 80 kg es competir. Nadie los estaba cruzando. Esto lo dice a tiempo, con
// números, sin decidir por él.
//
// Es análisis deportivo sobre SU propio dato, no consejo médico.

/** Una lectura de peso: fecha ISO (o YYYY-MM-DD) y kilos. */
export interface WeightReading {
  at: string
  kg: number
}

export interface WeightCategory {
  /** Piso de la categoría. Para "+80 kg" es 80. */
  minKg: number
  /** Techo, o null si la categoría es ABIERTA (el caso de "+80"). */
  maxKg: number | null
}

export type WeightRisk = 'ninguno' | 'vigilar' | 'alto'

export interface WeightTrendRisk {
  /** Ritmo en kg por mes (negativo = bajando). null si no hay serie suficiente. */
  kgPerMonth: number | null
  /** Kilos de margen contra el borde que la tendencia amenaza. */
  marginKg: number | null
  /** Días hasta cruzar el borde al ritmo actual. null si no va hacia él. */
  daysToEdge: number | null
  /** YYYY-MM-DD estimado del cruce. */
  edgeEtaDay: string | null
  /** Qué borde amenaza: el piso (se está quedando chico) o el techo. */
  edge: 'piso' | 'techo' | null
  risk: WeightRisk
}

const MIN_READINGS = 4
const WINDOW_DAYS = 45

function dayOf(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)
}

/**
 * Ritmo de cambio en kg/mes por mínimos cuadrados sobre la ventana reciente.
 * Regresión y no "primero contra último" porque el peso oscila ±1 kg por día
 * (hidratación, hora del pesaje): dos puntos sueltos inventan tendencias que no
 * existen. null si no hay lecturas suficientes o no hay rango de fechas. PURA.
 */
export function weightSlopePerMonth(
  readings: WeightReading[],
  now: Date,
  windowDays = WINDOW_DAYS,
): number | null {
  const since = now.getTime() - windowDays * 86_400_000
  const pts = readings
    .filter((r) => r && Number.isFinite(r.kg) && Number.isFinite(dayOf(r.at)) && dayOf(r.at) >= since)
    .map((r) => ({ t: dayOf(r.at) / 86_400_000, kg: r.kg }))
    .sort((a, b) => a.t - b.t)
  if (pts.length < MIN_READINGS) return null
  const n = pts.length
  const meanT = pts.reduce((s, p) => s + p.t, 0) / n
  const meanKg = pts.reduce((s, p) => s + p.kg, 0) / n
  let num = 0, den = 0
  for (const p of pts) { num += (p.t - meanT) * (p.kg - meanKg); den += (p.t - meanT) ** 2 }
  if (den === 0) return null
  return Math.round((num / den) * 30 * 100) / 100 // kg por día → kg por mes
}

/**
 * ¿La tendencia lo saca de categoría, y cuándo? PURA.
 *
 * `daysToEvent` calibra la gravedad: cruzar el piso DESPUÉS del evento no es
 * problema (ya compitió); cruzarlo antes sí, y cuanto más antes, peor.
 */
export function assessWeightTrend(
  readings: WeightReading[],
  category: WeightCategory,
  now: Date,
  daysToEvent: number | null,
): WeightTrendRisk {
  const empty: WeightTrendRisk = {
    kgPerMonth: null, marginKg: null, daysToEdge: null, edgeEtaDay: null, edge: null, risk: 'ninguno',
  }
  const slope = weightSlopePerMonth(readings, now)
  if (slope === null) return empty

  const last = [...readings]
    .filter((r) => Number.isFinite(r.kg) && Number.isFinite(dayOf(r.at)))
    .sort((a, b) => dayOf(a.at) - dayOf(b.at))
    .pop()
  if (!last) return { ...empty, kgPerMonth: slope }

  // ¿Hacia qué borde va? Bajando → el piso. Subiendo → el techo (si lo hay).
  const goingDown = slope < 0
  const edge: 'piso' | 'techo' | null = goingDown ? 'piso' : (category.maxKg !== null ? 'techo' : null)
  if (!edge) return { ...empty, kgPerMonth: slope } // sube y la categoría es abierta: no hay borde

  const margin = edge === 'piso' ? last.kg - category.minKg : (category.maxKg as number) - last.kg
  const speed = Math.abs(slope) / 30 // kg por día
  if (speed <= 0) return { ...empty, kgPerMonth: slope, marginKg: Math.round(margin * 10) / 10 }

  const daysToEdge = Math.round(margin / speed)
  const eta = new Date(now.getTime() + daysToEdge * 86_400_000).toISOString().slice(0, 10)

  // Riesgo: cruzar antes del evento es lo que importa. Sin fecha de evento,
  // dos meses es el horizonte razonable para reaccionar.
  const horizonte = daysToEvent ?? 60
  let risk: WeightRisk = 'ninguno'
  if (daysToEdge <= 0) risk = 'alto'
  else if (daysToEdge < horizonte) risk = daysToEdge < horizonte / 2 ? 'alto' : 'vigilar'

  return {
    kgPerMonth: slope,
    marginKg: Math.round(margin * 10) / 10,
    daysToEdge,
    edgeEtaDay: eta,
    edge,
    risk,
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "fines de septiembre" / "mediados de octubre". PURA. */
function fechaSuave(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  const mes = MESES[(m ?? 1) - 1] ?? ''
  const parte = d <= 10 ? 'principios' : d <= 20 ? 'mediados' : 'fines'
  return `${parte} de ${mes}`
}

/**
 * La línea para el brief. null si no hay nada que avisar. PURA.
 * Dice el número, la fecha estimada y la tensión real — no decide por él.
 */
export function renderWeightTrendLine(
  t: WeightTrendRisk,
  category: WeightCategory,
  currentKg: number | null,
  eventName = 'el Mundial',
): string | null {
  // "antes de el Mundial" → "antes del Mundial".
  const antesDe = eventName.startsWith('el ') ? `antes del ${eventName.slice(3)}` : `antes de ${eventName}`
  if (t.risk === 'ninguno' || !t.edge || t.kgPerMonth === null || t.daysToEdge === null) return null
  const ritmo = Math.abs(t.kgPerMonth).toFixed(1)
  const verbo = t.kgPerMonth < 0 ? 'bajando' : 'subiendo'
  const borde = t.edge === 'piso' ? `el piso de tu categoría (${category.minKg} kg)` : `el techo (${category.maxKg} kg)`
  const peso = currentKg !== null ? `${currentKg} kg` : 'tu peso'

  // La categoría del goal es la que ELIGIÓ pelear. Cruzar el piso no es una
  // bifurcación a evaluar: es perder su categoría. El aviso avisa — no le
  // propone reconsiderar dónde compite.
  if (t.daysToEdge <= 0) {
    return `Estás en ${peso} y ya cruzaste ${borde}: hoy no das el peso de tu categoría. Hay que recuperarlo antes del pesaje.`
  }
  const cuando = t.edgeEtaDay ? fechaSuave(t.edgeEtaDay) : `${t.daysToEdge} días`
  const consejo = t.edge === 'piso'
    ? 'Frena la bajada: si quieres perder grasa, que sea recomponiendo —más músculo, mismo peso— no soltando kilos.'
    : 'Conviene frenar la subida antes de que te saque de categoría.'
  return `Vienes ${verbo} ${ritmo} kg/mes y te quedan ${t.marginKg} kg hasta ${borde}: a este ritmo lo cruzas a ${cuando}, ${antesDe}. ${consejo}`
}
