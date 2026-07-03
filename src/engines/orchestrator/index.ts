// SIR V2 — Orquestador cognitivo (A2). PURO.
//
// La auditoría (07-03) encontró que los engines viven AISLADOS y el
// RichContextSnapshot "muere en un debug panel". Este orquestador es la costura:
// compone las salidas de las capas que ya existen (Paz, amenazas, recomendaciones)
// en UNA evaluación unificada, ordenada por severidad y luego por la jerarquía de
// dominio (A3, engines/priority). Deja una costura para el Razonamiento (A1): el
// reasoner narrará sobre este `CognitiveAssessment`.
//
// Es el pipeline de docs/01_COGNITIVE_ARCHITECTURE.md hecho estructura: en vez de
// que /panel muestre paz + recs + amenazas por separado, hay un solo "foco ahora"
// que dice QUÉ IMPORTA MÁS, a través de todos los dominios, en orden.

import { PRIORITY_LEVEL, DOMAIN_LABEL, type PriorityDomain } from '../priority'
import type { PeaceScore, PeaceThreat } from '../peace'
import { domainForRecommendation } from '../recommendation'
import type { Recommendation } from '@/types'

export interface FocusItem {
  domain: PriorityDomain
  domainLabel: string
  kind: 'threat' | 'recommendation'
  title: string
  detail: string
  /** 0 = más urgente (critical). Menor primero. */
  severityRank: number
}

export interface CognitiveAssessment {
  peace: { total: number; trend: PeaceScore['trend']; recoveryMode: boolean }
  /** Lo que importa AHORA, ordenado por severidad y luego jerarquía de dominio. */
  focus: FocusItem[]
  /** El foco #1 en una línea, o null si todo tranquilo. */
  headline: string | null
}

/** Mapea el `source` de una PeaceThreat a un dominio de la jerarquía. */
const THREAT_DOMAIN: Record<string, PriorityDomain> = {
  biological: 'health',
  financial: 'finance',
  relational: 'relational',
  emotional: 'peace',
  goalProgress: 'personal',
}
const THREAT_SEV: Record<PeaceThreat['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 }
const REC_SEV: Record<Recommendation['priority'], number> = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * Corre el pipeline: toma las salidas de las capas y devuelve la evaluación
 * unificada. Orden del foco: severidad primero (un crítico manda), y a igual
 * severidad gana el dominio más alto (Paz>Salud>…>Optimización) — misma regla
 * que rankRecommendations. PURO.
 */
export function runCognitivePipeline(input: {
  peace: PeaceScore
  threats: PeaceThreat[]
  recommendations: Recommendation[]
}): CognitiveAssessment {
  const items: FocusItem[] = []

  for (const t of input.threats) {
    const domain = THREAT_DOMAIN[t.source] ?? 'optimization'
    items.push({
      domain, domainLabel: DOMAIN_LABEL[domain], kind: 'threat',
      title: t.description, detail: t.suggestedAction, severityRank: THREAT_SEV[t.severity] ?? 3,
    })
  }
  for (const r of input.recommendations) {
    const domain = domainForRecommendation(r.type)
    items.push({
      domain, domainLabel: DOMAIN_LABEL[domain], kind: 'recommendation',
      title: r.title, detail: r.description, severityRank: REC_SEV[r.priority] ?? 3,
    })
  }

  items.sort((a, b) => (a.severityRank - b.severityRank) || (PRIORITY_LEVEL[a.domain] - PRIORITY_LEVEL[b.domain]))

  return {
    peace: { total: input.peace.total, trend: input.peace.trend, recoveryMode: input.peace.recoveryMode },
    focus: items,
    headline: items.length ? `${items[0].domainLabel}: ${items[0].title}` : null,
  }
}
