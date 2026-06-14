'use client'

import { useState } from 'react'
import { track, EVENTS } from '@/lib/analytics/track'
import { toast } from 'sonner'
import Link from 'next/link'
import { Users, UserPlus, AlertCircle, Edit, X, ArrowRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { Avatar } from '@/components/ui/avatar'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useRelationshipStore, useMemoryStore } from '@/stores'
import { detectRelationshipAlerts } from '@/engines/relationship'
import { createPersonAddedMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { DailyActionsPanel } from '@/components/horario/DailyActionsPanel'
import { PosiblesDuplicados } from '@/components/relaciones/PosiblesDuplicados'
import { createClient } from '@/lib/supabase/client'
import { generateSlug, ensureUniqueSlug } from '@/lib/people/slug'
import {
  relationshipTypeLabel,
  personCategoryLabel,
  energyImpactLabel,
  alertUrgencyLabel,
} from '@/lib/people/labels'
import { cn } from '@/lib/utils'
import type { Person, RelationshipType, PersonCategory, EnergyImpact, PersonGender } from '@/types'

interface PersonForm {
  name: string
  alias: string
  relationship: RelationshipType
  category: PersonCategory
  gender: '' | PersonGender
  importanceScore: number
  energyImpact: EnergyImpact
  trustLevel: number
  lastContact: string
  contactFrequency: string
  location: string
  notes: string
  birthDate: string
  cycleStartDate: string
  cycleLengthDays: number
}

const EMPTY_FORM: PersonForm = {
  name: '', alias: '', relationship: 'friend', category: 'network', gender: '',
  importanceScore: 5, energyImpact: 'neutral', trustLevel: 5,
  lastContact: '', contactFrequency: '', location: '', notes: '',
  birthDate: '',
  cycleStartDate: '', cycleLengthDays: 28,
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

const cardClass = 'transition-colors duration-200 hover:border-border-strong'

const ENERGY_CLASS: Record<EnergyImpact, string> = {
  energizing: 'border-ok/30 bg-ok-soft text-ok-foreground',
  neutral: 'border-border bg-muted text-muted-foreground',
  draining: 'border-bad/30 bg-bad-soft text-bad-foreground',
}

const URGENCY_CLASS: Record<'immediate' | 'soon' | 'monitor', string> = {
  immediate: 'border-bad/30 bg-bad-soft text-bad-foreground',
  soon: 'border-warn/30 bg-warn-soft text-warn-foreground',
  monitor: 'border-brand/30 bg-brand-soft text-brand-soft-foreground',
}

export default function RelationshipsPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return <RelationshipsContent />
}

function RelationshipsContent() {
  const { people, relationships, addPerson, updatePerson, removePerson } = useRelationshipStore()
  const { addMemory } = useMemoryStore()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM)

  const alerts = detectRelationshipAlerts(people, relationships)

  // Distinct locations del store → datalist de autocomplete en el form.
  const locationSuggestions = Array.from(
    new Set(people.map((p) => p.location).filter((l): l is string => !!l && l.trim().length > 0)),
  ).sort((a, b) => a.localeCompare(b))

  function openAdd() {
    // Defaults computados al click — NO en EMPTY_FORM (que queda stale si
    // se importa al mount del componente, y porque "hoy" cambia).
    const today = new Date().toISOString().slice(0, 10)
    setEditingId(null)
    setForm({ ...EMPTY_FORM, lastContact: today, location: 'Lima' })
    setShowForm(true)
  }

  function openEdit(person: Person) {
    setEditingId(person.id)
    setForm({
      name: person.name,
      alias: person.alias ?? '',
      relationship: person.relationship,
      category: person.category,
      gender: person.gender ?? '',
      importanceScore: person.importanceScore,
      energyImpact: person.energyImpact,
      trustLevel: person.trustLevel,
      lastContact: person.lastContact ?? '',
      contactFrequency: person.contactFrequency,
      location: person.location ?? '',
      notes: person.notes,
      birthDate: person.birthDate ?? '',
      cycleStartDate: person.cycleStartDate ?? '',
      cycleLengthDays: person.cycleLengthDays ?? 28,
    })
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM)
  }

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error('Nombre requerido', { description: 'Ingresa al menos un nombre.' }); return }
    const now = new Date().toISOString()
    if (editingId) {
      const patch: Partial<Person> = {
        name: form.name.trim(),
        alias: form.alias.trim() || undefined,
        relationship: form.relationship,
        category: form.category,
        gender: form.gender || undefined,
        importanceScore: form.importanceScore,
        energyImpact: form.energyImpact,
        trustLevel: form.trustLevel,
        lastContact: form.lastContact || undefined,
        contactFrequency: form.contactFrequency,
        location: form.location.trim() || undefined,
        notes: form.notes,
        birthDate: form.birthDate || undefined,
        cycleStartDate: form.gender === 'female' ? (form.cycleStartDate || undefined) : undefined,
        cycleLengthDays: form.gender === 'female' && form.cycleStartDate ? form.cycleLengthDays : undefined,
        updatedAt: now,
      }
      updatePerson(editingId, patch)
      toast.success('Persona actualizada', { description: form.name.trim() })
    } else {
      // Slug auto-generado al crear. ensureUniqueSlug previene colisiones
      // dentro del mismo user. Si la sesion expiro o falla la red, el
      // slug igual se setea con base — el sync engine lo retentara.
      const baseSlug = generateSlug(form.name)
      let slug = baseSlug
      try {
        const sb = createClient()
        const { data } = await sb.auth.getUser()
        if (data?.user?.id) {
          slug = await ensureUniqueSlug(baseSlug, data.user.id, { client: sb })
        }
      } catch {
        // Best-effort: si falla, queda con baseSlug; el constraint unico
        // rechaza el upsert y el usuario puede editarlo desde /relaciones/[slug].
      }
      const newPerson: Person = {
        id: crypto.randomUUID(),
        slug,
        name: form.name.trim(),
        alias: form.alias.trim() || undefined,
        relationship: form.relationship,
        category: form.category,
        gender: form.gender || undefined,
        importanceScore: form.importanceScore,
        energyImpact: form.energyImpact,
        trustLevel: form.trustLevel,
        lastContact: form.lastContact || undefined,
        contactFrequency: form.contactFrequency,
        location: form.location.trim() || undefined,
        notes: form.notes,
        birthDate: form.birthDate || undefined,
        cycleStartDate: form.gender === 'female' ? (form.cycleStartDate || undefined) : undefined,
        cycleLengthDays: form.gender === 'female' && form.cycleStartDate ? form.cycleLengthDays : undefined,
        tags: [],
        createdAt: now,
        updatedAt: now,
      }
      addPerson(newPerson)
      track(EVENTS.personAdded, { relationship: form.relationship })
      addMemory(createPersonAddedMemory(newPerson))
      toast.success('Persona agregada', { description: newPerson.name })
    }
    handleCancel()
  }

  function handleRemovePerson(id: string, name: string) {
    removePerson(id)
    toast.success('Persona eliminada', { description: name })
  }

  return (
    <AppShell>
      <div className="mb-8 flex justify-between items-start gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
          <div className="flex items-center gap-3 mt-1">
            <Users size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Relaciones</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono tabular-nums">{people.length} personas &middot; {alerts.length} alertas</p>
        </div>
        <Button variant="outline" size="sm" onClick={openAdd} className="border-ok/30 bg-ok-soft text-ok hover:bg-ok/20 hover:text-ok">
          <UserPlus size={14} strokeWidth={1.75} />
          Agregar persona
        </Button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans">Alertas relacionales</span>
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60 ml-auto">{alerts.length}</span>
          </div>
          {alerts.map((alert, idx) => (
            <Card key={idx} className={cn('border-l-2 border-l-red-500', cardClass)}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{alert.personName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                    {alert.suggestedAction && (
                      <p className="text-xs text-brand-soft-foreground mt-1">{`→ ${alert.suggestedAction}`}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-normal', URGENCY_CLASS[alert.urgency])}>{alertUrgencyLabel(alert.urgency)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {people.length > 0 && (
        <div className="mb-6">
          <DailyActionsPanel variant="compact" />
        </div>
      )}

      {people.length > 0 && <PosiblesDuplicados />}

      <Sheet open={showForm} onOpenChange={(o) => { if (!o) handleCancel() }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              {editingId ? <Edit size={18} strokeWidth={1.75} /> : <UserPlus size={18} strokeWidth={1.75} />}
              {editingId ? 'Editar persona' : 'Nueva persona'}
            </SheetTitle>
            <SheetDescription className="sr-only">Formulario con los datos de la persona.</SheetDescription>
          </SheetHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Alias</label>
                <Input value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} placeholder="Apodo o alias" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Tipo de relacion</label>
                <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v as RelationshipType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="family">Familia</SelectItem>
                    <SelectItem value="friend">Amigo/a</SelectItem>
                    <SelectItem value="romantic">Pareja</SelectItem>
                    <SelectItem value="professional">Profesional</SelectItem>
                    <SelectItem value="mentor">Mentor</SelectItem>
                    <SelectItem value="mentee">Pupilo</SelectItem>
                    <SelectItem value="acquaintance">Conocido/a</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Categoria</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as PersonCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inner_circle">Circulo intimo</SelectItem>
                    <SelectItem value="close">Cercano/a</SelectItem>
                    <SelectItem value="network">Red</SelectItem>
                    <SelectItem value="peripheral">Periferico/a</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Sexo</label>
                <Select value={form.gender || 'unspecified'} onValueChange={(v) => setForm({ ...form, gender: v === 'unspecified' ? '' : (v as PersonGender) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Sin especificar</SelectItem>
                    <SelectItem value="female">Mujer</SelectItem>
                    <SelectItem value="male">Hombre</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Impacto energetico</label>
                <Select value={form.energyImpact} onValueChange={(v) => setForm({ ...form, energyImpact: v as EnergyImpact })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="energizing">Energizante</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="draining">Drenante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Ultimo contacto</label>
                <Input type="date" value={form.lastContact} onChange={(e) => setForm({ ...form, lastContact: e.target.value })} className="font-mono" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Confianza: <span className="font-mono text-foreground">{form.trustLevel}/10</span></label>
                <Input type="range" min={1} max={10} value={form.trustLevel} onChange={(e) => setForm({ ...form, trustLevel: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Importancia: <span className="font-mono text-foreground">{form.importanceScore}/10</span></label>
                <Input type="range" min={1} max={10} value={form.importanceScore} onChange={(e) => setForm({ ...form, importanceScore: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Frecuencia de contacto</label>
                <Input value={form.contactFrequency} onChange={(e) => setForm({ ...form, contactFrequency: e.target.value })} placeholder="Ej: semanal, mensual" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Ubicacion</label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ciudad o pais"
                  list="person-location-suggestions"
                />
                <datalist id="person-location-suggestions">
                  {locationSuggestions.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Fecha de nacimiento</label>
                <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="font-mono" />
              </div>
              {form.gender === 'female' && (<>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Inicio del último período</label>
                <Input type="date" value={form.cycleStartDate} onChange={(e) => setForm({ ...form, cycleStartDate: e.target.value })} className="font-mono" />
                <p className="text-[10px] text-muted-foreground/70 mt-1">Opcional — habilita el panel de ciclo en el detalle.</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Largo del ciclo (días)</label>
                <Input
                  type="number"
                  min={15}
                  max={60}
                  value={form.cycleLengthDays}
                  onChange={(e) => setForm({ ...form, cycleLengthDays: Number(e.target.value) || 28 })}
                  className="font-mono"
                  disabled={!form.cycleStartDate}
                />
                <p className="text-[10px] text-muted-foreground/70 mt-1">Default 28. Rango 15-60.</p>
              </div>
              </>)}
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={handleCancel}>Cancelar</Button>
              <Button variant="outline" size="sm" onClick={handleSubmit} className="border-ok/30 bg-ok-soft text-ok hover:bg-ok/20 hover:text-ok">
                {editingId ? 'Guardar cambios' : 'Agregar'}
              </Button>
            </div>
        </SheetContent>
      </Sheet>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin personas registradas todavia."
          hint="Agrega tu primera persona para mapear tus relaciones."
          action={
            <Button variant="outline" size="sm" onClick={openAdd} className="border-ok/30 bg-ok-soft text-ok hover:bg-ok/20 hover:text-ok">
              <UserPlus size={14} strokeWidth={1.75} />
              Agregar persona
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {people.map((person) => {
            const rel = relationships.find((r) => r.personId === person.id)
            const lastContactDisplay = person.lastContact
              ? `Hace ${daysSince(person.lastContact)} dias`
              : 'Sin registro'

            return (
              <Card key={person.id} className={cardClass}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Avatar name={person.name} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{person.name}</span>
                          {person.alias && <span className="text-xs text-muted-foreground">({person.alias})</span>}
                          <Badge variant="outline" className="text-[10px] font-normal">{relationshipTypeLabel(person.relationship)}</Badge>
                          <Badge variant="outline" className="text-[10px] font-normal">{personCategoryLabel(person.category)}</Badge>
                        </div>

                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            Confianza: <span className="text-foreground font-medium font-mono tabular-nums">{person.trustLevel}/10</span>
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            Energia:
                            <Badge variant="outline" className={cn('text-[10px] font-normal', ENERGY_CLASS[person.energyImpact])}>{energyImpactLabel(person.energyImpact)}</Badge>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Ultimo contacto: <span className="text-foreground font-medium font-mono tabular-nums">{lastContactDisplay}</span>
                          </span>
                        </div>

                        {rel && rel.status === 'strained' && (
                          <div className="mt-2">
                            <Badge variant="bad" className="text-[10px] font-normal">relacion tensa</Badge>
                          </div>
                        )}

                        {person.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-2 truncate">{person.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      {person.slug && (
                        <Button variant="ghost" size="sm" asChild aria-label="Ver detalle">
                          <Link href={`/relaciones/${person.slug}`}>
                            <ArrowRight size={14} strokeWidth={1.75} />
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(person)} aria-label="Editar">
                        <Edit size={14} strokeWidth={1.75} />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="hover:text-bad" aria-label="Eliminar">
                            <X size={14} strokeWidth={1.75} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar a {person.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminara la persona y su relacion asociada. Esta accion no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemovePerson(person.id, person.name)} className="bg-bad text-white hover:bg-bad/90">Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
