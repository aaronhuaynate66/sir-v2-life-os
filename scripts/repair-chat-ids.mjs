// SIR V2 — Reparador de identidad en chat_messages. Local, sin UI, DRY-RUN por defecto.
//
// QUÉ ARREGLA (bug real, 29-jul-2026): el mismo mensaje de WhatsApp podía quedar
// guardado DOS veces porque los dos caminos de ingesta no coincidían en la
// identidad del mensaje, en tres ejes a la vez:
//
//   1. TIEMPO — el reader lee el epoch del Store (instante UTC real, con
//      segundos); el importador parsea la hora MOSTRADA (hora de pared de Lima).
//      El mismo mensaje quedaba en 23:44:31 y en 18:44:00 → 5 h de diferencia.
//   2. CANAL — el reader guardaba source='reader' y el importador
//      source='whatsapp', y `source` entraba al hash.
//   3. PRECISIÓN — segundos vs minuto truncado (ya resuelto por minuteKey).
//
// El código nuevo (append.ts + waStoreReader.js) hace que los dos caminos
// coincidan de ahora en adelante. Este script arregla lo que YA está guardado:
// pasa las filas viejas del reader a la convención y les recalcula el id. Sin
// esto, el próximo import volvería a duplicarlas.
//
// ORDEN: primero la migración 0176 (canoniza los ids de TODA la tabla y borra los
// duplicados que colapsan), después este script (corrige la hora de las filas del
// reader de WhatsApp y les recalcula el id con canal='whatsapp'). Al revés no
// sirve: antes de la 0176 los ids guardados no son los canónicos, así que la
// comparación "¿el export ya trae este mensaje?" da falsos negativos.
//
// Uso:
//   node scripts/repair-chat-ids.mjs                  # DRY-RUN: solo reporta
//   node scripts/repair-chat-ids.mjs --apply          # escribe
//   node scripts/repair-chat-ids.mjs --apply --person <uuid>   # una sola persona
//
// Env (de .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

import { chatMessageId, limaWallClock, minuteKey } from '../src/lib/chat-messages/append.ts'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}

const APPLY = process.argv.includes('--apply')
const SOLO_PERSONA = (() => {
  const i = process.argv.indexOf('--person')
  return i >= 0 ? process.argv[i + 1] : null
})()

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Todas las filas de una persona, de UNA sola pasada.
 *
 *  Dos trampas juntas acá:
 *  · PostgREST corta en 1000 filas por request, sin avisar y sin importar el
 *    `limit` que le pidas. Hay que paginar siempre.
 *  · Se pagina por CURSOR de sent_at, no por OFFSET: con 74k filas los offsets
 *    altos hacen timeout de statement.
 *  Y NO se filtra por `source` en la query —agregarle ese filtro al orden por
 *  sent_at hace que deje de usar el índice y también revienta por timeout—. Se
 *  parte por source acá, en memoria. */
async function filasDePersona(personId) {
  const out = []
  let cursor = '1970-01-01T00:00:00Z'
  for (;;) {
    const { data, error } = await sb.from('chat_messages')
      .select('id, user_id, person_id, source, sent_at, sender, content')
      .eq('person_id', personId)
      .gt('sent_at', cursor).order('sent_at', { ascending: true }).limit(1000)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    const ultimo = data[data.length - 1].sent_at
    if (ultimo === cursor) break // todas en el mismo instante: no hay más avance posible
    cursor = ultimo
    if (data.length < 1000) break
  }
  return out
}

/**
 * De qué plataforma vino cada fila `source=reader`. `chat_messages` no guarda la
 * plataforma, así que la derivamos de las observaciones que el reader escribió
 * junto con los mensajes (persist.ts guarda data.platform ahí).
 * Solo devolvemos las personas SIN ambigüedad: si a alguien le llegaron mensajes
 * por WhatsApp Y por Teams, no hay forma de saber a qué canal pertenece cada
 * fila, y preferimos no tocarla antes que adivinar.
 */
async function plataformaPorPersona() {
  const { data, error } = await sb.from('observations')
    .select('person_id, data').eq('capture_type', 'dm_conversation').limit(1000)
  if (error) throw new Error(error.message)
  const porPersona = new Map()
  for (const o of data ?? []) {
    if (!o.person_id || o.data?.source !== 'reader') continue
    const p = String(o.data?.platform ?? '').trim().toLowerCase()
    if (!p) continue
    if (!porPersona.has(o.person_id)) porPersona.set(o.person_id, new Set())
    porPersona.get(o.person_id).add(p)
  }
  const claras = new Map()
  const ambiguas = []
  for (const [pid, plats] of porPersona) {
    if (plats.size === 1) claras.set(pid, [...plats][0])
    else ambiguas.push({ pid, plats: [...plats] })
  }
  return { claras, ambiguas }
}

async function main() {
  console.log(APPLY ? '🔧 MODO ESCRITURA' : '👀 DRY-RUN (agrega --apply para escribir)')

  const { claras, ambiguas } = await plataformaPorPersona()
  console.log(`\nPersonas con filas de reader clasificables: ${claras.size}`)
  if (ambiguas.length) {
    console.log(`⚠️  ${ambiguas.length} personas con más de una plataforma → NO se tocan:`)
    for (const a of ambiguas) console.log(`     ${a.pid}: ${a.plats.join(', ')}`)
  }

  const objetivo = [...claras.entries()].filter(([pid, plat]) => plat === 'whatsapp' && (!SOLO_PERSONA || pid === SOLO_PERSONA))
  console.log(`Personas con reader de WhatsApp a reparar: ${objetivo.length}`)

  let aMover = 0, aBorrar = 0, intactas = 0
  let resid = 0
  const ejemplos = []
  const ejemplosResid = []

  for (const [pid] of objetivo) {
    const todas = await filasDePersona(pid)
    const reader = todas.filter((r) => r.source === 'reader')
    const exportadas = todas.filter((r) => r.source === 'whatsapp')
    const idsExistentes = new Set(exportadas.map((r) => r.id))

    // VERIFICACIÓN de solo lectura: ¿quedan pares que comparten (minuto, emisor,
    // texto)? De borrarlos se encarga la migración 0176, que lo hace en un solo
    // statement sobre toda la tabla. Acá NO se borra a propósito: tener dos
    // implementaciones de la misma limpieza es exactamente el error que originó
    // todo este bug. Si esto reporta algo distinto de 0, la migración no corrió.
    const vistos = new Set()
    for (const f of exportadas) {
      const clave = `${minuteKey(f.sent_at)}|${f.sender}|${f.content}`
      if (!vistos.has(clave)) { vistos.add(clave); continue }
      resid++
      if (ejemplosResid.length < 5) ejemplosResid.push(`${f.sent_at} [${f.sender}] ${JSON.stringify(f.content.slice(0, 45))}`)
    }

    for (const fila of reader) {
      // El reader guardó el instante real; la convención es hora de pared de Lima.
      const isoCorregido = limaWallClock(fila.sent_at)
      if (!isoCorregido) { intactas++; continue }
      const idNuevo = chatMessageId(fila.user_id, fila.person_id, 'whatsapp', isoCorregido, fila.sender, fila.content)
      if (idNuevo === fila.id) { intactas++; continue }

      if (idsExistentes.has(idNuevo)) {
        // El export ya trajo este mismo mensaje: la fila del reader es el duplicado.
        aBorrar++
        if (ejemplos.length < 8) ejemplos.push(`BORRAR  ${fila.sent_at} [${fila.sender}] ${JSON.stringify(fila.content.slice(0, 45))} — ya existe como export`)
        if (APPLY) {
          const { error } = await sb.from('chat_messages').delete().eq('id', fila.id)
          if (error) throw new Error(`delete ${fila.id}: ${error.message}`)
        }
      } else {
        // No lo trajo el export: la fila se queda, pero pasa a la convención.
        aMover++
        if (ejemplos.length < 8) ejemplos.push(`MOVER   ${fila.sent_at} → ${isoCorregido} [${fila.sender}] ${JSON.stringify(fila.content.slice(0, 45))}`)
        if (APPLY) {
          const { error } = await sb.from('chat_messages')
            .update({ id: idNuevo, sent_at: isoCorregido }).eq('id', fila.id)
          if (error) throw new Error(`update ${fila.id}: ${error.message}`)
        }
        idsExistentes.add(idNuevo)
      }
    }
  }

  console.log(`\n── Filas de reader ──`)
  console.log(`   a borrar (duplicado del export): ${aBorrar}`)
  console.log(`   a mover (solo cambia la hora):   ${aMover}`)
  console.log(`   ya correctas:                    ${intactas}`)
  for (const e of ejemplos) console.log(`   ${e}`)

  console.log(`\n── Verificación: duplicados por clave canónica que quedan ──`)
  for (const e of ejemplosResid) console.log(`   ${e}`)
  console.log(resid === 0
    ? '   0 ✓ (la migración 0176 ya los barrió)'
    : `   ${resid} ⚠️  esperado 0 — ¿corrió la migración 0176?`)

  if (!APPLY) console.log('\nNada se escribió. Corre con --apply cuando el reporte se vea bien.')
}

main().catch((e) => { console.error('❌', e.message); process.exit(1) })
