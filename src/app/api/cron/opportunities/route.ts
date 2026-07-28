// SIR V2 — GET /api/cron/opportunities
//
// Cron DIARIO que hace correr el detector de oportunidades sobre las
// conversaciones y deja las señales confirmadas en `opportunity_signals` (mig
// 0173), listas para que el brief de la mañana las surfacée.
//
// POR QUÉ VIVE APARTE del morning-push: el detector juzga cada candidato con una
// llamada LLM. Meterlo dentro del brief le sumaría esa latencia (y ese modo de
// falla) a un cron que tiene que salir siempre. Acá se paga una vez, temprano; el
// brief después solo LEE la tabla, que es barato y no puede fallar por el LLM.
// Corre 09:40 UTC, ~20 min antes del morning-push (11:00 UTC).
//
// AHORRO DELIBERADO: los candidatos que ya tienen veredicto guardado NO se
// vuelven a juzgar. Un "no es negocio" de Aaron es definitivo — re-preguntarle al
// modelo sería pagar dos veces por la misma respuesta y arriesgar que vuelva algo
// que él ya descartó.
//
// Auth: CRON_SECRET (Bearer). Service-role para iterar; filtro por user_id
// explícito en cada lectura (los loaders no se auto-scopean — regla del repo).

import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { detectOpportunitySignals, LOOKBACK_DAYS, type PersonThread, type OpportunitySignal } from '@/lib/opportunities/detect'
import { JUDGE_SYSTEM, buildJudgePrompt, parseJudgeVerdict } from '@/lib/opportunities/judge'
import { complete } from '@/lib/llm/complete'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TAG = '[cron/opportunities]'
/** Tope de candidatos a juzgar por corrida: el LLM cuesta, y si un día salen 200
 *  es señal de que el lexicón se rompió, no de que Aaron tenga 200 clientes. */
const MAX_JUDGE = 25
/** Mensajes que se traen por página de PostgREST. */
const PAGE = 1000

/** Id determinístico: la misma señal no se duplica ni pisa su estado al re-correr. */
function signalId(userId: string, personId: string, kind: string, quoteAt: string): string {
  return `opp_${createHash('sha1').update(`${userId}|${personId}|${kind}|${quoteAt}`).digest('hex').slice(0, 32)}`
}

interface MsgRow {
  person_id: string | null
  sent_at: string | null
  sender: string | null
  author_name: string | null
  content: string | null
}

async function loadThreads(admin: SupabaseClient, userId: string, sinceISO: string): Promise<Map<string, PersonThread>> {
  const { data: people, error: pErr } = await admin
    .from('people').select('id, name, relationship').eq('user_id', userId).limit(2000)
  if (pErr) throw new Error(`people: ${pErr.message}`)
  const meta = new Map((people ?? []).map((p) => [String(p.id), { name: String(p.name ?? ''), rel: (p.relationship as string) ?? null }]))

  const byPerson = new Map<string, PersonThread>()
  for (let off = 0; off < 60_000; off += PAGE) {
    const { data, error } = await admin
      .from('chat_messages')
      .select('person_id, sent_at, sender, author_name, content')
      .eq('user_id', userId)
      .gte('sent_at', sinceISO)
      .order('sent_at', { ascending: true })
      .range(off, off + PAGE - 1)
    // PostgREST no lanza: el error viene en `.error` (trampa de #947).
    if (error) throw new Error(`chat_messages: ${error.message}`)
    const page = (data ?? []) as MsgRow[]
    if (page.length === 0) break
    for (const r of page) {
      if (!r.person_id || !r.sent_at) continue
      const m = meta.get(r.person_id)
      if (!byPerson.has(r.person_id)) {
        byPerson.set(r.person_id, {
          personId: r.person_id,
          personName: m?.name || r.person_id,
          relationship: m?.rel ?? null,
          messages: [],
        })
      }
      // "Lo escribió Aaron" — el import marca el remitente de dos formas.
      const fromMe = r.sender === 'user' || r.sender === 'me' || /aaron/i.test(r.author_name ?? '')
      byPerson.get(r.person_id)!.messages.push({ sentAt: r.sent_at, fromMe, text: r.content ?? '' })
    }
    if (page.length < PAGE) break
  }
  return byPerson
}

/** Últimos mensajes previos a la cita — el contexto que el juez necesita para
 *  distinguir "me pide algo" de "habla de lo suyo". */
function contextFor(th: PersonThread, signal: OpportunitySignal): string[] {
  return th.messages
    .filter((m) => m.sentAt <= signal.quoteAt)
    .slice(-6)
    .map((m) => `${m.fromMe ? 'Aaron' : th.personName}: ${(m.text || '').replace(/\s+/g, ' ').slice(0, 140)}`)
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error(`${TAG} CRON_SECRET no configurada`)
    return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    console.error(`${TAG} authorization no coincide`)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${TAG} falta configuración de Supabase`)
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  }
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const now = new Date()
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const out = { users: 0, candidates: 0, judged: 0, confirmed: 0, skipped: 0, errors: 0 }

  try {
    const { data: profiles, error } = await admin.from('profiles').select('id').limit(50)
    if (error) throw new Error(`profiles: ${error.message}`)

    for (const p of (profiles ?? []) as Array<{ id: string }>) {
      const userId = String(p.id)
      out.users++
      try {
        const threads = await loadThreads(admin, userId, since)

        const { data: dealRows, error: dErr } = await admin
          .from('deals').select('contact_person_id, status').eq('user_id', userId).limit(500)
        if (dErr) throw new Error(`deals: ${dErr.message}`)

        const candidatos = detectOpportunitySignals(
          [...threads.values()],
          (dealRows ?? []).map((d) => ({ contactPersonId: (d.contact_person_id as string) ?? null, status: String(d.status) })),
          now,
        )
        out.candidates += candidatos.length

        // Veredictos ya guardados → no se re-juzgan (ni se re-preguntan al modelo).
        const ids = candidatos.map((c) => signalId(userId, c.personId, c.kind, c.quoteAt))
        const yaVistos = new Set<string>()
        if (ids.length > 0) {
          const { data: prev } = await admin
            .from('opportunity_signals').select('id').eq('user_id', userId).in('id', ids)
          for (const r of (prev ?? []) as Array<{ id: string }>) yaVistos.add(String(r.id))
        }

        let juzgados = 0
        for (const c of candidatos) {
          const id = signalId(userId, c.personId, c.kind, c.quoteAt)
          if (yaVistos.has(id)) { out.skipped++; continue }
          if (juzgados >= MAX_JUDGE) { out.skipped++; continue }
          juzgados++
          out.judged++

          const th = threads.get(c.personId)
          let veredicto
          try {
            const res = await complete({
              task: 'opportunity_judge', tier: 'cheap', maxTokens: 120, temperature: 0,
              system: JUDGE_SYSTEM,
              messages: [{ role: 'user', content: buildJudgePrompt(c, th ? contextFor(th, c) : []) }],
            })
            veredicto = parseJudgeVerdict(res.text)
          } catch (e) {
            // Sin juez no se inventa un veredicto: se saltea y se reintenta mañana.
            out.errors++
            reportApiError(e, { route: 'cron/opportunities', step: 'judge', person: c.personName })
            continue
          }
          if (!veredicto.isReal || !veredicto.what) continue

          const { error: insErr } = await admin.from('opportunity_signals').upsert({
            id, user_id: userId,
            person_id: c.personId, person_name: c.personName,
            kind: c.kind, quote: c.quote, quote_at: c.quoteAt, matched: c.matched,
            what: veredicto.what,
            days_since_quote: c.daysSinceQuote, days_since_last: c.daysSinceLast,
            confidence: c.confidence,
            state: 'pending', detected_at: now.toISOString(),
          }, { onConflict: 'id', ignoreDuplicates: false })
          if (insErr) { out.errors++; console.error(`${TAG} upsert: ${insErr.message}`) } else out.confirmed++
        }
      } catch (e) {
        out.errors++
        console.error(`${TAG} usuario ${userId.slice(0, 8)}: ${(e as Error).message}`)
        reportApiError(e, { route: 'cron/opportunities', user: userId.slice(0, 8) })
      }
    }
    return NextResponse.json({ ok: true, ...out })
  } catch (e) {
    console.error(`${TAG} fallo general: ${(e as Error).message}`)
    reportApiError(e, { route: 'cron/opportunities' })
    return NextResponse.json({ error: 'fallo' }, { status: 500 })
  }
}
