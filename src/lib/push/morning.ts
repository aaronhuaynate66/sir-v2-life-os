// SIR V2 — Composición del push diario de la mañana (PURO).
//
// Filtro rector: UN solo push CALMO, no un volcado. La notificación es un
// empujón breve; el detalle vive en /panel (el briefing diario con IA). Por eso
// acá elegimos a lo sumo unas pocas señales y las decimos corto. Si no hay nada
// urgente, un mensaje amable que NO presiona.

export interface MorningBirthday {
  name: string
  /** Días hasta el cumple (0 = hoy). */
  days: number
}

export interface MorningInput {
  /** Cumpleaños próximos (≤ unos días), ya filtrados y ordenados por cercanía. */
  birthdays?: MorningBirthday[]
  /** Fechas especiales próximas (aniversarios, mensario…) ya formateadas y
   *  ordenadas por cercanía. Ej. "Aniversario mensual relación (13) · ¡Hoy!". */
  importantDates?: string[]
  /**
   * "Esto se te viene": los `personal_events` de los próximos 7 días. Faltaba el
   * slot entero — la tabla se leía solo por el cruce del ciclo, así que la boda de
   * Laura del sábado no aparecía. Ver `lib/push/eventosProximos.ts`.
   */
  eventosProximos?: string
  /** A quién cuidar hoy: el vínculo más urgente de "Reconectar" (persona +
   *  razón, ya formado). SIR sabe a quién estás descuidando; esto lo dice sin
   *  que abras la app. Texto corto ya armado. */
  relationshipNudge?: string
  /** Cruce chat → tema abierto: un "momento/decisión" abierto que el chat
   *  reciente ya parece haber resuelto (el cron `moment-scan` lo precomputa).
   *  SIR sugiere cerrarlo; no cierra solo. Texto ya formado. */
  momentResolution?: string
  /** SEMANA CON CARGA AFECTIVA (anticipación de cuidado): ventanas sensibles del
   *  ciclo (premenstrual/menstrual) de las mujeres del círculo que intersecan la
   *  semana, con sincronía si coinciden. Tono de CUIDADO, marca estimación —
   *  NUNCA descalifica ni "gestiona" (doc 17). Texto ya formado
   *  (ver lib/ciclo/weekAhead). */
  cycleWeekAhead?: string
  /** Un PLAN AGENDADO que cae dentro de la ventana sensible de esa persona
   *  (ver lib/ciclo/agendaCross). Más accionable que la línea general de la
   *  semana: habla de algo concreto que ya está en el calendario. */
  cycleAgenda?: string
  /** Buen momento para AVANZAR un objetivo con una persona: alguien ligado a un
   *  objetivo activo (con acción pendiente) muestra buen timing hoy (historia
   *  activa). El loop original del reader (Dayana/Marlab). Texto ya formado
   *  (ver lib/goals/timingNudge). */
  goalContactTiming?: string
  /** Títulos de tareas que vencen hoy (no hechas). */
  dueTasks?: string[]
  /** El foco del día (ancla del año o próximo paso de un objetivo clave). */
  focus?: string
  /** Nudge de OBJETIVO que necesita atención (norte estancado / meta en riesgo).
   *  Accionable; tiene prioridad sobre el `focus` genérico (que solo nombra el
   *  ancla). Texto ya formado (ver lib/push/goalNudge). */
  goalNudge?: string
  /** Una señal que merece atención hoy (texto corto). */
  topSignal?: string
  /** Nudge de hábito (ej. racha rota que vale recuperar). Texto ya formado. */
  habitNudge?: string
  /** Señal del cuerpo (ej. deuda de sueño). Texto ya formado. */
  bodySignal?: string
  /** Objetivo con targetDate cercano (≤7d). Texto ya formado ("Mudanza EN 3 DIAS"). */
  weekFocus?: string
  /** Alerta de metrica dura (peso Mundial fuera de categoria, etc.). Texto ya formado. */
  metricAlert?: string
  /** Vigilancia de laboratorio: patrón de chequeos consistente que ya salió de
   *  rango (idea de Aaron: no dejarlo "al baúl"). NO es agudo → prioridad baja y
   *  el cron lo manda throttled (semanal). Texto ya formado. */
  healthWatch?: string
  /** Adherencia al plan de entrenamiento de la semana (ver lib/entrenamiento).
   *  Un plan que no se mide es una intención. Texto ya formado. */
  trainingAdherence?: string
  /** Oportunidad comercial o enfriamiento detectado en las conversaciones y ya
   *  confirmado por el juez (ver lib/opportunities + cron/opportunities). Texto
   *  ya formado, con la cita textual adentro para que sea verificable. */
  opportunity?: string
  /** Un canal del reader se quedó mudo (ver lib/reader/channelSilence). Va ARRIBA
   *  porque cambia cómo hay que leer todo lo demás: si WhatsApp está caído, la
   *  ausencia de señales relacionales no significa que no pasó nada. */
  readerSilence?: string
  /**
   * TENDENCIA cardíaca. Solo el canal 'manana' de `cardioSurface` llega acá: lo
   * urgente ya se mandó solo, en el momento en que entró la medición, y no pasa
   * por el brief. Ver `lib/health/cardioSurface.ts`.
   */
  cardioTrend?: string
  /** Nota del gate de energía: por qué hoy se pospuso lo que pide combustible
   *  emocional (ver lib/brief/energyGate). Va PRIMERA — es el marco con el que
   *  hay que leer el resto del brief. */
  energyNote?: string
  /** Ids de las entidades detrás de las señales (habilitan los botones del hilo). */
  entities?: MorningEntities
  /** Temas ya silenciados por Aaron (botón 🔕). Se filtran ANTES de armar el
   *  brief: no vuelven a aparecer hasta que él los reactive. Ver `topicKey`. */
  mutedTopics?: string[]
}

/** Sección del brief conversacional (Telegram). El chat manda UN mensaje por
 *  sección en vez de un párrafo con todo pegado: cada tema queda respondible
 *  por separado (decisión de Aaron 2026-07-25 — "así todo junto no me ayuda"). */
export type BriefSection = 'hoy' | 'gente' | 'metas'

/** Una señal del brief con su procedencia. Antes eran strings anónimos que se
 *  fundían con `join(' · ')`: ahí se perdía de qué slot venía, a qué tema
 *  apuntaba y qué acción admitía — por eso el mensaje no se podía trocear ni
 *  accionar. */
export interface MorningSignal {
  /** Slot de origen (dueTasks, relationshipNudge, goalNudge…). */
  slot: string
  section: BriefSection
  text: string
  /** Entidad concreta detrás de la señal, cuando el caller la conoce. Es lo que
   *  habilita los botones del hilo ("✅ Ya lo hice" necesita el id de la tarea).
   *  Sin ella la señal se muestra igual, solo que sin acción. */
  entity?: { kind: 'task' | 'person' | 'moment' | 'goal' | 'opportunity'; id: string; name?: string }
}

/** Ids de las entidades detrás de las señales. Opcionales: el brief funciona
 *  igual sin ellos (solo que sin botones). */
export interface MorningEntities {
  dueTask?: { id: string; name?: string }
  relationshipPerson?: { id: string; name?: string }
  moment?: { id: string; name?: string }
  goalNudgeGoal?: { id: string; name?: string }
  weekFocusGoal?: { id: string; name?: string }
  /** Señal de `opportunity_signals` detrás del slot `opportunity` → habilita los
   *  botones "registrar como oportunidad" / "no es negocio". */
  opportunity?: { id: string; name?: string }
}

export interface MorningPush {
  title: string
  /** Cuerpo para la NOTIFICACIÓN del navegador: las TOP MAX_PARTS_WEB señales,
   *  capado a MAX_BODY chars (un push calmo, no un volcado; el OS lo trunca
   *  visualmente de todas formas). */
  body: string
  /** Cuerpo para el CHAT (Telegram, límite 4096): hasta MAX_PARTS_FULL señales,
   *  sin cortar a mitad de línea. El coach computa ~14 señales; el push del
   *  navegador se queda calmo en pocas, pero en el chat se aprovechan más de las
   *  que igual ya se calcularon (decisión de Aaron 2026-07-23). */
  bodyFull: string
  /** Las mismas señales de `bodyFull`, tipadas y ya deduplicadas. Es lo que usa
   *  el hilo de Telegram (ver lib/telegram/briefThread). */
  signals: MorningSignal[]
}

/** Notificación del navegador: pocas, calmas. */
const MAX_PARTS_WEB = 3
/** Chat (Telegram): más señales, sin volcar TODO (el detalle vive en /panel). */
const MAX_PARTS_FULL = 8
const MAX_BODY = 220

// Palabras que no identifican un TEMA (aparecen en cualquier señal) — se
// ignoran al comparar si dos señales hablan de lo mismo.
const TOPIC_STOP = new Set([
  'para', 'como', 'con', 'que', 'del', 'las', 'los', 'una', 'unos', 'unas',
  'por', 'sin', 'sobre', 'este', 'esta', 'hoy', 'dias', 'dia', 'vence', 'hace',
  'ya', 'mas', 'menos', 'tu', 'tus', 'mi', 'mis', 'el', 'la', 'de', 'en', 'y',
  'conviene', 'parece', 'sigue', 'esta', 'estan', 'vas', 'semana', 'semanas',
])

/** Tokens que identifican el TEMA de una señal (sin tildes, sin ruido). PURO. */
export function topicTokens(text: string): Set<string> {
  const words = (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TOPIC_STOP.has(w))
  return new Set(words)
}

/** Solape de temas entre dos textos: |A∩B| / |el más chico|. PURO. */
export function topicOverlap(a: string, b: string): number {
  const ta = topicTokens(a); const tb = topicTokens(b)
  const min = Math.min(ta.size, tb.size)
  if (min === 0) return 0
  let hits = 0
  for (const t of ta) if (tb.has(t)) hits++
  return hits / min
}

/**
 * Clave ESTABLE del tema de una señal — los tokens significativos ordenados.
 * Estable = sobrevive a que el builder reformule ("hace 3 semanas" → "hace 4"),
 * porque los números y las palabras de relleno no entran. Es lo que se guarda al
 * silenciar (🔕): si la clave dependiera del texto exacto, habría que callar lo
 * mismo cada semana. PURA.
 */
export function topicKey(text: string): string {
  return [...topicTokens(text)]
    .filter((t) => !/^\d+$/.test(t))
    .sort()
    .join('-')
    .slice(0, 120)
}

/** Slots cuya señal es un RESUMEN AGREGADO: hay una sola por día y su texto
 *  cambia solo porque cambia el grupo que resume. Su identidad es el slot, no
 *  las palabras. */
const AGGREGATE_SLOTS = new Set([
  'cycleWeekAhead',      // "coinciden Diana, Aeylin, Nicolle…" — la lista varía a diario
  'metricAlert', 'bodySignal', 'healthWatch',
  'cardioTrend',         // hay una sola por día y su texto lleva los valores del día
  'eventosProximos',     // "la boda es el sábado" cambia de texto cada día que pasa
  'trainingAdherence',   // "2 de 3 de fuerza" cambia con cada sesión
  'energyNote',
])

/**
 * Identidad de una señal PARA EL SILENCIO. PURA.
 *
 * `topicKey(texto)` sola no alcanza: la señal de carga afectiva incluye los
 * nombres de quienes están en ventana, esa lista cambia cada día, y con ella
 * cambiaba la clave → la racha se reiniciaba sola y el auto-snooze NUNCA se
 * disparaba justo en la señal más repetitiva (verificado el 26-jul).
 *
 * Para esos resúmenes la identidad es el SLOT. Para el resto, slot + tema, que
 * mantiene separadas dos señales del mismo tipo sobre personas distintas.
 */
export function signalTopicKey(slot: string, text: string): string {
  return AGGREGATE_SLOTS.has(slot) ? `slot:${slot}` : `${slot}|${topicKey(text)}`
}

/** Umbral de "es el mismo tema". Alto a propósito: preferimos repetir antes que
 *  tragarnos una señal distinta que solo comparte el nombre de una persona (dos
 *  señales sobre la mamá de Aaron —"3 semanas sin hablar" y "el conflicto parece
 *  resuelto"— dan 0.67 y deben sobrevivir las dos). */
const SAME_TOPIC = 0.8

/**
 * Quita señales que dicen LO MISMO con otras palabras. Se conserva la posición
 * de la primera (la prioridad manda) pero el TEXTO de la más informativa —la
 * variante larga suele traer el porqué ("y vas 0% — conviene un empujón"). PURO.
 */
export function dedupeSignals(signals: MorningSignal[]): MorningSignal[] {
  const out: MorningSignal[] = []
  for (const s of signals) {
    const dup = out.findIndex((o) => topicOverlap(o.text, s.text) >= SAME_TOPIC)
    if (dup === -1) { out.push(s); continue }
    if (s.text.length > out[dup].text.length) out[dup] = { ...out[dup], text: s.text }
    // Si la que se queda no traía entidad y la descartada sí, hereda la entidad:
    // si no, deduplicar MATA el botón (pasó de verdad — "Boticas Jhodaal" se
    // quedó con la versión weekFocus sin id y perdió "🚀 Dame el próximo paso").
    if (!out[dup].entity && s.entity) out[dup] = { ...out[dup], entity: s.entity }
  }
  return out
}

function birthdayPhrase(b: MorningBirthday): string {
  const when = b.days === 0 ? 'cumple hoy' : b.days === 1 ? 'cumple mañana' : `cumple en ${b.days} días`
  return `${b.name} ${when}`
}

/** Arma el push de la mañana. Siempre devuelve algo (mensaje amable si no hay
 *  nada urgente) — el usuario eligió recibirlo a diario.
 *
 *  El ORDEN de acumulación = prioridad. `body` toma las top MAX_PARTS_WEB;
 *  `bodyFull` (chat) toma hasta MAX_PARTS_FULL. */
export function buildMorningPush(input: MorningInput): MorningPush {
  const collected: MorningSignal[] = []
  const ent = input.entities ?? {}
  const add = (
    s: string | undefined | null,
    slot: string,
    section: BriefSection,
    entity?: MorningSignal['entity'],
  ) => {
    if (s) collected.push({ slot, section, text: s, ...(entity ? { entity } : {}) })
  }

  // 0--. UN CANAL DEL READER ESTÁ MUDO. Va antes que TODO porque cambia cómo hay
  //      que leer el resto del brief: con WhatsApp caído, "no hay señales de tu
  //      gente" no significa que no pasó nada — significa que SIR no está viendo.
  //      Nació de los 7 días ciegos del 22→29 jul.
  add(input.readerSilence, 'readerSilence', 'hoy')

  // 0-. CÓMO VIENE EL CUERPO. Va primero porque enmarca todo lo demás: si hoy se
  //     pospuso algo por falta de combustible, hay que decirlo ANTES de la lista.
  add(input.energyNote, 'energyNote', 'hoy')

  // 0. SEMANA EN FOCO (mudanza / hitos ≤7d) y 0.5 MÉTRICA DURA fuera de rango:
  //    lo urgente/time-sensitive del día, al frente.
  add(input.weekFocus, 'weekFocus', 'metas', ent.weekFocusGoal ? { kind: 'goal', ...ent.weekFocusGoal } : undefined)
  add(input.metricAlert, 'metricAlert', 'hoy')
  // 0.6 TENDENCIA CARDÍACA. Va en 'hoy' y cerca del tope porque es del cuerpo,
  //     pero NO interrumpe: lo que apremia se manda solo al entrar la medición.
  //     Acá llega lo que no se pierde nada esperando a la mañana.
  add(input.cardioTrend, 'cardioTrend', 'hoy')
  // 0.7 LO QUE SE VIENE. Va temprano y en 'hoy' porque es lo único del brief que
  //     puede requerir PREPARARSE (un regalo, ropa, mover la agenda). El hueco lo
  //     encontró Aaron: su boda de Laura del sábado estaba cargada y no aparecía en
  //     ningún lado, porque `personal_events` solo se leía por el cruce del ciclo.
  add(input.eventosProximos, 'eventosProximos', 'hoy')

  // 1. Aniversarios/fechas especiales: un aniversario HOY es time-critical (no se
  //    puede celebrar tarde) → se mantiene sobre lo relacional-no-urgente.
  for (const d of (input.importantDates ?? []).slice(0, 2)) add(d, 'importantDate', 'gente')

  // 1.5 EL CORAZÓN RELACIONAL, subido de prioridad (decisión de Aaron 2026-07-23):
  //     "a quién cuidar hoy" + "cerrar un lazo" + "buen momento × objetivo" ahora
  //     van ANTES que los cumpleaños (un cumple en N días no debe tapar el cuidado
  //     de un vínculo que se enfría hoy) → casi siempre entran al push.
  add(input.relationshipNudge, 'relationshipNudge', 'gente', ent.relationshipPerson ? { kind: 'person', ...ent.relationshipPerson } : undefined)
  add(input.momentResolution, 'momentResolution', 'gente', ent.moment ? { kind: 'moment', ...ent.moment } : undefined)
  add(input.goalContactTiming, 'goalContactTiming', 'gente')
  // Anticipación de cuidado: semana con carga afectiva (ventanas sensibles del
  // ciclo). Va con lo relacional; es un nudge de CUIDADO, no una tarea.
  // Un plan concreto en ventana sensible va ANTES que la línea general de la
  // semana: es accionable hoy (mover, dar margen), no solo anticipación.
  add(input.cycleAgenda, 'cycleAgenda', 'gente')
  add(input.cycleWeekAhead, 'cycleWeekAhead', 'gente')

  // 1.8 Cumpleaños próximos (después de lo relacional urgente).
  for (const b of (input.birthdays ?? []).slice(0, 2)) add(birthdayPhrase(b), 'birthday', 'gente')

  // 2. Tareas que vencen hoy.
  const due = input.dueTasks ?? []
  // Con UNA sola tarea sabemos exactamente cuál es → la señal lleva su id y el
  // hilo puede ofrecer "✅ Ya lo hice". Con varias, el botón sería ambiguo.
  if (due.length === 1) add(`Hoy vence: ${due[0]}`, 'dueTask', 'hoy', ent.dueTask ? { kind: 'task', ...ent.dueTask } : undefined)
  else if (due.length > 1) add(`${due.length} tareas para hoy (${due[0]}…)`, 'dueTask', 'hoy')

  // 2.5 Hábito a retomar · 2.6 señal del cuerpo · 2.7 vigilancia de laboratorio.
  add(input.habitNudge, 'habitNudge', 'hoy')
  add(input.bodySignal, 'bodySignal', 'hoy')
  add(input.healthWatch, 'healthWatch', 'hoy')

  // 2.75 OPORTUNIDAD detectada en las conversaciones (lib/opportunities).
  //      Va ANTES del nudge de objetivo: un lead sin registrar o un trabajo que
  //      se enfría tiene ventana que se cierra, mientras que "tu objetivo va 0%"
  //      sigue ahí mañana. Nació del reclamo de Aaron del 28-jul: se le abrió una
  //      ventana con Miluska y "ni siquiera apareció como oportunidad, lead".
  add(input.opportunity, 'opportunity', 'metas', ent.opportunity ? { kind: 'opportunity', ...ent.opportunity } : undefined)

  // 2.8 OBJETIVO que necesita atención (accionable, antes del foco genérico).
  add(input.goalNudge, 'goalNudge', 'metas', ent.goalNudgeGoal ? { kind: 'goal', ...ent.goalNudgeGoal } : undefined)

  // 2.9 ¿Se está cumpliendo el plan de entrenamiento de la semana?
  add(input.trainingAdherence, 'trainingAdherence', 'metas')

  // 3. Foco del día. Se omite si ya hubo un nudge de objetivo (evita 2 líneas de
  //    meta en el mismo push).
  if (input.focus && !input.goalNudge) add(`Foco: ${input.focus}`, 'focus', 'metas')

  // 4. Una señal más.
  if (input.topSignal) add(`Atención: ${input.topSignal}`, 'topSignal', 'hoy')

  // DEDUPE por tema antes de cortar: dos builders distintos describían la MISMA
  // cosa con otras palabras y el brief lo decía dos veces ("Cerrar Boticas
  // Jhodaal · EN 6 DÍAS" al inicio y «"Cerrar Boticas Jhodaal" vence en 6 días y
  // vas 0%» al final). Se queda la más informativa, en la posición de la primera.
  // SILENCIADAS (🔕): un tema que Aaron mandó a callar no vuelve. Se filtra
  // ANTES del dedupe y del cap, así una señal muteada no le roba el cupo a otra.
  // Se compara contra la clave NUEVA y la vieja: los silencios ya guardados se
  // hicieron con `topicKey(texto)` y deben seguir valiendo tras el cambio.
  const muted = new Set(input.mutedTopics ?? [])
  const audible = muted.size === 0
    ? collected
    : collected.filter((s) => !muted.has(signalTopicKey(s.slot, s.text)) && !muted.has(topicKey(s.text)))

  const signals = dedupeSignals(audible).slice(0, MAX_PARTS_FULL)
  const parts = signals.map((s) => s.text)

  if (parts.length === 0) {
    const calm = 'Hoy no hay nada urgente. Espacio para lo que elijas.'
    return { title: 'Buenos días', body: calm, bodyFull: calm, signals: [] }
  }

  const bodyFull = parts.join(' · ')
  const bodyShort = parts.slice(0, MAX_PARTS_WEB).join(' · ')
  const body = bodyShort.length > MAX_BODY ? bodyShort.slice(0, MAX_BODY - 1).trimEnd() + '…' : bodyShort
  return { title: 'Tu día en SIR', body, bodyFull, signals }
}
