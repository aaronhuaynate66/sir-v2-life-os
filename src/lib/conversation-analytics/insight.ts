// SIR V2 — Insight sintetizado del pulso de la conversación. PURO.
//
// El card ya muestra los stats crudos (iniciación %, share %, latencia). Esto
// los CRUZA en una frase legible: el patrón relacional no-obvio. El más útil es
// la asimetría "quién abre vs quién se engancha" — que separada en dos números
// se pierde. Determinístico, sin LLM. null si no hay un patrón que valga decir.

import type { ConversationAnalytics } from './analyze'

/**
 * La lectura más saliente del balance de la conversación, en una frase.
 * Prioriza la asimetría de iniciación (abrís vos / abre la otra persona)
 * cruzada con quién manda más y qué tan rápido responde.
 */
export function initiationInsight(a: ConversationAnalytics, firstName: string): string | null {
  if (a.total < 6 || a.myInitiationShare == null || a.myShare == null) return null

  const init = Math.round(a.myInitiationShare * 100)
  const me = Math.round(a.myShare * 100)
  const them = 100 - me
  const themFast = a.latency?.theirMedianMinutes != null && a.latency.theirMedianMinutes <= 10
  const name = firstName || 'la otra persona'

  // 1) Abrís vos casi siempre, pero se engancha (manda igual o más). El caso
  //    interesante: parece distancia ("no escribe primero") pero es lo contrario.
  if (init >= 65 && them >= me) {
    const carga = them >= me + 6 ? `manda más (${them}%)` : `manda tanto como vos (${them}%)`
    const rapido = themFast ? ' y responde al toque' : ''
    return `Abrís vos ${init}% de las charlas, pero ${name} se engancha: ${carga}${rapido}.`
  }

  // 2) Abre casi siempre la otra persona.
  if (init <= 35) {
    const rapido = themFast ? '; le respondés rápido' : ''
    return `${name} abre casi siempre (${100 - init}% de las charlas)${rapido}.`
  }

  // 3) Llevás vos la conversación en los dos ejes (abrís y hablás más).
  if (init >= 65 && me >= them + 6) {
    return `Llevás vos la conversación: abrís ${init}% y mandás ${me}% de los mensajes.`
  }

  return null
}
