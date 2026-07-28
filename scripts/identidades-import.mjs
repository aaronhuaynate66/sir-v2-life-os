// SIR V2 — Aplica el identidades.xlsx lleno. Espejo de la bandeja "¿quién es
// quién?" de la app (src/app/api/social/unmatched/route.ts), pero en lote.
//
// DRY-RUN POR DEFECTO: sin `--apply` no escribe NADA, solo dice qué haría. Es la
// regla del repo — nada de escritura silenciosa sobre la data de Aaron.
//
//   node scripts/identidades-import.mjs identidades.xlsx           → plan
//   node scripts/identidades-import.mjs identidades.xlsx --apply   → escribe
//
// Hace, por cada fila de "Asignar IG":
//   · "No es un contacto" = x   → borra la fila de la bandeja
//   · "Es esta persona"         → setea instagram_handle, promueve la actividad a
//                                 contact_activity, copia la cara a la galería y
//                                 limpia la bandeja
//   · "Crear nuevo contacto"    → crea la persona y hace lo mismo
// Y de "Personas": actualiza instagram/linkedin/teléfono/email que hayan cambiado.
//
// Se salta (sin escribir) y REPORTA: filas con más de una columna llena, nombres
// del desplegable que resuelven a dos personas, y handles ya tomados por otro
// contacto. Preferimos dejarlo sin hacer y decirlo, antes que adivinar.

import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv('.env.local')
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const UID = env.READER_INGEST_USER_ID || '5c23c82c-2beb-401b-8555-706ac0b81248'
if (!URL || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(2) }

const FILE = process.argv[2] || 'identidades.xlsx'
const APPLY = process.argv.includes('--apply')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const AVATAR_BUCKET = 'person-avatars'
const DEDUP_HOURS = 36

const api = async (method, path, body, extraHeaders = {}) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method, headers: { ...H, ...extraHeaders }, body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  const txt = await r.text()
  return txt ? JSON.parse(txt) : null
}
const get = (path) => api('GET', path)

const canonHandle = (h) => String(h ?? '').trim().replace(/^@/, '').toLowerCase()
const slugify = (n) => String(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(FILE)
const hojaA = wb.getWorksheet('Asignar IG')
const hojaP = wb.getWorksheet('Personas')
if (!hojaA || !hojaP) { console.error('El archivo no tiene las hojas "Asignar IG" y "Personas".'); process.exit(2) }

console.log(`${APPLY ? '🟢 APLICANDO' : '🔍 DRY-RUN (no escribe nada)'} — ${FILE}\n`)

const people = await get('people?select=id,name,instagram_handle,linkedin_url,phone_number,email,organization&limit=2000')
const byId = new Map(people.map((p) => [p.id, p]))
// El desplegable muestra el nombre (a veces con "(org)" para desambiguar).
const byLabel = new Map()
for (const p of people) {
  for (const k of [String(p.name ?? '').trim(), p.organization ? `${p.name} (${p.organization})` : null]) {
    if (!k) continue
    if (!byLabel.has(k)) byLabel.set(k, [])
    byLabel.get(k).push(p)
  }
}
const handleOwner = new Map()
for (const p of people) if (p.instagram_handle) handleOwner.set(canonHandle(p.instagram_handle), p)

const cel = (row, n) => {
  const v = row.getCell(n).value
  if (v == null) return ''
  if (typeof v === 'object' && 'text' in v) return String(v.text).trim()
  return String(v).trim()
}

const plan = { asignar: [], crear: [], descartar: [], identidad: [], saltadas: [] }

// ── Hoja "Asignar IG" ───────────────────────────────────────────────────────
hojaA.eachRow((row, i) => {
  if (i === 1) return
  const id = cel(row, 1)
  const handle = canonHandle(cel(row, 2))
  const asignar = cel(row, 6)
  const nuevo = cel(row, 7)
  const descartar = cel(row, 8).toLowerCase()
  if (!id) return

  const llenas = [asignar && 'asignar', nuevo && 'crear', descartar === 'x' && 'descartar'].filter(Boolean)
  if (llenas.length === 0) return
  if (llenas.length > 1) {
    plan.saltadas.push(`fila ${i} (@${handle}): llenaste ${llenas.join(' y ')} — usa solo una`)
    return
  }

  if (descartar === 'x') { plan.descartar.push({ id, handle }); return }

  if (asignar) {
    const matches = byLabel.get(asignar) ?? []
    if (matches.length === 0) { plan.saltadas.push(`fila ${i} (@${handle}): "${asignar}" no está en Personas`); return }
    if (matches.length > 1) { plan.saltadas.push(`fila ${i} (@${handle}): "${asignar}" resuelve a ${matches.length} personas — desambigua`); return }
    const dueño = handleOwner.get(handle)
    if (dueño && dueño.id !== matches[0].id) {
      plan.saltadas.push(`fila ${i} (@${handle}): ese handle ya es de ${dueño.name}`)
      return
    }
    plan.asignar.push({ id, handle, person: matches[0] })
    return
  }

  if (nuevo) {
    if (byLabel.has(nuevo)) { plan.saltadas.push(`fila ${i} (@${handle}): "${nuevo}" YA existe — elígelo del desplegable`); return }
    plan.crear.push({ id, handle, name: nuevo })
  }
})

// ── Hoja "Personas": identidades editadas a mano ────────────────────────────
const CAMPOS = [
  { col: 3, key: 'instagram_handle', norm: canonHandle },
  { col: 4, key: 'linkedin_url', norm: (v) => String(v).trim() },
  { col: 5, key: 'phone_number', norm: (v) => String(v).trim() },
  { col: 6, key: 'email', norm: (v) => String(v).trim().toLowerCase() },
]
hojaP.eachRow((row, i) => {
  if (i === 1) return
  const id = cel(row, 1)
  const p = byId.get(id)
  if (!p) return
  const cambios = {}
  for (const f of CAMPOS) {
    const nuevo = cel(row, f.col) ? f.norm(cel(row, f.col)) : ''
    const viejo = p[f.key] ? f.norm(p[f.key]) : ''
    if (nuevo && nuevo !== viejo) cambios[f.key] = nuevo
  }
  if (Object.keys(cambios).length > 0) plan.identidad.push({ id, name: p.name, cambios })
})

// ── Reporte ─────────────────────────────────────────────────────────────────
console.log(`Asignar a contacto existente : ${plan.asignar.length}`)
for (const a of plan.asignar.slice(0, 12)) console.log(`   @${a.handle} → ${a.person.name}`)
if (plan.asignar.length > 12) console.log(`   … y ${plan.asignar.length - 12} más`)

console.log(`\nCrear contacto nuevo         : ${plan.crear.length}`)
for (const c of plan.crear.slice(0, 12)) console.log(`   @${c.handle} → ${c.name} (nuevo)`)
if (plan.crear.length > 12) console.log(`   … y ${plan.crear.length - 12} más`)

console.log(`\nDescartar (no es contacto)   : ${plan.descartar.length}`)
console.log(`Identidades a actualizar     : ${plan.identidad.length}`)
for (const u of plan.identidad.slice(0, 12)) console.log(`   ${u.name}: ${Object.entries(u.cambios).map(([k, v]) => `${k}=${v}`).join(', ')}`)
if (plan.identidad.length > 12) console.log(`   … y ${plan.identidad.length - 12} más`)

if (plan.saltadas.length) {
  console.log(`\n⚠️  Saltadas (${plan.saltadas.length}) — no se toca nada de estas:`)
  for (const s of plan.saltadas) console.log(`   · ${s}`)
}

const total = plan.asignar.length + plan.crear.length + plan.descartar.length + plan.identidad.length
if (!APPLY || total === 0) {
  console.log(!APPLY
    ? `\n${total} cambios listos. Para aplicarlos:\n   node scripts/identidades-import.mjs ${FILE} --apply`
    : '\nNada que aplicar.')
} else {
  await aplicar()
}

// ── Aplicar ─────────────────────────────────────────────────────────────────
async function aplicar() {
const nowIso = new Date().toISOString()
const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString()
let ok = 0, fail = 0

/** Promueve la actividad guardada del handle a contact_activity y limpia la
 *  bandeja. Mismo comportamiento que la app (route.ts:218-237). */
async function promover(personId, handle, fallbackId) {
  const filas = handle
    ? await get(`unmatched_social_activity?select=id,kind,detail,observed_at,platform,avatar_path&handle=eq.${handle}`)
    : await get(`unmatched_social_activity?select=id,kind,detail,observed_at,platform,avatar_path&id=eq.${fallbackId}`)
  const ids = []
  for (const u of filas) {
    const rec = await get(`contact_activity?select=id&person_id=eq.${personId}&kind=eq.${u.kind}&observed_at=gte.${sinceIso}&limit=1`)
    if (!rec.length) {
      await api('POST', 'contact_activity', {
        user_id: UID, person_id: personId, kind: u.kind, detail: u.detail,
        source: u.platform, observed_at: u.observed_at,
      })
    }
    // Bootstrap de la galería de caras: si el contacto no tiene avatar y la señal
    // trajo una foto, se copia. Así el match por cara se enciende solo.
    if (u.avatar_path) {
      const ya = await get(`person_avatars?select=person_id&person_id=eq.${personId}&limit=1`)
      if (!ya.length) {
        const ext = (u.avatar_path.split('.').pop() || 'jpg').toLowerCase()
        const dest = `${UID}/${personId}.${ext}`
        const cp = await fetch(`${URL}/storage/v1/object/copy`, {
          method: 'POST', headers: H,
          body: JSON.stringify({ bucketId: AVATAR_BUCKET, sourceKey: u.avatar_path, destinationKey: dest }),
        })
        if (cp.ok) {
          await api('POST', 'person_avatars', { user_id: UID, person_id: personId, storage_path: dest, updated_at: nowIso },
            { Prefer: 'resolution=merge-duplicates' })
        }
      }
    }
    ids.push(u.id)
  }
  if (ids.length) await api('DELETE', `unmatched_social_activity?id=in.(${ids.join(',')})`)
  return ids.length
}

for (const a of plan.asignar) {
  try {
    await api('PATCH', `people?id=eq.${a.person.id}`, { instagram_handle: a.handle, updated_at: nowIso })
    await promover(a.person.id, a.handle, a.id)
    console.log(`✓ @${a.handle} → ${a.person.name}`); ok++
  } catch (e) { console.error(`✗ @${a.handle}: ${e.message}`); fail++ }
}

for (const c of plan.crear) {
  try {
    const id = `per_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await api('POST', 'people', {
      id, user_id: UID, name: c.name, slug: slugify(c.name),
      relationship: 'acquaintance', category: 'network',
      importance_score: 5, energy_impact: 'neutral', trust_level: 5,
      instagram_handle: c.handle,
      notes: 'Creado desde el Excel de identidades',
    })
    await promover(id, c.handle, c.id)
    console.log(`✓ creado ${c.name} ← @${c.handle}`); ok++
  } catch (e) { console.error(`✗ ${c.name}: ${e.message}`); fail++ }
}

for (const d of plan.descartar) {
  try { await api('DELETE', `unmatched_social_activity?id=eq.${d.id}`); ok++ }
  catch (e) { console.error(`✗ descartar @${d.handle}: ${e.message}`); fail++ }
}
if (plan.descartar.length) console.log(`✓ ${plan.descartar.length} descartadas`)

for (const u of plan.identidad) {
  try {
    await api('PATCH', `people?id=eq.${u.id}`, { ...u.cambios, updated_at: nowIso })
    console.log(`✓ ${u.name}: ${Object.keys(u.cambios).join(', ')}`); ok++
  } catch (e) { console.error(`✗ ${u.name}: ${e.message}`); fail++ }
}

const quedan = await fetch(`${URL}/rest/v1/unmatched_social_activity?select=*`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
console.log(`\n${ok} aplicados · ${fail} fallidos`)
console.log(`Quedan en la bandeja: ${quedan.headers.get('content-range')?.split('/')[1] ?? '?'}`)
}
