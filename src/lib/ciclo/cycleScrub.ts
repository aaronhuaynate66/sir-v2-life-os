// SIR V2 — Estado del "scrub" del Estudio del ciclo (lógica PURA, testeable).
//
// Una sola fecha seleccionada que comparten la banda del horizonte y el briefing.
// Se puede mover por: (a) arrastrar el cursor / date-input libre ('whatif'),
// (b) elegir un evento real ('event'), (c) volver a hoy ('today'). El reducer es
// puro; el componente lo usa con useReducer.

export type ScrubMode = 'today' | 'event' | 'whatif'

export interface CycleScrubState {
  /** 'YYYY-MM-DD' | null. null = hoy (no hay selección explícita). */
  selectedDate: string | null
  mode: ScrubMode
  /** id del personal_event cuando mode==='event' (para título + acciones). */
  selectedEventId: string | null
}

export const initialScrub: CycleScrubState = { selectedDate: null, mode: 'today', selectedEventId: null }

export type ScrubAction =
  | { t: 'today' }
  | { t: 'date'; iso: string }               // fecha libre → simulación (whatif)
  | { t: 'event'; iso: string; id: string }  // evento real seleccionado

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function scrubReducer(state: CycleScrubState, action: ScrubAction): CycleScrubState {
  switch (action.t) {
    case 'today':
      return initialScrub
    case 'date': {
      const iso = action.iso.slice(0, 10)
      if (!ISO.test(iso)) return state
      return { selectedDate: iso, mode: 'whatif', selectedEventId: null }
    }
    case 'event': {
      const iso = action.iso.slice(0, 10)
      if (!ISO.test(iso) || !action.id) return state
      return { selectedDate: iso, mode: 'event', selectedEventId: action.id }
    }
    default:
      return state
  }
}

/** Fecha efectiva a computar: la seleccionada, o `todayIso` si no hay. */
export function effectiveDate(state: CycleScrubState, todayIso: string): string {
  return state.selectedDate ?? todayIso
}
