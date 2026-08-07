// SIR V2 — ¿ENTREGÓ el canal nocturno? Foto de las 4 cosas que deben pasar cada noche.
//
// POR QUÉ EXISTE. La noche del 5-ago-2026 el cron `evening-push` no entregó NADA y
// se descubrió a las 04:00 de la mañana, a mano, razonando por descarte: los logs de
// runtime de Vercel no se leen hacia atrás (el endpoint solo hace streaming hacia
// adelante y `/v1/projects/{prj}/crons` da 404). Esta es la consulta que faltaba.
//
// Uso (después de las 21:30 de Lima):
//   node scripts/verificar-noche.mjs
//
// Es una FOTO, no un vigilante. El que avisa solo es el workflow
// `.github/workflows/canal-nocturno-watch.yml`, que vive en Actions porque un cron
// caído no puede avisar de su propia caída. Esto sirve para mirar a mano y para
// verificar un despliegue la MISMA noche.
//
// Las 4 cosas que se miran, y por qué esas:
//   1. El 🌙 del cierre del día — la huella INCONDICIONAL: se manda apenas la flag
//      está activa, así que su ausencia prueba que el cron no ejecutó.
//   2. `reminders.notified_at` de la toma — solo se marca si Telegram entregó.
//   3. La traza en `events` (#1112) — dice qué decidió adentro.
//   4. `brief_sent_signals` del encuentro sin fecha (#1114).
//
// Lee `.env.local` con la service-role. Solo LEE: no escribe nada.
import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const q = async (p) => {
  try { const r = await fetch(`${BASE}/rest/v1/${p}`, { headers: H }); return r.ok ? await r.json() : null } catch { return null }
}
const L = (iso) => new Date(Date.parse(iso) - 5 * 3600000).toISOString().replace('T', ' ').slice(0, 16)
const now = new Date()
// ═══ QUÉ NOCHE SE AUDITA ═════════════════════════════════════════════════════
//
// `-5 h` daba el día de Lima de AHORA, y a las 06:57 de la mañana eso es la noche
// que TODAVÍA NO PASÓ: el script decía "no salió" de las cuatro cosas sobre una
// noche que faltaba. Es el mismo bug que ya se había cazado en
// `canal-nocturno-watch.yml` y que acá se quedó sin arreglar.
//
// La noche de Lima D tiene su ventana de disparo entre las 02:00Z y las 03:00Z del
// D+1 (Hobby dispara dentro de la hora), así que solo se puede juzgar pasadas las
// 03:00Z del día siguiente. `-27 h` da exactamente esa noche desde las 03:00Z.
const noche = new Date(now.getTime() - 27 * 3600000).toISOString().slice(0, 10)
const desde = `${noche}T05:00:00Z`
// Y si la ventana de ESA noche todavía no cerró, no se juzga: "todavía no salió" y
// "no salió" son cosas distintas.
const cierra = Date.parse(`${new Date(Date.parse(`${noche}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)}T03:00:00Z`)
if (now.getTime() < cierra) {
  console.log(`La ventana de disparo de la noche del ${noche} no cerró todavía (cierra ${new Date(cierra).toISOString()}).`)
  console.log('No se juzga: "todavía no salió" no es "no salió".')
  process.exit(0)
}

console.log(`== LA NOCHE DEL ${noche} (Lima) · foto tomada ${L(now.toISOString())} ==\n`)

// 1. El cierre del día (la huella incondicional).
const lunas = await q(`sir_messages?select=created_at&role=eq.sir&channel=eq.telegram&content=like.${encodeURIComponent('🌙%')}&created_at=gte.${desde}`)
console.log(`1. 🌙 cierre del día      : ${lunas === null ? 'NO PUDE MIRAR' : lunas.length > 0 ? `SÍ (${L(lunas[0].created_at)})` : 'NO SALIÓ'}`)

// 2. La toma de las 22:00.
const tomaId = `rem_med_${noche}_2200`
const toma = await q(`reminders?select=id,notified_at,done_at&id=eq.${tomaId}`)
const t = toma && toma[0]
console.log(`2. 💊 aviso de la toma    : ${!t ? 'no existe la fila' : t.notified_at ? `SÍ (${L(t.notified_at)})` : 'NO SALIÓ'}`)

// 3. La traza de corrida (#1112).
const ev = await q(`events?select=created_at,meta&type=eq.evening-push&created_at=gte.${desde}&order=created_at.desc`)
console.log(`3. 📋 traza de la corrida : ${ev === null ? 'NO PUDE MIRAR' : ev.length > 0 ? `SÍ — ${JSON.stringify(ev[0].meta)}` : 'sin fila'}`)

// 4. La propuesta de encuentro (#1114): se marca en brief_sent_signals.
const enc = await q(`brief_sent_signals?select=ref,sent_at,sample_text&slot=eq.encuentroSinFecha&order=sent_at.desc&limit=3`)
console.log(`4. 💚 propuesta de verse  : ${enc === null ? 'NO PUDE MIRAR' : enc.length > 0 ? `SÍ (${L(enc[0].sent_at)}) "${String(enc[0].sample_text).slice(0, 60)}"` : 'no salió (puede ser correcto: silenciada o ya agendada)'}`)

// 5. ¿Tocó los botones?
const tk = await q('med_intakes?select=taken_at,name&prescription_item_id=not.is.null&order=taken_at.desc&limit=6')
console.log(`\n5. tomas registradas      : ${tk === null ? '?' : tk.length}`)
for (const x of (tk ?? [])) console.log(`     ${L(x.taken_at)} ${x.name}`)

// 6. El evento que se haya agendado con alguien.
const pe = await q(`personal_events?select=title,event_date,note,created_at&source=eq.telegram&order=created_at.desc&limit=3`)
console.log(`\n6. encuentros agendados   : ${pe === null ? '?' : pe.length}`)
for (const x of (pe ?? [])) console.log(`     ${x.event_date} ${x.title} · ${x.note ?? ''}`)
