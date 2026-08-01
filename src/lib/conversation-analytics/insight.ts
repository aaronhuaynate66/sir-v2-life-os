// SIR V2 — Insight sintetizado del pulso de la conversación. PURO.
//
// El card ya muestra los stats crudos (iniciación %, share %, latencia). Esto
// los CRUZA en una frase legible: el patrón relacional no-obvio. El más útil es
// la asimetría "quién abre vs quién se engancha" — que separada en dos números
// se pierde. Determinístico, sin LLM. null si no hay un patrón que valga decir.

import type { ConversationAnalytics } from './analyze'

/**
 * La lectura más saliente del balance de la conversación, en una frase.
 * Prioriza la asimetría de iniciación (abres tú / abre la otra persona)
 * cruzada con quién manda más y qué tan rápido responde.
 */
export function initiationInsight(a: ConversationAnalytics, firstName: string): string | null {
  if (a.total < 6 || a.myInitiationShare == null || a.myShare == null) return null

  const init = Math.round(a.myInitiationShare * 100)
  const me = Math.round(a.myShare * 100)
  const them = 100 - me
  const themFast = a.latency?.theirMedianMinutes != null && a.latency.theirMedianMinutes <= 10
  const name = firstName || 'la otra persona'

  // 1) Abrís tú casi siempre, pero se engancha (manda igual o más). El caso
  //    interesante: parece distancia ("no escribe primero") pero es lo contrario.
  if (init >= 65 && them >= me) {
    const carga = them >= me + 6 ? `manda más (${them}%)` : `manda tanto como tú (${them}%)`
    const rapido = themFast ? ' y responde al toque' : ''
    return `Abres tú ${init}% de las charlas, pero ${name} se engancha: ${carga}${rapido}.`
  }

  // 2) Abre casi siempre la otra persona.
  if (init <= 35) {
    const rapido = themFast ? '; le respondes rápido' : ''
    return `${name} abre casi siempre (${100 - init}% de las charlas)${rapido}.`
  }

  // 3) Llevas tú la conversación en los dos ejes (abres y hablas más).
  if (init >= 65 && me >= them + 6) {
    return `Llevas tú la conversación: abres ${init}% y mandas ${me}% de los mensajes.`
  }

  return null
}

function fmtMin(m: number): string {
  if (m < 1) return 'al toque'
  if (m < 60) return `~${m} min`
  return `~${Math.round(m / 60)} h`
}

/**
 * Asimetría de latencia de respuesta: cuando uno responde MUCHO más rápido que
 * el otro (≥3× y con un lado lento ≥15 min), es señal de disponibilidad/enganche.
 * null si ambos responden parejo o rápido.
 */
export function latencyInsight(a: ConversationAnalytics, firstName: string): string | null {
  const mine = a.latency?.myMedianMinutes
  const theirs = a.latency?.theirMedianMinutes
  if (mine == null || theirs == null) return null
  const name = firstName || 'la otra persona'
  const hi = Math.max(mine, theirs), lo = Math.min(mine, theirs)
  if (hi < 15) return null       // ambos rápidos → sin asimetría relevante
  if (hi < lo * 3) return null    // no es notablemente asimétrico
  return theirs < mine
    ? `${name} responde mucho más rápido que tú (${fmtMin(theirs)} vs ${fmtMin(mine)}).`
    : `Respondes mucho más rápido que ${name} (${fmtMin(mine)} vs ${fmtMin(theirs)}).`
}
