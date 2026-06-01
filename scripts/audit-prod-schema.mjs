// READ-ONLY prod schema introspection for migration-drift audit.
// Talks to PostgREST OpenAPI (/rest/v1/) + Storage API (/storage/v1/bucket)
// with the service_role key. NO writes. NO SQL execution.
import { readFileSync } from 'node:fs'

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
  console.error('MISSING_ENV', { url: !!URL, key: !!KEY })
  process.exit(2)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }

// 1. OpenAPI introspection: authoritative list of public tables + columns + types.
const openapi = await fetch(`${URL}/rest/v1/`, { headers: H }).then((r) => r.json())
const defs = openapi.definitions || {}
const tables = {}
for (const [name, def] of Object.entries(defs)) {
  const cols = {}
  for (const [col, spec] of Object.entries(def.properties || {})) {
    // PostgREST puts the real pg type in `format` (e.g. "text", "uuid", "integer", "vector").
    cols[col] = spec.format || spec.type || '?'
  }
  tables[name] = cols
}

// 2. Targeted column probes (belt-and-suspenders for the high-value drift columns).
//    select=<col>&limit=0 -> 200 if col exists, 400/42703 if not. Read-only.
const probes = [
  ['memories', 'source_event_id'],   // 0012 — the bug
  ['memories', 'person_id'],         // 0010
  ['memories', 'source'],            // 0010
  ['memories', 'quality_score'],     // 0010
  ['memories', 'observation_id'],    // 0010
  ['memories', 'embedding'],         // 0015
  ['memories', 'embedding_model'],   // 0015
  ['people', 'slug'],                // 0008
  ['people', 'birth_date'],          // 0010
  ['people', 'cycle_start_date'],    // 0010
  ['health_metrics', 'capture_id'],  // 0005
  ['health_metrics', 'capture_type'],// 0007
  ['finance_movements', 'amount_pen'],// 0003
  ['finance_movements', 'exchange_rate'],// 0003
  ['observations', 'id'],            // 0010 table
  ['person_synthesis', 'id'],        // 0010 table
  ['person_logs', 'id'],             // 0013 table
  ['longitudinal_summaries', 'id'],  // 0016 table
  ['relationship_events', 'id'],     // 0021 table
]
const probeResults = {}
for (const [tbl, col] of probes) {
  const r = await fetch(`${URL}/rest/v1/${tbl}?select=${col}&limit=0`, { headers: H })
  let detail = ''
  if (r.status !== 200) {
    try { detail = (await r.json()).message || '' } catch { /* ignore */ }
  }
  probeResults[`${tbl}.${col}`] = { status: r.status, ok: r.status === 200, detail }
}

// 3. id column type check (0002/0006): uuid -> text on domain tables.
const idTypes = {}
for (const t of ['memories', 'people', 'relationships', 'goals', 'signals',
  'self_metrics', 'health_metrics', 'sleep_records', 'finance_movements', 'snapshots']) {
  idTypes[t] = tables[t]?.id ?? '(table missing)'
}

// 4. Storage buckets (0005/0009/0011/0014).
let buckets = null
try {
  const r = await fetch(`${URL}/storage/v1/bucket`, { headers: H })
  buckets = r.status === 200 ? (await r.json()).map((b) => b.id) : { status: r.status }
} catch (e) { buckets = { error: String(e) } }

// 5. match_memories RPC presence (0015). Look in OpenAPI paths.
const hasMatchMemoriesPath = !!(openapi.paths && openapi.paths['/rpc/match_memories'])

console.log(JSON.stringify({
  publicTables: Object.keys(tables).sort(),
  idTypes,
  probeResults,
  buckets,
  hasMatchMemoriesPath,
  // full column maps for the tables most affected by ALTERs
  columns: {
    memories: tables.memories,
    people: tables.people,
    health_metrics: tables.health_metrics,
    finance_movements: tables.finance_movements,
    observations: tables.observations,
  },
}, null, 2))
