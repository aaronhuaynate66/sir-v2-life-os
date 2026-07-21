// Backup completo de chat_messages a un JSONL local (una fila por línea).
// Uso: node --max-old-space-size=4096 scripts/backup-chat-messages.mjs <ruta.jsonl>
import { createWriteStream } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const out = process.argv[2]
if (!out) { console.error('Falta la ruta de salida'); process.exit(1) }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const ws = createWriteStream(out, { encoding: 'utf8' })
let cursor = ''
let n = 0
for (;;) {
  let q = admin
    .from('chat_messages')
    .select('id, user_id, person_id, source, sender, author_name, sent_at, content, is_media, created_at')
    .order('id', { ascending: true })
    .limit(1000)
  if (cursor) q = q.gt('id', cursor)
  const { data, error } = await q
  if (error) { console.error('ERROR:', error.message); process.exit(1) }
  if (!data || data.length === 0) break
  for (const r of data) { ws.write(JSON.stringify(r) + '\n'); n++ }
  cursor = data[data.length - 1].id
  if (n % 40000 === 0) process.stdout.write(`  …${n} respaldadas\n`)
}
await new Promise((res) => ws.end(res))
console.log(`✅ Backup: ${n} filas → ${out}`)
