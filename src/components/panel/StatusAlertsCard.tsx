'use client'
// SIR V2 — StatusAlertsCard: alertas cuando el label de una persona empeora.
//
// El cron /api/cron/status-diff detecta cuando pasa de "estable" a
// "en_tension" (o similar) y crea una row en person_status_alerts. Este
// componente las muestra en /panel arriba de todo. Aaron las descarta con X.
//
// Se OCULTA si no hay alertas activas. Cero ruido.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, toApiError, type ApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

interface Alert {
  id: string
  person_id: string
  person_name: string
  person_slug: string | null
  from_label: string
  to_label: string
  message: string
  created_at: string
  seen_at: string | null
}

const LABEL_CLASS: Record<string, string> = {
  cerca: 'bg-ok/10 text-ok',
  estable: 'bg-muted/40 text-muted-foreground',
  distante: 'bg-warn/10 text-warn',
  en_tension: 'bg-bad/10 text-bad',
  sin_data: 'bg-muted/30 text-muted-foreground/70',
}

export function StatusAlertsCard() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/person-status-alerts', { cache: 'no-store' })
      if (!r.ok) { setError(await parseErrorResponse(r)); setAlerts([]); return }
      const j = (await r.json()) as { alerts?: Alert[] }
      setAlerts(j.alerts ?? [])
    } catch (e) { setError(toApiError(e)); setAlerts([]) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    function onVis() { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  async function dismiss(id: string) {
    setAlerts((prev) => prev?.filter((a) => a.id !== id) ?? [])
    try {
      await fetch('/api/person-status-alerts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'dismissed' }),
      })
    } catch { /* toast could go here */ }
  }

  // Si el fetch falló, mostramos el error (antes se tragaba → parecía "sin
  // alertas" cuando en realidad se rompió). Vacío real → seguimos ocultando.
  if (error) {
    return (
      <div className="mb-4">
        <ApiErrorNotice error={error} className="p-3">
          <button onClick={() => void load()} className="mt-1 text-xs underline underline-offset-2 hover:text-foreground">Reintentar</button>
        </ApiErrorNotice>
      </div>
    )
  }
  if (!alerts || alerts.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none border-bad/30">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle size={14} strokeWidth={1.75} className="text-bad" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              Cambio de estado detectado
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">{alerts.length}</Badge>
          </div>

          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {alerts.map((a) => (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2 rounded-md border border-bad/20 bg-bad-soft/30 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{a.person_name}</span>
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider', LABEL_CLASS[a.from_label] ?? 'bg-muted/40 text-muted-foreground')}>{a.from_label}</span>
                        <ChevronRight size={11} className="text-muted-foreground/60 flex-shrink-0" />
                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium', LABEL_CLASS[a.to_label] ?? 'bg-muted/40')}>{a.to_label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.message}</p>
                      {a.person_slug && (
                        <Link
                          href={`/relaciones/${a.person_slug}`}
                          className="text-[11px] text-brand hover:underline underline-offset-2 mt-1 inline-block"
                        >
                          Abrir ficha →
                        </Link>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void dismiss(a.id)}
                      className="flex-shrink-0 rounded p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
                      aria-label="Descartar alerta"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  )
}
