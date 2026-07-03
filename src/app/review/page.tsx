'use client'
// SIR V2 — /review: repaso spaced repetition.
//
// Muestra las cards debidas de a UNA. Aaron ve la pregunta, toca "revelar",
// ve la respuesta, y califica 0..3. La UI avanza a la siguiente.

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Loader2, Eye, ChevronRight, Sparkles, RefreshCcw, Trash2 } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ReviewCard {
  id: string
  question: string
  answer: string
  source_kind: 'birthday' | 'memory' | 'identity' | 'manual'
  source_ref: string | null
  interval_days: number
  streak: number
  reviews_count: number
}

const KIND_LABEL: Record<ReviewCard['source_kind'], string> = {
  birthday: 'cumple',
  memory: 'memoria',
  identity: 'identidad',
  manual: 'manual',
}

const GRADES = [
  { g: 0 as const, label: 'No sabía', class: 'border-bad/40 text-bad hover:bg-bad-soft' },
  { g: 1 as const, label: 'Con dificultad', class: 'border-warn/40 text-warn hover:bg-warn-soft' },
  { g: 2 as const, label: 'Bien', class: 'border-ok/40 text-ok hover:bg-ok-soft' },
  { g: 3 as const, label: 'Fácil', class: 'border-brand/40 text-brand hover:bg-brand-soft' },
]

export default function ReviewPage() {
  const [cards, setCards] = useState<ReviewCard[] | null>(null)
  const [i, setI] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [grading, setGrading] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/review?due=1', { cache: 'no-store' })
      if (!r.ok) { setCards([]); return }
      const j = (await r.json()) as { cards?: ReviewCard[] }
      setCards(j.cards ?? [])
      setI(0); setRevealed(false)
    } catch { setCards([]) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function generate() {
    setGenerating(true); setGenMsg(null)
    try {
      const r = await fetch('/api/review/generate', { method: 'POST' })
      const j = (await r.json()) as { created?: number; byKind?: Record<string, number> }
      if (r.ok) {
        setGenMsg(j.created ? `Generadas ${j.created} cards nuevas${j.byKind ? ` (${Object.entries(j.byKind).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}` : 'No hay cards nuevas para generar. Cargá cumpleaños o memorias importantes primero.')
        if (j.created) await load()
      }
    } finally { setGenerating(false) }
  }

  async function grade(g: 0 | 1 | 2 | 3) {
    if (!cards || grading) return
    const card = cards[i]; if (!card) return
    setGrading(true)
    try {
      await fetch('/api/review/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, grade: g }),
      })
      // Avanzar.
      if (i + 1 < cards.length) {
        setI(i + 1); setRevealed(false)
      } else {
        setCards([])
      }
    } finally { setGrading(false) }
  }

  async function skipDelete(id: string) {
    if (!confirm('¿Eliminar esta card del repaso? Se puede regenerar más adelante.')) return
    try { await fetch(`/api/review?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* */ }
    if (cards) {
      const next = cards.filter((c) => c.id !== id)
      setCards(next)
      if (i >= next.length && next.length > 0) setI(next.length - 1)
      setRevealed(false)
    }
  }

  const card = cards?.[i]

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Brain size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Repaso</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Repaso con intervalos crecientes (spaced repetition) para no olvidar
          detalles de la gente cercana. Cumpleaños, memorias importantes,
          identidad. Calificá honesto — el intervalo se ajusta solo.
        </p>
      </div>

      {cards == null && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 size={12} className="animate-spin" /> Buscando cards debidas…
        </div>
      )}

      {cards && cards.length === 0 && (
        <Card className="shadow-none mb-4">
          <CardContent className="p-6 text-center space-y-3">
            <Sparkles size={22} strokeWidth={1.5} className="text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No hay cards para repasar ahora. Volvé cuando toque, o generá nuevas desde tus datos.
            </p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => void generate()} disabled={generating}>
                {generating ? <><Loader2 size={12} className="mr-1.5 animate-spin" /> Generando…</> : <><RefreshCcw size={12} className="mr-1.5" /> Generar cards</>}
              </Button>
            </div>
            {genMsg && <p className="text-[11px] text-muted-foreground">{genMsg}</p>}
          </CardContent>
        </Card>
      )}

      {card && (
        <Card className="shadow-none mb-4">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{KIND_LABEL[card.source_kind]}</Badge>
              <span className="text-[10px] font-mono text-muted-foreground/60">
                {i + 1} / {cards.length} · streak {card.streak} · intervalo {card.interval_days}d
              </span>
              <button
                type="button"
                onClick={() => void skipDelete(card.id)}
                className="ml-auto text-muted-foreground/40 hover:text-bad"
                title="Eliminar esta card"
                aria-label="Eliminar"
              >
                <Trash2 size={12} />
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={card.id + (revealed ? 'a' : 'q')}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <div className="text-xl font-semibold text-foreground leading-snug">
                  {card.question}
                </div>
                {revealed ? (
                  <div className="mt-4 rounded-md border border-brand/30 bg-brand/5 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-brand/80 mb-1">Respuesta</div>
                    <p className="text-base text-foreground whitespace-pre-wrap">{card.answer}</p>
                  </div>
                ) : (
                  <div className="mt-4 text-center">
                    <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>
                      <Eye size={12} className="mr-1.5" /> Revelar respuesta
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {revealed && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                {GRADES.map((gr) => (
                  <button
                    key={gr.g}
                    type="button"
                    onClick={() => void grade(gr.g)}
                    disabled={grading}
                    className={cn(
                      'rounded-md border px-3 py-3 text-sm font-medium text-center transition-colors disabled:opacity-50',
                      gr.class,
                    )}
                  >
                    {grading ? <Loader2 size={13} className="inline animate-spin" /> : gr.label}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Regenerar en cualquier momento */}
      {cards && cards.length > 0 && (
        <div className="flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <RefreshCcw size={12} className="mr-1.5" />}
            Buscar cards nuevas
          </Button>
        </div>
      )}
      {genMsg && cards && cards.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center mt-2">{genMsg}</p>
      )}
    </AppShell>
  )
}
