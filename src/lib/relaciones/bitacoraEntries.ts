// SIR V2 — Lógica pura del hilo cronológico de la Bitácora (ficha de persona).
//
// Extraído del componente para poder testear sin arrastrar React/JSX. Fusiona
// TODAS las fuentes con fecha de una persona en una sola línea ordenada desc:
//   - person_logs (registros rápidos + interacción)
//   - observations curadas (capturas)
//   - notes_history (snapshots del campo notes)
//   - moments (episodios/decisiones)
//   - money (person_money: préstamos/transferencias con fecha)
//
// Las memorias se omiten a propósito: derivan de las observations y ya tienen
// su propio panel (MemoriasAsociadasPanel) — incluirlas duplicaría el hilo.

import { needsResummary } from '@/lib/capture/observations/summaryHealth'
import { captureLabel } from '@/lib/capture/humanizeCapture'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { isSystemNote } from '@/lib/memories/fromInteractionLog'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonNoteHistoryEntry } from '@/lib/person-notes-history/fetch'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { MoneyEntry } from '@/lib/money/types'

export type EntrySource = 'log' | 'observation' | 'notes_history' | 'moment' | 'money'

export interface Entry {
  id: string
  /** ISO de cuándo ocurrió. */
  at: string
  source: EntrySource
  label: string
  detail: string | null
  /** Para logs: "3/5". Para moments: "Abierto"/"Resuelto". Para plata: "S/ 500". */
  value: string | null
  /** id crudo de la observation (solo source='observation') → permite descartar. */
  obsId?: string
  /** true si esta obs es whatsapp_chat con summary pobre y podemos regenerarlo. */
  needsResummary?: boolean
}

/** Etiqueta corta de cada fuente para los chips del filtro. */
export const SOURCE_LABEL: Record<EntrySource, string> = {
  log: 'Registros',
  observation: 'Capturas',
  notes_history: 'Notas',
  moment: 'Momentos',
  money: 'Plata',
}

/** Orden estable de las fuentes en los chips del filtro. */
export const SOURCE_ORDER: EntrySource[] = ['log', 'observation', 'moment', 'money', 'notes_history']

const LOG_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
/** Hora válida "HH:MM" (con o sin segundos) tal cual la escribe el usuario en el
 *  panel de plata. Solo entonces la usamos para posicionar dentro del día. */
const HHMM = /^(\d{1,2}):(\d{2})/

function observationDetail(obs: Observation): string | null {
  const d = obs.data ?? {}
  const summary = typeof d.summary === 'string' ? d.summary : null
  if (summary) return summary
  if (obs.captureType === 'instagram' && typeof d.handle === 'string') return `@${d.handle}`
  if (obs.captureType === 'linkedin' && typeof d.headline === 'string') return d.headline as string
  return null
}

function snippet(text: string | null | undefined, max = 140): string | null {
  if (!text) return null
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

export function buildEntries(
  personLogs: PersonLog[],
  observations: Observation[],
  notesHistory: PersonNoteHistoryEntry[] = [],
  moments: RelationshipMoment[] = [],
  money: MoneyEntry[] = [],
): Entry[] {
  const entries: Entry[] = []
  for (const log of personLogs) {
    // BUG-005: los logs de sistema (📞 llamadas, "Tono inferido", "Importado")
    // son ruido de import, no eventos reales de la bitácora → se omiten.
    if (log.kind === 'interaction' && isSystemNote(log.note ?? '')) continue
    entries.push({
      id: `log:${log.id}`,
      at: log.loggedAt,
      source: 'log',
      label: LOG_LABEL[log.kind] ?? log.kind,
      detail: log.note,
      value: `${log.value}/5`,
    })
  }
  for (const obs of observations) {
    // manual_note con data.text = nota inline creada desde AnotarAhora →
    // label especial + text del data.
    const dataObj = obs.data as Record<string, unknown> | undefined
    if (obs.captureType === 'manual_note' && dataObj?.source === 'anotar_ahora' && typeof dataObj.text === 'string') {
      entries.push({
        id: `obs:${obs.id}`,
        at: obs.observedAt,
        source: 'observation',
        label: 'Nota',
        detail: snippet(dataObj.text as string, 400),
        value: null,
        obsId: obs.id,
      })
      continue
    }
    entries.push({
      id: `obs:${obs.id}`,
      at: obs.observedAt,
      source: 'observation',
      label: dataObj?.source === 'call_transcript' ? 'Llamada' : captureLabel(obs.captureType),
      detail: observationDetail(obs),
      value: null,
      obsId: obs.id,
      needsResummary: needsResummary(obs),
    })
  }
  for (const nh of notesHistory) {
    // Solo mostramos snapshots con contenido — un edit que fue de "" a "algo"
    // guarda snapshot=null (nada antes) y no aporta lectura.
    if (!nh.snapshot || nh.snapshot.trim().length === 0) continue
    entries.push({
      id: `nh:${nh.id}`,
      at: nh.changedAt,
      source: 'notes_history',
      label: 'Nota editada',
      detail: snippet(nh.snapshot, 200),
      value: null,
    })
  }
  for (const m of moments) {
    // Moment.occurredOn es YYYY-MM-DD → normalizamos a T00:00 para el sort.
    const at = m.occurredOn && DATE_ONLY.test(m.occurredOn)
      ? `${m.occurredOn}T00:00:00`
      : m.createdAt
    const detailParts: string[] = []
    if (m.detail) detailParts.push(m.detail)
    if (m.status === 'resuelto' && m.resolution) detailParts.push(`resolución: ${m.resolution}`)
    if (m.status === 'abierto' && m.followUpOn) detailParts.push(`follow-up: ${m.followUpOn}`)
    entries.push({
      id: `moment:${m.id}`,
      at,
      source: 'moment',
      label: m.title,
      detail: snippet(detailParts.join(' · '), 240),
      value: m.status === 'abierto' ? 'abierto' : 'resuelto',
    })
  }
  for (const mv of money) {
    // Sin fecha no se puede ubicar en el hilo → se queda solo en su panel.
    if (!mv.occurredOn || !DATE_ONLY.test(mv.occurredOn)) continue
    const time = mv.occurredTime && HHMM.test(mv.occurredTime.trim())
      ? `T${mv.occurredTime.trim().slice(0, 5)}:00`
      : 'T00:00:00'
    const dir = mv.direction === 'out' ? 'Le pasaste' : 'Te devolvió'
    const detailParts = [dir]
    if (mv.concept) detailParts.push(mv.concept)
    if (mv.settled) detailParts.push('saldado')
    entries.push({
      id: `money:${mv.id}`,
      at: `${mv.occurredOn}${time}`,
      source: 'money',
      label: 'Plata',
      detail: snippet(detailParts.join(' · '), 200),
      value: `${mv.direction === 'out' ? '−' : '+'}${mv.currency} ${mv.amount.toFixed(2)}`,
    })
  }
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return entries
}
