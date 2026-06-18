// SIR V2 — Pipeline de Oportunidades: etiquetas, orden y enfriamiento. PURO.

import type { Deal, DealStage } from '@/types'

export const STAGE_ORDER: DealStage[] = [
  'lead', 'reunion', 'relevamiento', 'propuesta', 'negociacion', 'ganado', 'perdido',
]

export const STAGE_LABEL: Record<DealStage, string> = {
  lead: 'Lead',
  reunion: 'Reunión',
  relevamiento: 'Relevamiento',
  propuesta: 'Propuesta',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
}

const DAY = 86_400_000

/** Días desde la última actualización (proxy de enfriamiento). null si no hay fecha. */
export function daysSinceUpdate(deal: Deal, now: Date = new Date()): number | null {
  const t = Date.parse(deal.updatedAt)
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / DAY)
}

/** ¿Está abierta (no ganada/perdida)? */
export function isOpenDeal(d: Deal): boolean {
  return d.stage !== 'ganado' && d.stage !== 'perdido' && d.status !== 'won' && d.status !== 'lost'
}

/** Agrupa por etapa en el orden del pipeline; solo etapas con deals. */
export function groupByStage(deals: Deal[]): { stage: DealStage; deals: Deal[] }[] {
  const map = new Map<DealStage, Deal[]>()
  for (const d of deals) {
    const arr = map.get(d.stage) ?? []
    arr.push(d)
    map.set(d.stage, arr)
  }
  return STAGE_ORDER.filter((s) => (map.get(s)?.length ?? 0) > 0).map((s) => ({
    stage: s,
    deals: (map.get(s) ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }))
}
