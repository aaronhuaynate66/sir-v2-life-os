'use client'
// SIR V2 — /relato (Router de relato · FASE 3: UI + ejecutor).
// Aaron pega un relato → /api/sir/router arma el PLAN → SIR lo muestra como
// acciones tipadas → Aaron incluye/edita/descarta cada una → al confirmar se
// ejecutan en orden de dependencia (empresa→persona→interacción→paso→bloqueo),
// reusando los stores y endpoints existentes. PROPONE → CONFIRMA → escribe.

import { useCallback, useMemo, useState } from 'react'
import { Wand2, Loader2, Check, X, Building2, UserPlus, MessageSquare, Flag, ListChecks } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionTitle } from '@/components/ui/section-title'
import { useRelationshipStore } from '@/stores'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { generateSlug } from '@/lib/people/slug'
import type { RouterAction, RouterPlan } from '@/lib/sir/router/plan'
import type { Person, ObjectiveStep } from '@/types'

type Row = { action: RouterAction; included: boolean; result?: 'ok' | 'fail'; msg?: string }

const META: Record<RouterAction['type'], { label: string; Icon: typeof Building2 }> = {
  crear_organizacion: { label: 'Crear empresa', Icon: Building2 },
  crear_persona: { label: 'Crear persona', Icon: UserPlus },
  registrar_interaccion: { label: 'Registrar interacción', Icon: MessageSquare },
  agregar_paso_objetivo: { label: 'Paso al objetivo', Icon: Flag },
  agregar_bloqueo_objetivo: { label: 'Bloqueo / checklist', Icon: ListChecks },
}
const ORDER: Record<RouterAction['type'], number> = {
  crear_organizacion: 0, crear_persona: 1, registrar_interaccion: 2, agregar_paso_objetivo: 3, agregar_bloqueo_objetivo: 4,
}
const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n)

export default function RelatoPage() {
  const people = useRelationshipStore((s) => s.people)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const addStep = useObjectiveStepStore((s) => s.addStep)

  const [narrative, setNarrative] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const armar = useCallback(async () => {
    if (busy || narrative.trim().length < 8) return
    setBusy(true); setErr(null); setRows(null); setDone(false)
    try {
      const res = await fetch('/api/sir/router', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrative: narrative.trim() }),
      })
      const j = (await res.json()) as { plan?: RouterPlan; error?: string }
      if (!res.ok || !j.plan) { setErr(j.error ?? 'No se pudo armar el plan'); return }
      setRows(j.plan.actions.map((a) => ({ action: a, included: true })))
      setUnmapped(j.plan.unmapped ?? [])
    } catch { setErr('No se pudo armar el plan') } finally { setBusy(false) }
  }, [busy, narrative])

  const patch = (i: number, a: Partial<RouterAction>) =>
    setRows((rs) => (rs ?? []).map((r, idx) => (idx === i ? { ...r, action: { ...r.action, ...a } as RouterAction } : r)))
  const toggle = (i: number) => setRows((rs) => (rs ?? []).map((r, idx) => (idx === i ? { ...r, included: !r.included } : r)))

  const findPerson = useCallback((name: string) => {
    const n = name.trim().toLowerCase()
    return people.find((p) => p.name.trim().toLowerCase() === n)
      ?? people.find((p) => p.name.trim().toLowerCase().includes(n) || n.includes(p.name.trim().toLowerCase()))
  }, [people])
  const findGoal = useCallback((title: string) => {
    const t = title.trim().toLowerCase()
    return goals.find((g) => g.title.trim().toLowerCase() === t)
      ?? goals.find((g) => g.title.trim().toLowerCase().includes(t) || t.includes(g.title.trim().toLowerCase()))
  }, [goals])

  const ejecutar = useCallback(async () => {
    if (!rows || running) return
    setRunning(true)
    const order = [...rows.entries()].filter(([, r]) => r.included).sort((a, b) => ORDER[a[1].action.type] - ORDER[b[1].action.type])
    const createdIds: Record<string, string> = {} // nombre lower → personId recién creado
    const next = [...rows]
    for (const [i, r] of order) {
      const a = r.action
      try {
        if (a.type === 'crear_organizacion') {
          const res = await fetch('/api/empresas/profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: generateSlug(a.nombre), name: a.nombre, source: 'router' }),
          })
          next[i] = { ...r, result: res.ok ? 'ok' : 'fail', msg: res.ok ? 'Empresa creada' : 'No se pudo crear' }
        } else if (a.type === 'crear_persona') {
          const now = new Date().toISOString()
          const taken = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
          let slug = generateSlug(a.nombre)
          while (taken.has(slug)) slug = `${slug}-${rand(3)}`
          const id = `per_${Date.now()}_${rand(6)}`
          const person: Person = {
            id, slug, name: a.nombre,
            relationship: (a.relacion as Person['relationship']) ?? 'acquaintance',
            category: 'network', importanceScore: 5, energyImpact: 'neutral', trustLevel: 5,
            contactFrequency: '', tags: [], notes: 'Creado desde el Router de relato.',
            title: a.cargo ?? undefined, organization: a.organizacion ?? undefined,
            createdAt: now, updatedAt: now,
          }
          addPerson(person)
          createdIds[a.nombre.trim().toLowerCase()] = id
          next[i] = { ...r, result: 'ok', msg: 'Persona creada' }
        } else if (a.type === 'registrar_interaccion') {
          const pid = createdIds[a.persona.trim().toLowerCase()] ?? findPerson(a.persona)?.id
          if (!pid) { next[i] = { ...r, result: 'fail', msg: `No encontré a ${a.persona}` } ; continue }
          const res = await fetch('/api/person-logs', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person_id: pid, kind: 'interaction', value: a.calidad, note: a.nota || undefined }),
          })
          next[i] = { ...r, result: res.ok ? 'ok' : 'fail', msg: res.ok ? 'Interacción registrada' : 'No se pudo registrar' }
        } else if (a.type === 'agregar_paso_objetivo') {
          const g = findGoal(a.objetivo)
          if (!g) { next[i] = { ...r, result: 'fail', msg: `No encontré el objetivo «${a.objetivo}»` }; continue }
          const order2 = steps.filter((s) => s.objectiveId === g.id).length
          const step: ObjectiveStep = {
            id: `step_${Date.now()}_${rand(6)}`, objectiveId: g.id, kind: 'task',
            title: a.paso, status: 'pendiente', order: order2, createdAt: new Date().toISOString(),
          }
          addStep(step)
          next[i] = { ...r, result: 'ok', msg: `Paso agregado a «${g.title}»` }
        } else if (a.type === 'agregar_bloqueo_objetivo') {
          const g = findGoal(a.objetivo)
          if (!g) { next[i] = { ...r, result: 'fail', msg: `No encontré el objetivo «${a.objetivo}»` }; continue }
          const res = await fetch('/api/objectives/plan', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal_id: g.id, title: a.bloqueo, due_on: a.due || undefined }),
          })
          next[i] = { ...r, result: res.ok ? 'ok' : 'fail', msg: res.ok ? `Bloqueo agregado a «${g.title}»` : 'No se pudo agregar' }
        }
      } catch {
        next[i] = { ...r, result: 'fail', msg: 'Error al ejecutar' }
      }
      setRows([...next])
    }
    setRunning(false)
    setDone(true)
  }, [rows, running, people, steps, addPerson, addStep, findPerson, findGoal])

  const pending = useMemo(() => (rows ?? []).filter((r) => r.included && !r.result).length, [rows])

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
        <div className="flex items-center gap-3">
          <Wand2 size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Contale a SIR</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Contá lo que pasó como se lo dirías a alguien. SIR lo descompone en acciones, vos confirmás, y se carga solo.
        </p>
      </div>

      <Card className="mb-6 shadow-none">
        <CardContent className="p-4 sm:p-5">
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={6}
            placeholder="Ej: Me junté con Delicia, me dijo que me apoya con el Mundial. Habló con Shian Navarro, el presidente de la FEDEPOL, que va a comprar el pasaje en julio. Falta que ingrese mis documentos al IPD y dar el examen médico…"
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-[14px] outline-none focus:border-foreground/30"
          />
          <Button size="sm" className="mt-2" disabled={busy || narrative.trim().length < 8} onClick={armar}>
            {busy ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Wand2 size={14} className="mr-1" />}
            {busy ? 'Pensando…' : 'Armar plan'}
          </Button>
          {err && <p className="mt-2 text-[13px] text-red-500">{err}</p>}
        </CardContent>
      </Card>

      {rows && (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <SectionTitle icon={ListChecks} label={`Plan — ${rows.length} acción(es)`} />
            {rows.length === 0 && <p className="mt-3 text-[13px] text-muted-foreground">SIR no encontró acciones claras en el relato. Probá contándolo con más detalle.</p>}

            <div className="mt-3 space-y-2.5">
              {rows.map((r, i) => {
                const m = META[r.action.type]
                return (
                  <div key={i} className={'rounded-lg border p-3 ' + (r.included ? 'border-border' : 'border-border/40 opacity-50')}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={r.included} onChange={() => toggle(i)} className="mt-1" disabled={!!r.result} />
                      <m.Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                        <ActionFields action={r.action} onChange={(a) => patch(i, a)} disabled={!!r.result} />
                      </div>
                      {r.result === 'ok' && <span className="flex items-center gap-1 text-[12px]" style={{ color: '#2dd4a7' }}><Check size={13} /> {r.msg}</span>}
                      {r.result === 'fail' && <span className="flex items-center gap-1 text-[12px] text-red-500"><X size={13} /> {r.msg}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {unmapped.length > 0 && (
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SIR no cargó esto (revisalo vos)</p>
                <ul className="mt-1 list-disc pl-5 text-[12.5px] text-muted-foreground">
                  {unmapped.map((u, k) => <li key={k}>{u}</li>)}
                </ul>
              </div>
            )}

            {rows.length > 0 && !done && (
              <Button className="mt-4" disabled={running || pending === 0} onClick={ejecutar}>
                {running ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
                {running ? 'Cargando…' : `Confirmar y cargar (${pending})`}
              </Button>
            )}
            {done && <p className="mt-4 text-[13px]" style={{ color: '#2dd4a7' }}>Listo. Lo que quedó en rojo no se cargó — revisalo o cargalo a mano.</p>}
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}

function ActionFields({ action, onChange, disabled }: { action: RouterAction; onChange: (a: Partial<RouterAction>) => void; disabled: boolean }) {
  const cls = 'mt-1 text-[13px]'
  switch (action.type) {
    case 'crear_organizacion':
      return <Input value={action.nombre} disabled={disabled} className={cls} onChange={(e) => onChange({ nombre: e.target.value })} />
    case 'crear_persona':
      return (
        <div className="space-y-1.5">
          <Input value={action.nombre} disabled={disabled} className={cls} onChange={(e) => onChange({ nombre: e.target.value })} placeholder="Nombre" />
          <Input value={action.cargo ?? ''} disabled={disabled} className="text-[13px]" onChange={(e) => onChange({ cargo: e.target.value })} placeholder="Cargo (opcional)" />
          <Input value={action.organizacion ?? ''} disabled={disabled} className="text-[13px]" onChange={(e) => onChange({ organizacion: e.target.value })} placeholder="Empresa (opcional)" />
        </div>
      )
    case 'registrar_interaccion':
      return (
        <div className="space-y-1.5">
          <p className="text-[13px] text-foreground/90">con <strong>{action.persona}</strong> · tono {action.calidad}/5</p>
          <Input value={action.nota} disabled={disabled} className="text-[13px]" onChange={(e) => onChange({ nota: e.target.value })} placeholder="Nota" />
        </div>
      )
    case 'agregar_paso_objetivo':
      return (
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted-foreground">en «{action.objetivo}»</p>
          <Input value={action.paso} disabled={disabled} className="text-[13px]" onChange={(e) => onChange({ paso: e.target.value })} />
        </div>
      )
    case 'agregar_bloqueo_objetivo':
      return (
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted-foreground">en «{action.objetivo}»{action.due ? ` · ${action.due}` : ''}</p>
          <Input value={action.bloqueo} disabled={disabled} className="text-[13px]" onChange={(e) => onChange({ bloqueo: e.target.value })} />
        </div>
      )
  }
}
