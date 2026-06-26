// SIR V2 — Router de relato (intake conversacional multi-entidad). FOUNDATION.
//
// Aaron pega un relato en lenguaje natural ("me junté con X, me presentó a Y de
// la empresa Z, avancé un paso del objetivo W, me quedó pendiente A y B...") y
// SIR lo descompone en un PLAN de acciones tipadas que Aaron CONFIRMA/edita
// antes de escribir. Regla de oro (igual que el chat de acciones): el router
// PROPONE, Aaron CONFIRMA, recién ahí se escribe. Nunca escritura silenciosa.
//
// Este módulo es PURO: define los tipos de acción, el system prompt del planner
// y el parser/validador del JSON que devuelve el modelo. NO llama IA ni escribe.
// La ejecución (resolver IDs con dedup + commit) vive en el endpoint/UI (fases
// siguientes). Reusa la disciplina de actions.ts (el chat de una acción).

export type RouterActionType =
  | 'registrar_interaccion'
  | 'crear_persona'
  | 'crear_organizacion'
  | 'agregar_paso_objetivo'
  | 'agregar_bloqueo_objetivo'

export interface RAInteraccion {
  type: 'registrar_interaccion'
  persona: string
  calidad: number // 1-5
  nota: string
}
export interface RAPersona {
  type: 'crear_persona'
  nombre: string
  relacion?: string | null // family|friend|romantic|professional|mentor|mentee|acquaintance
  cargo?: string | null // ej. "presidente de la FEDEPOL"
  organizacion?: string | null // empresa/entidad a la que pertenece
}
export interface RAOrganizacion {
  type: 'crear_organizacion'
  nombre: string
  rubro?: string | null
}
export interface RAPaso {
  type: 'agregar_paso_objetivo'
  objetivo: string // título del objetivo (se resuelve por nombre con dedup)
  paso: string
}
export interface RABloqueo {
  type: 'agregar_bloqueo_objetivo'
  objetivo: string
  bloqueo: string
  due?: string | null // YYYY-MM-DD opcional
}
export type RouterAction = RAInteraccion | RAPersona | RAOrganizacion | RAPaso | RABloqueo

export interface RouterPlan {
  actions: RouterAction[]
  /** Lo que el modelo NO pudo mapear con confianza (se le muestra a Aaron como aviso, no se ejecuta). */
  unmapped: string[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const REL = new Set(['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance'])
const MAX_ACTIONS = 12

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function strOrNull(v: unknown, max: number): string | null {
  const s = str(v, max)
  return s.length > 0 ? s : null
}
function clamp1to5(v: unknown): number {
  const n = typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return 3
  return Math.max(1, Math.min(5, n))
}

/** System prompt del planner. Decompone el relato; no inventa; propone, no afirma. */
export const ROUTER_SYSTEM = `Sos SIR, el copiloto de Aaron. Te paso un RELATO suyo en lenguaje natural y el CONTEXTO de su vida (personas, empresas y objetivos que YA tiene). Tu tarea: descomponer el relato en un PLAN de acciones concretas que Aaron va a CONFIRMAR antes de que se escriban. NO ejecutás nada, NO afirmás que algo está hecho.

Acciones posibles (usá solo las que el relato justifique):
- registrar_interaccion { persona, calidad (1-5), nota }: cuando habló/se vio con alguien. La nota resume qué pasó.
- crear_persona { nombre, relacion?, cargo?, organizacion? }: SOLO si la persona NO está en el contexto. relacion ∈ family|friend|romantic|professional|mentor|mentee|acquaintance.
- crear_organizacion { nombre, rubro? }: SOLO si la empresa/entidad NO está en el contexto.
- agregar_paso_objetivo { objetivo, paso }: un avance concreto hacia un objetivo EXISTENTE (usá el título tal cual del contexto).
- agregar_bloqueo_objetivo { objetivo, bloqueo, due? }: algo que falta/depende para lograr un objetivo existente. due en YYYY-MM-DD solo si el relato da fecha clara.

Reglas duras:
- NO dupliques: si la persona/empresa/objetivo ya está en el contexto, referencialo por su nombre, no lo crees de nuevo.
- NO inventes datos que el relato no diga (fechas, cargos, montos). Si dudás, dejalo en "unmapped".
- Preferí pocas acciones correctas a muchas inventadas.
- Cada acción debe poder rastrearse a una frase del relato.

Respondé SOLO un objeto JSON, sin texto alrededor:
{"actions":[{"type":"...", ...}], "unmapped":["lo que no pudiste mapear con confianza"]}`

function normalizeAction(raw: unknown): RouterAction | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  switch (o.type) {
    case 'registrar_interaccion': {
      const persona = str(o.persona, 120)
      if (!persona) return null
      return { type: 'registrar_interaccion', persona, calidad: clamp1to5(o.calidad), nota: str(o.nota, 2000) }
    }
    case 'crear_persona': {
      const nombre = str(o.nombre, 120)
      if (!nombre) return null
      const rel = strOrNull(o.relacion, 40)
      return {
        type: 'crear_persona',
        nombre,
        relacion: rel && REL.has(rel) ? rel : null,
        cargo: strOrNull(o.cargo, 120),
        organizacion: strOrNull(o.organizacion, 120),
      }
    }
    case 'crear_organizacion': {
      const nombre = str(o.nombre, 120)
      if (!nombre) return null
      return { type: 'crear_organizacion', nombre, rubro: strOrNull(o.rubro, 120) }
    }
    case 'agregar_paso_objetivo': {
      const objetivo = str(o.objetivo, 160)
      const paso = str(o.paso, 400)
      if (!objetivo || !paso) return null
      return { type: 'agregar_paso_objetivo', objetivo, paso }
    }
    case 'agregar_bloqueo_objetivo': {
      const objetivo = str(o.objetivo, 160)
      const bloqueo = str(o.bloqueo, 400)
      if (!objetivo || !bloqueo) return null
      const due = strOrNull(o.due, 10)
      return { type: 'agregar_bloqueo_objetivo', objetivo, bloqueo, due: due && ISO.test(due) ? due : null }
    }
    default:
      return null
  }
}

/** Parsea la respuesta del planner (JSON) a un plan validado. Tolera texto alrededor. */
export function parseRouterPlan(text: string): RouterPlan {
  if (!text) return { actions: [], unmapped: [] }
  let raw = text.trim()
  const a = raw.indexOf('{')
  const b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) raw = raw.slice(a, b + 1)
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return { actions: [], unmapped: [] } }
  if (!obj || typeof obj !== 'object') return { actions: [], unmapped: [] }
  const o = obj as Record<string, unknown>
  const actions: RouterAction[] = []
  if (Array.isArray(o.actions)) {
    for (const it of o.actions) {
      const norm = normalizeAction(it)
      if (norm) actions.push(norm)
      if (actions.length >= MAX_ACTIONS) break
    }
  }
  const unmapped = Array.isArray(o.unmapped)
    ? o.unmapped.map((u) => str(u, 200)).filter((s) => s.length > 0).slice(0, 8)
    : []
  return { actions, unmapped }
}
