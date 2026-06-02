'use client'
// SIR V2 — DiscardMemoryButton: descarta una memoria derivada mala.
//
// Marca is_obsolete=true vía PATCH /api/memories/[id] (RLS). La memoria deja
// de aparecer en la ficha tras router.refresh(). Soft-delete: la fila queda
// como tombstone para que "Derivar desde mis conversaciones" no la resucite.
// Confirmación breve antes (mismo patrón que DiscardCaptureButton).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'

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
import { discardMemory, MemoryHttpError } from '@/lib/memories/client'
import { cn } from '@/lib/utils'

export interface DiscardMemoryButtonProps {
  memoryId: string
  /** Fragmento de la memoria para el diálogo (se trunca). */
  preview?: string
  className?: string
}

export function DiscardMemoryButton({ memoryId, preview, className }: DiscardMemoryButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onConfirm() {
    setBusy(true)
    try {
      await discardMemory(memoryId)
      toast.success('Memoria descartada', { description: 'Dejará de aparecer en la ficha.' })
      router.refresh()
    } catch (e) {
      const msg = e instanceof MemoryHttpError || e instanceof Error ? e.message : String(e)
      toast.error('No se pudo descartar', { description: msg })
      setBusy(false)
    }
  }

  const snippet = preview && preview.length > 90 ? `${preview.slice(0, 90)}…` : preview

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label="Descartar memoria"
          title="Descartar esta memoria"
          className={cn(
            'inline-flex items-center justify-center rounded p-1 text-muted-foreground/50 transition-colors hover:text-bad disabled:opacity-50',
            className,
          )}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Descartar esta memoria?</AlertDialogTitle>
          <AlertDialogDescription>
            {snippet ? `“${snippet}” ` : ''}Dejará de aparecer en la ficha. Si fue una derivación
            mala (de una captura ilegible), esto la saca de circulación. No se vuelve a generar
            sola al re-derivar.
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
