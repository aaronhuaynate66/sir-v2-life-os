'use client'
// SIR V2 — Error boundary de segmento (App Router).
//
// Atrapa cualquier excepción no manejada que se tire DURANTE el render de
// una ruta (o sus server components / data fetch que arrojen). Sin esto, un
// throw inesperado dejaba la vista rota/colgada con el overlay default.
//
// Es aditivo: NO cambia el happy path. Solo aparece cuando algo explota.
// Recuperable vía `reset()` (re-renderiza el segmento). Reporta a Sentry
// (inerte sin DSN -> no-op) + consola. Vive bajo el root layout, así que
// hereda tema oscuro + fuentes + globals.css.

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle, RotateCw, Home } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    // eslint-disable-next-line no-console
    console.error('[route-error]', error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="shadow-none max-w-md w-full border-red-500/30">
        <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={20} strokeWidth={1.75} className="text-red-400" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight">Algo se rompió en esta vista</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ocurrió un error inesperado al renderizar esta sección. Tus datos están a salvo
              (viven en el servidor). Probá reintentar; si persiste, recargá o volvé al panel.
            </p>
            {error.digest && (
              <p className="text-[10px] font-mono text-muted-foreground/50 pt-1">
                ref: {error.digest}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
            <Button size="sm" onClick={reset}>
              <RotateCw size={14} strokeWidth={1.75} className="mr-1.5" />
              Reintentar
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/panel">
                <Home size={14} strokeWidth={1.75} className="mr-1.5" />
                Ir al panel
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
