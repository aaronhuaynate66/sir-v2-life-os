// SIR V2 — Espejo POSITIVO del #92 (fricción). PURO + testeable.
//
// Aaron: un deal del grupo donde trabaja no le paga bono, pero avanzarlo
// MEJORA su standing y su vínculo con los stakeholders internos (Francisco,
// Alex). Acá leemos, para UNA persona, los deals abiertos donde es stakeholder
// interno, y damos una lectura de momentum (¿avanzó?) para mostrar el plus.

import type { Deal, DealStage } from '@/types'
import { STAGE_ORDER, STAGE_LABEL } from './pipeline'

const DAY = 86_400_000

export interface StakeholderDealImpact {
  dealId: string
  title: string
  stage: DealStage
  stageLabel: string
  /** Posición 0..N en el pipeline (mayor = más avanzado). */
  progressIdx: number
  /** true si hubo actividad en los últimos 14 días (momentum). */
  recentlyActive: boolean
}

/** Deals ABIERTOS donde `personId` es stakeholder interno (tu lado), ordenados
 *  por etapa más avanzada primero. Solo abiertos (un deal ganado/perdido ya no
 *  "suma" hacia adelante). PURO. */
export function dealsForStakeholder(
  deals: Deal[],
  personId: string,
  now: Date = new Date(),
): StakeholderDealImpact[] {
  const out: StakeholderDealImpact[] = []
  for (const d of deals) {
    if (!d.internalStakeholders?.includes(personId)) continue
    if (d.stage === 'ganado' || d.stage === 'perdido') continue
    if (d.status === 'won' || d.status === 'lost' || d.status === 'paused') continue
    const idx = STAGE_ORDER.indexOf(d.stage)
    const t = Date.parse(d.updatedAt)
    const recentlyActive = Number.isFinite(t) && now.getTime() - t <= 14 * DAY
    out.push({
      dealId: d.id,
      title: d.title,
      stage: d.stage,
      stageLabel: STAGE_LABEL[d.stage],
      progressIdx: idx,
      recentlyActive,
    })
  }
  return out.sort((a, b) => b.progressIdx - a.progressIdx)
}
