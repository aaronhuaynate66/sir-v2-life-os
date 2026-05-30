'use client'
// SIR V2 — DailyBriefingCard (Fase 5: briefing diario en Mission Control).
//
// Botón "Briefing de hoy" -> POST /api/briefing/daily (efímero, LLM sobre el
// contexto actual). Render parseado por secciones (Hoy / En foco / Sugerencia).
// Autocontenido: no toca los stores del /panel.

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ApiError {
  status: number
  message: string
  detail?: string
}

const SECTION_LABELS = ['Hoy', 'En foco', 'Sugerencia']
const CACHE_KEY = 'sir-daily-briefing'

function todayStr(): string {
  // Fecha local del cliente (el cache es por dispositivo).
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadCached(): string | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { date?: string; text?: string }
    return parsed?.date === todayStr() && typeof parsed.text === 'string' ? parsed.text : null
  } catch {
    return null
  }
}

function saveCached(text: string): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ date: todayStr(), text }))
  } catch {
    /* localStorage lleno/deshabilitado: el briefing igual se muestra esta sesión */
  }
}

export function DailyBriefingCard() {
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  // Carga el briefing cacheado de HOY (si lo hay) al montar — client-only,
  // en efecto (no en render) para no romper hidratación.
  useEffect(() => {
    const cached = loadCached()
    if (cached) setBriefing(cached)
  }, [])

  async function generate() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/briefing/daily', { method: 'POST' })
      if (!res.ok) {
        let b: { error?: string; detail?: string } = {}
        try { b = await res.json() } catch { /* sin body */ }
        setError({ status: res.status, message: b.error ?? `HTTP ${res.status}`, detail: b.detail })
        return
      }
      const json = (await res.json()) as { briefing: string }
      setBriefing(json.briefing)
      saveCached(json.briefing)
    } catch (e) {
      setError({ status: 0, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-none mb-6 border-accent/20">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={15} strokeWidth={1.75} className="text-accent" aria-hidden="true" />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Briefing de hoy
            </div>
          </div>
          <Button size="sm" variant={briefing ? 'ghost' : 'outline'} onClick={generate} disabled={loading}>
            {loading ? (
              <Loader2 size={13} className="animate-spin mr-1.5" />
            ) : briefing ? (
              <RefreshCw size={13} strokeWidth={1.75} className="mr-1.5" />
            ) : (
              <Sparkles size={13} strokeWidth={1.75} className="mr-1.5" />
            )}
            {loading ? 'Generando…' : briefing ? 'Regenerar' : 'Generar briefing'}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-red-400">
              <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
              {error.status === 422 ? 'Sin contexto todavía' : `Error HTTP ${error.status}: ${error.message}`}
            </div>
            {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
          </div>
        )}

        {!briefing && !error && !loading && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            Un resumen accionable de tu día a partir de tus objetivos, señales y estado reciente.
            Tocá <span className="text-foreground font-medium">Generar briefing</span>.
          </p>
        )}

        {briefing && !loading && <BriefingBody text={briefing} />}
      </CardContent>
    </Card>
  )
}

function BriefingBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const label = SECTION_LABELS.find((l) => block.toLowerCase().startsWith(l.toLowerCase() + ':'))
        if (label) {
          const value = block.slice(label.length + 1).trim()
          const isHoy = label === 'Hoy'
          const isSug = label === 'Sugerencia'
          const bullets = label === 'En foco'
            ? value.split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
            : null
          return (
            <div
              key={i}
              className={cn(
                isHoy && 'rounded-md border border-accent/30 bg-accent/5 p-3',
                isSug && 'rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3',
              )}
            >
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</div>
              {bullets ? (
                <ul className="space-y-1 list-disc pl-4">
                  {bullets.map((b, j) => (
                    <li key={j} className="text-sm text-foreground leading-relaxed">{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground leading-relaxed">{value}</p>
              )}
            </div>
          )
        }
        return <p key={i} className="text-sm text-foreground leading-relaxed">{block}</p>
      })}
    </div>
  )
}
