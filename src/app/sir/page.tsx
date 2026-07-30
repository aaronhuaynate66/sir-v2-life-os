'use client'
// SIR V2 — /sir · "Preguntá a SIR" (#86 conversacional, PR1 SOLO LECTURA).
//
// Chat aterrizado sobre la data de Aaron: responde preguntas como
// "¿qué pasó con Dayana?" o "¿cómo me acerco a Francisco esta semana?".
// v1 NO ejecuta acciones — solo lee y responde/sugiere (POST /api/sir/ask).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Sparkles, Send, Loader2, ArrowLeft, ArrowDown, User, Check, X, CalendarCheck, Mic, MicOff, ThumbsUp, ThumbsDown } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { estaAbierto } from '@/lib/objectives/steps'
import { track, trackAiError, EVENTS } from '@/lib/analytics/track'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useRelationshipStore } from '@/stores'
import { generateSlug } from '@/lib/people/slug'
import type { Goal, GoalCategory, Person, RelationshipType, PersonCategory } from '@/types'
import { SIR_MODELS, normalizeTier, DEFAULT_SIR_TIER, type SirModelTier } from '@/lib/sir/model'
import type { SirReceipt } from '@/lib/sir/ask'
import { memoryProvenance } from '@/lib/memories/provenance'

interface ProposedAction {
  kind: 'registrar_interaccion' | 'crear_objetivo' | 'crear_persona' | 'cerrar_relacion' | 'marcar_habito' | 'marcar_tarea' | 'agregar_hito' | 'crear_plan' | 'crear_recordatorio' | 'registrar_estado'
  persona?: string
  estado?: 'regla' | 'animo_bajo'
  habito?: string
  tarea?: string
  hito?: string
  objetivo?: string
  objetivoId?: string | null
  fecha?: string
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
  texto?: string
  cuando?: string
  linkedGoals?: { id: string; title: string }[]
}

interface ClarifyingGap {
  key: string
  kind: 'birthday' | 'cycle' | 'goal_next_action' | 'post_conflict_contact' | 'stale_knowledge' | 'deal_stalled' | 'deal_no_ticket'
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
  /** ISO del momento del turno (para timestamp + separador de día). Los turnos
   *  legados / cargados de la DB pueden no tenerlo → se degrada sin romper. */
  at?: string
  /** Canal que originó el turno. 'telegram' se marca en la UI ("vía Telegram")
   *  para que el hilo unificado muestre de dónde vino cada mensaje. */
  channel?: 'web' | 'telegram'
  /** Id de la sugerencia registrada en el ledger (si SIR propuso una acción) —
   *  para cerrar el loop al confirmar/descartar/valorar. */
  suggestionId?: string
  /** Feedback explícito del usuario sobre la respuesta (👍/👎), persistido. */
  feedback?: 'up' | 'down'
  /** Id de la fila en chat_feedback (Ola 2): el turno completo + rating, para
   *  atar luego la corrección del 👎 a la misma respuesta. */
  feedbackId?: string
  sources?: { people: string[]; memories: number; receipts?: SirReceipt[] }
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

// Timestamp + separador de día en zona Lima (como WhatsApp/Telegram).
const TIME_FMT = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
const DAY_FMT = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })
/** Clave de día 'YYYY-MM-DD' en Lima (para agrupar por jornada). null si no hay `at`. */
function dayKeyLima(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
}

interface SpeechLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

export default function SirChatPage() {
  const [turns, setTurns] = useState<Turn[]>([])
  // Sincronización viva del hilo unificado: `seenAtsRef` = timestamps (created_at)
  // ya mostrados → el polling solo agrega turnos NUEVOS (de Telegram o de un cron
  // proactivo) sin re-agregar los propios. `hydratedRef` gatea el polling hasta
  // que terminó la carga inicial (evita duplicar contra el fetch de montaje).
  const seenAtsRef = useRef<Set<string>>(new Set())
  const hydratedRef = useRef(false)
  const loadingRef = useRef(false)
  const [input, setInput] = useState('')
  // Dictado por voz (#86): Web Speech API nativa. Feature-detect; si no hay, no
  // se muestra el botón. Reemplaza el input con la transcripción (es-PE).
  const recognitionRef = useRef<SpeechLike | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceOk, setVoiceOk] = useState(false)
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'es-PE'; rec.interimResults = true; rec.continuous = false
    rec.onresult = (e) => {
      let txt = ''
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0]?.transcript ?? ''
      setInput(txt)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    setVoiceOk(true)
  }, [])
  function toggleVoice() {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) { try { rec.stop() } catch { /* */ }; setListening(false) }
    else { setInput(''); try { rec.start(); setListening(true); track(EVENTS.sirVoiceUsed) } catch { /* */ } }
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  // Scroll conversacional: al abrir aterrizamos en lo ÚLTIMO (como WhatsApp/
  // Telegram), no arriba en lo más viejo. `atBottomRef` = el usuario está al pie
  // (así un append lo scrollea, pero si está leyendo historia arriba NO lo
  // tironeamos). `showJump` muestra el FAB "saltar a lo último" cuando subió.
  const atBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)
  const [showJump, setShowJump] = useState(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior })
  }, [])
  const addGoal = useGoalStore((st) => st.addGoal)
  const updateGoal = useGoalStore((st) => st.updateGoal)
  const goals = useGoalStore((st) => st.goals)
  const objectiveSteps = useObjectiveStepStore((st) => st.steps)
  const setTaskStatus = useObjectiveStepStore((st) => st.setTaskStatus)
  const pauseGoal = useGoalStore((st) => st.pauseGoal)
  const addPerson = useRelationshipStore((st) => st.addPerson)
  const people = useRelationshipStore((st) => st.people)
  const updatePerson = useRelationshipStore((st) => st.updatePerson)
  const relationships = useRelationshipStore((st) => st.relationships)
  const updateRelationship = useRelationshipStore((st) => st.updateRelationship)
  const addRelationship = useRelationshipStore((st) => st.addRelationship)
  const [model, setModel] = useState<SirModelTier>(DEFAULT_SIR_TIER)
  const [socratic, setSocratic] = useState(false)

  const [goalSel, setGoalSel] = useState<Record<string, boolean>>({})
  const [clarifyDraft, setClarifyDraft] = useState<Record<number, string>>({})
  const THREAD_KEY = 'sir_chat_thread'
  // Cargar el hilo al montar: primero lo local (instantáneo), luego el canónico
  // de la DB (sir_messages) que incluye lo hablado por Telegram → historial
  // unificado cross-canal (Fase 2). Fail-open: sin red o sin tabla, queda local.
  useEffect(() => {
    let cancelled = false
    try {
      const raw = localStorage.getItem(THREAD_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setTurns(parsed as Turn[])
      }
    } catch { /* noop */ }
    fetch('/api/sir/thread')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (d && Array.isArray(d.turns) && d.turns.length > 0) {
          const dbTurns = (d.turns as Array<{ role?: unknown; text?: unknown; at?: unknown; channel?: unknown }>)
            .filter((t) => (t.role === 'user' || t.role === 'sir') && typeof t.text === 'string')
            .map((t) => ({
              role: t.role as 'user' | 'sir',
              text: t.text as string,
              at: typeof t.at === 'string' ? t.at : undefined,
              channel: t.channel === 'telegram' ? ('telegram' as const) : ('web' as const),
            }))
          // Preserva metadatos (at/channel) → separadores de día, hora y marca
          // "vía Telegram". Y registra los `at` para que el polling no re-agregue.
          for (const t of dbTurns) if (t.at) seenAtsRef.current.add(t.at)
          if (dbTurns.length > 0) setTurns(dbTurns)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) hydratedRef.current = true })
    return () => { cancelled = true }
  }, [])

  // Mantener `loadingRef` en sync (el polling lo lee sin re-crear el intervalo).
  useEffect(() => { loadingRef.current = loading }, [loading])

  // SINCRONIZACIÓN VIVA (hilo unificado): cada ~6s, si la pestaña está visible y
  // no hay un envío en curso, trae el hilo y agrega SOLO los turnos nuevos (de
  // Telegram o de un push proactivo) que aún no se mostraron. Dedup por `at`
  // (created_at del server); los turnos propios ya quedaron registrados en `ask`.
  useEffect(() => {
    const POLL_MS = 6000
    const poll = async () => {
      if (!hydratedRef.current || loadingRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/api/sir/thread')
        if (!r.ok) return
        const d = await r.json()
        if (!Array.isArray(d?.turns)) return
        const fresh = (d.turns as Array<{ role?: unknown; text?: unknown; at?: unknown; channel?: unknown }>)
          .filter((t) => (t.role === 'user' || t.role === 'sir') && typeof t.text === 'string' && typeof t.at === 'string' && !seenAtsRef.current.has(t.at as string))
          .map((t) => ({
            role: t.role as 'user' | 'sir',
            text: t.text as string,
            at: t.at as string,
            channel: t.channel === 'telegram' ? ('telegram' as const) : ('web' as const),
          }))
        if (fresh.length === 0) return
        for (const t of fresh) seenAtsRef.current.add(t.at)
        setTurns((prev) => [...prev, ...fresh])
      } catch { /* fail-open: sin red, seguimos con lo local */ }
    }
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [])
  // Guardar el hilo (acotado a los últimos 40 turnos) cuando cambia.
  useEffect(() => {
    try {
      if (turns.length === 0) localStorage.removeItem(THREAD_KEY)
      else localStorage.setItem(THREAD_KEY, JSON.stringify(turns.slice(-40)))
    } catch { /* noop */ }
  }, [turns])

  // Detectar si estamos al pie del documento (la ventana scrollea, no un div).
  useEffect(() => {
    const onScroll = () => {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120
      atBottomRef.current = nearBottom
      setShowJump(!nearBottom)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Aterrizar en lo último: la PRIMERA carga del hilo (local o DB) salta al pie
  // SIN animación (useLayoutEffect + 'auto' = cero salto visible). Los appends
  // posteriores scrollean solo si el usuario ya estaba al pie. Reemplaza los
  // viejos setTimeout(scrollIntoView) frágiles de ask().
  useLayoutEffect(() => {
    if (turns.length === 0) { didInitialScrollRef.current = false; return }
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true
      scrollToBottom('auto')
    } else if (atBottomRef.current) {
      scrollToBottom('smooth')
    }
  }, [turns, scrollToBottom])

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
    const sid = turns[idx]?.suggestionId
    setTurns((t) => t.map((tu, i) => (i === idx ? { ...tu, actionState: state } : tu)))
    // Cierra el loop en el ledger (antes esto era solo estado de React). Fail-open.
    if (sid) {
      void fetch(`/api/suggestions/${sid}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: state === 'done' ? 'done' : 'dismissed' }),
      }).catch(() => {})
    }
  }

  // Ola 2 — aprender de tus correcciones: al dar 👎, SIR pide "¿qué esperabas?"
  // y guarda tu respuesta como una PREFERENCIA (learnings kind='preference') que
  // se inyecta en el contexto de todas las próximas charlas. Es el "premio por
  // respuesta acertada" al revés: le enseñas qué NO hacer / qué preferís.
  const [correctingIdx, setCorrectingIdx] = useState<number | null>(null)
  const [correctionDraft, setCorrectionDraft] = useState('')
  async function saveCorrection(idx: number) {
    const text = correctionDraft.trim()
    if (text.length < 3) { toast.error('Escribe qué esperabas'); return }
    try {
      const res = await fetch('/api/learnings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, kind: 'preference', confidence: 'high' }),
      })
      if (!res.ok) { toast.error('No se pudo guardar la preferencia'); return }
      toast.success('Anotado como preferencia', { description: 'Lo tendré presente de ahora en más.' })
      track(EVENTS.brainFeedbackGiven, { source: 'sir_chat', value: 'correction' })
      // Ola 2: atar la corrección a la fila de chat_feedback del 👎 (misma respuesta).
      const fbId = turns[idx]?.feedbackId
      if (fbId) void fetch('/api/chat-feedback', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fbId, correction: text }),
      }).catch(() => {})
      setCorrectingIdx(null); setCorrectionDraft('')
    } catch { toast.error('Error de red') }
  }

  // 👍/👎 sobre una respuesta de SIR → feedback explícito persistido en el ledger.
  // Si el turno ya tiene una sugerencia (acción propuesta), la actualiza; si no,
  // crea una fila 'answer' con el pulgar. La señal más barata y de más volumen.
  function rateTurn(idx: number, feedback: 'up' | 'down') {
    const tu = turns[idx]
    if (!tu) return
    const next = tu.feedback === feedback ? undefined : feedback // toggle
    setTurns((t) => t.map((x, i) => (i === idx ? { ...x, feedback: next } : x)))
    track(EVENTS.brainFeedbackGiven, { source: 'sir_chat', value: next ?? 'cleared' })
    // Ola 2: captura ATRIBUIBLE del turno (pregunta + respuesta + contexto usado)
    // en chat_feedback → sustrato del harness de eval y del loop de aprendizaje.
    if (next) {
      const q = idx > 0 && turns[idx - 1]?.role === 'user' ? turns[idx - 1].text : undefined
      void fetch('/api/chat-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, answer: tu.text, rating: next, context: tu.sources ?? null }),
      }).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d?.id) setTurns((t) => t.map((x, i) => (i === idx ? { ...x, feedbackId: d.id as string } : x)))
      }).catch(() => {})
    }
    if (next === 'down') { setCorrectingIdx(idx); setCorrectionDraft('') }
    else if (correctingIdx === idx) setCorrectingIdx(null)
    if (tu.suggestionId) {
      void fetch(`/api/suggestions/${tu.suggestionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: next ?? null }),
      }).catch(() => {})
    } else if (next) {
      void fetch('/api/suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: 'chat', kind: 'answer', title: tu.text.slice(0, 120), feedback: next }),
      }).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d?.id) setTurns((t) => t.map((x, i) => (i === idx ? { ...x, suggestionId: d.id as string } : x)))
      }).catch(() => {})
    }
  }

  async function confirmAction(idx: number, a: ProposedAction) {
    track(EVENTS.sirActionConfirmed, { type: a.kind })
    try {
      if (a.kind === 'registrar_interaccion') {
        if (!a.personId) {
          toast.error(`No encontré a ${a.persona ?? 'esa persona'}`, { description: 'Abre su ficha y regístralo ahí, o nómbrala distinto.' })
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
      } else if (a.kind === 'marcar_habito') {
        const query = (a.habito ?? '').trim()
        if (!query) { toast.error('No entendí qué hábito'); return }
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
        const r = await fetch('/api/habits')
        const j = r.ok ? (await r.json()) as { habits: { id: string; title: string; checkinDates: string[] }[] } : { habits: [] }
        const q = norm(query)
        const hit = j.habits.find((h) => norm(h.title) === q)
          ?? j.habits.filter((h) => norm(h.title).includes(q) || q.includes(norm(h.title)))[0]
        if (!hit) { toast.error(`No encontré el hábito "${query}"`, { description: j.habits.length ? `Tienes: ${j.habits.slice(0, 6).map((h) => h.title).join(', ')}` : 'No tienes hábitos activos.' }); return }
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
        if (hit.checkinDates?.includes(today)) {
          toast.success(`"${hit.title}" ya estaba marcado hoy`)
          setTurnState(idx, 'done'); return
        }
        const res = await fetch('/api/habits/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habit_id: hit.id }) })
        if (!res.ok) { toast.error('No se pudo marcar el hábito'); return }
        toast.success(`✅ Marqué "${hit.title}" como hecho hoy`)
        setTurnState(idx, 'done')
      } else if (a.kind === 'marcar_tarea') {
        const query = (a.tarea ?? '').trim()
        if (!query) { toast.error('No entendí qué tarea'); return }
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
        const tasks = objectiveSteps.filter((s) => s.kind === 'task') // pasos del cliente (store)
        const q = norm(query)
        const hit = tasks.find((s) => norm(s.title) === q)
          ?? tasks.filter((s) => norm(s.title).includes(q) || q.includes(norm(s.title)))[0]
        if (!hit) {
          const pend = tasks.filter(estaAbierto).slice(0, 6).map((s) => s.title)
          toast.error(`No encontré la tarea "${query}"`, { description: pend.length ? `Pendientes: ${pend.join(', ')}` : 'No tienes tareas cargadas.' })
          return
        }
        if (hit.status === 'hecho') { toast.success(`"${hit.title}" ya estaba hecha`); setTurnState(idx, 'done'); return }
        setTaskStatus(hit.id, 'done')
        toast.success(`✅ Marqué "${hit.title}" como hecha`)
        setTurnState(idx, 'done')
      } else if (a.kind === 'agregar_hito') {
        const hito = (a.hito ?? '').trim()
        if (hito.length < 2) { toast.error('No entendí qué paso agregar'); return }
        // askSir ya resolvió el objetivo (por título o el ancla) → objetivoId.
        const goal = goals.find((g) => g.id === a.objetivoId)
        if (!goal) { toast.error(`No encontré el objetivo${a.objetivo ? ` "${a.objetivo}"` : ''}`, { description: 'Agrégalo desde el objetivo en la app.' }); return }
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(a.fecha ?? '') ? a.fecha : undefined
        const milestone = { id: `m_${Date.now()}_${randSuffix(4)}`, title: hito, completed: false, dueDate }
        updateGoal(goal.id, { milestones: [...goal.milestones, milestone] })
        toast.success(`✅ Agregué "${hito}" a "${goal.title}"`)
        setTurnState(idx, 'done')
      } else if (a.kind === 'crear_plan') {
        const titulo = (a.titulo ?? '').trim()
        if (titulo.length < 2) { toast.error('Falta el título del plan'); return }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha ?? '')) { toast.error('No entendí la fecha del plan'); return }
        const res = await fetch('/api/personal-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: titulo, date: a.fecha, note: a.nota || undefined, personId: a.personId || undefined }),
        })
        if (!res.ok) { toast.error('No se pudo agendar el plan'); return }
        toast.success('Plan agendado', { description: `${titulo}${a.persona ? ` con ${a.persona}` : ''} · ${a.fecha}` })
        setTurnState(idx, 'done')
      } else if (a.kind === 'crear_recordatorio') {
        const texto = (a.texto ?? '').trim()
        const t = Date.parse(a.cuando ?? '')
        if (texto.length < 2) { toast.error('Falta qué recordar'); return }
        if (!Number.isFinite(t)) { toast.error('No entendí la fecha/hora'); return }
        const res = await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: texto, due_at: new Date(t).toISOString() }),
        })
        if (!res.ok) { toast.error('No se pudo agendar el recordatorio'); return }
        toast.success('Recordatorio agendado', { description: texto })
        setTurnState(idx, 'done')
      } else if (a.kind === 'registrar_estado') {
        if (!a.personId) { toast.error(`No encontré a ${a.persona ?? 'esa persona'}`, { description: 'Créala o nómbrala distinto.' }); return }
        const phase = a.estado === 'regla' ? 'bleeding' : 'pms'
        const date = /^\d{4}-\d{2}-\d{2}$/.test(a.fecha ?? '') ? a.fecha : new Date().toLocaleDateString('en-CA')
        const res = await fetch('/api/people/cycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: a.personId, date, phase, note: a.nota || undefined }),
        })
        if (!res.ok) { toast.error('No se pudo guardar el estado'); return }
        toast.success('Estado anotado', { description: `${a.persona ?? ''} · ${a.estado === 'regla' ? 'período' : 'ánimo bajo'} · ${date}` })
        setTurnState(idx, 'done')
      } else if (a.kind === 'cerrar_relacion') {
        if (!a.personId) {
          toast.error(`No encontré a ${a.persona ?? 'esa persona'}`, { description: 'Cierra el vínculo desde su ficha.' })
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
            // depth/reciprocity DEBEN estar en 1..10 (check de la tabla): con 0 el
            // upsert a Supabase fallaba en silencio y el cierre nunca persistía.
            depth: 5,
            reciprocity: 5,
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
    atBottomRef.current = true // enviar siempre lleva a lo último
    if (!opts.suppressUserTurn) setTurns((t) => [...t, { role: 'user', text: q, at: new Date().toISOString() }])
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
          mode: socratic ? 'socratic' : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'No se pudo responder')
        return
      }
      // Hilo unificado: registro los `at` persistidos de ESTE intercambio para
      // que el polling no re-agregue mis propios turnos como si vinieran de otro
      // canal. Fail-open: si no vinieron, no pasa nada (no se persistió nada).
      const th = data.thread as { userAt?: string; sirAt?: string } | null | undefined
      if (th?.userAt) seenAtsRef.current.add(th.userAt)
      if (th?.sirAt) seenAtsRef.current.add(th.sirAt)
      // Gap-engine inline: SIR pide UNA pieza antes de responder.
      const clarifying = data.clarifying as ClarifyingGap | null
      if (clarifying) {
        track(EVENTS.sirGapAsked, { kind: clarifying.kind })
        setTurns((t) => [...t, {
          role: 'sir', text: data.answer ?? '', clarifying,
          clarifyState: 'pending', originalQuestion: q, at: new Date().toISOString(),
        }])
        return
      }
      const action = data.proposedAction as ProposedAction | null
      if (action) track(EVENTS.sirActionProposed, { type: action.kind })
      setTurns((t) => [...t, { role: 'sir', text: data.answer ?? '', sources: data.sources, action: action ?? undefined, actionState: action ? 'pending' : undefined, suggestionId: typeof data.suggestionId === 'string' ? data.suggestionId : undefined, at: new Date().toISOString() }])
    } catch {
      trackAiError('sir_ask', { status: 0, message: 'Error de red' }) // GA4
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
    if (!c.ephemeral) {
      writeDismissedGaps([...readDismissedGaps(), c.key])
      fetch('/api/gaps/dismissed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: c.key }) }).catch(() => {})
    }
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
              onClick={() => {
                const prev = turns
                setTurns([]); setError(null)
                toast('Conversación nueva', {
                  description: 'Vista limpia para empezar de cero. Tu historial sigue guardado (y en Telegram).',
                  action: { label: 'Deshacer', onClick: () => setTurns(prev) },
                })
              }}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Nueva conversación
            </button>
          )}
        </div>

        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-brand" />
            <h1 className="text-2xl font-semibold tracking-tight">Pregunta a SIR</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Pregunto sobre tu gente, tus vínculos y tus objetivos. Respondo con lo que tengo registrado —
            si no lo sé, te lo digo. Si me pides registrar algo o crear un objetivo, te lo propongo y tú confirmas.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Modelo</span>
            <select
              aria-label="Modelo de SIR"
              value={model}
              onChange={(e) => changeModel(e.target.value as SirModelTier)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-[12px] text-foreground/90 outline-none"
            >
              {Object.values(SIR_MODELS).map((m) => (
                <option key={m.tier} value={m.tier}>{m.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-muted-foreground">{SIR_MODELS[model].hint}</span>
            <button
              type="button"
              onClick={() => setSocratic((v) => !v)}
              aria-pressed={socratic}
              className={`rounded-full border px-2.5 py-1 text-[12px] ${socratic ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
              title="En vez de la respuesta cómoda, SIR te devuelve la pregunta dura."
            >
              Modo socrático
            </button>
          </div>
        </header>

        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground/90 hover:border-brand/60"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4" aria-live="polite" aria-atomic="false">
          {turns.map((t, i) => {
            // Separador de día: cuando la jornada (Lima) de este turno difiere de
            // la del anterior. También al inicio del primer turno con fecha.
            const dayKey = dayKeyLima(t.at)
            const prevDayKey = i > 0 ? dayKeyLima(turns[i - 1].at) : null
            const showDaySep = dayKey !== null && dayKey !== prevDayKey
            return (
            <div key={i}>
              {showDaySep && (
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {DAY_FMT.format(new Date(t.at!))}
                  </span>
                </div>
              )}
              <div className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  t.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-brand/15 px-4 py-2.5 text-[15px] text-foreground'
                    : 'max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-[15px] text-foreground/90'
                }
              >
                {t.role === 'sir' && (
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-brand">
                    <Sparkles size={11} /> SIR
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words leading-relaxed">{t.text}</div>
                {t.sources && t.sources.people.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <User size={11} />
                    {t.sources.people.join(' · ')}
                  </div>
                )}
                {t.role === 'sir' && t.sources?.receipts && t.sources.receipts.length > 0 && (
                  <SirReceipts receipts={t.sources.receipts} />
                )}
                {t.clarifying && (
                  <div className="mt-3 rounded-xl border border-brand/40 bg-brand/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-brand">
                      <Sparkles size={12} /> {t.clarifying.ephemeral ? 'SIR necesita contexto' : 'SIR necesita un dato'}
                    </div>
                    {t.clarifyState === 'answered' ? (
                      <div className="flex items-center gap-1 text-[12px] text-brand"><Check size={13} /> {t.clarifying.ephemeral ? 'Gracias — con eso te respondo' : 'Anotado — sigo con eso'}</div>
                    ) : t.clarifyState === 'dismissed' ? (
                      <div className="text-[12px] text-muted-foreground">Sin ese dato — te respondo con lo que tengo</div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type={t.clarifying.inputType}
                          aria-label={t.clarifying.ephemeral ? 'Respuesta contextual para SIR' : 'Dato que SIR necesita'}
                          value={clarifyDraft[i] ?? ''}
                          onChange={(e) => setClarifyDraft((d) => ({ ...d, [i]: e.target.value }))}
                          placeholder={t.clarifying.inputType === 'text' ? 'Tu respuesta…' : ''}
                          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                          onKeyDown={(e) => { if (e.key === 'Enter') answerClarifying(i) }}
                        />
                        <button onClick={() => answerClarifying(i)} disabled={!(clarifyDraft[i] ?? '').trim()}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
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
                  <div className="mt-3 rounded-xl border border-brand/40 bg-brand/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-brand">
                      <CalendarCheck size={12} />
                      {t.action.kind === 'registrar_interaccion' ? 'Registrar interacción' : t.action.kind === 'crear_objetivo' ? 'Crear objetivo' : t.action.kind === 'crear_persona' ? 'Crear persona' : t.action.kind === 'marcar_habito' ? 'Marcar hábito' : t.action.kind === 'marcar_tarea' ? 'Marcar tarea' : t.action.kind === 'agregar_hito' ? 'Agregar paso' : t.action.kind === 'crear_plan' ? 'Agendar plan' : t.action.kind === 'crear_recordatorio' ? 'Agendar recordatorio' : 'Cerrar vínculo'}
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
                    ) : t.action.kind === 'marcar_habito' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.habito}</span>
                        <div className="mt-0.5 text-muted-foreground">Marcar como hecho hoy</div>
                      </div>
                    ) : t.action.kind === 'marcar_tarea' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.tarea}</span>
                        <div className="mt-0.5 text-muted-foreground">Marcar la tarea como hecha</div>
                      </div>
                    ) : t.action.kind === 'agregar_hito' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.hito}</span>
                        <div className="mt-0.5 text-muted-foreground">
                          Paso de {t.action.objetivo}{t.action.fecha ? ` · para el ${t.action.fecha}` : ''}
                        </div>
                      </div>
                    ) : t.action.kind === 'crear_plan' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.titulo}</span>
                        <div className="mt-0.5 text-muted-foreground">
                          {t.action.fecha}{t.action.persona ? ` · con ${t.action.persona}` : ''}
                        </div>
                        {t.action.nota && <div className="mt-0.5 text-muted-foreground">{t.action.nota}</div>}
                      </div>
                    ) : t.action.kind === 'crear_recordatorio' ? (
                      <div className="text-[13px] text-foreground/90">
                        <span className="font-medium">{t.action.texto}</span>
                        <div className="mt-0.5 text-muted-foreground">
                          {(() => { const c = t.action.cuando ?? ''; const d = Date.parse(c); return Number.isFinite(d) ? TIME_FMT.format(new Date(d)) + ' · ' + DAY_FMT.format(new Date(d)) : c })()}
                        </div>
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
                                    aria-label={`Cerrar objetivo ligado: ${g.title}`}
                                    type="checkbox"
                                    checked={checked}
                                    disabled={t.actionState === 'done' || t.actionState === 'discarded'}
                                    onChange={(e) => setGoalSel((prev) => ({ ...prev, [key]: e.target.checked }))}
                                    className="accent-brand"
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
                      <div className="mt-2 flex items-center gap-1 text-[12px] text-brand"><Check size={13} /> Hecho</div>
                    ) : t.actionState === 'discarded' ? (
                      <div className="mt-2 text-[12px] text-muted-foreground">Descartado</div>
                    ) : (
                      <div className="mt-2.5 flex gap-2">
                        <button onClick={() => confirmAction(i, t.action!)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white">
                          <Check size={13} /> Confirmar
                        </button>
                        <button onClick={() => setTurnState(i, 'discarded')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground">
                          <X size={13} /> Descartar
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {t.role === 'sir' && t.text && !t.clarifying && (
                  <>
                    {/*
                      Estos botones existían pero eran INVISIBLES: 13 px al 50% de
                      opacidad. Aaron los buscó el 30-jul y no los encontró ("no veo
                      en ningún lado dónde marcar like o dislike") — y `chat_feedback`
                      llevaba 0 filas desde que se construyó, mientras se le pedía en
                      cada sesión que calificara. Ahora llevan TEXTO, borde y tamaño
                      de toque real. La señal es el cuello de botella del loop de
                      aprendizaje: si el control no se ve, no hay señal.
                    */}
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        onClick={() => rateTurn(i, 'up')}
                        aria-label="Me sirve"
                        aria-pressed={t.feedback === 'up'}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                          t.feedback === 'up'
                            ? 'border-ok/40 bg-ok/10 text-ok'
                            : 'border-border text-muted-foreground hover:border-ok/40 hover:text-ok'
                        }`}
                      >
                        <ThumbsUp size={15} /> Me sirve
                      </button>
                      <button
                        onClick={() => rateTurn(i, 'down')}
                        aria-label="No me sirve"
                        aria-pressed={t.feedback === 'down'}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                          t.feedback === 'down'
                            ? 'border-bad/40 bg-bad/10 text-bad'
                            : 'border-border text-muted-foreground hover:border-bad/40 hover:text-bad'
                        }`}
                      >
                        <ThumbsDown size={15} /> No
                      </button>
                    </div>
                    {correctingIdx === i && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          autoFocus
                          value={correctionDraft}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCorrectionDraft(e.target.value)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') void saveCorrection(i) }}
                          placeholder="¿Qué esperabas? Lo aprendo como preferencia"
                          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button type="button" onClick={() => saveCorrection(i)} className="h-9 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">Enseñar</button>
                        <button type="button" onClick={() => setCorrectingIdx(null)} aria-label="Cerrar" className="h-9 shrink-0 rounded-md px-2 text-xs text-muted-foreground/60 hover:text-foreground">✕</button>
                      </div>
                    )}
                  </>
                )}
                {t.at && (
                  <div className={`mt-1.5 flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground/50 ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {TIME_FMT.format(new Date(t.at))}
                    {t.channel === 'telegram' && <span className="opacity-80">· vía Telegram</span>}
                  </div>
                )}
              </div>
            </div>
            </div>
            )
          })}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> SIR está pensando…
            </div>
          )}
          {error && <div className="text-sm text-red-400">{error}</div>}
          <div ref={endRef} />
        </div>

        {showJump && turns.length > 0 && (
          <div className="sticky bottom-20 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => scrollToBottom('smooth')}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-foreground shadow-lg hover:border-border-strong"
              aria-label="Saltar a lo último"
            >
              <ArrowDown size={14} /> Lo último
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); ask(input) }}
          className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg"
        >
          <textarea
            aria-label="Mensaje para SIR"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) }
            }}
            rows={1}
            placeholder="Pregúntale algo a SIR…"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            disabled={loading}
          />
          {voiceOk && (
            <button
              type="button"
              onClick={toggleVoice}
              className={`rounded-xl p-2 ${listening ? 'bg-bad text-white animate-pulse' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label={listening ? 'Detener dictado' : 'Dictar por voz'}
              title={listening ? 'Detener dictado' : 'Dictar por voz'}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-brand p-2 text-white disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send size={18} />
          </button>
        </form>
      </main>
    </AppShell>
  )
}

/** Recibos del chat: las memorias REALES que aterrizaron la respuesta, con su
 *  origen y confianza (recibos por dato aplicados al chat). No las genera el
 *  modelo → no se pueden alucinar. Colapsado por defecto para no ensuciar. */
function SirReceipts({ receipts }: { receipts: SirReceipt[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <ArrowDown size={11} className={open ? '' : '-rotate-90'} style={{ transition: 'transform 120ms' }} />
        En qué se basa · {receipts.length} {receipts.length === 1 ? 'recibo' : 'recibos'}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 border-l-2 border-border/60 pl-2.5">
          {receipts.map((r, i) => {
            const p = memoryProvenance(r.source)
            const tone =
              p.confidence === 'certain' ? 'text-ok/80'
                : p.confidence === 'high' ? 'text-brand'
                  : p.confidence === 'medium' ? 'text-muted-foreground'
                    : 'text-amber-400/80'
            return (
              <li key={i} className="text-[12px] leading-snug">
                <span className="text-foreground/85">{r.text}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground/70">
                  <User size={9} /> {r.person}
                  <span aria-hidden="true">·</span>
                  <span className={tone}>{p.label} · {p.confidenceLabel}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
