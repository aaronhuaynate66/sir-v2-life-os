// SIR V2 — Sugeridor de experimento de la semana (Motor #2, PURO).
// Toma el Espejo Semanal (Motor #1) y propone UN experimento conductual
// concreto, derivado de una brecha. Activación conductual: una sola acción,
// medible, atada a su material real. Determinístico, sin IA.

import type { EspejoSemanal, EspejoSeverity, EspejoGap } from '@/lib/self/espejoSemanal'

export interface ExperimentSuggestion {
  title: string
  detail: string
}

const SEV_RANK: Record<EspejoSeverity, number> = { alta: 3, media: 2, leve: 1 }

/** Experimento concreto para UNA brecha puntual del espejo. Determinístico. */
export function suggestionForGap(gap: EspejoGap, espejo: EspejoSemanal): ExperimentSuggestion {
  switch (gap.key) {
    case 'conflicto':
    case 'conflicto_abierto':
      return {
        title: 'Una conversación esta semana para descomprimir, sin defender',
        detail: 'Entrá a escuchar de verdad, sin justificar tu posición. Al final anotá cómo terminó.',
      }
    case 'norte':
      return {
        title: espejo.norteTitle
          ? `Esta semana, cerrá UN paso concreto de «${espejo.norteTitle}»`
          : 'Esta semana, cerrá UN paso concreto de tu norte',
        detail: 'Uno solo, terminado. No planear: hacer. Al final de la semana lo registrás como hecho o no.',
      }
    case 'dispersion':
      return {
        title: 'El primer paso del día va a tu norte',
        detail: 'Antes de tocar otros frentes, avanzá algo del norte. Probá 5 de los próximos 7 días.',
      }
    case 'sueño':
      return {
        title: 'Acostate antes de medianoche 5 de las próximas 7 noches',
        detail: 'El sueño es la base del resto. Registrá cada noche que lo cumpliste.',
      }
    case 'estrés':
      return {
        title: '10 minutos diarios sin pantalla para bajar revoluciones',
        detail: 'Caminar, respirar, nada de celular. Una vez por día, esta semana.',
      }
    default:
      return {
        title: `Esta semana, una acción concreta sobre: ${gap.label}`,
        detail: 'Una sola, medible. Al final de la semana registrás qué pasó.',
      }
  }
}

export function suggestExperiment(espejo: EspejoSemanal): ExperimentSuggestion | null {
  if (espejo.state === 'sin_datos') return null
  if (espejo.state === 'sin_norte') {
    return {
      title: 'Fijá tu norte del año',
      detail: 'Sin un norte no hay experimento que mueva la aguja. Marcá un objetivo como tu norte para poder medir la semana.',
    }
  }

  const top = [...espejo.gaps].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])[0]
  if (top) return suggestionForGap(top, espejo)

  return {
    title: 'Sostené lo que viene funcionando',
    detail: espejo.norteTitle
      ? `Repetí esta semana lo que te acercó a «${espejo.norteTitle}» — un paso más, igual de concreto.`
      : 'Repetí esta semana lo que te viene funcionando — un paso más, igual de concreto.',
  }
}
