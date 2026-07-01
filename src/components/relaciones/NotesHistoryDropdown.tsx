'use client'

// SIR V2 — Botón "Ver versión anterior" al lado del label "Notas" en la
// card de Identidad. Abre un dropdown inline con los últimos snapshots del
// campo `notes` (mig 0108 + person_notes_history) y ofrece "Usar este" para
// pegarlo en el textarea sin guardar todavía — Aaron puede editar antes de
// confirmar.
//
// Motivación: Aaron perdió el texto que anotó sobre Mariana ayer porque el
// campo notes se sobreescribió. De ahora en más, todos los edits dejan
// snapshot en la Bitácora + este dropdown expone los snapshots directo en
// el flujo de edición.

import { useState } from 'react'
import { History, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { PersonNoteHistoryEntry } from '@/lib/person-notes-history/fetch'
import { cn } from '@/lib/utils'

interface NotesHistoryDropdownProps {
  history: PersonNoteHistoryEntry[]
  /** Callback al elegir un snapshot para restaurar. Aaron ve el texto en el
   *  textarea y decide si "Guardar" o seguir editando. */
  onRestore: (snapshot: string) => void
  disabled?: boolean
}

const CHANGE_SOURCE_LABEL: Record<string, string> = {
  inline_edit: 'Edición inline',
  router: 'Router de relato',
  seed_batch: 'Batch JSON',
  sync: 'Sync remoto',
  unknown: 'Cambio',
}

const DAY_MS = 86_400_000
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  if (diff < 0) return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t))
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return mins < 1 ? 'recién' : `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(diff / DAY_MS)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t))
}

export function NotesHistoryDropdown({ history, onRestore, disabled }: NotesHistoryDropdownProps) {
  const [open, setOpen] = useState(false)
  const withContent = history.filter((h) => (h.snapshot ?? '').trim().length > 0)
  if (withContent.length === 0) return null

  return (
    <div className="inline-flex items-center gap-1 relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40"
        aria-label={`Ver versiones anteriores (${withContent.length})`}
      >
        <History size={11} strokeWidth={1.75} aria-hidden="true" />
        <span>{withContent.length} anterior{withContent.length === 1 ? '' : 'es'}</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1.5 right-0 w-80 max-w-[90vw] rounded-md border border-border-strong bg-popover shadow-lg">
          <div className="flex items-center justify-between p-2 border-b border-border/60">
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary">Historial de notas</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground/60 hover:text-foreground min-h-6 min-w-6 inline-flex items-center justify-center"
              aria-label="Cerrar"
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto p-1">
            {withContent.map((h) => (
              <li key={h.id} className="p-2 rounded hover:bg-accent/30 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-mono text-muted-foreground/80">
                    {formatRelative(h.changedAt)}
                  </span>
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded uppercase tracking-widest',
                    'bg-muted text-muted-foreground/80',
                  )}>
                    {CHANGE_SOURCE_LABEL[h.changeSource] ?? h.changeSource}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-foreground/90 line-clamp-4">
                  {h.snapshot}
                </p>
                <div className="mt-1.5 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      onRestore(h.snapshot ?? '')
                      setOpen(false)
                    }}
                  >
                    Usar este
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="p-2 border-t border-border/60">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              &quot;Usar este&quot; reemplaza el textarea. Aún tenés que darle a &quot;Guardar&quot;
              para confirmar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
