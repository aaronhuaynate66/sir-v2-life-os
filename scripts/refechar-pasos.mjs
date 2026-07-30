// SIR V2 — Re-fechar (o descartar) pasos sueltos por decisión de Aaron. DRY-RUN por defecto.
//
// POR QUÉ EXISTE. `descartar-pasos.mjs` opera sobre un objetivo COMPLETO, que es lo
// correcto cuando el plan entero murió (Boticas, los dos de ingresos). Pero cuando el
// plan está vivo y solo quedaron sobras vencidas de una versión anterior, hace falta
// tocar pasos UNO POR UNO — y algunos re-fechando, otros descartando.
//
// Caso que lo motivó (30-jul-2026): Aaron pidió "re-fecha los del Mundial". Sus 34
// pasos ya tienen un plan real por bloques (armado el 25-jul), y los 4 vencidos son
// sobras del plan genérico de junio. Dos se re-fechan; los otros dos NO se pueden
// re-fechar sin crear una tarea falsa, y eso se dice en vez de hacerse en silencio.
//
// NO ES UN BARRIDO. Va por lista explícita y verifica el TÍTULO antes de escribir: si
// el paso ya no existe o cambió de nombre, se salta y se reporta. Nunca a ciegas.
//
// Uso:  node scripts/refechar-pasos.mjs            (dry-run)
//       node scripts/refechar-pasos.mjs --apply

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}
const APPLY = process.argv.includes('--apply')

/**
 * Cada entrada: fragmento del título (huella), y qué hacer.
 *   { fecha }   → re-fechar a esa fecha
 *   { descartar, motivo } → status 'descartado' con el motivo escrito acá
 */
const PLAN = [
  {
    fragmento: 'Verificar criterios de clasificación para el Mundial',
    fecha: '2026-08-06',
    nota: 'Sigue abierto y GATEA la inscripción oficial del 31-ago. De wfg26.com ya se '
      + 'sabe la sede, las fechas y las divisiones (-58/59-68/69-80/80+); lo que falta es '
      + 'el reglamento de PESAJE y el cierre de inscripción, que la web no publica '
      + '("Rules and Guidelines will be shared closer to the event") → hay que preguntarle '
      + 'a Contactus@wfg26.com.',
  },
  {
    fragmento: 'Inscribirme en selectivo nacional o competencia clasificatoria',
    fecha: '2026-08-20',
    nota: 'Condicional ("si aplica") y depende del paso de arriba. Se fecha antes del '
      + 'registro oficial del 31-ago para que no llegue tarde si resulta que aplica.',
  },
  {
    fragmento: 'Bajar a peso competitivo objetivo mediante plan nutricional',
    descartar: true,
    motivo: 'contradice una decisión de Aaron (categoría +80)',
    nota: 'NO se re-fecha a propósito. Su categoría es +80 kg (división ABIERTA, sin '
      + 'techo) y él lo zanjó el 25-jul: "yo peleo en más de 80". El objetivo tiene el hito '
      + '"Mantenerme sobre 81 kg hasta el pesaje", y el aviso de peso tiene tests que '
      + 'prohíben sugerir cambiar de categoría. Re-fecharlo resucitaría justo lo que se '
      + 'decidió no reabrir. Lo vigente es RECOMPOSICIÓN: mismo peso, más músculo.',
  },
  {
    fragmento: 'Contratar entrenador especializado en preparación para bomberos',
    descartar: true,
    motivo: 'ya cubierto: tiene coach',
    nota: 'Superado por los hechos. Ya hay coach y el plan técnico con él es un paso vivo '
      + '("Cerrar el plan técnico con el coach", 3-ago). Re-fecharlo le pondría en la lista '
      + '"contratar un entrenador" cuando ya tiene uno — el tipo de ruido que se viene '
      + 'sacando todo el día.',
  },
]

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  console.log(APPLY ? '── MODO APLICAR ──\n' : '── DRY-RUN (usa --apply para escribir) ──\n')

  let hechos = 0
  for (const item of PLAN) {
    const { data, error } = await sb
      .from('objective_steps')
      .select('id, title, status, target_date')
      .eq('status', 'pendiente')
      .ilike('title', `%${item.fragmento}%`)
    if (error) { console.error('  ERROR:', error.message); continue }
    const filas = data ?? []
    if (filas.length === 0) {
      console.log(`(nada) no hay paso pendiente con: "${item.fragmento.slice(0, 55)}…"\n`)
      continue
    }
    for (const f of filas) {
      const accion = item.descartar
        ? `DESCARTAR (${item.motivo})`
        : `RE-FECHAR ${f.target_date} → ${item.fecha}`
      console.log(`${item.descartar ? '🗑' : '📅'} ${f.title.slice(0, 68)}`)
      console.log(`   ${accion}`)
      console.log(`   por qué: ${item.nota}`)
      if (!APPLY) { console.log('   → no escrito (dry-run)\n'); hechos++; continue }
      const patch = item.descartar
        ? { status: 'descartado' }
        : { target_date: item.fecha }
      const { error: upErr } = await sb.from('objective_steps').update(patch).eq('id', f.id)
      if (upErr) console.error('   ✗ falló:', upErr.message)
      else { console.log('   ✓ aplicado\n'); hechos++ }
    }
  }

  // Control de cobertura: cuántos vencidos quedan en el Mundial después de esto.
  const HOY = new Date().toISOString().slice(0, 10)
  const { data: g } = await sb.from('goals').select('id').ilike('title', '%Mundial%').maybeSingle()
  if (g?.id) {
    const { data: st } = await sb.from('objective_steps')
      .select('title,status,target_date').eq('objective_id', g.id)
    const venc = (st ?? []).filter((s) => s.status === 'pendiente' && s.target_date && s.target_date < HOY)
    console.log(`${APPLY ? 'aplicados' : 'se aplicarían'}: ${hechos}`)
    console.log(`vencidos que quedan en el Mundial: ${venc.length}`)
    for (const s of venc) console.log(`   ${s.target_date}  ${s.title.slice(0, 60)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
