// SIR V2 — /red/grafo (Server Component)
//
// Lookup server-side de profile.full_name + email del usuario para construir
// el label del nodo central. Pasa props al GraphView (client component).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Network } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { GraphView } from '@/components/red/GraphView'
import { createClient } from '@/lib/supabase/server'

export default async function GrafoPage() {
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

  // Personas con interacción DIRECTA: aparecen en alguna observation curada o
  // person_log. Los familiares creados desde la card "Familia" (sin captura ni
  // log) NO están acá → el grafo los trata como 2º grado (cuelgan de su
  // contacto, no del centro). RLS scopea ambas queries al usuario.
  const [obsRows, logRows] = await Promise.all([
    supabase.from('observations').select('person_id').eq('is_obsolete', false).not('person_id', 'is', null),
    supabase.from('person_logs').select('person_id'),
  ])
  const directContactIds = Array.from(
    new Set(
      [
        ...((obsRows.data ?? []) as { person_id: string | null }[]),
        ...((logRows.data ?? []) as { person_id: string | null }[]),
      ]
        .map((r) => r.person_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )

  return (
    <AppShell>
      <Link
        href="/red"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Red
      </Link>

      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Red personal
        </div>
        <div className="flex items-center gap-3">
          <Network size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Grafo de relaciones</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Vos en el centro, conectado a cada persona por categoría. Filtrá por tipo
          de relación o salud mínima.
        </p>
      </header>

      <GraphView selfFullName={selfFullName} selfEmail={selfEmail} directContactIds={directContactIds} />
    </AppShell>
  )
}
