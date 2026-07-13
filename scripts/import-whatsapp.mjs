// SIR V2 — Importador BATCH de exports de WhatsApp (texto). Local, sin UI.
//
// Lee los .zip de una carpeta, parsea el _chat.txt, interpreta el chat con
// Anthropic (chunking para los grandes) y persiste UNA observación whatsapp_chat
// por persona (mismo shape que /api/capture/whatsapp-export), obsoletando las
// previas (dedup). Matchea la persona por el nombre del archivo, con OVERRIDES
// explícitos (confirmados por Aaron) para los casos ambiguos.
//
// Uso:
//   node scripts/import-whatsapp.mjs --dir "C:/Users/huayn/Downloads" --only "Janeth"   # 1 chat
//   node scripts/import-whatsapp.mjs --dir "..." --limit 5                               # los 5 más chicos
//   node scripts/import-whatsapp.mjs --dir "..."                                         # TODOS
//   (agregá --dry para no escribir en la base)
//
// Env (de .env.local): ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import JSZip from 'jszip'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

// Zips gigantes (miles de fotos/videos) superan el límite de 2GB de readFileSync
// de Node. Para esos, extraemos SOLO el _chat.txt por streaming con `unzip -p`
// (evita cargar el zip entero en memoria). Umbral conservador a 1.5GB.
const BIG_ZIP_BYTES = 1.5e9
async function readChatTxt(zpath) {
  if (statSync(zpath).size > BIG_ZIP_BYTES) {
    return execFileSync('unzip', ['-p', zpath, '*_chat.txt'], { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' })
  }
  const zip = await JSZip.loadAsync(readFileSync(zpath))
  const txtName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.txt'))
  return txtName ? zip.files[txtName].async('string') : ''
}

// ─── Config ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const DIR = argVal('--dir') || 'C:/Users/huayn/Downloads'
const ONLY = argVal('--only')
const LIMIT = argVal('--limit') ? Number(argVal('--limit')) : null
const DRY = args.includes('--dry')
// Solo llenar el sustrato chat_messages (historial completo, sin LLM ni observación).
const MESSAGES_ONLY = args.includes('--messages-only')
const MODEL = 'claude-sonnet-4-5-20250929'
const AARON = '5c23c82c-2beb-401b-8555-706ac0b81248'

// Overrides confirmados por Aaron (filename-contact → persona destino).
// 'CREATE:<nombre>' = crear persona nueva con ese nombre.
const OVERRIDES = {
  'Carlo Rodríguez': 'CREATE:Carlo Rodríguez',
  'Papa': 'Esteban Huaynate',
  'Diana HNG': 'Diana Cencaro',
  'Diana Carolina ❣️': 'Diana Carolina Díaz Sánchez', // pareja; desambigua de Diana Cencaro
  'Miluska Castillo Hv': 'Miluska Castillo',
  'Piero Gadea 127': 'CREATE:Piero Gadea',
  'Coordinaciones Marlab - Creatas': 'SKIP', // grupo, no persona 1:1
}
/** category (capa de Dunbar) por defecto al crear un contacto nuevo. */
const NEW_CATEGORY = 'network'
/** Un chat con más de este número de autores distintos es un GRUPO → se salta. */
const GROUP_AUTHOR_THRESHOLD = 2

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY

// ─── Utilidades ──────────────────────────────────────────────────────
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['de', 'la', 'el', 'personal', 'hng', 'k2', 'tac', 'hv', 'delegada', 'analytics', 'programatica', 'menu', 'delivery', 'coordinaciones', '127', '1', '2'])
const sigTokens = (s) => norm(s).split(' ').filter((t) => t.length >= 3 && !STOP.has(t))
const slugify = (s) => norm(s).replace(/\s+/g, '-').slice(0, 60) + '-' + randomUUID().slice(0, 6)

// Matching ESTRICTO: el primer token significativo (nombre de pila) debe coincidir.
function matchPerson(contact, people) {
  const ct = sigTokens(contact)
  if (ct.length === 0) return null
  const first = ct[0]
  let best = null
  for (const p of people) {
    const pt = sigTokens(`${p.name} ${p.alias || ''}`)
    if (!pt.includes(first)) continue // el nombre de pila debe estar → evita Carlo↔Victor
    let shared = 0; for (const t of ct) if (pt.includes(t)) shared++
    if (!best || shared > best.shared) best = { id: p.id, name: p.name, shared }
  }
  return best
}

// Parseo del export: [d/m/yy, h:mm:ss] Autor: msg  |  d/m/yy, h:mm - Autor: msg
const LINE_RE = /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?\]?\s*(?:-\s*)?([^:]{1,60}?):\s?([\s\S]*)$/i
function parseExport(txt) {
  const msgs = []
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/‎/g, '').trimEnd()
    const m = LINE_RE.exec(line)
    if (!m) { // continuación de un mensaje multilínea
      if (msgs.length) msgs[msgs.length - 1].content += '\n' + raw.trim()
      continue
    }
    let [, d, mo, y, h, mi, , author, content] = m
    y = y.length === 2 ? 2000 + Number(y) : Number(y)
    const iso = new Date(Date.UTC(y, Number(mo) - 1, Number(d), Number(h), Number(mi))).toISOString()
    msgs.push({ iso, author: author.trim(), content: (content || '').trim() })
  }
  return msgs
}

// El "user" es Aaron. Lo identificamos por SU nombre (constante "Aaron ..." en
// todos los exports) — robusto ante overrides del nombre del contacto (ej. zip
// "Papa" → persona "Esteban Huaynate", donde el criterio por-contacto cruzaba los
// roles). Fallback al criterio viejo (por nombre del contacto) si no aparece Aaron.
function tagAuthors(msgs, contact) {
  const authors = [...new Set(msgs.map((m) => m.author))]
  const aaron = authors.find((a) => /^aaron/i.test((a || '').trim()))
  if (aaron) return msgs.map((m) => ({ ...m, side: m.author === aaron ? 'user' : 'other' }))
  const ctoks = new Set(sigTokens(contact))
  const otherAuthor = authors.find((a) => sigTokens(a).some((t) => ctoks.has(t))) || authors[0]
  return msgs.map((m) => ({ ...m, side: m.author === otherAuthor ? 'other' : 'user' }))
}

// Capa 1 — sustrato canónico chat_messages (mismo id determinístico que
// lib/chat-messages/append.ts → dedupe idempotente, re-correr es seguro).
function chatMessageId(personId, source, iso, sender, content) {
  const s = `${AARON}|${personId}|${source}|${iso ?? ''}|${sender}|${content}`
  return 'cm_' + createHash('sha1').update(s).digest('hex')
}
async function appendMessages(personId, tagged) {
  const source = 'whatsapp'
  // DEDUP DE VOZ EN RE-IMPORTS: si un audio de este chat YA fue transcrito (fila
  // con content '🎙️…'), su id quedó basado en la transcripción, no en el
  // '<adjunto:…opus>'. Re-importar el export re-agregaría el placeholder como
  // fila nueva (y se re-transcribiría). Para evitarlo, cargamos las slots ya
  // transcritas (por instante+emisor) y saltamos esas líneas de audio.
  const transcribed = new Set()
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.from('chat_messages')
        .select('sent_at, sender').eq('user_id', AARON).eq('person_id', personId)
        .like('content', '🎙️%').range(from, from + 999)
      if (!data || data.length === 0) break
      for (const r of data) if (r.sent_at) transcribed.add(`${Date.parse(r.sent_at)}|${r.sender}`)
      if (data.length < 1000) break
    }
  } catch { /* best-effort: sin esto, el peor caso es un duplicado en re-import */ }
  const isAudioLine = (c) => /<adjunto[^>]*AUDIO[^>]*\.opus>/i.test(c) || /AUDIO-\d.*\.opus/i.test(c)

  const seen = new Set(); const rows = []
  for (const m of tagged) {
    const content = (m.content || '').slice(0, 8000)
    if (!content) continue
    const iso = m.iso && m.iso.length >= 10 ? m.iso : null
    // Si es una línea de audio y esa slot (instante+emisor) ya está transcrita,
    // no re-agregamos el placeholder (evita duplicar la nota de voz).
    if (iso && isAudioLine(content) && transcribed.has(`${Date.parse(iso)}|${m.side}`)) continue
    const id = chatMessageId(personId, source, iso, m.side, content)
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({ id, user_id: AARON, person_id: personId, source, sender: m.side, author_name: (m.author || '').slice(0, 120) || null, sent_at: iso, content, is_media: false })
  }
  let n = 0
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500)
    const { error } = await sb.from('chat_messages').upsert(slice, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`chat_messages: ${error.message}`)
    n += slice.length
  }
  // Mantener people.last_contact al día = fecha del último mensaje (maneja la
  // urgencia de contacto). Solo AVANZA (never backward): si el export trae algo
  // más reciente que el last_contact actual, lo actualiza. Sin esto quedaba stale.
  const maxIso = rows.reduce((mx, r) => (r.sent_at && r.sent_at > mx ? r.sent_at : mx), '')
  if (maxIso) {
    await sb.from('people').update({ last_contact: maxIso, updated_at: new Date().toISOString() })
      .eq('user_id', AARON).eq('id', personId).or(`last_contact.is.null,last_contact.lt.${maxIso}`)
  }
  return n
}

async function anthropic(system, user, maxTokens = 1500) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  return (j.content?.[0]?.text || '').trim()
}

function renderMsgs(msgs) {
  return msgs.map((m) => `[${m.iso.slice(0, 10)}] ${m.side === 'user' ? 'Aaron' : 'Otro'}: ${m.content}`).join('\n').slice(0, 120000)
}

const CHUNK = 1400
const SYS_BLOCK = 'Resumís un tramo de una conversación de WhatsApp entre Aaron y otra persona, en español, observacional y sin juicio. Devolvé 2-4 oraciones: qué pasó, temas, hechos concretos (trabajo, familia, fechas, decisiones). Sin markdown.'
const SYS_FINAL = `Consolidás el análisis de una conversación de WhatsApp entre Aaron y {NAME}. Te paso resúmenes de tramos (del más viejo al más nuevo). Devolvé UN JSON ESTRICTO (sin markdown, sin prosa):
{"summary":"<max 280 chars, observacional, menciona a {NAME}>","topics":["snake_case",...2-5],"facts":["hecho concreto",...max 12],"events":["evento con fecha si hay",...max 8],"extractedDates":[{"label":"","dateISO":"YYYY-MM-DD"|null,"recurring":false}],"emotionalStates":{"user":"snake_case|null","otherPerson":"snake_case|null"},"interactionQuality":<1-5 promedio>,"recentTone":<1-5 del tramo más reciente>,"emotionalTone":<-1..1>}`

async function interpretChat(msgs, name) {
  const tagged = tagAuthors(msgs, name)
  const blocks = []
  for (let i = 0; i < tagged.length; i += CHUNK) blocks.push(tagged.slice(i, i + CHUNK))
  const blockSummaries = []
  for (const b of blocks) {
    const s = await anthropic(SYS_BLOCK, renderMsgs(b), 400)
    blockSummaries.push(s)
  }
  const finalSys = SYS_FINAL.replaceAll('{NAME}', name)
  const raw = await anthropic(finalSys, blockSummaries.map((s, i) => `Tramo ${i + 1}:\n${s}`).join('\n\n'), 1500)
  let parsed = {}
  try { parsed = JSON.parse(raw.replace(/^```json?/i, '').replace(/```$/, '').trim()) } catch { parsed = { summary: blockSummaries[blockSummaries.length - 1]?.slice(0, 280) || '', topics: [], facts: [], events: [], extractedDates: [], emotionalStates: {}, interactionQuality: 3, recentTone: 3, emotionalTone: 0 } }
  return { parsed, blockSummaries }
}

async function createPerson(name, people) {
  if (DRY) return { id: 'DRY-NEW', name, created: true }
  const id = randomUUID()
  const nowIso = new Date().toISOString()
  const { error } = await sb.from('people').insert({
    id, user_id: AARON, name, slug: slugify(name),
    category: NEW_CATEGORY, relationship: 'acquaintance',
    importance_score: 5, trust_level: 5, energy_impact: 'neutral',
    contact_frequency: '', tags: [], notes: '', relational_notes: {},
    created_at: nowIso, updated_at: nowIso,
  })
  if (error) throw new Error(`crear persona ${name}: ${error.message}`)
  people.push({ id, name, alias: null })
  return { id, name, created: true }
}

async function resolvePerson(contact, people) {
  const ov = OVERRIDES[contact]
  if (ov === 'SKIP') return null // grupo u otro → no importar como persona
  if (ov?.startsWith('CREATE:')) {
    const name = ov.slice(7)
    const existing = people.find((p) => norm(p.name) === norm(name))
    if (existing) return { id: existing.id, name: existing.name, created: false }
    return createPerson(name, people)
  }
  const targetName = ov || contact
  const m = matchPerson(targetName, people)
  if (m) return { id: m.id, name: m.name, created: false }
  return createPerson(contact, people) // sin match ni override → crear con el nombre del contacto
}

async function main() {
  const { data: peopleRows } = await sb.from('people').select('id, name, alias').eq('user_id', AARON).limit(2000)
  const people = peopleRows || []
  let files = readdirSync(DIR).filter((f) => /^WhatsApp Chat - .+\.zip$/i.test(f))
  if (ONLY) files = files.filter((f) => f.toLowerCase().includes(ONLY.toLowerCase()))
  // más chicos primero (para validar barato)
  const sized = files.map((f) => ({ f, size: statSync(join(DIR, f)).size })).sort((a, b) => a.size - b.size)
  let list = sized.map((s) => s.f)
  if (LIMIT) list = list.slice(0, LIMIT)

  console.log(`${DRY ? '[DRY] ' : ''}procesando ${list.length} chat(s)\n`)
  for (const f of list) {
    const contact = f.replace(/^WhatsApp Chat - /i, '').replace(/\.zip$/i, '')
    try {
      const txt = await readChatTxt(join(DIR, f))
      const msgs = parseExport(txt)
      if (msgs.length === 0) { console.log(`  ⚠️ ${contact}: sin mensajes parseados`); continue }
      // Detección de GRUPO: más de 2 autores distintos → no es un chat 1:1.
      const authors = new Set(msgs.map((m) => m.author))
      if (authors.size > GROUP_AUTHOR_THRESHOLD + 1) { // +1 por posibles mensajes de sistema
        console.log(`  ⤳ ${contact}: GRUPO (${authors.size} autores) → salteado (no es persona 1:1)`)
        continue
      }
      const person = await resolvePerson(contact, people)
      if (!person) { console.log(`  ⤳ ${contact}: salteado (SKIP en overrides)`); continue }
      const first = msgs[0].iso, last = msgs[msgs.length - 1].iso
      const tagged = tagAuthors(msgs, person.name)

      // CAPA 1 — historial completo al sustrato (siempre; barato, sin LLM).
      const appended = DRY ? 0 : await appendMessages(person.id, tagged)

      // Modo solo-sustrato: no interpretamos ni tocamos observaciones (ya existen).
      if (MESSAGES_ONLY) {
        // last_contact al último mensaje si adelanta.
        const day = last.slice(0, 10)
        if (!DRY) {
          const { data: prow } = await sb.from('people').select('last_contact').eq('id', person.id).maybeSingle()
          if (!prow?.last_contact || prow.last_contact.slice(0, 10) < day) await sb.from('people').update({ last_contact: day }).eq('id', person.id)
        }
        console.log(`  ${contact} → ${person.name}${person.created ? ' (NUEVA)' : ''} · ${msgs.length} msgs → ${appended} al sustrato`)
        continue
      }

      // CAPA 2 — síntesis (observación) con LLM.
      process.stdout.write(`  ${contact} → ${person.name}${person.created ? ' (NUEVA)' : ''} · ${msgs.length} msgs · interpretando… `)
      const { parsed, blockSummaries } = await interpretChat(msgs, person.name)
      const sample = tagged.slice(-40).map((m) => ({ timestamp: m.iso.slice(11, 16), iso: m.iso, author: m.side, content: m.content.slice(0, 300) })).filter((m) => m.content)
      const data = {
        personName: person.name, conversationDate: last, source: 'whatsapp_export',
        summary: parsed.summary || '', topics: parsed.topics || [], facts: parsed.facts || [], events: parsed.events || [],
        extractedDates: parsed.extractedDates || [], emotionalStates: parsed.emotionalStates || {},
        blockSummaries, rawMessages: sample, messageCount: msgs.length, mediaCount: 0,
        dateRange: { first, last }, participants: [person.name, 'Aaron'],
        interactionQuality: parsed.interactionQuality ?? null, recentTone: parsed.recentTone ?? null, emotionalTone: parsed.emotionalTone ?? null,
        confidence: 'high', importedAt: new Date().toISOString(),
      }
      if (DRY) { console.log(`OK [dry] · summary: ${(data.summary || '').slice(0, 60)}…`); continue }
      // dedup: obsoletar whatsapp_chat previos de la persona
      await sb.from('observations').update({ is_obsolete: true, obsoleted_at: new Date().toISOString(), obsoleted_reason: 'reemplazado por import batch' }).eq('user_id', AARON).eq('person_id', person.id).eq('capture_type', 'whatsapp_chat').eq('is_obsolete', false)
      const { error } = await sb.from('observations').insert({ id: randomUUID(), user_id: AARON, person_id: person.id, capture_type: 'whatsapp_chat', source_image_path: null, storage_bucket: null, data, detector_data: { type: 'whatsapp_chat', confidence: 'high', reasoning: 'import batch de export (texto fiel)', suggestedPersonName: person.name }, confidence: 'high', observed_at: last, needs_review: false })
      if (error) { console.log(`FALLÓ: ${error.message}`); continue }
      // last_contact si adelanta
      const day = last.slice(0, 10)
      const { data: prow } = await sb.from('people').select('last_contact').eq('id', person.id).maybeSingle()
      if (!prow?.last_contact || prow.last_contact.slice(0, 10) < day) await sb.from('people').update({ last_contact: day }).eq('id', person.id)
      console.log(`✓ guardado · ${data.facts.length} hechos, ${data.topics.length} temas`)
    } catch (e) {
      console.log(`  ❌ ${contact}: ${String(e.message || e).slice(0, 120)}`)
    }
  }
  console.log('\nlisto.')
}
main()
