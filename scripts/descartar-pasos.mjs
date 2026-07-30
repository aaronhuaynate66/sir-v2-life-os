// SIR V2 — Descartar los pasos de un objetivo que ya no va. DRY-RUN por defecto.
//
// POR QUÉ (decisión de Aaron, 30-jul-2026: "cierra los 39 pasos, ese trato ya no
// va"). El objetivo "Cerrar Boticas Jhodaal como cliente de Marlab" tenía 20 pasos
// fechados, todos en 'pendiente', de un acuerdo que nunca se firmó — Dayana siguió
// con otra gente el 17-jul. Los pasos seguían venciendo y ensuciando cualquier
// cuenta de pendientes.
//
// NO se marcan 'hecho': eso pondría el objetivo en 100% de algo que nunca pasó.
// Se marcan 'descartado' (migración 0178), que es cerrado-sin-hacerse: no cuenta
// en el avance, no es próxima hoja, no vence en el brief, no se agenda.
//
// Uso:
//   node scripts/descartar-pasos.mjs --goal g_1780473004315
//   node scripts/descartar-pasos.mjs --goal g_1780473004315 --apply
//   node scripts/descartar-pasos.mjs --goal g_... --apply --abandonar   (además, el
//                                    objetivo pasa de 'paused' a 'abandoned')
//
// Env (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}

const APPLY = process.argv.includes('--apply')
const ABANDONAR = process.argv.includes('--abandonar')
const GOAL = (() => {
  const i = process.argv.indexOf('--goal')
  return i >= 0 ? process.argv[i + 1] : null
})()

if (!GOAL) {
  console.error('Falta --goal <id>. A propósito: no hay modo "descarta todo lo pausado".')
  console.error('Un objetivo pausado no es un objetivo muerto, y decidir eso no es del script.')
  process.exit(1)
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  console.log(APPLY ? '🔧 MODO ESCRITURA' : '👀 DRY-RUN (agrega --apply para escribir)')

  const { data: goal, error: gErr } = await sb.from('goals')
    .select('id, title, status, next_action, progress').eq('id', GOAL).maybeSingle()
  if (gErr) throw new Error(gErr.message) // PostgREST no lanza: el error viene en .error
  if (!goal) throw new Error(`No existe el objetivo ${GOAL}`)

  console.log(`\nObjetivo: "${goal.title}"`)
  console.log(`  estado: ${goal.status} · progreso guardado: ${goal.progress}`)
  console.log(`  nota: ${goal.next_action ?? '—'}`)

  const { data: pasos, error: sErr } = await sb.from('objective_steps')
    .select('id, title, status, target_date, kind').eq('objective_id', GOAL).order('target_date')
  if (sErr) throw new Error(sErr.message)

  const abiertos = (pasos ?? []).filter((s) => s.status !== 'hecho' && s.status !== 'descartado')
  const hechos = (pasos ?? []).filter((s) => s.status === 'hecho')
  const yaDescartados = (pasos ?? []).filter((s) => s.status === 'descartado')

  console.log(`\n${(pasos ?? []).length} pasos en total:`)
  console.log(`  a descartar (abiertos): ${abiertos.length}`)
  console.log(`  ya hechos (NO se tocan): ${hechos.length}`)
  console.log(`  ya descartados:          ${yaDescartados.length}`)
  for (const s of abiertos) {
    console.log(`    ${s.target_date ?? '(sin fecha)'} [${s.kind}] ${s.title.slice(0, 70)}`)
  }
  if (hechos.length > 0) {
    console.log('\n  Los hechos se conservan tal cual: son trabajo que SÍ ocurrió y')
    console.log('  borrarlos o descartarlos falsearía el historial.')
    for (const s of hechos) console.log(`    ✓ ${s.title.slice(0, 70)}`)
  }

  if (abiertos.length === 0) { console.log('\nNada que descartar.'); return }

  if (!APPLY) {
    console.log(`\n${ABANDONAR ? 'Y el objetivo pasaría a "abandoned".' : 'El objetivo queda como está (agrega --abandonar para pasarlo a "abandoned").'}`)
    console.log('Nada se escribió. Corre con --apply cuando el reporte se vea bien.')
    return
  }

  let n = 0
  for (let i = 0; i < abiertos.length; i += 50) {
    const ids = abiertos.slice(i, i + 50).map((s) => s.id)
    const { error } = await sb.from('objective_steps')
      .update({ status: 'descartado', task_status: null }).in('id', ids)
    if (error) throw new Error(`update pasos: ${error.message}`)
    n += ids.length
  }
  console.log(`\n🔧 ${n} pasos descartados.`)

  if (ABANDONAR) {
    const { error } = await sb.from('goals').update({ status: 'abandoned' }).eq('id', GOAL)
    if (error) throw new Error(`update goal: ${error.message}`)
    console.log(`🔧 Objetivo marcado 'abandoned'.`)
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
