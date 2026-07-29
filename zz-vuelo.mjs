// Actualiza el seguimiento del vuelo con la alerta del 29-jul y re-embebe. Temporal.
import { readFileSync } from 'node:fs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/'
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }

const content = [
  'Vuelo ida y vuelta Lima → Dammam (Al-Khobar, Arabia Saudita) para el Mundial de Bomberos 2026, salida mar 3 nov 2026, 1 adulto. Seguimiento de precio vía Google Flights (alertas al correo de Aaron).',
  'ESTADO AL 29 JUL 2026 (alerta de las 5:24 a.m., precios actualizados 10:24 GMT): el itinerario en seguimiento —regreso lun 9 nov— SUBIÓ a 5.667 PEN, desde 5.350 PEN. Es un alza de 317 PEN. Google lo marca con flecha hacia arriba.',
  'Opciones que trajo esa alerta, todas Lima→Dammam (LIM–DMM), 2 paradas, ida y vuelta 3 nov – 9 nov, 1 adulto:',
  '· 5.667 PEN — 12:05 a.m. → 9:20 a.m. del día siguiente · LATAM + Qatar Airways (la más barata, y es la del precio de seguimiento).',
  '· 6.023 PEN — 1:45 a.m. → 9:20 a.m. del día siguiente · LATAM + Qatar Airways.',
  '· 6.098 PEN — 12:05 p.m. → 9:00 p.m. del día siguiente · Iberia + Qatar Airways.',
  'HISTÓRICO del itinerario con regreso 9 nov: 5.919 PEN → 5.350 PEN (25 jul, el más bajo conocido) → 5.667 PEN (29 jul, actual). El mínimo histórico sigue siendo 5.350 del 25 jul: hoy está 317 PEN por encima de ese piso.',
  'ITINERARIO ALTERNATIVO con regreso dom 8 nov: último precio conocido 5.743 PEN el 24 jul 2026 (LATAM/Qatar, 2 paradas, 05:05 → 09:20+1). Sin dato más nuevo. NO atribuir el detalle de un itinerario al otro.',
  'Histórico general previo: 5.556 PEN → 6.079 PEN (pico, 22 jul) → 5.350 (piso, 25 jul) → 5.667 (29 jul).',
  'LECTURA: venía bajando y se dio la vuelta. El hito de compra del pasaje vence el 15 sep 2026, así que hay margen para esperar, pero el piso de 5.350 ya se perdió una vez.',
  'Dato de seguimiento ACTIVO — se actualiza con cada nueva alerta de precio. Contexto: el Mundial es en Al-Khobar/Dammam en noviembre; Delicia coordina presupuestos de vuelos e inscripciones.',
].join(' ')

// Embedding con el mismo modelo que usa el recall (text-embedding-3-small).
const emb = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: content }),
})
if (!emb.ok) { console.error('embedding falló:', emb.status, (await emb.text()).slice(0, 200)); process.exit(1) }
const vector = (await emb.json()).data[0].embedding
console.log('embedding ok, dims:', vector.length)

const r = await fetch(`${U}memories?id=eq.mem_track:vuelo-lima-dammam`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({
    content,
    embedding: vector,
    embedding_model: 'text-embedding-3-small',
    occurred_at: '2026-07-29T10:24:00.000Z',
    importance: 8,
  }),
})
console.log('memoria actualizada:', r.status)

// Verificación: que el recall la traiga preguntando por el vuelo.
const q = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: '¿cuánto está el vuelo a Dammam?' }),
})
const qv = (await q.json()).data[0].embedding
const rpc = await fetch(`${U}rpc/match_memories_hybrid`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ query_embedding: qv, query_text: 'vuelo Dammam precio', match_count: 3, p_user_id: '5c23c82c-2beb-401b-8555-706ac0b81248' }),
})
if (rpc.ok) {
  const hits = await rpc.json()
  console.log('\nrecall "¿cuánto está el vuelo a Dammam?":')
  for (const h of hits) console.log(`  sim ${Number(h.similarity ?? h.score ?? 0).toFixed(3)} · ${String(h.content).slice(0, 90)}…`)
} else console.log('rpc:', rpc.status, (await rpc.text()).slice(0, 200))
