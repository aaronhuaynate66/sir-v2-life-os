// SIR V2 — /resumen (Fase 3c: resumen longitudinal semanal)
//
// Server component: auth + fetch del historial de resúmenes. El botón de
// generación + el render viven en ResumenClient (client).

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRecentSummaries } from '@/lib/longitudinal/fetch'
import { ResumenClient } from '@/components/resumen/ResumenClient'

export const dynamic = 'force-dynamic'

export default async function ResumenPage() {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) redirect('/auth/login')

  const summaries = await getRecentSummaries(supabase, userId, 8)

  return <ResumenClient initialSummaries={summaries} />
}
