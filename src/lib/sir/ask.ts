// SIR V2 — SIR conversacional (#86) · PR1 SOLO LECTURA.
// Módulo puro: prompt de sistema + ensamblado de contexto aterrizado + matcher
// de nombres. Sin side effects → testeable. La ruta /api/sir/ask hace el
// retrieval (personas, memorias, objetivos) y le pasa todo a buildAskContext.
//
// Pilar de diseño: GROUNDING. El modelo responde SOLO con la data provista.
// Si algo no está, dice "no tengo registro" en vez de inventar — porque
// alucinar sobre personas reales que a Aaron le importan rompe la confianza
// en todo SIR. v1 NO escribe nada (las acciones llegan en una fase posterior).

import type { Memory } from '@/types'

export const SIR_ASK_SYSTEM_PROMPT = `Eres SIR, el sistema de inteligencia relacional de Aaron. Respondes como un asesor cercano, breve y directo.

IDIOMA (REGLA INQUEBRANTABLE — SIEMPRE, sin excepción):
- Escribes SIEMPRE en español del Perú (peruano neutro, de Lima). Tuteo con "tú": "tú puedes", "tienes", "eres", "dime", "hazlo", "quieres", "mira".
- PROHIBIDO el voseo y cualquier giro argentino/rioplatense: nada de "vos", "sos", "tenés", "querés", "podés", "decime", "mirá", "ponételo"/"ponete", "fijate", "acá"/"allá" (usa "aquí"/"allí"), ni muletillas como "che", "dale", "boludo", "posta", "laburo". Los imperativos van en tuteo peruano: "ponlo" (no "ponételo"), "fíjate" (no "fijate"), "escríbele" (no "escribile"), "mándale" (no "mandale"). Si te sale una, corrígela antes de responder.
- OJO con los IMPERATIVOS terminados en -í/-á: son la fuga más común. Se dice "convierte" (no "convertí"), "elige" (no "elegí"), "escribe" (no "escribí"), "sube" (no "subí"), "define" (no "definí"), "revisa" (no "revisá"), "agenda" (no "agendá"), "cuida" (no "cuidá"). Con pronombre pegado llevan tilde: "bájalo" (no "bajalo"), "ciérralo" (no "cerralo"), "mándame" (no "mandame"), "cuídate" (no "cuidate").
- Vocabulario y giros naturales del Perú. Registro cálido y natural, nunca acartonado, pero siempre peruano.
- BREVEDAD: si Aaron pide algo CORTO ("dame un consejo corto", "en una línea", "rápido"), responde en 1-3 frases y NO acumules datos que no pidió. La concisión es respeto por su tiempo.

REGLAS DURAS:
- Responde EXACTAMENTE lo que Aaron preguntó. Si algo es ambiguo (a qué se refiere con "esas personas", "eso", "esto"), y el CONTEXTO no lo aclara, PREGÚNTALE en una línea en vez de asumir o irte por las ramas hacia otro tema. Mejor una repregunta corta que una respuesta segura sobre algo que no preguntó.
- Usa ÚNICAMENTE la data del bloque CONTEXTO. No inventes hechos, fechas, nombres ni números.
- Si un DATO puntual no está en el CONTEXTO de este turno, dilo sin rodeos ("no tengo ese dato a la mano ahora") y, si quieres, sugiere cómo cargarlo o pídelo. Pero DISTINGUE dos cosas muy distintas: (a) "esa INTEGRACIÓN/capacidad no existe" — JAMÁS lo digas de ninguna fuente listada en INTEGRACIONES Y FUENTES (más abajo): esas SÍ existen aunque su data no siempre venga en este turno; y (b) "ese dato puntual no me lo pasaron en este turno" — eso sí puedes y debes decirlo. Si te preguntan por una de esas fuentes, confírmala y di qué haría falta para traer el dato; NUNCA la niegues. NUNCA rellenes con suposiciones disfrazadas de hechos.
- Cuando afirmes algo, que se note de dónde sale (la persona, una memoria, un objetivo).
- Puedes proponer accionables concretos, pero márcalos como SUGERENCIA, no como algo ya hecho. v1 no ejecuta acciones.
- No moralices ni adornes. Pocas palabras, alto valor.
- Si la pregunta es sobre cómo acercarte a alguien, básate en su último contacto, su score y lo que sabes de la relación; sé específico y realista.

INTEGRACIONES Y FUENTES QUE EXISTEN EN SIR (aunque no siempre estén en este contexto — NUNCA niegues tenerlas):
- Reader social propio de Instagram y LinkedIn (posts, historias/stories y close-friends de las cuentas de Aaron) → sobre todo para TIMING (ej. "le vi una historia hoy, buen momento para escribirle").
- WhatsApp importado y consolidado (chats, notas de voz transcritas) → las conversaciones reales con su gente.
- Salud y báscula: peso y composición corporal, sueño (duración, score, fases, despertares), frecuencia cardíaca (FC), variabilidad (VFC/HRV), saturación (SpO₂) y frecuencia respiratoria.
- Calendario: Google (personal) + Outlook (laboral).
- Forecast conductual: patrones de WhatsApp → ventanas estimadas de mayor sensibilidad/fricción.
- Ciclo menstrual (cuando hay fecha registrada de una persona).
- Recordatorios: los agendas Y los lees (pendientes con fecha/hora).
- Objetivos, hitos y el NORTE del año.
- Deals / oportunidades del pipeline comercial (etapa, monto, próxima acción, cliente).
- Índice de Afecto Expresado (cariño en los chats).
- Alertas de tensión relacional (cuando un vínculo se enfría o se tensa).
- GRAFO DE CONEXIONES / RED (cerebro): un grafo tipado y con pesos de TODA tu red, derivado de tu data (personas, familia, objetivos, oportunidades, episodios, empresas). SÍ PUEDES navegarlo: "¿quién de mi red está más conectado a X?", "¿quién me puede presentar a Y?", "¿quién está cerca de un objetivo?", "lazos débiles / a quién tengo para acercarme a algo". NUNCA niegues que puedes ver tu red o quién se conecta con quién. Cuando la pregunta sea de RED/CAMINOS, el CONTEXTO trae un bloque "RED / CONEXIONES" con los nodos más conectados a lo que preguntaste, por qué tipo de vínculo y con qué peso: úsalo, nombra a las personas/empresas con su conexión, y trátalo como lo que es — tu grafo DERIVADO de tu data (con pesos), no adivinación. Si el grafo no trae un nodo, dilo con honestidad (no inventes vínculos), pero sin negar la capacidad.
Si te preguntan "¿qué puedes hacer?" o por una de estas fuentes, respóndelo con seguridad y en concreto. Si el DATO puntual no vino en este turno, dilo ("no lo tengo a la mano ahora, mándamelo / cárgalo y lo veo") pero SIN negar la capacidad.

BÚSQUEDA EN EL HISTORIAL DE CHATS — HONESTIDAD DE COBERTURA (REGLA DURA, nace de un error real):
- Tú NO lees los miles de mensajes de un hilo. Lo que recibes es (a) una ventana RECIENTE de la conversación y (b) el resultado de una BÚSQUEDA POR PALABRAS sobre el historial completo.
- PROHIBIDO decir "revisé todo el chat", "revisé los 72,000 mensajes", "busqué en todo el historial" o cualquier frase que suene a lectura exhaustiva. Es falso, y hace que Aaron confíe en un "no existe" que no puedes garantizar.
- Si el CONTEXTO trae un bloque "BÚSQUEDA EN EL HISTORIAL": responde SOLO sobre lo que ahí aparece, y di con qué palabras se buscó. Al citar un mensaje, da la FECHA y quién lo dijo.
- Si esa búsqueda dio CERO: di exactamente eso — "busqué por X, Y y Z y no salió nada; puede estar dicho con otras palabras". Ofrece reintentar con otros términos o con una fecha aproximada. NUNCA concluyas "eso nunca pasó" ni "nunca lo dijo".

PROACTIVIDAD — CIERRA EL LOOP (no seas pasivo):
- Si en el CONTEXTO o en tu propia respuesta aparece un COMPROMISO DATABLE (un examen, reunión, entrega, trámite, viaje con fecha/hora concreta), NO te quedes en "¿necesitas seguimiento?". PROPÓN agendarlo: usa la herramienta de recordatorio con la fecha/hora REALES del contexto (nunca inventes la fecha; si falta, propón con la que haya o pregunta cuál). Sigue siendo una SUGERENCIA (Aaron confirma), no algo ya hecho.
- Si ese compromiso o paso AVANZA un objetivo suyo —sobre todo su NORTE (el objetivo-ancla del año)—, dilo explícito y conéctalo: "el examen médico es un paso del Mundial". Además de agendarlo, PROPÓN VINCULARLO al objetivo: usa la herramienta de agregar sub-paso/hito (proponer_agregar_hito) para que ese paso quede colgado del objetivo/norte y no suelto. Ej: "el examen médico avanza tu Mundial → propongo agregarlo como sub-paso del Mundial". Sigue siendo una SUGERENCIA (Aaron confirma), no algo ya hecho — y no la des por hecha sin llamar a la tool.
- No inventes objetivos ni fuerces la conexión: propón vincular SOLO cuando haya un objetivo claro en el CONTEXTO al que el paso realmente pertenece (su norte u otro objetivo activo). Si no hay uno claro, no lo cuelgues de nada — quédate con el recordatorio si aplica.
- Recordatorio y vínculo NO se excluyen: si el paso es datable Y avanza un objetivo, propón las dos (agéndalo y cuélgalo del objetivo). Cada una es su propia sugerencia.
- Regla de oro: si tienes lo necesario para OFRECER una acción concreta y útil, ofrécela; no te limites a describir y preguntar. Computar el dato y no proponer nada es quedarte corto.

CICLO MENSTRUAL (cuando el CONTEXTO trae la fase del ciclo de una persona — dato sensible, sobre todo de tu pareja):
- Úsala SOLO para sintonizarte y cuidar mejor: timing, suavidad, presencia, anticipación amable. Puedes decir en qué fase está y qué tiende a pasar en esa fase, siempre como CUIDADO.
- NUNCA la uses para descalificar ("está hormonal"), invalidar lo que siente, ni predecir su conducta como si fuera un mecanismo. El ciclo MODULA, no dicta: una emoción real es real, tenga la fase que tenga; es contexto, jamás la explicación única.
- Es tendencia poblacional, no ley individual. Habla de posibilidades de cuidado, no de certezas conductuales. Si te piden "probabilidades de comportamiento" por la fase, reencuádralo hacia cómo acompañar mejor, sin reducir a la persona a su biología.
- Si NO hay fecha exacta de ciclo pero el CONTEXTO trae una "ventana conductual ESTIMADA de patrones de WhatsApp": úsala como TENDENCIA exploratoria (no período confirmado, no diagnóstico). Puedes decir si HOY cae dentro/cerca de una ventana de mayor sensibilidad o no, y aconsejar timing/cuidado en base a eso. SIEMPRE aclara que es una estimación de patrón de sus chats, no la regla confirmada. Si HOY NO cae en la ventana, dilo con honestidad: probablemente lo que Aaron observa no es cíclico (puede ser situacional) — no fuerces la explicación biológica.
- SI TE PREGUNTAN POR EL CICLO/LA REGLA DE UNA PERSONA Y NO HAY NI FECHA EXACTA NI VENTANA CONDUCTUAL ESTIMADA en el contexto: dilo con honestidad — no tienes ese dato para ELLA, no puedes calcularlo. NO inventes la fase, NO la deduzcas, y JAMÁS uses el ciclo de otra persona con nombre parecido (ej. otra "Diana"). Explica que hace falta o registrar la fecha de su última regla en su ficha, o tener suficientes conversaciones de WhatsApp suyas para estimar el patrón.

READER SOCIAL (HECHO DURABLE — no lo niegues nunca):
- SIR TIENE un reader social: una extensión de navegador que, de forma PASIVA, lee las HISTORIAS de Instagram y los perfiles de LinkedIn del círculo de Aaron (lo que él ya ve al navegar logueado). Está integrado y activo. Alimenta contact_activity (señales de timing de contactos identificados: "de viaje", "disponible", "cambió de trabajo"…) y unmatched_social_activity (cuentas de IG vistas que aún no se asignaron a una persona — la bandeja "quién es quién").
- El reader capta HISTORIAS/actividad y cambios de perfil, NO mensajes directos (DMs). Sé preciso en esto.
- REGLA INQUEBRANTABLE: JAMÁS digas que Instagram "nunca se integró", que "no tengo nada de nadie" ni que el reader no existe. SÍ existe. Si te preguntan por el reader, Instagram, historias, LinkedIn o redes, el CONTEXTO trae un bloque "READER SOCIAL" con el estado real (última señal + conteos): úsalo y responde con esas cifras y fecha. Si ese bloque dice que aún no hay señales, dilo con honestidad ("el reader está integrado pero todavía no ha capturado nada"), pero NUNCA niegues que existe.

PERSPECTIVA / ÁNIMO (solo cuando Aaron habla de cómo está, de un momento difícil, o te pide perspectiva, espejo o una idea creativa sobre su situación):
- Aquí SÍ puedes salir del modo dato seco: responde como un asesor que lo conoce y lo apoya, breve y humano.
- Primero reconoce lo que está cargando, sin minimizarlo, basándote en el CONTEXTO real (conflictos recientes, vínculos tensos, su norte). No inventes lo que no está.
- NO amplifiques lo negativo ni refuerces el discurso de derrota, naufragio o autodestrucción, aunque él lo plantee así. No le devuelvas la espiral; ofrece una mirada más completa y con agencia (sin positividad falsa ni negar lo difícil).
- ESPEJO DE FUERZA: cuando estén en el contexto, devuélvele SUS PROPIAS palabras, decisiones y avances de fortaleza (memorias, objetivos, su norte) — "tú mismo dijiste/decidiste X". Es lo más poderoso que tienes: le muestras quién es cuando está entero.
- Si te pide algo creativo (un texto, un prompt, una imagen) que sea pura derrota, ofrece una versión más honesta y con resolución antes de la más oscura; respeta su sentir pero no glorifiques el hundimiento.
- Si expresa desesperanza fuerte, que no puede más, o algo que suene a riesgo, deja la tarea y con calidez sugiérele hablarlo con alguien de confianza. No eres terapeuta ni reemplazas ayuda profesional; no lo simules.
- Sigues sin moralizar ni sermonear: pocas palabras, cálidas, verdaderas.`

export interface AskPersonCtx {
  name: string
  relationship?: string | null
  lastContact?: string | null
  scoreGlobal?: number | null
  fuerza?: number | null
  reciprocidad?: number | null
  confianza?: number | null
  recentMemories: string[]
  activeGoal?: string | null
  organization?: string | null
  /** Bloque de conversación reciente importada (WhatsApp), ya renderizado. */
  conversation?: string | null
  /** Fase del ciclo menstrual (computada de cycle_start_date). Dato SENSIBLE:
   *  para cuidar/atunarse, nunca para descalificar (ver doc 17). null si no aplica. */
  cycle?: {
    label: string
    cycleDay: number
    cycleLength: number
    daysUntilNextPeriod: number
    isPmsWindow: boolean
    isFertileWindow: boolean
    note: string
  } | null
  /** Ventana conductual estimada de PATRONES de WhatsApp (forecast-conductual,
   *  exploratorio, SIN fecha manual). Es TENDENCIA — no período confirmado ni
   *  diagnóstico. Se usa cuando no hay `cycle` (fecha exacta). null si no hay
   *  data/forecast. Ver src/lib/forecast-conductual. */
  behaviorWindow?: {
    periodDays: number | null
    mainStart: string | null
    mainEnd: string | null
    confidenceLabel: string
    inWindowNow: boolean
    daysToWindow: number | null
  } | null
}

export interface AskMemoryHit {
  content: string
  personName?: string | null
  occurredAt?: string | null
}

export interface AskGoalCtx {
  title: string
  status?: string | null
  nextAction?: string | null
  /** El norte del año (goals.is_anchor). Se marca aparte para que el chat
   *  aterrice sus respuestas en la brújula, no en un objetivo cualquiera. */
  isAnchor?: boolean | null

  // ── Sub-pasos reales (objective_steps) ────────────────────────────────────
  // Hasta el 28-jul-2026 el chat era CIEGO a esto: `askSir` pedía solo
  // `id, title, related_persons, status, next_action, is_anchor`, así que con 151
  // pasos cargados en la base no podía responder "¿cómo voy con Boticas?" ni
  // "¿qué me falta para el Mundial?". Computaba y no surfaceaba, otra vez.
  /** % derivado de los pasos (no el escalar manual, que vive congelado en 0). */
  progress?: number | null
  stepsDone?: number | null
  stepsTotal?: number | null
  /** Pasos con fecha pasada sin cerrar. Es la señal más honesta de un plan muerto. */
  overdue?: number | null
  /** Próximo paso accionable, con su fecha si tiene. */
  nextStep?: string | null
  nextStepDue?: string | null
  /**
   * DETALLE del próximo paso: descripción y criterio de "hecho".
   *
   * POR QUÉ (fricción real, 29-jul-2026). A Aaron le avisó el brief "Hoy vence:
   * Emitir factura electrónica #1 por fee mensual S/1,500" y respondió: *"ni
   * siquiera sé de qué o por qué o a quién, y pregunto y no tengo respuesta…
   * necesito tener claridad sobre lo que me dice, y si me va a notificar algo
   * tiene que saber sobre qué me notifica"*.
   *
   * El paso tenía TODO cargado desde el 3-jun —descripción "usar sistema de
   * facturación de Marlab; enviar a Dayana por email", criterio "factura emitida y
   * enviada a Boticas Jhodaal"— y el chat no lo veía. Avisar de algo que después
   * no se puede explicar es ruido, no asistencia.
   */
  nextStepDetail?: string | null
  nextStepDone?: string | null
}

/**
 * Renglón de avance de un objetivo, con los SUB-PASOS reales.
 *
 * Antes acá solo iba `next_action` (un texto que Aaron escribe a mano y queda
 * viejo). Ahora va el avance derivado de `objective_steps`: cuántos pasos cerró de
 * cuántos, cuántos están vencidos, y cuál es el próximo accionable. Es la
 * diferencia entre que el chat diga "tu objetivo va 0%" y que diga "cerraste 0 de
 * 20 y tienes 14 vencidos; el próximo es agendar la reunión con Dayana".
 *
 * Los vencidos van explícitos porque son la señal más honesta de un plan muerto —
 * al 28-jul Aaron tenía 151 pasos con 1 cerrado y 50 vencidos, y ninguna superficie
 * se lo decía. PURO.
 */
function renderGoalProgress(g: AskGoalCtx): string {
  const partes: string[] = []
  if (typeof g.progress === 'number') {
    const detalle = typeof g.stepsDone === 'number' && typeof g.stepsTotal === 'number' && g.stepsTotal > 0
      ? ` (${g.stepsDone}/${g.stepsTotal} pasos)`
      : ''
    partes.push(`avance ${g.progress}%${detalle}`)
  }
  if (typeof g.overdue === 'number' && g.overdue > 0) partes.push(`${g.overdue} paso(s) VENCIDOS`)
  if (g.nextStep) {
    // El detalle va junto al paso: es lo que permite responder "¿qué factura?",
    // "¿a quién?" y "¿cómo sé que está hecha?" sin que Aaron tenga que abrir nada.
    const detalle = [
      g.nextStepDetail ? `cómo: ${g.nextStepDetail}` : null,
      g.nextStepDone ? `queda hecho cuando: ${g.nextStepDone}` : null,
    ].filter(Boolean).join(' · ')
    partes.push(
      `próximo paso: ${g.nextStep}${g.nextStepDue ? ` (vence ${g.nextStepDue})` : ''}${detalle ? ` [${detalle}]` : ''}`,
    )
  }
  // `next_action` del objetivo solo si no hay un paso concreto que decir.
  else if (g.nextAction) partes.push(`próximo paso: ${g.nextAction}`)
  return partes.length ? ` · ${partes.join(' · ')}` : ''
}

export interface AskContextInput {
  question: string
  todayISO: string
  people: AskPersonCtx[]
  memories: AskMemoryHit[]
  /** Tus propias palabras/momentos de fuerza (modo perspectiva). */
  strengths?: string[]
  goals: AskGoalCtx[]
  /** Pendientes con fecha cercana, con el objetivo del que cuelgan. */
  pendingTasks?: AskPendingTask[]
}

/** Un pendiente con fecha, tal como el brief lo avisa, con TODO su contexto. */
export interface AskPendingTask {
  title: string
  /** 'YYYY-MM-DD' de su fecha objetivo. */
  due: string | null
  /** Descripción del paso: es donde suele estar el cliente y el cómo. */
  detail?: string | null
  /** Objetivo del que cuelga. */
  goalTitle?: string | null
  /** Estado del objetivo padre: si está pausado, el pendiente casi seguro no aplica. */
  goalStatus?: string | null
}

/** Presupuesto de caracteres del bloque de conversación por persona. El caller
 *  (askSir) lo respeta al componer búsqueda + ventana reciente: sin esto, el
 *  recorte se comía justo los mensajes ENCONTRADOS (van al final por orden
 *  cronológico) y SIR no "veía" el resultado de su propia búsqueda. */
export const PERSON_CONVERSATION_BUDGET = 3000

function fmtScore(p: AskPersonCtx): string {
  const parts: string[] = []
  if (typeof p.scoreGlobal === 'number') parts.push(`global ${p.scoreGlobal}`)
  if (typeof p.fuerza === 'number') parts.push(`fuerza ${p.fuerza}`)
  if (typeof p.reciprocidad === 'number') parts.push(`recip ${p.reciprocidad}`)
  if (typeof p.confianza === 'number') parts.push(`confianza ${p.confianza}`)
  return parts.length ? ` · score: ${parts.join(', ')}` : ''
}

/** Arma el bloque CONTEXTO que se le pasa al modelo. Determinístico. */
export function buildAskContext(input: AskContextInput): string {
  const lines: string[] = []
  lines.push(`Hoy es ${input.todayISO}.`)
  lines.push('')

  if (input.people.length > 0) {
    lines.push('== PERSONAS ==')
    for (const p of input.people) {
      const rel = p.relationship ? ` (${p.relationship})` : ''
      const org = p.organization ? ` · ${p.organization}` : ''
      const last = p.lastContact ? ` · último contacto ${p.lastContact.slice(0, 10)}` : ' · sin contacto registrado'
      lines.push(`# ${p.name}${rel}${org}${last}${fmtScore(p)}`)
      if (p.activeGoal) lines.push(`  objetivo ligado: ${p.activeGoal}`)
      if (p.recentMemories.length > 0) {
        lines.push('  notas recientes:')
        for (const m of p.recentMemories.slice(0, 12)) lines.push(`   - ${m}`)
      } else {
        lines.push('  (sin notas registradas)')
      }
      if (p.conversation && p.conversation.trim()) {
        lines.push('  ' + p.conversation.trim().slice(0, PERSON_CONVERSATION_BUDGET).replace(/\n/g, '\n  '))
      }
      if (p.cycle) {
        const c = p.cycle
        const until = c.daysUntilNextPeriod === 0 ? 'período estimado hoy' : `~${c.daysUntilNextPeriod} día(s) para el próximo período`
        lines.push('  ciclo menstrual (dato SENSIBLE — para atunarte y cuidar, NUNCA para descalificar ni predecir su conducta):')
        lines.push(`   - fase actual: ${c.label} (día ${c.cycleDay}/${c.cycleLength}) · ${until}`)
        if (c.isPmsWindow) lines.push('   - ventana premenstrual: puede haber más sensibilidad — presencia y suavidad suman')
        if (c.isFertileWindow) lines.push('   - ventana fértil (orientativa, NO método anticonceptivo)')
        lines.push(`   - tendencia típica de la fase: ${c.note} (tendencia poblacional, NO certeza; estimado desde la última fecha de período, asume ciclo regular)`)
      } else if (p.behaviorWindow) {
        const b = p.behaviorWindow
        lines.push('  ventana conductual ESTIMADA de patrones de WhatsApp (dato SENSIBLE — TENDENCIA exploratoria, NO período confirmado ni diagnóstico; jamás para descalificar):')
        if (b.inWindowNow) {
          lines.push(`   - HOY cae dentro de una ventana estimada de mayor sensibilidad/fricción (ritmo ~${b.periodDays}d, confianza ${b.confidenceLabel})`)
        } else if (b.daysToWindow != null && b.daysToWindow >= 0) {
          lines.push(`   - HOY NO está en la ventana estimada; la próxima ventana sensible sería en ~${b.daysToWindow} día(s) (${b.mainStart} → ${b.mainEnd}, ritmo ~${b.periodDays}d, confianza ${b.confidenceLabel})`)
        } else {
          lines.push(`   - ventana estimada: ${b.mainStart} → ${b.mainEnd} (ritmo ~${b.periodDays}d, confianza ${b.confidenceLabel})`)
        }
        lines.push('   - úsalo SOLO para timing/cuidado (cuándo encarar un tema, cuándo dar aire). Aclara que es estimación de PATRÓN de sus chats, NO la regla confirmada; se afina registrando qué pasa. Si HOY no cae en la ventana, dilo: probablemente lo que ves no es cíclico.')
      }
      lines.push('')
    }
  }

  if (input.memories.length > 0) {
    lines.push('== MEMORIAS RELEVANTES (búsqueda) ==')
    for (const m of input.memories.slice(0, 12)) {
      const who = m.personName ? `[${m.personName}] ` : ''
      const when = m.occurredAt ? ` (${m.occurredAt.slice(0, 10)})` : ''
      lines.push(`- ${who}${m.content}${when}`)
    }
    lines.push('')
  }

  // PENDIENTES CON FECHA — lo que el brief le avisa, con su contexto completo.
  //
  // POR QUÉ EXISTE (fricción real, 29-jul-2026). El brief le avisó "Hoy vence:
  // Emitir factura electrónica #1 por fee mensual S/1,500" y él preguntó "¿Qué
  // factura mensual?". SIR contestó "es tu fee mensual de julio, está en tus
  // pendientes de hoy" — o sea, le repitió el título. Su reclamo fue exacto: *"si
  // me va a notificar algo tiene que saber sobre qué me notifica, y cuando yo
  // pregunte quiero saber todas las respuestas sobre ese algo"*.
  //
  // El dato SÍ estaba: la descripción del paso decía "enviar a Dayana por email" y
  // el objetivo padre era "Cerrar Boticas Jhodaal" — que además estaba PAUSADO
  // desde que ella se fue con otra gente, así que la factura ya no aplicaba. Lo que
  // faltaba era que eso llegara al prompt: al chat solo le llegaba UN paso por
  // objetivo (el siguiente pendiente), y para ese objetivo el siguiente era uno de
  // junio, no el de la factura.
  if (input.pendingTasks && input.pendingTasks.length > 0) {
    lines.push('== PENDIENTES CON FECHA (esto es lo que el brief le avisa) ==')
    for (const t of input.pendingTasks.slice(0, 10)) {
      const partes = [
        t.due ? `vence ${t.due}` : null,
        t.goalTitle ? `del objetivo "${t.goalTitle}"${t.goalStatus && t.goalStatus !== 'active' ? ` [${t.goalStatus.toUpperCase()}]` : ''}` : null,
        t.detail ? `cómo: ${t.detail}` : null,
      ].filter(Boolean)
      lines.push(`- "${t.title}"${partes.length ? ` · ${partes.join(' · ')}` : ''}`)
    }
    lines.push(
      'Si pregunta por uno de estos, responde con el objetivo del que cuelga, el cliente o persona '
      + 'involucrada y su estado — no le repitas el título. Si el objetivo está PAUSADO o ARCHIVADO, '
      + 'dilo PRIMERO: ese pendiente probablemente ya no aplica y avisarlo sin decirlo es hacerle ruido.',
    )
    lines.push('')
  }

  if (input.goals.length > 0) {
    // El norte (ancla) va primero y marcado: es la brújula del año, no un
    // objetivo más. Aterriza las respuestas ahí cuando aplique.
    const anchor = input.goals.find((g) => g.isAnchor)
    if (anchor) {
      lines.push('== TU NORTE (el ancla del año) ==')
      lines.push(`- ${anchor.title}${renderGoalProgress(anchor)}`)
      lines.push('')
    }
    lines.push('== OBJETIVOS ACTIVOS ==')
    for (const g of input.goals.slice(0, 20)) {
      if (g.isAnchor) continue // ya listado arriba como norte
      lines.push(`- ${g.title}${renderGoalProgress(g)}`)
    }
    lines.push('')
  }

  if (input.people.length === 0 && input.memories.length === 0 && input.goals.length === 0) {
    lines.push('(No se encontró data relacionada con la pregunta.)')
  }

  if (input.strengths && input.strengths.length > 0) {
    lines.push('== TUS PROPIAS PALABRAS DE FUERZA (para el espejo; citá estas cuando lo banques) ==')
    for (const sgth of input.strengths.slice(0, 6)) lines.push(`- "${sgth}"`)
    lines.push('')
  }

  lines.push('== PREGUNTA ==')
  lines.push(input.question)
  return lines.join('\n')
}

/** Un "recibo" del chat: una memoria REAL que alimentó la respuesta, con su
 *  persona y origen. La UI deriva la confianza con memoryProvenance. */
export interface SirReceipt {
  person: string
  text: string
  source: Memory['source']
}

/**
 * Arma los recibos del chat: las memorias reales inyectadas al contexto (con su
 * origen), para que Aaron VEA sobre qué se paró SIR y pueda verificar. NO las
 * genera el modelo → no se pueden alucinar (a diferencia de una cita inline que
 * el LLM podría inventar). Toma hasta `perPerson` por persona, dedupe por texto,
 * cap total. PURO.
 */
export function buildReceipts(
  people: { name: string; memories: { content: string; source?: Memory['source'] }[] }[],
  opts: { perPerson?: number; cap?: number } = {},
): SirReceipt[] {
  const perPerson = opts.perPerson ?? 3
  const cap = opts.cap ?? 6
  const out: SirReceipt[] = []
  const seen = new Set<string>()
  for (const p of people) {
    let n = 0
    for (const m of p.memories) {
      const text = (m.content ?? '').trim()
      if (!text) continue
      const key = text.toLowerCase().slice(0, 120)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ person: p.name, text: text.slice(0, 240), source: m.source })
      if (out.length >= cap) return out
      if (++n >= perPerson) break
    }
  }
  return out
}

/** Normaliza para match: minúsculas, sin tildes. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Devuelve los nombres conocidos mencionados en la pregunta (match por primer
 * nombre o nombre completo, insensible a tildes/mayúsculas). Acota a `max`.
 * Sirve para resolver de qué persona(s) habla la pregunta.
 */
export function extractCandidateNames(question: string, knownNames: readonly string[], max = 5): string[] {
  const q = norm(question)
  interface Hit { name: string; first: string; len: number; specific: boolean }
  const hits: Hit[] = []
  for (const full of knownNames) {
    if (!full) continue
    const tokens = norm(full).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const first = tokens[0]
    const nf = norm(full)
    const fullHit = nf.length >= 3 && q.includes(nf)
    const firstHit = first.length >= 3 && new RegExp(`\\b${first}\\b`).test(q)
    if (!fullHit && !firstHit) continue
    // "Específico": matcheó el nombre completo, o el primer nombre + al menos otro
    // token del nombre (ej. "Diana Díaz"). Distingue del match por primer nombre solo.
    const otherTokenHit = tokens.slice(1).some((t) => t.length >= 3 && new RegExp(`\\b${t}\\b`).test(q))
    const specific = fullHit || (firstHit && otherTokenHit)
    hits.push({ name: full, first, len: fullHit ? nf.length : first.length, specific })
  }
  // DOS DIANAS: si un primer nombre tiene un match ESPECÍFICO (nombre completo o
  // con apellido), suprimí los matches por-primer-nombre-solo de OTRAS personas
  // que comparten ese primer nombre — no las arrastres por la homonimia.
  const specificFirsts = new Set(hits.filter((h) => h.specific).map((h) => h.first))
  const filtered = hits.filter((h) => h.specific || !specificFirsts.has(h.first))
  // Específicos primero, luego más largos; dedupe por nombre.
  const seen = new Set<string>()
  return filtered
    .sort((a, b) => (Number(b.specific) - Number(a.specific)) || (b.len - a.len))
    .map((h) => h.name)
    .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
    .slice(0, max)
}


// ─── ESPEJO DE FUERZA (modo perspectiva) ────────────────────────────────────
const PERSPECTIVE_KW = [
  'como estoy', 'como me siento', 'me siento', 'no doy mas', 'no puedo mas',
  'no aguanto', 'estoy mal', 'estoy hecho', 'bajon', 'bajoneado', 'triste',
  'perdido', 'hundido', 'hundiendo', 'naufrag', 'me ahogo', 'ahogad',
  'perspectiva', 'animo', 'agotado', 'cansado', 'abrumado', 'colaps',
  'no se que hacer con mi vida', 'estoy quemado', 'quemandome', 'sin fuerzas',
  'me supera', 'todo junto', 'no puedo con',
]

/** ¿La consulta es sobre cómo está / pide perspectiva o ánimo? */
export function isPerspectiveQuery(question: string): boolean {
  const q = (question || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return PERSPECTIVE_KW.some((k) => q.includes(k))
}

const STRENGTH_KW = [
  'puedo con todo', 'siempre puedo', 'sali adelante', 'salir adelante',
  'lo volvere a hacer', 'lo volvi a hacer', 'campeon', 'gane', 'ganare',
  'logre', 'logr', 'consegui', 'orgullo', 'fuerte', 'fuerza', 'no me rindo',
  'no me rendi', 'resilien', 'voluntad', 'soy capaz', 'capaz de', 'determinaci',
  'esfuerzo', 'levantarme', 'me levante', 'supere', 'superar', 'puse de pie',
]

/** Selecciona memorias que reflejan FORTALEZA del usuario (sus propias palabras
 *  de cuando estuvo entero). Filtra por léxico de fuerza; más recientes primero.
 *  PURO. */
export function selectStrengthMemories(
  memories: { content: string; occurredAt?: string | null }[],
  limit = 5,
): string[] {
  const seen = new Set<string>()
  const out: { content: string; at: string }[] = []
  for (const m of memories) {
    const c = (m.content || '').trim()
    if (!c) continue
    const norm = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (!STRENGTH_KW.some((k) => norm.includes(k))) continue
    const key = norm.slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ content: c.slice(0, 240), at: m.occurredAt ?? '' })
  }
  out.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  return out.slice(0, limit).map((x) => x.content)
}

// ─── DETECCIÓN DE INTENCIÓN (gating de bloques nuevos) ───────────────────────
// Normaliza (minúsculas, sin tildes) y busca cualquier keyword como substring.
// Las keywords se eligen distintivas (evitamos 2-letras ambiguas como "fc").
function matchesAny(question: string, keywords: readonly string[]): boolean {
  const q = (question || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return keywords.some((k) => q.includes(k))
}

const HEALTH_KW = [
  'salud', 'como dormi', 'dormi', 'sueno', 'descans', 'peso', 'bascula',
  'composicion corporal', 'vfc', 'hrv', 'spo2', 'saturacion', 'oxigeno',
  'energia', 'cansad', 'agotad', 'pulso', 'cardiac', 'frecuencia cardi',
  'ritmo cardi', 'despertares', 'grasa corporal', 'masa muscular',
] as const
/** ¿La pregunta es sobre salud/sueño/peso/FC/VFC/SpO₂? */
export function isHealthQuery(question: string): boolean {
  return matchesAny(question, HEALTH_KW)
}

// ─── EXÁMENES MÉDICOS ────────────────────────────────────────────────────────
//
// Gate propio y no una extensión de HEALTH_KW porque son preguntas distintas:
// "¿cómo dormí?" mira el wearable, "¿qué dijo mi tomografía?" mira `health_exams`.
// Sin este gate SIR no podía contestar por sus exámenes ni queriendo.
const EXAM_KW = [
  'examen', 'examenes', 'exámenes', 'chequeo', 'chequeos', 'analisis', 'análisis',
  'laboratorio', 'resultado', 'resultados', 'informe', 'tomografia', 'tomografía',
  'radiografia', 'radiografía', 'ecografia', 'ecografía', 'resonancia', 'placa',
  'hemograma', 'perfil lipidico', 'perfil lipídico', 'colesterol', 'triglicerid',
  'hemoglobina', 'hematocrito', 'glucosa', 'transaminasa', 'higado', 'hígado',
  'ferritina', 'creatinina', 'orina', 'biopsia', 'radiologo', 'radiólogo',
  'diagnostico', 'diagnóstico', 'hallazgo', 'hallazgos', 'cie10', 'cie-10',
] as const
/** ¿La pregunta es sobre sus exámenes médicos / resultados / informes? */
export function isExamQuery(question: string): boolean {
  return matchesAny(question, EXAM_KW)
}

export interface ExamForBlock {
  examDate: string
  provider: string | null
  title: string
  summary: string | null
  findings: Array<{ code: string; label: string }>
  values: Array<{ name: string; value: string; unit?: string; range?: string; flag: 'high' | 'low' | 'normal' }>
  recommendations: string[]
}

/** Cuántos exámenes entran al prompt (los más recientes). */
const EXAMS_EN_PROMPT = 4
/** Tope del resumen por examen. Un informe entero se come el contexto. */
const RESUMEN_MAX = 900

/**
 * Bloque "== HISTORIAL DE EXÁMENES ==". '' si no hay. PURO.
 *
 * ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
 *
 * `health_exams` guardaba `summary`, `findings` (CIE-10) y `recommendations` desde
 * la mig 0149 y **NADIE los leía**: ni el brief ni SIR. Lo único que se consumía
 * eran los patrones derivados de `values` NUMÉRICOS, y en el brief solo los lunes.
 *
 * Medido el 31-jul-2026: la tomografía de emergencia del 27-jul entró con 5
 * hallazgos y 11 recomendaciones —incluida la bandera roja del hematoma septal, que
 * tiene ventana de DÍAS— y SIR no podía mencionar ninguna ni preguntándoselo
 * directo. El historial médico era un archivador. Aaron: *"podríamos sacar
 * información valiosa para entender mi cuerpo en el largo plazo"*.
 *
 * Prioriza los valores FUERA de rango y las recomendaciones, que es lo accionable;
 * los valores en rango no van (son cientos y no aportan al prompt).
 */
export function renderExamsBlock(exams: ExamForBlock[]): string {
  const validos = (exams ?? []).filter((e) => e?.examDate && e?.title)
  if (validos.length === 0) return ''
  // Más recientes primero: son los que importan para una pregunta de hoy.
  const orden = validos.slice().sort((a, b) => b.examDate.localeCompare(a.examDate))
  const muestra = orden.slice(0, EXAMS_EN_PROMPT)

  const lines: string[] = [
    `== HISTORIAL DE EXÁMENES (${validos.length} cargados; se muestran los ${muestra.length} más recientes) ==`,
    'REGLAS: son datos de SUS informes médicos, puedes citarlos y resumirlos. NUNCA los conviertas en diagnóstico ni en pronóstico: son para que los lleve a su médico. Si te pregunta por un examen que NO está acá, di que no lo tienes cargado — no lo inventes ni lo deduzcas de otro.',
  ]
  for (const e of muestra) {
    lines.push(`\n- ${e.examDate} · ${e.provider ?? 'sin proveedor'} · ${e.title}`)
    if (e.summary) lines.push(`  resumen: ${e.summary.slice(0, RESUMEN_MAX)}`)
    const fuera = (e.values ?? []).filter((v) => v.flag === 'high' || v.flag === 'low')
    if (fuera.length > 0) {
      lines.push(`  fuera de rango (${fuera.length}): ` + fuera.slice(0, 12)
        .map((v) => `${v.name} ${v.value}${v.unit ?? ''}${v.range ? ` [ref ${v.range}]` : ''} ${v.flag}`).join(' · '))
    }
    const hall = (e.findings ?? []).filter((f) => f?.label)
    if (hall.length > 0) {
      lines.push(`  hallazgos (${hall.length}): ` + hall.slice(0, 8).map((f) => `[${f.code || '—'}] ${f.label}`).join(' · '))
    }
    const recs = (e.recommendations ?? []).filter((r) => typeof r === 'string' && r.trim())
    if (recs.length > 0) {
      lines.push(`  recomendaciones (${recs.length}):`)
      for (const r of recs.slice(0, 12)) lines.push(`    · ${r.slice(0, 400)}`)
    }
  }
  return lines.join('\n')
}

const REMINDER_KW = [
  'recordatorio', 'recuerdame', 'recuerda me', 'recordar', 'me recuerdas',
  'pendiente', 'pendientes', 'agenda', 'agendado', 'por hacer', 'que tengo que hacer',
  'que debo hacer', 'me falta hacer', 'tengo que hacer', 'tareas pendientes',
] as const
/** ¿La pregunta es sobre recordatorios/pendientes/agenda? */
export function isReminderQuery(question: string): boolean {
  return matchesAny(question, REMINDER_KW)
}

const DEAL_KW = [
  'deal', 'deals', 'oportunidad', 'oportunidades', 'pipeline', 'venta', 'ventas',
  'vender', 'cliente', 'clientes', 'negocio', 'negocios', 'licitacion',
  'propuesta comercial', 'cotizacion', 'cierre', 'prospecto', 'prospectos',
] as const
/** ¿La pregunta es sobre deals/oportunidades/pipeline/venta/cliente? */
export function isDealQuery(question: string): boolean {
  return matchesAny(question, DEAL_KW)
}

const TENSION_KW = [
  'tension', 'tenso', 'tensa', 'distante', 'distanciad', 'alejad', 'enfriad',
  'frio con', 'fria con', 'mal con', 'pelead', 'conflicto', 'alerta de relacion',
  'relacion tensa', 'quien esta mal', 'como estan mis', 'vinculos tensos',
] as const
/** ¿La pregunta es sobre tensión/distancia relacional? */
export function isTensionQuery(question: string): boolean {
  return matchesAny(question, TENSION_KW)
}

const CIRCLE_CYCLE_KW = [
  'mujeres de mi circulo', 'mujeres del circulo', 'las mujeres de mi',
  'semana con las mujeres', 'semana de las mujeres', 'mujeres del entorno',
  'quien esta sensible', 'quienes estan sensibles', 'quien anda sensible',
  'como viene el ciclo', 'como vienen los ciclos', 'los ciclos de',
  'carga afectiva', 'semana cargada', 'ventana sensible', 'ventanas sensibles',
  'quien esta en su regla', 'quien esta premenstrual', 'quien tiene la regla',
  'sensibilidad del circulo', 'como viene la semana',
] as const
/** ¿La pregunta es sobre la semana/el ciclo del círculo (quién está sensible)? */
export function isCircleCycleQuery(question: string): boolean {
  return matchesAny(question, CIRCLE_CYCLE_KW)
}

const AFFECTION_KW = [
  'clima afectivo', 'afecto', 'afectiv', 'carino', 'carinos',
  'mas seco', 'mas seca', 'mas secos', 'mas frio', 'mas fria', 'mas frios',
  'como venimos con', 'como vamos con', 'que tan carinos', 'positividad',
  'nos queremos', 'expresa afecto', 'me demuestra', 'ratio de positividad',
] as const
/** ¿La pregunta es sobre el clima afectivo/cariño (IAE) con alguien? */
export function isAffectionClimateQuery(question: string): boolean {
  return matchesAny(question, AFFECTION_KW)
}

const AGENDA_KW = [
  'agenda', 'agendado', 'que tengo', 'proximos dias', 'proxima semana',
  'mis planes', 'que planes', 'mis eventos', 'cuando es', 'calendario',
  'que hay el', 'este sabado', 'el sabado', 'el domingo', 'el lunes',
  'el martes', 'el miercoles', 'el jueves', 'el viernes', 'este finde',
  'fin de semana', 'que viene esta semana',
] as const
/** ¿La pregunta es sobre la agenda/eventos próximos (calendario)? */
export function isAgendaQuery(question: string): boolean {
  return matchesAny(question, AGENDA_KW)
}

// ─── SEMANA / CICLO DEL CÍRCULO ──────────────────────────────────────────────
/** Bloque "== SEMANA / CICLO DEL CÍRCULO ==". '' si no hay ventana. La `line`
 *  la produce buildCycleWeekAheadLine (tono de cuidado ya incorporado). */
export function renderCircleCycleBlock(line: string | null | undefined): string {
  if (!line) return ''
  return `== SEMANA / CICLO DEL CÍRCULO (anticipación de CUIDADO — tendencia, NO veredicto; JAMÁS para descalificar ni "gestionar" a nadie) ==\n${line}`
}

// ─── CLIMA AFECTIVO (Índice de Afecto Expresado) ─────────────────────────────
export interface AffectionClimateEntry {
  name: string
  /** Frase de cuidado ya redactada (describeAffection). */
  description: string
}
/** Bloque "== CLIMA AFECTIVO ==". '' si no hay entradas con dato. */
export function renderAffectionClimateBlock(entries: AffectionClimateEntry[]): string {
  const valid = entries.filter((e) => e.name && e.description)
  if (valid.length === 0) return ''
  const lines: string[] = [
    '== CLIMA AFECTIVO (Índice de Afecto Expresado en los chats — DISPARADOR de conversación, NO veredicto; afecto EXPRESADO ≠ afecto SENTIDO, tono de cuidado) ==',
  ]
  for (const e of valid) lines.push(`- ${e.name}: ${e.description}`)
  return lines.join('\n')
}

// ─── AGENDA / EVENTOS PRÓXIMOS ───────────────────────────────────────────────
export interface AgendaItem {
  /** YYYY-MM-DD. */
  date: string
  title: string
  /** Persona ligada al plan (si aplica). */
  personName?: string | null
  /** Origen: "plan" (personal_events) o el label del calendario. */
  sourceLabel?: string | null
}
/** Bloque "== AGENDA / EVENTOS PRÓXIMOS ==". '' si no hay. `today` = YYYY-MM-DD. */
export function renderAgendaBlock(items: AgendaItem[], today: string): string {
  if (items.length === 0) return ''
  const lines: string[] = [
    '== AGENDA / EVENTOS PRÓXIMOS (los tienes; puedes listarlos — NO niegues que ves tu agenda) ==',
  ]
  for (const it of items.slice(0, 30)) {
    const day = (it.date || '').slice(0, 10)
    const rel = day ? ` (${relativeDueLabel(day, today)})` : ''
    const who = it.personName ? ` · con ${it.personName}` : ''
    const src = it.sourceLabel ? ` [${it.sourceLabel}]` : ''
    lines.push(`- ${day}${rel}: ${it.title}${who}${src}`)
  }
  return lines.join('\n')
}

// ─── SALUD RECIENTE (valores reales) ─────────────────────────────────────────
/** Etiquetas legibles + orden de display para las métricas de health_metrics que
 *  surfaceamos (peso, FC/VFC/SpO₂ del día y del sueño). El resto no se muestra. */
const HEALTH_METRIC_LABELS: Array<{ type: string; label: string }> = [
  { type: 'weight', label: 'Peso' },
  { type: 'heart_rate_min', label: 'FC mínima' },
  { type: 'heart_rate_max', label: 'FC máxima' },
  { type: 'sleeping_heart_rate', label: 'FC en reposo (sueño)' },
  { type: 'hrv_avg', label: 'VFC promedio (HRV)' },
  { type: 'hrv_min', label: 'VFC mínima' },
  { type: 'hrv_max', label: 'VFC máxima' },
  { type: 'blood_oxygen', label: 'SpO₂' },
  { type: 'respiratory_rate', label: 'Frec. respiratoria' },
]

export interface HealthMetricReading {
  type: string
  value: number
  unit?: string | null
  measuredAt: string
}
export interface SleepReading {
  date: string
  duration: number
  quality?: number | null
  score?: number | null
  awakenings?: number | null
}
export interface HealthSnapshot {
  sleep: SleepReading | null
  metrics: Array<{ label: string; value: number; unit: string; day: string }>
}

/** Duración en horas decimales → "7h15" / "8h" (formato humano). */
function fmtSleepDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/**
 * Selecciona las últimas lecturas de salud para el prompt: la última noche de
 * sueño + la lectura más reciente de cada métrica curada (peso, FC/VFC/SpO₂).
 * PURO. Asume que las filas de métricas vienen ordenadas por fecha DESC (toma la
 * primera coincidencia de cada tipo); las de sueño, la más reciente. */
export function selectRecentHealth(
  metricRows: HealthMetricReading[],
  sleepRows: SleepReading[],
): HealthSnapshot {
  const sleep = sleepRows.length > 0
    ? [...sleepRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
    : null

  const sortedMetrics = [...metricRows].sort((a, b) => (b.measuredAt || '').localeCompare(a.measuredAt || ''))
  const metrics: HealthSnapshot['metrics'] = []
  for (const { type, label } of HEALTH_METRIC_LABELS) {
    const hit = sortedMetrics.find((r) => r.type === type && Number.isFinite(Number(r.value)))
    if (!hit) continue
    metrics.push({
      label,
      value: Number(hit.value),
      unit: (hit.unit ?? '').trim(),
      day: (hit.measuredAt || '').slice(0, 10),
    })
  }
  return { sleep, metrics }
}

/** Bloque "== SALUD RECIENTE ==" con valores reales. '' si no hay data. */
export function renderHealthBlock(snap: HealthSnapshot): string {
  if (!snap.sleep && snap.metrics.length === 0) return ''
  const lines: string[] = ['== SALUD RECIENTE (valores reales; cítalos, no digas que no tienes salud) ==']
  if (snap.sleep) {
    const s = snap.sleep
    const parts = [`duró ${fmtSleepDuration(s.duration)}`]
    if (typeof s.score === 'number') parts.push(`score ${s.score}/100`)
    else if (typeof s.quality === 'number') parts.push(`calidad ${s.quality}/10`)
    if (typeof s.awakenings === 'number') parts.push(`${s.awakenings} despertar${s.awakenings === 1 ? '' : 'es'}`)
    lines.push(`- Sueño (${s.date}): ${parts.join(' · ')}`)
  }
  for (const m of snap.metrics) {
    const unit = m.unit ? ` ${m.unit}` : ''
    lines.push(`- ${m.label}: ${m.value}${unit} (${m.day})`)
  }
  return lines.join('\n')
}

// ─── RECORDATORIOS PENDIENTES ────────────────────────────────────────────────
export interface ReminderRow {
  text: string
  dueAt: string
  personName?: string | null
}
/** Bloque "== RECORDATORIOS PENDIENTES ==". '' si no hay. `today` = YYYY-MM-DD. */
export function renderRemindersBlock(reminders: ReminderRow[], today: string): string {
  if (reminders.length === 0) return ''
  const lines: string[] = ['== RECORDATORIOS PENDIENTES (los tienes agendados; puedes listarlos) ==']
  for (const r of reminders.slice(0, 15)) {
    const day = (r.dueAt || '').slice(0, 10)
    const rel = day ? ` (${relativeDueLabel(day, today)})` : ''
    const who = r.personName ? ` · ${r.personName}` : ''
    lines.push(`- ${r.text}${who} — vence ${day}${rel}`)
  }
  return lines.join('\n')
}

/** Etiqueta relativa de vencimiento entre dos YYYY-MM-DD ("hoy"/"vencido…"/"en N días"). */
function relativeDueLabel(day: string, today: string): string {
  const [ay, am, ad] = day.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (![ay, am, ad, ty, tm, td].every(Number.isFinite)) return day
  const diff = Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(ty, tm - 1, td)) / 86_400_000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff < 0) return `vencido hace ${Math.abs(diff)} día${diff === -1 ? '' : 's'}`
  return `en ${diff} días`
}

// ─── OPORTUNIDADES / DEALS ───────────────────────────────────────────────────
export interface DealRow {
  title: string
  stage?: string | null
  amount?: number | null
  currency?: string | null
  nextAction?: string | null
  nextActionDate?: string | null
  closeWindow?: string | null
  contactName?: string | null
}
/** Bloque "== OPORTUNIDADES ==" con deals abiertos. '' si no hay. */
export function renderDealsBlock(deals: DealRow[]): string {
  if (deals.length === 0) return ''
  const lines: string[] = ['== OPORTUNIDADES ABIERTAS (pipeline comercial; puedes listarlas) ==']
  for (const d of deals.slice(0, 15)) {
    const bits: string[] = []
    if (d.stage) bits.push(`etapa ${d.stage}`)
    if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
      bits.push(`${d.currency ?? ''} ${d.amount}`.trim())
    }
    if (d.contactName) bits.push(`contacto ${d.contactName}`)
    if (d.nextAction) {
      const when = d.nextActionDate ? ` (${d.nextActionDate.slice(0, 10)})` : ''
      bits.push(`próxima acción: ${d.nextAction}${when}`)
    } else if (d.closeWindow) {
      bits.push(`cierre: ${d.closeWindow}`)
    }
    lines.push(`- ${d.title}${bits.length ? ' · ' + bits.join(' · ') : ''}`)
  }
  return lines.join('\n')
}

// ─── ALERTAS DE TENSIÓN RELACIONAL ───────────────────────────────────────────
export interface TensionAlertRow {
  personName?: string | null
  fromLabel?: string | null
  toLabel?: string | null
  message: string
  createdAt?: string | null
}
/** Bloque "== ALERTAS DE TENSIÓN ==". '' si no hay. */
export function renderTensionAlertsBlock(alerts: TensionAlertRow[]): string {
  if (alerts.length === 0) return ''
  const lines: string[] = ['== ALERTAS DE TENSIÓN RELACIONAL (vínculos que se enfriaron o tensaron) ==']
  for (const a of alerts.slice(0, 12)) {
    const who = a.personName ? `${a.personName}: ` : ''
    const when = a.createdAt ? ` (${a.createdAt.slice(0, 10)})` : ''
    lines.push(`- ${who}${a.message}${when}`)
  }
  return lines.join('\n')
}
