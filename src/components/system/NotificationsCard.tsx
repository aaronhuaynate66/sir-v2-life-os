'use client'

// SIR V2 — Card de notificaciones push (PWA). Pide permiso, se suscribe vía
// PushManager con la VAPID public key, y guarda la suscripción. Botón de prueba
// para verificar la cadena en el dispositivo. iOS: solo funciona en la PWA
// instalada (Agregar a inicio).
import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Check, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type State = 'loading' | 'unsupported' | 'no-vapid' | 'idle' | 'subscribing' | 'subscribed' | 'denied'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function NotificationsCard() {
  const [state, setState] = useState<State>('loading')
  const [testing, setTesting] = useState(false)
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setState('unsupported')
        return
      }
      if (!vapid) {
        if (!cancelled) setState('no-vapid')
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied')
        return
      }
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setState(sub ? 'subscribed' : 'idle')
      } catch {
        if (!cancelled) setState('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [vapid])

  const enable = useCallback(async () => {
    if (!vapid) return
    setState('subscribing')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!res.ok) throw new Error('save failed')
      setState('subscribed')
      toast.success('Notificaciones activadas', { description: 'Probá enviarte una.' })
    } catch {
      setState('idle')
      toast.error('No se pudo activar', { description: 'Reintentá; en iOS tiene que ser desde la app instalada.' })
    }
  }, [vapid])

  const sendTest = useCallback(async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = (await res.json()) as { sent?: number; detail?: string; error?: string }
      if (res.ok && data.sent) toast.success('Push enviado', { description: 'Debería llegarte en segundos.' })
      else toast.error(data.error ?? 'No se pudo enviar', { description: data.detail })
    } catch {
      toast.error('No se pudo enviar')
    } finally {
      setTesting(false)
    }
  }, [])

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Notificaciones</div>
        </div>

        {state === 'loading' && <p className="text-sm text-muted-foreground py-1">…</p>}

        {state === 'unsupported' && (
          <p className="text-sm text-muted-foreground py-1">
            Este navegador no soporta notificaciones push. En iPhone: agregá SIR a la pantalla de inicio y abrilo desde el ícono.
          </p>
        )}

        {state === 'no-vapid' && (
          <p className="text-sm text-muted-foreground py-1">
            Falta configurar las claves del servidor (VAPID). Una vez seteadas, vas a poder activar las notificaciones acá.
          </p>
        )}

        {state === 'denied' && (
          <p className="text-sm text-muted-foreground py-1 flex items-start gap-2">
            <BellOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Bloqueaste las notificaciones. Habilitalas en los ajustes del sistema para SIR y volvé.
          </p>
        )}

        {(state === 'idle' || state === 'subscribing') && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Recibí un aviso calmo a la mañana con lo que importa hoy.</p>
            <Button size="sm" onClick={enable} disabled={state === 'subscribing'} className="inline-flex items-center gap-1.5">
              {state === 'subscribing' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} strokeWidth={1.75} />}
              Activar notificaciones
            </Button>
          </div>
        )}

        {state === 'subscribed' && (
          <div className="space-y-2">
            <p className="text-sm text-foreground/90 flex items-center gap-1.5">
              <Check size={14} className="text-ok" aria-hidden="true" /> Activadas en este dispositivo.
            </p>
            <Button size="sm" variant="outline" onClick={sendTest} disabled={testing} className="inline-flex items-center gap-1.5">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={1.75} />}
              Enviar prueba
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
