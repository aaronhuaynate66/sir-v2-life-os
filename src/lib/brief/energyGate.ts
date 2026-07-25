// SIR V2 — El brief mira el CUERPO antes de empujar. PURO.
//
// POR QUÉ (docs/CABLEADO.md, cruce #1): `selfState.getSelfBioState` ya calcula la
// ventana de tolerancia —la capacidad real de sostener una conversación difícil,
// que es DEPENDIENTE DEL ESTADO (Gross, docs 11+13)— y con eso se calibran
// /negociar, /decidir y /ensayo. Pero el brief de la mañana, que es donde Aaron
// realmente lee, la ignoraba: el mismo "escríbele a tu mamá para cerrar el
// conflicto" salía con 9 horas de sueño que con 4 y la VFC por el piso.
//
// Empujar a alguien a una conversación cargada cuando está fuera de su ventana no
// es proactividad: es preparar una mala conversación.
//
// QUÉ HACE: cuando el cuerpo viene bajo, las señales que piden COMBUSTIBLE
// EMOCIONAL se posponen al día siguiente — y se DICE que se pospusieron. Lo que
// vence hoy (una tarea con fecha, una alerta dura) no se toca nunca: eso no es
// opcional, y ocultarlo sería el mismo pecado que el brief tenía antes.

import type { MorningSignal } from '@/lib/push/morning'

/** Cuánto combustible emocional hay hoy. */
export type Capacity = 'ok' | 'tensionado' | 'bajo'

export interface EnergyGateInput {
  /** Ventana de tolerancia (engines/emotion vía selfState). */
  windowState: 'open' | 'watch' | 'narrow' | 'insufficient'
  /** Deuda de sueño acumulada en horas, si se pudo calcular. */
  sleepDebtHours: number | null
  /** La noche anterior, si hay registro. */
  lastNight?: { durationH?: number | null; score?: number | null; awakenings?: number | null } | null
}

/** Señales que piden energía emocional: pedirle a Aaron que abra una conversación,
 *  retome a alguien o cierre un tema cargado. NO incluye lo que vence hoy. */
export const DEMANDING_SLOTS: readonly string[] = [
  'momentResolution',      // "el conflicto parece resuelto, ¿lo cierras?"
  'relationshipNudge',     // "hace 3 semanas sin hablar con X"
  'goalContactTiming',     // "buen momento para escribirle a X por el objetivo"
]

const DEBT_BAJO = 3
const DEBT_TENSIONADO = 2
const SCORE_MALO = 60
const DESPERTARES_MALO = 3

/**
 * Cuánto combustible hay. La ventana de tolerancia manda; el sueño de anoche y la
 * deuda acumulada pueden bajar el veredicto por sí solos (una noche rota importa
 * aunque el resto de señales no hayan llegado). PURA.
 */
export function assessCapacity(input: EnergyGateInput): Capacity {
  if (input.windowState === 'narrow') return 'bajo'

  const debt = input.sleepDebtHours
  if (debt !== null && debt >= DEBT_BAJO) return 'bajo'

  const n = input.lastNight
  const nocheRota = !!n
    && (n.score ?? 100) < SCORE_MALO
    && (n.awakenings ?? 0) >= DESPERTARES_MALO
  if (nocheRota) return 'bajo'

  if (input.windowState === 'watch') return 'tensionado'
  if (debt !== null && debt >= DEBT_TENSIONADO) return 'tensionado'
  return 'ok'
}

/** El porqué, en las palabras del dato (no un diagnóstico). PURA. '' si no hay nada honesto que decir. */
export function explainCapacity(input: EnergyGateInput): string {
  const bits: string[] = []
  const n = input.lastNight
  if (n?.durationH != null) {
    const h = Math.floor(n.durationH)
    const m = Math.round((n.durationH - h) * 60)
    bits.push(`dormiste ${h}h${m > 0 ? ` ${m}m` : ''}`)
  }
  if ((n?.awakenings ?? 0) >= DESPERTARES_MALO) bits.push(`${n!.awakenings} despertares`)
  if (input.sleepDebtHours !== null && input.sleepDebtHours >= DEBT_TENSIONADO) {
    bits.push(`deuda de sueño ~${Math.round(input.sleepDebtHours)}h`)
  }
  if (input.windowState === 'narrow' && bits.length === 0) bits.push('vienes fuera de tu ventana')
  return bits.join(' · ')
}

export interface EnergyGateResult {
  /** Las señales que se muestran hoy. */
  visible: MorningSignal[]
  /** Las que se posponen (se dicen, no se esconden). */
  deferred: MorningSignal[]
  /** Línea para el brief explicando el aplazamiento. '' si no hay nada que decir. */
  note: string
}

/**
 * Aplica el gate. Con capacidad `bajo` pospone lo que pide combustible emocional
 * y devuelve la línea que lo explica; con `tensionado` no pospone nada pero deja
 * una nota de tono; con `ok` no toca nada.
 *
 * NUNCA pospone en silencio: si algo se corre, la nota lo nombra. PURA.
 */
export function applyEnergyGate(
  signals: MorningSignal[],
  capacity: Capacity,
  reason: string,
): EnergyGateResult {
  if (capacity === 'ok') return { visible: signals, deferred: [], note: '' }

  if (capacity === 'tensionado') {
    const hayExigentes = signals.some((s) => DEMANDING_SLOTS.includes(s.slot))
    return {
      visible: signals,
      deferred: [],
      note: hayExigentes
        ? `Vienes algo justo hoy${reason ? ` (${reason})` : ''} — lo de tu gente puede esperar a que estés más entero, o llévalo corto.`
        : '',
    }
  }

  const deferred = signals.filter((s) => DEMANDING_SLOTS.includes(s.slot))
  const visible = signals.filter((s) => !DEMANDING_SLOTS.includes(s.slot))
  if (deferred.length === 0) {
    return { visible, deferred: [], note: reason ? `Hoy vienes con poco combustible (${reason}). Cuídate el día.` : '' }
  }
  const cuantas = deferred.length === 1 ? 'una cosa de tu gente' : `${deferred.length} cosas de tu gente`
  return {
    visible,
    deferred,
    note: `Hoy vienes con poco combustible${reason ? ` (${reason})` : ''}, así que dejé ${cuantas} para mañana — nada de eso vence hoy. Si igual lo quieres ver, dímelo.`,
  }
}
