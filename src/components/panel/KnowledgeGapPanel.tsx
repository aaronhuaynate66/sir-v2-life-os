'use client'
// SIR V2 — "SIR quiere saber": superficie AMBIENTE del Knowledge Gap Engine.
// SIR detecta lo que le falta para ayudarte y te pregunta — A VOS, nunca a
// terceros. Respondés → rellena el campo → el hueco desaparece. "No sé" →
// no vuelve a preguntar (descarte persistido). Capa fina.

import { useEffect, useMemo, useState } from 'react'
import { HelpCircle, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { detectGaps, type KnowledgeGap } from '@/lib/gaps/detect'
import { resolveBirthdayInput, monthLabels } from '@/lib/dates/birthdayInput'
import type { Person, SpecialDate } from '@/types'

const LS_KEY = 'sir-knowledge-gaps-dismissed'

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as string[] } catch { return [] }
}
function writeDismissed(keys: string[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(keys.slice(-200))) } catch { /* */ }
}

const MAX_VISIBLE = 3

export function KnowledgeGapPanel() {
  const hydrated = useHasHydrated()
  const people = useRelationshipStore((s) => s.people)
  const updatePerson = useRelationshipStore((s) => s.updatePerson)
  const goals = useGoalStore((s) => s.goals)
  const updateGoal = useGoalStore((s) => s.updateGoal)

  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window !== 'undefined' ? readDismissed() : []))
  // Cross-device: trae los descartes guardados en la tabla y los une con los
  // locales (best-effort; si falla, sigue con localStorage).
  useEffect(() => {
    let cancel = false
    fetch('/api/gaps/dismissed')
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((j: { keys?: string[] }) => {
        if (cancel || !Array.isArray(j.keys) || j.keys.length === 0) return
        setDismissed((prev) => {
          const merged = Array.from(new Set([...prev, ...j.keys!]))
          writeDismissed(merged)
          return merged
        })
      })
      .catch(() => {})
    return () => { cancel = true }
  }, [])
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const gaps = useMemo(
    () => (hydrated ? detectGaps(people, goals, new Set(dismissed)) : []),
    [hydrated, people, goals, dismissed],
  )

  if (!hydrated || gaps.length === 0) return null
  const visible = gaps.slice(0, MAX_VISIBLE)

  function answer(g: KnowledgeGap) {
    const val = (drafts[g.key] ?? '').trim()
    if (!val) return
    if (g.entity === 'person') updatePerson(g.entityId, { [g.field]: val })
    else updateGoal(g.entityId, { [g.field]: val })
    setDrafts((d) => { const n = { ...d }; delete n[g.key]; return n })
    // El hueco se auto-resuelve (el campo ya está); el detector deja de verlo.
  }
  function dismiss(g: KnowledgeGap) {
    const next = [...dismissed, g.key]
    setDismissed(next); writeDismissed(next)
    fetch('/api/gaps/dismissed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: g.key }) }).catch(() => {})
  }

  return (
    <Card className="mb-4 border-brand/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle size={14} strokeWidth={1.75} className="text-brand-soft-foreground" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">SIR quiere saber</div>
          {gaps.length > MAX_VISIBLE && (
            <span className="text-[10px] text-muted-foreground">({gaps.length} en total)</span>
          )}
        </div>
        <div className="space-y-3">
          {visible.map((g) => (
            <div key={g.key} className="space-y-1.5">
              <p className="text-sm text-foreground/90">{g.question}</p>
              {g.kind === 'birthday' ? (
                <BirthdayGapField
                  person={people.find((p) => p.id === g.entityId)}
                  updatePerson={updatePerson}
                  onDismiss={() => dismiss(g)}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type={g.inputType}
                    value={drafts[g.key] ?? ''}
                    aria-label={g.question}
                    onChange={(e) => setDrafts((d) => ({ ...d, [g.key]: e.target.value }))}
                    placeholder={g.inputType === 'text' ? 'Tu respuesta…' : ''}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    onKeyDown={(e) => { if (e.key === 'Enter') answer(g) }}
                  />
                  <button type="button" onClick={() => answer(g)} disabled={!(drafts[g.key] ?? '').trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-xs text-brand-foreground disabled:opacity-50">
                    <Check size={13} /> Guardar
                  </button>
                  <button type="button" onClick={() => dismiss(g)} title="No sé / no preguntar"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <X size={13} /> No sé
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Input de cumpleaños que NO exige año. Día + mes son obligatorios; el año es
 * OPCIONAL. Con año → birth_date (afirma edad). Sin año → fecha especial
 * "Cumpleaños de X" recurrente (el countdown usa día/mes, nunca inventa edad).
 * Cualquiera de los dos apaga el gap (ver detect.ts: hasBirthday).
 */
function BirthdayGapField({
  person,
  updatePerson,
  onDismiss,
}: {
  person: Person | undefined
  updatePerson: (id: string, patch: Partial<Person>) => void
  onDismiss: () => void
}) {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [err, setErr] = useState<string | null>(null)

  if (!person) return null
  const first = (person.name || '').trim().split(/\s+/)[0] || person.name
  const inputCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground'

  function save() {
    const r = resolveBirthdayInput(day, month, year, { maxYear: new Date().getFullYear() })
    if (!r.ok) { setErr(r.error); return }
    const now = new Date().toISOString()
    if (r.mode === 'birthDate') {
      updatePerson(person!.id, { birthDate: r.iso, updatedAt: now })
    } else {
      const sd: SpecialDate = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sd_${Date.now()}`,
        label: `Cumpleaños de ${first}`,
        date: r.iso,
        recurring: true,
      }
      updatePerson(person!.id, { specialDates: [...(person!.specialDates ?? []), sd], updatedAt: now })
    }
    // El gap se auto-resuelve: detect.ts deja de verlo (birth_date o fecha especial).
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number" min={1} max={31} placeholder="día" aria-label="día"
          value={day} onChange={(e) => { setDay(e.target.value); setErr(null) }}
          className={`${inputCls} w-16`}
        />
        <select
          value={month} onChange={(e) => { setMonth(e.target.value); setErr(null) }}
          aria-label="mes" className={inputCls}
        >
          <option value="">mes</option>
          {monthLabels().map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <input
          type="number" min={1900} placeholder="año (si lo sabés)" aria-label="año"
          value={year} onChange={(e) => { setYear(e.target.value); setErr(null) }}
          className={`${inputCls} w-32`}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
        />
        <button type="button" onClick={save} disabled={!day || !month}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-xs text-brand-foreground disabled:opacity-50">
          <Check size={13} /> Guardar
        </button>
        <button type="button" onClick={onDismiss} title="No preguntar más"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          <X size={13} /> No sé
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Si no sabés el año, dejalo vacío — guardo el día y mes, sin inventar la edad.
      </p>
      {err && <p className="text-[11px] text-bad">{err}</p>}
    </div>
  )
}
