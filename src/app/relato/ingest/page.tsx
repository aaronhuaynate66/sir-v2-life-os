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
import { Wand2, Loader2, CheckCircle2, AlertCircle, Circle, CircleCheck, Send, User, Sparkles, RotateCcw, Paperclip, Pencil } from 'lucide-react'
import { pdfFileToText } from '@/lib/capture/pdf/pdfToText'
import { PlanItemEditor } from '@/components/relato-ingest/PlanItemEditor'

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

const LS_KEY = 'sir_relato_ingest_history_v1'

// Serialización: los Set no roundtrip en JSON — los guardamos como arrays.
interface MsgSerialized {
  role: 'user' | 'sir'; id: string; text?: string; requestId?: string;
  plan?: PlanItem[]; ambiguous?: FlagAmbiguo[]; modelText?: string[];
  executed?: ExecResult[]; error?: string; selected?: string[];
}
function serializeMsg(m: Msg): MsgSerialized {
  if (m.role === 'user') return { role: 'user', id: m.id, text: m.text }
  return {
    role: 'sir', id: m.id, requestId: m.requestId,
    plan: m.plan, ambiguous: m.ambiguous, modelText: m.modelText,
    executed: m.executed, error: m.error,
    selected: [...m.selected],
  }
}
function deserializeMsg(s: MsgSerialized): Msg | null {
  if (s.role === 'user' && typeof s.text === 'string') return { role: 'user', id: s.id, text: s.text }
  if (s.role === 'sir') {
    return {
      role: 'sir', id: s.id, requestId: s.requestId ?? s.id,
      plan: s.plan ?? [], ambiguous: s.ambiguous ?? [], modelText: s.modelText ?? [],
      executed: s.executed, error: s.error,
      selected: new Set(s.selected ?? []),
      applying: false,
    }
  }
  return null
}

export default function RelatoIngestPage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachingPdf, setAttachingPdf] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<string | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [aplicarDirecto, setAplicarDirecto] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hydrated, setHydrated] = useState(false)

  // Cargar historial al montar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MsgSerialized[]
        const restored = parsed.map(deserializeMsg).filter((m): m is Msg => m !== null)
        if (restored.length > 0) setMsgs(restored.slice(-60)) // capa: últimos 60
      }
    } catch { /* silent */ }
    setHydrated(true)
  }, [])

  // Persistir historial (throttle simple con el effect).
  useEffect(() => {
    if (!hydrated) return
    try {
      const serial = msgs.slice(-60).map(serializeMsg)
      localStorage.setItem(LS_KEY, JSON.stringify(serial))
    } catch { /* silent (LS full o denied) */ }
  }, [msgs, hydrated])

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

    // Modo "aplicar directo": path viejo con JSON (necesita ejecutar server-side).
    if (aplicarDirecto) {
      try {
        const res = await fetch('/api/relato/ingest', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, apply: true }),
        })
        const j = (await res.json()) as ApiResponse
        if (!res.ok) {
          setMsgs((m) => [...m, { role: 'sir', id: nextId(), requestId: nextId(), plan: [], ambiguous: [], modelText: [], error: j.error ?? `HTTP ${res.status}`, selected: new Set(), applying: false }])
          return
        }
        const plan = j.plan ?? []
        const selected = new Set<string>()
        plan.forEach((it, i) => selected.add(itemKey(it, i)))
        setMsgs((m) => [...m, { role: 'sir', id: nextId(), requestId: nextId(), plan, ambiguous: j.ambiguous ?? [], modelText: j.modelText ?? [], executed: j.executed, selected, applying: false }])
      } catch (e) {
        setMsgs((m) => [...m, { role: 'sir', id: nextId(), requestId: nextId(), plan: [], ambiguous: [], modelText: [], error: e instanceof Error ? e.message : String(e), selected: new Set(), applying: false }])
      } finally { setBusy(false) }
      return
    }

    // Modo revisar (default): streaming SSE.
    const sirMsgId = nextId()
    const requestId = nextId()
    setMsgs((m) => [...m, {
      role: 'sir', id: sirMsgId, requestId,
      plan: [], ambiguous: [], modelText: [],
      selected: new Set(), applying: false,
    }])
    try {
      const res = await fetch('/api/relato/ingest/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => '')
        setMsgs((all) => all.map((m) => m.id === sirMsgId && m.role === 'sir' ? { ...m, error: err.slice(0, 200) || `HTTP ${res.status}` } : m))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const lines = part.split('\n')
          let event = ''
          let dataLine = ''
          for (const l of lines) {
            if (l.startsWith('event:')) event = l.slice(6).trim()
            if (l.startsWith('data:')) dataLine = l.slice(5).trim()
          }
          if (!event || !dataLine) continue
          let payload: unknown
          try { payload = JSON.parse(dataLine) } catch { continue }
          if (event === 'tool') {
            const action = (payload as { action: PlanItem }).action
            setMsgs((all) => all.map((m) => {
              if (m.id !== sirMsgId || m.role !== 'sir') return m
              const nextPlan = [...m.plan, action]
              const s = new Set(m.selected)
              s.add(itemKey(action, nextPlan.length - 1))
              return { ...m, plan: nextPlan, selected: s }
            }))
          } else if (event === 'ambiguous') {
            const action = (payload as { action: FlagAmbiguo }).action
            setMsgs((all) => all.map((m) => m.id === sirMsgId && m.role === 'sir' ? { ...m, ambiguous: [...m.ambiguous, action] } : m))
          } else if (event === 'text') {
            const chunk = (payload as { chunk: string }).chunk
            setMsgs((all) => all.map((m) => {
              if (m.id !== sirMsgId || m.role !== 'sir') return m
              const nextText = m.modelText.length > 0 ? [...m.modelText.slice(0, -1), m.modelText[m.modelText.length - 1] + chunk] : [chunk]
              return { ...m, modelText: nextText }
            }))
          } else if (event === 'error') {
            const err = (payload as { error: string }).error
            setMsgs((all) => all.map((m) => m.id === sirMsgId && m.role === 'sir' ? { ...m, error: err } : m))
          }
        }
      }
    } catch (e) {
      setMsgs((all) => all.map((m) => m.id === sirMsgId && m.role === 'sir' ? { ...m, error: e instanceof Error ? e.message : String(e) } : m))
    } finally { setBusy(false) }
  }

  async function aplicarSeleccion(msgId: string) {
    const msg = msgs.find((m) => m.role === 'sir' && m.id === msgId)
    if (!msg || msg.role !== 'sir') return
    if (msg.plan.length === 0 || msg.selected.size === 0) return
    setMsgs((all) => all.map((m) => m.id === msgId && m.role === 'sir' ? { ...m, applying: true } : m))
    try {
      // Ejecutamos SOLO las acciones seleccionadas — endpoint strict que no
      // re-llama a Claude. Cierra el bug de "el server aplica algo distinto
      // si destildaste items específicos".
      const chosen = msg.plan.filter((it, i) => msg.selected.has(itemKey(it, i)))
      const res = await fetch('/api/relato/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: chosen }),
      })
      const j = (await res.json()) as { executed?: ExecResult[]; error?: string }
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
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

  function updateItem(msgId: string, index: number, updated: PlanItem) {
    setMsgs((all) => all.map((m) => {
      if (m.id !== msgId || m.role !== 'sir') return m
      const nextPlan = m.plan.map((p, i) => i === index ? updated : p)
      // Reajustar `selected`: la key del item viejo puede haber cambiado.
      const oldKey = itemKey(m.plan[index], index)
      const newKey = itemKey(updated, index)
      const s = new Set(m.selected)
      if (s.has(oldKey) && oldKey !== newKey) { s.delete(oldKey); s.add(newKey) }
      return { ...m, plan: nextPlan, selected: s }
    }))
  }

  function reset() {
    if (msgs.length === 0) return
    if (!confirm('¿Limpiar el chat? Los items ya aplicados quedan en tu red.')) return
    setMsgs([])
    try { localStorage.removeItem(LS_KEY) } catch { /* */ }
  }

  async function attachPdf(file: File) {
    if (!file || !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return
    setAttachingPdf(true); setPdfNotice(null)
    try {
      const r = await pdfFileToText(file, { maxPages: 10 })
      if (r.error) { setPdfNotice(`Error: ${r.error}`); return }
      if (r.looksLikeScan || r.text.trim().length < 50) {
        setPdfNotice(`El PDF parece ser un scan sin texto (${r.pagesRead} páginas). Subilo desde /captura con Vision para mejores resultados.`)
        return
      }
      // Metemos el texto al final del draft con marker + resumen.
      const marker = `\n\n--- Contenido del PDF: ${file.name} (${r.pagesRead}/${r.totalPages} páginas) ---\n${r.text}\n--- FIN PDF ---\n`
      setDraft((d) => (d + marker).slice(0, 8000))
      setPdfNotice(`OK: pegué el texto de ${r.pagesRead} páginas. Editá el mensaje y enviá cuando estés listo.`)
    } finally { setAttachingPdf(false) }
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
                  onEditItem={(index, updated) => updateItem(m.id, index, updated)}
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
            <div
              className="flex gap-2 items-end"
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f) void attachPdf(f)
              }}
            >
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={attachingPdf || busy}
                title="Adjuntar PDF — se extrae el texto y se pega al mensaje"
                className="flex-shrink-0 rounded-md border border-border bg-background p-2 text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-50"
                aria-label="Adjuntar PDF"
              >
                {attachingPdf ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
              </button>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void attachPdf(f); e.target.value = '' }}
              />
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void enviar() }
                }}
                rows={2}
                placeholder="Contame qué pasó… (Ctrl/⌘ + Enter para enviar · arrastrá un PDF acá)"
                className="flex-1 min-w-0 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30 min-h-[44px] max-h-[240px]"
                disabled={busy}
              />
              <Button size="sm" onClick={() => void enviar()} disabled={!draft.trim() || busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5 space-y-0.5">
              <p>
                {aplicarDirecto
                  ? 'Modo aplicar directo — se guarda al toque, sin revisión.'
                  : 'Modo revisar — verás el plan y aprobás antes de guardar.'}
              </p>
              {pdfNotice && <p className={pdfNotice.startsWith('OK') ? 'text-ok' : 'text-warn'}>{pdfNotice}</p>}
            </div>
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
  msg, aplicarDirecto, onToggleItem, onEditItem, onApply,
}: {
  msg: Extract<Msg, { role: 'sir' }>
  aplicarDirecto: boolean
  onToggleItem: (key: string) => void
  onEditItem: (index: number, updated: PlanItem) => void
  onApply: () => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const okCount = (msg.executed ?? []).filter((r) => r.ok).length
  const failCount = (msg.executed ?? []).filter((r) => !r.ok).length

  // Undo timer: 30s desde el executed para deshacer las creaciones.
  const [undoRemaining, setUndoRemaining] = useState<number>(0)
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)
  useEffect(() => {
    if (!msg.executed || undone) return
    const okItems = msg.executed.filter((r) => r.ok && r.createdId)
    if (okItems.length === 0) return
    setUndoRemaining(30)
    const timer = setInterval(() => setUndoRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(timer)
  }, [msg.executed, undone])

  async function undo() {
    if (!msg.executed) return
    setUndoing(true)
    try {
      const items = msg.executed
        .filter((r) => r.ok && r.createdId)
        .map((r) => ({ kind: r.action.kind, id: r.createdId as string }))
      await fetch('/api/relato/undo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      setUndone(true)
    } finally { setUndoing(false) }
  }

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
                if (editingIndex === i) {
                  return (
                    <li key={key}>
                      <PlanItemEditor
                        item={it}
                        onSave={(updated) => { onEditItem(i, updated); setEditingIndex(null) }}
                        onCancel={() => setEditingIndex(null)}
                      />
                    </li>
                  )
                }
                return (
                  <li key={key} className="group relative">
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
                    {!aplicarDirecto && !msg.applying && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingIndex(i) }}
                        className="absolute right-1 top-1 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Editar item"
                        title="Editar"
                      >
                        <Pencil size={11} strokeWidth={1.75} />
                      </button>
                    )}
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
                  <span className={cn('leading-relaxed', r.ok ? 'text-muted-foreground' : 'text-bad', undone && r.ok && 'line-through')}>
                    <span className="font-medium text-foreground">{KIND_LABEL[r.action.kind]}</span> · {'personFullName' in r.action ? r.action.personFullName : 'fullName' in r.action ? r.action.fullName : 'title' in r.action ? r.action.title : '?'} — {summarize(r.action)}
                    {r.error && <span className="block italic opacity-80">{r.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {/* Undo pill: aparece cuando hay al menos 1 ok con createdId y el timer sigue. */}
            {undoRemaining > 0 && !undone && (
              <div className="flex items-center gap-2 pt-1 border-t border-current/20">
                <span className="text-[11px] text-muted-foreground">¿Fue un error?</span>
                <button
                  type="button"
                  onClick={() => void undo()}
                  disabled={undoing}
                  className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[10px] hover:bg-accent/10 disabled:opacity-50"
                >
                  {undoing ? <Loader2 size={9} className="animate-spin" /> : <RotateCcw size={9} />}
                  Deshacer ({undoRemaining}s)
                </button>
              </div>
            )}
            {undone && (
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-current/20 italic">
                Deshecho ✓
              </div>
            )}
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
