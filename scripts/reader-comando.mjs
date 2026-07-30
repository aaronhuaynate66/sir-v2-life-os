// SIR V2 — Mandarle una orden a la extensión de la OTRA PC, sin tocarla.
//
// POR QUÉ EXISTE. Aaron, 30-jul-2026: *"deberíamos hasta poder manejarla remotamente
// por la extensión"* y *"quiero tener actualizado el chat de Diana… y solo me quieres
// mandar a scrolear despacio, eso no me sirve"*.
//
// Hasta hoy el único "manejo remoto" era documental: prompts en markdown para que un
// humano o un agente en esa PC hiciera `git pull` y recargara a mano. Ahora hay canal:
// la extensión postea el latido cada 10 minutos y **la respuesta del latido lleva los
// comandos** (mig 0181). Esta herramienta escribe la fila; la extensión la recoge en el
// próximo latido y reporta el resultado en el siguiente.
//
// Uso:
//   node scripts/reader-comando.mjs --probe
//       → pide el diagnóstico del lector (¿cargó wa-js? ¿cuántos chats ve?)
//   node scripts/reader-comando.mjs --resync --chat "Diana" --dias 400
//       → rehace el backfill de ese chat con esa ventana
//   node scripts/reader-comando.mjs --resync --dias 90
//       → rehace el backfill de TODOS los chats con actividad en 90 días
//   node scripts/reader-comando.mjs --estado
//       → muestra los latidos y los comandos, sin escribir nada
//
// El comando NO es instantáneo: espera al próximo latido (≤10 min). Es a propósito —
// no se abre un canal de push a la extensión solo por impaciencia.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim()
}

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const has = (name) => process.argv.includes(name)

const MAX_DIAS = 400

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: prof } = await sb.from('profiles').select('id').limit(2)
  const userId = process.env.READER_INGEST_USER_ID
    || ((prof ?? []).length === 1 ? prof[0].id : null)
  if (!userId) { console.error('No pude resolver el user_id (seteá READER_INGEST_USER_ID).'); process.exit(1) }

  const canal = arg('--canal') || 'whatsapp'

  // ── ESTADO ────────────────────────────────────────────────────────────────
  if (has('--estado') || process.argv.length <= 2) {
    const { data: hb } = await sb.from('reader_heartbeats')
      .select('channel,last_beat_at,status,detail,last_data_at,ext_version,last_error,sent_count,probe')
      .eq('user_id', userId).order('channel')
    console.log('LATIDOS:')
    for (const h of hb ?? []) {
      const p = h.probe || {}
      const vivo = p.error ? '✗ error'
        : p.lib && p.lib !== 'object' ? '✗ la librería no cargó'
          : p.ready === false ? '✗ store no listo'
            : p.chats === 0 ? '✗ ve 0 chats'
              : p.ready ? `✓ leyendo (${p.chats ?? '?'} chats)`
                : '? sin diagnóstico'
      console.log(`  ${String(h.channel).padEnd(10)} latido ${String(h.last_beat_at).slice(11, 16)} · ${h.status} · v${h.ext_version ?? '?'} · enviados ${h.sent_count ?? '?'}`)
      console.log(`             lector: ${vivo}${p.libVersion ? ` (wa-js ${p.libVersion})` : ''}${p.error ? ` — ${p.error}` : ''}`)
      if (h.last_error) console.log(`             último error: ${h.last_error}`)
    }
    const { data: cmds } = await sb.from('reader_commands')
      .select('id,channel,kind,params,status,created_at,delivered_at,done_at,result')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
    console.log('\nCOMANDOS (10 últimos):')
    if (!(cmds ?? []).length) console.log('  (ninguno)')
    for (const c of cmds ?? []) {
      console.log(`  [${String(c.status).padEnd(9)}] ${c.kind} ${JSON.stringify(c.params)} · creado ${String(c.created_at).slice(5, 16)}${c.done_at ? ` · listo ${String(c.done_at).slice(11, 16)}` : ''}`)
      if (c.result) console.log(`              → ${String(c.result).slice(0, 160)}`)
    }
    return
  }

  // ── ENCOLAR ───────────────────────────────────────────────────────────────
  let kind = null
  let params = {}
  if (has('--probe')) kind = 'probe'
  else if (has('--resync')) {
    kind = 'resync'
    const dias = Number(arg('--dias'))
    params.dias = Number.isFinite(dias) && dias > 0 ? Math.min(MAX_DIAS, Math.floor(dias)) : 30
    const chat = arg('--chat')
    if (chat) params.chat = chat.slice(0, 120)
  }
  if (!kind) { console.error('Usá --probe, --resync o --estado. Ver la cabecera del archivo.'); process.exit(1) }

  const { data, error } = await sb.from('reader_commands')
    .insert({ user_id: userId, channel: canal, kind, params })
    .select('id').single()
  if (error) { console.error('No pude encolar:', error.message); process.exit(1) }
  console.log(`✓ encolado ${kind} ${JSON.stringify(params)} para ${canal} · id ${data.id}`)
  console.log('  La extensión lo recoge en el próximo latido (≤10 min) y reporta en el siguiente.')
  console.log('  Seguilo con: node scripts/reader-comando.mjs --estado')
}

main().catch((e) => { console.error(e); process.exit(1) })
