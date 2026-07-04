// SIR V2 — "Bids" y rituales de mantenimiento en el momento correcto (15·5).
//
// Un "bid" (Gottman) es un gesto chico de conexión. El doc 15 pide que la acción
// sugerida sea ESPECÍFICA y humana ("preguntale por el examen de su hija"), no un
// genérico "escribile a X" — atada a una señal REAL: una fecha próxima o un tema
// que le importa. Las cards existentes MUESTRAN la data (countdown, temas); esto
// la SINTETIZA en un gesto concreto y opcional. Nunca una cuota.
//
// PURO y determinístico. El caller computa la fecha próxima (computeSpecialDate-
// Countdown) y los temas (extractWhatMatters) y los pasa acá.

/** Ventana (días) dentro de la cual una fecha próxima amerita un bid anticipado. */
const DATE_WINDOW_DAYS = 14

export interface BidSignals {
  personName?: string
  /** La fecha especial más cercana (label + días hasta), o null. */
  upcoming?: { label: string; daysUntil: number } | null
  /** Temas que le importan (whatMatters), ordenados por relevancia. */
  topics?: string[]
}

export interface MicroBid {
  kind: 'date' | 'topic'
  /** El gesto concreto sugerido. */
  text: string
  /** La señal real que lo dispara (por qué ahora). */
  reason: string
}

function firstName(name?: string): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  return n || 'esta persona'
}

/**
 * Sintetiza un micro-bid concreto atado a la señal más fuerte disponible.
 * Prioriza una fecha próxima (timing) sobre un tema (siempre disponible).
 * Devuelve null si no hay ninguna señal.
 */
export function suggestMicroBid(s: BidSignals): MicroBid | null {
  const first = firstName(s.personName)

  if (s.upcoming && s.upcoming.daysUntil >= 0 && s.upcoming.daysUntil <= DATE_WINDOW_DAYS) {
    const { label, daysUntil } = s.upcoming
    const text =
      daysUntil === 0
        ? `Hoy es ${label.toLowerCase()} de ${first} — un saludo hoy cuenta.`
        : `${label} de ${first} en ${daysUntil} día${daysUntil === 1 ? '' : 's'}. Un mensaje anticipado suele valer más que uno el mismo día.`
    return { kind: 'date', text, reason: 'fecha próxima' }
  }

  const topic = (s.topics ?? []).map((t) => t.trim()).filter(Boolean)[0]
  if (topic) {
    return {
      kind: 'topic',
      text: `Cuando le escribas a ${first}, tirale algo sobre ${topic} — le importa, y pega más que un "¿cómo va?".`,
      reason: 'tema que le importa',
    }
  }

  return null
}
