'use client'
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
import { ArrowLeft, Edit2, Check, X as XIcon, MessageSquareHeart, Printer, History } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { useRelationshipStore } from '@/stores'
import { createClient } from '@/lib/supabase/client'
import { ensureUniqueSlug, generateSlug, isValidSlug } from '@/lib/people/slug'
import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'
import { cn } from '@/lib/utils'
import { LastInteractionPanel } from './LastInteractionPanel'
import { RelationalScore } from './RelationalScore'
import { BirthdayCountdown } from './BirthdayCountdown'
import { FechasImportantes } from './FechasImportantes'
import { VidaProfesional } from './VidaProfesional'
import { PerfilProfesional } from './PerfilProfesional'
import { RedesSociales } from './RedesSociales'
import { Bitacora } from './Bitacora'
import { PersonActions } from './PersonActions'
import { LoPersonal } from './LoPersonal'
import { CicloPanel } from './CicloPanel'
import { CorrelacionPanel } from './CorrelacionPanel'
import { TrendChart } from '@/components/charts/TrendChart'
import { personLogToneSeries } from '@/lib/charts/adapters'
import { PersonDossier } from './PersonDossier'
import { ExportCsvButton } from '@/components/export/ExportCsvButton'
import { personLogsCsv, observationsCsv } from '@/lib/export/adapters'
import { QUALIFYING_CAPTURE_TYPES } from '@/lib/memories/deriveFromObservations'
import { MemoriasAsociadasPanel } from './MemoriasAsociadasPanel'
import { RegistrarInteraccionPanel } from './RegistrarInteraccionPanel'
import { NotaDeVozPanel } from './NotaDeVozPanel'
import { AgregarCapturaPanel } from './AgregarCapturaPanel'
import { FamiliaPanel } from './FamiliaPanel'
import { InformacionSensible } from './InformacionSensible'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'
import type { PersonSynthesis } from '@/lib/person-synthesis/types'
import type { Memory, Person, RelationshipType, PersonCategory, EnergyImpact } from '@/types'

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
  /** Set amplio de logs (≈2 años) para la vista de correlación (Fase 3c).
   *  Separado de personLogs (últimos 50). */
  correlationLogs?: PersonLog[]
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

const ENERGY_LABEL: Record<EnergyImpact, string> = {
  energizing: 'Energizante',
  neutral: 'Neutral',
  draining: 'Drenante',
}

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
  contactFrequency: string
  lastContact: string
  location: string
  estadoCivil: string
  education: string
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
    contactFrequency: p.contactFrequency ?? '',
    // date-only: tomamos el prefijo YYYY-MM-DD (lastContact puede venir como
    // ISO completo de fixtures viejos; el input date necesita solo la fecha).
    lastContact: (p.lastContact ?? '').slice(0, 10),
    location: p.location ?? '',
    estadoCivil: p.estadoCivil ?? '',
    education: p.education ?? '',
    birthDate: (p.birthDate ?? '').slice(0, 10),
    cycleStartDate: (p.cycleStartDate ?? '').slice(0, 10),
    cycleLengthDays: p.cycleLengthDays ?? 28,
    tags: (p.tags ?? []).join(', '),
    notes: p.notes ?? '',
  }
}

export function PersonDetail({
  initialPerson,
  lastChat = null,
  curatedObservations = [],
  memories = [],
  personLogs = [],
  correlationLogs = [],
  synthesis = null,
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

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditForm>(() => formFromPerson(live))

  function startEditing() {
    setForm(formFromPerson(live))
    setEditing(true)
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
        birthDate: form.birthDate || undefined,
        cycleStartDate: form.cycleStartDate || undefined,
        cycleLengthDays: form.cycleStartDate ? form.cycleLengthDays : undefined,
        tags,
        notes: form.notes,
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
        lastManualInteraction={personLogs.find((l) => l.kind === 'interaction') ?? null}
      />
      <Bitacora personLogs={personLogs} observations={curatedObservations} />
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
            <Avatar name={live.name} size="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate">{live.name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="brand" className="text-[11px]">{CATEGORY_LABEL[live.category]}</Badge>
                <Badge variant="outline" className="text-[11px]">{RELATIONSHIP_LABEL[live.relationship]}</Badge>
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate mt-1.5">
                /relaciones/<span className="text-foreground">{live.slug ?? '(sin slug)'}</span>
              </div>
            </div>
          </div>
          {/* Botones top-right (#16): Briefing IA + Chat WhatsApp. */}
          <PersonActions
            personId={live.id}
            personName={live.name}
            phoneNumber={live.phoneNumber ?? null}
          />
        </div>
      </header>

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
        <ExportCsvButton
          filenamePrefix={`observaciones_${live.slug ?? live.id}`}
          count={curatedObservations.length}
          buildCsv={() => observationsCsv(curatedObservations)}
          label="Observaciones CSV"
        />
      </div>

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
                  <Label className="text-xs">Tipo de relación</Label>
                  <Select value={form.relationship} onValueChange={(v) => patch('relationship', v as RelationshipType)} disabled={saving}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RELATIONSHIP_LABEL) as RelationshipType[]).map((k) => (
                        <SelectItem key={k} value={k}>{RELATIONSHIP_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Categoría</Label>
                  <Select value={form.category} onValueChange={(v) => patch('category', v as PersonCategory)} disabled={saving}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORY_LABEL) as PersonCategory[]).map((k) => (
                        <SelectItem key={k} value={k}>{CATEGORY_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Impacto energético</Label>
                  <Select value={form.energyImpact} onValueChange={(v) => patch('energyImpact', v as EnergyImpact)} disabled={saving}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ENERGY_LABEL) as EnergyImpact[]).map((k) => (
                        <SelectItem key={k} value={k}>{ENERGY_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="person-freq" className="text-xs">Frecuencia de contacto</Label>
                  <Input id="person-freq" value={form.contactFrequency} onChange={(e) => patch('contactFrequency', e.target.value)} disabled={saving} className="mt-1" placeholder="Ej: semanal, mensual" />
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
                  <Label htmlFor="person-birth" className="text-xs">Fecha de nacimiento</Label>
                  <Input id="person-birth" type="date" value={form.birthDate} onChange={(e) => patch('birthDate', e.target.value)} disabled={saving} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label htmlFor="person-cyclestart" className="text-xs">Inicio último período</Label>
                  <Input id="person-cyclestart" type="date" value={form.cycleStartDate} onChange={(e) => patch('cycleStartDate', e.target.value)} disabled={saving} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label htmlFor="person-cyclelen" className="text-xs">Largo del ciclo (días)</Label>
                  <Input id="person-cyclelen" type="number" min={15} max={60} value={form.cycleLengthDays} onChange={(e) => patch('cycleLengthDays', Number(e.target.value) || 28)} disabled={saving || !form.cycleStartDate} className="mt-1 font-mono" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="person-tags" className="text-xs">Tags / etiquetas</Label>
                  <Input id="person-tags" value={form.tags} onChange={(e) => patch('tags', e.target.value)} disabled={saving} className="mt-1" placeholder="separados por coma: familia, trabajo, …" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="person-notes" className="text-xs">Notas</Label>
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
              Métricas relacionales
            </div>
            <Row label="Importancia" value={`${live.importanceScore}/10`} />
            <Row label="Confianza" value={`${live.trustLevel}/10`} />
            <Row label="Impacto energético" value={ENERGY_LABEL[live.energyImpact] ?? live.energyImpact} />
            <Row label="Frecuencia contacto" value={live.contactFrequency || '—'} />
            {live.lastContact && <Row label="Último contacto" value={live.lastContact.slice(0, 10)} />}
            {live.location && <Row label="Ubicación" value={live.location} />}
            {live.estadoCivil && <Row label="Estado civil" value={live.estadoCivil} />}
            {live.birthDate && <Row label="Fecha de nacimiento" value={live.birthDate.slice(0, 10)} />}
          </CardContent>
        </Card>
      )}

      {/* ─── Sesion 3 PR-B: RelationalScore + BirthdayCountdown reales ── */}
      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <RelationalScore person={live} lastChat={lastChat} />
        <BirthdayCountdown person={live} />
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

      {/* Correlación longitudinal (Fase 3c): person_logs × fase lunar ×
          fase del ciclo. Determinístico; narrativa IA opcional detrás de
          botón. Empty state honesto si falta data. */}
      <div className="mb-4">
        <CorrelacionPanel
          personId={live.id}
          personLogs={correlationLogs}
          cycleStartDate={live.cycleStartDate ?? null}
          cycleLengthDays={live.cycleLengthDays ?? null}
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

      {/* Captura en contexto: subir un pantallazo y asociarlo DIRECTO a esta
          persona, sin pasar por /captura ni re-seleccionar. Reusa el pipeline
          detect → process con person_id fijo. */}
      <AgregarCapturaPanel personId={live.id} personName={live.name} />

      {/* Registro RELACIONAL: tono de la última interacción con esta persona.
          (Ánimo/Energía/Sueño/Dolor se sacaron de la ficha: son métricas
          biológicas de self, viven en /yo — no tienen sentido "respecto a esta
          persona".) Storage Supabase-native en person_logs. */}
      <RegistrarInteraccionPanel personId={live.id} recentLogs={personLogs} />

      {/* Nota de voz (#12): graba audio -> bucket person-voice-notes +
          observation voice_note (aparece tambien en la Bitacora). */}
      <NotaDeVozPanel personId={live.id} observations={curatedObservations} />

      {/* Redes & social (unificado): handles manuales editables + enriquecimiento
          de la captura de Instagram, en un solo bloque coherente. La captura se
          hace con el panel inline "Agregar captura" (arriba), no en /captura. */}
      <RedesSociales person={live} observations={curatedObservations} />

      {/* Familia (A.4): vincular padre/madre/etc. como nodos de familia en el
          grafo (person_links, 0035). Crea el nodo-persona mínimo + la arista. */}
      <FamiliaPanel person={live} />

      {/* Vida profesional (#6): educación (campo people, 0024) + resumen
          determinístico de la captura LinkedIn. */}
      <VidaProfesional person={live} observations={curatedObservations} />

      {/* Perfil profesional completo (#10): colapsable, detalle LinkedIn. */}
      <PerfilProfesional person={live} observations={curatedObservations} />

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

      {/* Datos curados visibles: confirma el contrato is_obsolete=false
          de la capa de fetch. Las filas LinkedIn alucinadas que dejamos
          obsoletas en PR #87 NO deberian aparecer aca. */}
      <CuratedObservationsPanel observations={curatedObservations} />

      {/* Memorias asociadas — server-fetched (PR-B Sesion 4) + boton de
          backfill idempotente desde relationships.history. */}
      <MemoriasAsociadasPanel
        memories={memories}
        personId={live.id}
        derivableCount={
          curatedObservations.filter((o) =>
            QUALIFYING_CAPTURE_TYPES.includes(o.captureType),
          ).length
        }
      />

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
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
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
