// SIR V2 — GET /api/external/fx (Motor #8, señal externa: tipo de cambio USD/PEN).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchUsdToPenRate } from '@/lib/exchange'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const r = await fetchUsdToPenRate()
    return NextResponse.json({ rate: r.rate, isFallback: r.isFallback })
  } catch {
    return NextResponse.json({ rate: null, isFallback: true })
  }
}
