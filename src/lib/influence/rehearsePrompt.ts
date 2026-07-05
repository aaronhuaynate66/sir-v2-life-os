// SIR V2 — Sala de ensayo: caminos al objetivo (16·M4, CAPSTONE).
//
// Aaron fija un objetivo con una persona (ej. "que Alex me dé un aumento") y SIR,
// aterrizado en el contexto REAL de esa persona (memorias visibles + rol +
// ámbito), le juega caminos plausibles, las objeciones que va a encontrar y qué
// acciones mueven la aguja — como HIPÓTESIS para prepararse, NUNCA como
// predicción ("ensayás, no adivinás; la gente real sorprende"). Surgió de evaluar
// MiroFish (motor de enjambre): en vez de mil agentes genéricos, UN agente
// aterrizado en la persona real.
//
// Aplica a TODOS los contactos, pero NO trata a todos igual: para vínculos
// afectivos (ámbito 'personal') baja el tono estratégico y sube la honestidad
// emocional; para profesionales/comerciales, preparación estratégica con
// objetivos alineados. Guardrail ético: objetivos alineados = preparación
// legítima; la línea es engañar/explotar, no ensayar.
//
// Capa PURA: arma el prompt y parsea. La llamada al modelo + carga del contexto
// viven en /api/influence/rehearse.

import { renderStrategiesForPrompt } from './strategies'

export interface RehearseContext {
  personName: string
  role?: string
  organization?: string
  relationship?: string
  /** 'personal' (afectivo) | 'colega' | 'lead' | undefined. Decide el registro. */
  ambito?: string
  /** Memorias VISIBLES (getMemoriesForPerson ya excluye lo privado). */
  memories: string[]
  /** Bloque de conversación reciente importada (WhatsApp), ya renderizado. */
  conversation?: string
  /** Estado bio de Aaron (ventana de tolerancia), ya renderizado. */
  selfState?: string
}

export type Likelihood = 'plausible' | 'optimista' | 'dificil'

export interface RehearseScenario {
  title: string
  path: string
  likelihood: Likelihood
}
export interface RehearseObjection {
  objection: string
  response: string
}
export interface RehearseResult {
  /** Lectura corta de la situación/persona dado el contexto. */
  read: string
  scenarios: RehearseScenario[]
  objections: RehearseObjection[]
  /** Acciones concretas que mueven la aguja (antes/durante). */
  actions: string[]
  /** Una forma de abrir (como 16·M1). Opcional. */
  opener: string
  /** La línea de honestidad: esto es ensayo, no predicción + cautela según vínculo. */
  watchout: string
  /** Vacío normalmente; si el objetivo cruza a engaño/explotación, SIR frena acá. */
  ethicalNote: string
}

export const REHEARSE_SYSTEM_PROMPT = `Sos SIR V2, el sistema personal de Aaron. Aaron fija un OBJETIVO con una persona y vos
lo ayudás a ENSAYAR los caminos posibles hacia ese objetivo — como quien practica antes de
una conversación importante. Aterrizás TODO en la persona REAL (lo que Aaron sabe de ella),
no en un molde genérico.

QUÉ SOS Y QUÉ NO:
- Sos una SALA DE ENSAYO: generás hipótesis para que Aaron se prepare (caminos, objeciones,
  acciones). NO sos un oráculo: NO predecís lo que la persona VA a hacer. La gente real
  sorprende. Decilo.
- No des probabilidades numéricas. Usá "plausible" / "optimista" / "dificil" como etiqueta
  honesta de cada escenario.

REGLAS DURAS (no negociables):
1. Aterrizás en lo que el contexto dice de la persona. Si el contexto es pobre, decilo en
   "read" y bajá la especificidad — NO inventes miedos, traumas ni motivaciones.
2. Todo lo que sugieras que Aaron diga o haga tiene que ser VERDAD que él pueda sostener.
   Framing = su verdad en el lenguaje del otro. Jamás mentir, exagerar o fabricar.
3. Si el objetivo implica ENGAÑAR, manipular o explotar un miedo/debilidad de la persona, NO
   ensayás eso: explicá en "ethicalNote" por qué y ofrecé el camino honesto si existe.
4. REGISTRO SEGÚN EL VÍNCULO (clave):
   - ámbito 'personal' / relación afectiva (pareja, familia, amigo íntimo): BAJÁ el tono
     estratégico y SUBÍ la honestidad emocional. Acá no se "posiciona" ni se "gana" — se
     cuida y se es claro. Los escenarios son sobre entenderse, no sobre conseguir algo.
   - profesional / colega / lead: preparación estratégica está OK cuando el objetivo de Aaron
     se alinea con el interés del otro (ej. su aumento ↔ el valor que aporta al negocio).
5. ESTADO DE AARON (ventana de tolerancia — doc 13): si el contexto trae su estado bio y está
   FUERA de su ventana (estrés alto / sueño bajo / HRV en caída) o con deuda de sueño alta, la
   PRIMERA recomendación no es una estrategia de conversación: es REGULAR PRIMERO (bajar la
   activación — respirar, moverse, dormir) y recién después hablar. Nombralo en "read" y ponelo
   como primera "action". Una conversación difícil en caliente predeciblemente sale mal.
6. REPERTORIO: si el contexto trae un REPERTORIO de movidas, aterrizá las "actions" y el "opener"
   en ESAS movidas nombradas (ej. "Validar lo que siente: …", "Preguntar qué necesita: …"). Es la
   base científica de qué funciona sin manipular. En vínculos afectivos son formas de cuidado, no
   tácticas: no las presentes como "para conseguir" algo. No inventes movidas fuera del repertorio.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "read": "lectura corta de la situación y de qué mueve a esta persona (2-3 frases)",
  "scenarios": [{"title":"...","path":"cómo se juega, 2-3 frases","likelihood":"plausible|optimista|dificil"}],
  "objections": [{"objection":"lo que la persona podría objetar","response":"cómo responder con honestidad"}],
  "actions": ["acciones concretas que mueven la aguja, antes o durante"],
  "opener": "una línea concreta para abrir (su verdad, en el lenguaje del otro)",
  "watchout": "el recordatorio de que esto es ENSAYO, no predicción, + la cautela propia del vínculo",
  "ethicalNote": "normalmente '' ; si el objetivo cruza a engaño/explotación, explicá acá"
}
Da 2-3 scenarios y 2-3 objections. Empezá con { y terminá con }.`

/** Etiqueta legible por ámbito, para orientar al modelo sobre el registro. */
function ambitoHint(ambito?: string, relationship?: string): string {
  if (ambito === 'personal') return 'afectivo (pareja/familia/amigo íntimo) → registro de cuidado y honestidad, NO estratégico'
  if (ambito === 'colega') return 'profesional interno (trabajo)'
  if (ambito === 'lead') return 'comercial / prospecto'
  if (relationship === 'romantic' || relationship === 'family' || relationship === 'friend') {
    return 'afectivo → registro de cuidado y honestidad, NO estratégico'
  }
  return 'sin clasificar — inferí por la relación y sé prudente'
}

export function buildRehearseUserContent(ctx: RehearseContext, objective: string): string {
  const lines: string[] = []
  lines.push(`Persona: ${ctx.personName}`)
  if (ctx.role) lines.push(`Rol/cargo: ${ctx.role}`)
  if (ctx.organization) lines.push(`Organización: ${ctx.organization}`)
  if (ctx.relationship) lines.push(`Relación con Aaron: ${ctx.relationship}`)
  lines.push(`Tipo de vínculo: ${ambitoHint(ctx.ambito, ctx.relationship)}`)
  const repertoire = renderStrategiesForPrompt(ctx.ambito, ctx.relationship)
  if (repertoire) lines.push('', repertoire)
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 14)
  if (mems.length > 0) {
    lines.push('', 'Lo que SIR sabe de esta persona (para aterrizar el ensayo):')
    for (const m of mems) lines.push(`- ${m.slice(0, 240)}`)
  } else {
    lines.push('', '(SIR tiene poco contexto de esta persona — decilo en "read", bajá la especificidad y no inventes.)')
  }
  if (ctx.conversation && ctx.conversation.trim()) {
    lines.push('', ctx.conversation.trim().slice(0, 3500))
  }
  if (ctx.selfState && ctx.selfState.trim()) {
    lines.push('', ctx.selfState.trim().slice(0, 800))
  }
  lines.push('', `El objetivo de Aaron: ${objective.trim().slice(0, 600)}`)
  return lines.join('\n')
}

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function likelihoodOf(v: unknown): Likelihood {
  return v === 'optimista' || v === 'dificil' ? v : 'plausible'
}

/** Parsea la respuesta del modelo a RehearseResult. null si no hay nada usable. */
export function parseRehearseJson(raw: string): RehearseResult | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>

  const scenarios: RehearseScenario[] = Array.isArray(o.scenarios)
    ? o.scenarios.map((s) => {
        const x = (s ?? {}) as Record<string, unknown>
        return { title: str(x.title, 120), path: str(x.path, 500), likelihood: likelihoodOf(x.likelihood) }
      }).filter((s) => s.path || s.title).slice(0, 4)
    : []
  const objections: RehearseObjection[] = Array.isArray(o.objections)
    ? o.objections.map((s) => {
        const x = (s ?? {}) as Record<string, unknown>
        return { objection: str(x.objection, 300), response: str(x.response, 500) }
      }).filter((s) => s.objection).slice(0, 4)
    : []
  const actions = Array.isArray(o.actions)
    ? o.actions.filter((x): x is string => typeof x === 'string').map((s) => s.trim().slice(0, 240)).filter(Boolean).slice(0, 6)
    : []

  const result: RehearseResult = {
    read: str(o.read, 600),
    scenarios,
    objections,
    actions,
    opener: str(o.opener, 600),
    watchout: str(o.watchout, 500),
    ethicalNote: str(o.ethicalNote, 600),
  }
  // Necesitamos al menos un escenario, o la nota ética (rechazo honesto).
  if (result.scenarios.length === 0 && !result.ethicalNote && result.actions.length === 0) return null
  return result
}
