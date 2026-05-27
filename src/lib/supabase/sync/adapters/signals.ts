// SIR V2 — Signal table adapter (Sesión 20c)

import type { Signal, SignalSource, SignalType, SignalUrgency } from '@/types'
import type { TableAdapter } from '../types'

export const signalAdapter: TableAdapter<Signal> = {
  table: 'signals',
  toRow: (s, userId) => ({
    id: s.id,
    user_id: userId,
    source: s.source,
    type: s.type,
    content: s.content,
    strength: s.strength,
    urgency: s.urgency,
    related_persons: s.relatedPersons ?? [],
    related_goals: s.relatedGoals ?? [],
    meaning: s.meaning ?? null,
    action_required: s.actionRequired,
    suggested_action: s.suggestedAction ?? null,
    detected_at: s.detectedAt,
    expires_at: s.expiresAt ?? null,
    resolved: s.resolved,
  }),
  fromRow: (row) => ({
    id: row.id as string,
    source: row.source as SignalSource,
    type: row.type as SignalType,
    content: row.content as string,
    strength: Number(row.strength) || 5,
    urgency: row.urgency as SignalUrgency,
    relatedPersons: (row.related_persons as string[]) ?? [],
    relatedGoals: (row.related_goals as string[]) ?? [],
    meaning: (row.meaning as string) ?? undefined,
    actionRequired: Boolean(row.action_required),
    suggestedAction: (row.suggested_action as string) ?? undefined,
    detectedAt: row.detected_at as string,
    expiresAt: (row.expires_at as string) ?? undefined,
    resolved: Boolean(row.resolved),
  }),
}
