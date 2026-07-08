'use client'

// SIR V2 — BigFiveCard (19·M4 + 19·M5): instrumento Big Five consentido.
// subject='self' → autoperfil de Aaron (M5). subject=<personId> → test que
// responde ESA persona (M4). Muestra el resultado si ya existe, o el test corto.
// Autoreporte (no inferencia): lo responde quien lo vive, con su permiso.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { UserSquare } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BIG_FIVE_ITEMS, scoreBigFive, summarizeBigFive, TRAIT_LABEL, TRAIT_HIGH, type Trait, type BigFiveScores,
} from '@/lib/profiling/bigFive'

const TRAITS: Trait[] = ['O', 'C', 'E', 'A', 'N']

export function BigFiveCard({ subject, title = 'Perfil Big Five', whoAnswers = 'Respondé', }: {
  subject: string
  title?: string
  /** Framing de quién responde (ej. 'Respondé' o 'Que responda Diana'). */
  whoAnswers?: string
}) {
  const [scores, setScores] = useState<BigFiveScores | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [taking, setTaking] = useState(false)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/bigfive?subject=${encodeURIComponent(subject)}`)
      if (r.ok) {
        const j = (await r.json()) as { profile: BigFiveScores | null }
        if (j.profile) setScores(j.profile)
      }
    } catch { /* best-effort */ } finally { setLoaded(true) }
  }, [subject])
  useEffect(() => { void load() }, [load])

  const computed = useMemo(() => scoreBigFive(answers), [answers])

  const save = useCallback(async () => {
    if (!computed || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/bigfive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, ...computed }) })
      if (!res.ok) { toast.error('No se pudo guardar el test'); return }
      setScores(computed); setTaking(false); setAnswers({})
    } catch { toast.error('No se pudo guardar el test') } finally { setSaving(false) }
  }, [computed, saving, subject])

  if (!loaded) return null

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserSquare size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{title}</h2>
          </div>
          {scores && !taking && (
            <button type="button" onClick={() => setTaking(true)} className="text-[11px] text-muted-foreground hover:text-foreground">rehacer</button>
          )}
        </div>

        {scores && !taking ? (
          <ResultView scores={scores} />
        ) : taking ? (
          <div className="space-y-2.5">
            <p className="text-[11px] text-muted-foreground">Del 1 (muy en desacuerdo) al 5 (muy de acuerdo).</p>
            {BIG_FIVE_ITEMS.map((it) => (
              <div key={it.id} className="space-y-1">
                <div className="text-[12.5px] text-foreground/90">{it.text}</div>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} type="button" onClick={() => setAnswers((a) => ({ ...a, [it.id]: v }))}
                      className={`h-7 w-7 rounded-full border text-[11px] ${answers[it.id] === v ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={!computed || saving} onClick={save}>Guardar perfil</Button>
              <Button size="sm" variant="ghost" onClick={() => { setTaking(false); setAnswers({}) }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              El instrumento válido es el autoreporte, no una inferencia. {whoAnswers} un test corto (10 preguntas) → perfil real, con permiso.
            </p>
            <Button size="sm" variant="outline" onClick={() => setTaking(true)}>Hacer el test</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResultView({ scores }: { scores: BigFiveScores }) {
  return (
    <div className="space-y-2">
      {TRAITS.map((t) => (
        <div key={t}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-foreground/85">{TRAIT_LABEL[t]}</span>
            <span className="font-mono tabular-nums text-muted-foreground">{scores[t]}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
            <div className="h-full bg-brand/60 rounded-full" style={{ width: `${scores[t]}%` }} />
          </div>
          {scores[t] >= 60 && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{TRAIT_HIGH[t]}</div>}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{summarizeBigFive(scores)} Rasgos continuos, no cajas.</p>
    </div>
  )
}
