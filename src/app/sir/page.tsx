'use client'
// SIR V2 — /sir · "Preguntá a SIR" (#86 conversacional, PR1 SOLO LECTURA).
//
// Chat aterrizado sobre la data de Aaron: responde preguntas como
// "¿qué pasó con Dayana?" o "¿cómo me acerco a Francisco esta semana?".
// v1 NO ejecuta acciones — solo lee y responde/sugiere (POST /api/sir/ask).

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Loader2, ArrowLeft, User, Check, X, CalendarCheck } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { track, EVENTS } from '@/lib/analytics/track'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores'
import { generateSlug } from '@/lib/people/slug'
import type { Goal, GoalCategory, Person, RelationshipType, PersonCategory } from '@/types'
import { SIR_MODELS, normalizeTier, type SirModelTier } from '@/lib/sir/model'

interface ProposedAction {
  kind: 'registrar_interaccion' | 'crear_objetivo' | 'crear_persona' | 'cerrar_relacion'
  persona?: string
  calidad?: number
  nota?: string
  titulo?: string
  categoria?: GoalCategory | PersonCategory
  prioridad?: Goal['priority']
  proximoPaso?: string
  impactoPaz?: number
  personaRelacionada?: string | null
  personId?: string | null
  nombre?: string
  relacion?: RelationshipType
  motivo?: string
  linkedGoals?: { id: string; title: string }[]
}

interface ClarifyingGap {
  key: string
  kind: 'birthday' | 'cycle' | 'goal_next_action' | 'post_conflict_contact' | 'stale_knowledge' | 'deal_stalled'
  entity: 'person' | 'goal' | 'deal'
  entityId: string
  entityName: string
  field: 'birthDate' | 'cycleStartDate' | 'nextAction' | null
  inputType: 'date' | 'text'
  /** Contextual: la respuesta NO persiste; se re-inyecta en la pregunta. */
  ephemeral?: boolean
}

interface Turn {
  role: 'user' | 'sir'
  text: string
  sources?: { people: string[]; memories: number }
  action?: ProposedAction
  actionState?: 'pending' | 'done' | 'discarded'
  // Gap-engine inline: SIR pide UNA pieza antes de responder.
  clarifying?: ClarifyingGap
  clarifyState?: 'pending' | 'answered' | 'dismissed'
  // Pregunta original, para re-preguntar una vez resuelto/descartado el hueco.
  originalQuestion?: string
}

const GAPS_LS_KEY = 'sir-knowledge-gaps-dismissed'
function readDismissedGaps(): string[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(GAPS_LS_KEY) || '[]') as string[] } catch { return [] }
}
function writeDismissedGaps(keys: string[]): void {
  try { localStorage.setItem(GAPS_LS_KEY, JSON.stringify(keys.slice(-200))) } catch { /* */ }
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
  const addGoal = useGoalStore((st) => st.addGoal)
  const updateGoal = useGoalStore((st) => st.updateGoal)
  const pauseGoal = useGoalStore((st) => st.pauseGoal)
  const addPerson = useRelationshipStore((st) => st.addPerson)
  const people = useRelationshipStore((st) => st.people)
  const updatePerson = useRelationshipStore((st) => st.updatePerson)
  const relationships = useRelationshipStore((st) => st.relationships)
  const updateRelationship = useRelationshipStore((st) => st.updateRelationship)
  const addRelationship = useRelationshipStore((st) => st.addRelationship)
  const [model, setModel] = useState<SirModelTier>('sonnet')

  const [goalSel, setGoalSel] = useState<Record<string, boolean>>({})
  const [clarifyDraft, setClarifyDraft] = useState<Record<number, string>>({})
  const THREAD_KEY = 'sir_chat_thread'
  // Cargar el hilo guardado al montar (persiste entre recargas/sesiones).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(THREAD_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setTurns(parsed as Turn[])
      }
    } catch { /* noop */ }
  }, [])
  // Guardar el hilo (acotado a los últimos 40 turnos) cuando cambia.
  useEffect(() => {
    try {
      if (turns.length === 0) localStorage.removeItem(THREAD_KEY)
      else localStorage.setItem(THREAD_KEY, JSON.stringify(turns.slice(-40)))
    } catch { /* noop */ }
  }, [turns])

  useEffect(() => {
    fetch('/api/sir/settings')
      .then((r) => r.json())
      .then((d) => setModel(normalizeTier(d?.chatModel)))
      .catch(() => {})
  }, [])

  function changeModel(tier: SirModelTier) {
    setModel(tier)
    fetch('/api/sir/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_model: tier }),
    }).catch(() => {})
  }

  function randSuffix(n: number): string {
    return Math.random().toString(36).slice(2, 2 + n)
  }

  function setTurnState(idx: number, state: 'done' | 'discarded') {
    setTurns((t) => t.map((tu, i) => (i === idx ? { ...tu, actionState: state } : tu)))
  }

  async function confirmAction(idx: number, a: ProposedAction) {
    track(EVENTS.sirActionConfirmed, { type: a.kind })
    try {
      if (a.kind === 'registrar_interaccion') {
        if (!a.personId) {
          toast.error(`No encontré a ${a.persona ?? 'esa persona'}`, { description: 'Abrí su ficha y registralo ahí, o nombrala distinto.' })
          return
        }
        const res = await fetch('/api/person-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: a.personId, kind: 'interaction', value: a.calidad ?? 3, note: a.nota || undefined }),
        })
        if (!res.ok) { toast.error('No se pudo registrar'); return }
        toast.success(`Interacción registrada con ${a.persona}`)
        setTurnState(idx, 'done')
      } else if (a.kind === 'crear_objetivo') {
        const now = new Date().toISOString()
        const g: Goal = {
          id: 'g_' + Date.now(),
          title: a.titulo ?? 'Objetivo',
          description: '',
          category: (a.categoria as GoalCategory) ?? 'personal',
          priority: a.prioridad ?? 'high',
          status: 'active',
          progress: 0,
          milestones: [],
          relatedGoals: [],
          relatedPersons: a.personId ? [a.personId] : [],
          peaceImpact: a.impactoPaz ?? 5,
          obstacles: [],
          nextAction: a.proximoPaso ?? '',
          createdAt: now,
          updatedAt: now,
        }
        addGoal(g)
        toast.success('Objetivo creado', { description: g.title })
        setTurnState(idx, 'done')
      } else if (a.kind === 'crear_persona') {
        const name = (a.nombre ?? '').trim()
        if (name.length < 2) { toast.error('Falta el nombre'); return }
        const taken = new Set(people.map((p) => p.slug).filter(Boolean) as string[])
        let slug = generateSlug(name)
        while (taken.has(slug)) slug = `${slug}-${randSuffix(3)}`
        const now = new Date().toISOString()
        const person: Person = {
          id: `per_${Date.now()}_${randSuffix(6)}`,
          slug,
          name,
          relationship: a.relacion ?? 'acquaintance',
          category: (a.categoria as PersonCategory) ?? 'network',
          importanceScore: 5,
          energyImpact: 'neutral',
          trustLevel: 5,
          contactFrequency: '',
          tags: [],
          notes: 'Creado desde el chat de SIR.',
          createdAt: now,
          updatedAt: now,
        }
        addPerson(person)
        track(EVENTS.personAdded, { method: 'sir_chat' })
        toast.success(`${name} agregado`, { description: 'Lo creé en tu red.' })
        setTurnState(idx, 'done')
      } else if (a.kind === 'cerrar_relacion') {
        if (!a.personId) {
          toast.error(`No encontré a ${a.persona ?? 'esa persona'}`, { description: 'Cerrá el vínculo desde su ficha.' })
          return
        }
        const person = people.find((p) => p.id === a.personId)
        const now = new Date().toISOString()
        // El status del vínculo vive en Relationship (no en Person).
        const rel = relationships.find((r) => r.personId === a.personId)
        if (rel) {
          updateRelationship(rel.id, { status: 'ended' })
        } else {
          addRelationship({
            id: `rel_${Date.now()}_${randSuffix(6)}`,
            personId: a.personId,
            type: person?.relationship ?? 'acquaintance',
            status: 'ended',
            depth: 0,
            reciprocity: 0,
            history: [],
            sharedGoals: [],
            tensions: [],
            strengths: [],
          })
        }
        // Nota de cierre en la persona (no se borra nada).
        const closingNote = `Vínculo cerrado el ${now.slice(0, 10)}${a.motivo ? ` — ${a.motivo}` : ''}.`
        updatePerson(a.personId, {
          notes: person?.notes ? `${person.notes}\n${closingNote}` : closingNote,
          updatedAt: now,
        })
        // Cerrar (pausar) los objetivos ligados que sigan tildados.
        const linked = a.linkedGoals ?? []
        let paused = 0
        for (const g of linked) {
          if (goalSel[`${idx}:${g.id}`] !== false) { pauseGoal(g.id); paused += 1 }
        }
        toast.success(`Cerré tu vínculo con ${a.persona}`, {
          description: paused > 0
            ? `${paused} objetivo(s) ligado(s) pausado(s). No borré nada.`
            : 'SIR deja de sugerirte retomar contacto. No borré nada.',
        })
        setTurnState(idx, 'done')
      }
    } catch {
      toast.error('Error al confirmar')
    }
  }

  async function ask(
    question: string,
    opts: { skipInlineGaps?: boolean; dismissedGaps?: string[]; suppressUserTurn?: boolean; userContext?: string } = {},
  ) {
    const q = question.trim()
    if (!q || loading) return
    setError(null)
    setInput('')
    if (!opts.suppressUserTurn) setTurns((t) => [...t, { role: 'user', text: q }])
    setLoading(true)
    track(EVENTS.sirAsked, { length: q.length })
    try {
      const res = await fetch('/api/sir/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: turns.map((t) => ({ role: t.role, text: t.text })),
          skipInlineGaps: opts.skipInlineGaps ?? false,
          dismissedGaps: opts.dismissedGaps ?? readDismissedGaps(),
          userContext: opts.userContext,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo responder')
        return
      }
      // Gap-engine inline: SIR pide UNA pieza antes de responder.
      const clarifying = data.clarifying as ClarifyingGap | null
      if (clarifying) {
        track(EVENTS.sirGapAsked, { kind: clarifying.kind })
        setTurns((t) => [...t, {
          role: 'sir', text: data.answer ?? '', clarifying,
          clarifyState: 'pending', originalQuestion: q,
        }])
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        return
      }
      const action = data.proposedAction as ProposedAction | null
      if (action) track(EVENTS.sirActionProposed, { type: action.kind })
      setTurns((t) => [...t, { role: 'sir', text: data.answer ?? '', sources: data.sources, action: action ?? undefined, actionState: action ? 'pending' : undefined }])
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  // Aaron respondió la pregunta inline → persiste el campo (se auto-resuelve el
  // hueco) y SIR retoma la pregunta original, ahora con la pieza completa.
  function answerClarifying(idx: number) {
    const turn = turns[idx]
    const c = turn?.clarifying
    const val = (clarifyDraft[idx] ?? '').trim()
    if (!c || !val) return
    setTurnClarifyState(idx, 'answered')
    track(EVENTS.sirGapAnswered, { kind: c.kind })
    if (c.ephemeral || !c.field) {
      // Contextual: NO se guarda (la situación cambia); se re-inyecta en la consulta.
      if (turn.originalQuestion) void ask(turn.originalQuestion, { skipInlineGaps: true, suppressUserTurn: true, userContext: val })
      return
    }
    // De campo: persiste el dato → auto-resuelve el hueco para siempre.
    if (c.entity === 'person') updatePerson(c.entityId, { [c.field]: val })
    else updateGoal(c.entityId, { [c.field]: val })
    toast.success('Anotado', { description: `${c.entityName}: lo guardé.` })
    if (turn.originalQuestion) void ask(turn.originalQuestion, { skipInlineGaps: true, suppressUserTurn: true })
  }

  // "No sé / ahora no": descarta el hueco (no vuelve a preguntar) y SIR responde
  // igual con lo que tiene.
  function dismissClarifying(idx: number) {
    const turn = turns[idx]
    const c = turn?.clarifying
    if (!c) return
    // Hueco de CAMPO → descarte permanente (no repetir). Contextual → solo salta
    // este turno (mañana la situación puede cambiar; no lo silencio para siempre).
    if (!c.ephemeral) writeDismissedGaps([...readDismissedGaps(), c.key])
    setTurnClarifyState(idx, 'dismissed')
    if (turn.originalQuestion) void ask(turn.originalQuestion, { skipInlineGaps: true, suppressUserTurn: true })
  }

  function setTurnClarifyState(idx: number, state: 'answered' | 'dismissed') {
    setTurns((t) => t.map((x, i) => (i === idx ? { ...x, clarifyState: state } : x)))
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <Link href="/panel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Mission Control
          </Link>
          {turns.length > 0 && (
            <button
              onClick={() => { setTurns([]); setError(null) }}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Nueva conversación
            </button>
          )}
        </div>

        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-[#14b8a6]" />
            <h1 className="text-2xl font-semibold tracking-tight">Preguntá a SIR</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pregunto sobre tu gente, tus vínculos y tus objetivos. Respondo con lo que tengo registrado —
            si no lo sé, te lo digo. Si me pedís registrar algo o crear un objetivo, te lo propongo y vos confirmás.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Modelo</span>
            <select
              value={model}
              onChange={(e) => changeModel(e.target.value as SirModelTier)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-[12px] text-foreground/90 outline-none"
            >
              {Object.values(SIR_MODELS).map((m) => (
                <option key={m.tier} value={m.tier}>{m.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">{SIR_MODELS[model].hint}</span>
          </div>
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
                {t.clarifying && (
                  <div className="mt-3 rounded-xl border border-[#14b8a6]/40 bg-[#14b8a6]/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[#14b8a6]">
                      <Sparkles size={12} /> {t.clarifying.ephemeral ? 'SIR necesita contexto' : 'SIR necesita un dato'}
                    </div>
                    {t.clarifyState === 'answered' ? (
                      <div className="flex items-center gap-1 text-[12px] text-[#14b8a6]"><Check size={13} /> {t.clarifying.ephemeral ? 'Gracias — con eso te respondo' : 'Anotado — sigo con eso'}</div>
                    ) : t.clarifyState === 'dismissed' ? (
                      <div className="text-[12px] text-muted-foreground">Sin ese dato — te respondo con lo que tengo</div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type={t.clarifying.inputType}
                          value={clarifyDraft[i] ?? ''}
                          onChange={(e) => setClarifyDraft((d) => ({ ...d, [i]: e.target.value }))}
                          placeholder={t.clarifying.inputType === 'text' ? 'Tu respuesta…' : ''}
                          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                          onKeyDown={(e) => { if (e.key === 'Enter') answerClarifying(i) }}
                        />
                        <button onClick={() => answerClarifying(i)} disabled={!(clarifyDraft[i] ?? '').trim()}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#14b8a6] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
                          <Check size={13} /> Guardar
                        </button>
                        <button onClick={() => dismissClarifying(i)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground">
                          <X size={13} /> {t.clarifying.ephemeral ? 'Saltar' : 'No sé'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {t.action && (
                  <div className="mt-3 rounded-xl border border-[#14b8a6]/40 bg-[#14b8a6]/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[#14b8a6]">
                      <CalendarCheck size={12} />
                      {t.action.kind === 'registrar_interaccion' ? 'Registrar interacción' : t.action.kind === 'crear_objetivo' ? 'Crear objetivo' : t.action.kind === 'crear_persona' ? 'Crear persona' : 'Cerrar vínculo'}
                    </div>
                    {t.action.kind === 'registrar_interaccion' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.persona}</span>
                        {typeof t.action.calidad === 'number' && <span className="text-muted-foreground"> · calidad {t.action.calidad}/5</span>}
                        {t.action.nota && <div className="mt-0.5 text-muted-foreground">{t.action.nota}</div>}
                        {!t.action.personId && <div className="mt-1 text-[12px] text-amber-400">⚠ No la tengo registrada — no podré vincularla.</div>}
                      </div>
                    ) : t.action.kind === 'crear_objetivo' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.titulo}</span>
                        <div className="mt-0.5 text-muted-foreground">
                          {t.action.categoria} · prioridad {t.action.prioridad} · paz {t.action.impactoPaz}/10
                          {t.action.personaRelacionada ? ` · ${t.action.personaRelacionada}` : ''}
                        </div>
                        {t.action.proximoPaso && <div className="mt-0.5 text-muted-foreground">Próximo paso: {t.action.proximoPaso}</div>}
                      </div>
                    ) : t.action.kind === 'crear_persona' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.nombre}</span>
                        <div className="mt-0.5 text-muted-foreground">{t.action.relacion} · {t.action.categoria}</div>
                      </div>
                    ) : (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.persona}</span>
                        {t.action.motivo && <div className="mt-0.5 text-muted-foreground">{t.action.motivo}</div>}
                        <div className="mt-1 text-[12px] text-muted-foreground">SIR deja de sugerirte retomar contacto. No se borra nada.</div>
                        {!t.action.personId && <div className="mt-1 text-[12px] text-amber-400">⚠ No la tengo registrada con ese nombre.</div>}
                        {t.action.linkedGoals && t.action.linkedGoals.length > 0 && (
                          <div className="mt-2 rounded-lg border border-border bg-card/60 p-2">
                            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Objetivos ligados — ¿cerrar también?</div>
                            {t.action.linkedGoals.map((g) => {
                              const key = `${i}:${g.id}`
                              const checked = goalSel[key] !== false
                              return (
                                <label key={g.id} className="flex items-center gap-2 py-0.5 text-[13px] text-foreground/90 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={t.actionState === 'done' || t.actionState === 'discarded'}
                                    onChange={(e) => setGoalSel((prev) => ({ ...prev, [key]: e.target.checked }))}
                                    className="accent-[#14b8a6]"
                                  />
                                  {g.title}
                                </label>
                              )
                            })}
                            <div className="mt-0.5 text-[11px] text-muted-foreground">Se pausan (reversibles), no se borran.</div>
                          </div>
                        )}
                      </div>
                    )}
                    {t.actionState === 'done' ? (
                      <div className="mt-2 flex items-center gap-1 text-[12px] text-[#14b8a6]"><Check size={13} /> Hecho</div>
                    ) : t.actionState === 'discarded' ? (
                      <div className="mt-2 text-[12px] text-muted-foreground">Descartado</div>
                    ) : (
                      <div className="mt-2.5 flex gap-2">
                        <button onClick={() => confirmAction(i, t.action!)} className="inline-flex items-center gap-1 rounded-lg bg-[#14b8a6] px-3 py-1.5 text-[13px] font-medium text-white">
                          <Check size={13} /> Confirmar
                        </button>
                        <button onClick={() => setTurnState(i, 'discarded')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground">
                          <X size={13} /> Descartar
                        </button>
                      </div>
                    )}
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
