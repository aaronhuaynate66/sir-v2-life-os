// SIR V2 — Ejecutor SERVER-SIDE de una acción propuesta (captura por chat).
//
// La web ejecuta las proposedActions en el cliente (sir/page.tsx confirmAction).
// Telegram no tiene cliente: cuando Aaron confirma por botón, hay que escribir
// desde el server (service-role). Este módulo centraliza esa escritura.
//
// Regla de oro (igual que en la web): esto SOLO corre tras confirmación explícita
// de Aaron. Nunca escritura silenciosa.
//
// MVP (PR1): registrar_interaccion — el "anota que hablé con X" (el caso dominante
// de captura de notas). Reusa la materialización de memoria del endpoint web
// (person_logs → memories) para que el briefing de la persona lo vea. Los otros
// kinds (crear_objetivo/persona/cerrar_relacion) quedan para el PR siguiente.

import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProposedActionResolved } from '@/lib/sir/askSir'
import { shouldMaterializeInteraction, interactionLogToMemoryRow } from '@/lib/memories/fromInteractionLog'
import { generateSlug } from '@/lib/people/slug'
import { limaDayString } from '@/lib/habits/streak'
import { parseExercises, sessionVolume, progressionFor, type WorkSet } from '@/lib/entrenamiento/ejercicios'

export interface ExecuteResult {
  ok: boolean
  /** Mensaje corto y humano para devolver al chat. */
  message: string
}

/** ¿Este tipo de acción ya se puede ejecutar por chat? */
export function isExecutableByChat(kind: string): boolean {
  return (
    kind === 'registrar_interaccion' ||
    kind === 'crear_objetivo' ||
    kind === 'crear_persona' ||
    kind === 'cerrar_relacion' ||
    kind === 'marcar_habito' ||
    kind === 'marcar_tarea' ||
    kind === 'agregar_hito' ||
    kind === 'crear_plan' ||
    kind === 'crear_recordatorio' ||
    kind === 'registrar_estado' ||
    kind === 'registrar_entrenamiento' ||
    kind === 'registrar_hecho_clinico'
  )
}

/** Fecha+hora legible en zona de Lima (ej. "mar 22 jul, 9:00 a. m."). */
const LIMA_DT = new Intl.DateTimeFormat('es-PE', {
  weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima',
})

function normText(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Matchea un hábito por nombre (exacto normalizado → inclusión). Devuelve la
 *  fila o null si es ambiguo/no encontrado. */
function matchHabit(habits: Array<{ id: string; title: string }>, query: string): { id: string; title: string } | null {
  const q = normText(query)
  if (!q) return null
  const exact = habits.find((h) => normText(h.title) === q)
  if (exact) return exact
  const inc = habits.filter((h) => { const t = normText(h.title); return t.includes(q) || q.includes(t) })
  return inc.length === 1 ? inc[0] : null
}

function randSuffix(n: number): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < n; i++) s += alpha[Math.floor(Math.random() * alpha.length)]
  return s
}

/** Slug único para una persona nueva (evita chocar con los existentes). */
async function uniquePersonSlug(supabase: SupabaseClient, userId: string, name: string): Promise<string> {
  let slug = generateSlug(name)
  try {
    const { data } = await supabase.from('people').select('slug').eq('user_id', userId)
    const taken = new Set(((data as Array<{ slug: string | null }>) ?? []).map((r) => r.slug).filter(Boolean) as string[])
    while (taken.has(slug)) slug = `${slug}-${randSuffix(3)}`
  } catch { /* best-effort: si falla la query, usamos el slug base */ }
  return slug
}

export async function executeProposedAction(
  supabase: SupabaseClient,
  userId: string,
  action: ProposedActionResolved,
): Promise<ExecuteResult> {
  if (action.kind === 'registrar_interaccion') {
    const personId = action.personId
    if (!personId) {
      return { ok: false, message: `No encontré a ${action.persona || 'esa persona'} en tu red, así que no lo registré. Puedes nombrarla distinto o crearla primero.` }
    }
    // Ownership explícito (defensa sobre RLS; acá vamos con service-role).
    const { data: person } = await supabase
      .from('people').select('id, name').eq('user_id', userId).eq('id', personId).maybeSingle()
    if (!person) {
      return { ok: false, message: 'No encontré esa persona (o no es tuya), no registré nada.' }
    }
    const value = Math.max(1, Math.min(5, Math.round(Number(action.calidad) || 3)))
    const note = (action.nota || '').trim().slice(0, 500) || null

    const { data: log, error } = await supabase
      .from('person_logs')
      .insert({ user_id: userId, person_id: personId, kind: 'interaction', value, note })
      .select('id, logged_at, created_at')
      .single()
    if (error || !log) {
      return { ok: false, message: 'Uf, no pude registrar la interacción. Reinténtalo en un momento.' }
    }

    // Materializar como memoria (mismo camino que el endpoint web). Fail-soft.
    if (shouldMaterializeInteraction('interaction', note)) {
      try {
        const l = log as { id: string; logged_at: string | null; created_at: string | null }
        const row = interactionLogToMemoryRow(
          { id: l.id, personId, note: note ?? '', value, loggedAt: l.logged_at ?? l.created_at ?? new Date().toISOString() },
          userId,
        )
        await supabase.from('memories').upsert([row], { onConflict: 'id', ignoreDuplicates: true })
      } catch { /* fail-soft: el log ya quedó */ }
    }

    const name = (person as { name?: string }).name || action.persona || 'esa persona'
    return {
      ok: true,
      message: `✅ Registré la interacción con ${name} (tono ${value}/5)${note ? ` — "${note.slice(0, 90)}${note.length > 90 ? '…' : ''}"` : ''}.`,
    }
  }

  // ═══ UN HECHO MÉDICO, GUARDADO DONDE SIR LO VUELVE A ENCONTRAR ═════════════
  //
  // Aaron le contó que Fernando le recomendó una panarteriografía y SIR respondió
  // una clase de anatomía. No fue el prompt (ya exige cerrar loops) ni falta de
  // contexto (Fernando está en su red): de las 11 tools ninguna podía sostener el
  // HECHO, así que no había nada que hacer con la información.
  //
  // Se escribe en `memories` a propósito, sin tabla nueva: es el corpus del que SIR
  // hace recall, así que el hecho sobrevive al cierre de la conversación y aparece
  // la próxima vez que él pregunte. Es el mismo lugar donde vive el cruce de
  // exámenes desde #1095, y por la misma razón.
  if (action.kind === 'registrar_hecho_clinico') {
    const hecho = (action.hecho || '').trim()
    if (hecho.length < 5) return { ok: false, message: 'Faltó el hecho, no registré nada.' }

    const quien = (action.quien || '').trim()
    const hoy = new Date().toISOString().slice(0, 10)
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(action.fecha || '') ? action.fecha : hoy
    const alta = action.relevancia === 'alta'

    // La persona solo se vincula si es de él. `personId` sin verificar sería confiar
    // en la resolución por nombre para escribir una entidad ajena.
    let personId: string | null = null
    let personName: string | null = null
    if (action.personId) {
      const { data: p } = await supabase
        .from('people').select('id, name').eq('user_id', userId).eq('id', action.personId).maybeSingle()
      if (p) { personId = (p as { id: string }).id; personName = (p as { name?: string }).name ?? null }
    }

    // Id determinístico por (fecha + hecho): si Aaron lo cuenta dos veces, se
    // actualiza en vez de duplicar. Es la misma disciplina que evitó las 700
    // memorias basura de #1029.
    const huella = createHash('sha1').update(`${userId}|${fecha}|${hecho.toLowerCase()}`).digest('hex').slice(0, 20)
    const atribucion = quien ? `${quien}: ` : ''

    const { error } = await supabase.from('memories').upsert([{
      id: `mem_clin_${huella}`,
      user_id: userId,
      type: 'semantic',
      title: `${quien ? `${quien} — ` : ''}${hecho.slice(0, 110)}`,
      // El contenido lleva la atribución y la fecha DENTRO del texto: el recall busca
      // sobre `content`, así que un dato que solo viva en una columna no se encuentra.
      content: `Hecho médico reportado por Aaron el ${fecha}. ${atribucion}${hecho}`,
      tags: ['salud', 'hecho_clinico', ...(alta ? ['relevancia_alta'] : [])],
      importance: alta ? 9 : 7,
      emotional_charge: 0,
      decay_rate: 0.01,
      source: 'hecho_clinico_chat',
      occurred_at: `${fecha}T12:00:00Z`,
      ...(personId ? { person_id: personId, entities: [personId] } : {}),
    }], { onConflict: 'id' })

    if (error) return { ok: false, message: 'Uf, no pude registrar el hecho. Reinténtalo en un momento.' }

    const deQuien = personName ? ` (de ${personName})` : quien ? ` (de ${quien})` : ''
    return {
      ok: true,
      message: `✅ Registré el hecho médico${deQuien}: "${hecho.slice(0, 110)}${hecho.length > 110 ? '…' : ''}". Ya lo tengo para cuando preguntes por esto.`,
    }
  }

  if (action.kind === 'crear_objetivo') {
    const titulo = (action.titulo || '').trim()
    if (titulo.length < 2) return { ok: false, message: 'Faltó el título del objetivo, no creé nada.' }
    const now = new Date().toISOString()
    const id = `g_${Date.now()}_${randSuffix(4)}`
    // Si el modelo ligó una persona, la resolvió a personId (askSir). La sumamos.
    const relatedPersons = action.personId ? [action.personId] : []
    const { error } = await supabase.from('goals').insert({
      id,
      user_id: userId,
      title: titulo.slice(0, 200),
      description: '',
      category: action.categoria,
      priority: action.prioridad,
      status: 'active',
      progress: 0,
      milestones: [],
      related_goals: [],
      related_persons: relatedPersons,
      peace_impact: Math.max(1, Math.min(10, Math.round(Number(action.impactoPaz) || 5))),
      obstacles: [],
      next_action: (action.proximoPaso || '').slice(0, 240),
      created_at: now,
      updated_at: now,
    })
    if (error) return { ok: false, message: 'Uf, no pude crear el objetivo. Reinténtalo en un momento.' }
    return { ok: true, message: `🎯 Creé el objetivo "${titulo.slice(0, 90)}".` }
  }

  if (action.kind === 'crear_persona') {
    const name = (action.nombre || '').trim()
    if (name.length < 2) return { ok: false, message: 'Faltó el nombre, no creé la persona.' }
    const now = new Date().toISOString()
    const slug = await uniquePersonSlug(supabase, userId, name)
    const id = `per_${Date.now()}_${randSuffix(6)}`
    // Mismas columnas NOT NULL que usa el import y el alta desde la web.
    const { error } = await supabase.from('people').insert({
      id,
      user_id: userId,
      name: name.slice(0, 120),
      slug,
      relationship: action.relacion,
      category: action.categoria,
      importance_score: 5,
      trust_level: 5,
      energy_impact: 'neutral',
      contact_frequency: '',
      tags: [],
      notes: 'Creado desde el chat de SIR.',
      relational_notes: {},
      created_at: now,
      updated_at: now,
    })
    if (error) return { ok: false, message: 'Uf, no pude agregar a la persona. Reinténtalo en un momento.' }
    return { ok: true, message: `👤 Agregué a ${name.slice(0, 80)} a tu red.` }
  }

  if (action.kind === 'cerrar_relacion') {
    const personId = action.personId
    if (!personId) {
      return { ok: false, message: `No encontré a ${action.persona || 'esa persona'} en tu red, así que no cerré nada.` }
    }
    const { data: person } = await supabase
      .from('people').select('id, name, notes, relationship').eq('user_id', userId).eq('id', personId).maybeSingle()
    if (!person) {
      return { ok: false, message: 'No encontré esa persona (o no es tuya), no cerré nada.' }
    }
    const p = person as { name?: string; notes?: string | null; relationship?: string | null }
    const now = new Date().toISOString()

    // 1) Marcar el vínculo como 'ended' — ES lo que leen daily-actions/urgency
    //    para dejar de sugerir retomar contacto. La tabla suele estar vacía →
    //    insert. Robusto ante el tipo de `id` (uuid default vs text 'rel_…').
    const okRel = await markRelationshipEnded(supabase, userId, personId, p.relationship || 'acquaintance')

    // 2) Nota de cierre en la persona (no se borra nada).
    const closingNote = `Vínculo cerrado el ${now.slice(0, 10)}${action.motivo ? ` — ${action.motivo}` : ''}.`
    try {
      await supabase.from('people')
        .update({ notes: p.notes ? `${p.notes}\n${closingNote}` : closingNote, updated_at: now })
        .eq('user_id', userId).eq('id', personId)
    } catch { /* fail-soft */ }

    // 3) Pausar los objetivos activos ligados a esa persona.
    let paused = 0
    try {
      const { data: linked } = await supabase.from('goals')
        .select('id').eq('user_id', userId).eq('status', 'active').contains('related_persons', [personId])
      const ids = ((linked as Array<{ id: string }>) ?? []).map((g) => g.id)
      if (ids.length > 0) {
        const { error } = await supabase.from('goals').update({ status: 'paused', updated_at: now }).in('id', ids)
        if (!error) paused = ids.length
      }
    } catch { /* fail-soft */ }

    const name = p.name || action.persona || 'esa persona'
    if (!okRel) {
      return { ok: false, message: `No pude marcar el vínculo con ${name} como cerrado. Reinténtalo o hazlo desde la web.` }
    }
    return {
      ok: true,
      message: `🔚 Cerré tu vínculo con ${name}: dejo de sugerirte retomar contacto${paused > 0 ? `, y pausé ${paused} objetivo(s) ligado(s)` : ''}. No borré nada.`,
    }
  }

  if (action.kind === 'marcar_habito') {
    const query = (action.habito || '').trim()
    if (!query) return { ok: false, message: 'No entendí qué hábito marcar.' }
    const { data: habitsRaw } = await supabase
      .from('habits').select('id, title').eq('user_id', userId).eq('active', true).limit(200)
    const habits = ((habitsRaw as Array<{ id: string; title: string }>) ?? [])
    if (habits.length === 0) return { ok: false, message: 'No tienes hábitos activos cargados.' }
    const hit = matchHabit(habits, query)
    if (!hit) {
      return { ok: false, message: `No encontré un hábito que matchee "${query.slice(0, 60)}". Tus hábitos: ${habits.slice(0, 8).map((h) => h.title).join(', ')}.` }
    }
    const target = limaDayString(new Date())
    // Idempotente: si ya está marcado hoy, no lo desmarcamos (a diferencia del
    // toggle de la web) — "ya medité" siempre significa marcar, nunca desmarcar.
    const { data: existing } = await supabase
      .from('habit_checkins').select('id')
      .eq('user_id', userId).eq('habit_id', hit.id).eq('date', target).maybeSingle()
    if (existing) return { ok: true, message: `✅ "${hit.title}" ya estaba marcado hoy. Listo.` }
    const { error } = await supabase
      .from('habit_checkins').insert({ user_id: userId, habit_id: hit.id, date: target })
    if (error) return { ok: false, message: 'Uf, no pude marcar el hábito. Reinténtalo en un momento.' }
    return { ok: true, message: `✅ Marqué "${hit.title}" como hecho hoy.` }
  }

  if (action.kind === 'marcar_tarea') {
    const query = (action.tarea || '').trim()
    if (!query) return { ok: false, message: 'No entendí qué tarea marcar.' }
    // Solo TAREAS (kind='task'), no KRs (esos se completan por métrica, no por status).
    const { data: rawSteps } = await supabase
      .from('objective_steps').select('id, title, status').eq('user_id', userId).eq('kind', 'task').limit(300)
    const steps = ((rawSteps as Array<{ id: string; title: string; status: string }>) ?? [])
    if (steps.length === 0) return { ok: false, message: 'No tienes tareas cargadas en tus objetivos.' }
    const hit = matchHabit(steps, query) // matcher genérico por título (exacto → inclusión, null si ambiguo)
    if (!hit) {
      const pend = steps.filter((s) => s.status !== 'hecho').slice(0, 6).map((s) => s.title)
      return { ok: false, message: `No encontré una tarea que matchee "${query.slice(0, 60)}".` + (pend.length ? ` Pendientes: ${pend.join(', ')}.` : '') }
    }
    const full = steps.find((s) => s.id === hit.id)
    if (full?.status === 'hecho') return { ok: true, message: `✅ "${hit.title}" ya estaba marcada como hecha. Listo.` }
    // Los 3 campos se mueven juntos (status legado + task_status workflow + stamp).
    const { error } = await supabase
      .from('objective_steps')
      .update({ status: 'hecho', task_status: 'done', completed_at: new Date().toISOString() })
      .eq('id', hit.id).eq('user_id', userId)
    if (error) return { ok: false, message: 'Uf, no pude marcar la tarea. Reinténtalo en un momento.' }
    return { ok: true, message: `✅ Marqué "${hit.title}" como hecha.` }
  }

  if (action.kind === 'agregar_hito') {
    const hito = (action.hito || '').trim()
    if (hito.length < 2) return { ok: false, message: 'Faltó el nombre del paso, no agregué nada.' }
    const goalId = action.objetivoId
    if (!goalId) {
      return { ok: false, message: `No encontré el objetivo${action.objetivo ? ` "${action.objetivo}"` : ''}, así que no agregué el paso.` }
    }
    // Ownership explícito + leemos los milestones actuales para appendear (no pisar).
    const { data: goal } = await supabase
      .from('goals').select('id, title, milestones').eq('user_id', userId).eq('id', goalId).maybeSingle()
    if (!goal) return { ok: false, message: 'No encontré ese objetivo (o no es tuyo), no agregué nada.' }
    const g = goal as { title?: string; milestones?: unknown }
    const current = Array.isArray(g.milestones) ? (g.milestones as unknown[]) : []
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(action.fecha) ? action.fecha : null
    const milestone = {
      id: `m_${Date.now()}_${randSuffix(4)}`,
      title: hito.slice(0, 200),
      completed: false,
      dueDate,
    }
    // El update naturalmente toca updated_at (lo seteamos explícito, como el resto)
    // → el panel deja de marcar el objetivo "sin avance/estancado".
    const { error } = await supabase.from('goals')
      .update({ milestones: [...current, milestone], updated_at: new Date().toISOString() })
      .eq('id', goalId).eq('user_id', userId)
    if (error) return { ok: false, message: 'Uf, no pude agregar el paso. Reinténtalo en un momento.' }
    const goalTitle = (g.title || action.objetivo || 'tu objetivo').slice(0, 60)
    return { ok: true, message: `🎯 Agregué "${hito.slice(0, 90)}" como paso de "${goalTitle}".` }
  }

  if (action.kind === 'crear_plan') {
    const titulo = (action.titulo || '').trim()
    if (titulo.length < 2) return { ok: false, message: 'Faltó el título del plan, no agendé nada.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(action.fecha)) {
      return { ok: false, message: 'No me quedó clara la fecha del plan. Dímela (ej. 2026-07-19) y lo agendo.' }
    }
    const note = (action.nota || '').trim().slice(0, 500) || null
    // person_id solo si se resolvió a alguien de la red (plan "con X"); si no, plan suelto.
    const { error } = await supabase.from('personal_events').insert({
      user_id: userId,
      person_id: action.personId ?? null,
      title: titulo.slice(0, 200),
      event_date: action.fecha,
      all_day: true,
      note,
      source: 'sir',
    })
    if (error) return { ok: false, message: 'Uf, no pude agendar el plan. Reinténtalo en un momento.' }
    const withWho = action.personId && action.persona ? ` con ${action.persona}` : ''
    return { ok: true, message: `📆 Agendé "${titulo.slice(0, 80)}"${withWho} para el ${action.fecha}.` }
  }

  if (action.kind === 'crear_recordatorio') {
    const texto = (action.texto || '').trim()
    if (texto.length < 2) return { ok: false, message: 'Faltó qué recordar, no agendé nada.' }
    const t = Date.parse(action.cuando)
    if (!Number.isFinite(t)) return { ok: false, message: 'No me quedó clara la fecha/hora. Dímela (ej. mañana 9am) y lo agendo.' }
    if (t < Date.now() - 60_000) return { ok: false, message: 'Esa hora ya pasó. Dame una futura y te lo agendo.' }
    const { error } = await supabase.from('reminders').insert({
      user_id: userId, text: texto.slice(0, 500), due_at: new Date(t).toISOString(),
    })
    if (error) return { ok: false, message: 'Uf, no pude agendar el recordatorio. Reinténtalo en un momento.' }
    return { ok: true, message: `⏰ Listo, te recuerdo "${texto.slice(0, 80)}" el ${LIMA_DT.format(new Date(t))}.` }
  }

  if (action.kind === 'registrar_estado') {
    const personId = action.personId
    if (!personId) {
      return { ok: false, message: `No encontré a ${action.persona || 'esa persona'} en tu red, así que no marqué nada. Nómbrala distinto o créala primero.` }
    }
    const { data: person } = await supabase
      .from('people').select('id, name').eq('user_id', userId).eq('id', personId).maybeSingle()
    if (!person) return { ok: false, message: 'No encontré esa persona (o no es tuya), no marqué nada.' }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(action.fecha) ? action.fecha : limaDayString(new Date())
    // mal humor/tensa → 'pms' (marca de ventana sensible, ancla del forecast);
    // regla → 'bleeding' (ancla fuerte de inicio de período).
    const phase = action.estado === 'regla' ? 'bleeding' : 'pms'
    const { error } = await supabase.from('person_cycles').insert({
      user_id: userId, person_id: personId, date, phase,
      confidence: 'medium', source: 'aaron',
      note: (action.nota || '').trim().slice(0, 300) || null,
    })
    if (error) return { ok: false, message: 'Uf, no pude guardar la marca de estado. Reinténtalo en un momento.' }

    // Un período nuevo también ADELANTA el ancla de `people.cycle_start_date`.
    //
    // POR QUÉ (bug real, visto el 29-jul-2026): esta acción solo escribía en
    // `person_cycles`, pero `people.cycle_start_date` lo leen tres superficies
    // más —/api/briefing/daily, /api/care/upcoming y /api/ciclo/event-brief—, así
    // que cada una seguía calculando la fase con el ancla vieja. La de Diana Díaz
    // llevaba 64 días sin moverse. Marcar el período y que la mitad del sistema
    // no se enterara es peor que no marcarlo: da una fase con cara de precisa.
    //
    // Solo se adelanta (nunca se retrocede): registrar un período viejo que faltaba
    // no debe pisar un ancla más reciente.
    if (phase === 'bleeding') {
      const { data: actual } = await supabase
        .from('people').select('cycle_start_date').eq('user_id', userId).eq('id', personId).maybeSingle()
      const previo = (actual as { cycle_start_date?: string | null } | null)?.cycle_start_date ?? null
      if (!previo || date > previo.slice(0, 10)) {
        await supabase.from('people').update({ cycle_start_date: date }).eq('user_id', userId).eq('id', personId)
      }
    }

    const first = ((person.name as string) || action.persona || 'ella').split(' ')[0]
    const label = action.estado === 'regla' ? 'período' : 'ánimo bajo/tensa'
    return { ok: true, message: `📔 Anotado: ${first} — ${label} el ${date}. Con cada marca detecto mejor si hay un patrón que se repite; cuando haya varias, te aviso si es cíclico y cuándo podría volver.` }
  }

  if (action.kind === 'registrar_entrenamiento') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(action.fecha) ? action.fecha : limaDayString(new Date())
    // El objetivo del Mundial, si existe: la sesión cuelga de él para que la
    // adherencia del plan (bloques de 15 semanas) la cuente.
    let objectiveId: string | null = null
    try {
      const { data: g } = await supabase
        .from('goals').select('id, title, description')
        .eq('user_id', userId).eq('status', 'active').limit(50)
      const hit = ((g as Array<Record<string, unknown>>) ?? [])
        .find((x) => /mundial|taekwondo|wfg/i.test(`${x.title ?? ''} ${x.description ?? ''}`))
      objectiveId = (hit?.id as string) ?? null
    } catch { /* sesión suelta, sin objetivo */ }

    const { data: sesion, error } = await supabase.from('training_sessions').insert({
      user_id: userId,
      date,
      kind: action.tipo,
      duration_min: action.minutos,
      intensity: action.intensidad,
      notes: (action.nota || '').trim().slice(0, 500) || null,
      objective_id: objectiveId,
      source: 'chat',
    }).select('id').single()
    if (error) return { ok: false, message: 'Uf, no pude guardar el entrenamiento. Reinténtalo en un momento.' }

    // EJERCICIOS con series/reps/CARGA (mig 0174). Sin la carga no se puede saber
    // si Aaron está ganando el músculo que su categoría (80 kg+) le pide: se puede
    // entrenar fuerza tres meses moviendo siempre el mismo peso. El parseo es
    // determinístico a propósito — al modelo se le pide copiar el texto tal cual.
    let ejerciciosMsg = ''
    const sesionId = (sesion as { id?: string } | null)?.id
    if (sesionId && action.ejercicios?.trim()) {
      try {
        const parsed = parseExercises(action.ejercicios)
        if (parsed.length > 0) {
          const { error: exErr } = await supabase.from('training_exercises').insert(
            parsed.map((ex) => ({
              user_id: userId, session_id: sesionId,
              name: ex.name, name_key: ex.nameKey,
              sets: ex.sets, unit: ex.unit, bodyweight: ex.bodyweight,
            })),
          )
          if (!exErr) {
            const vol = sessionVolume(parsed)
            ejerciciosMsg = ` Anoté ${parsed.length} ejercicio(s)${vol > 0 ? ` · ${vol.toLocaleString('es-PE')} kg de volumen` : ''}.`

            // PROGRESIÓN del ejercicio principal: es la pregunta que decide la
            // recomposición, y solo se puede responder con historial.
            const principal = parsed.find((ex) => !ex.bodyweight) ?? parsed[0]
            const { data: hist } = await supabase
              .from('training_exercises')
              .select('sets, training_sessions!inner(date)')
              .eq('user_id', userId).eq('name_key', principal.nameKey)
              .limit(40)
            // PostgREST tipa la relación embebida como ARRAY aunque en runtime,
            // siendo to-one con !inner, venga como objeto. Se normalizan las dos.
            const puntos = ((hist ?? []) as unknown[])
              .map((raw) => {
                const h = raw as { sets?: unknown; training_sessions?: unknown }
                const rel = Array.isArray(h.training_sessions) ? h.training_sessions[0] : h.training_sessions
                const date = (rel as { date?: string } | null | undefined)?.date ?? ''
                return { date, sets: (Array.isArray(h.sets) ? h.sets : []) as WorkSet[] }
              })
              .filter((h) => h.date)
            const prog = progressionFor(principal.name, puntos)
            if (prog.trend !== 'sin_datos') ejerciciosMsg += ` ${prog.message}`
          }
        } else {
          ejerciciosMsg = ' (De los ejercicios no pude sacar series ni peso — si me los pasas como "banca 3x12 con 80" los registro.)'
        }
      } catch { /* fail-soft: la sesión ya quedó guardada */ }
    }

    // Cuántas van esta semana (y de fuerza, que es lo que pide el bloque base).
    let extra = ''
    try {
      const monday = weekStartISO(date)
      const { data: wk } = await supabase
        .from('training_sessions').select('kind')
        .eq('user_id', userId).gte('date', monday).lte('date', date)
      const rows = (wk ?? []) as Array<{ kind: string }>
      const fuerza = rows.filter((r) => r.kind === 'fuerza').length
      extra = ` Van ${rows.length} esta semana${fuerza > 0 ? ` (${fuerza} de fuerza)` : ''}.`
    } catch { /* el conteo es un plus */ }

    const LABEL: Record<string, string> = {
      fuerza: 'fuerza', tecnica: 'técnica', sparring: 'sparring',
      acondicionamiento: 'acondicionamiento', competencia: 'competencia', otro: 'entrenamiento',
    }
    const dur = action.minutos ? ` (${action.minutos} min)` : ''
    return { ok: true, message: `🥋 Anotado: ${LABEL[action.tipo] ?? action.tipo}${dur} el ${date}.${extra}${ejerciciosMsg}` }
  }

  return { ok: false, message: 'Ese tipo de acción todavía no lo guardo por chat — por ahora hazlo desde la web.' }
}

/** Lunes (YYYY-MM-DD) de la semana de `day`. La semana de entrenamiento es local. */
function weekStartISO(day: string): string {
  const t = Date.parse(`${day}T12:00:00Z`)
  if (!Number.isFinite(t)) return day
  const dow = (new Date(t).getUTCDay() + 6) % 7
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10)
}

/** Marca el vínculo con una persona como 'ended'. Si ya hay fila → update; si no
 *  → insert con valores VÁLIDOS (depth/reciprocity 1..10; la web usa 0 y viola el
 *  check, por eso la tabla queda vacía). Robusto ante el tipo de `id`: intenta sin
 *  id (uuid default) y si falla reintenta con id text 'rel_…'. Devuelve si quedó. */
async function markRelationshipEnded(
  supabase: SupabaseClient, userId: string, personId: string, type: string,
): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('relationships').select('id').eq('user_id', userId).eq('person_id', personId).limit(1).maybeSingle()
    if (existing && (existing as { id: string }).id) {
      const { error } = await supabase.from('relationships')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('id', (existing as { id: string }).id)
      return !error
    }
    const base: Record<string, unknown> = {
      user_id: userId, person_id: personId, type, status: 'ended',
      depth: 5, reciprocity: 5, history: [], shared_goals: [], tensions: [], strengths: [],
    }
    const first = await supabase.from('relationships').insert(base)
    if (!first.error) return true
    // Fallback: la columna id podría ser TEXT sin default (drift) → proveerla.
    const second = await supabase.from('relationships').insert({ ...base, id: `rel_${Date.now()}_${randSuffix(6)}` })
    return !second.error
  } catch {
    return false
  }
}
