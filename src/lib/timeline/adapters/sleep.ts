// SIR V2 — SleepRecord → TimelineEvent adapter
//
// sleep_records.date es YYYY-MM-DD (date only). Para que el evento ordene
// correctamente en el feed mezclado con otros tipos que llevan timestamptz,
// sintetizamos un timestamp ISO combinando date + bedtime en UTC. El offset
// horario real del usuario es <24h, irrelevante para el orden cronologico.

import type { SleepRecord } from '@/types'
import type { TimelineEvent } from '../types'

function toIsoTimestamp(date: string, bedtime: string): string {
  // date = "2026-05-28", bedtime = "23:30" -> "2026-05-28T23:30:00.000Z"
  return `${date}T${bedtime}:00.000Z`
}

export function adaptSleep(s: SleepRecord): TimelineEvent {
  const duration = Number.isInteger(s.duration) ? s.duration.toString() : s.duration.toFixed(2)
  return {
    id: `sleep:${s.id}`,
    type: 'sleep',
    occurredAt: toIsoTimestamp(s.date, s.bedtime),
    title: `Sueño ${duration}h · calidad ${s.quality}/10`,
    body: s.dreams ?? s.notes,
    tags: [`${s.bedtime} → ${s.wakeTime}`],
    meta: {
      date: s.date,
      bedtime: s.bedtime,
      wakeTime: s.wakeTime,
      duration: s.duration,
      quality: s.quality,
    },
  }
}

export function adaptSleeps(rows: SleepRecord[]): TimelineEvent[] {
  return rows.map(adaptSleep)
}
