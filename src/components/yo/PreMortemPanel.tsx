'use client'
// SIR V2 — Pre-Mortem de decisiones (Motor #3). Antes de un movimiento grande,
// SIR proyecta la consecuencia más probable DESDE tu propio patrón (norte,
// objetivos, conflictos abiertos). Decidir, no solo saber.

import { useState } from 'react'
import { GitBranch, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'

export function PreMortemPanel() {
  const [decision, setDecision] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    if (!decision.trim() || busy) return
    setBusy(true); setErr(null); setResult(null)
    try {
      const res = await fetch('/api/self/premortem', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decision.trim() }),
      })
      const j = (await res.json()) as { premortem?: string; error?: string }
      if (!res.ok || !j.premortem) { setErr(j.error ?? 'No se pudo correr'); return }
      setResult(j.premortem)
    } catch { setErr('No se pudo correr') } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={GitBranch} label="Pre-mortem de una decisión" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          ¿Qué estás por decidir? SIR proyecta cómo termina, según tu propio patrón.
        </p>
        <textarea
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          rows={3}
          placeholder="Ej: irme al Mundial aunque mi familia está en contra…"
          className="mt-3 w-full resize-none rounded-lg border border-border bg-background p-3 text-[14px] outline-none focus:border-foreground/30"
        />
        <Button size="sm" className="mt-2" disabled={busy || !decision.trim()} onClick={run}>
          {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
          {busy ? 'Proyectando…' : 'Correr pre-mortem'}
        </Button>
        {err && <p className="mt-2 text-[13px] text-red-500">{err}</p>}
        {result && (
          <div className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-[13.5px] leading-relaxed text-foreground/90">
            {result}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
