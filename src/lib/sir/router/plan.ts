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
  | 'crear_objetivo'
  | 'editar_objetivo'
  | 'registrar_episodio'
  | 'agregar_paso_objetivo'
  | 'agregar_bloqueo_objetivo'

export type GoalPriorityRA = 'critical' | 'high' | 'medium' | 'low'
export type GoalCategoryRA =
  | 'financial'
  | 'personal'
  | 'relational'
  | 'health'
  | 'career'
  | 'spiritual'
  | 'creative'

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
/** Crea un objetivo NUEVO con la metodologia SIR completa: por que + KRs (SMART)
 *  + WOOP (obstaculo + plan si-entonces). Todo opcional excepto el titulo — el
 *  ejecutor arma el goal, agrega KRs como objective_steps kind='kr' y persiste
 *  el WOOP en objective_plan. */
export interface RACrearObjetivo {
  type: 'crear_objetivo'
  titulo: string
  porQue?: string | null           // Goal.why (por que importa)
  prioridad?: GoalPriorityRA | null
  categoria?: GoalCategoryRA | null
  targetDate?: string | null       // YYYY-MM-DD
  target?: string | null           // SMART Measurable — metrica objetivo (ej. "S/15k/mes")
  baseline?: string | null         // SMART Measurable — donde estas hoy (ej. "S/8k/mes")
  esAncla?: boolean | null         // Si es el norte del año (setAnchor tras crear)
  krs?: string[] | null            // resultados clave (titulos)
  obstaculo?: string | null        // WOOP obstacle
  /** WOOP if-clause separado ("si pasa X"). Si viene junto con planEntonces,
   *  se persiste dividido en objective_plan.plan_if / plan_then. */
  planSi?: string | null
  /** WOOP then-clause separado ("entonces hago Y"). */
  planEntonces?: string | null
  /** Legacy: WOOP if+then juntos, formato libre. Se usa si planSi/planEntonces
   *  no vienen — cae a plan_if entero. Preferir el split cuando el relato
   *  lo permite. */
  siEntonces?: string | null
}
/** Edita un objetivo existente. TODAS las propiedades son parciales; krs se
 *  AGREGAN (append, no reemplazan) para no borrar data por error. */
export interface RAEditarObjetivo {
  type: 'editar_objetivo'
  objetivo: string                 // titulo para dedup con contexto
  prioridad?: GoalPriorityRA | null
  esAncla?: boolean | null
  obstaculo?: string | null
  /** Ver RACrearObjetivo.planSi / planEntonces / siEntonces (misma semantica). */
  planSi?: string | null
  planEntonces?: string | null
  siEntonces?: string | null       // legacy
  krs?: string[] | null            // se AGREGAN a los existentes
}
/** Crea un episodio (relationship_moment con status='abierto'). A diferencia de
 *  `registrar_interaccion` (evento puntual), un episodio queda abierto hasta
 *  resolverse — decisiones/hitos que rebotan durante dias o semanas. */
export interface RARegistrarEpisodio {
  type: 'registrar_episodio'
  persona: string                  // primaria
  titulo: string
  detalle?: string | null
  followUp?: string | null         // YYYY-MM-DD opcional
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
export type RouterAction =
  | RAInteraccion
  | RAPersona
  | RAOrganizacion
  | RACrearObjetivo
  | RAEditarObjetivo
  | RARegistrarEpisodio
  | RAPaso
  | RABloqueo

export interface RouterPlan {
  actions: RouterAction[]
  /** Lo que el modelo NO pudo mapear con confianza (se le muestra a Aaron como aviso, no se ejecuta). */
  unmapped: string[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const REL = new Set(['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance'])
const PRIORITY_SET = new Set<GoalPriorityRA>(['critical', 'high', 'medium', 'low'])
const CATEGORY_SET = new Set<GoalCategoryRA>([
  'financial',
  'personal',
  'relational',
  'health',
  'career',
  'spiritual',
  'creative',
])
const MAX_ACTIONS = 15
const MAX_KRS = 6

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
- crear_objetivo { titulo, porQue?, prioridad?, categoria?, targetDate?, target?, baseline?, esAncla?, krs?, obstaculo?, planSi?, planEntonces? }: un objetivo NUEVO con la metodología SIR completa. prioridad ∈ critical|high|medium|low. categoria ∈ financial|personal|relational|health|career|spiritual|creative. targetDate en YYYY-MM-DD. target = la métrica objetivo SMART. baseline = dónde estás HOY. esAncla=true SOLO si el relato lo prioriza explícitamente como el norte del año. krs es un array de 1-4 resultados clave medibles. WOOP: obstaculo = obstáculo real; planSi = disparador ("si pasa X"); planEntonces = respuesta concreta ("entonces hago Y"). PREFERI SIEMPRE separar planSi y planEntonces en dos campos limpios. SOLO si el objetivo NO está en el contexto.
- editar_objetivo { objetivo, prioridad?, esAncla?, obstaculo?, planSi?, planEntonces?, krs? }: cambiar campos de un objetivo YA EXISTENTE (usá el título tal cual del contexto). esAncla=true solo si el relato lo prioriza como el norte del año. krs se agregan a los existentes.
- registrar_episodio { persona, titulo, detalle?, followUp? }: un episodio abierto que rebota (decisión pendiente, conflicto, hito) — distinto de una interacción puntual. followUp en YYYY-MM-DD si el relato menciona cuándo revisarlo.
- agregar_paso_objetivo { objetivo, paso }: un avance concreto (tarea/acción) hacia un objetivo EXISTENTE. Usalo cuando el relato menciona algo por hacer, no un resultado medible (para KRs medibles usá crear_objetivo/editar_objetivo con krs).
- agregar_bloqueo_objetivo { objetivo, bloqueo, due? }: algo que falta/depende para lograr un objetivo existente. due en YYYY-MM-DD solo si el relato da fecha clara.

Reglas duras:
- NO dupliques: si la persona/empresa/objetivo ya está en el contexto, referencialo por su nombre, no lo crees de nuevo.
- NO inventes datos que el relato no diga (fechas, cargos, montos, KRs). Si dudás, dejalo en "unmapped".
- Preferí pocas acciones correctas a muchas inventadas.
- Cada acción debe poder rastrearse a una frase del relato.
- editar_objetivo NO reescribe todo — solo los campos que el relato menciona explícitamente.
- Un objetivo puede tener a lo sumo 4 KRs por acción (los medibles importan más que la cantidad).

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
    case 'crear_objetivo': {
      const titulo = str(o.titulo, 200)
      if (!titulo) return null
      const prio = strOrNull(o.prioridad, 20) as GoalPriorityRA | null
      const cat = strOrNull(o.categoria, 20) as GoalCategoryRA | null
      const td = strOrNull(o.targetDate, 10)
      const krsRaw = Array.isArray(o.krs) ? o.krs : []
      const krs = krsRaw
        .map((k) => str(k, 300))
        .filter((s) => s.length > 0)
        .slice(0, MAX_KRS)
      return {
        type: 'crear_objetivo',
        titulo,
        porQue: strOrNull(o.porQue, 800),
        prioridad: prio && PRIORITY_SET.has(prio) ? prio : null,
        categoria: cat && CATEGORY_SET.has(cat) ? cat : null,
        targetDate: td && ISO.test(td) ? td : null,
        target: strOrNull(o.target, 200),
        baseline: strOrNull(o.baseline, 200),
        esAncla: typeof o.esAncla === 'boolean' ? o.esAncla : null,
        krs: krs.length > 0 ? krs : null,
        obstaculo: strOrNull(o.obstaculo, 800),
        planSi: strOrNull(o.planSi, 400),
        planEntonces: strOrNull(o.planEntonces, 400),
        siEntonces: strOrNull(o.siEntonces, 800),
      }
    }
    case 'editar_objetivo': {
      const objetivo = str(o.objetivo, 200)
      if (!objetivo) return null
      const prio = strOrNull(o.prioridad, 20) as GoalPriorityRA | null
      const krsRaw = Array.isArray(o.krs) ? o.krs : []
      const krs = krsRaw
        .map((k) => str(k, 300))
        .filter((s) => s.length > 0)
        .slice(0, MAX_KRS)
      return {
        type: 'editar_objetivo',
        objetivo,
        prioridad: prio && PRIORITY_SET.has(prio) ? prio : null,
        esAncla: typeof o.esAncla === 'boolean' ? o.esAncla : null,
        obstaculo: strOrNull(o.obstaculo, 800),
        planSi: strOrNull(o.planSi, 400),
        planEntonces: strOrNull(o.planEntonces, 400),
        siEntonces: strOrNull(o.siEntonces, 800),
        krs: krs.length > 0 ? krs : null,
      }
    }
    case 'registrar_episodio': {
      const persona = str(o.persona, 120)
      const titulo = str(o.titulo, 200)
      if (!persona || !titulo) return null
      const followUp = strOrNull(o.followUp, 10)
      return {
        type: 'registrar_episodio',
        persona,
        titulo,
        detalle: strOrNull(o.detalle, 2000),
        followUp: followUp && ISO.test(followUp) ? followUp : null,
      }
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
