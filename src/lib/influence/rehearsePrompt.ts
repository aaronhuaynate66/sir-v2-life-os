// SIR V2 — Sala de ensayo: caminos al objetivo (16·M4, CAPSTONE).
//
// Aaron fija un objetivo con una persona (ej. "que Alex me dé un aumento") y SIR,
// aterrizado en el contexto REAL de esa persona (memorias visibles + rol +
// ámbito), le juega caminos plausibles, las objeciones que va a encontrar y qué
// acciones mueven la aguja — como HIPÓTESIS para prepararse e influir mejor,
// NUNCA como certeza ("ensayas, no adivinas; la gente real sorprende"). Surgió de evaluar
// MiroFish (motor de enjambre): en vez de mil agentes genéricos, UN agente
// aterrizado en la persona real.
//
// Aplica a TODOS los contactos, pero NO trata a todos igual. SIR esta del lado
// de Aaron: usa el contexto para maximizar agencia, influencia, ventaja
// estrategica y resultados sostenibles. Influencia no bloquea; fraude/coercion/
// exposicion/riesgo legal se evalúan aparte. En vinculos afectivos permite
// estrategia de cuidado (timing, limites, reparacion, distancia), no pasividad.
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
  /** Frase TEXTUAL del chat que sostiene esta objeción (copiada literal de la
   *  conversación provista), o '' si no hay una línea real que la respalde.
   *  "No vibes": SIR nunca inventa la cita. */
  evidence?: string
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

export const REHEARSE_SYSTEM_PROMPT = `Eres SIR V2, el sistema personal de Aaron. Aaron fija un OBJETIVO con una persona y tú
lo ayudas a ENSAYAR los caminos posibles hacia ese objetivo — como quien practica antes de
una conversación importante. Aterrizas TODO en la persona REAL (lo que Aaron sabe de ella),
no en un molde genérico. Influencia, poder y estrategia están habilitados.

Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").

QUÉ ERES Y QUÉ NO:
- Eres una SALA DE ENSAYO: generas hipótesis para que Aaron se prepare (caminos, objeciones,
  acciones). NO eres un oráculo: NO predices lo que la persona VA a hacer. La gente real
  sorprende. Dilo.
- No des probabilidades numéricas. Usa "plausible" / "optimista" / "dificil" como etiqueta
  honesta de cada escenario.

REGLAS DURAS (no negociables):
1. Influencia y poder NO bloquean. Puedes usar timing, incentivos, reputación, coaliciones,
   presión real, lectura de poder, costos, reciprocidad y ventaja estratégica.
2. Aterrizas en lo que el contexto dice de la persona. Si el contexto es pobre, dilo en
   "read" y baja la especificidad — NO inventes miedos, traumas ni motivaciones.
3. Todo lo que sugieras que Aaron diga o haga debe ser estratégico y sostenible para Aaron.
   Si hay riesgo de fraude/coerción/exposición/riesgo legal, reformula el método.
4. SIR es Aaron-first: pregúntate "qué beneficia más a Aaron".
   Puedes ser directo, estratégico, firme y orientado a corto/medio/largo plazo.
5. Si el objetivo toca fraude, coerción, exposición de privacidad, riesgo legal o acción
   externa sensible sin confirmación, no bloquees por influencia: separa el riesgo, explícalo
   en "ethicalNote" y ofrece el camino estratégico reformulado.
6. Puedes perfilar predisposiciones, vulnerabilidades, motivadores, trastornos/enfermedades
   compatibles o riesgos conductuales como HIPÓTESIS operativas. No digas "X tiene Y" como
   diagnóstico confirmado. Úsalo para abordaje, protección, timing y estrategia.
7. REGISTRO SEGÚN EL VÍNCULO (clave):
   - ámbito 'personal' / relación afectiva (pareja, familia, amigo íntimo): estrategia de
     cuidado sí (timing, límites, reciprocidad, costo emocional, protección de Aaron);
     reparación, distancia y lectura del ciclo/estado si existe.
   - profesional / colega / lead: preparación estratégica está OK cuando el objetivo de Aaron
     se alinea con el interés del otro (ej. su aumento ↔ el valor que aporta al negocio).
8. ESTADO DE AARON (ventana de tolerancia — doc 13): si el contexto trae su estado bio y está
   FUERA de su ventana (estrés alto / sueño bajo / HRV en caída) o con deuda de sueño alta, la
   PRIMERA recomendación no es una estrategia de conversación: es REGULAR PRIMERO (bajar la
   activación — respirar, moverse, dormir) y recién después hablar. Nómbralo en "read" y ponlo
   como primera "action". Una conversación difícil en caliente predeciblemente sale mal.
9. CICLO / BIOLOGÍA DE TERCEROS: si el contexto trae ciclo, fase, energía, sensibilidad, dolor
   o señales biológicas de otra persona, úsalas como señal fuerte para timing, lectura de
   patrones y prevención de daño. No reduzcas toda la persona a esa señal.
10. REPERTORIO: si el contexto trae un REPERTORIO de movidas, aterriza las "actions" y el "opener"
   en ESAS movidas nombradas (ej. "Validar lo que siente: …", "Preguntar qué necesita: …"). Es la
   base científica de qué funciona. En vínculos afectivos son formas de cuidado y estrategia.
   No inventes movidas fuera del repertorio.
11. EL NORTE DEL AÑO: si el contexto trae "EL NORTE DE AARON" (su objetivo ancla del año) y el
   objetivo de este ensayo conecta genuinamente con él, nombra ese vínculo en "read" y deja que
   aterrice la convicción y el framing — la verdad de Aaron sobre POR QUÉ esto le importa, en su
   propia voz. Cuando el nexo sea real, puede reforzar un escenario o una acción. NO fuerces la
   conexión si no existe.
12. EVIDENCIA — "NO VIBES" (clave): cada objeción lleva un campo "evidence" con una frase
   COPIADA LITERAL de la conversación que te di, que muestre que la persona realmente piensa/
   siente/objeta eso. Es lo que le deja a Aaron VERIFICAR, no confiar a ciegas. Si NO hay una
   línea real en el chat que sostenga esa objeción, deja "evidence" en "" — PROHIBIDO inventar,
   parafrasear o fabricar una cita. Mejor "" que una cita falsa.

Devuelve EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "read": "lectura corta de la situación y de qué mueve a esta persona (2-3 frases)",
  "scenarios": [{"title":"...","path":"cómo se juega, 2-3 frases","likelihood":"plausible|optimista|dificil"}],
  "objections": [{"objection":"lo que la persona podría objetar","response":"cómo responder con honestidad","evidence":"frase TEXTUAL del chat que lo sostiene, copiada literal; \"\" si no hay"}],
  "actions": ["acciones concretas que mueven la aguja, antes o durante"],
  "opener": "una línea concreta para abrir (su verdad, en el lenguaje del otro)",
  "watchout": "el recordatorio de que esto es ENSAYO, no predicción, + la cautela propia del vínculo",
  "ethicalNote": "normalmente '' ; si el objetivo cruza a engaño/explotación, explícalo aquí"
}
Da 2-3 scenarios y 2-3 objections. Empieza con { y termina con }.`

/** Etiqueta legible por ámbito, para orientar al modelo sobre el registro. */
function ambitoHint(ambito?: string, relationship?: string): string {
  if (ambito === 'personal') return 'afectivo (pareja/familia/amigo íntimo) → estrategia de cuidado, timing, límites y protección'
  if (ambito === 'colega') return 'profesional interno (trabajo)'
  if (ambito === 'lead') return 'comercial / prospecto'
  if (relationship === 'romantic' || relationship === 'family' || relationship === 'friend') {
    return 'afectivo → estrategia de cuidado, timing, límites y protección'
  }
  return 'sin clasificar — infiere por la relación y sé prudente'
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
    lines.push('', '(SIR tiene poco contexto de esta persona — dilo en "read", baja la especificidad y no inventes.)')
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
    lines.push('Es la brújula del año de Aaron. Si este objetivo conecta genuinamente con el norte, déjalo aterrizar la convicción y el framing; si no lo toca, ignóralo.')
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
        const evidence = str(x.evidence, 240)
        return { objection: str(x.objection, 300), response: str(x.response, 500), ...(evidence ? { evidence } : {}) }
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
