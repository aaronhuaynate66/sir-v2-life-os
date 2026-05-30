// SIR V2 — /relaciones/[slug] (Server Component)
//
// Detail page de una persona. Lookup server-side por (user_id, slug).
//
// Edge case "URL vieja /relationships/<uuid>": next.config redirige
// /relationships/<uuid> → /relaciones/<uuid>. Acá detectamos el UUID
// y hacemos:
//   - lookup por id → si la persona tiene slug, redirect 308 al slug
//     verdadero (/relaciones/<slug>).
//   - si no tiene slug todavía (rare), generamos uno + UPDATE + redirect.
//   - si no existe la persona → 404.
//
// Para slugs normales: lookup directo + render del PersonDetail client.

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { personAdapter } from '@/lib/supabase/sync'
import { ensureUniqueSlug, generateSlug } from '@/lib/people/slug'
import { PersonDetail } from '@/components/relaciones/PersonDetail'
import {
  getLatestObservation,
  getObservationsForPerson,
} from '@/lib/observations/fetch'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { getLogsForPerson } from '@/lib/person-logs/fetch'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function RelacionPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const userId = authData?.user?.id
  if (!userId) redirect('/auth/login')

  // ─── Caso 1: el "slug" es un UUID (URL vieja redirigida) ─────────
  if (UUID_REGEX.test(slug)) {
    const { data, error } = await supabase
      .from('people')
      .select('id, slug, name')
      .eq('user_id', userId)
      .eq('id', slug)
      .maybeSingle()
    if (error || !data) notFound()
    if (data.slug) {
      redirect(`/relaciones/${data.slug}`)
    }
    // Sin slug todavía: generamos uno on-the-fly, actualizamos, y redirect.
    const base = generateSlug(String(data.name ?? 'persona'))
    const fresh = await ensureUniqueSlug(base, userId, {
      excludeId: data.id as string,
      client: supabase,
    })
    await supabase
      .from('people')
      .update({ slug: fresh })
      .eq('id', data.id)
      .eq('user_id', userId)
    redirect(`/relaciones/${fresh}`)
  }

  // ─── Caso 2: slug normal ─────────────────────────────────────────
  const { data: row, error } = await supabase
    .from('people')
    .select('*')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()
  if (error || !row) notFound()

  const person = personAdapter.fromRow(row as Record<string, unknown>)

  // Capa de datos para el detail page (Sesion 3 PR-A):
  // - Ultima whatsapp_chat (fuente de "Ultima interaccion" — observations
  //   de tipo perfil como whatsapp_info / instagram / linkedin NO son
  //   interacciones).
  // - Observations curadas de la persona (is_obsolete=false). PR-A solo
  //   las usa para un panel de conteo / validacion del filtro; PR-B+ las
  //   consume para "Vida social / profesional" reales.
  // Ambos helpers tienen .eq('is_obsolete', false) baked in — vale el
  // principio critico de Sesion 3.
  const personId = String(row.id)
  const [lastChat, curatedObservations, memories, personLogs] = await Promise.all([
    getLatestObservation(supabase, userId, personId, 'whatsapp_chat'),
    getObservationsForPerson(supabase, userId, personId, { limit: 50 }),
    getMemoriesForPerson(supabase, userId, personId, { limit: 100 }),
    getLogsForPerson(supabase, userId, personId, { limit: 50 }),
  ])

  return (
    <PersonDetail
      initialPerson={person}
      lastChat={lastChat}
      curatedObservations={curatedObservations}
      memories={memories}
      personLogs={personLogs}
    />
  )
}
