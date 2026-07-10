'use client'
import { StakeholderDealImpact } from '@/components/relaciones/StakeholderDealImpact'
import { PersonLocationEvents } from '@/components/relaciones/PersonLocationEvents'
// SIR V2 — /relaciones/[slug] detail UI
//
// Render de la persona + EDICIÓN INLINE COMPLETA (#5): el formulario de
// la card "Identidad" edita el set completo de campos escalares/enum
// (nombre, slug, alias, relación, categoría, energía, confianza,
// importancia, frecuencia, último contacto, ubicación, cumpleaños, ciclo,
// tags, notas). Ya NO hace falta volver a /relaciones para editar.
//
// Campos con UI dedicada propia (no se duplican acá): redes/contacto
// (RedesSociales, #11) y fechas importantes (FechasImportantes, #9).
//
// Cuando el usuario cambia el slug, validamos formato y uniqueness vía
// ensureUniqueSlug. Al guardar exitosamente:
//   1. updatePerson (sync engine sincroniza al DB).
//   2. router.replace al nuevo slug si cambió — la URL refleja el slug nuevo.
//
// HIDRATACIÓN (fix React #418, refinado): varios paneles computan "ahora"
// (new Date()/Date.now()/Intl) en el render — countdowns, tiempos relativos,
// fase de ciclo, score relacional. El server corre en UTC y el cliente en
// Lima, así que ese HTML difería. En vez de gatear TODA la página (que
// causaba flash de skeleton), cada panel now-dependiente es mount-safe por
// su cuenta vía useMounted() (placeholder en server + primer render cliente,
// valor real tras montar). Así el contenido estático del detalle renderiza
// de inmediato sin flash. Componentes mount-safe: BirthdayCountdown,
// CicloPanel, FechasImportantes, LastInteractionPanel, RelationalScore,
// PersonLogsList, MemoriasAsociadasPanel, LoPersonal. Bitacora y
// PerfilProfesional ya eran safe (su fecha está tras un colapsable cerrado).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Edit2, Check, X as XIcon, MessageSquareHeart, Printer, History, Activity } from 'lucide-react'
import { SectionTitle } from '@/components/ui/section-title'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { PersonAvatar } from './PersonAvatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { useRelationshipStore } from '@/stores'
import { createClient } from '@/lib/supabase/client'
import { ensureUniqueSlug, generateSlug, isValidSlug } from '@/lib/people/slug'
import {
  RELATIONSHIP_TYPE_LABEL,
  PERSON_CATEGORY_LABEL,
  ENERGY_IMPACT_LABEL,
} from '@/lib/people/labels'
import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'
import { cn } from '@/lib/utils'
import { LastInteractionPanel } from './LastInteractionPanel'
import { AntesDeContactar } from './AntesDeContactar'
import { PendientesConPersona } from './PendientesConPersona'
import { EstadoConPersona } from './EstadoConPersona'
import { RecomendacionesSemanales } from './RecomendacionesSemanales'
import { SemanaConPersona } from './SemanaConPersona'
import { MencionadasPanel } from './MencionadasPanel'
import { ResumenPersona } from './ResumenPersona'
import { AccionDeHoy } from './AccionDeHoy'
import { AMBITO_LABEL, inferAmbito } from '@/lib/people/ambito'
import { fichaProfile } from '@/lib/people/fichaProfile'
import { BondEvolutionPanel } from './BondEvolutionPanel'
import { ConversationAnalyticsCard } from './ConversationAnalyticsCard'
import { isSystemNote } from '@/lib/memories/fromInteractionLog'
import { isContactInteraction } from '@/lib/person-logs/toneSignal'
import { FechasImportantes } from './FechasImportantes'
import { VidaProfesional } from './VidaProfesional'
import { VidaSocial } from './VidaSocial'
import { PerfilProfesional } from './PerfilProfesional'
import { RedesSociales } from './RedesSociales'
import { Bitacora } from './Bitacora'
import { RelationalFlagsCard } from './RelationalFlagsCard'
import { RelationalHealthCard } from './RelationalHealthCard'
import { RelationalEnergyCard } from './RelationalEnergyCard'
import { RelationalBidCard } from './RelationalBidCard'
import { AnotarAhora } from './AnotarAhora'
import { HistorialSearch } from './HistorialSearch'
import { NotesHistoryDropdown } from './NotesHistoryDropdown'
import type { PersonNoteHistoryEntry } from '@/lib/person-notes-history/fetch'
import { PersonActions } from './PersonActions'
import { LoPersonal } from './LoPersonal'
import { ReflexionesPanel } from './ReflexionesPanel'
import { DealsAsContactPanel } from './DealsAsContactPanel'
import { CicloPanel } from './CicloPanel'
import { CycleForecastStudio } from './CycleForecastStudio'
import { PersonalPlansPanel } from './PersonalPlansPanel'
import { CorrelacionPanel } from './CorrelacionPanel'
import { TrendChart } from '@/components/charts/TrendChart'
import { personLogToneSeries } from '@/lib/charts/adapters'
import { PersonDossier } from './PersonDossier'
import { ExportCsvButton } from '@/components/export/ExportCsvButton'
import { personLogsCsv } from '@/lib/export/adapters'
import { QUALIFYING_CAPTURE_TYPES } from '@/lib/memories/deriveFromObservations'
import { MemoriasAsociadasPanel } from './MemoriasAsociadasPanel'
import { RehearsalHistoryPanel } from '@/components/ensayo/RehearsalHistoryPanel'
import { WhatMattersChips } from './WhatMattersChips'
import { TensionesFortalezas } from './TensionesFortalezas'
import { ContradiceNotaCard } from './ContradiceNotaCard'
import { precomputeBehavior } from '@/lib/relaciones/precomputeBehavior'
import { RelationalProfileCard } from './RelationalProfileCard'
import { HypothesesExplorer } from './HypothesesExplorer'
import { BigFiveCard } from '@/components/profiling/BigFiveCard'
import { RegistrarInteraccionPanel } from './RegistrarInteraccionPanel'
import { NotaDeVozPanel } from './NotaDeVozPanel'
import { AgregarCapturaPanel } from './AgregarCapturaPanel'
import { MomentosPanel } from './MomentosPanel'
import { PersonMoneyPanel } from './PersonMoneyPanel'
import { ContactWindowBadge } from './ContactWindowBadge'
import { PreguntarSobrePersona } from './PreguntarSobrePersona'
import { CareBanner } from './CareBanner'
import { CADENCE_PRESETS, storedToPreset, presetToStored, parseCustomDays } from '@/lib/people/cadence'
import { IdentidadesPanel } from './IdentidadesPanel'
import { FamiliaPanel } from './FamiliaPanel'
import { ProfessionalLinksPanel } from './ProfessionalLinksPanel'
import { NetworkPathsCard } from './NetworkPathsCard'
import { InformacionSensible } from './InformacionSensible'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'
import type { PersonSynthesis } from '@/lib/person-synthesis/types'
import type { PersonProfileAxes } from '@/lib/person-axes/types'
import type { Memory, Person, RelationshipType, PersonCategory, EnergyImpact, PersonGender } from '@/types'

interface PersonDetailProps {
  initialPerson: Person
  /** Ultima observation con capture_type='whatsapp_chat' (ya curada
   *  is_obsolete=false). null si Diana no tiene chats registrados. */
  lastChat?: Observation | null
  /** Todas las observations curadas de la persona (is_obsolete=false),
   *  ordenadas por observed_at DESC. PR-A solo usa la longitud + breakdown
   *  para validar el filtro; PR-B+ consume el contenido. */
  curatedObservations?: Observation[]
  /** Memorias VISIBLES (NI descartadas NI privadas) materializadas en `memories`.
   *  Server-fetched, ordenadas por occurred_at DESC. Únicas que alimentan IA y
   *  "Antes de contactar". */
  memories?: Memory[]
  /** Memorias PRIVADAS/excluidas de la persona (server-fetched aparte). Sólo se
   *  muestran bajo el affordance de MemoriasAsociadasPanel; nunca a IA. */
  privateMemories?: Memory[]
  /** Logs de la persona (mood/energy/sleep/pain/interaction). Sesion 6.
   *  Server-fetched, ordenados por logged_at DESC. */
  personLogs?: PersonLog[]
  /** Set amplio de logs (≈2 años) para la vista de correlación (Fase 3c).
   *  Separado de personLogs (últimos 50). */
  correlationLogs?: PersonLog[]
  /** Síntesis narrativa vigente ("Lo personal", #8). Server-fetched de
   *  person_synthesis (is_current=true). null si nunca se generó. */
  synthesis?: PersonSynthesis | null
  /** Ejes narrativos persistidos profesional/social (person_profile_axes, 0047).
   *  null si no hay fila → los ejes caen al cómputo en vivo. */
  profileAxes?: PersonProfileAxes | null
  /** Historial de snapshots del campo `notes` (mig 0108). Opcional. Renderiza
   *  como entries "Nota editada" en la Bitácora. */
  notesHistory?: PersonNoteHistoryEntry[]
  /** Momentos / decisiones relacionales de la persona. Opcional: se renderizan
   *  como entries en la Bitácora (label = título, chip abierto/resuelto). */
  moments?: import('@/lib/moments/types').RelationshipMoment[]
  personCycles?: import('@/lib/person-cycles/types').PersonCycleEntry[]
  /** Movimientos de plata con fecha (person_money). Server-fetched. Se muestran
   *  en el hilo de la Bitácora (además de su panel editable en Registro). */
  money?: import('@/lib/money/types').MoneyEntry[]
}

// Etiquetas en español centralizadas en @/lib/people/labels. Se alían a los
// nombres locales para no tocar el resto del componente (display + Selects).
const RELATIONSHIP_LABEL = RELATIONSHIP_TYPE_LABEL
const CATEGORY_LABEL = PERSON_CATEGORY_LABEL
const ENERGY_LABEL = ENERGY_IMPACT_LABEL

/** Opciones sugeridas de estado civil (texto libre en DB; el form sugiere). */
const ESTADO_CIVIL_OPTIONS = [
  'Soltero/a',
  'En pareja',
  'Casado/a',
  'Divorciado/a',
  'Viudo/a',
  'Otro',
] as const

/** Estado del formulario de edición inline. Strings para inputs; las
 *  fechas son date-only (YYYY-MM-DD) tal cual las espera <input type=date>;
 *  tags es CSV (se parsea a string[] al guardar). */
interface EditForm {
  name: string
  slug: string
  alias: string
  relationship: RelationshipType
  category: PersonCategory
  energyImpact: EnergyImpact
  trustLevel: number
  importanceScore: number
  gender: '' | PersonGender
  contactFrequency: string
  lastContact: string
  location: string
  estadoCivil: string
  education: string
  title: string
  ambito: string
  organization: string
  orgGroup: string
  birthDate: string
  cycleStartDate: string
  cycleLengthDays: number
  tags: string
  notes: string
}

function formFromPerson(p: Person): EditForm {
  return {
    name: p.name,
    slug: p.slug ?? generateSlug(p.name),
    alias: p.alias ?? '',
    relationship: p.relationship,
    category: p.category,
    energyImpact: p.energyImpact,
    trustLevel: p.trustLevel,
    importanceScore: p.importanceScore,
    gender: p.gender ?? '',
    contactFrequency: p.contactFrequency ?? '',
    // date-only: tomamos el prefijo YYYY-MM-DD (lastContact puede venir como
    // ISO completo de fixtures viejos; el input date necesita solo la fecha).
    lastContact: (p.lastContact ?? '').slice(0, 10),
    location: p.location ?? '',
    estadoCivil: p.estadoCivil ?? '',
    education: p.education ?? '',
    title: p.title ?? '',
    ambito: p.ambito ?? inferAmbito(p.relationship),
    organization: p.organization ?? '',
    orgGroup: p.orgGroup ?? '',
    birthDate: (p.birthDate ?? '').slice(0, 10),
    cycleStartDate: (p.cycleStartDate ?? '').slice(0, 10),
    cycleLengthDays: p.cycleLengthDays ?? 28,
    tags: (p.tags ?? []).join(', '),
    notes: p.notes ?? '',
  }
}

type PersonTab = 'hoy' | 'conversacion' | 'perfil' | 'registro' | 'red'

const PERSON_TABS: { id: PersonTab; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'conversacion', label: 'Conversación' },
  { id: 'perfil', label: 'Perfil y memoria' },
  { id: 'registro', label: 'Registro' },
  { id: 'red', label: 'Red' },
]

export function PersonDetail({
  initialPerson,
  lastChat = null,
  curatedObservations = [],
  memories = [],
  privateMemories = [],
  personLogs = [],
  correlationLogs = [],
  synthesis = null,
  profileAxes = null,
  notesHistory = [],
  moments = [],
  personCycles = [],
  money = [],
}: PersonDetailProps) {
  const router = useRouter()
  const { people, updatePerson } = useRelationshipStore()

  // Si el local store tiene una version mas fresca (el sync engine la pullo),
  // usamos esa. Sino fallback al initialPerson del server.
  const live = people.find((p) => p.id === initialPerson.id) ?? initialPerson

  // Feature 3: tono de interacción (kind='interaction', 1-5) en el tiempo.
  const toneSeries = useMemo(
    () => personLogToneSeries(correlationLogs, 'interaction'),
    [correlationLogs],
  )

  // Ventana de contacto (#6): tono de la última interacción registrada.
  const lastInteractionTone = useMemo(() => {
    const ints = personLogs.filter((l) => l.kind === 'interaction' && !isSystemNote(l.note ?? ''))
    if (ints.length === 0) return null
    const latest = [...ints].sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1))[0]
    return typeof latest.value === 'number' ? latest.value : null
  }, [personLogs])

  // logged_at del último person_log kind='interaction' manual (reusado por el
  // vistazo y por el bloque Acción de hoy — misma fuente de "última vez").
  const lastManualInteractionAt = useMemo(
    () => personLogs.find((l) => l.kind === 'interaction' && !isSystemNote(l.note ?? ''))?.loggedAt ?? null,
    [personLogs],
  )
  // Último CONTACTO real (incluye llamadas contestadas) → recencia de la Fuerza.
  const lastContactAt = useMemo(
    () => personLogs.find((l) => l.kind === 'interaction' && isContactInteraction(l.note))?.loggedAt ?? null,
    [personLogs],
  )

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditForm>(() => formFromPerson(live))

  // Rediseño: tabs de la ficha. El vistazo (arriba) queda siempre visible; el
  // resto de los paneles se agrupan por tab (Hoy · Conversación · Perfil y
  // memoria · Registro · Red).
  const [tab, setTab] = useState<PersonTab>('hoy')

  // Ficha adaptativa por tipo de vínculo: el Cuidado (Horizonte del ciclo +
  // intimidad) es SOLO afectivo; lo comercial, solo colega/lead. Ver fichaProfile.
  const profile = fichaProfile(live)

  // Planes personales con la persona (agenda nativa) → refrescan el Horizonte del
  // ciclo al agregarse/borrarse (el card refetch por refreshKey).
  const [planRefresh, setPlanRefresh] = useState(0)

  function startEditing() {
    setForm(formFromPerson(live))
    setEditing(true)
  }

  // Editar desde el header: abre el form y salta al tab donde vive (Perfil).
  function startEditingFromHeader() {
    startEditing()
    setTab('perfil')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEditing() {
    setEditing(false)
  }

  function patch<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    const trimmedName = form.name.trim()
    const trimmedSlug = form.slug.trim()
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
      // Tags: input separado por comas -> array deduplicado sin vacíos.
      const tags = Array.from(
        new Set(form.tags.split(',').map((t) => t.trim()).filter(Boolean)),
      )
      updatePerson(live.id, {
        name: trimmedName,
        slug: finalSlug,
        alias: form.alias.trim() || undefined,
        relationship: form.relationship,
        category: form.category,
        energyImpact: form.energyImpact,
        trustLevel: form.trustLevel,
        importanceScore: form.importanceScore,
        contactFrequency: form.contactFrequency.trim(),
        lastContact: form.lastContact || undefined,
        location: form.location.trim() || undefined,
        estadoCivil: form.estadoCivil.trim() || undefined,
        education: form.education.trim() || undefined,
        title: form.title.trim() || undefined,
        ambito: (form.ambito || undefined) as import('@/types').PersonAmbito | undefined,
        organization: form.organization.trim() || undefined,
        orgGroup: form.orgGroup.trim() || undefined,
        gender: form.gender || undefined,
        birthDate: form.birthDate || undefined,
        cycleStartDate: form.gender === 'female' ? (form.cycleStartDate || undefined) : undefined,
        cycleLengthDays: form.gender === 'female' && form.cycleStartDate ? form.cycleLengthDays : undefined,
        tags,
        notes: form.notes,
        updatedAt: now,
      })
      // Al marcar MUJER (recién ahora), dispara el análisis conductual: su ficha
      // habilita el 2º horizonte y así no espera al abrirlo (item e). Fire-and-forget.
      if (form.gender === 'female' && live.gender !== 'female') precomputeBehavior(live.id)
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

  // Línea de tiempo → columna derecha sticky en desktop (Fase 2). Última
  // interacción + Bitácora completa. En mobile baja al final (lo monta el
  // AppShell). Se oculta al imprimir (el dossier imprime aparte).
  const timelineRail = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Línea de tiempo</span>
      </div>
      <LastInteractionPanel
        lastChat={lastChat}
        lastManualInteraction={personLogs.find((l) => l.kind === 'interaction' && !isSystemNote(l.note ?? '')) ?? null}
        personName={live.name}
      />
      <HistorialSearch personId={live.id} />
      <AnotarAhora personId={live.id} />
      <Bitacora personLogs={personLogs} observations={curatedObservations} notesHistory={notesHistory} moments={moments} money={money} />
      {/* 19·M3 — red flags de auto-protección sobre tus notas (foco en tu cuidado). */}
      <RelationalFlagsCard personName={live.name} personLogs={personLogs} />
    </div>
  )

  return (
    <AppShell rightRail={timelineRail}>
      {/* Contenido en pantalla. Se oculta al imprimir (print:hidden); el
          dossier imprimible vive aparte, al final de AppShell. */}
      <div className="print:hidden">
      <Link
        href="/relaciones"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Relaciones
      </Link>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <PersonAvatar personId={live.id} name={live.name} size="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate" title={live.name}>{live.name.split(' ')[0]}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="brand" className="text-[11px]">{CATEGORY_LABEL[live.category]}</Badge>
                <Badge variant="outline" className="text-[11px]">{RELATIONSHIP_LABEL[live.relationship]}</Badge>
              </div>
              {/* El slug/URL es plomería: sale del header (queda en la edición). */}
            </div>
          </div>
          {/* Botones top-right: Editar (salta a Perfil con el form) + Briefing
              IA + Chat WhatsApp. */}
          <div className="flex items-center gap-2 flex-wrap">
            {!editing && (
              <Button size="sm" variant="ghost" onClick={startEditingFromHeader}>
                <Edit2 size={13} strokeWidth={1.75} className="mr-1.5" />
                Editar
              </Button>
            )}
            <PersonActions
              personId={live.id}
              personName={live.name}
              phoneNumber={live.phoneNumber ?? null}
            />
          </div>
        </div>
      </header>

      {/* 7a: la ventana de contacto sube al hero como banner de CUIDADO (solo si
          hay algo — tema abierto/días sensibles o buen momento). Neutral = no se
          muestra. Reusa la misma lógica que el badge del pie. */}
      <CareBanner person={live} phoneNumber={live.phoneNumber ?? null} lastTone={lastInteractionTone} />

      {/* F2: INFORMACIÓN primero. La franja de resumen (síntesis: quién es +
          estado + score + próxima acción) lidera la ficha; recién después lo
          accionable de "Antes de contactar". */}
      <ResumenPersona
        person={live}
        lastChatObservedAt={lastChat?.observedAt ?? null}
        lastManualInteractionAt={lastManualInteractionAt}
        lastContactAt={lastContactAt}
      />

      {/* F2 (Tanda 2): la próxima acción, ascendida de texto pasivo a BLOQUE
          accionable con botón real. Entre el vistazo y los tabs. */}
      <AccionDeHoy
        person={live}
        phoneNumber={live.phoneNumber ?? null}
        lastChatObservedAt={lastChat?.observedAt ?? null}
        lastManualInteractionAt={lastManualInteractionAt}
        lastContactAt={lastContactAt}
      />

      {/* Q&A por persona: preguntá a SIR sobre esta persona, aterrizado en su
          contexto (reusa /api/sir/ask con personId). */}
      <PreguntarSobrePersona personId={live.id} personName={live.name} />

      {/* ─── Tabs de la ficha (rediseño). El vistazo de arriba queda siempre;
          el resto se agrupa por tab. ─────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Secciones de la ficha"
        className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        {PERSON_TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                // Activo marcado por PESO + borde inferior (no solo color), para
                // que se distinga sin depender de percibir el matiz.
                'shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors border-b-2',
                active
                  ? 'bg-secondary text-foreground font-semibold border-foreground'
                  : 'text-muted-foreground font-medium border-transparent hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'hoy' && (<>
      {/* Pendientes: open loops sin resolver con esta persona (una pelea, una
          promesa, un follow-up médico). Es lo más accionable de "Hoy", así que
          va primero — se auto-oculta si no hay nada, así que no empuja al resto
          en el caso común. Al resolver, soft-refetch de la ficha. */}
      <PendientesConPersona
        personId={live.id}
        moments={moments}
        onChange={() => router.refresh()}
      />

      {/* Estudio del ciclo: horizonte MOVIBLE (cursor arrastrable + "¿qué pasaría
          si…?") + briefing multi-evento navegable, con fecha compartida. Reemplaza
          el montaje suelto de briefing + horizonte. Solo afectivo con ciclo. */}
      {profile.showCycleForecast && (
        <CycleForecastStudio
          cycleStartDate={live.cycleStartDate ?? null}
          cycleLengthDays={live.cycleLengthDays ?? null}
          personCycles={personCycles}
          specialDates={live.specialDates ?? []}
          birthDate={live.birthDate ?? null}
          moments={moments}
          personLogs={personLogs}
          correlationLogs={correlationLogs}
          personId={live.id}
          personName={live.name}
          bond={profile.careBond}
          refreshKey={planRefresh}
          onPlanChange={() => setPlanRefresh((n) => n + 1)}
        />
      )}

      {/* Agenda personal CON esta persona (planes propios): alimenta la línea del
          ciclo. Toda mujer con datos (registro por vínculo). */}
      {profile.showCycleForecast && (
        <PersonalPlansPanel
          personId={live.id}
          personName={live.name}
          onChange={() => setPlanRefresh((n) => n + 1)}
        />
      )}

      {/* Pipeline como contacto (#3): deals donde esta persona es el decisor.
          Solo comercial (colega/lead) — para pareja/familia ni se monta. */}
      {profile.showCommercial && <DealsAsContactPanel person={{ id: live.id, name: live.name }} />}

      {/* ─── Card "Estado del vínculo" (consolidación, Opción 2 · fusión total):
          las señales de cómo está el vínculo y qué hacer viven en UNA card con
          secciones separadas por líneas, en vez de N cards sueltas (la
          sobre-fragmentación que marcó el review). Cada motor renderiza
          `embedded` (sin su Card propia) y conserva su lógica + auto-ocultado.
          EstadoConPersona ancla el grupo (siempre visible). ────────────────── */}
      <Card className="shadow-none mb-4">
        <div className="px-4 pt-4 sm:px-5">
          <SectionTitle icon={Activity} label="Estado del vínculo" />
        </div>
        <EstadoConPersona
          personId={live.id}
          personName={live.name}
          personLogs={personLogs}
          moments={moments}
          personCycles={personCycles}
          memories={memories}
          embedded
        />
        <RelationalHealthCard person={live} personLogs={personLogs} embedded />
        <RelationalEnergyCard person={live} embedded />
        <RelationalBidCard person={live} memories={memories} embedded />
        {/* Ventana de contacto: DEDUP con el CareBanner del hero — acá solo el
            caso neutral ("Cuando quieras"), que el banner omite. */}
        <ContactWindowBadge person={live} lastTone={lastInteractionTone} hideUnlessNeutral embedded />
      </Card>

      {/* Timeline de 7 días con esta persona (visual rápido). */}
      <SemanaConPersona personName={live.name} personLogs={personLogs} moments={moments} personCycles={personCycles} />

      {/* Recomendaciones semanales por Claude — cache por (user, persona, semana). */}
      <RecomendacionesSemanales personId={live.id} personName={live.name} />

      {/* "Antes de contactar": lo accionable que te deja listo para el momento
          justo — actividad reciente (tags de memorias) + notas privadas verbatim
          (discretas, nunca a IA). Determinístico; se oculta si no aporta nada. */}
      <AntesDeContactar personId={live.id} memories={memories} />

      {/* Dedup (Tanda 2): el score /100 (RelationalScore) y el cumpleaños
          (BirthdayCountdown) ya viven en el vistazo (banda compacta) y en
          <AccionDeHoy>. Acá dejamos solo StakeholderDealImpact (deals que
          suman al vínculo), que no se muestra en ningún otro lado. */}
      <div className="mb-4">
        <StakeholderDealImpact person={live} />
      </div>

      {/* Dedup ciclo (Tanda 2): el Horizonte del ciclo (arriba) es el módulo
          protagonista. CicloPanel (estado lunar + actual) queda como detalle
          COLAPSABLE, para no repetir el ciclo como segundo bloque prominente. */}
      {profile.showCycleForecast && live.cycleStartDate && (
        <details className="group mb-4 rounded-lg border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-[11px] uppercase tracking-[0.07em] text-text-tertiary flex items-center justify-between hover:text-foreground">
            Estado lunar y del ciclo (detalle)
            <span className="text-muted-foreground/60 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-1 pb-1">
            <CicloPanel
              cycleStartDate={live.cycleStartDate ?? null}
              cycleLengthDays={live.cycleLengthDays ?? null}
              personCycles={personCycles}
              isRomantic={live.relationship === 'romantic'}
            />
          </div>
        </details>
      )}

      </>)}

      {tab === 'registro' && (<>
      {/* Export / Dossier (Parte A + B): imprimir dossier + descargar CSV. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.print()}
        >
          <Printer size={13} strokeWidth={2} aria-hidden="true" />
          Exportar / Imprimir dossier
        </Button>
        <ExportCsvButton
          filenamePrefix={`registros_${live.slug ?? live.id}`}
          count={correlationLogs.length}
          buildCsv={() => personLogsCsv(correlationLogs)}
          label="Registros CSV"
        />
        {/* Export "Observaciones CSV" retirado (Tanda 4): dump crudo con olor a
            CRM que la auditoría marcó como ruido; el dossier + Registros CSV
            cubren la exportación. */}
      </div>

      {/* Captura en contexto: subir un pantallazo y asociarlo DIRECTO a esta
          persona, sin pasar por /captura ni re-seleccionar. Reusa el pipeline
          detect → process con person_id fijo. */}
      <AgregarCapturaPanel personId={live.id} personName={live.name} />

      {/* Registro RELACIONAL: tono de la última interacción con esta persona.
          (Ánimo/Energía/Sueño/Dolor se sacaron de la ficha: son métricas
          biológicas de self, viven en /yo — no tienen sentido "respecto a esta
          persona".) Storage Supabase-native en person_logs. */}
      <RegistrarInteraccionPanel personId={live.id} recentLogs={personLogs.filter((l) => !isSystemNote(l.note ?? ''))} />

      <MomentosPanel personId={live.id} />
      <PersonMoneyPanel personId={live.id} />
      <IdentidadesPanel personId={live.id} />

      {/* Nota de voz (#12): graba audio -> bucket person-voice-notes +
          observation voice_note (aparece tambien en la Bitacora). */}
      <NotaDeVozPanel personId={live.id} observations={curatedObservations} />

      {/* Redes & social (unificado): handles manuales editables + enriquecimiento
          de la captura de Instagram, en un solo bloque coherente. La captura se
          hace con el panel inline "Agregar captura" (arriba), no en /captura. */}
      <RedesSociales person={live} observations={curatedObservations} />

      </>)}

      {/* Identidad + Métricas viven en "Perfil y memoria" (Tanda 2): son quién
          ES la persona, no un registro/export. El botón Editar del header salta
          acá con el form abierto. */}
      {tab === 'perfil' && (<>
      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Identidad
            </div>
            {!editing && (
              <Button size="sm" variant="ghost" onClick={startEditing}>
                <Edit2 size={13} strokeWidth={1.75} className="mr-1.5" />
                Editar
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="person-name" className="text-xs">Nombre completo</Label>
                  <Input id="person-name" value={form.name} onChange={(e) => patch('name', e.target.value)} disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="person-alias" className="text-xs">Alias</Label>
                  <Input id="person-alias" value={form.alias} onChange={(e) => patch('alias', e.target.value)} disabled={saving} className="mt-1" placeholder="Apodo (opcional)" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="person-slug" className="text-xs">Slug (URL)</Label>
                  <Input
                    id="person-slug"
                    value={form.slug}
                    onChange={(e) => patch('slug', e.target.value)}
                    disabled={saving}
                    className={cn('mt-1 font-mono', !isValidSlug(form.slug) && form.slug && 'border-warn/40')}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Solo a-z, 0-9 y guiones. URL:
                    <span className="font-mono text-foreground/70 ml-1">/relaciones/{form.slug || '<slug>'}</span>
                  </p>
                </div>
                <div>
                  <Label htmlFor="person-relationship" className="text-xs">Tipo de relación</Label>
                  <Select value={form.relationship} onValueChange={(v) => patch('relationship', v as RelationshipType)} disabled={saving}>
                    <SelectTrigger id="person-relationship" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RELATIONSHIP_LABEL) as RelationshipType[]).map((k) => (
                        <SelectItem key={k} value={k}>{RELATIONSHIP_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="person-category" className="text-xs">Categoría</Label>
                  <Select value={form.category} onValueChange={(v) => patch('category', v as PersonCategory)} disabled={saving}>
                    <SelectTrigger id="person-category" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORY_LABEL) as PersonCategory[]).map((k) => (
                        <SelectItem key={k} value={k}>{CATEGORY_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="person-energy" className="text-xs">Impacto energético</Label>
                  <Select value={form.energyImpact} onValueChange={(v) => patch('energyImpact', v as EnergyImpact)} disabled={saving}>
                    <SelectTrigger id="person-energy" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ENERGY_LABEL) as EnergyImpact[]).map((k) => (
                        <SelectItem key={k} value={k}>{ENERGY_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="person-cadence" className="text-xs">Cadencia de contacto</Label>
                  {(() => {
                    const sel = storedToPreset(form.contactFrequency)
                    const customN = sel === 'custom' ? (parseCustomDays(form.contactFrequency) ?? 21) : 21
                    return (
                      <div className="mt-1 flex gap-2">
                        <Select
                          value={sel}
                          onValueChange={(v) => patch('contactFrequency', presetToStored(v as ReturnType<typeof storedToPreset>, customN))}
                          disabled={saving}
                        >
                          <SelectTrigger id="person-cadence" className="flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CADENCE_PRESETS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {sel === 'custom' && (
                          <Input
                            type="number" min={1} max={365} value={customN}
                            onChange={(e) => patch('contactFrequency', presetToStored('custom', Number(e.target.value) || 1))}
                            disabled={saving} className="w-20 font-mono" aria-label="Cada cuántos días"
                          />
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <Label htmlFor="person-trust" className="text-xs">Confianza: <span className="font-mono text-foreground">{form.trustLevel}/10</span></Label>
                  <Input id="person-trust" type="range" min={1} max={10} value={form.trustLevel} onChange={(e) => patch('trustLevel', Number(e.target.value))} disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="person-importance" className="text-xs">Importancia: <span className="font-mono text-foreground">{form.importanceScore}/10</span></Label>
                  <Input id="person-importance" type="range" min={1} max={10} value={form.importanceScore} onChange={(e) => patch('importanceScore', Number(e.target.value))} disabled={saving} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="person-lastcontact" className="text-xs">Último contacto</Label>
                  <Input id="person-lastcontact" type="date" value={form.lastContact} onChange={(e) => patch('lastContact', e.target.value)} disabled={saving} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label htmlFor="person-location" className="text-xs">Ubicación</Label>
                  <Input id="person-location" value={form.location} onChange={(e) => patch('location', e.target.value)} disabled={saving} className="mt-1" placeholder="Distrito, ciudad — ej. Barranco, Lima" />
                </div>
                <div>
                  <Label htmlFor="person-estadocivil" className="text-xs">Estado civil</Label>
                  <Select value={form.estadoCivil} onValueChange={(v) => patch('estadoCivil', v)} disabled={saving}>
                    <SelectTrigger id="person-estadocivil" className="mt-1"><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                    <SelectContent>
                      {ESTADO_CIVIL_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="person-education" className="text-xs">Educación / grado de instrucción</Label>
                  <Input id="person-education" value={form.education} onChange={(e) => patch('education', e.target.value)} disabled={saving} className="mt-1" placeholder="ej. Universitario · Ing. Industrial (UNI)" />
                </div>
                <div>
                  <Label htmlFor="person-ambito" className="text-xs">Ámbito (qué es para vos)</Label>
                  <Select value={form.ambito || 'personal'} onValueChange={(v) => patch('ambito', v)} disabled={saving}>
                    <SelectTrigger id="person-ambito" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['personal', 'colega', 'lead'] as const).map((a) => <SelectItem key={a} value={a}>{AMBITO_LABEL[a]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="person-title" className="text-xs">Cargo / rol</Label>
                  <Input id="person-title" value={form.title} onChange={(e) => patch('title', e.target.value)} disabled={saving} className="mt-1" placeholder="ej. Jefe de Seguridad Patrimonial" />
                </div>
                <div>
                  <Label htmlFor="person-organization" className="text-xs">Empresa / empleador</Label>
                  <Input id="person-organization" value={form.organization} onChange={(e) => patch('organization', e.target.value)} disabled={saving} className="mt-1" placeholder="ej. K2 Seguridad y Resguardo" />
                </div>
                <div>
                  <Label htmlFor="person-orggroup" className="text-xs">Grupo / holding</Label>
                  <Input id="person-orggroup" value={form.orgGroup} onChange={(e) => patch('orgGroup', e.target.value)} disabled={saving} className="mt-1" placeholder="ej. Grupo HNG — conecta a las personas del mismo grupo" />
                </div>
                <div>
                  <Label htmlFor="person-gender" className="text-xs">Sexo</Label>
                  <Select value={form.gender || 'unspecified'} onValueChange={(v) => patch('gender', v === 'unspecified' ? '' : (v as PersonGender))} disabled={saving}>
                    <SelectTrigger id="person-gender" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unspecified">Sin especificar</SelectItem>
                      <SelectItem value="female">Mujer</SelectItem>
                      <SelectItem value="male">Hombre</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="person-birth" className="text-xs">Fecha de nacimiento</Label>
                  <Input id="person-birth" type="date" value={form.birthDate} onChange={(e) => patch('birthDate', e.target.value)} disabled={saving} className="mt-1 font-mono" />
                </div>
                {(form.gender === 'female' || !!form.cycleStartDate) && (<>
                <div>
                  <Label htmlFor="person-cyclestart" className="text-xs">Inicio último período</Label>
                  <Input id="person-cyclestart" type="date" value={form.cycleStartDate} onChange={(e) => patch('cycleStartDate', e.target.value)} disabled={saving} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label htmlFor="person-cyclelen" className="text-xs">Largo del ciclo (días)</Label>
                  <Input id="person-cyclelen" type="number" min={15} max={60} value={form.cycleLengthDays} onChange={(e) => patch('cycleLengthDays', Number(e.target.value) || 28)} disabled={saving || !form.cycleStartDate} className="mt-1 font-mono" />
                </div>
                </>)}
                <div className="sm:col-span-2">
                  <Label htmlFor="person-tags" className="text-xs">Tags / etiquetas</Label>
                  <Input id="person-tags" value={form.tags} onChange={(e) => patch('tags', e.target.value)} disabled={saving} className="mt-1" placeholder="separados por coma: familia, trabajo, …" />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="person-notes" className="text-xs">Notas</Label>
                    <NotesHistoryDropdown
                      history={notesHistory}
                      onRestore={(snapshot) => patch('notes', snapshot)}
                      disabled={saving}
                    />
                  </div>
                  <textarea
                    id="person-notes"
                    value={form.notes}
                    onChange={(e) => patch('notes', e.target.value)}
                    disabled={saving}
                    rows={4}
                    className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Notas libres sobre la persona…"
                  />
                </div>
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

      {/* Métricas read-only: ocultas durante la edición (el form de arriba
          ya cubre estos campos). */}
      {!editing && (
        <Card className="shadow-none mb-4">
          <CardContent className="p-4 sm:p-6 space-y-2 text-sm">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-3">
              Datos de la persona
            </div>
            <Row label="Qué es para vos" value={AMBITO_LABEL[live.ambito ?? inferAmbito(live.relationship)]} />
            <Row label="Importancia" value={`${live.importanceScore}/10`} />
            <Row label="Confianza" value={`${live.trustLevel}/10`} />
            <Row label="Impacto energético" value={ENERGY_LABEL[live.energyImpact] ?? live.energyImpact} />
            <Row label="Frecuencia contacto" value={live.contactFrequency || '—'} />
            {live.gender && <Row label="Sexo" value={live.gender === 'female' ? 'Mujer' : live.gender === 'male' ? 'Hombre' : 'Otro'} />}
            {live.orgGroup && <Row label="Grupo" value={live.orgGroup} />}
            {live.lastContact && <Row label="Último contacto" value={live.lastContact.slice(0, 10)} />}
            {live.location && <Row label="Ubicación" value={live.location} />}
            {live.estadoCivil && <Row label="Estado civil" value={live.estadoCivil} />}
            {live.birthDate && <Row label="Fecha de nacimiento" value={live.birthDate.slice(0, 10)} />}
            {/* 18·M4 — eventos por ubicación (opt-in, on-demand, confianza baja) */}
            {live.location && <PersonLocationEvents location={live.location} personName={live.name} />}
          </CardContent>
        </Card>
      )}

      {/* ─── Fechas importantes (#9): lista con countdown, añadibles ──── */}
      <FechasImportantes person={live} />

      {/* Personas mencionadas (F1): es una TAREA derivada de las fechas →
          vive acá, junto a ellas, y colapsada por defecto (no domina la ficha). */}
      <MencionadasPanel personId={live.id} personName={live.name} specialDates={live.specialDates} />

      {/* Vida profesional (#6): educación (campo people, 0024) + resumen
          determinístico de la captura LinkedIn. */}
      <VidaProfesional person={live} observations={curatedObservations} axes={profileAxes} />

      {/* Perfil profesional completo (#10): colapsable, detalle LinkedIn. */}
      <PerfilProfesional person={live} observations={curatedObservations} />

      {/* Vida social (#7): tercer eje narrativo — identidad social, alcance y
          seguidores en común desde la captura de Instagram. */}
      <VidaSocial observations={curatedObservations} axes={profileAxes} />

      {/* "Lo personal" (#8): síntesis narrativa LLM, lazy + cacheada en
          person_synthesis. conversationCount = whatsapp_chat curadas. */}
      <LoPersonal
        personId={live.id}
        synthesis={synthesis}
        conversationCount={
          curatedObservations.filter((o) =>
            CONVERSATION_CAPTURE_TYPES.includes(o.captureType),
          ).length
        }
      />


      {/* 15·8 — qué le importa: temas recurrentes de sus memorias (client-side). */}
      <WhatMattersChips memories={memories} tags={live.tags ?? []} name={live.name} />

      {/* Preguntas para reflexionar: rescate del dato huérfano
          observation.data.reflectionQuestions (WhatsApp Nivel C). Se oculta si no hay. */}
      <ReflexionesPanel observations={curatedObservations} />

      {/* Tensiones y fortalezas: notas relacionales que Aaron carga a mano
          (fricción / fortalezas / metas en común). people.relational_notes (0132). */}
      <TensionesFortalezas person={live} />

      {/* Flag "⚠ contradice una nota": cruza las notas manuales contra el hilo
          real del sustrato (chat_messages 0141) y marca contradicciones. On-demand,
          efímero, NUNCA pisa la nota. */}
      <ContradiceNotaCard personId={live.id} personName={live.name} />

      {/* 19·M1 — perfil relacional (cómo vincularte), on-demand + cache diaria. */}
      <RelationalProfileCard personId={live.id} personName={live.name} />

      {/* 19·M4 — test consentido Big Five: lo responde ESA persona (instrumento válido). */}
      <BigFiveCard subject={live.id} title={`Big Five de ${live.name.split(' ')[0]}`} whoAnswers={`Que responda ${live.name.split(' ')[0]}`} />

      {/* 19·M2 — explorar hipótesis (colapsado, sensible): hipótesis que compiten. */}
      <HypothesesExplorer personId={live.id} personName={live.name} />

      {/* Memorias asociadas — server-fetched (PR-B Sesion 4) + boton de
          backfill idempotente desde relationships.history. */}
      <MemoriasAsociadasPanel
        memories={memories}
        privateMemories={privateMemories}
        personId={live.id}
        derivableCount={
          curatedObservations.filter((o) =>
            QUALIFYING_CAPTURE_TYPES.includes(o.captureType),
          ).length
        }
      />

      {/* Ensayos anteriores CON esta persona (se auto-oculta si no hay). */}
      <RehearsalHistoryPanel personId={live.id} />

      {live.notes && (
        <Card className="shadow-none mb-4">
          <CardContent className="p-4 sm:p-6">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">
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

      {/* Información sensible / datos adicionales (DNI, pasaporte, foto):
          colapsable, al fondo, marcado como sensible. Container — los valores
          los carga el usuario. NO se usa en IA/grafo/summaries. */}
      <InformacionSensible personId={live.id} />

      <Separator className="my-6" />
      <p className="text-xs text-muted-foreground">
        Para editar el resto de los campos, volvé a{' '}
        <Link href="/relaciones" className="text-foreground underline underline-offset-2">
          /relaciones
        </Link>{' '}
        y usá el formulario existente.
      </p>

      </>)}

      {tab === 'conversacion' && (<>
      <div className="mb-4">
        <BondEvolutionPanel personId={live.id} />
      </div>
      <div className="mb-4">
        <ConversationAnalyticsCard personId={live.id} personName={live.name} />
      </div>

      {/* Correlación longitudinal (Fase 3c): person_logs × fase lunar ×
          fase del ciclo. Determinístico; narrativa IA opcional detrás de
          botón. Empty state honesto si falta data. */}
      <div className="mb-4">
        <CorrelacionPanel
          personId={live.id}
          personLogs={correlationLogs}
          cycleStartDate={live.cycleStartDate ?? null}
          cycleLengthDays={live.cycleLengthDays ?? null}
          personCycles={personCycles}
        />
      </div>

      {/* Feature 3: evolución del tono de interacción con esta persona. */}
      <div className="mb-4">
        <TrendChart
          label="Tono de interacción"
          icon={MessageSquareHeart}
          points={toneSeries}
          colorClass="text-brand"
          formatValue={(n) => n.toFixed(1)}
          emptyHint="Registrá interacciones (arriba) para ver cómo evoluciona el tono."
        />
      </div>

      </>)}

      {tab === 'red' && (<>
      {/* Familia (A.4): vincular padre/madre/etc. como nodos de familia en el
          grafo (person_links, 0035). Crea el nodo-persona mínimo + la arista. */}
      <FamiliaPanel person={live} />

      {/* Vínculos profesionales/sociales (0128): quién conoce a quién por trabajo
          o socialmente. Abre el grafo person↔person para 15·7 (red). */}
      <ProfessionalLinksPanel person={live} />

      {/* 15·7 — caminos: mutuos que conectan con esta persona (puente para intro). */}
      <NetworkPathsCard person={live} />
      {/* Los tres ejes narrativos (profesional/social/personal) viven en la tab
          "Perfil y memoria" (VidaProfesional/VidaSocial/LoPersonal), no acá. */}

      </>)}

      </div>

      {/* Dossier imprimible (Parte A): oculto en pantalla, visible al imprimir.
          Consolida lo clave de la persona en layout limpio para papel/PDF. */}
      <PersonDossier
        person={live}
        synthesis={synthesis}
        personLogs={correlationLogs}
        observations={curatedObservations}
      />
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

