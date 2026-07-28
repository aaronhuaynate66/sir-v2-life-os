// SIR V2 — Genera identidades.xlsx para alinear "quién es quién" de una sentada.
//
// POR QUÉ EXISTE (pedido de Aaron, 28-jul-2026):
//   "para de una vez cerrar este tema de alinear quién es quién entre Instagram y
//    los perfiles de SIR, ¿podemos crear un excel y yo te digo 'es una persona' de
//    una lista desplegable, o si no existe lo creo al toque? porque así como sale
//    en el app el UX/UI no me ayuda mucho, e ideal si de una vez juntamos
//    LinkedIn, Insta, SIR, WhatsApp"
//
// El problema medido: 141 cuentas en la bandeja y CERO con nombre. La bandeja de
// la app resuelve UNA por vez y hay que mirar cada cara; un Excel con desplegable
// se llena en lote y sin fricción.
//
// Uso:
//   node scripts/identidades-export.mjs            → identidades.xlsx
//   node scripts/identidades-export.mjs mi.xlsx    → nombre propio
//
// Después se llena a mano y se aplica con `identidades-import.mjs` (que hace
// dry-run por defecto: nada se escribe sin --apply).
//
// SOLO LEE. Ninguna escritura en la base.

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
if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(2)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const OUT = process.argv[2] || 'identidades.xlsx'

async function get(table, qs) {
  const rows = []
  for (let off = 0; off < 20000; off += 1000) {
    const r = await fetch(`${URL}/rest/v1/${table}?${qs}&limit=1000&offset=${off}`, { headers: H })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${(await r.text()).slice(0, 200)}`)
    const page = await r.json()
    if (!Array.isArray(page) || page.length === 0) break
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

console.log('Leyendo la base…')
const people = await get('people', 'select=id,name,instagram_handle,linkedin_url,phone_number,email,organization,relationship')
const unmatched = await get('unmatched_social_activity', 'select=id,platform,handle,name,avatar_url,observed_at,kind')
const following = await get('social_following', 'select=handle,display_name')
const profiles = await get('social_profiles', 'select=handle,full_name,followers_count,posts_count,category,is_business')

// Cuántos mensajes de WhatsApp hay por persona → "¿de quién tengo historial?".
const msgCounts = new Map()
for (const p of people) {
  const r = await fetch(`${URL}/rest/v1/chat_messages?select=*&person_id=eq.${p.id}`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  })
  if (r.ok) {
    const n = Number(r.headers.get('content-range')?.split('/')[1] ?? 0)
    if (n > 0) msgCounts.set(p.id, n)
  }
}

// Nombre para el desplegable. Si dos personas se llaman igual, se desambigua con
// la organización — si no, al importar sería imposible saber a cuál se refería.
const nameCount = new Map()
for (const p of people) {
  const n = (p.name ?? '').trim()
  if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1)
}
function labelFor(p) {
  const n = (p.name ?? '').trim()
  if (nameCount.get(n) > 1 && p.organization) return `${n} (${p.organization})`
  return n
}
const labels = people.map(labelFor).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))

// Lo que ya sabemos de cada handle, para no hacerle adivinar.
const nameByHandle = new Map()
for (const f of following) if (f.display_name) nameByHandle.set(String(f.handle).toLowerCase(), f.display_name)
const profByHandle = new Map()
for (const p of profiles) profByHandle.set(String(p.handle).toLowerCase(), p)

const wb = new ExcelJS.Workbook()
wb.creator = 'SIR'
wb.created = new Date()

// ── Hoja 1: instrucciones ───────────────────────────────────────────────────
const guia = wb.addWorksheet('Cómo llenar')
guia.columns = [{ width: 110 }]
const lineas = [
  ['SIR — alinear quién es quién', true],
  ['', false],
  [`Generado con ${unmatched.length} cuentas sin asignar y ${people.length} contactos.`, false],
  ['', false],
  ['HOJA "Asignar IG" — una fila por cuenta de Instagram que SIR vio y no supo de quién es.', true],
  ['  · Columna "Es esta persona": elige del desplegable. Eso vincula la cuenta a ese contacto.', false],
  ['  · Columna "Crear nuevo contacto": si no existe, escribe el nombre completo. Se crea y se vincula.', false],
  ['  · Columna "No es un contacto": pon una x si es un negocio, marca o desconocido. Se descarta.', false],
  ['  · Deja la fila vacía si no sabes: no pasa nada, vuelve a salir la próxima vez.', false],
  ['  · Usa UNA sola de las tres columnas por fila.', false],
  ['', false],
  ['HOJA "Personas" — tus contactos y qué identidad tiene cada uno.', true],
  ['  · Sirve para ver huecos: a quién le falta Instagram, LinkedIn, teléfono o correo.', false],
  ['  · Puedes escribir directo en esas celdas y se guardan igual que la otra hoja.', false],
  ['  · NO cambies la columna "id": es lo que usa SIR para saber de quién hablas.', false],
  ['', false],
  ['CUANDO TERMINES: guarda el archivo y avísame. Corro el importador, que primero', true],
  ['muestra qué va a hacer y recién escribe cuando se lo confirmo.', false],
]
for (const [txt, bold] of lineas) {
  const row = guia.addRow([txt])
  if (bold) row.font = { bold: true }
}

// ── Hoja 2: Personas (matriz de identidad) ──────────────────────────────────
const hojaP = wb.addWorksheet('Personas')
hojaP.columns = [
  { header: 'id', key: 'id', width: 26 },
  { header: 'Nombre (desplegable)', key: 'label', width: 34 },
  { header: 'Instagram', key: 'ig', width: 22 },
  { header: 'LinkedIn', key: 'li', width: 34 },
  { header: 'Teléfono', key: 'tel', width: 16 },
  { header: 'Email', key: 'email', width: 26 },
  { header: 'Organización', key: 'org', width: 22 },
  { header: 'Vínculo', key: 'rel', width: 14 },
  { header: 'Msgs WhatsApp', key: 'msgs', width: 14 },
]
hojaP.getRow(1).font = { bold: true }
hojaP.views = [{ state: 'frozen', ySplit: 1 }]
for (const p of [...people].sort((a, b) => labelFor(a).localeCompare(labelFor(b), 'es'))) {
  hojaP.addRow({
    id: p.id, label: labelFor(p),
    ig: p.instagram_handle ?? '', li: p.linkedin_url ?? '',
    tel: p.phone_number ?? '', email: p.email ?? '',
    org: p.organization ?? '', rel: p.relationship ?? '',
    msgs: msgCounts.get(p.id) ?? 0,
  })
}
// Los huecos de identidad quedan en ámbar: se ven de un golpe.
for (let i = 2; i <= hojaP.rowCount; i++) {
  for (const col of ['ig', 'li', 'tel', 'email']) {
    const cell = hojaP.getCell(i, hojaP.getColumn(col).number)
    if (!cell.value) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } }
  }
}

// ── Hoja 3: Asignar IG ──────────────────────────────────────────────────────
const hojaA = wb.addWorksheet('Asignar IG')
hojaA.columns = [
  { header: 'id (no tocar)', key: 'id', width: 34 },
  { header: '@handle', key: 'handle', width: 24 },
  { header: 'Lo que ya sé', key: 'pista', width: 40 },
  { header: 'Seguidores', key: 'followers', width: 12 },
  { header: 'Foto', key: 'foto', width: 12 },
  { header: 'Es esta persona', key: 'asignar', width: 34 },
  { header: 'Crear nuevo contacto', key: 'nuevo', width: 28 },
  { header: 'No es un contacto', key: 'descartar', width: 18 },
]
hojaA.getRow(1).font = { bold: true }
hojaA.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]

const ordenados = [...unmatched].sort((a, b) => String(b.observed_at ?? '').localeCompare(String(a.observed_at ?? '')))
for (const u of ordenados) {
  const h = String(u.handle ?? '').toLowerCase()
  const prof = profByHandle.get(h)
  const pistas = []
  if (u.name) pistas.push(u.name)
  if (nameByHandle.get(h)) pistas.push(`sigues a: ${nameByHandle.get(h)}`)
  if (prof?.full_name) pistas.push(prof.full_name)
  if (prof?.category) pistas.push(`rubro: ${prof.category}`)
  if (prof?.is_business === true) pistas.push('cuenta de negocio')

  const row = hojaA.addRow({
    id: u.id,
    handle: `@${u.handle ?? ''}`,
    pista: pistas.join(' · ') || '—',
    followers: prof?.followers_count ?? '',
    foto: u.avatar_url ? 'ver foto' : '',
    asignar: '', nuevo: '', descartar: '',
  })
  if (u.avatar_url) {
    const c = row.getCell('foto')
    c.value = { text: 'ver foto', hyperlink: u.avatar_url }
    c.font = { color: { argb: 'FF0563C1' }, underline: true }
  }
  // Si parece negocio, se pre-señala en gris — pero NO se descarta solo.
  if (prof?.is_business === true || (typeof prof?.followers_count === 'number' && prof.followers_count >= 10000)) {
    row.getCell('pista').font = { italic: true, color: { argb: 'FF888888' } }
  }
}

// El desplegable: referencia la columna B de "Personas".
const ultimaP = Math.max(2, hojaP.rowCount)
for (let i = 2; i <= hojaA.rowCount; i++) {
  hojaA.getCell(i, 6).dataValidation = {
    type: 'list', allowBlank: true,
    formulae: [`=Personas!$B$2:$B$${ultimaP}`],
    showErrorMessage: true,
    errorTitle: 'Elige del desplegable',
    error: 'Si la persona no está en la lista, escribe su nombre en "Crear nuevo contacto".',
  }
  hojaA.getCell(i, 8).dataValidation = {
    type: 'list', allowBlank: true, formulae: ['"x"'],
  }
}

await wb.xlsx.writeFile(OUT)
console.log(`\n✅ ${OUT}`)
console.log(`   Asignar IG: ${ordenados.length} cuentas · Personas: ${people.length} contactos`)
console.log(`   Con pista de nombre: ${ordenados.filter((u) => u.name || nameByHandle.get(String(u.handle).toLowerCase()) || profByHandle.get(String(u.handle).toLowerCase())?.full_name).length}`)
console.log(`   Con foto: ${ordenados.filter((u) => u.avatar_url).length}`)
console.log(`\nLlénalo y luego: node scripts/identidades-import.mjs ${OUT}   (dry-run; --apply para escribir)`)
