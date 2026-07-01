'use client'

// SIR V2 — AnotarAhora: card en la ficha para anotar algo sobre la persona
// SIN sobreescribir el campo `notes` de la ficha ("quién es").
//
// El texto se guarda como una `observation` con capture_type='manual_note'
// y observed_at=now → aparece en la Bitácora como evento fechado.
//
// Caso que motivó esto: Aaron anotó ayer "vino a entrevista, ganó el
// puesto, empieza 13 jul" sobre Mariana editando la card de identidad,
// pero ese texto sobreescribió el anterior y no dejó rastro fechado.
// AnotarAhora resuelve ese caso: nota rápida con timestamp visible.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { NotebookPen, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface AnotarAhoraProps {
  personId: string
}

export function AnotarAhora({ personId }: AnotarAhoraProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/observations/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, text: t }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(j.error ?? 'No se pudo guardar la nota')
        return
      }
      setText('')
      toast.success('Nota guardada · aparece en la Bitácora')
      // Refresca el server component → Bitácora incluye la observation nueva.
      router.refresh()
    } catch {
      toast.error('No se pudo guardar la nota')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <NotebookPen size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Anotar algo ahora</div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Vino a entrevista · ganó el puesto · empieza el 13 jul…"
          className="w-full resize-none rounded-md border border-border bg-background p-2.5 text-sm outline-none focus:border-foreground/30 leading-relaxed"
          maxLength={4000}
          disabled={busy}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {text.length > 0 ? `${text.length}/4000 · timestamp automático` : 'Queda con hora exacta en la Bitácora.'}
          </span>
          <Button size="sm" onClick={save} disabled={!text.trim() || busy}>
            {busy ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <NotebookPen size={12} strokeWidth={1.75} className="mr-1.5" />}
            {busy ? 'Guardando…' : 'Anotar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
