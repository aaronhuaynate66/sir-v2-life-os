// SIR V2 — Lista compacta de logs (compartida por RegistroRapidoPanel
// y RegistrarInteraccionPanel). Filtra opcionalmente por kind.

'use client'

import { Badge } from '@/components/ui/badge'
import { useMounted } from '@/hooks/useMounted'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'

const KIND_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

const DAY_MS = 86_400_000

function formatRelative(iso: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  if (diff < 0) return new Date(t).toISOString().slice(0, 10)
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return mins < 1 ? 'hace instantes' : `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(diff / DAY_MS)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `hace ${weeks}sem`
  return new Date(t).toISOString().slice(0, 10)
}

export interface PersonLogsListProps {
  logs: PersonLog[]
  /** Si se pasa, filtra a este subset de kinds. */
  kinds?: ReadonlyArray<PersonLogKind>
  /** Default 5. */
  max?: number
  /** Mensaje cuando el filtro queda vacio. */
  emptyMessage?: string
}

export function PersonLogsList({
  logs,
  kinds,
  max = 5,
  emptyMessage = 'Sin registros todavía.',
}: PersonLogsListProps) {
  // El tiempo relativo (formatRelative usa Date.now()) se difiere a post-mount
  // para no romper hidratación; el resto de la fila es determinístico.
  const mounted = useMounted()
  const allowed = kinds ? new Set(kinds) : null
  const filtered = (allowed ? logs.filter((l) => allowed.has(l.kind)) : logs).slice(0, max)

  if (filtered.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>
  }

  return (
    <ul className="space-y-1.5">
      {filtered.map((log) => (
        <li
          key={log.id}
          className="rounded-md border border-border/50 bg-muted/10 px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider shrink-0">
              {KIND_LABEL[log.kind]}
            </Badge>
            <span className="font-mono tabular-nums text-foreground shrink-0">{log.value}/5</span>
            {log.note && (
              <span className="text-muted-foreground truncate" title={log.note}>
                · {log.note}
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
            {mounted ? formatRelative(log.loggedAt) : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
