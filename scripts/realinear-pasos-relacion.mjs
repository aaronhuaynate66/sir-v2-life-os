// SIR V2 — Realinear el plan de la relación con lo que YA pasó. DRY-RUN por defecto.
//
// POR QUÉ (datos que dio Aaron el 31-jul-2026 + su propio chat):
//
// El plan lo generó SIR el 2-jun y asumía que la conversación de fondo no había
// empezado: agendarla el 8-ago, sostenerla el 13-ago. La realidad ya pasó por
// encima, y encima MÁS RÁPIDO de lo que el plan podía ver:
//
//   · Hablaron EN PERSONA el lunes 27-jul. **Fue verbal, así que no dejó rastro**
//     — es el hueco que Aaron nombró: "todo esto se arrastra porque no tenemos un
//     método más eficiente que te inyecte cada vez que tenga una conversación".
//   · El 30-jul volvieron a pelear (está en el chat, 17:06–17:24).
//   · Y HOY 31-jul, 11:11–11:27, **ella agendó la conversación**: sale del trabajo
//     a las 6, lo recoge ~19:15 en el Polo, canceló su vóley. Textual de ella:
//     "No quiero terminar", "hay varias cosas que siguen latentes en muchas de
//     nuestras discusiones", "no quiero hablar las cosas apurada, quiero hablar
//     con calma".
//
// O sea: el paso de AGENDAR ya ocurrió (lo hizo ella) y el de SOSTENER es HOY. Y el
// de preparar la lista de necesidades y límites, que el plan pone el 6-ago, es lo
// único que todavía se puede hacer y **tiene que ser antes de las 19:15 de hoy** —
// entrar sin eso es lo que viene fallando desde el cumpleaños de ella.
//
// Uso:
//   node scripts/realinear-pasos-relacion.mjs
//   node scripts/realinear-pasos-relacion.mjs --apply

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}

const APPLY = process.argv.includes('--apply')
const GOAL = 'g_1780283810567'
const HOY = '2026-07-31'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Se buscan por prefijo de título; si alguno no aparece se avisa y no se inventa. */
const CAMBIOS = [
  {
    match: 'Agendar primera conversación cara a cara con Diana',
    patch: { status: 'hecho', task_status: null, completed_at: '2026-07-31T16:27:00.000Z' },
    porque: 'la agendó ELLA hoy 11:16–11:27: sale 6, llega ~19:15 al Polo, canceló su vóley',
  },
  {
    match: 'Escribir lista personal de necesidades y límites',
    patch: { target_date: HOY, due_time: '17:00' },
    porque: 'del 6-ago a HOY 17:00 — es lo único preparable y la conversación es a las 19:15',
  },
  {
    match: 'Sostener la primera conversación con Diana',
    patch: { target_date: HOY, due_time: '19:15' },
    porque: 'del 13-ago a HOY 19:15: ya está fijada, no hay nada que agendar',
  },
]

/** La conversación VERBAL del lunes y la pelea de ayer no existían como registro.
 *  Sin esto el motor de estado sigue leyendo el 29-jul y llamando "estable" a la
 *  relación (medido el 31-jul). Valores conservadores y notas factuales: lo que se
 *  puede sostener con el chat a la vista, sin diagnosticar. */
const LOGS = [
  {
    loggedAt: '2026-07-27T23:00:00.000Z',
    value: 3,
    note: 'Conversación EN PERSONA el lunes 27-jul (dato de Aaron el 31-jul). Fue verbal, así que no dejó rastro en el chat y SIR no la tenía. Aaron: "si hemos conversado el día lunes, solo que como fue verbal no hay registro de eso".',
  },
  {
    loggedAt: '2026-07-30T22:30:00.000Z',
    value: 2,
    note: 'Nueva discusión el 30-jul (17:06–17:24, en el chat). Disparador: él fue al estreno de una película con su prima Analía; ella dijo que no le molesta con quién sale, sino que le hubiera gustado ir juntos a esa película que había pedido ver con tiempo. Él la acusó de hipocresía. Cierre de él: "siempre dices que harás cosas por mí y al final son mentiras, ya no quiero vivir ilusionado". El balance del chat de ese día cayó a 0.3 positivo por negativo (base de la relación: 6).',
  },
  {
    loggedAt: '2026-07-31T16:30:00.000Z',
    value: 3,
    note: 'Ella tomó la iniciativa de la conversación de fondo: hoy 31-jul 11:11–11:27 avisó que quiere hablar en persona saliendo del trabajo (~19:15, la recoge en el Polo) y CANCELÓ su vóley. Textual: "No quiero terminar", "no me estoy desentendiendo", "hay varias cosas que siguen latentes en muchas de nuestras discusiones", "no quiero hablar las cosas apurada, quiero hablar con calma".',
  },
]

async function main() {
  console.log(APPLY ? '🔧 MODO ESCRITURA' : '👀 DRY-RUN (agrega --apply para escribir)')

  const { data: goal, error: gErr } = await sb.from('goals')
    .select('id, user_id, title, status, next_action').eq('id', GOAL).maybeSingle()
  if (gErr) throw new Error(gErr.message) // PostgREST no lanza: el error va a .error
  if (!goal) throw new Error(`No existe el objetivo ${GOAL}`)
  const userId = goal.user_id
  const PERSONA = '8758b7c2-9232-4db3-b0e8-dd489e339d40' // Diana Carolina Díaz Sánchez

  console.log(`\nObjetivo: "${goal.title}" (${goal.status})`)

  const { data: pasos, error: sErr } = await sb.from('objective_steps')
    .select('id, title, status, target_date, due_time').eq('objective_id', GOAL)
  if (sErr) throw new Error(sErr.message)

  const plan = []
  for (const c of CAMBIOS) {
    const s = (pasos ?? []).find((p) => p.title.startsWith(c.match))
    if (!s) { console.log(`\n⚠️  NO ENCONTRÉ "${c.match}" — no invento nada.`); continue }
    plan.push({ s, ...c })
  }

  console.log(`\n${plan.length} pasos a realinear:`)
  for (const { s, patch, porque } of plan) {
    console.log(`  ${s.target_date ?? '(sin fecha)'} ${s.status}  →  ${JSON.stringify(patch)}`)
    console.log(`     ${s.title.slice(0, 76)}`)
    console.log(`     porque: ${porque}`)
  }

  // ¿Ya existe alguno de estos logs? Se compara por el instante exacto.
  const { data: yaHay } = await sb.from('person_logs')
    .select('logged_at').eq('user_id', userId).eq('person_id', PERSONA)
    .in('logged_at', LOGS.map((l) => l.loggedAt))
  const existentes = new Set(((yaHay ?? [])).map((r) => r.logged_at))
  const nuevos = LOGS.filter((l) => !existentes.has(l.loggedAt))
  console.log(`\n${nuevos.length} de ${LOGS.length} registros de interacción a crear (los demás ya estaban):`)
  for (const l of nuevos) console.log(`  ${l.loggedAt.slice(0, 10)} valor ${l.value}/5 · ${l.note.slice(0, 90)}…`)

  if (!APPLY) { console.log('\nNada se escribió. Corre con --apply cuando el reporte se vea bien.'); return }

  for (const { s, patch, porque } of plan) {
    const { error } = await sb.from('objective_steps').update(patch).eq('id', s.id)
    if (error) throw new Error(`update ${s.id}: ${error.message}`)
    console.log(`🔧 ${s.title.slice(0, 58)} — ${porque.slice(0, 46)}`)
  }

  for (const l of nuevos) {
    const { error } = await sb.from('person_logs').insert({
      user_id: userId, person_id: PERSONA, kind: 'interaction',
      value: l.value, note: l.note, logged_at: l.loggedAt,
    })
    if (error) throw new Error(`insert log: ${error.message}`)
    console.log(`🔧 log ${l.loggedAt.slice(0, 10)} valor ${l.value}/5`)
  }

  const NEXT = 'Conversación con Diana HOY 19:15 (ella te recoge en el Polo). Antes: escribe tu lista de necesidades y límites.'
  const { error } = await sb.from('goals').update({ next_action: NEXT }).eq('id', GOAL)
  if (error) throw new Error(`update goal: ${error.message}`)
  console.log('🔧 goal.next_action actualizado.')
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
