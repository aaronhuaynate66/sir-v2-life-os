'use client'
// SIR V2 — DiscardCaptureButton: descarta una captura/observación mal extraída.
//
// Marca is_obsolete=true vía PATCH /api/observations/[id] (RLS). La captura
// deja de alimentar las vistas curadas (Vida social/profesional, Bitácora) y
// desaparece de la ficha tras router.refresh(). Confirmación breve antes.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { discardObservation, HttpError } from '@/lib/capture/observations/client'
import { cn } from '@/lib/utils'

export interface DiscardCaptureButtonProps {
  observationId: string
  /** Texto del botón. Default "Descartar captura". */
  label?: string
  /** Qué es, para el diálogo (ej. "Perfil de LinkedIn"). */
  what?: string
  className?: string
}

export function DiscardCaptureButton({
  observationId,
  label = 'Descartar captura',
  what,
  className,
}: DiscardCaptureButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onConfirm() {
    setBusy(true)
    try {
      await discardObservation(observationId)
      toast.success('Captura descartada', { description: 'Dejará de aparecer en la ficha.' })
      router.refresh()
    } catch (e) {
      const msg = e instanceof HttpError || e instanceof Error ? e.message : String(e)
      toast.error('No se pudo descartar', { description: msg })
      setBusy(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          className={cn('text-muted-foreground/70 hover:text-bad', className)}
        >
          {busy ? (
            <Loader2 size={13} className="mr-1.5 animate-spin" />
          ) : (
            <Trash2 size={13} strokeWidth={1.75} className="mr-1.5" aria-hidden="true" />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Descartar esta captura?</AlertDialogTitle>
          <AlertDialogDescription>
            {what ? `${what}. ` : ''}Dejará de aparecer en la ficha y en las vistas
            (Vida social / profesional, Bitácora). Si era una extracción mala, esto la saca de circulación.
            Podés volver a capturar cuando quieras.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={busy}
            className="bg-bad hover:bg-bad/90 text-white"
          >
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
