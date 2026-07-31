// SIR V2 — Cargar un examen médico a `health_exams` + su PDF. DRY-RUN por defecto.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// Aaron pidió (31-jul-2026) cargar su tomografía de emergencia del 27-jul y que
// entrara al historial de exámenes "para sacar información valiosa y entender mi
// cuerpo en el largo plazo".
//
// La tabla existe desde la mig 0149 y ya tiene 4 exámenes… pero **no había forma
// de cargar uno sin un navegador logueado**:
//
//   · `POST /api/salud/exams` exige sesión por cookie. No acepta token ni
//     service-role, así que un script no puede usarlo.
//   · **No existe endpoint de upload del PDF.** El único patrón de subida al bucket
//     es client-side (`lib/person-sensitive/client.ts`).
//   · `ChequeosPanel` es 100% LECTURA: ni formulario ni input de archivo.
//   · `scripts/import-health.mjs` solo escribe `sleep_records` y `health_metrics`.
//
// O sea: el historial médico era de solo-lectura en la práctica. Esto lo cierra.
//
// ═══ OJO: UN EXAMEN DE IMAGEN SIN `values` NUMÉRICOS QUEDA INERTE ════════════
//
// Verificado en el código: `health-exams/trend.ts` pivota SOLO valores que matcheen
// /^-?\d+(\.\d+)?$/, y `patterns.ts` exige ≥3 puntos monótonos. El brief lo lee
// **solo los lunes** y con ≥2 exámenes, y emite únicamente `labAlertPushLine`.
// **Ni el brief ni SIR leen `summary`, `findings` ni `recommendations`.**
//
// Consecuencia: una tomografía con `values: []` se ve en /salud y es INVISIBLE para
// toda la capa analítica. Por eso este script AVISA cuando el examen no trae ni un
// valor numérico — para no cargarlo creyendo que SIR lo va a mirar. Es la regla de
// honestidad de cobertura de CLAUDE.md aplicada a la carga: no dar por surfaceado
// lo que solo quedó guardado.
//
// Uso:
//   node scripts/import-exam.mjs --file examen.json
//   node scripts/import-exam.mjs --file examen.json --pdf informe.pdf --apply
//
// Formato del JSON (camelCase, igual que el endpoint):
//   {
//     "id": "exam_tomografia_20260727",   // opcional; determinístico → idempotente
//     "userId": "uuid",                    // opcional si hay HEALTH_INGEST_USER_ID
//     "examDate": "2026-07-27",            // REQUERIDO
//     "title": "…",                        // REQUERIDO
//     "provider": "…", "summary": "…",
//     "findings": [{ "code": "J34.3", "label": "…" }],
//     "values": [{ "name","value","unit","range","flag":"high|low|normal","category" }],
//     "recommendations": ["…"]
//   }
//
// Env (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const APPLY = process.argv.includes('--apply')
const FILE = arg('--file')
const PDF = arg('--pdf')

if (!FILE) {
  console.error('Falta --file <examen.json>. Ver el encabezado del script para el formato.')
  process.exit(1)
}

/** El bucket es el mismo que usa el endpoint (`api/salud/exams/route.ts`), y la RLS
 *  de la mig 0025 exige que la PRIMERA carpeta del path sea el userId. El
 *  service-role la salta, pero se respeta igual: si no, el usuario no podría LEER
 *  su propio PDF desde la app. */
const BUCKET = 'person-documents'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const NUMERICO = /^-?\d+(\.\d+)?$/

async function main() {
  console.log(APPLY ? '🔧 MODO ESCRITURA' : '👀 DRY-RUN (agrega --apply para escribir)')

  const ex = JSON.parse(readFileSync(FILE, 'utf8'))
  if (!ex.examDate || !ex.title) throw new Error('El JSON necesita al menos examDate y title')

  const userId = ex.userId || process.env.HEALTH_INGEST_USER_ID || process.env.READER_INGEST_USER_ID
  if (!userId) {
    // A propósito NO se adivina: esta base tiene 2 perfiles (Aaron y un admin), y
    // colgar el examen médico del usuario equivocado es exactamente lo que no puede pasar.
    const { data } = await sb.from('profiles').select('id, email').limit(10)
    console.error('No pude resolver el userId. Pásalo en el JSON como "userId". Perfiles:')
    for (const p of (data ?? [])) console.error(`  ${p.id}  ${p.email}`)
    process.exit(1)
  }

  const id = ex.id || `exam_${String(ex.title).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}_${ex.examDate.replace(/-/g, '')}`
  const values = Array.isArray(ex.values) ? ex.values : []
  const findings = Array.isArray(ex.findings) ? ex.findings : []
  const recs = Array.isArray(ex.recommendations) ? ex.recommendations : []
  // `storagePath` del JSON MANDA sobre el nombre del archivo en disco: los PDFs de
  // clínica vienen como "Apellido Nombre, Otro.pdf" y esto es un archivo que se va a
  // mirar en años. Si no viene, se cae al nombre del archivo.
  const storagePath = ex.storagePath
    ? (ex.storagePath.startsWith(`${userId}/`) ? ex.storagePath : `${userId}/exams/${ex.storagePath}`)
    : (PDF ? `${userId}/exams/${basename(PDF)}` : null)

  console.log(`\n${ex.examDate} · ${ex.provider ?? '—'}`)
  console.log(`  título : ${ex.title}`)
  console.log(`  id     : ${id}`)
  console.log(`  PDF    : ${PDF ? `${PDF} → ${BUCKET}/${storagePath}` : (storagePath ? `(ya referenciado) ${storagePath}` : 'NINGUNO')}`)
  console.log(`  ${findings.length} hallazgos · ${values.length} valores · ${recs.length} recomendaciones`)
  for (const f of findings) console.log(`    · [${f.code ?? '—'}] ${f.label ?? ''}`)
  for (const v of values) {
    const flag = v.flag && v.flag !== 'normal' ? ` ⚠️ ${v.flag}` : ''
    console.log(`    · ${v.name}: ${v.value}${v.unit ?? ''}${v.range ? ` (ref ${v.range})` : ''}${flag}`)
  }

  // Aviso de INERCIA: ver el encabezado. No bloquea, pero que no sorprenda después.
  const numericos = values.filter((v) => NUMERICO.test(String(v.value ?? '')))
  if (numericos.length === 0) {
    console.log('\n⚠️  ESTE EXAMEN NO TRAE NI UN VALOR NUMÉRICO.')
    console.log('   Se va a ver en /salud, pero es INVISIBLE para la capa analítica:')
    console.log('   `trend.ts` solo pivota valores numéricos y `patterns.ts` exige ≥3 puntos.')
    console.log('   Ni el brief ni SIR leen summary/findings/recommendations. No esperes')
    console.log('   que SIR lo cruce solo: hoy no hay con qué.')
  } else {
    console.log(`\n${numericos.length} valor(es) numérico(s) → entran a tendencias con ≥2 exámenes que compartan el nombre del analito.`)
  }

  if (PDF && !existsSync(PDF)) throw new Error(`No existe el PDF: ${PDF}`)

  const { data: prev } = await sb.from('health_exams').select('id').eq('id', id).maybeSingle()
  if (prev) console.log(`\nYa existe un examen con id ${id} → se ACTUALIZA (upsert), no se duplica.`)

  if (!APPLY) { console.log('\nNada se escribió. Corre con --apply cuando el reporte se vea bien.'); return }

  if (PDF) {
    const bytes = readFileSync(PDF)
    const { error } = await sb.storage.from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
    if (error) throw new Error(`upload del PDF: ${error.message}`)
    console.log(`🔧 PDF subido a ${BUCKET}/${storagePath}`)
  }

  const row = {
    id, user_id: userId,
    exam_date: ex.examDate,
    provider: ex.provider ?? null,
    title: ex.title,
    summary: ex.summary ?? null,
    findings, values, recommendations: recs,
    storage_path: storagePath,
  }
  const { error } = await sb.from('health_exams').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`upsert health_exams: ${error.message}`) // PostgREST no lanza
  console.log(`🔧 examen guardado: ${id}`)
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
