// SIR V2 — Cargar RECETAS a `med_prescriptions` + `med_prescription_items`,
// y materializar sus recordatorios. DRY-RUN por defecto.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// Aaron, 3-ago-2026: *"tienes todas las recetas, fotos de medicamentos, etc. porque
// no lo has puesto, pon los agentes a trabajar y lo haces retroactivo"*.
//
// Tres agentes de investigación inventariaron la evidencia real. Lo que se carga acá
// sale de fuentes con fecha verificable, NO de inferencia:
//
//   · Receta del NEURÓLOGO (10-jul-2026, Dr. Paz, SANNA): del correo de la clínica.
//     Topiramato 100 mg y ergotamina+cafeína, con la indicación textual.
//   · Receta de EMERGENCIA (27-jul-2026, Dr. Cano Donayre): del resumen del examen
//     ya cargado en `health_exams`.
//   · Receta del MAXILOFACIAL (3-ago-2026, Dr(a) Campos): del correo de la clínica.
//   · Esquema NOCTURNO declarado por Aaron el 3-ago: topiramato 100 mg y clonazepam
//     2 mg, ambos antes de dormir.
//
// ═══ LO QUE NO SE CARGA, Y POR QUÉ ═══════════════════════════════════════════
//
// · **Silimarina y ácido ursodesoxicólico NO son de Aaron: son del perro (Logan).**
//   Un agente los reportó como suyos con pauta completa; otro encontró la cita
//   textual donde él responde "Para logan". Cargarlos habría inventado un
//   tratamiento hepático que no existe.
// · **El clonazepam del 24-feb-2025 no es todo suyo**: "Una es Pa mí y la otra para
//   mi padrastro".
// · Nada anterior a 2026 se carga como TOMA. Hay ~5 años de uso de ergotamina
//   declarado en chats, pero las fechas de COMPRA no son fechas de toma. Inventar
//   tomas para llenar el histórico sería falsear la adherencia.
//
// Uso:
//   node scripts/import-recetas.mjs
//   node scripts/import-recetas.mjs --apply
//   node scripts/import-recetas.mjs --apply --con-recordatorios

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}
const APPLY = process.argv.includes('--apply')
const CON_RECORDATORIOS = process.argv.includes('--con-recordatorios')
const UID = '5c23c82c-2beb-401b-8555-706ac0b81248'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Ids determinísticos → el script es idempotente (se puede correr dos veces). */
const RECETAS = [
  {
    id: 'presc_neuro_20260710',
    reason: 'Migraña sin aura (migraña común). El neurólogo subió el topiramato de 50 a 100 mg.',
    diagnosis: 'G43.0 — Migraña sin aura, diagnóstico DEFINITIVO',
    prescribed_by: 'Dr(a) Paz — Neurología clínica',
    provider: 'SANNA Clínica San Borja',
    source: 'correo',
    started_on: '2026-07-10',
    ends_on: null,
    status: 'activa',
    note: 'Pidió además 5 laboratorios (TGP, TGO, glucosa, hemograma, creatinina) que NO se hicieron: son el monitoreo del topiramato. La orden venció el 17-jul. Y la ergotamina se recetó 4 días ANTES de que la angio-TEM del 14-jul encontrara el aneurisma de carótida interna derecha; el neurólogo todavía no vio ese informe.',
    items: [
      {
        id: 'presci_neuro_topiramato',
        med_name: 'Topiramato',
        dose: '100 mg',
        every_hours: 24,
        times_per_day: null,
        duration_days: null,
        total_units: 30,
        indication: '1 TAB EN AYUNAS',
        // La hora que Aaron declaró: 22:00. OJO, discrepa de la receta ("en ayunas").
        hora: '22:00',
        nota_hora: 'La receta dice EN AYUNAS; Aaron declaró el 3-ago que lo toma de noche antes de dormir. Sin aclarar.',
      },
      {
        id: 'presci_neuro_ergotamina',
        med_name: 'Ergonex Plus',
        dose: 'ergotamina 1 mg + cafeína 100 mg',
        // A DEMANDA: `every_hours` va en NULL a propósito, aunque la receta diga
        // "cada 24 hora". Ahí las 24 h son un MÁXIMO, no un horario: se toma al
        // empezar el dolor. Con every_hours=24 el panel decía "falta la de hoy"
        // todos los días, o sea le reclamaba un fármaco de rescate como si fuera
        // pauta fija. Sin pauta, `tomasPorDia` devuelve null y no se espera ninguna.
        every_hours: null,
        times_per_day: null,
        duration_days: null,
        total_units: 15,
        indication: '1 TAB AL COMENZAR EL DOLOR (máximo cada 24 h) — a demanda',
        hora: null, // condicional: no se agenda recordatorio
      },
    ],
  },
  {
    id: 'presc_emergencia_20260727',
    reason: 'Traumatismo facial por agresión (agresión con fuerza corporal en la vía pública).',
    diagnosis: 'S07.0 / trauma facial — con 4 días de descanso médico (27 al 30-jul)',
    prescribed_by: 'Dr. Carlos Enrique Cano Donayre (CMP 53490)',
    provider: 'SANNA Clínica San Borja — Emergencia',
    source: 'retroactivo',
    started_on: '2026-07-27',
    ends_on: '2026-07-31',
    status: 'completada',
    note: 'Reconstruida del resumen del examen de emergencia ya cargado en health_exams. Nunca se registró ninguna toma de este curso.',
    items: [
      { id: 'presci_emerg_paracetramadol', med_name: 'Paracetamol + Tramadol', dose: null, every_hours: 12, times_per_day: null, duration_days: 5, total_units: 10, indication: 'Cada 12 horas por 5 días', hora: null },
      { id: 'presci_emerg_ketoprofeno', med_name: 'Ketoprofeno', dose: '100 mg', every_hours: 12, times_per_day: null, duration_days: 5, total_units: 10, indication: '100 mg cada 12 horas por 5 días', hora: null },
      { id: 'presci_emerg_indometacina', med_name: 'Indometacina spray dérmico 1%', dose: '1 %', every_hours: 8, times_per_day: null, duration_days: null, total_units: null, indication: 'Cada 8 horas en pómulo derecho', hora: null },
    ],
  },
  {
    id: 'presc_maxilo_20260803',
    reason: 'Trastornos de la articulación temporomaxilar (ATM), presuntivo, secuela de la agresión del 27-jul.',
    diagnosis: 'Trastornos de la articulación temporomaxilar — PRESUNTIVO · Agresión con fuerza corporal — DEFINITIVO',
    prescribed_by: 'Dr(a) Campos — Odontología / Cirugía maxilofacial',
    provider: 'SANNA Clínica San Borja',
    source: 'correo',
    started_on: '2026-08-03',
    ends_on: '2026-08-09',
    status: 'activa',
    note: 'OJO con dos cruces: el etoricoxib puede subir la presión arterial y el examen médico del IPD es el 7-ago (puerta al Mundial); y la orfenadrina es anticolinérgica, que sumada al topiramato reduce la sudoración — compite en Arabia Saudita en noviembre.',
    items: [
      { id: 'presci_maxilo_orfenadrina', med_name: 'Orfenadrina', dose: '100 mg', every_hours: 24, times_per_day: null, duration_days: 7, total_units: 7, indication: 'Tomar 01 cada 24 horas por 7 días.', hora: '22:00' },
      { id: 'presci_maxilo_etoricoxib', med_name: 'Etoricoxib', dose: '120 mg', every_hours: 24, times_per_day: null, duration_days: 7, total_units: 7, indication: 'Tomar 01 cada 24 horas por 7 dias.', hora: '22:00' },
    ],
  },
  {
    id: 'presc_clonazepam_nocturno',
    reason: 'Insomnio crónico. Aaron lo declaró el 3-ago-2026: 2 mg todas las noches antes de dormir.',
    diagnosis: null,
    prescribed_by: 'Fernando Brañez (su padrastro) — NO está en la receta del neurólogo',
    provider: null,
    source: 'manual',
    started_on: '2026-08-03',
    ends_on: null,
    status: 'activa',
    note: 'DATO PARA LA PRÓXIMA CONSULTA: este fármaco no aparece en la receta del neurólogo del 10-jul, que es quien maneja su migraña. En el chat el uso se rastrea hasta 2021-02-07. La fecha de inicio de esta fila es la de REGISTRO, no la del inicio real del tratamiento: no se puede fechar con la data disponible.',
    items: [
      { id: 'presci_clonazepam', med_name: 'Clonazepam', dose: '2 mg', every_hours: 24, times_per_day: null, duration_days: null, total_units: null, indication: '2 mg antes de dormir (declarado por Aaron, no hay receta escrita)', hora: '22:00' },
    ],
  },
]

console.log(APPLY ? '🔧 MODO ESCRITURA\n' : '👀 DRY-RUN (agrega --apply)\n')

let nRec = 0, nItems = 0
for (const r of RECETAS) {
  console.log(`── ${r.id}`)
  console.log(`   ${r.reason}`)
  console.log(`   ${r.prescribed_by ?? 'sin médico'} · ${r.started_on}${r.ends_on ? ` → ${r.ends_on}` : ' → sin fin'} · ${r.status}`)
  for (const i of r.items) {
    console.log(`     · ${i.med_name}${i.dose ? ` ${i.dose}` : ''} — «${i.indication}»${i.hora ? ` [recordatorio ${i.hora}]` : ' [sin recordatorio]'}`)
  }
  if (!APPLY) { nRec++; nItems += r.items.length; continue }

  const { error: pe } = await sb.from('med_prescriptions').upsert({
    id: r.id, user_id: UID, reason: r.reason, diagnosis: r.diagnosis,
    prescribed_by: r.prescribed_by, provider: r.provider, source: r.source,
    started_on: r.started_on, ends_on: r.ends_on, status: r.status, note: r.note,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (pe) { console.log(`   ❌ receta: ${pe.message}`); continue }
  nRec++

  for (const i of r.items) {
    const { error: ie } = await sb.from('med_prescription_items').upsert({
      id: i.id, prescription_id: r.id, user_id: UID, med_name: i.med_name, dose: i.dose,
      every_hours: i.every_hours, times_per_day: i.times_per_day, duration_days: i.duration_days,
      total_units: i.total_units, indication: i.indication,
    }, { onConflict: 'id' })
    if (ie) { console.log(`   ❌ ítem ${i.med_name}: ${ie.message}`); continue }
    nItems++
  }
}
console.log(`\n${APPLY ? '🔧' : '→'} ${nRec} recetas · ${nItems} medicamentos`)

// ─── Recordatorios ───────────────────────────────────────────────────────────
// Se MATERIALIZAN (una fila de `reminders` por día) en vez de tocar el cron: la tabla
// no tiene recurrencia y añadirla rompería la invariante "un row = un aviso" en la que
// se apoya `notified_at`. Ver el informe del mapa de recordatorios.
//
// Un solo aviso por día que nombra TODOS los medicamentos de esa noche: el cron corre
// 1×/día (plan Hobby) y el lookahead es de 36 h, así que prometer "a las 22:00 exactas"
// sería mentir. Se agrupa, que es lo que la infra sí puede cumplir.
if (CON_RECORDATORIOS) {
  const HOY = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)
  const activas = RECETAS.filter((r) => r.status === 'activa')

  // Se agrupa por (FECHA + HORA) atravesando TODAS las recetas, no por receta.
  // Si no, el 3-ago habría tres avisos distintos a las 22:00 —topiramato, clonazepam
  // y los dos del maxilofacial— porque vienen de recetas diferentes. Tres mensajes
  // para una sola toma es exactamente el muro de notificaciones que Aaron ya rechazó.
  const porMomento = new Map()
  for (const r of activas) {
    for (const i of r.items) {
      if (!i.hora) continue
      // El curso CON duración se cuenta desde que empezó (para no pasarse del día 7).
      // Lo CRÓNICO se cuenta desde HOY: el topiramato arrancó el 10-jul, así que una
      // ventana de 14 días desde `started_on` caía entera en el pasado y el fármaco
      // que toma todas las noches se quedaba SIN NINGÚN recordatorio, en silencio.
      const cronico = i.duration_days === null
      const desde = cronico ? HOY : r.started_on
      const dias = i.duration_days ?? 14 // lo crónico se re-materializa cada 2 semanas
      for (let d = 0; d < dias; d++) {
        const fecha = new Date(Date.parse(`${desde}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10)
        if (fecha < HOY) continue // no agendar el pasado
        const clave = `${fecha}|${i.hora}`
        const g = porMomento.get(clave) ?? { fecha, hora: i.hora, meds: [], presc: r.id }
        g.meds.push(`${i.med_name}${i.dose ? ` ${i.dose}` : ''}`)
        porMomento.set(clave, g)
      }
    }
  }
  const plan = [...porMomento.values()]
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    .map((g) => ({
      id: `rem_med_${g.fecha}_${g.hora.replace(':', '')}`,
      user_id: UID,
      text: `💊 ${g.meds.join(' + ')}`,
      due_at: `${g.fecha}T${g.hora}:00-05:00`,
      // Se apunta a una receta para poder borrar en bloque si se suspende. Cuando el
      // aviso junta varias, queda la que lo originó primero — es un enlace de
      // limpieza, no de contabilidad.
      med_prescription_id: g.presc,
    }))
  console.log(`\n${APPLY ? '🔧' : '→'} ${plan.length} recordatorios (uno por día, agrupando los medicamentos de esa toma)`)
  for (const p of plan.slice(0, 6)) console.log(`   ${p.due_at.slice(0, 16)}  ${p.text}`)
  if (plan.length > 6) console.log(`   … y ${plan.length - 6} más`)
  if (APPLY && plan.length > 0) {
    const { error } = await sb.from('reminders').upsert(plan, { onConflict: 'id' })
    if (error) console.log(`   ❌ recordatorios: ${error.message}`)
    else console.log('   🔧 recordatorios guardados')
  }
}

if (!APPLY) console.log('\nNada se escribió. Corre con --apply cuando el reporte se vea bien.')
