// SIR V2 — Ventana de Contacto (Motor #6).
// ¿Es buen momento para escribirle a esta persona? Cruza señales que YA existen
// (último contacto, fechas próximas, conflictos abiertos, tono reciente, fase
// del ciclo) y devuelve un estado + por qué + el TONO con que entrar. NO es un
// guion para conseguir algo: es consideración (cuándo le cae bien / cuándo
// conviene cuidar), nunca extracción. Determinístico, sin IA.

export type ContactWindowState = 'buen_momento' | 'con_cuidado' | 'neutral'

export interface ContactSignals {
  /** Días desde el último contacto (null si nunca). */
  daysSinceContact: number | null
  /** Días hasta la próxima fecha importante (cumple/aniversario). null si no hay. */
  upcomingEventInDays: number | null
  upcomingEventLabel?: string | null
  /** Hay un conflicto/tema ABIERTO con esta persona. */
  openConflict: boolean
  conflictTitle?: string | null
  /** Tono de la última conversación (1-5); <=2 = tensa. null si no hay. */
  lastTone: number | null
  /** La persona puede estar en días sensibles del ciclo (fase menstrual). */
  cycleSensitive: boolean
  /** Importancia del vínculo (1-10) — modula el umbral de "hace mucho". */
  importance: number
}

export interface ContactWindow {
  state: ContactWindowState
  reason: string
  /** Con qué disposición entrar — NO qué decir para conseguir algo. */
  tone: string
}

const EVENT_SOON = 4

function driftThreshold(importance: number): number {
  return importance >= 7 ? 14 : 25
}

export function computeContactWindow(s: ContactSignals): ContactWindow {
  // ── Cautelas primero (consideración, no evitación) ──────────────────
  if (s.openConflict) {
    return {
      state: 'con_cuidado',
      reason: s.conflictTitle ? `tienen un tema abierto: «${s.conflictTitle}»` : 'tienen un tema abierto sin cerrar',
      tone: 'entrá a escuchar, sin reabrir la herida',
    }
  }
  if (s.lastTone !== null && s.lastTone <= 2) {
    return { state: 'con_cuidado', reason: 'la última charla quedó tensa', tone: 'bajá un cambio, sin temas pesados' }
  }
  if (s.cycleSensitive) {
    return {
      state: 'con_cuidado',
      reason: 'puede estar en días sensibles del ciclo',
      tone: 'entrá liviano y con cuidado — es para acompañarla, no para evitarla',
    }
  }
  // ── Oportunidades ───────────────────────────────────────────────────
  if (s.upcomingEventInDays !== null && s.upcomingEventInDays >= 0 && s.upcomingEventInDays <= EVENT_SOON) {
    const lbl = s.upcomingEventLabel || 'una fecha importante'
    const when = s.upcomingEventInDays === 0 ? 'hoy' : `en ${s.upcomingEventInDays} día(s)`
    return { state: 'buen_momento', reason: `se viene ${lbl} (${when})`, tone: 'un gesto cálido, sin pedir nada' }
  }
  if (s.daysSinceContact !== null && s.daysSinceContact >= driftThreshold(s.importance)) {
    return { state: 'buen_momento', reason: `hace ${s.daysSinceContact} días sin hablar`, tone: 'retomá liviano, sin agenda' }
  }
  return { state: 'neutral', reason: 'sin señales urgentes', tone: 'cuando quieras' }
}
