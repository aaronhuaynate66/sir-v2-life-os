'use client'
// SIR V2 — PushNotificationsPanel: activar/desactivar push notifications.
//
// Al click "Activar":
//   1. Fetch VAPID public key.
//   2. Registrar service worker.
//   3. Pedir permission al browser (Notification API).
//   4. Suscribirse al PushManager.
//   5. Guardar la subscription en /api/push/subscribe.
//
// Estados visibles: no-configurado (server sin VAPID), no-soportado (browser),
// permission-denied, no-suscrito (todo listo, falta subscribir), suscrito.

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type State =
  | { kind: 'loading' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'not-configured' }
  | { kind: 'denied' }
  | { kind: 'ready' } // permission default; puede pedir
  | { kind: 'subscribed'; endpoint: string }

function b64ToU8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function PushNotificationsPanel() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const init = useCallback(async () => {
    // 1. Soporte del browser.
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return setState({ kind: 'unsupported', reason: 'Este browser no soporta Service Workers.' })
    if (!('PushManager' in window)) return setState({ kind: 'unsupported', reason: 'Este browser no soporta Push.' })
    if (!('Notification' in window)) return setState({ kind: 'unsupported', reason: 'Este browser no soporta notificaciones.' })

    // 2. Servidor configurado.
    const vapidRes = await fetch('/api/push/vapid-public')
    const vapid = (await vapidRes.json()) as { configured?: boolean }
    if (!vapid.configured) return setState({ kind: 'not-configured' })

    // 3. Estado del permiso.
    if (Notification.permission === 'denied') return setState({ kind: 'denied' })

    // 4. ¿Ya está suscrito?
    try {
      const reg = await navigator.serviceWorker.ready.catch(() => null)
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) return setState({ kind: 'subscribed', endpoint: sub.endpoint })
    } catch { /* seguimos a ready */ }

    setState({ kind: 'ready' })
  }, [])

  useEffect(() => { void init() }, [init])

  async function activate() {
    setBusy(true); setError(null)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState({ kind: 'denied' })
        return
      }
      const vapidRes = await fetch('/api/push/vapid-public')
      const vapid = (await vapidRes.json()) as { publicKey?: string; configured?: boolean }
      if (!vapid.publicKey) throw new Error('Servidor sin VAPID public key')
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast a BufferSource — TS DOM lib usa ArrayBuffer nativo pero pushManager acepta Uint8Array.
        applicationServerKey: b64ToU8(vapid.publicKey) as unknown as BufferSource,
      })
      const label = navigator.userAgent.slice(0, 60)
      const r = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), label }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setState({ kind: 'subscribed', endpoint: sub.endpoint })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function deactivate() {
    if (state.kind !== 'subscribed') return
    setBusy(true); setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(state.endpoint)}`, { method: 'DELETE' })
      setState({ kind: 'ready' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Bell size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
            Notificaciones push
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Recibí en tu browser cuando el estado con alguien empeora
          (cerca → en tensión, follow-ups vencidos, etc.), sin tener que abrir SIR.
        </p>

        {state.kind === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Chequeando soporte…
          </div>
        )}

        {state.kind === 'unsupported' && (
          <div className="flex items-start gap-1.5 text-xs text-warn">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {state.reason}
          </div>
        )}

        {state.kind === 'not-configured' && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            El server no tiene VAPID configurado. Pedí que se setee <code className="text-[11px] font-mono">VAPID_PUBLIC_KEY</code>{' '}
            + <code className="text-[11px] font-mono">VAPID_PRIVATE_KEY</code> en Vercel.
          </div>
        )}

        {state.kind === 'denied' && (
          <div className="flex items-start gap-1.5 text-xs text-warn">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            Bloqueado en la configuración del browser. Habilitalo desde el candado en la URL → &quot;Notificaciones&quot; → Permitir.
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button size="sm" onClick={() => void activate()} disabled={busy}>
              {busy ? <><Loader2 size={11} className="mr-1.5 animate-spin" /> Activando…</> : <><Bell size={11} className="mr-1.5" /> Activar</>}
            </Button>
            <span className="text-[10px] text-muted-foreground/60">Tu browser te va a pedir permiso.</span>
          </div>
        )}

        {state.kind === 'subscribed' && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <div className="inline-flex items-center gap-1 text-xs text-ok">
              <CheckCircle2 size={12} strokeWidth={1.75} />
              Activadas en este dispositivo
            </div>
            <Button size="sm" variant="ghost" onClick={() => void deactivate()} disabled={busy} className="ml-auto text-xs h-7">
              {busy ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <BellOff size={11} className="mr-1.5" />}
              Desactivar
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-bad pt-1">
            <AlertCircle size={11} className="mt-0.5" /> {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
