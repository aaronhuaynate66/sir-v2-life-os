// #12 — Re-key de chat_messages a ids de MINUTO (fix de la causa raíz de los
// 148k duplicados limpiados el 20/07). SIN --execute es DRY RUN (solo cuenta).
//
//   Dry run:  node --max-old-space-size=4096 scripts/rekey-chat-messages.mjs
//   Ejecutar: node --max-old-space-size=4096 scripts/rekey-chat-messages.mjs --execute
//
// Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// Contexto: append.ts hasheaba el `iso` CRUDO (con segundos). Dos corridas de
// import con precisión distinta → ids distintos para el mismo mensaje → dups.
// El fix (append.ts) normaliza a minuto (minuteKey); este script re-keyea las
// filas SOBREVIVIENTES para que converjan con el nuevo esquema. La identidad de
// PK no la referencia NADIE (verificado) → re-key seguro, sin cascadas.
//
// Estrategia a prueba de interrupción: por cada superviviente cuyo id cambia,
// UPSERT bajo el nuevo id ANTES de borrar el viejo → si se corta, se re-corre y
// converge (nunca se pierde un mensaje; a lo sumo queda un dup transitorio).
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const EXECUTE = process.argv.includes('--execute')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const admin = createClient(url, key, { auth: { persistSession: false } })

// —— Réplica EXACTA de src/lib/chat-messages/append.ts ——
function minuteKey(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 16)
  return iso.slice(0, 16)
}
function chatMessageId(userId, personId, source, iso, sender, content) {
  const s = `${userId}|${personId}|${source}|${minuteKey(iso)}|${sender}|${content}`
  return `cm_${createHash('sha1').update(s).digest('hex')}`
}

const PAGE = 1000

// —— Fase 1: leer todo, agrupar por newId, elegir superviviente ——
console.log(`\n${EXECUTE ? '🟠 MODO EJECUCIÓN' : '🔵 DRY RUN (solo lectura)'} — re-key chat_messages\n`)
const t0 = Date.now()
let cursor = ''
let total = 0
let unchanged = 0
let collisions = 0
// newId -> fila superviviente COMPLETA (para re-insertar bajo el nuevo id)
const survivors = new Map()
const changedOldIds = [] // ids viejos de filas que cambian → candidatos a borrar
const samples = []

for (;;) {
  let q = admin
    .from('chat_messages')
    .select('id, user_id, person_id, source, sender, author_name, sent_at, content, is_media, created_at')
    .order('id', { ascending: true })
    .limit(PAGE)
  if (cursor) q = q.gt('id', cursor)
  const { data, error } = await q
  if (error) { console.error('ERROR lectura:', error.message); process.exit(1) }
  if (!data || data.length === 0) break

  for (const r of data) {
    total++
    const newId = chatMessageId(r.user_id, r.person_id, r.source, r.sent_at, r.sender, r.content)
    if (newId === r.id) unchanged++
    else changedOldIds.push(r.id)
    const prev = survivors.get(newId)
    if (!prev) {
      survivors.set(newId, { ...r, _newId: newId })
      if (newId !== r.id && samples.length < 5) {
        samples.push({ old: r.id.slice(0, 14), new: newId.slice(0, 14), sent_at: r.sent_at, txt: (r.content || '').slice(0, 30) })
      }
    } else {
      collisions++
      // Superviviente = el created_at más antiguo (el primero que se vio).
      if (r.created_at && prev.created_at && r.created_at < prev.created_at) {
        survivors.set(newId, { ...r, _newId: newId })
      }
    }
  }
  cursor = data[data.length - 1].id
  if (total % 20000 === 0) process.stdout.write(`  …${total} leídas\n`)
}

const finalCount = survivors.size
const changingId = [...survivors.values()].filter((s) => s._newId !== s.id).length
console.log('\n════════ RESUMEN ════════')
console.log(`Filas actuales:            ${total}`)
console.log(`Filas tras el re-key:      ${finalCount}   (ids de minuto, únicos)`)
console.log(`  ├─ sin cambio (id ya =):  ${unchanged}`)
console.log(`  └─ cambian de id:         ${changingId}   (re-insert bajo nuevo id + borrado del viejo)`)
console.log(`Colisiones fusionadas:     ${collisions}`)
console.log(`Borrados totales:          ${total - finalCount}`)
console.log(`Tiempo lectura:            ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('\nMuestras (old→new · sent_at · texto):')
for (const s of samples) console.log(`  ${s.old}… → ${s.new}… · ${s.sent_at} · "${s.txt}"`)

if (!EXECUTE) {
  console.log('\n✅ DRY RUN — no se escribió nada. Corré con --execute para aplicar.')
  process.exit(0)
}

// —— Fase 2: EJECUTAR ——
// 2a. UPSERT de los supervivientes cuyo id cambia, bajo el NUEVO id. (insert-first)
console.log('\n🟠 Fase 2a — insertando supervivientes bajo su nuevo id…')
const toInsert = [...survivors.values()]
  .filter((s) => s._newId !== s.id)
  .map((s) => ({
    id: s._newId,
    user_id: s.user_id, person_id: s.person_id, source: s.source,
    sender: s.sender, author_name: s.author_name, sent_at: s.sent_at,
    content: s.content, is_media: s.is_media, created_at: s.created_at,
  }))
let inserted = 0
for (let i = 0; i < toInsert.length; i += 500) {
  const slice = toInsert.slice(i, i + 500)
  const { error } = await admin.from('chat_messages').upsert(slice, { onConflict: 'id', ignoreDuplicates: true })
  if (error) { console.error('ERROR upsert:', error.message); process.exit(1) }
  inserted += slice.length
  if (inserted % 20000 === 0 || inserted === toInsert.length) process.stdout.write(`  …${inserted}/${toInsert.length} insertadas\n`)
}

// 2b. BORRAR los ids viejos que cambiaron (delete-AFTER → nunca se pierde el
//     mensaje: su copia bajo el nuevo id ya está insertada). Red de seguridad:
//     excluimos cualquier id que — por una colisión sha1 imposible — sea también
//     un id final, para no borrar una fila válida.
console.log('\n🟠 Fase 2b — borrando ids viejos ya migrados…')
const finalKeys = new Set(survivors.keys())
let deleted = 0
const toDelete = changedOldIds.filter((id) => !finalKeys.has(id))
for (let i = 0; i < toDelete.length; i += 200) {
  const slice = toDelete.slice(i, i + 200)
  const { error } = await admin.from('chat_messages').delete().in('id', slice)
  if (error) { console.error('ERROR delete:', error.message); process.exit(1) }
  deleted += slice.length
  if (deleted % 20000 === 0 || deleted === toDelete.length) process.stdout.write(`  …${deleted}/${toDelete.length} borradas\n`)
}

// —— Verificación ——
const { count } = await admin.from('chat_messages').select('id', { count: 'exact', head: true })
console.log('\n════════ VERIFICACIÓN ════════')
console.log(`Insertadas (nuevo id): ${inserted}`)
console.log(`Borradas (id viejo):   ${deleted}`)
console.log(`Conteo final en DB:    ${count}`)
console.log(`Esperado:              ${finalCount}`)
console.log(count === finalCount ? '\n✅ OK — el conteo final coincide con lo esperado.' : '\n⚠️ El conteo NO coincide — revisar.')
console.log(`Tiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
