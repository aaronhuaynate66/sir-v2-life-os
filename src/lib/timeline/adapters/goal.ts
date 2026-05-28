// SIR V2 — Goal → TimelineEvent adapter
//
// Cada goal emite SIEMPRE un evento "created" (en createdAt) y OPCIONALMENTE
// uno "updated" (en updatedAt). Por R10 del ADR 0005, omitimos "updated" si
// updatedAt esta a <60s de createdAt — eso indica que el goal nunca se
// edito de forma significativa post-creacion.

import type { Goal } from '@/types'
import type { TimelineEvent } from '../types'

const MIN_UPDATE_GAP_MS = 60_000 // 60s

export function adaptGoal(g: Goal): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: `goal_event:${g.id}:created`,
      type: 'goal_event',
      occurredAt: g.createdAt,
      title: `Objetivo creado: ${g.title}`,
      body: g.description || undefined,
      tags: [g.category, g.priority],
      meta: {
        goalId: g.id,
        phase: 'created',
        category: g.category,
        priority: g.priority,
        status: g.status,
        progress: g.progress,
      },
    },
  ]

  const createdMs = new Date(g.createdAt).getTime()
  const updatedMs = new Date(g.updatedAt).getTime()
  if (Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs - createdMs > MIN_UPDATE_GAP_MS) {
    events.push({
      id: `goal_event:${g.id}:updated`,
      type: 'goal_event',
      occurredAt: g.updatedAt,
      title: `Objetivo actualizado: ${g.title}`,
      body: `Progreso ${g.progress}% · estado ${g.status}`,
      tags: [g.category, g.status],
      meta: {
        goalId: g.id,
        phase: 'updated',
        category: g.category,
        priority: g.priority,
        status: g.status,
        progress: g.progress,
      },
    })
  }

  return events
}

export function adaptGoals(rows: Goal[]): TimelineEvent[] {
  return rows.flatMap(adaptGoal)
}
