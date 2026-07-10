// SIR V2 — DRY-RUN de dos deudas. SOLO LECTURA. NO aplica NADA.
//
//   node scripts/deuda-dry-run.mjs            # reporte legible
//   node scripts/deuda-dry-run.mjs --json     # JSON crudo (para el doc)
//
// Deuda 1 — Consistencia temporal de hechos (reconcile network-wide):
//   Recorre cada persona, junta sus `facts` (de observations vivas, en orden
//   cronológico) y corre el reconcile REAL (src/lib/facts/reconcile.ts) en modo
//   simulación. REPORTA qué facts de vivienda quedarían obsoletos por una
//   MUDANZA explícita posterior, SIN tocar la DB. La v1 fue demasiado agresiva
//   (dropeó facts complementarios); este dry-run existe para revisar ANTES de
//   cualquier apply.
//
// Deuda 2 — Huérfanos de Storage:
//   Lista (solo lectura) los objetos de cada bucket y los cruza contra las filas
//   que los referencian (observations vivas, person_avatars, health_metrics).
//   REPORTA paths sin referencia viva por bucket + conteo. NO borra nada.
//
// Talca a PostgREST (/rest/v1) y a la Storage API (/storage/v1) con el
// service_role del .env.local. Mismo patrón que scripts/audit-prod-schema.mjs.
//
// Nota Node: importa el reconcile .ts directo (type-stripping nativo, Node ≥22.18).
// El warning MODULE_TYPELESS_PACKAGE_JSON es inofensivo; se silencia con
// --disable-warning=MODULE_TYPELESS_PACKAGE_JSON si molesta.

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { reconcileFacts } from '../src/lib/facts/reconcile.ts'

// ─── env + http ─────────────────────────────────────────────────────
function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

// En un worktree aislado el .env.local no está versionado ni linkeado: cae al
// del repo principal (git common dir → raíz del repo canónico).
function resolveEnvPath() {
  if (existsSync('.env.local')) return '.env.local'
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim()
    const mainRoot = join(commonDir, '..')
    const candidate = join(mainRoot, '.env.local')
    if (existsSync(candidate)) return candidate
  } catch { /* ignore */ }
  return '.env.local' // que falle con mensaje claro si de verdad no existe
}

const env = loadEnv(resolveEnvPath())
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('MISSING_ENV', { url: !!URL, key: !!KEY })
  process.exit(2)
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const JSON_H = { ...H, 'content-type': 'application/json' }
const JSON_OUT = process.argv.includes('--json')

/** GET de PostgREST paginado (1000/página) hasta agotar. */
async function pgAll(pathAndQuery) {
  const rows = []
  let offset = 0
  const page = 1000
  for (;;) {
    const sep = pathAndQuery.includes('?') ? '&' : '?'
    const r = await fetch(`${URL}/rest/v1/${pathAndQuery}${sep}limit=${page}&offset=${offset}`, { headers: H })
    if (r.status !== 200) throw new Error(`PostgREST ${r.status} en ${pathAndQuery}: ${await r.text()}`)
    const batch = await r.json()
    rows.push(...batch)
    if (batch.length < page) break
    offset += page
  }
  return rows
}

/** Lista recursiva de un bucket de Storage. Devuelve paths completos de archivos. */
async function listBucket(bucketId) {
  const files = []
  async function walk(prefix) {
    let offset = 0
    const limit = 1000
    for (;;) {
      const r = await fetch(`${URL}/storage/v1/object/list/${bucketId}`, {
        method: 'POST',
        headers: JSON_H,
        body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
      })
      if (r.status !== 200) throw new Error(`Storage list ${r.status} en ${bucketId}/${prefix}: ${await r.text()}`)
      const items = await r.json()
      for (const it of items) {
        const full = prefix ? `${prefix}${it.name}` : it.name
        // Carpeta: id === null y sin metadata. Archivo: id uuid.
        if (it.id === null && (it.metadata === null || it.metadata === undefined)) {
          await walk(`${full}/`)
        } else {
          files.push(full)
        }
      }
      if (items.length < limit) break
      offset += limit
    }
  }
  await walk('')
  return files
}

// ════════════════════════════════════════════════════════════════════
// DEUDA 1 — reconcile network-wide (dry-run)
// ════════════════════════════════════════════════════════════════════
async function reconcileDryRun() {
  // Personas (para nombrar el reporte).
  const people = await pgAll('people?select=id,name')
  const nameById = new Map(people.map((p) => [p.id, p.name]))

  // Observations VIVAS con person_id. Traemos data->facts + timestamps para
  // ordenar cronológicamente. observed_at ASC, created_at ASC como desempate.
  const obs = await pgAll(
    'observations?is_obsolete=eq.false&person_id=not.is.null' +
      '&select=id,person_id,capture_type,observed_at,created_at,facts:data->facts' +
      '&order=observed_at.asc,created_at.asc',
  )

  // Agrupar por persona, en orden cronológico (el order de la query ya sirve).
  const byPerson = new Map()
  for (const o of obs) {
    const facts = Array.isArray(o.facts) ? o.facts.filter((f) => typeof f === 'string' && f.trim()) : []
    if (facts.length === 0) continue
    if (!byPerson.has(o.person_id)) byPerson.set(o.person_id, [])
    // Guardamos cada fact con su observation de origen para trazabilidad.
    for (const f of facts) byPerson.get(o.person_id).push({ fact: f, obsId: o.id, observedAt: o.observed_at })
  }

  const perPerson = []
  let totalSuperseded = 0
  let peopleAffected = 0
  for (const [personId, entries] of byPerson) {
    const orderedFacts = entries.map((e) => e.fact)
    const { superseded } = reconcileFacts(orderedFacts)
    if (superseded.length === 0) continue
    peopleAffected++
    totalSuperseded += superseded.length
    // Mapear cada superseded de vuelta a su observation de origen (primer match).
    const items = superseded.map((s) => {
      const src = entries.find((e) => e.fact === s.text)
      return {
        oldFact: s.text,
        supersededBy: s.supersededBy,
        attribute: s.attribute,
        fromObservationId: src ? src.obsId : null,
        fromObservedAt: src ? src.observedAt : null,
      }
    })
    perPerson.push({
      personId,
      name: nameById.get(personId) ?? '(sin nombre)',
      totalFacts: orderedFacts.length,
      supersededCount: superseded.length,
      superseded: items,
    })
  }

  perPerson.sort((a, b) => b.supersededCount - a.supersededCount)
  return {
    peopleScanned: byPerson.size,
    observationsWithFacts: obs.filter((o) => Array.isArray(o.facts) && o.facts.length).length,
    peopleAffected,
    totalFactsSuperseded: totalSuperseded,
    perPerson,
  }
}

// ════════════════════════════════════════════════════════════════════
// DEUDA 2 — huérfanos de Storage (dry-run)
// ════════════════════════════════════════════════════════════════════
const OBS_BUCKETS = ['linkedin-captures', 'instagram-captures', 'whatsapp-captures']

async function storageOrphans() {
  // Referencias VIVAS por bucket.
  //  - observations (source_image_path + storage_bucket), is_obsolete=false → linkedin/instagram/whatsapp
  //  - person_avatars.storage_path → person-avatars
  //  - health_metrics.source_image_path → scale-captures
  const obsRows = await pgAll(
    'observations?source_image_path=not.is.null&select=source_image_path,storage_bucket,is_obsolete',
  )
  const liveByBucket = new Map() // bucket → Set(path)
  const obsoleteByBucket = new Map()
  for (const b of [...OBS_BUCKETS, 'person-avatars', 'scale-captures']) {
    liveByBucket.set(b, new Set())
    obsoleteByBucket.set(b, new Set())
  }
  for (const r of obsRows) {
    const bucket = r.storage_bucket
    if (!liveByBucket.has(bucket)) continue
    ;(r.is_obsolete ? obsoleteByBucket : liveByBucket).get(bucket).add(r.source_image_path)
  }

  const avatars = await pgAll('person_avatars?select=storage_path')
  for (const a of avatars) if (a.storage_path) liveByBucket.get('person-avatars').add(a.storage_path)

  const hm = await pgAll('health_metrics?source_image_path=not.is.null&select=source_image_path')
  for (const m of hm) if (m.source_image_path) liveByBucket.get('scale-captures').add(m.source_image_path)

  const perBucket = []
  for (const bucket of [...OBS_BUCKETS, 'person-avatars', 'scale-captures']) {
    let objects
    try {
      objects = await listBucket(bucket)
    } catch (e) {
      perBucket.push({ bucket, error: String(e).slice(0, 200) })
      continue
    }
    const live = liveByBucket.get(bucket)
    const obsolete = obsoleteByBucket.get(bucket)
    const orphans = [] // sin NINGUNA referencia (ni viva ni obsoleta)
    const onlyObsolete = [] // referenciados SOLO por una observation obsoleta
    for (const path of objects) {
      if (live.has(path)) continue
      if (obsolete.has(path)) onlyObsolete.push(path)
      else orphans.push(path)
    }
    perBucket.push({
      bucket,
      objectCount: objects.length,
      liveReferences: live.size,
      orphanCount: orphans.length,
      onlyObsoleteCount: onlyObsolete.length,
      orphans: orphans.sort(),
      onlyObsolete: onlyObsolete.sort(),
    })
  }
  return { perBucket }
}

// ─── run ────────────────────────────────────────────────────────────
const [reconcile, storage] = [await reconcileDryRun(), await storageOrphans()]
const report = { generatedAt: new Date().toISOString(), reconcile, storage }

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

// Reporte legible
const L = console.log
L('════════════════════════════════════════════════════════════════')
L('DRY-RUN DE DEUDAS — SOLO LECTURA, NO SE APLICÓ NADA')
L(`Generado: ${report.generatedAt}`)
L('════════════════════════════════════════════════════════════════')
L('')
L('── DEUDA 1: reconcile temporal (relocation-only) ────────────────')
L(`Personas con facts escaneadas : ${reconcile.peopleScanned}`)
L(`Personas afectadas            : ${reconcile.peopleAffected}`)
L(`Facts que se obsoletarían      : ${reconcile.totalFactsSuperseded}`)
L('')
if (reconcile.perPerson.length === 0) {
  L('  (ninguna mudanza explícita deja facts anteriores obsoletos)')
} else {
  for (const p of reconcile.perPerson) {
    L(`• ${p.name}  [${p.personId}]  — ${p.supersededCount}/${p.totalFacts} facts`)
    for (const s of p.superseded) {
      L(`    OBSOLETO: "${s.oldFact}"`)
      L(`    por mudanza: "${s.supersededBy}"`)
    }
    L('')
  }
}
L('── DEUDA 2: huérfanos de Storage ────────────────────────────────')
for (const b of storage.perBucket) {
  if (b.error) {
    L(`• ${b.bucket}: ERROR — ${b.error}`)
    continue
  }
  L(`• ${b.bucket}: ${b.objectCount} objetos, ${b.liveReferences} refs vivas, ` +
    `${b.orphanCount} huérfanos, ${b.onlyObsoleteCount} solo-obsoletos`)
  for (const o of b.orphans.slice(0, 10)) L(`    huérfano: ${o}`)
  if (b.orphans.length > 10) L(`    … +${b.orphans.length - 10} más`)
}
L('')
L('NOTA: nada se borró ni se marcó obsoleto. Esto es un reporte.')
