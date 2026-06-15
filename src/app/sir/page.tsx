'use client'
// SIR V2 — /sir · "Preguntá a SIR" (#86 conversacional, PR1 SOLO LECTURA).
//
// Chat aterrizado sobre la data de Aaron: responde preguntas como
// "¿qué pasó con Dayana?" o "¿cómo me acerco a Francisco esta semana?".
// v1 NO ejecuta acciones — solo lee y responde/sugiere (POST /api/sir/ask).

import { useRef, useState } from 'react'
import { Sparkles, Send, Loader2, ArrowLeft, User } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { track, EVENTS } from '@/lib/analytics/track'

interface Turn {
  role: 'user' | 'sir'
  text: string
  sources?: { people: string[]; memories: number }
}

const SUGGESTIONS = [
  '¿Qué pasó con Dayana?',
  '¿Cómo me acerco a Francisco esta semana?',
  '¿A quién tengo descuidado?',
  '¿Cómo voy con mis objetivos?',
]

export default function SirChatPage() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function ask(question: string) {
    const q = question.trim()
    if (!q || loading) return
    setError(null)
    setInput('')
    setTurns((t) => [...t, { role: 'user', text: q }])
    setLoading(true)
    track(EVENTS.sirAsked, { length: q.length })
    try {
      const res = await fetch('/api/sir/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo responder')
        return
      }
      setTurns((t) => [...t, { role: 'sir', text: data.answer ?? '', sources: data.sources }])
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <Link href="/panel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mission Control
        </Link>

        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-[#14b8a6]" />
            <h1 className="text-2xl font-semibold tracking-tight">Preguntá a SIR</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pregunto sobre tu gente, tus vínculos y tus objetivos. Respondo con lo que tengo registrado —
            si no lo sé, te lo digo. Todavía no ejecuto acciones, solo te oriento.
          </p>
        </header>

        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground/90 hover:border-[#14b8a6]/60"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {turns.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  t.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-[#14b8a6]/15 px-4 py-2.5 text-[15px] text-foreground'
                    : 'max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-[15px] text-foreground/90'
                }
              >
                {t.role === 'sir' && (
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[#14b8a6]">
                    <Sparkles size={11} /> SIR
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
                {t.sources && t.sources.people.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <User size={11} />
                    {t.sources.people.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> SIR está pensando…
            </div>
          )}
          {error && <div className="text-sm text-red-400">{error}</div>}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); ask(input) }}
          className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) }
            }}
            rows={1}
            placeholder="Preguntale algo a SIR…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-[#14b8a6] p-2 text-white disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send size={18} />
          </button>
        </form>
      </main>
    </AppShell>
  )
}
