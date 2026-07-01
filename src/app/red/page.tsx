// SIR V2 — /red (Server Component)
//
// /red ES el grafo de relaciones (antes había un landing-hub con dos cards
// redundantes — la "lista" ya es /relaciones, en el nav, y abrir el grafo
// era un clic de más). Ahora la ruta renderiza el GraphView directo.
// /red/grafo redirige acá para no romper links viejos.
//
// Lookup server-side de profile.full_name + email del usuario para el label
// del nodo central, e interacción por persona (última + ánimo) para el hover
// y la detección de 2º grado. La lógica interna del grafo (GraphView /
// GraphCanvas / GraphFilters) vive en sus componentes y no se toca acá.

import { redirect } from 'next/navigation'
import { Network } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { GraphViewLazy as GraphView } from '@/components/red/GraphViewLazy'
import { createClient } from '@/lib/supabase/server'

export default async function RedPage() {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) redirect('/auth/login')

  // Lookup profile.full_name (puede no existir si el usuario no la seteo).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const selfFullName = (profile?.full_name as string | null) ?? null
  const selfEmail = user.email ?? ''

  // Interacción por persona (server, sin N+1): dos queries (observations +
  // person_logs), agrupadas en JS → última interacción + ánimo. Sirve para el
  // hover Y para 2º grado (quien tiene interacción es contacto directo). RLS
  // scopea ambas al usuario.
  const [obsRows, logRows] = await Promise.all([
    supabase
      .from('observations')
      .select('person_id, observed_at, capture_type')
      .eq('is_obsolete', false)
      .not('person_id', 'is', null),
    supabase.from('person_logs').select('person_id, logged_at, kind, value'),
  ])

  const CAP_LABEL: Record<string, string> = {
    whatsapp_chat: 'WhatsApp', whatsapp_web: 'WhatsApp', whatsapp_info: 'WhatsApp',
    instagram: 'Instagram', linkedin: 'LinkedIn', voice_note: 'Nota de voz', manual_note: 'Nota',
  }
  const LOG_LABEL: Record<string, string> = {
    mood: 'Ánimo', energy: 'Energía', sleep: 'Sueño', pain: 'Dolor', interaction: 'Interacción',
  }

  const interactionById: Record<string, { at: string; label: string; mood?: string }> = {}
  const bump = (pid: string, at: string, label: string) => {
    const cur = interactionById[pid]
    if (!cur || at > cur.at) interactionById[pid] = { at, label, mood: cur?.mood }
  }

  for (const r of (obsRows.data ?? []) as { person_id: string | null; observed_at: string | null; capture_type: string | null }[]) {
    if (r.person_id && r.observed_at) bump(r.person_id, r.observed_at, CAP_LABEL[r.capture_type ?? ''] ?? 'Captura')
  }
  const latestMood: Record<string, { at: string; value: number }> = {}
  for (const r of (logRows.data ?? []) as { person_id: string | null; logged_at: string | null; kind: string | null; value: number | null }[]) {
    if (!r.person_id || !r.logged_at) continue
    bump(r.person_id, r.logged_at, `${LOG_LABEL[r.kind ?? ''] ?? 'Registro'} ${r.value ?? ''}/5`.trim())
    if (r.kind === 'mood' && r.value != null) {
      const m = latestMood[r.person_id]
      if (!m || r.logged_at > m.at) latestMood[r.person_id] = { at: r.logged_at, value: r.value }
    }
  }
  for (const [pid, m] of Object.entries(latestMood)) {
    if (interactionById[pid]) interactionById[pid].mood = `Ánimo ${m.value}/5`
  }

  const directContactIds = Object.keys(interactionById)

  return (
    <AppShell>
      <header className="mb-6 sm:mb-8">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans mb-1">
          SIR V2 &mdash; Tu red personal
        </div>
        <div className="flex items-center gap-3">
          <Network size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Red</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Vos en el centro, conectado a cada persona por categoría. Filtrá por tipo
          de relación o salud mínima. La lista completa con edición vive en{' '}
          <span className="font-mono text-foreground/70">/relaciones</span>.
        </p>
      </header>

      <GraphView
        selfFullName={selfFullName}
        selfEmail={selfEmail}
        directContactIds={directContactIds}
        interactionById={interactionById}
      />
    </AppShell>
  )
}
