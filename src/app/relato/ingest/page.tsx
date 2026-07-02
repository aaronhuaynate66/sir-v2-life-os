'use client'

// SIR V2 — /relato/ingest: chat conversacional.
//
// Aaron cuenta cosas en prosa desde un input abajo (tipo mensajería). Cada
// mensaje se envía a /api/relato/ingest, el server llama a Claude Sonnet con
// tools, y la respuesta aparece como una burbuja de "SIR" con el plan
// propuesto (moments, logs, notas, ciclos, cumples). Cada acción tiene
// checkbox — Aaron destilda lo que no quiera y aprieta "Aplicar".
//
// Toggle "Aplicar directo": salta el paso de revisión y ejecuta al toque.
// Útil cuando Aaron ya tiene confianza en cómo Claude interpreta.
//
// Historial en memoria (no persiste entre recargas por ahora). Se ve como
// scroll estilo Slack: mensajes viejos arriba, nuevo abajo.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Wand2, Loader2, CheckCircle2, AlertCircle, Circle, CircleCheck, Send, User, Sparkles, RotateCcw } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type PlanItem =
  | { kind: 'crear_moment'; personFullName: string; title: string; detail: string; occurredOn: string; status: 'abierto' | 'resuelto'; followUpOn?: string; resolution?: string }
  | { kind: 'crear_person_log'; personFullName: string; logKind: 'interaction' | 'mood' | 'energy'; value: number; note: string; loggedAt: string }
  | { kind: 'crear_nota_manual'; personFullName: string; text: string; observedAt: string }
  | { kind: 'upsert_cumpleanos'; personFullName: string; date: string }
  | { kind: 'registrar_ciclo'; personFullName: string; date: string; phase: 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'; confidence: 'high' | 'medium' | 'low'; note?: string }
  | { kind: 'crear_objetivo'; title: string; category: string; priority: string; targetDate?: string; nextStep?: string }
  | { kind: 'crear_persona'; fullName: string; relationship: string; category: string; notes?: string }

interface FlagAmbiguo { kind: 'flag_ambiguo'; shortName: string; contextHint?: string; optionsSeen?: string[] }
interface ExecResult { action: PlanItem; ok: boolean; error?: string; createdId?: string }
interface ApiResponse {
  plan: PlanItem[]
  ambiguous: FlagAmbiguo[]
  modelText: string[]
  invalid: Array<{ name: string; raw: unknown }>
  executed?: ExecResult[]
  error?: string
  detail?: string
}

type Msg =
  | { role: 'user'; id: string; text: string }
  | {
      role: 'sir'; id: string; requestId: string;
      plan: PlanItem[]; ambiguous: FlagAmbiguo[]; modelText: string[];
      executed?: ExecResult[]; error?: string;
      selected: Set<string>; applying: boolean;
    }

const KIND_LABEL: Record<PlanItem['kind'], string> = {
  crear_moment: 'Episodio',
  crear_person_log: 'Interacción',
  crear_nota_manual: 'Nota',
  upsert_cumpleanos: 'Cumpleaños',
  registrar_ciclo: 'Ciclo',
  crear_objetivo: 'Objetivo',
  crear_persona: 'Persona nueva',
}
const PHASE_LABEL: Record<'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown', string> = {
  bleeding: 'sangrando', pms: 'PMS', mid_cycle: 'medio del ciclo',
  ovulation: 'ovulación', luteal: 'fase lútea', unknown: 'fase indefinida',
}

function itemKey(item: PlanItem, i: number): string {
  const ref = 'personFullName' in item ? item.personFullName
    : 'fullName' in item ? item.fullName
    : 'title' in item ? item.title
    : String(i)
  return `${item.kind}:${ref}:${i}`
}

function summarize(item: PlanItem): string {
  switch (item.kind) {
    case 'crear_moment': {
      const base = `${item.occurredOn} · ${item.status}`
      if (item.status === 'abierto' && item.followUpOn) return `${base} · follow-up ${item.followUpOn}`
      return base
    }
    case 'crear_person_log':
      return `${item.logKind} ${item.value}/5 · ${item.loggedAt.slice(0, 10)}`
    case 'crear_nota_manual':
      return `nota · ${item.observedAt.slice(0, 10)}`
    case 'upsert_cumpleanos':
      return `cumple · ${item.date}`
    case 'registrar_ciclo':
      return `${PHASE_LABEL[item.phase]} · ${item.date}${item.confidence !== 'medium' ? ` · conf ${item.confidence}` : ''}`
    case 'crear_objetivo':
      return `${item.category} · ${item.priority}${item.targetDate ? ` · deadline ${item.targetDate}` : ''}${item.nextStep ? ` · próximo: ${item.nextStep}` : ''}`
    case 'crear_persona':
      return `${item.relationship} · ${item.category}${item.notes ? ` · ${item.notes.slice(0, 80)}` : ''}`
  }
}

function nextId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function RelatoIngestPage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [aplicarDirecto, setAplicarDirecto] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al final cuando cambia el historial.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs.length])

  async function enviar() {
    const text = draft.trim()
    if (!text || busy) return
    const userMsg: Msg = { role: 'user', id: nextId(), text }
    setMsgs((m) => [...m, userMsg])
    setDraft('')
    setBusy(true)
    try {
      const res = await fetch('/api/relato/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apply: aplicarDirecto }),
      })
      const j = (await res.json()) as ApiResponse
      const requestId = nextId()
      if (!res.ok) {
        setMsgs((m) => [...m, {
          role: 'sir', id: nextId(), requestId,
          plan: [], ambiguous: [], modelText: [],
          error: j.error ?? `HTTP ${res.status}`,
          selected: new Set(), applying: false,
        }])
        return
      }
      const plan = j.plan ?? []
      const selected = new Set<string>()
      plan.forEach((it, i) => selected.add(itemKey(it, i)))
      setMsgs((m) => [...m, {
        role: 'sir', id: nextId(), requestId,
        plan, ambiguous: j.ambiguous ?? [], modelText: j.modelText ?? [],
        executed: j.executed,
        selected, applying: false,
      }])
    } catch (e) {
      setMsgs((m) => [...m, {
        role: 'sir', id: nextId(), requestId: nextId(),
        plan: [], ambiguous: [], modelText: [],
        error: e instanceof Error ? e.message : String(e),
        selected: new Set(), applying: false,
      }])
    } finally { setBusy(false) }
  }

  async function aplicarSeleccion(msgId: string) {
    const msg = msgs.find((m) => m.role === 'sir' && m.id === msgId)
    if (!msg || msg.role !== 'sir') return
    if (msg.plan.length === 0 || msg.selected.size === 0) return
    // Buscamos el mensaje del usuario JUSTO ANTERIOR a este (el que originó el plan).
    const idx = msgs.findIndex((m) => m.id === msgId)
    const userPrev = [...msgs.slice(0, idx)].reverse().find((m) => m.role === 'user') as { text: string } | undefined
    if (!userPrev) return
    setMsgs((all) => all.map((m) => m.id === msgId && m.role === 'sir' ? { ...m, applying: true } : m))
    try {
      const res = await fetch('/api/relato/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Nota: el server reprocesa el texto con Claude para ejecutar. La lista
        // devuelta antes es orientativa. Si Aaron destildó algo, la selección
        // se aplica visualmente en la UI pero el server aplica lo que devuelva
        // ahora (idempotencia hace que duplicados se salten). Trade-off
        // pragmático — la garantía fuerte de "aplicar sólo estos exactos" es
        // un endpoint separado que puede venir después.
        body: JSON.stringify({ text: userPrev.text, apply: true }),
      })
      const j = (await res.json()) as ApiResponse
      setMsgs((all) => all.map((m) =>
        m.id === msgId && m.role === 'sir'
          ? { ...m, executed: j.executed ?? [], applying: false }
          : m
      ))
    } catch (e) {
      setMsgs((all) => all.map((m) =>
        m.id === msgId && m.role === 'sir'
          ? { ...m, error: e instanceof Error ? e.message : String(e), applying: false }
          : m
      ))
    }
  }

  function toggleItem(msgId: string, key: string) {
    setMsgs((all) => all.map((m) => {
      if (m.id !== msgId || m.role !== 'sir') return m
      const s = new Set(m.selected)
      if (s.has(key)) s.delete(key); else s.add(key)
      return { ...m, selected: s }
    }))
  }

  function reset() {
    if (msgs.length === 0) return
    if (!confirm('¿Limpiar el chat? Los items ya aplicados quedan en tu red.')) return
    setMsgs([])
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Sparkles size={22} strokeWidth={1.5} className="text-muted-foreground" />
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight leading-none">Contale a SIR</h1>
            <p className="text-[11px] text-muted-foreground mt-1">
              Contame en prosa qué pasó — episodios, con quién, cómo te sentiste. Yo estructuro y vos aprobás.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] text-muted-foreground select-none">
            <span
              className={cn(
                'relative h-4 w-7 rounded-full transition-colors',
                aplicarDirecto ? 'bg-brand' : 'bg-muted',
              )}
              onClick={() => setAplicarDirecto((v) => !v)}
            >
              <span className={cn(
                'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
                aplicarDirecto ? 'left-[13px]' : 'left-0.5',
              )} />
            </span>
            <span className={aplicarDirecto ? 'text-foreground' : ''}>Aplicar sin revisar</span>
          </label>
          {msgs.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label="Limpiar chat"
            >
              <RotateCcw size={12} /> Limpiar
            </button>
          )}
        </div>
      </div>

      <Card className="shadow-none mb-3">
        <CardContent className="p-0">
          <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto p-4 sm:p-5 space-y-4">
            {msgs.length === 0 && (
              <div className="text-center py-10 space-y-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-muted/40">
                  <Wand2 size={18} strokeWidth={1.75} className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Escribí abajo un relato en prosa. Usá nombres completos (nombre + apellido) para evitar confusiones.
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 justify-center max-w-2xl mx-auto">
                  {[
                    'Ayer discutí con [Nombre Apellido] porque…',
                    'El viernes 26 hablé con [Nombre Apellido] y quedamos en…',
                    '[Nombre Apellido] cumple el 9 de junio.',
                  ].map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDraft(h)}
                      className="rounded-full border border-border bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m) => (
              m.role === 'user' ? <UserBubble key={m.id} text={m.text} /> : (
                <SirBubble
                  key={m.id}
                  msg={m}
                  aplicarDirecto={aplicarDirecto}
                  onToggleItem={(key) => toggleItem(m.id, key)}
                  onApply={() => void aplicarSeleccion(m.id)}
                />
              )
            ))}
            {busy && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground italic">
                <Sparkles size={14} strokeWidth={1.75} className="text-brand/70 mt-0.5" />
                Estructurando con Claude…
              </div>
            )}
          </div>
          <div className="border-t border-border p-3">
            <div className="flex gap-2 items-end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void enviar() }
                }}
                rows={2}
                placeholder="Contame qué pasó… (Ctrl/⌘ + Enter para enviar)"
                className="flex-1 min-w-0 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30 min-h-[44px] max-h-[240px]"
                disabled={busy}
              />
              <Button size="sm" onClick={() => void enviar()} disabled={!draft.trim() || busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {aplicarDirecto
                ? 'Modo aplicar directo — se guarda al toque, sin revisión.'
                : 'Modo revisar — verás el plan y aprobás antes de guardar.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="text-[11px] text-muted-foreground text-center">
        <Link href="/relaciones" className="hover:text-foreground underline underline-offset-2">Ver personas afectadas en Relaciones →</Link>
      </div>
    </AppShell>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
        {text}
      </div>
      <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <User size={12} strokeWidth={2} className="text-brand" />
      </div>
    </div>
  )
}

function SirBubble({
  msg, aplicarDirecto, onToggleItem, onApply,
}: {
  msg: Extract<Msg, { role: 'sir' }>
  aplicarDirecto: boolean
  onToggleItem: (key: string) => void
  onApply: () => void
}) {
  const okCount = (msg.executed ?? []).filter((r) => r.ok).length
  const failCount = (msg.executed ?? []).filter((r) => !r.ok).length

  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles size={12} strokeWidth={1.75} className="text-brand" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {msg.error && (
          <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-xs text-bad flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5" /> {msg.error}
          </div>
        )}

        {msg.plan.length === 0 && !msg.error && !msg.executed && msg.ambiguous.length === 0 && (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            No encontré acciones concretas. Contá con más detalle (fechas, con quién, qué pasó).
          </div>
        )}

        {msg.ambiguous.length > 0 && (
          <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 space-y-1.5">
            {msg.ambiguous.map((a, i) => (
              <div key={i} className="text-xs text-foreground/90 leading-relaxed">
                Mencionaste <span className="font-medium">&quot;{a.shortName}&quot;</span> sin apellido.
                {a.optionsSeen && a.optionsSeen.length > 0 && (
                  <> Podría ser: {a.optionsSeen.join(', ')}. Aclará y reenviá.</>
                )}
              </div>
            ))}
          </div>
        )}

        {msg.plan.length > 0 && !msg.executed && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">Voy a registrar</span>
              <Badge variant="outline" className="text-[10px] font-mono">{msg.plan.length}</Badge>
              {!aplicarDirecto && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {msg.selected.size} seleccionadas
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {msg.plan.map((it, i) => {
                const key = itemKey(it, i)
                const checked = msg.selected.has(key)
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={aplicarDirecto || msg.applying}
                      onClick={() => onToggleItem(key)}
                      className={cn(
                        'w-full text-left flex items-start gap-2 rounded-md p-2 text-xs transition-colors',
                        aplicarDirecto ? 'cursor-default' : 'hover:bg-muted/40',
                        checked ? 'text-foreground' : 'text-muted-foreground line-through opacity-60',
                      )}
                    >
                      {checked ? <CircleCheck size={12} className="text-brand mt-0.5 flex-shrink-0" strokeWidth={2} /> : <Circle size={12} className="text-muted-foreground/70 mt-0.5 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{KIND_LABEL[it.kind]}</Badge>
                          <span className="text-foreground font-medium">
                            {'personFullName' in it ? it.personFullName : 'fullName' in it ? it.fullName : 'title' in it ? it.title : ''}
                          </span>
                          {it.kind === 'crear_moment' && (
                            <span className="text-[10px] font-medium">
                              {' — '}{it.title}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{summarize(it)}</p>
                        {it.kind === 'crear_moment' && it.detail && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-2">{it.detail}</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
            {!aplicarDirecto && (
              <div className="flex justify-end gap-2 pt-1 border-t border-border/40">
                <Button size="sm" onClick={onApply} disabled={msg.selected.size === 0 || msg.applying}>
                  {msg.applying ? <><Loader2 size={12} className="mr-1.5 animate-spin" /> Aplicando…</> : `Aplicar ${msg.selected.size}`}
                </Button>
              </div>
            )}
          </div>
        )}

        {msg.executed && (
          <div className={cn('rounded-lg border p-3 space-y-2', failCount === 0 ? 'border-ok/30 bg-ok-soft/40' : 'border-warn/30 bg-warn-soft/40')}>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 size={13} strokeWidth={1.75} className={failCount === 0 ? 'text-ok' : 'text-warn'} />
              <span className="font-medium text-foreground">
                Aplicadas {okCount}/{msg.executed.length}
                {failCount > 0 && ` · ${failCount} sin aplicar`}
              </span>
            </div>
            <ul className="space-y-1">
              {msg.executed.map((r, i) => (
                <li key={i} className="text-[11px] flex items-start gap-2">
                  {r.ok ? <CheckCircle2 size={11} className="text-ok mt-0.5 flex-shrink-0" /> : <AlertCircle size={11} className="text-bad mt-0.5 flex-shrink-0" />}
                  <span className={cn('leading-relaxed', r.ok ? 'text-muted-foreground' : 'text-bad')}>
                    <span className="font-medium text-foreground">{KIND_LABEL[r.action.kind]}</span> · {'personFullName' in r.action ? r.action.personFullName : 'fullName' in r.action ? r.action.fullName : 'title' in r.action ? r.action.title : '?'} — {summarize(r.action)}
                    {r.error && <span className="block italic opacity-80">{r.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {msg.modelText.length > 0 && (
          <details className="text-[10px] text-muted-foreground/70">
            <summary className="cursor-pointer hover:text-foreground">Notas del modelo</summary>
            <div className="pt-1 pl-3 space-y-0.5 italic">
              {msg.modelText.map((t, i) => <p key={i}>{t}</p>)}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
