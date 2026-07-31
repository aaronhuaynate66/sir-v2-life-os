// SIR V2 — Detector de DESPLOME de afecto. Robusto (mediana/MAD), PURO.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"por qué no tengo ninguna alerta de cómo viene mi relación
// con Diana si mis últimas conversaciones tan hasta las webas"*.
//
// El IAE ya medía el afecto por día (#924) y `summarizeAffection` ya lo resumía
// (#932). El problema es que ese resumen **promedia el ratio sobre 30 días**, y una
// media sobre una serie así de torcida la manda el pasado bueno:
//
//   Diana, medido el 31-jul: los días 6, 8, 10 y 13-jul traían ratios de 26.5, 20,
//   18 y 12.5. El **30-jul cayó a 0.3** (Gottman sano ≈ 5:1) con fricción 1.0.
//   La media de 30 días daba **7.3 → "muy positivo"**. El día después de la pelea.
//
// Diluir así no es un detalle de tuning: es la misma falla que `deriveLabel`, que
// promedia 3 `person_logs` y por eso un 4,4,4 → 2 nunca cruza su umbral de 2.3.
// **Una media no detecta un desplome; para eso hace falta detección robusta**, que
// es exactamente lo que pide la investigación del IAE (mediana/MAD, persistencia de
// varios días, z robusto) y lo que no se había implementado.
//
// ═══ REGLAS NO NEGOCIABLES (investigación IAE + doc 17) ══════════════════════
//
// · **Es un DISPARADOR DE CONVERSACIÓN, no un veredicto.** "Afecto expresado ≠
//   afecto sentido" (Floyd). Ningún texto de acá puede decir "te quiere menos".
// · **Línea base PERSONAL**, no un umbral universal: lo que es poco cariño para una
//   pareja es normal para otra. Sin base suficiente **se calla** y lo dice.
// · **Persistencia**: un día malo es un día malo. Hace falta que se sostenga, si no
//   se convierte en una alarma que suena por cada discusión y se vuelve ruido.
// · **Declara incertidumbre.** El tono con Aaron es de CUIDADO: la ansiedad lo
//   amplifica, y la data puede tranquilizarlo tanto como alertarlo.
//
// PURO: cero red, cero DB, cero IA.

import type { DailySignal } from './types'

/** Días activos recientes que forman la ventana "ahora". Persistencia mínima. */
export const VENTANA_RECIENTE = 3
/** Días activos de línea base (después de descontar la ventana reciente). */
export const VENTANA_BASE = 28
/** Mínimo de días de base para animarse a decir algo. Debajo, se calla. */
export const MIN_BASE = 14
/** z robusto que se considera desplome (negativo). */
export const Z_DESPLOME = -2
/** Ratio por debajo del cual el balance del día ya no es positivo (Gottman). */
export const RATIO_FLOJO = 1.2
/** Ratio de base que hace que la caída sea un CAMBIO y no el estado normal. */
export const RATIO_BASE_SANA = 3

export type SeveridadCaida = 'leve' | 'marcada'

export interface AffectionDrop {
  /** Días activos usados como línea base. */
  diasBase: number
  /** Mediana de afecto en la base (0..1). */
  afectoBase: number
  /** Mediana de afecto en los últimos días (0..1). */
  afectoReciente: number
  /** z robusto del afecto reciente contra la base (mediana/MAD). null si MAD = 0. */
  z: number | null
  /** Mediana del ratio de positividad en la base. */
  ratioBase: number
  /** Mediana del ratio de positividad reciente. */
  ratioReciente: number
  /** Qué disparó la señal. Vacío si no hay caída. */
  motivos: Array<'afecto' | 'balance'>
  severidad: SeveridadCaida
}

function mediana(ns: readonly number[]): number {
  if (ns.length === 0) return 0
  const s = [...ns].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Desviación absoluta mediana — el equivalente robusto del desvío estándar. */
function mad(ns: readonly number[], centro: number): number {
  if (ns.length === 0) return 0
  return mediana(ns.map((n) => Math.abs(n - centro)))
}

const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * ¿Se desplomó el afecto expresado? PURA.
 *
 * Devuelve null cuando **no hay base para decir nada** — que es distinto de "está
 * todo bien" y es la única respuesta honesta con pocos días. Devuelve un objeto con
 * `motivos: []` cuando hay base y NO hay caída.
 *
 * La serie se ordena por fecha acá: `buildDailySignals` agrupa en un Map y su orden
 * de salida sigue el de los mensajes, que el sustrato no garantiza ascendente.
 */
export function detectAffectionDrop(signals: readonly DailySignal[]): AffectionDrop | null {
  const activos = (signals ?? [])
    .filter((s) => s && s.messageCount > 0 && typeof s.date === 'string')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  if (activos.length < MIN_BASE + VENTANA_RECIENTE) return null

  const reciente = activos.slice(-VENTANA_RECIENTE)
  const base = activos.slice(0, -VENTANA_RECIENTE).slice(-VENTANA_BASE)
  if (base.length < MIN_BASE) return null

  const afectosBase = base.map((s) => s.affection)
  const afectoBase = mediana(afectosBase)
  const afectoReciente = mediana(reciente.map((s) => s.affection))
  const dispersion = mad(afectosBase, afectoBase)
  // 1.4826 · MAD ≈ σ para datos normales. Si la dispersión es 0 (base plana) el z no
  // existe: no se inventa un infinito, se deja null y el balance decide.
  const z = dispersion > 0 ? (afectoReciente - afectoBase) / (1.4826 * dispersion) : null

  const ratioBase = mediana(base.map((s) => s.positivityRatio))
  const ratioReciente = mediana(reciente.map((s) => s.positivityRatio))

  const motivos: Array<'afecto' | 'balance'> = []
  // (a) El cariño expresado cayó fuera de su propia variación normal.
  if (z !== null && z <= Z_DESPLOME) motivos.push('afecto')
  // (b) El balance dejó de ser positivo, VINIENDO de una base sana. Sin la segunda
  //     condición, una relación que siempre tuvo ratio bajo dispararía todos los días.
  if (ratioReciente < RATIO_FLOJO && ratioBase >= RATIO_BASE_SANA) motivos.push('balance')

  return {
    diasBase: base.length,
    afectoBase: r2(afectoBase),
    afectoReciente: r2(afectoReciente),
    z: z === null ? null : r1(z),
    ratioBase: r1(ratioBase),
    ratioReciente: r1(ratioReciente),
    motivos,
    // Las dos señales juntas y sostenidas es lo más fuerte que este método puede
    // afirmar; una sola es una pista.
    severidad: motivos.length >= 2 ? 'marcada' : 'leve',
  }
}

/**
 * La línea para el brief. null si no hay caída (o no hay base). PURA.
 *
 * Va en forma de PREGUNTA a propósito. La investigación es explícita: no hay ningún
 * estudio que valide "menos 'te amo' = menos amor", así que afirmarlo sería inventar
 * — y además se auto-cumple. Se nombra el dato, se declara la incertidumbre y se
 * devuelve la lectura a Aaron, que es el único que sabe qué pasó.
 */
export function affectionDropLine(
  nombre: string,
  drop: AffectionDrop | null | undefined,
): string | null {
  if (!drop || drop.motivos.length === 0) return null
  const primer = (nombre ?? '').trim().split(/\s+/)[0] || 'esa persona'
  const dias = VENTANA_RECIENTE

  const dato = drop.motivos.includes('balance')
    ? `el balance del chat con ${primer} se dio vuelta estos ${dias} días (de ${drop.ratioBase} a ${drop.ratioReciente} positivo por negativo)`
    : `el cariño expresado en el chat con ${primer} bajó bastante estos ${dias} días (de ${drop.afectoBase} a ${drop.afectoReciente})`

  const cierre = drop.severidad === 'marcada'
    ? '¿pasó algo puntual o viene de antes?'
    : '¿todo bien o solo andan ocupados?'

  // El disclaimer NO es adorno: es lo que separa un disparador de un veredicto.
  return `💬 ${dato}. Es lo que se ESCRIBE, no lo que se siente — ${cierre}`
}
