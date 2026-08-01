'use client'

// SIR V2 — Conectar correo de trabajo (Microsoft Graph, Fase 2). Panel en /yo:
// conectar por OAuth, sincronizar los correos nuevos (→ observaciones por remitente
// vía el pipeline del reader) y desconectar. Si la app de Azure no está configurada,
// muestra qué falta.
import { useCallback, useEffect, useState } from 'react'
import { Mail, Loader2, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Status {
  configured: boolean
  connected: boolean
  accountEmail: string | null
  lastSyncedAt: string | null
}

export function EmailConnectionPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/email/status')
      if (res.ok) setStatus((await res.json()) as Status)
    } catch { /* */ }
  }, [])

  useEffect(() => { void load() }, [load])

  // Feedback del callback OAuth (?email=connected|err_*).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search).get('email')
    if (!p) return
    if (p === 'connected') toast.success('Correo conectado', { description: 'Sincroniza para traer lo nuevo.' })
    else if (p === 'notconfigured') toast.error('Falta registrar la app en Azure', { description: 'Ver docs/EMAIL_GRAPH_OAUTH.md' })
    else if (p.startsWith('err')) toast.error('No se pudo conectar', { description: p })
    window.history.replaceState({}, '', window.location.pathname)
    void load()
  }, [load])

  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/email/sync', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { fetched?: number; senders?: number; error?: string }
      if (!res.ok) toast.error('No se pudo sincronizar', { description: data.error })
      else toast.success('Correo sincronizado', { description: `${data.fetched ?? 0} correos nuevos · ${data.senders ?? 0} remitentes` })
      await load()
    } catch { toast.error('No se pudo sincronizar') } finally { setSyncing(false) }
  }, [load])

  const disconnect = useCallback(async () => {
    try { await fetch('/api/email/status', { method: 'DELETE' }); toast.success('Correo desconectado'); await load() } catch { /* */ }
  }, [load])

  if (!status) return null

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Correo de trabajo (Microsoft)</div>
        </div>

        {!status.configured ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
            <p>Falta registrar la app en Azure (client id/secret). Los pasos están en <span className="text-foreground/80 font-mono text-[12px]">docs/EMAIL_GRAPH_OAUTH.md</span>. Una vez seteadas las env vars, este panel te deja conectar.</p>
          </div>
        ) : !status.connected ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Conecta tu correo M365 para que SIR lea, incremental, los correos nuevos y los cruce con tu gente.</p>
            <Button size="sm" asChild>
              <a href="/api/email/connect"><Mail size={14} strokeWidth={1.75} className="mr-1.5" /> Conectar con Microsoft</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-sm text-foreground/90 flex items-center gap-1.5">
              <Check size={14} className="text-ok" aria-hidden="true" /> {status.accountEmail || 'Cuenta conectada'}
            </p>
            <p className="text-[12px] text-muted-foreground">
              Último sync: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('es') : 'nunca'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5">
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.75} />}
                Sincronizar ahora
              </Button>
              <button type="button" onClick={disconnect} className="text-[11px] text-muted-foreground hover:text-bad underline underline-offset-2">
                Desconectar
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
