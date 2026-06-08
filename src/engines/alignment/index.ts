// SIR V2 — Alignment Engine (Etapa 4: Identity & Alignment) — MVP
//
// Detecta la BRECHA entre los objetivos DECLARADOS del usuario y su
// COMPORTAMIENTO OBSERVADO. Ejemplo del roadmap: objetivo "ser mejor pareja"
// + señales observadas (menos contacto, relación en tensión) → "tu
// comportamiento reciente no acompaña la relación que decís querer construir".
//
// MVP — alcance honesto y DETERMINÍSTICO:
//   - Sólo objetivos con vínculo ESTRUCTURADO a personas (goal.relatedPersons).
//     Ahí tenemos señales observables reales en los stores: frecuencia de
//     contacto (lastContact), estado de la relación (status) e impacto
//     energético (energyImpact).
//   - Objetivo sin vínculo o sin señales recientes → 'insufficient_data'.
//     NUNCA inventamos una brecha (principio #5: correlación ≠ causa; sin
//     diagnóstico). La inferencia de dominio/persona por LLM para texto libre
//     queda como siguiente paso de Etapa 4.
//
// SEÑALES TAGGED (06/06/2026): la derivación goal-aware de conversaciones ya
// produce memorias con TAGS estructurados (comercial, profesional, próximo_paso,
// objeción, riesgo, reciprocidad, personal) + marcas de recencia (histórico/
// obsoleto) + tags libres (nombres de cuentas/empresas: "jhodaal", "openmed").
// Cuando un objetivo tiene persona vinculada, cruzamos esos tags con el objetivo
// (dominio + palabras clave del título/descripción) para:
//   - CITAR actividad concreta y reciente ("actividad comercial reciente con
//     Dayana: jhodaal, próximo_paso") como una señal observada más.
//   - Cuando los tags relevantes están AUSENTES o son VIEJOS en un objetivo
//     orientado a actividad (financiero/carrera) → 'no_recent_signal', más
//     preciso que el 'insufficient_data' genérico.
//
// El "veredicto" (state) se apoya SÓLO en datos reales. La capa narrativa
// (Anthropic, opcional) sólo REFORMULA estas señales en tono reflexivo; no
// decide la brecha.
//
// Puro y determinístico: `now` inyectable. Sin red, sin Date.now() implícito
// en la lógica de clasificación.

import type { Goal, GoalCategory, Memory, Person, Relationship } from '@/types'

export type AlignmentState =
  | 'aligned'
  | 'drifting'
  | 'needs_attention'
  | 'no_recent_signal'
  | 'insufficient_data'

export type SignalKind =
  | 'contact_recency'
  | 'relationship_status'
  | 'energy_impact'
  | 'goal_activity'

/** Nivel de preocupación de una señal: 0 = acompaña, 1 = se desvía, 2 = brecha. */
export type ConcernLevel = 0 | 1 | 2

export interface ObservedSignal {
  kind: SignalKind
  /** Texto legible listo para UI ("Sin contacto hace 38 días"). */
  label: string
  concern: ConcernLevel
  personId: string
  personName: string
  /** Evidencia textual de las CAPTURAS del propio usuario (ej. el contenido de
   *  la memoria que disparó una señal `goal_activity`). Sirve para que la
   *  narrativa se apoye en hechos reales y los REFORMULE, sin inventar. */
  detail?: string
}

export interface GoalAlignment {
  goalId: string
  title: string
  category: GoalCategory
  state: AlignmentState
  /** Nombres de las personas vinculadas efectivamente resueltas. */
  linkedPersonNames: string[]
  /** Señales observadas reales (vacío si insufficient_data). */
  signals: ObservedSignal[]
  /** Razón legible del estado o de por qué faltan datos (reflexiva, no culposa). */
  summary: string
  /** true si las personas no estaban vinculadas a mano y se INFIRIERON desde la
   *  evidencia (memorias/conversaciones que mencionan el objetivo). */
  inferred?: boolean
}

export interface AlignmentContext {
  people: Person[]
  relationships: Relationship[]
  /** Memorias derivadas (tags estructurados + recencia). Opcional: sin ellas el
   *  engine se comporta como el MVP (sólo señales relacionales). */
  memories?: Memory[]
  /** Override de "ahora" para tests. Default: new Date(). */
  now?: Date
}

const DAY_MS = 86_400_000
const CONTACT_DRIFT_DAYS = 14
const CONTACT_ATTENTION_DAYS = 30
/** Ventana de "señal reciente sobre el objetivo": una memoria tagged más vieja
 *  que esto ya no cuenta como actividad vigente. */
const ACTIVITY_RECENT_DAYS = 45

const STATE_SUMMARY: Record<Exclude<AlignmentState, 'insufficient_data' | 'no_recent_signal'>, string> = {
  aligned: 'Tu comportamiento observado acompaña lo que declaraste querer.',
  drifting: 'Algunas señales se están desviando de lo que declaraste querer construir.',
  needs_attention:
    'Tu comportamiento reciente no acompaña lo que declaraste querer construir. Es una observación para reflexionar, no un juicio.',
}

/** Días enteros desde una fecha ISO date-only/timestamp hasta `now`. null si
 *  no hay fecha o es inválida. Negativos (futuro) se tratan como 0. */
function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS))
}

function contactSignal(person: Person, now: Date): ObservedSignal | null {
  const days = daysSince(person.lastContact, now)
  if (days === null) return null
  const concern: ConcernLevel = days > CONTACT_ATTENTION_DAYS ? 2 : days > CONTACT_DRIFT_DAYS ? 1 : 0
  const label =
    days === 0
      ? `Contacto hoy con ${person.name}`
      : concern === 0
        ? `Contacto reciente con ${person.name} (hace ${days} días)`
        : `Sin contacto con ${person.name} hace ${days} días`
  return { kind: 'contact_recency', label, concern, personId: person.id, personName: person.name }
}

function statusSignal(person: Person, rel: Relationship | undefined): ObservedSignal | null {
  if (!rel) return null
  const concern: ConcernLevel =
    rel.status === 'strained' || rel.status === 'ended' ? 2 : rel.status === 'dormant' ? 1 : 0
  const label =
    rel.status === 'strained'
      ? `Relación con ${person.name} en tensión`
      : rel.status === 'ended'
        ? `Relación con ${person.name} terminada`
        : rel.status === 'dormant'
          ? `Relación con ${person.name} dormida`
          : `Relación con ${person.name} activa`
  return { kind: 'relationship_status', label, concern, personId: person.id, personName: person.name }
}

function energySignal(person: Person): ObservedSignal | null {
  // Sólo agregamos señal cuando aporta lectura: drena (preocupa) o energiza
  // (acompaña). 'neutral' no aporta señal de alineación.
  if (person.energyImpact === 'draining') {
    return { kind: 'energy_impact', label: `El vínculo con ${person.name} te drena energía`, concern: 1, personId: person.id, personName: person.name }
  }
  if (person.energyImpact === 'energizing') {
    return { kind: 'energy_impact', label: `El vínculo con ${person.name} te energiza`, concern: 0, personId: person.id, personName: person.name }
  }
  return null
}

function stateFromSignals(signals: ObservedSignal[]): Exclude<AlignmentState, 'insufficient_data' | 'no_recent_signal'> {
  const worst = signals.reduce<ConcernLevel>((max, s) => (s.concern > max ? s.concern : max), 0)
  return worst === 2 ? 'needs_attention' : worst === 1 ? 'drifting' : 'aligned'
}

// ─── Señales TAGGED (cruce objetivo ↔ memorias derivadas) ───────────────
//
// Las memorias derivadas traen tags estructurados (comercial, profesional,
// próximo_paso…) + tags libres (nombres de cuenta/empresa) + marcas de recencia
// (histórico/obsoleto). Cruzamos esos tags con el objetivo para CITAR actividad
// concreta. El cruce es por dominio (tags canónicos del rubro) + palabras clave
// del texto del objetivo (título/descripción/target/why), todo normalizado.

/** Tags canónicos (de la derivación) que señalan progreso en cada dominio. Sólo
 *  los rubros donde el avance APARECE en conversaciones tienen mapeo; el resto
 *  cae al cruce por palabras clave del título. Se normalizan al construir el set
 *  de cruce (igual que las palabras clave y los tags de las memorias). */
const CATEGORY_ACTIVITY_TAGS: Partial<Record<GoalCategory, readonly string[]>> = {
  financial: ['comercial', 'próximo_paso', 'objeción', 'riesgo', 'profesional'],
  career: ['profesional', 'comercial', 'próximo_paso', 'objeción'],
  relational: ['reciprocidad', 'personal'],
}

/** Objetivos cuyo avance se LEE de la actividad tagged (no del contacto/estado
 *  relacional): financiero y de carrera. Para estos, ausencia de actividad
 *  reciente → 'no_recent_signal' (más preciso que 'insufficient_data'). */
function isActivityOrientedGoal(category: GoalCategory): boolean {
  return category === 'financial' || category === 'career'
}

/** Marcas de recencia que la derivación pone a lo viejo/no vigente. */
const STALE_TAGS = new Set(['historico', 'obsoleto'])

/** Stopwords del texto de objetivos (verbos de acción + conectores) que no
 *  aportan como palabra clave de cruce. Normalizadas (sin acentos). */
const GOAL_STOPWORDS = new Set([
  'para', 'como', 'este', 'esta', 'esto', 'esos', 'esas', 'sobre', 'entre', 'hacia',
  'desde', 'cada', 'todo', 'toda', 'todos', 'todas', 'mas', 'menos', 'muy', 'poco',
  'ser', 'estar', 'tener', 'hacer', 'cerrar', 'lograr', 'conseguir', 'alcanzar',
  'mejorar', 'aumentar', 'reducir', 'mantener', 'crear', 'construir', 'terminar',
  'completar', 'seguir', 'empezar', 'mejor', 'nuevo', 'nueva', 'gran', 'mucho',
])

/** Normaliza un token: minúsculas, sin acentos, sólo alfanumérico. */
function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Palabras clave del texto del objetivo (título + descripción + target + why),
 *  normalizadas, sin stopwords, longitud ≥ 4. PURO. */
export function goalKeywords(goal: Goal): Set<string> {
  const text = [goal.title, goal.description, goal.target, goal.why].filter(Boolean).join(' ')
  const out = new Set<string>()
  for (const raw of text.split(/[\s,/.;:()[\]"'-]+/)) {
    const t = normalizeToken(raw)
    if (t.length < 4) continue
    if (GOAL_STOPWORDS.has(t)) continue
    out.add(t)
  }
  return out
}

/** Tags de una memoria que son RELEVANTES al objetivo (intersección con los tags
 *  canónicos del rubro o con las palabras clave). Conserva el tag ORIGINAL (con
 *  acentos) para mostrar. Excluye las marcas de recencia. PURO. */
export function matchMemoryTags(
  tags: string[],
  keywords: Set<string>,
  categoryTags: Set<string>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const norm = normalizeToken(tag)
    if (!norm || STALE_TAGS.has(norm)) continue
    if (categoryTags.has(norm) || keywords.has(norm)) {
      if (!seen.has(norm)) {
        seen.add(norm)
        out.push(tag)
      }
    }
  }
  return out
}

/** ¿La memoria está marcada como vieja/no vigente por la derivación? */
function isStaleMemory(m: Memory): boolean {
  return m.tags.some((t) => STALE_TAGS.has(normalizeToken(t)))
}

/** Recorta un texto a un snippet de una línea para la evidencia de la señal. */
function snippet(s: string | undefined, max = 160): string | undefined {
  if (!s) return undefined
  const t = s.trim().replace(/\s+/g, ' ')
  if (!t) return undefined
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

interface PersonActivity {
  signal: ObservedSignal | null
  /** Hubo memorias relevantes al objetivo pero TODAS viejas/obsoletas. */
  hadStale: boolean
}

/** Memorias de una persona cuyos tags cruzan con el objetivo → una señal
 *  `goal_activity` (concern 0) citando los tags y un snippet de la más reciente. */
function personGoalActivity(
  person: Person,
  memories: Memory[],
  keywords: Set<string>,
  categoryTags: Set<string>,
  now: Date,
): PersonActivity {
  if (keywords.size === 0 && categoryTags.size === 0) return { signal: null, hadStale: false }

  const mine = memories.filter(
    (m) => m.personId === person.id || (m.entities ?? []).includes(person.id),
  )

  const fresh: Array<{ days: number; tags: string[]; content: string }> = []
  let hadStale = false
  for (const m of mine) {
    const matched = matchMemoryTags(m.tags, keywords, categoryTags)
    if (matched.length === 0) continue
    const days = daysSince(m.timestamp, now)
    if (days === null || days > ACTIVITY_RECENT_DAYS || isStaleMemory(m)) {
      hadStale = true
      continue
    }
    fresh.push({ days, tags: matched, content: m.content || m.title })
  }

  if (fresh.length === 0) return { signal: null, hadStale }

  fresh.sort((a, b) => a.days - b.days)
  const top = fresh[0]
  const tagUnion: string[] = []
  const seen = new Set<string>()
  for (const t of fresh.flatMap((f) => f.tags)) {
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    tagUnion.push(t)
    if (tagUnion.length >= 5) break
  }
  const when = top.days === 0 ? 'hoy' : `hace ${top.days} día${top.days === 1 ? '' : 's'}`
  const label = `Actividad reciente con ${person.name} sobre este objetivo: ${tagUnion.join(', ')} (${when})`
  return {
    signal: {
      kind: 'goal_activity',
      label,
      concern: 0,
      personId: person.id,
      personName: person.name,
      detail: snippet(top.content),
    },
    hadStale: false,
  }
}

interface GoalActivity {
  signals: ObservedSignal[]
  /** Hubo memorias relevantes pero ninguna reciente (todas viejas/obsoletas). */
  hadStale: boolean
}

function goalActivitySignals(
  goal: Goal,
  linkedPeople: Person[],
  memories: Memory[],
  now: Date,
): GoalActivity {
  const keywords = goalKeywords(goal)
  const categoryTags = new Set((CATEGORY_ACTIVITY_TAGS[goal.category] ?? []).map(normalizeToken))
  const signals: ObservedSignal[] = []
  let hadStale = false
  for (const person of linkedPeople) {
    const r = personGoalActivity(person, memories, keywords, categoryTags, now)
    if (r.signal) signals.push(r.signal)
    else if (r.hadStale) hadStale = true
  }
  return { signals, hadStale }
}

/**
 * Alineación de UN objetivo. Determinístico.
 *
 * @param goal Objetivo (idealmente activo; el caller filtra).
 * @param ctx people + relationships del usuario + `now` opcional.
 */
export function computeGoalAlignment(goal: Goal, ctx: AlignmentContext): GoalAlignment {
  const now = ctx.now ?? new Date()
  const base = { goalId: goal.id, title: goal.title, category: goal.category }

  const linkedPeople = goal.relatedPersons
    .map((id) => ctx.people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p))

  if (linkedPeople.length === 0) {
    // B (Etapa 4) — inferencia por EVIDENCIA: sin personas vinculadas a mano,
    // inferimos el vínculo desde las memorias. Si el objetivo aparece (por
    // tags/keywords) en conversaciones recientes con alguien, esa persona queda
    // inferida. Se apoya en evidencia real, no en una corazonada del LLM (que
    // queda como capa futura para objetivos sin ninguna evidencia).
    const inferredActivity = goalActivitySignals(goal, ctx.people, ctx.memories ?? [], now)
    if (inferredActivity.signals.length > 0) {
      const names: string[] = []
      for (const sig of inferredActivity.signals) {
        if (sig.personName && !names.includes(sig.personName)) names.push(sig.personName)
      }
      const inferredState = stateFromSignals(inferredActivity.signals)
      return {
        ...base,
        state: inferredState,
        linkedPersonNames: names,
        signals: inferredActivity.signals,
        inferred: true,
        summary: `Inferido de tus conversaciones (sin vínculo manual). ${STATE_SUMMARY[inferredState]}`,
      }
    }
    return {
      ...base,
      state: 'insufficient_data',
      linkedPersonNames: [],
      signals: [],
      summary:
        'No encontramos personas ni conversaciones recientes ligadas a este objetivo. Vinculá personas a mano, o capturá una charla que lo mencione.',
    }
  }

  const signals: ObservedSignal[] = []
  for (const person of linkedPeople) {
    const rel = ctx.relationships.find((r) => r.personId === person.id)
    const c = contactSignal(person, now)
    const s = statusSignal(person, rel)
    const e = energySignal(person)
    if (c) signals.push(c)
    if (s) signals.push(s)
    if (e) signals.push(e)
  }

  // Señales TAGGED: actividad reciente sobre el objetivo extraída de los tags de
  // las memorias derivadas de las personas vinculadas. Enriquecen la lectura
  // (concern 0: son evidencia de que el objetivo está vivo) y la narrativa.
  const activity = goalActivitySignals(goal, linkedPeople, ctx.memories ?? [], now)
  signals.push(...activity.signals)

  const linkedPersonNames = linkedPeople.map((p) => p.name)

  if (signals.length === 0) {
    // Objetivo orientado a actividad (financiero/carrera): el avance se LEE de
    // las conversaciones, no del contacto/estado relacional. Si los tags
    // relevantes están ausentes o viejos, es más honesto decir "sin señales
    // recientes sobre este objetivo" que el "datos insuficientes" genérico.
    if (isActivityOrientedGoal(goal.category)) {
      const names = linkedPersonNames.join(', ')
      return {
        ...base,
        state: 'no_recent_signal',
        linkedPersonNames,
        signals: [],
        summary: activity.hadStale
          ? `Sin señales recientes sobre este objetivo: lo último vinculado a ${names} ya quedó viejo. Una captura nueva de la conversación lo refrescaría.`
          : `Sin señales recientes sobre este objetivo. No aparece en tus conversaciones ni notas recientes con ${names}.`,
      }
    }
    return {
      ...base,
      state: 'insufficient_data',
      linkedPersonNames,
      signals: [],
      summary:
        'Faltan señales recientes (sin fecha de contacto ni estado de relación registrado) para leer la alineación.',
    }
  }

  const state = stateFromSignals(signals)
  return { ...base, state, linkedPersonNames, signals, summary: STATE_SUMMARY[state] }
}

/**
 * Alineación de todos los objetivos ACTIVOS, ordenada por urgencia
 * (needs_attention → drifting → aligned → no_recent_signal → insufficient_data).
 */
export function computeAlignments(goals: Goal[], ctx: AlignmentContext): GoalAlignment[] {
  const order: Record<AlignmentState, number> = {
    needs_attention: 0,
    drifting: 1,
    aligned: 2,
    no_recent_signal: 3,
    insufficient_data: 4,
  }
  return goals
    .filter((g) => g.status === 'active')
    .map((g) => computeGoalAlignment(g, ctx))
    .sort((a, b) => order[a.state] - order[b.state])
}
