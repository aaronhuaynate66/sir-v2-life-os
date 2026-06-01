// SIR V2 — Metadata de presentación para la intención del gasto (P1).
// Labels, descripciones y clases de color. Sin lógica — la agregación vive en
// el engine (analyzeSpendingByIntent). Compartido entre el form, el badge de
// la lista y el desglose.

import type { SpendIntent } from '@/types'

export const INTENT_LABEL: Record<SpendIntent, string> = {
  obligatorio: 'Obligatorio',
  necesario: 'Necesario',
  no_esencial: 'No esencial',
}

/** Una línea de ayuda para el form (qué cae en cada intención). */
export const INTENT_HINT: Record<SpendIntent, string> = {
  obligatorio: 'Fijo e inevitable: alquiler, servicios, deuda.',
  necesario: 'Necesario pero flexible: mercado, transporte.',
  no_esencial: 'Discrecional: delivery, antojos, impulso.',
}

/** Color de texto/acento por intención (Tailwind). */
export const INTENT_TEXT: Record<SpendIntent, string> = {
  obligatorio: 'text-sky-400',
  necesario: 'text-emerald-400',
  no_esencial: 'text-amber-400',
}

/** Fondo de la barra proporcional por intención (Tailwind). */
export const INTENT_BAR: Record<SpendIntent, string> = {
  obligatorio: 'bg-sky-400',
  necesario: 'bg-emerald-400',
  no_esencial: 'bg-amber-400',
}

/** Estilo de badge (borde + fondo + texto) para la lista de movimientos. */
export const INTENT_BADGE: Record<SpendIntent, string> = {
  obligatorio: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  necesario: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  no_esencial: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
}
