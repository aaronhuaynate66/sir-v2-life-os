// SIR V2 — Runner del harness de eval del cerebro (Ola 2, slice 3).
//
// Corre cada caso contra el /api/sir/ask REAL (el cerebro de verdad, con la data
// real) y puntúa la respuesta con un LLM-juez (rúbrica en src/lib/eval/judge.ts).
// Así se puede saber si un cambio MEJORA o EMPEORA las respuestas, en vez de
// optimizar a ciegas.
//
// USO (necesita el server corriendo):
//   1. npm run dev            (en otra terminal; /api/dev-login solo existe en dev)
//   2. node scripts/eval-sir.ts
//      opciones:
//        --base <url>          default http://localhost:3000
//        --from-feedback <N>   suma N casos recientes desde chat_feedback (👍/👎)
//        --only <tag>          corre solo los casos con ese tag
//
// Node 24 corre TS por type-stripping. El juez usa Anthropic (capable); overridea
// con EVAL_JUDGE_MODEL. Lee llaves de .env.local.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildJudgePrompt, parseJudgeVerdict, aggregateVerdicts, feedbackToCase, type EvalCase, type JudgeVerdict } from '../src/lib/eval/judge.ts'

// ── env ──────────────────────────────────────────────────────────────
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const AARON_UID = '5c23c82c-2beb-401b-8555-706ac0b81248'
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || 'claude-sonnet-4-5-20250929'

// ── args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const BASE = getArg('--base') || 'http://localhost:3000'
const FROM_FEEDBACK = Number(getArg('--from-feedback') || 0)
const ONLY_TAG = getArg('--only')
// N corridas por caso: se agregan por MEDIANA para amortiguar el ruido del modelo
// y del juez. Default 3 (fiabilidad); --runs 1 para un smoke rápido.
const RUNS = Math.max(1, Number(getArg('--runs') || 3))

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/dev-login?next=/panel`, { redirect: 'manual' })
  const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  if (set.length === 0) throw new Error(`dev-login no devolvió cookies (¿server en ${BASE}? ¿NODE_ENV=development?)`)
  return set.map((c) => c.split(';')[0]).join('; ')
}

async function askSir(cookie: string, c: EvalCase): Promise<string> {
  const res = await fetch(`${BASE}/api/sir/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ question: c.question, userContext: c.context }),
  })
  const j = (await res.json().catch(() => ({}))) as { answer?: string; error?: string }
  return j.answer ?? `(sin respuesta: ${j.error ?? res.status})`
}

async function judge(c: EvalCase, answer: string): Promise<JudgeVerdict> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return parseJudgeVerdict('') // sin llave → veredicto vacío
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // temperature 0: el juez debe ser lo más determinista posible (era la causa #1
    // del ruido — calificaba respuestas casi idénticas 92 vs 35).
    body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 400, temperature: 0, messages: [{ role: 'user', content: buildJudgePrompt(c, answer) }] }),
  })
  const j = (await res.json().catch(() => ({}))) as { content?: { text?: string }[] }
  return parseJudgeVerdict(j.content?.[0]?.text ?? '')
}

function loadGolden(): EvalCase[] {
  try {
    return readFileSync('eval/golden.jsonl', 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as EvalCase)
  } catch { return [] }
}

async function loadFeedbackCases(n: number): Promise<EvalCase[]> {
  if (n <= 0) return []
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, keyS = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !keyS) return []
  const a = createClient(url, keyS, { auth: { persistSession: false } })
  const { data } = await a.from('chat_feedback')
    .select('id, question, answer, rating, correction')
    .eq('user_id', AARON_UID).order('created_at', { ascending: false }).limit(n)
  return ((data ?? []) as { id: string; question: string | null; answer: string; rating: 'up' | 'down'; correction: string | null }[]).map(feedbackToCase)
}

function bar(score: number): string {
  const n = Math.round(score / 10)
  return '█'.repeat(n) + '░'.repeat(10 - n)
}

async function main() {
  let cases = [...loadGolden(), ...(await loadFeedbackCases(FROM_FEEDBACK))]
  if (ONLY_TAG) cases = cases.filter((c) => (c.tags ?? []).includes(ONLY_TAG))
  if (cases.length === 0) { console.log('No hay casos. Agrega a eval/golden.jsonl o usa --from-feedback N.'); return }

  console.log(`\n🧪 Eval SIR — ${cases.length} caso(s) × ${RUNS} corrida(s) · base ${BASE} · juez ${JUDGE_MODEL} (temp 0)\n`)
  const cookie = await login()
  let passed = 0, sum = 0
  let noisy = 0
  for (const c of cases) {
    // N corridas: cada una es ask + judge (captura ruido de modelo Y de juez).
    const verdicts: JudgeVerdict[] = []
    let lastAnswer = ''
    for (let i = 0; i < RUNS; i++) {
      lastAnswer = await askSir(cookie, c)
      verdicts.push(await judge(c, lastAnswer))
    }
    const v = aggregateVerdicts(verdicts)
    passed += v.pass ? 1 : 0; sum += v.score
    const mark = v.pass ? '✅' : '❌'
    // spread alto = caso INESTABLE (el veredicto no es de fiar; recalibrar el caso).
    const unstable = RUNS > 1 && v.spread >= 25
    if (unstable) noisy++
    const spreadTag = RUNS > 1 ? ` · corridas [${v.scores.join(',')}] spread ${v.spread}${unstable ? ' ⚠️inestable' : ''}` : ''
    console.log(`${mark} ${bar(v.score)} ${String(v.score).padStart(3)}  ${c.id}${spreadTag}`)
    console.log(`     g${v.dims.grounding} h${v.dims.honesty} l${v.dims.language} u${v.dims.usefulness} t${v.dims.tone} · ${v.reasons}`)
    console.log(`     R: ${lastAnswer.replace(/\s+/g, ' ').slice(0, 140)}\n`)
  }
  const noisyTag = RUNS > 1 && noisy > 0 ? ` · ${noisy} caso(s) inestable(s) ⚠️` : ''
  console.log(`── ${passed}/${cases.length} pasaron · score mediano promedio ${Math.round(sum / cases.length)}${noisyTag} ──\n`)
}

main().catch((e) => { console.error('eval falló:', e instanceof Error ? e.message : e); process.exit(1) })
