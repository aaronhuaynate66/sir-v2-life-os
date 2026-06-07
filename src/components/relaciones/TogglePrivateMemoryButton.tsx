'use client'
// SIR V2 — TogglePrivateMemoryButton: marcar una memoria como privada/excluida
// (o devolverla a la vista general).
//
// A diferencia de DiscardMemoryButton (descarta una MALA derivación), esto es
// para un hecho REAL pero sensible: la memoria se CONSERVA, pero queda fuera de
// la vista general y de toda IA (briefing, "Antes de contactar", síntesis), y
// la re-derivación no la resucita (supresión por firma en /api/memories/derive).
//
// Reversible: desde el affordance "privadas" se vuelve a incluir (is_private=false).
// Marca vía PATCH /api/memories/[id] (RLS). router.refresh() re-fetcha.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EyeOff, Eye, Loader2 } from 'lucide-react'

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
import { setMemoryPrivate, MemoryHttpError } from '@/lib/memories/client'
import { cn } from '@/lib/utils'

export interface TogglePrivateMemoryButtonProps {
  memoryId: string
  /** Estado actual: true = ya es privada (mostramos "volver a incluir"). */
  isPrivate: boolean
  /** Fragmento de la memoria para el diálogo (se trunca). */
  preview?: string
  className?: string
}

export function TogglePrivateMemoryButton({
  memoryId,
  isPrivate,
  preview,
  className,
}: TogglePrivateMemoryButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function apply(next: boolean) {
    setBusy(true)
    try {
      await setMemoryPrivate(memoryId, next)
      toast.success(next ? 'Memoria marcada privada' : 'Memoria reincorporada', {
        description: next
          ? 'Sale de la vista general y de la IA. No se vuelve a derivar.'
          : 'Vuelve a la vista general y a alimentar los resúmenes.',
      })
      router.refresh()
    } catch (e) {
      const msg = e instanceof MemoryHttpError || e instanceof Error ? e.message : String(e)
      toast.error('No se pudo actualizar', { description: msg })
      setBusy(false)
    }
  }

  // Volver a incluir: acción directa (no destructiva, no necesita confirmación).
  if (isPrivate) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => apply(false)}
        aria-label="Volver a incluir esta memoria"
        title="Volver a incluir en la vista general"
        className={cn(
          'inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-50',
          className,
        )}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} strokeWidth={1.75} aria-hidden="true" />}
        Reincorporar
      </button>
    )
  }

  const snippet = preview && preview.length > 90 ? `${preview.slice(0, 90)}…` : preview

  // Marcar privada: confirmación breve (es un cambio de visibilidad importante).
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label="Marcar memoria como privada"
          title="Excluir / marcar privada"
          className={cn(
            'inline-flex items-center justify-center rounded p-1 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-50',
            className,
          )}
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <EyeOff size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Marcar esta memoria como privada?</AlertDialogTitle>
          <AlertDialogDescription>
            {snippet ? `“${snippet}” ` : ''}Sale de la vista general y deja de alimentar a la IA
            (briefing, “Antes de contactar”, resúmenes). Se conserva aparte y podés reincorporarla
            cuando quieras. Importante: re-derivar tus conversaciones <strong>no</strong> la vuelve a
            crear.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => apply(true)} disabled={busy}>
            Marcar privada
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
