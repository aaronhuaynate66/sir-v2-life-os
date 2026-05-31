'use client'
// SIR V2 — RegistroRapidoPanel (#5 backlog detail page V1).
//
// 4 acciones rapidas para registrar como te SENTIS HOY respecto a esta
// persona / interaccion con ella: Animo / Energia / Sueño / Dolor. Cada
// una con selector 1-5 inline; al click POSTea a /api/person-logs con
// el kind correspondiente.
//
// Sesion 6 — paridad V1 con storage Supabase-native (tabla person_logs,
// no relationships.history) para que alimente correlaciones futuras
// (Fase 3c: ánimo vs fase lunar, energía vs ciclo, etc.).

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Smile, Zap, Moon, Activity, Loader2, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { toApiError, type ApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { createPersonLog } from './person-logs/client'
import { PersonLogsList } from './person-logs/PersonLogsList'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'

export interface RegistroRapidoPanelProps {
  personId: string
  recentLogs: PersonLog[]
}

interface ActionDef {
  kind: Extract<PersonLogKind, 'mood' | 'energy' | 'sleep' | 'pain'>
  label: string
  Icon: LucideIcon
  /** Color del accent del icono cuando esta activo. */
  accentClass: string
}

const ACTIONS: ActionDef[] = [
  { kind: 'mood', label: 'Ánimo', Icon: Smile, accentClass: 'text-amber-400' },
  { kind: 'energy', label: 'Energía', Icon: Zap, accentClass: 'text-emerald-400' },
  { kind: 'sleep', label: 'Sueño', Icon: Moon, accentClass: 'text-sky-400' },
  { kind: 'pain', label: 'Dolor', Icon: Activity, accentClass: 'text-red-400' },
]

const QUICK_KINDS: ReadonlyArray<PersonLogKind> = ['mood', 'energy', 'sleep', 'pain']

export function RegistroRapidoPanel({ personId, recentLogs }: RegistroRapidoPanelProps) {
  const router = useRouter()
  const [openKind, setOpenKind] = useState<PersonLogKind | null>(null)
  const [submitting, setSubmitting] = useState<PersonLogKind | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [recentSubmit, setRecentSubmit] = useState<{ kind: PersonLogKind; value: number } | null>(null)

  const onPick = useCallback(
    async (kind: PersonLogKind, value: number) => {
      setSubmitting(kind)
      setError(null)
      try {
        await createPersonLog({ personId, kind, value })
        setRecentSubmit({ kind, value })
        setOpenKind(null)
        router.refresh()
      } catch (e) {
        setError(toApiError(e))
      } finally {
        setSubmitting(null)
      }
    },
    [personId, router],
  )

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Registro rápido
          </div>
          <span className="text-[10px] text-muted-foreground/60">
            cómo estás hoy respecto a esta persona
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {ACTIONS.map((action) => {
            const isOpen = openKind === action.kind
            const isSubmitting = submitting === action.kind
            return (
              <div key={action.kind} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenKind(isOpen ? null : action.kind)}
                  disabled={submitting !== null}
                  className={cn(
                    'w-full flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs transition-colors disabled:opacity-50',
                    isOpen
                      ? 'border-accent/50 bg-accent/10 text-foreground'
                      : 'border-border hover:border-accent/40 hover:bg-accent/5 text-muted-foreground hover:text-foreground',
                  )}
                  aria-expanded={isOpen}
                >
                  <action.Icon
                    size={18}
                    strokeWidth={1.75}
                    className={cn(isOpen && action.accentClass)}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{action.label}</span>
                </button>

                {isOpen && (
                  <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-border bg-popover p-2 shadow-md">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5 text-center">
                      1 = bajo · 5 = alto
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onPick(action.kind, v)}
                          disabled={isSubmitting}
                          className={cn(
                            'h-8 rounded text-xs font-mono tabular-nums border border-border/60 hover:border-accent/60 hover:bg-accent/10 disabled:opacity-50',
                            'flex items-center justify-center',
                          )}
                          aria-label={`${action.label} valor ${v}`}
                        >
                          {isSubmitting ? <Loader2 size={10} className="animate-spin" /> : v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {recentSubmit && !error && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs mb-3 flex items-center gap-1.5">
            <Check size={12} strokeWidth={2} className="text-emerald-400" aria-hidden="true" />
            <span className="text-emerald-400">
              Registrado: <span className="font-mono">{recentSubmit.kind}</span>{' '}
              <span className="font-mono tabular-nums">{recentSubmit.value}/5</span>.
            </span>
          </div>
        )}

        {error && <ApiErrorNotice error={error} className="p-2 mb-3" />}

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">
            Registros recientes
          </div>
          <PersonLogsList
            logs={recentLogs}
            kinds={QUICK_KINDS}
            max={5}
            emptyMessage="Aún sin registros rápidos."
          />
        </div>

        {/* Cerrar popovers al hacer click fuera (toque mobile-friendly) */}
        {openKind && (
          <button
            type="button"
            aria-hidden="true"
            onClick={() => setOpenKind(null)}
            className="fixed inset-0 z-0 cursor-default"
          />
        )}
      </CardContent>
    </Card>
  )
}
