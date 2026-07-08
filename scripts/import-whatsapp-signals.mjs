// SIR V2 — Batch: exports de WhatsApp → señales diarias → person_daily_signals.
//
// Camino léxico PURO (sin LLM, sin gastar tokens de la app). Parser propio del
// .txt; el léxico es copia FIEL de src/lib/forecast-conductual/lexicon.ts. El
// FORECAST lo corre después el endpoint real (/api/forecast) con el motor TS.
//
// Uso: node scripts/import-whatsapp-signals.mjs   (lista hardcodeada abajo)

import { readFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const CHATS = [
  'WhatsApp Chat - Dayana Yrribarren Delegada Analytics 1.zip',
  'WhatsApp Chat - Amira Laguna.zip',
  'WhatsApp Chat - Delicia Paredes.zip',
  'WhatsApp Chat - Miluska Castillo.zip',
  'WhatsApp Chat - Analia Cabrera.zip',
  'WhatsApp Chat - Miluska Castillo Hv.zip',
  'WhatsApp Chat - lau_113@hotmail.com.zip',
  'WhatsApp Chat - Maria Isabel Espinoza Vidaurre.zip',
  'WhatsApp Chat - Nicolle Huaynate Espinoza.zip',
  'WhatsApp Chat - Diana Carolina ❣️.zip',
]
const DIR = 'C:/Users/huayn/Dropbox/SIR/AARON SIR/whatsapp-chats'
const USER = 'Aaron Huaynate'

// ── Léxico (copia fiel de lexicon.ts) ──
const LEX = {
  pain: [/\bme duele|dolor|duele\b/i, /\bmigra[ñn]a|jaqueca|c[oó]lico|retorcij|puntada|calambre/i, /\bdolor de (cabeza|barriga|panza|espalda|ovario|est[oó]mago)/i],
  medication: [/\bpastilla|analg[eé]sic|paracetamol|ibuprofen|naproxen|anaflex|apronax|panadol|dolofl|buscapin/i, /\btom[eé] (una|algo|la|un)\b|me tom[eé]|medicaci[oó]n|remedio|antiinflamator/i, /\bcompr[eé] (pastilla|toalla|ibuprofen|algo para)/i],
  health: [/\bestoy mal|me siento mal|me siento d[eé]bil|malestar|me enferm/i, /\bn[aá]usea|v[oó]mit|fiebre|mareo|descompuest|indispuest/i],
  sleep: [/\bsue[ñn]o|cansad[ao]|agotad[ao]|reventad[ao]|muerta de sue[ñn]o/i, /\bno dorm[ií]|dorm[ií] mal|desvel|no pegu[eé] ojo|sin energ[ií]a/i],
  friction: [/\bme molesta|molest[ao]|harta|hart[ao]|enojad[ao]|bronca|fastidi/i, /\bno me hables|d[eé]jame en paz|ya fue|basta|no jodas|me tiene cansad/i, /\best[uú]pid|idiota|imb[eé]cil|malditа?|odio cuando/i],
  withdrawal: [/\bno quiero hablar|no tengo ganas|despu[eé]s hablamos|luego hablamos|hablamos (luego|despu[eé]s|ma[ñn]ana)/i, /\bd[eé]jame|estoy ocupad|no puedo hablar|ando ocupad|ya me voy/i, /^\s*(ok|oka|okey|ya|chau|bueno|aj[aá]|mmm|nada)\s*\.?\s*$/i],
  sensitivity: [/\btriste|sensible|ando rara|me siento sola|bajone|deprim|vulnerable/i, /\bllor(ar|é|o|ando)|ansios[ao]|angustia|me siento (mal|rara|down)/i, /\bnecesito (hablar|un abrazo|apoyo)|ap[oó]yame|abr[aá]zame|te extra[ñn]o/i],
  actions: [/\bcompr[eé]|fui\b|no fui|sal[ií]|me qued[eé]|me acost[eé]|descans[eé]/i, /\btrabaj[eé]|estudi[eé]|com[ií]|almorc[eé]|cen[eé]|entren[eé]|camin[eé]/i],
}
const W = { somatic: 0.25, friction: 0.25, withdrawal: 0.2, sensitivity: 0.15, actions: 0.15 }
const hit = (t, cat) => LEX[cat].some((re) => re.test(t))
const norm = (n) => Math.max(0, Math.min(1, n / 2))
const SYS = /cifrados de extremo a extremo|es un contacto|cambió (su|el)|se unió|creó el grupo|saliste|eliminaste|Se eliminó|Este mensaje fue eliminado|cambió su número/i
const MEDIA = /Multimedia omitido|sticker omitido|imagen omitida|audio omitido|Video omitido|GIF omitido|omitido>/i

function parseChat(txt) {
  const header = /^‎?\[(\d{1,2})\/(\d{1,2})\/(\d{2}), (\d{1,2}):(\d{2}):(\d{2})\] ([^:]+?): ([\s\S]*)$/
  const lines = txt.split('\n')
  const msgs = []
  let cur = null
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    const m = line.replace(/^‎/, '').match(header)
    if (m) {
      if (cur) msgs.push(cur)
      const [, dd, mm, yy, HH, MM, , author, text] = m
      const iso = `20${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(HH).padStart(2, '0')}:${MM}:00`
      cur = { iso, author: author.trim(), text: text }
    } else if (cur) {
      cur.text += '\n' + line
    }
  }
  if (cur) msgs.push(cur)
  return msgs
}

function dailySignals(msgs) {
  const byDay = new Map()
  for (const m of msgs) {
    if (m.author === USER) continue
    const t = (m.text || '').replace(/^‎/, '')
    if (SYS.test(t) || MEDIA.test(t)) continue
    if (!t.trim()) continue
    const day = m.iso.slice(0, 10)
    const arr = byDay.get(day) ?? []
    arr.push(t)
    byDay.set(day, arr)
  }
  const out = []
  for (const [date, texts] of byDay) {
    const c = (cat) => texts.filter((t) => hit(t, cat)).length
    const somatic = norm(c('pain') + c('medication') + c('health') + c('sleep'))
    const friction = norm(c('friction')), withdrawal = norm(c('withdrawal')), sensitivity = norm(c('sensitivity')), actions = norm(c('actions'))
    const composite = W.somatic * somatic + W.friction * friction + W.withdrawal * withdrawal + W.sensitivity * sensitivity + W.actions * actions
    out.push({ date, messageCount: texts.length, avgLen: texts.reduce((s, t) => s + t.length, 0) / texts.length, somatic, friction, withdrawal, sensitivity, actions, composite })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1))
  return out
}

const nm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
function matchPerson(chatName, people) {
  const toks = nm(chatName).split(' ').filter((t) => t.length > 2 && !['whatsapp', 'chat', 'delegada', 'analytics', 'hotmail', 'com'].includes(t))
  let best = null, bestScore = 0
  for (const p of people) {
    const pt = new Set(nm(p.name).split(' '))
    const score = toks.filter((t) => pt.has(t)).length
    if (score > bestScore) { bestScore = score; best = p }
  }
  return bestScore >= 1 ? best : null
}

async function main() {
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: people } = await sb.from('people').select('id, name')
  const { data: any1 } = await sb.from('person_daily_signals').select('user_id').limit(1)
  const userId = any1?.[0]?.user_id || (await sb.from('health_metrics').select('user_id').limit(1)).data?.[0]?.user_id

  for (const file of CHATS) {
    const name = file.replace(/^WhatsApp Chat - /, '').replace(/\.zip$/, '')
    const person = matchPerson(name, people)
    if (!person) { console.log(`SKIP  ${name} → sin match de persona`); continue }
    const dir = mkdtempSync(join(tmpdir(), 'wa-'))
    try { execSync(`unzip -o "${DIR}/${file}" -d "${dir}"`, { stdio: 'ignore' }) } catch { console.log(`ERR unzip ${name}`); continue }
    const txtName = readdirSync(dir).find((f) => f.endsWith('.txt'))
    if (!txtName) { console.log(`ERR sin .txt ${name}`); continue }
    const msgs = parseChat(readFileSync(join(dir, txtName), 'utf8'))
    const sigs = dailySignals(msgs)
    if (sigs.length === 0) { console.log(`SKIP  ${name} → 0 señales`); continue }
    const rows = sigs.map((s) => ({ id: `sig:${person.id}:${s.date}`, user_id: userId, person_id: person.id, date: s.date, message_count: s.messageCount, avg_len: s.avgLen, somatic: s.somatic, friction: s.friction, withdrawal: s.withdrawal, sensitivity: s.sensitivity, actions: s.actions, composite: s.composite, updated_at: new Date().toISOString() }))
    // upsert por lotes de 500
    let err = null
    for (let i = 0; i < rows.length; i += 500) { const r = await sb.from('person_daily_signals').upsert(rows.slice(i, i + 500), { onConflict: 'id' }); if (r.error) err = r.error.message }
    console.log(`OK    ${name} → ${person.name} · ${msgs.length} msgs · ${sigs.length} días · ${sigs[0].date}→${sigs[sigs.length - 1].date}${err ? ' · ERR:' + err.slice(0, 60) : ''}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
