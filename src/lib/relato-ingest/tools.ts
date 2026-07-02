// SIR V2 — Tools que puede llamar Claude cuando estructura un relato en prosa.
//
// El endpoint POST /api/relato/ingest le pasa a Claude:
//   - System prompt con la lista de nombres COMPLETOS ya en la red de Aaron
//     (para que use apellidos y desambigüe).
//   - El texto crudo.
//   - Estos tools.
// Claude devuelve N `tool_use` con acciones. El plan es CANDIDATO — no se
// ejecuta hasta que Aaron aprieta "Aplicar" en la UI.
//
// Regla de oro: NUNCA hacer lookup por primer nombre suelto. El tool
// `person_full_name` es obligatorio; si Claude no sabe el apellido debe
// llamar a `flag_ambiguo` y no crear nada.

export const INGEST_TOOLS = [
  {
    name: 'crear_moment',
    description:
      'Crear un episodio relacional (pelea, encuentro, decisión, follow-up médico, etc.) ' +
      'con una persona identificada por nombre completo. Usá status="abierto" cuando queda ' +
      'algo pendiente (con follow_up_on si Aaron mencionó fecha) y "resuelto" cuando el ' +
      'evento cerró en el mismo día.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string', description: 'NOMBRE COMPLETO (nombre + al menos un apellido). Si no sabés el apellido, usá flag_ambiguo.' },
        title: { type: 'string', description: 'Título corto del episodio (≤80 chars).' },
        detail: { type: 'string', description: 'Detalle 2-4 líneas de qué pasó.' },
        occurred_on: { type: 'string', description: 'Fecha del evento, YYYY-MM-DD.' },
        status: { type: 'string', enum: ['abierto', 'resuelto'] },
        follow_up_on: { type: 'string', description: 'YYYY-MM-DD si status=abierto y hay fecha explícita para retomar. Opcional.' },
        resolution: { type: 'string', description: 'Si status=resuelto: 1-2 líneas de cómo cerró.' },
      },
      required: ['person_full_name', 'title', 'occurred_on', 'status'],
    },
  },
  {
    name: 'crear_person_log',
    description:
      'Registrar el tono / cómo se sintió Aaron durante una interacción con una persona ' +
      'específica. Escala 1..5 (1=muy mal, 3=neutro, 5=muy bien). Kind="interaction" para ' +
      'la mayoría de casos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string' },
        kind: { type: 'string', enum: ['interaction', 'mood', 'energy'] },
        value: { type: 'integer', description: '1..5.' },
        note: { type: 'string', description: 'Nota breve.' },
        logged_at: { type: 'string', description: 'ISO 8601 con TZ. Si Aaron dice solo la fecha, poné 20:00 Lima (-05:00).' },
      },
      required: ['person_full_name', 'kind', 'value', 'logged_at'],
    },
  },
  {
    name: 'crear_nota_manual',
    description:
      'Guardar una observación libre sobre una persona (resumen semanal, contexto general, ' +
      'algo que no es un episodio con follow-up). Usar SOLO 1 nota por relato como cierre; ' +
      'los eventos concretos van como moments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string' },
        text: { type: 'string', description: 'Resumen prosa 3-6 líneas.' },
        observed_at: { type: 'string', description: 'ISO 8601 (default: hoy).' },
      },
      required: ['person_full_name', 'text', 'observed_at'],
    },
  },
  {
    name: 'upsert_cumpleanos',
    description: 'Agregar/actualizar el cumpleaños de una persona.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD. El año puede ser cualquiera; se toma día+mes.' },
      },
      required: ['person_full_name', 'date'],
    },
  },
  {
    name: 'registrar_ciclo',
    description:
      'Registrar UN DÍA del ciclo menstrual de una persona (típicamente la pareja) cuando Aaron ' +
      'lo menciona en el relato. Usá phase="bleeding" cuando dice "estaba con la regla", "tenía ' +
      'un resto de regla", "sangrando". "pms" cuando menciona síntomas premenstruales. "unknown" ' +
      'si Aaron dice que ella está en ciertos días sin saber la fase exacta. Un evento = un día; ' +
      'si dice "el lunes todavía tenía regla" y también "el domingo", creá 2 acciones separadas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string', description: 'NOMBRE COMPLETO de la persona.' },
        date: { type: 'string', description: 'YYYY-MM-DD del día registrado.' },
        phase: {
          type: 'string',
          enum: ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown'],
          description: 'Fase estimada. Default "bleeding" si Aaron habla de sangrado/regla.',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'high si Aaron confirma; medium si infiere; low si estimación gruesa. Default medium.',
        },
        note: { type: 'string', description: 'Nota corta opcional (ej. "resto de regla", "primer día").' },
      },
      required: ['person_full_name', 'date', 'phase'],
    },
  },
  {
    name: 'flag_ambiguo',
    description:
      'Cuando Aaron menciona SOLO el primer nombre y hay ambigüedad (o no sabés el apellido), ' +
      'llamá esta tool para pedirle que aclare. NO crees moments/logs/notas sin apellido — ' +
      'usar esta tool en su lugar. Aaron va a corregir el relato y reenviarlo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        short_name: { type: 'string', description: 'Nombre corto mencionado (ej. "Diana").' },
        context_hint: { type: 'string', description: 'Contexto que da Aaron (afectivo, trabajo, familiar…) — opcional.' },
        options_seen: { type: 'array', items: { type: 'string' }, description: 'Nombres completos conocidos que colisionan (si podés listar).' },
      },
      required: ['short_name'],
    },
  },
] as const

// ─── Tipos de las acciones ya validadas (post-parse) ────────────────

export type CyclePhase = 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'
export type CycleConfidence = 'high' | 'medium' | 'low'

export type IngestAction =
  | { kind: 'crear_moment'; personFullName: string; title: string; detail: string; occurredOn: string; status: 'abierto' | 'resuelto'; followUpOn?: string; resolution?: string }
  | { kind: 'crear_person_log'; personFullName: string; logKind: 'interaction' | 'mood' | 'energy'; value: number; note: string; loggedAt: string }
  | { kind: 'crear_nota_manual'; personFullName: string; text: string; observedAt: string }
  | { kind: 'upsert_cumpleanos'; personFullName: string; date: string }
  | { kind: 'registrar_ciclo'; personFullName: string; date: string; phase: CyclePhase; confidence: CycleConfidence; note?: string }
  | { kind: 'flag_ambiguo'; shortName: string; contextHint?: string; optionsSeen?: string[] }

interface RawToolUse { name: string; input: Record<string, unknown> }

function str(v: unknown, max = 400): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
function ymd(v: unknown): string | null {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}
function iso(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function intBetween(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v ?? ''), 10)
  if (Number.isNaN(n) || n < lo || n > hi) return null
  return n
}

/** Valida un tool_use crudo y devuelve la acción normalizada o null si algo
 *  falla (nombre corto, sin apellido, fecha inválida). Nunca throw. */
export function parseToolUse(raw: RawToolUse): IngestAction | null {
  const i = raw.input ?? {}
  switch (raw.name) {
    case 'crear_moment': {
      const name = requireFullName(i.person_full_name)
      const title = str(i.title, 200)
      const occurredOn = ymd(i.occurred_on)
      const status = i.status === 'abierto' || i.status === 'resuelto' ? i.status : null
      if (!name || !title || !occurredOn || !status) return null
      return {
        kind: 'crear_moment', personFullName: name, title,
        detail: str(i.detail, 2000) ?? '',
        occurredOn, status,
        followUpOn: ymd(i.follow_up_on) ?? undefined,
        resolution: str(i.resolution, 1000) ?? undefined,
      }
    }
    case 'crear_person_log': {
      const name = requireFullName(i.person_full_name)
      const kind = i.kind === 'interaction' || i.kind === 'mood' || i.kind === 'energy' ? i.kind : null
      const value = intBetween(i.value, 1, 5)
      const loggedAt = iso(i.logged_at)
      if (!name || !kind || value == null || !loggedAt) return null
      return {
        kind: 'crear_person_log', personFullName: name, logKind: kind, value,
        note: str(i.note, 500) ?? '',
        loggedAt,
      }
    }
    case 'crear_nota_manual': {
      const name = requireFullName(i.person_full_name)
      const text = str(i.text, 4000)
      const observedAt = iso(i.observed_at) ?? new Date().toISOString()
      if (!name || !text) return null
      return { kind: 'crear_nota_manual', personFullName: name, text, observedAt }
    }
    case 'upsert_cumpleanos': {
      const name = requireFullName(i.person_full_name)
      const date = ymd(i.date)
      if (!name || !date) return null
      return { kind: 'upsert_cumpleanos', personFullName: name, date }
    }
    case 'registrar_ciclo': {
      const name = requireFullName(i.person_full_name)
      const date = ymd(i.date)
      const validPhases: CyclePhase[] = ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown']
      const phase = validPhases.includes(i.phase as CyclePhase) ? (i.phase as CyclePhase) : null
      const validConf: CycleConfidence[] = ['high', 'medium', 'low']
      const confidence = validConf.includes(i.confidence as CycleConfidence) ? (i.confidence as CycleConfidence) : 'medium'
      if (!name || !date || !phase) return null
      return { kind: 'registrar_ciclo', personFullName: name, date, phase, confidence, note: str(i.note, 500) ?? undefined }
    }
    case 'flag_ambiguo': {
      const short = str(i.short_name, 100)
      if (!short) return null
      return {
        kind: 'flag_ambiguo', shortName: short,
        contextHint: str(i.context_hint, 200) ?? undefined,
        optionsSeen: Array.isArray(i.options_seen) ? (i.options_seen as unknown[]).map((x) => String(x).slice(0, 100)).filter(Boolean) : undefined,
      }
    }
    default: return null
  }
}

/** Nombre completo = 2+ tokens no genéricos. Si trae solo 1 → null. */
export function requireFullName(v: unknown): string | null {
  const s = str(v, 200)
  if (!s) return null
  const tokens = s.split(/\s+/).filter((t) => t.length >= 2)
  if (tokens.length < 2) return null
  return s
}
