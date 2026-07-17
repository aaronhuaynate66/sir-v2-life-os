'use client'

// SIR V2 — "Actualizar 'Lo personal' de todas": regenera la síntesis narrativa
// de todas las personas cuyo hilo YA vive en el sustrato (chat_messages), desde
// el transcript REAL. Reusa el POST /api/person-synthesis (sustrato-first, #654):
// cada persona con ≥30 msgs se sintetiza del hilo completo en vez del resumen
// con pérdida. On-demand y explícito — Aaron decide cuándo gastar los tokens.

import { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { mapWithConcurrency } from '@/lib/async/pool'

interface EligiblePerson {
  personId: string
  name: string
  msgCount: number
}

/** Cuántas síntesis corren a la vez. Cada una es un Sonnet ~pocos segundos. */
const CONCURRENCY = 3

export function RegenerarSintesisTodas() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running'>('idle')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)

  async function run() {
    setPhase('loading')
    let eligible: EligiblePerson[] = []
    try {
      const r = await fetch('/api/person-synthesis/eligible', { cache: 'no-store' })
      const j = (await r.json().catch(() => ({}))) as { people?: EligiblePerson[]; error?: string }
      if (!r.ok) { toast.error(j.error ?? 'No se pudo leer la lista'); setPhase('idle'); return }
      eligible = j.people ?? []
    } catch {
      toast.error('No se pudo leer la lista (revisá tu conexión)'); setPhase('idle'); return
    }

    if (eligible.length === 0) {
      toast.info('Ninguna persona tiene hilo suficiente en el sustrato todavía.')
      setPhase('idle'); return
    }

    setTotal(eligible.length)
    setDone(0)
    setPhase('running')

    const results = await mapWithConcurrency(
      eligible,
      CONCURRENCY,
      async (p) => {
        try {
          const res = await fetch('/api/person-synthesis', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person_id: p.personId }),
          })
          return res.ok
        } catch {
          return false
        }
      },
      () => setDone((d) => d + 1),
    )

    const ok = results.filter(Boolean).length
    const failed = results.length - ok
    setPhase('idle')
    if (failed === 0) {
      toast.success(`"Lo personal" actualizado en ${ok} ficha${ok === 1 ? '' : 's'} desde el hilo real.`)
    } else {
      toast.warning(`Actualizadas ${ok}/${results.length}. ${failed} fallaron — reinténtalo más tarde.`)
    }
  }

  const busy = phase !== 'idle'

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {phase === 'running' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {done}/{total}
            </>
          ) : phase === 'loading' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Buscando…
            </>
          ) : (
            <>
              <Sparkles size={14} strokeWidth={1.75} />
              Actualizar &ldquo;Lo personal&rdquo;
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerar &ldquo;Lo personal&rdquo; de todas</AlertDialogTitle>
          <AlertDialogDescription>
            Vuelve a escribir la síntesis narrativa de cada persona que tenga su conversación
            en el sustrato, leyendo el <span className="font-medium text-foreground/80">hilo completo real</span> (no el
            resumen viejo). Es una llamada al modelo por persona — gasta tokens. La síntesis anterior
            queda archivada, no se pierde.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void run()}>Actualizar todas</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
