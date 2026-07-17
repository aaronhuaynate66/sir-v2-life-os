'use client'

// SIR V2 — ContradiceNotaCard: flag "⚠ contradice una nota".
//
// On-demand (llama a Sonnet, efímero — no cachea). Cruza las notas manuales de
// la persona (perfil / fricción / fortalezas / metas / notas fechadas) contra
// el HILO REAL del sustrato y muestra las contradicciones con el porqué y una
// cita. NO pisa la nota: solo la señala para que Aaron decida.

import { useState } from 'react'
import { TriangleAlert, Loader2, ScanSearch, RefreshCw, Quote, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ContradictionFinding } from '@/lib/contradiction-flag/prompt'

interface NotePayload {
  ref: number
  sourceLabel: string
  text: string
  date?: string | null
}

interface ApiResponse {
  findings?: ContradictionFinding[]
  notes?: NotePayload[]
  msgCount?: number
  error?: string
  detail?: string
}

export function ContradiceNotaCard({ personId, personName }: { personId: string; personName: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)
  const [findings, setFindings] = useState<ContradictionFinding[]>([])
  const [notesByRef, setNotesByRef] = useState<Map<number, NotePayload>>(new Map())
  const [msgCount, setMsgCount] = useState(0)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/contradiction-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      })
      const j = (await r.json()) as ApiResponse
      if (!r.ok) {
        setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}` : 'No se pudo revisar.')
        return
      }
      setFindings(j.findings ?? [])
      setNotesByRef(new Map((j.notes ?? []).map((n) => [n.ref, n])))
      setMsgCount(j.msgCount ?? 0)
      setRan(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const firstName = personName.split(' ')[0]

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div className="flex items-center gap-2">
            <ScanSearch size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Revisar mis notas contra el chat</h2>
          </div>
          {ran && (
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw size={11} className={cn(busy && 'animate-spin')} /> revisar de nuevo
            </button>
          )}
        </div>

        {!ran && !busy && (
          <>
            <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
              Contrasta lo que anotaste sobre {firstName} con el hilo real de la conversación y marca lo que
              haya <span className="font-medium text-foreground/80">quedado desactualizado o en contradicción</span>. No toca tus notas.
            </p>
            <Button size="sm" variant="outline" onClick={() => void run()}>
              <ScanSearch size={13} strokeWidth={1.75} className="mr-1.5" /> Revisar
            </Button>
          </>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 size={14} className="animate-spin" /> Contrastando tus notas con el hilo…
          </div>
        )}

        {error && <p className="text-[12px] text-bad mt-2">{error}</p>}

        {ran && !busy && (
          <div className="mt-1">
            {findings.length === 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-ok/30 bg-ok-soft/50 p-3">
                <CheckCircle2 size={15} strokeWidth={1.75} className="text-ok mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-[13px] text-foreground/90 leading-relaxed">
                  Nada que corregir: tus notas sobre {firstName} coinciden con lo que dice el chat.
                  <span className="text-muted-foreground/70"> Revisado contra {msgCount.toLocaleString('es-PE')} mensajes.</span>
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {findings.length === 1 ? 'Una nota parece' : `${findings.length} notas parecen`} contradecir el hilo.
                  Decide tú qué hacer — SIR no cambia nada.
                </p>
                {findings.map((f, i) => {
                  const note = notesByRef.get(f.noteRef)
                  return (
                    <div key={i} className="rounded-md border border-warn/30 bg-warn-soft/40 p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TriangleAlert size={13} strokeWidth={1.75} className="text-warn shrink-0" aria-hidden="true" />
                        {note && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {note.sourceLabel}
                            {note.date ? ` · ${note.date}` : ''}
                          </Badge>
                        )}
                        <span className={cn('text-[10px] font-medium', f.confidence === 'alta' ? 'text-warn' : 'text-muted-foreground')}>
                          confianza {f.confidence}
                        </span>
                      </div>
                      {note && (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary mb-0.5">Tu nota</div>
                          <p className="text-[13px] text-foreground/90 leading-relaxed">“{note.text}”</p>
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary mb-0.5">Lo que dice el chat</div>
                        <p className="text-[13px] text-foreground/90 leading-relaxed">{f.observation}</p>
                      </div>
                      {f.quote && (
                        <div className="flex items-start gap-1.5 rounded border border-border/60 bg-background/50 p-2">
                          <Quote size={11} strokeWidth={1.75} className="text-muted-foreground/60 mt-0.5 shrink-0" aria-hidden="true" />
                          <p className="text-[12px] text-muted-foreground italic leading-snug">{f.quote}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  Señales, no verdades: el chat es una muestra y puede leer mal el contexto. Revisado contra{' '}
                  {msgCount.toLocaleString('es-PE')} mensajes.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
