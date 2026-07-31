// SIR V2 — Cerrar el registro al Mundial (WFG26) en la data. DRY-RUN por defecto.
//
// POR QUÉ (hecho de Aaron, 31-jul-2026: "ya me registré"). Se registró y PAGÓ el
// último día del 50% de descuento, y trajo los tres documentos oficiales:
//
//   · WFG2026_AARON_Sr_HUAYNATE_PAYMENT_DETAILS.pdf → 281.25 SAR (= 75 USD al
//     1 USD = 3.75 SAR indicativo), Visa Debit, 31-jul-2026.
//   · El correo de no-reply@wfg26.org → "You're Officially Registered".
//     **Competitor ID 102041.** Portal: gms.wfg26.com
//   · Taekwondo.pdf (ficha oficial de la disciplina) → Nov 6–7, Dhahran Expo,
//     64 competidores máx., y la grilla de categorías que SIR ya tenía bien.
//
// LO QUE ESTO CORRIGE, y es el punto: **el registro colapsa tres pasos futuros**.
// El plan asumía el camino largo (pre-registro → esperar apertura → inscribirse
// antes del cierre el 31-ago → pagar el fee el 5-sep). Pasó todo el 31-jul de una
// sola vez. Si no se cierran, el brief le sigue avisando en agosto y septiembre
// que se inscriba y pague algo que YA hizo — que es exactamente el bug de los
// "avisos de cobros inexistentes" (#1032) pero al revés.
//
// Y hay un cuarto: `goals.next_action` decía "Inscribirme al WFG26 antes del
// 31-jul (cierra el 50% de descuento)". Ese campo es el que le repitió la
// cotización de Miluska tres veces; dejarlo así es garantizar el mismo ruido.
//
// NO SE TOCA (a propósito): los bloques de entrenamiento, el pasaje, el hotel, la
// visa y el certificado médico. Nada de eso lo resuelve haberse inscrito.
//
// Uso:
//   node scripts/cerrar-registro-wfg26.mjs
//   node scripts/cerrar-registro-wfg26.mjs --apply
//
// Env (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}

const APPLY = process.argv.includes('--apply')
const GOAL = 'g_1780283921536'
const COMPETITOR_ID = '102041'
/** Momento del pago según el comprobante (no "ahora": es un hecho fechado). */
const REGISTRADO_AT = '2026-07-31T00:00:00.000Z'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Pasos que el registro YA cumplió. Se buscan por prefijo de título y no por id
 *  para que el script se lea solo; si alguno no aparece, se avisa y no se inventa. */
const A_MARCAR_HECHO = [
  { match: 'Pre-registrarme como atleta', porque: 'se registró en gms.wfg26.com el 31-jul' },
  { match: 'Registrarme oficialmente en el Mundial', porque: 'el correo oficial dice "You\'re Officially Registered" — no hubo dos etapas' },
  { match: 'Pagar el fee de inscripción', porque: '281.25 SAR pagados con Visa Debit el 31-jul (comprobante)' },
  { match: 'Verificar criterios de clasificación', porque: 'verificado por la vía de los hechos: NO hay ranking ni selectivo — se registra y paga directo, cupo 64 por orden de llegada' },
]

/** Pasos que quedaron sin sentido. `descartado`, no `hecho`: nunca ocurrieron. */
const A_DESCARTAR = [
  { match: 'Inscribirme en selectivo nacional', porque: 'no aplica: ya está oficialmente inscrito y con su prueba confirmada, así que no hay clasificatoria que lo condicione' },
]

const EVENTOS = [
  {
    id: 'pe_wfg26_ceremonia_20261105',
    title: 'Ceremonia de apertura — WFG26 (Al Khobar)',
    event_date: '2026-11-05',
    end_date: null,
    note: '18:00–20:00. YA PAGADA dentro de la inscripción del 31-jul. Competitor ID 102041.',
  },
  {
    id: 'pe_wfg26_taekwondo_20261106',
    title: 'Taekwondo 80 kg+ — WFG26 (clasificación y finales)',
    event_date: '2026-11-06',
    end_date: '2026-11-07',
    note: 'Dhahran Expo · 08:00–22:00 los dos días (clasificación y finales el mismo día) · masculino 18–39, división 80 kg+ · 64 competidores máx. · Competitor ID 102041. Reglamento y pesaje TBC: el organizador no los publicó todavía.',
  },
]

const NEXT_ACTION = 'Inscrito y pagado (31-jul, ID 102041). Lo que sigue: certificado médico deportivo (10-ago) y cerrar el plan técnico con el coach (3-ago).'

async function main() {
  console.log(APPLY ? '🔧 MODO ESCRITURA' : '👀 DRY-RUN (agrega --apply para escribir)')

  const { data: goal, error: gErr } = await sb.from('goals')
    .select('id, user_id, title, status, next_action, description').eq('id', GOAL).maybeSingle()
  if (gErr) throw new Error(gErr.message) // PostgREST no lanza: el error viene en .error
  if (!goal) throw new Error(`No existe el objetivo ${GOAL}`)
  console.log(`\nObjetivo: "${goal.title}" (${goal.status})`)
  console.log(`  next_action AHORA: ${goal.next_action ?? '—'}`)
  console.log(`  next_action NUEVO: ${NEXT_ACTION}`)

  const { data: pasos, error: sErr } = await sb.from('objective_steps')
    .select('id, title, status, target_date').eq('objective_id', GOAL)
  if (sErr) throw new Error(sErr.message)

  const plan = []
  for (const { match, porque } of A_MARCAR_HECHO) {
    const s = (pasos ?? []).find((p) => p.title.startsWith(match))
    if (!s) { console.log(`\n⚠️  NO ENCONTRÉ el paso que empieza con "${match}" — no invento nada.`); continue }
    plan.push({ s, status: 'hecho', porque })
  }
  for (const { match, porque } of A_DESCARTAR) {
    const s = (pasos ?? []).find((p) => p.title.startsWith(match))
    if (!s) { console.log(`\n⚠️  NO ENCONTRÉ el paso que empieza con "${match}" — no invento nada.`); continue }
    plan.push({ s, status: 'descartado', porque })
  }

  console.log(`\n${plan.length} pasos a cerrar:`)
  for (const { s, status, porque } of plan) {
    const ya = s.status === status ? '  (ya estaba así)' : ''
    console.log(`  ${s.target_date ?? '(sin fecha)'} ${s.status} → ${status}${ya}`)
    console.log(`      ${s.title.slice(0, 78)}`)
    console.log(`      porque: ${porque}`)
  }

  console.log(`\n${EVENTOS.length} eventos a cargar en personal_events:`)
  for (const e of EVENTOS) console.log(`  ${e.event_date}${e.end_date ? `→${e.end_date}` : ''} ${e.title}`)

  if (!APPLY) {
    console.log('\nNada se escribió. Corre con --apply cuando el reporte se vea bien.')
    return
  }

  for (const { s, status, porque } of plan) {
    const patch = { status, task_status: null }
    // `completed_at` solo para lo que SÍ ocurrió; un descartado no se completó.
    if (status === 'hecho') patch.completed_at = REGISTRADO_AT
    const { error } = await sb.from('objective_steps').update(patch).eq('id', s.id)
    if (error) throw new Error(`update paso ${s.id}: ${error.message}`)
    console.log(`🔧 ${status}: ${s.title.slice(0, 60)} — ${porque.slice(0, 50)}`)
  }

  // IDEMPOTENTE: el bloque se agrega UNA vez. Sin este guard, cada corrida pegaba
  // otra copia en la descripción — y esa descripción la lee el prompt de SIR, así
  // que el ruido se le multiplicaría en el chat.
  const MARCA = '── REGISTRO CERRADO (31-jul-2026) ──'
  const yaTiene = (goal.description ?? '').includes(MARCA)
  const desc = yaTiene ? (goal.description ?? '') : `${goal.description ?? ''}\n\n${MARCA}\nINSCRITO Y PAGADO. Competitor ID ${COMPETITOR_ID}. Portal: gms.wfg26.com. Pago: 281.25 SAR (≈75 USD) con Visa Debit el 31-jul-2026, el último día del 50% de descuento. Prueba confirmada por el organizador: Taekwondo masculino 18–39, división 80 kg+, individual, 6 y 7 de nov en Dhahran Expo, 08:00–22:00 (clasificación y finales), 64 competidores máx. Ceremonia de apertura el 5-nov 18:00–20:00, ya incluida y pagada. NO hubo selectivo ni ranking: la inscripción fue directa por orden de llegada. Reglamento de competencia y pesaje TBC — el organizador no los publicó; contacto: contactus@wfg26.com.`.trim()

  const { error: upErr } = await sb.from('goals')
    .update({ next_action: NEXT_ACTION, description: desc.slice(0, 6000) }).eq('id', GOAL)
  if (upErr) throw new Error(`update goal: ${upErr.message}`)
  console.log(`🔧 goal: next_action actualizado; descripción ${yaTiene ? 'ya tenía el bloque (no se duplicó)' : 'con el bloque del registro'}.`)

  // El dueño sale del OBJETIVO, no de `profiles`: esta base tiene 2 perfiles (el de
  // Aaron y un admin), así que "el único perfil" no resuelve — y adivinar de quién
  // es un evento no es algo que un script deba hacer. El evento pertenece a quien
  // es dueño del objetivo al que cuelga.
  const userId = goal.user_id
  if (!userId) throw new Error(`El objetivo ${GOAL} no tiene user_id`)

  for (const e of EVENTOS) {
    const { error } = await sb.from('personal_events').upsert({
      id: e.id, user_id: userId, person_id: null,
      title: e.title, event_date: e.event_date, end_date: e.end_date,
      all_day: true, note: e.note, source: 'wfg26',
    }, { onConflict: 'id' })
    if (error) throw new Error(`upsert evento ${e.id}: ${error.message}`)
    console.log(`🔧 evento: ${e.event_date} ${e.title.slice(0, 55)}`)
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
