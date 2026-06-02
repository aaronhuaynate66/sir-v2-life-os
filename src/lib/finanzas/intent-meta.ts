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

/** Color de texto/acento por intención (tokens del sistema). El gasto
 *  obligatorio es categórico (marca); necesario lee como ok; el no-esencial
 *  es el que conviene vigilar (warn). */
export const INTENT_TEXT: Record<SpendIntent, string> = {
  obligatorio: 'text-brand-soft-foreground',
  necesario: 'text-ok',
  no_esencial: 'text-warn',
}

/** Fondo de la barra proporcional por intención. */
export const INTENT_BAR: Record<SpendIntent, string> = {
  obligatorio: 'bg-brand',
  necesario: 'bg-ok',
  no_esencial: 'bg-warn',
}

/** Estilo de badge (borde + fondo + texto) para la lista de movimientos. */
export const INTENT_BADGE: Record<SpendIntent, string> = {
  obligatorio: 'border-brand/30 bg-brand-soft text-brand-soft-foreground',
  necesario: 'border-ok/30 bg-ok-soft text-ok-foreground',
  no_esencial: 'border-warn/30 bg-warn-soft text-warn-foreground',
}
