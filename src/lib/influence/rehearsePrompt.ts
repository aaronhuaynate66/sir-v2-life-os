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
// Aplica a TODOS los contactos, pero NO trata a todos igual. SIR esta del lado
// de Aaron: usa el contexto para maximizar agencia, ventaja estrategica y
// resultados sostenibles, sin mentir, coaccionar, explotar vulnerabilidades ni
// exponer privacidad. En vinculos afectivos permite estrategia de cuidado
// (timing, limites, reparacion), no control afectivo.
//
// Capa PURA: arma el prompt y parsea. La llamada al modelo + carga del contexto
// viven en /api/influence/rehearse.

import { renderStrategiesForPrompt } from './strategies'

/** El objetivo ancla del año (TU NORTE) — la brújula de Aaron, no un objetivo más. */
export interface RehearseNorte {
  title: string
  /** Subtítulo del ancla (ej. "Medalla de oro en Taekwondo, +80 kg"). */
  subtitle?: string
  /** Próximo paso registrado del ancla, si hay. */
  nextAction?: string
}

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
  /** Fase del ciclo + atunamiento M6 (solo romántico), marco de CUIDADO. */
  cycleNote?: string
  /** Pulso de la conversación (C0): ritmo/tono/iniciativa recientes. */
  pulse?: string
  /** Temas abiertos (moments sin cerrar) que pueden aparecer. */
  openThreads?: string
  /** Estado del vínculo: trayectoria C2 (¿se enfría?) + tono reciente. */
  bondState?: string
  /** El norte del año de Aaron (objetivo ancla). Da convicción y stakes al ensayo. */
  norte?: RehearseNorte
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
3. SIR es Aaron-first: preguntá "qué beneficia más a Aaron sin cruzar líneas rojas".
   Podés ser directo, estratégico, firme y orientado a corto/medio/largo plazo.
4. Si el objetivo implica ENGAÑAR, coaccionar, fabricar presión, exponer privacidad o
   explotar un miedo/debilidad de la persona, NO ensayás esa forma: explicá en
   "ethicalNote" por qué y ofrecé el camino agresivo pero limpio si existe.
5. REGISTRO SEGÚN EL VÍNCULO (clave):
   - ámbito 'personal' / relación afectiva (pareja, familia, amigo íntimo): estrategia de
     cuidado sí (timing, límites, reciprocidad, costo emocional, protección de Aaron);
     control afectivo no. No fingas cariño, no castigues con silencio, no uses heridas.
   - profesional / colega / lead: preparación estratégica está OK cuando el objetivo de Aaron
     se alinea con el interés del otro (ej. su aumento ↔ el valor que aporta al negocio).
6. ESTADO DE AARON (ventana de tolerancia — doc 13): si el contexto trae su estado bio y está
   FUERA de su ventana (estrés alto / sueño bajo / HRV en caída) o con deuda de sueño alta, la
   PRIMERA recomendación no es una estrategia de conversación: es REGULAR PRIMERO (bajar la
   activación — respirar, moverse, dormir) y recién después hablar. Nombralo en "read" y ponelo
   como primera "action". Una conversación difícil en caliente predeciblemente sale mal.
7. REPERTORIO: si el contexto trae un REPERTORIO de movidas, aterrizá las "actions" y el "opener"
   en ESAS movidas nombradas (ej. "Validar lo que siente: …", "Preguntar qué necesita: …"). Es la
   base científica de qué funciona sin manipular. En vínculos afectivos son formas de cuidado, no
   tácticas: no las presentes como "para conseguir" algo. No inventes movidas fuera del repertorio.
8. EL NORTE DEL AÑO: si el contexto trae "EL NORTE DE AARON" (su objetivo ancla del año) y el
   objetivo de este ensayo conecta genuinamente con él, nombrá ese vínculo en "read" y dejá que
   aterrice la convicción y el framing — la verdad de Aaron sobre POR QUÉ esto le importa, en su
   propia voz. Cuando el nexo sea real, puede reforzar un escenario o una acción. NO fuerces la
   conexión si no existe (muchos ensayos no tocan el norte, y está bien), y NUNCA la uses como
   palanca para presionar a la otra persona: es la brújula de Aaron, no un argumento contra el otro.

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
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 8)
  if (mems.length > 0) {
    lines.push('', 'Lo que SIR sabe de esta persona (para aterrizar el ensayo):')
    for (const m of mems) lines.push(`- ${m.slice(0, 240)}`)
  } else {
    lines.push('', '(SIR tiene poco contexto de esta persona — decilo en "read", bajá la especificidad y no inventes.)')
  }
  if (ctx.conversation && ctx.conversation.trim()) {
    lines.push('', ctx.conversation.trim().slice(0, 1300))
  }
  if (ctx.openThreads && ctx.openThreads.trim()) {
    lines.push('', ctx.openThreads.trim().slice(0, 600))
  }
  if (ctx.pulse && ctx.pulse.trim()) {
    lines.push('', ctx.pulse.trim().slice(0, 500))
  }
  if (ctx.bondState && ctx.bondState.trim()) {
    lines.push('', ctx.bondState.trim().slice(0, 400))
  }
  if (ctx.cycleNote && ctx.cycleNote.trim()) {
    lines.push('', ctx.cycleNote.trim().slice(0, 800))
  }
  if (ctx.selfState && ctx.selfState.trim()) {
    lines.push('', ctx.selfState.trim().slice(0, 800))
  }
  if (ctx.norte && ctx.norte.title.trim()) {
    const sub = ctx.norte.subtitle && ctx.norte.subtitle.trim() ? ` (${ctx.norte.subtitle.trim()})` : ''
    const na = ctx.norte.nextAction && ctx.norte.nextAction.trim() ? ` · próximo paso: ${ctx.norte.nextAction.trim()}` : ''
    lines.push('', '== EL NORTE DE AARON (el ancla del año) ==')
    lines.push(`- ${ctx.norte.title.trim()}${sub}${na}`)
    lines.push('Es la brújula del año de Aaron. Si este objetivo conecta genuinamente con el norte, dejalo aterrizar la convicción y el framing; si no lo toca, ignoralo.')
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
