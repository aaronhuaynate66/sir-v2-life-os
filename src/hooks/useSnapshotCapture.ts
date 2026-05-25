'use client'

// SIR V2 — useSnapshotCapture (Sesion 6)
// Side-effect hook: observa RichContextSnapshot y persiste SnapshotSummary
// en useSnapshotStore cuando ocurre un evento significativo.
// No muta useRichContext. La captura es ortogonal al hook lector.

import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useRichContext } from './useRichContext'
import { useSnapshotStore } from '@/stores/useSnapshotStore'
import type {
  RichContextSnapshot,
  SnapshotSummary,
  SnapshotTriggerReason,
} from '@/engines/context'

function snapshotToSummary(
  snapshot: RichContextSnapshot,
  reason: SnapshotTriggerReason
): SnapshotSummary {
  return {
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    date: snapshot.date,
    peaceScore: snapshot.peace.score,
    peaceMode: snapshot.peace.mode,
    summary: snapshot.summary,
    risks: snapshot.risks,
    opportunities: snapshot.opportunities,
    triggerReason: reason,
  }
}

function detectTrigger(
  prev: RichContextSnapshot,
  current: RichContextSnapshot
): SnapshotTriggerReason | null {
  if (prev.peace.mode !== current.peace.mode) {
    if (current.peace.mode === 'normal' && prev.peace.mode !== 'normal') {
      return 'mode_recovery'
    }
    return 'peace_mode_changed'
  }
  if (current.peace.threats.length > prev.peace.threats.length) return 'new_threat'
  if (current.risks.length > prev.risks.length) return 'new_risk'
  if (current.opportunities.length > prev.opportunities.length) return 'new_opportunity'
  return null
}

export function useSnapshotCapture(): void {
  const snapshot = useRichContext()
  const addSnapshot = useSnapshotStore((s) => s.addSnapshot)
  const lastCapturedRef: MutableRefObject<RichContextSnapshot | null> = useRef(null)

  useEffect(() => {
    const prev = lastCapturedRef.current
    if (prev === null) {
      addSnapshot(snapshotToSummary(snapshot, 'initial'))
      lastCapturedRef.current = snapshot
      return
    }
    const reason = detectTrigger(prev, snapshot)
    if (reason !== null) {
      addSnapshot(snapshotToSummary(snapshot, reason))
    }
    lastCapturedRef.current = snapshot
  }, [snapshot, addSnapshot])
}
