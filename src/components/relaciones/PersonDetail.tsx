'use client'
// SIR V2 — /relaciones/[slug] detail UI
//
// Render de los datos básicos de una persona + formulario inline para
// editar nombre + slug. Otros campos siguen editándose desde el listado
// principal con el AlertDialog/Dialog existente (sin duplicar lógica).
//
// Cuando el usuario cambia el slug, validamos formato y uniqueness vía
// ensureUniqueSlug. Al guardar exitosamente:
//   1. updatePerson (sync engine sincroniza al DB).
//   2. router.replace al nuevo slug si cambió — la URL refleja el slug nuevo.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Users, Edit2, Check, X as XIcon } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

import { useRelationshipStore } from '@/stores'
import { createClient } from '@/lib/supabase/client'
import { ensureUniqueSlug, generateSlug, isValidSlug } from '@/lib/people/slug'
import { cn } from '@/lib/utils'
import { LastInteractionPanel } from './LastInteractionPanel'
import { RelationalScore } from './RelationalScore'
import { BirthdayCountdown } from './BirthdayCountdown'
import { FechasImportantes } from './FechasImportantes'
import { VidaProfesional } from './VidaProfesional'
import { VidaSocial } from './VidaSocial'
import { RedesSociales } from './RedesSociales'
import { LoPersonal } from './LoPersonal'
import { CicloPanel } from './CicloPanel'
import { MemoriasAsociadasPanel } from './MemoriasAsociadasPanel'
import { RegistroRapidoPanel } from './RegistroRapidoPanel'
import { RegistrarInteraccionPanel } from './RegistrarInteraccionPanel'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'
import type { PersonSynthesis } from '@/lib/person-synthesis/types'
import type { Memory, Person } from '@/types'

interface PersonDetailProps {
  initialPerson: Person
  /** Ultima observation con capture_type='whatsapp_chat' (ya curada
   *  is_obsolete=false). null si Diana no tiene chats registrados. */
  lastChat?: Observation | null
  /** Todas las observations curadas de la persona (is_obsolete=false),
   *  ordenadas por observed_at DESC. PR-A solo usa la longitud + breakdown
   *  para validar el filtro; PR-B+ consume el contenido. */
  curatedObservations?: Observation[]
  /** Memorias materializadas en tabla `memories` (PR-B Sesion 4 backend).
   *  Server-fetched, ordenadas por occurred_at DESC. */
  memories?: Memory[]
  /** Logs de la persona (mood/energy/sleep/pain/interaction). Sesion 6.
   *  Server-fetched, ordenados por logged_at DESC. */
  personLogs?: PersonLog[]
  /** Síntesis narrativa vigente ("Lo personal", #8). Server-fetched de
   *  person_synthesis (is_current=true). null si nunca se generó. */
  synthesis?: PersonSynthesis | null
}

const RELATIONSHIP_LABEL: Record<Person['relationship'], string> = {
  family: 'Familia',
  friend: 'Amigo/a',
  romantic: 'Pareja',
  professional: 'Profesional',
  mentor: 'Mentor/a',
  mentee: 'Aprendiz',
  acquaintance: 'Conocido/a',
}

const CATEGORY_LABEL: Record<Person['category'], string> = {
  inner_circle: 'Círculo cercano',
  close: 'Cercano',
  network: 'Network',
  peripheral: 'Periférico',
}

export function PersonDetail({
  initialPerson,
  lastChat = null,
  curatedObservations = [],
  memories = [],
  personLogs = [],
  synthesis = null,
}: PersonDetailProps) {
  const router = useRouter()
  const { people, updatePerson } = useRelationshipStore()

  // Si el local store tiene una version mas fresca (el sync engine la pullo),
  // usamos esa. Sino fallback al initialPerson del server.
  const live = people.find((p) => p.id === initialPerson.id) ?? initialPerson

  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(live.name)
  const [slugInput, setSlugInput] = useState(live.slug ?? generateSlug(live.name))
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setNameInput(live.name)
    setSlugInput(live.slug ?? generateSlug(live.name))
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
  }

  async function handleSave() {
    const trimmedName = nameInput.trim()
    const trimmedSlug = slugInput.trim()
    if (!trimmedName) {
      toast.error('Nombre vacío', { description: 'Ingresá al menos un nombre.' })
      return
    }
    if (!isValidSlug(trimmedSlug)) {
      toast.error('Slug inválido', {
        description: 'Solo letras minúsculas, números y guiones. Sin guiones dobles ni al inicio/final.',
      })
      return
    }
    setSaving(true)
    try {
      const sb = createClient()
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError || !authData?.user?.id) {
        throw new Error('Sesión expirada. Recargá la página.')
      }
      const userId = authData.user.id
      // Si el slug cambió, validar uniqueness contra otros rows del mismo user.
      let finalSlug = trimmedSlug
      if (trimmedSlug !== live.slug) {
        finalSlug = await ensureUniqueSlug(trimmedSlug, userId, {
          excludeId: live.id,
          client: sb,
        })
        if (finalSlug !== trimmedSlug) {
          toast.info('Slug ajustado', { description: `Existía conflicto. Quedó: ${finalSlug}` })
        }
      }
      const now = new Date().toISOString()
      updatePerson(live.id, {
        name: trimmedName,
        slug: finalSlug,
        updatedAt: now,
      })
      setEditing(false)
      toast.success('Persona actualizada')
      // Si el slug cambió, redirigir a la nueva URL para mantenerla limpia.
      if (finalSlug !== live.slug) {
        router.replace(`/relaciones/${finalSlug}`)
      }
    } catch (e) {
      toast.error('No se pudo guardar', {
        description: e instanceof Error ? e.message : 'Error inesperado.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <Link
        href="/relaciones"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Relaciones
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Users size={18} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{live.name}</h1>
            <div className="text-xs text-muted-foreground font-mono">
              /relaciones/<span className="text-foreground">{live.slug ?? '(sin slug)'}</span>
            </div>
          </div>
        </div>
      </header>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Identidad
            </div>
            {!editing && (
              <Button size="sm" variant="ghost" onClick={startEditing}>
                <Edit2 size={13} strokeWidth={1.75} className="mr-1.5" />
                Editar nombre + slug
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="person-name" className="text-xs">
                  Nombre completo
                </Label>
                <Input
                  id="person-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  disabled={saving}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="person-slug" className="text-xs">
                  Slug (URL)
                </Label>
                <Input
                  id="person-slug"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  disabled={saving}
                  className={cn(
                    'mt-1 font-mono',
                    !isValidSlug(slugInput) && slugInput && 'border-amber-500/40',
                  )}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Solo a-z, 0-9 y guiones. Aparece en la URL:
                  <span className="font-mono text-foreground/70 ml-1">
                    /relaciones/{slugInput || '<slug>'}
                  </span>
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                  <XIcon size={13} strokeWidth={1.75} className="mr-1" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Check size={13} strokeWidth={1.75} className="mr-1" />
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {live.alias && (
                <Row label="Alias" value={live.alias} />
              )}
              <Row label="Relación" value={RELATIONSHIP_LABEL[live.relationship]} />
              <Row label="Categoría" value={CATEGORY_LABEL[live.category]} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-6 space-y-2 text-sm">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-3">
            Métricas relacionales
          </div>
          <Row label="Importancia" value={`${live.importanceScore}/10`} />
          <Row label="Confianza" value={`${live.trustLevel}/10`} />
          <Row label="Impacto energético" value={live.energyImpact} />
          <Row label="Frecuencia contacto" value={live.contactFrequency || '—'} />
          {live.lastContact && <Row label="Último contacto" value={live.lastContact} />}
          {live.location && <Row label="Ubicación" value={live.location} />}
          {live.birthDate && <Row label="Fecha de nacimiento" value={live.birthDate} />}
        </CardContent>
      </Card>

      {/* ─── Sesion 3 PR-B: RelationalScore + BirthdayCountdown reales ── */}
      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <RelationalScore person={live} lastChat={lastChat} />
        <BirthdayCountdown birthDate={live.birthDate ?? null} />
      </div>

      {/* ─── Fechas importantes (#9): lista con countdown, añadibles ──── */}
      <FechasImportantes person={live} />

      {/* ─── Lunar + Ciclo: estado actual por persona ─────────────────── */}
      <div className="mb-4">
        <CicloPanel
          cycleStartDate={live.cycleStartDate ?? null}
          cycleLengthDays={live.cycleLengthDays ?? null}
        />
      </div>

      <div className="mb-4">
        {/* personLogs viene ordenado por loggedAt DESC desde la fetch layer,
            así que el primer kind='interaction' es el registro manual más
            reciente. El panel decide si gana este o lastChat (conversación
            real) por fecha. */}
        <LastInteractionPanel
          lastChat={lastChat}
          lastManualInteraction={personLogs.find((l) => l.kind === 'interaction') ?? null}
        />
      </div>

      {/* Sesion 6: registros per-persona (mood/energy/sleep/pain +
          tono de interaccion). Storage Supabase-native en person_logs
          (no relationships.history) — alimenta correlacion lunar/ciclo
          en Fase 3c. */}
      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <RegistroRapidoPanel personId={live.id} recentLogs={personLogs} />
        <RegistrarInteraccionPanel personId={live.id} recentLogs={personLogs} />
      </div>

      {/* Vida profesional (#6) + Vida social (#7): render determinístico
          de las observations linkedin / instagram curadas. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <VidaProfesional observations={curatedObservations} />
        <VidaSocial observations={curatedObservations} />
      </div>

      {/* Redes sociales conectadas (#11): contacto + links, editable inline. */}
      <RedesSociales person={live} observations={curatedObservations} />

      {/* "Lo personal" (#8): síntesis narrativa LLM, lazy + cacheada en
          person_synthesis. conversationCount = whatsapp_chat curadas. */}
      <LoPersonal
        personId={live.id}
        synthesis={synthesis}
        conversationCount={
          curatedObservations.filter((o) => o.captureType === 'whatsapp_chat').length
        }
      />

      {/* Datos curados visibles: confirma el contrato is_obsolete=false
          de la capa de fetch. Las filas LinkedIn alucinadas que dejamos
          obsoletas en PR #87 NO deberian aparecer aca. */}
      <CuratedObservationsPanel observations={curatedObservations} />

      {/* Memorias asociadas — server-fetched (PR-B Sesion 4) + boton de
          backfill idempotente desde relationships.history. */}
      <MemoriasAsociadasPanel memories={memories} personId={live.id} />

      {live.notes && (
        <Card className="shadow-none mb-4">
          <CardContent className="p-4 sm:p-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2">
              Notas
            </div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {live.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {live.tags && live.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {live.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <Separator className="my-6" />
      <p className="text-xs text-muted-foreground">
        Para editar el resto de los campos, volvé a{' '}
        <Link href="/relaciones" className="text-foreground underline underline-offset-2">
          /relaciones
        </Link>{' '}
        y usá el formulario existente.
      </p>
    </AppShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

/** Panel de "Datos curados" — muestra el conteo de observations
 *  is_obsolete=false agrupado por capture_type. PR-A lo usa para validar
 *  visualmente el contrato del filtro; PR-B+ va a transformar esto en
 *  paneles de Vida social / profesional / etc. */
function CuratedObservationsPanel({ observations }: { observations: Observation[] }) {
  const byType = observations.reduce<Record<string, number>>((acc, obs) => {
    acc[obs.captureType] = (acc[obs.captureType] ?? 0) + 1
    return acc
  }, {})
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1])

  return (
    <Card className="shadow-none mb-4 border-dashed">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Datos curados
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            is_obsolete=false
          </span>
        </div>

        {observations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Sin observaciones curadas para esta persona.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              <span className="text-2xl font-semibold tracking-tight">
                {observations.length}
              </span>{' '}
              <span className="text-muted-foreground">observación{observations.length === 1 ? '' : 'es'} curada{observations.length === 1 ? '' : 's'}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {types.map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-[10px] font-mono">
                  {type} · {count}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Las visualizaciones que consumen esta data (Vida social,
              Vida profesional, Bitácora) llegan en PR-B+.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
