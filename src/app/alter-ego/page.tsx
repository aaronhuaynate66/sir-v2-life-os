'use client'

// SIR V2 — /alter-ego: qué postura filosófica tomar frente a una situación.
//
// Describís la situación (opcionalmente atada a una persona) y el alter ego te
// dice desde qué corriente encararla (estoico / Kant / Maquiavelo / Nietzsche /
// Camus…), con Kant de freno si entra el poder. Determinístico + voz opcional.

import { useMemo, useState } from 'react'
import { BrainCircuit, Loader2, ShieldCheck, Compass } from 'lucide-react'

import { trackAiError } from '@/lib/analytics/track'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRelationshipStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

interface Pick {
  id: string; name: string; thinker: string; principle: string; question: string
  stance: string; blindSpot: string; reason: string; isCheck: boolean
}
interface Result { tags: string[]; domain: string; picks: Pick[]; ethicalLine: string }

export default function AlterEgoPage() {
  const hydrated = useHasHydrated()
  const people = useRelationshipStore((s) => s.people)
  const sorted = useMemo(
    () => [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0) || a.name.localeCompare(b.name)),
    [people],
  )
  const [situation, setSituation] = useState('')
  const [personId, setPersonId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [voice, setVoice] = useState<string | undefined>()
  const [err, setErr] = useState<string | undefined>()

  async function run() {
    if (!situation.trim()) return
    setBusy(true); setErr(undefined)
    try {
      const res = await fetch('/api/alter-ego', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation, personId: personId || undefined }),
      })
      const data = (await res.json()) as { result?: Result; voice?: string; error?: string }
      if (!res.ok) { setErr(data.error ?? 'No se pudo consultar'); return }
      setResult(data.result ?? null); setVoice(data.voice)
    } catch {
      trackAiError('alter_ego', { status: 0, message: 'No se pudo consultar. Reintentá.' }) // GA4
      setErr('No se pudo consultar. Reintentá.')
    } finally {
      setBusy(false)
    }
  }

  if (!hydrated) return <RouteSkeleton />

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit size={18} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-foreground">Alter ego</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Contame la situación que tenés que enfrentar. Te digo desde qué corriente encararla y el primer movimiento.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <Textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="Ej: mañana tengo que pedirle el aumento a Alex y no sé cómo pararme…"
              rows={3}
              className="resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={personId} onValueChange={setPersonId}>
                <SelectTrigger className="w-auto min-w-[180px] h-9 text-sm">
                  <SelectValue placeholder="¿Con alguien? (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void run()} disabled={!situation.trim() || busy} className="ml-auto">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Compass size={15} strokeWidth={1.75} />}
                {busy ? 'Pensando…' : 'Consultar'}
              </Button>
            </div>
            {err && <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>{err}</p>}
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-4">
            {voice && (
              <Card className="border-brand/30">
                <CardContent className="p-4 sm:p-5">
                  <div className="text-[11px] uppercase tracking-[0.07em] text-brand mb-1.5">Tu alter ego</div>
                  <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-line">{voice}</p>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-normal">{result.domain}</Badge>
              {result.tags.map((t) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>
              ))}
            </div>

            {result.picks.map((p) => (
              <Card key={p.id + (p.isCheck ? '-check' : '')} className={p.isCheck ? 'border-l-2 border-l-amber-500' : ''}>
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.thinker}</span>
                    {p.isCheck && (
                      <Badge variant="outline" className="text-[10px] font-normal gap-1">
                        <ShieldCheck size={11} strokeWidth={1.75} aria-hidden="true" /> freno ético
                      </Badge>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground italic">“{p.question}”</p>
                  <p className="text-sm text-foreground">{p.stance}</p>
                  <p className="text-xs text-muted-foreground"><span className="text-text-tertiary">Punto ciego:</span> {p.blindSpot}</p>
                </CardContent>
              </Card>
            ))}

            <p className="text-xs text-muted-foreground border-t border-border pt-3">{result.ethicalLine}</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
