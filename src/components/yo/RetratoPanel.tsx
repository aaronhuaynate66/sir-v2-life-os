'use client'
// SIR V2 — Retrato. SIR te devuelve quién sos HOY, sintetizado de lo que ya
// sabe (identidad, norte, cómo viene la semana, vínculos, conflictos). Un espejo,
// no un formulario. Se cachea en localStorage para no regenerar (ni gastar IA) en
// cada carga; botón para actualizar.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SectionTitle } from '@/components/ui/section-title'
import { useSelfStore } from '@/stores/useSelfStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { computeEspejoSemanal } from '@/lib/self/espejoSemanal'

const LS_KEY = 'sir_retrato_v1'

function computeAge(birth: string | null): number | null {
  if (!birth) return null
  const t = Date.parse(`${birth.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / (365.25 * 86_400_000))
}

export function RetratoPanel() {
  const profile = useSelfStore((s) => s.identityProfile)
  const goals = useGoalStore((s) => s.goals)
  const people = useRelationshipStore((s) => s.people)
  const steps = useObjectiveStepStore((s) => s.steps)
  const selfMetrics = useSelfStore((s) => s.selfMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)

  const [retrato, setRetrato] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    try { const c = localStorage.getItem(LS_KEY); if (c) setRetrato(JSON.parse(c).text) } catch { /* */ }
  }, [])

  const buildFacts = useCallback(async (): Promise<string> => {
    const L: string[] = []
    // Identidad
    if (profile) {
      const age = computeAge(profile.birthDate)
      const who = [profile.fullName || 'Aaron', age ? `${age} años` : null].filter(Boolean).join(', ')
      L.push(`Identidad: ${who}.`)
      if (profile.roles?.length) L.push(`Roles: ${profile.roles.join(', ')}.`)
      if (profile.location) L.push(`Vive en ${profile.location}.`)
      if (profile.bio) L.push(`En sus palabras: ${profile.bio}`)
    }
    // Norte + objetivos
    const anchor = goals.find((g) => g.status === 'active' && g.isAnchor)
    if (anchor) L.push(`Su norte del año: «${anchor.title}»${anchor.why ? ` (por qué: ${anchor.why})` : ''}.`)
    const others = goals.filter((g) => g.status === 'active' && !g.isAnchor).map((g) => g.title)
    if (others.length) L.push(`Otros objetivos activos: ${others.slice(0, 6).join('; ')}.`)
    // Cómo viene la semana
    const espejo = computeEspejoSemanal(goals, steps, sleepRecords, selfMetrics)
    L.push(`Cómo viene la semana: ${espejo.headline}`)
    if (espejo.gaps[0]) L.push(`Brecha principal: ${espejo.gaps[0].label} — ${espejo.gaps[0].observed}.`)
    // Vínculos clave
    const key = [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0)).slice(0, 5)
    if (key.length) L.push(`Vínculos clave: ${key.map((p) => p.name).join(', ')}.`)
    // Conflictos abiertos
    try {
      const res = await fetch('/api/moments?open=1')
      if (res.ok) {
        const j = (await res.json()) as { moments?: Array<{ title: string }> }
        const titles = (j.moments ?? []).map((m) => m.title).slice(0, 5)
        if (titles.length) L.push(`Conflictos/temas abiertos: ${titles.join('; ')}.`)
      }
    } catch { /* */ }
    return L.join('\n')
  }, [profile, goals, people, steps, sleepRecords, selfMetrics])

  const generar = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const facts = await buildFacts()
      const res = await fetch('/api/self/retrato', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts }),
      })
      const j = (await res.json()) as { retrato?: string; error?: string }
      if (!res.ok || !j.retrato) { setErr(j.error ?? 'No se pudo generar'); return }
      setRetrato(j.retrato)
      try { localStorage.setItem(LS_KEY, JSON.stringify({ text: j.retrato, ts: Date.now() })) } catch { /* */ }
    } catch { setErr('No se pudo generar') } finally { setBusy(false) }
  }, [busy, buildFacts])

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Sparkles} label="Quién sos hoy" />
          {retrato && (
            <button type="button" onClick={generar} disabled={busy} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} actualizar
            </button>
          )}
        </div>

        {retrato ? (
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">{retrato}</p>
        ) : (
          <>
            <p className="mt-2 text-[13px] text-muted-foreground">
              SIR puede armar un retrato de quién sos hoy a partir de lo que ya tiene — tu identidad, tu norte, cómo venís y tus vínculos.
            </p>
            <Button size="sm" className="mt-3" disabled={busy} onClick={generar}>
              {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
              {busy ? 'Armando…' : 'Armar mi retrato'}
            </Button>
          </>
        )}
        {err && <p className="mt-2 text-[13px] text-red-500">{err}</p>}
      </CardContent>
    </Card>
  )
}
