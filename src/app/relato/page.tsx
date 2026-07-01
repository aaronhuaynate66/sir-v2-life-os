'use client'
// SIR V2 — /relato (Router de relato · FASE 3: UI + ejecutor).
// Aaron pega un relato → /api/sir/router arma el PLAN → SIR lo muestra como
// acciones tipadas → Aaron incluye/edita/descarta cada una → al confirmar se
// ejecutan en orden de dependencia (empresa→persona→interacción→paso→bloqueo),
// reusando los stores y endpoints existentes. PROPONE → CONFIRMA → escribe.

import { useCallback, useMemo, useState } from 'react'
import { Wand2, Loader2, Check, X, Building2, UserPlus, MessageSquare, Flag, ListChecks, Target, Pencil, BookOpen } from 'lucide-react'
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
import type { Person, ObjectiveStep, Goal, GoalCategory, GoalPriority } from '@/types'

type Row = { action: RouterAction; included: boolean; result?: 'ok' | 'fail'; msg?: string }

const META: Record<RouterAction['type'], { label: string; Icon: typeof Building2 }> = {
  crear_organizacion: { label: 'Crear empresa', Icon: Building2 },
  crear_persona: { label: 'Crear persona', Icon: UserPlus },
  crear_objetivo: { label: 'Crear objetivo', Icon: Target },
  registrar_interaccion: { label: 'Registrar interacción', Icon: MessageSquare },
  registrar_episodio: { label: 'Registrar episodio', Icon: BookOpen },
  editar_objetivo: { label: 'Editar objetivo', Icon: Pencil },
  agregar_paso_objetivo: { label: 'Paso al objetivo', Icon: Flag },
  agregar_bloqueo_objetivo: { label: 'Bloqueo / checklist', Icon: ListChecks },
}
// Orden de ejecucion: primero crear entidades (org → persona → objetivo),
// despues eventos (interaccion → episodio), despues modificar/complementar.
const ORDER: Record<RouterAction['type'], number> = {
  crear_organizacion: 0,
  crear_persona: 1,
  crear_objetivo: 2,
  registrar_interaccion: 3,
  registrar_episodio: 4,
  editar_objetivo: 5,
  agregar_paso_objetivo: 6,
  agregar_bloqueo_objetivo: 7,
}
const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n)

/** Un solo campo de WOOP (obstacle + plan si-entonces) o solo el prompt de
 *  edicion completa a `/api/objectives/plan`. Ambos son opcionales. */
async function upsertWoop(goalId: string, obstaculo: string | null, siEntonces: string | null): Promise<boolean> {
  if (!obstaculo && !siEntonces) return true
  // siEntonces se persiste como plan_if + plan_then juntos en un solo bloque
  // (formato libre; la UI de /objetivos lo renderiza tal cual). Guardamos como
  // plan_if para que aparezca en la ficha y dejamos plan_then vacio — puede
  // separarse mas fino cuando el modelo lo emita en dos campos.
  const body: Record<string, string> = { goal_id: goalId }
  if (obstaculo) body.obstacle = obstaculo
  if (siEntonces) body.plan_if = siEntonces
  try {
    const res = await fetch('/api/objectives/plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch { return false }
}

export default function RelatoPage() {
  const people = useRelationshipStore((s) => s.people)
  const addPerson = useRelationshipStore((s) => s.addPerson)
  const goals = useGoalStore((s) => s.goals)
  const addGoal = useGoalStore((s) => s.addGoal)
  const updateGoal = useGoalStore((s) => s.updateGoal)
  const setAnchor = useGoalStore((s) => s.setAnchor)
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
        } else if (a.type === 'crear_objetivo') {
          // Ya existe? — el planner ya deberia haberlo puesto como editar, pero
          // si igual llego, no duplicamos: se marca fail para que Aaron vea.
          if (findGoal(a.titulo)) {
            next[i] = { ...r, result: 'fail', msg: `Ya existe el objetivo «${a.titulo}» — descartada` }
            setRows([...next]); continue
          }
          const now = new Date().toISOString()
          const goalId = `goal_${Date.now()}_${rand(6)}`
          const goal: Goal = {
            id: goalId,
            title: a.titulo,
            description: a.porQue ?? '',
            category: (a.categoria as GoalCategory | null) ?? 'personal',
            priority: (a.prioridad as GoalPriority | null) ?? 'medium',
            status: 'active',
            targetDate: a.targetDate ?? undefined,
            progress: 0,
            milestones: [],
            relatedGoals: [],
            relatedPersons: [],
            peaceImpact: 5,
            obstacles: [],
            nextAction: '',
            why: a.porQue ?? undefined,
            target: a.target ?? undefined,
            baseline: a.baseline ?? undefined,
            createdAt: now,
            updatedAt: now,
          }
          addGoal(goal)
          if (a.esAncla === true) setAnchor(goalId, true)
          createdIds[a.titulo.trim().toLowerCase()] = goalId  // por si viene edit despues
          // KRs → objective_steps con kind='kr'
          if (a.krs && a.krs.length > 0) {
            let order2 = 0
            for (const title of a.krs) {
              const kr: ObjectiveStep = {
                id: `step_${Date.now()}_${rand(6)}`,
                objectiveId: goalId,
                kind: 'key_result',
                title,
                status: 'pendiente',
                order: order2++,
                createdAt: new Date().toISOString(),
              }
              addStep(kr)
            }
          }
          // WOOP → objective_plan
          const woopOk = await upsertWoop(goalId, a.obstaculo ?? null, a.siEntonces ?? null)
          const parts = [`Objetivo «${a.titulo}» creado`]
          if (a.target || a.baseline) parts.push('SMART')
          if (a.krs?.length) parts.push(`${a.krs.length} KRs`)
          if (a.esAncla === true) parts.push('ancla')
          if ((a.obstaculo || a.siEntonces) && !woopOk) parts.push('WOOP no persistio')
          else if (a.obstaculo || a.siEntonces) parts.push('WOOP guardado')
          next[i] = { ...r, result: 'ok', msg: parts.join(' · ') }
        } else if (a.type === 'editar_objetivo') {
          const g = findGoal(a.objetivo)
          if (!g) { next[i] = { ...r, result: 'fail', msg: `No encontré el objetivo «${a.objetivo}»` }; continue }
          const patch: Partial<Goal> = {}
          if (a.prioridad) patch.priority = a.prioridad as GoalPriority
          if (Object.keys(patch).length > 0) updateGoal(g.id, patch)
          if (a.esAncla === true) setAnchor(g.id, true)
          if (a.esAncla === false && g.isAnchor) setAnchor(g.id, false)
          // KRs → append (no reemplaza)
          if (a.krs && a.krs.length > 0) {
            const existing = steps.filter((s) => s.objectiveId === g.id).length
            let order2 = existing
            for (const title of a.krs) {
              const kr: ObjectiveStep = {
                id: `step_${Date.now()}_${rand(6)}`,
                objectiveId: g.id,
                kind: 'key_result',
                title,
                status: 'pendiente',
                order: order2++,
                createdAt: new Date().toISOString(),
              }
              addStep(kr)
            }
          }
          const woopOk = await upsertWoop(g.id, a.obstaculo ?? null, a.siEntonces ?? null)
          const parts = [`«${g.title}» actualizado`]
          if (a.prioridad) parts.push(`prioridad ${a.prioridad}`)
          if (a.esAncla === true) parts.push('ancla ON')
          if (a.esAncla === false) parts.push('ancla OFF')
          if (a.krs?.length) parts.push(`+${a.krs.length} KRs`)
          if ((a.obstaculo || a.siEntonces) && !woopOk) parts.push('WOOP no persistio')
          else if (a.obstaculo || a.siEntonces) parts.push('WOOP')
          next[i] = { ...r, result: 'ok', msg: parts.join(' · ') }
        } else if (a.type === 'registrar_episodio') {
          const pid = createdIds[a.persona.trim().toLowerCase()] ?? findPerson(a.persona)?.id
          if (!pid) { next[i] = { ...r, result: 'fail', msg: `No encontré a ${a.persona}` }; continue }
          const res = await fetch('/api/moments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              person_id: pid,
              title: a.titulo,
              detail: a.detalle ?? undefined,
              follow_up_on: a.followUp ?? undefined,
            }),
          })
          next[i] = { ...r, result: res.ok ? 'ok' : 'fail', msg: res.ok ? `Episodio abierto con ${a.persona}` : 'No se pudo abrir episodio' }
        }
      } catch {
        next[i] = { ...r, result: 'fail', msg: 'Error al ejecutar' }
      }
      setRows([...next])
    }
    setRunning(false)
    setDone(true)
  }, [rows, running, people, steps, addPerson, addStep, addGoal, updateGoal, setAnchor, findPerson, findGoal])

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
    case 'crear_objetivo':
      return (
        <div className="space-y-1.5">
          <Input value={action.titulo} disabled={disabled} className={cls} onChange={(e) => onChange({ titulo: e.target.value })} placeholder="Título del objetivo" />
          {action.porQue && <p className="text-[12px] text-muted-foreground">Por qué: {action.porQue}</p>}
          {(action.prioridad || action.categoria || action.targetDate || action.esAncla === true) && (
            <p className="text-[12px] text-muted-foreground">
              {action.prioridad ? `prioridad ${action.prioridad}` : ''}
              {action.categoria ? ` · ${action.categoria}` : ''}
              {action.targetDate ? ` · ${action.targetDate}` : ''}
              {action.esAncla === true ? ' · ancla del año' : ''}
            </p>
          )}
          {(action.target || action.baseline) && (
            <p className="text-[12px] text-muted-foreground">
              SMART: {action.baseline ?? '—'} → {action.target ?? '—'}
            </p>
          )}
          {action.krs && action.krs.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-4 text-[12.5px] text-foreground/85 list-disc">
              {action.krs.map((k, idx) => <li key={idx}>{k}</li>)}
            </ul>
          )}
          {(action.obstaculo || action.siEntonces) && (
            <div className="mt-1 rounded border border-border/60 bg-muted/30 p-2 text-[12px] leading-snug">
              {action.obstaculo && <p><strong className="text-foreground">Obstáculo:</strong> {action.obstaculo}</p>}
              {action.siEntonces && <p className="mt-0.5"><strong className="text-foreground">Si-entonces:</strong> {action.siEntonces}</p>}
            </div>
          )}
        </div>
      )
    case 'editar_objetivo':
      return (
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted-foreground">en «{action.objetivo}»</p>
          {(action.prioridad !== null || action.esAncla !== null) && (
            <p className="text-[12px] text-muted-foreground">
              {action.prioridad ? `prioridad → ${action.prioridad}` : ''}
              {action.esAncla === true ? ' · ancla ON' : action.esAncla === false ? ' · ancla OFF' : ''}
            </p>
          )}
          {action.krs && action.krs.length > 0 && (
            <div>
              <p className="text-[12px] text-muted-foreground">+{action.krs.length} KRs (append):</p>
              <ul className="mt-0.5 space-y-0.5 pl-4 text-[12.5px] text-foreground/85 list-disc">
                {action.krs.map((k, idx) => <li key={idx}>{k}</li>)}
              </ul>
            </div>
          )}
          {(action.obstaculo || action.siEntonces) && (
            <div className="mt-1 rounded border border-border/60 bg-muted/30 p-2 text-[12px] leading-snug">
              {action.obstaculo && <p><strong className="text-foreground">Obstáculo:</strong> {action.obstaculo}</p>}
              {action.siEntonces && <p className="mt-0.5"><strong className="text-foreground">Si-entonces:</strong> {action.siEntonces}</p>}
            </div>
          )}
        </div>
      )
    case 'registrar_episodio':
      return (
        <div className="space-y-1.5">
          <p className="text-[13px] text-foreground/90">con <strong>{action.persona}</strong>{action.followUp ? ` · seguimiento ${action.followUp}` : ''}</p>
          <Input value={action.titulo} disabled={disabled} className={cls} onChange={(e) => onChange({ titulo: e.target.value })} placeholder="Título del episodio" />
          {action.detalle && <p className="text-[12.5px] text-muted-foreground leading-snug">{action.detalle}</p>}
        </div>
      )
  }
}
