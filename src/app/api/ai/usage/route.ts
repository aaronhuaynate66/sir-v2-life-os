// SIR V2 — GET /api/ai/usage (#125). Agrega el consumo propio de IA de los
// últimos 30 días: total, por feature y por día, con costo estimado. RLS.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateCostUSD } from '@/lib/ai/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Row { feature: string; model: string | null; input_tokens: number; output_tokens: number; created_at: string }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  try {
    const { data } = await supabase.from('ai_usage')
      .select('feature, model, input_tokens, output_tokens, created_at')
      .eq('user_id', auth.user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(20000)
    const rows = (data ?? []) as Row[]

    let totalIn = 0, totalOut = 0, totalCost = 0, calls = rows.length
    const byFeature = new Map<string, { input: number; output: number; cost: number; calls: number }>()
    const byDay = new Map<string, { cost: number; tokens: number }>()
    for (const r of rows) {
      const cost = estimateCostUSD(r.model, r.input_tokens, r.output_tokens)
      totalIn += r.input_tokens; totalOut += r.output_tokens; totalCost += cost
      const f = byFeature.get(r.feature) ?? { input: 0, output: 0, cost: 0, calls: 0 }
      f.input += r.input_tokens; f.output += r.output_tokens; f.cost += cost; f.calls += 1; byFeature.set(r.feature, f)
      const day = r.created_at.slice(0, 10)
      const d = byDay.get(day) ?? { cost: 0, tokens: 0 }
      d.cost += cost; d.tokens += r.input_tokens + r.output_tokens; byDay.set(day, d)
    }
    return NextResponse.json({
      total: { inputTokens: totalIn, outputTokens: totalOut, tokens: totalIn + totalOut, costUSD: totalCost, calls },
      byFeature: Array.from(byFeature.entries()).map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.cost - a.cost),
      byDay: Array.from(byDay.entries()).map(([day, v]) => ({ day, ...v })).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 14),
    })
  } catch {
    return NextResponse.json({ total: { inputTokens: 0, outputTokens: 0, tokens: 0, costUSD: 0, calls: 0 }, byFeature: [], byDay: [] })
  }
}
