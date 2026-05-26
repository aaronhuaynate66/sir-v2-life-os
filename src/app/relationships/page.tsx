'use client'

import { useState } from 'react'
import { Users, UserPlus, AlertCircle, Edit, X } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { useRelationshipStore, useMemoryStore } from '@/stores'
import { detectRelationshipAlerts } from '@/engines/relationship'
import { createPersonAddedMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { cn } from '@/lib/utils'
import type { Person, RelationshipType, PersonCategory, EnergyImpact } from '@/types'

interface PersonForm {
  name: string
  alias: string
  relationship: RelationshipType
  category: PersonCategory
  importanceScore: number
  energyImpact: EnergyImpact
  trustLevel: number
  lastContact: string
  contactFrequency: string
  location: string
  notes: string
}

const EMPTY_FORM: PersonForm = {
  name: '', alias: '', relationship: 'friend', category: 'network',
  importanceScore: 5, energyImpact: 'neutral', trustLevel: 5,
  lastContact: '', contactFrequency: '', location: '', notes: '',
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

const ENERGY_CLASS: Record<EnergyImpact, string> = {
  energizing: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  neutral: 'border-border bg-muted text-muted-foreground',
  draining: 'border-red-500/30 bg-red-500/10 text-red-400',
}

const URGENCY_CLASS: Record<'immediate' | 'soon' | 'monitor', string> = {
  immediate: 'border-red-500/30 bg-red-500/10 text-red-400',
  soon: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  monitor: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
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

  function openAdd() {
    setEditingId(null); setForm(EMPTY_FORM); setShowForm(true)
  }

  function openEdit(person: Person) {
    setEditingId(person.id)
    setForm({
      name: person.name,
      alias: person.alias ?? '',
      relationship: person.relationship,
      category: person.category,
      importanceScore: person.importanceScore,
      energyImpact: person.energyImpact,
      trustLevel: person.trustLevel,
      lastContact: person.lastContact ?? '',
      contactFrequency: person.contactFrequency,
      location: person.location ?? '',
      notes: person.notes,
    })
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false); setEditingId(null); setForm(EMPTY_FORM)
  }

  function handleSubmit() {
    if (!form.name.trim()) return
    const now = new Date().toISOString()
    if (editingId) {
      const patch: Partial<Person> = {
        name: form.name.trim(),
        alias: form.alias.trim() || undefined,
        relationship: form.relationship,
        category: form.category,
        importanceScore: form.importanceScore,
        energyImpact: form.energyImpact,
        trustLevel: form.trustLevel,
        lastContact: form.lastContact || undefined,
        contactFrequency: form.contactFrequency,
        location: form.location.trim() || undefined,
        notes: form.notes,
        updatedAt: now,
      }
      updatePerson(editingId, patch)
    } else {
      const newPerson: Person = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        alias: form.alias.trim() || undefined,
        relationship: form.relationship,
        category: form.category,
        importanceScore: form.importanceScore,
        energyImpact: form.energyImpact,
        trustLevel: form.trustLevel,
        lastContact: form.lastContact || undefined,
        contactFrequency: form.contactFrequency,
        location: form.location.trim() || undefined,
        notes: form.notes,
        tags: [],
        createdAt: now,
        updatedAt: now,
      }
      addPerson(newPerson)
      addMemory(createPersonAddedMemory(newPerson))
    }
    handleCancel()
  }

  return (
    <AppShell>
      <div className="mb-8 flex justify-between items-start gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
          <div className="flex items-center gap-3 mt-1">
            <Users size={28} strokeWidth={1.5} className="text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Relaciones</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono tabular-nums">{people.length} personas &middot; {alerts.length} alertas</p>
        </div>
        <Button variant="outline" size="sm" onClick={openAdd} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">
          <UserPlus size={14} strokeWidth={1.75} />
          Agregar persona
        </Button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Alertas relacionales</span>
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
                      <p className="text-xs text-blue-400 mt-1">{`→ ${alert.suggestedAction}`}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] font-normal', URGENCY_CLASS[alert.urgency])}>{alert.urgency}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Card className={cn('mb-6', cardClass)}>
          <CardContent className="p-4 sm:p-6">
            <SectionTitle icon={editingId ? Edit : UserPlus} label={editingId ? 'Editar persona' : 'Nueva persona'} />
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
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ciudad o pais" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={handleCancel}>Cancelar</Button>
              <Button variant="outline" size="sm" onClick={handleSubmit} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">
                {editingId ? 'Guardar cambios' : 'Agregar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {people.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Users size={28} strokeWidth={1.5} className="text-muted-foreground/40" />
          <div className="text-sm text-muted-foreground">Sin personas registradas todavia.</div>
          <p className="text-xs text-muted-foreground/60">Agrega tu primera persona para mapear tus relaciones.</p>
          <Button variant="outline" size="sm" onClick={openAdd} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">
            <UserPlus size={14} strokeWidth={1.75} />
            Agregar persona
          </Button>
        </div>
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
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-muted-foreground">{getInitials(person.name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{person.name}</span>
                          {person.alias && <span className="text-xs text-muted-foreground">({person.alias})</span>}
                          <Badge variant="outline" className="text-[10px] font-normal">{person.relationship}</Badge>
                          <Badge variant="outline" className="text-[10px] font-normal">{person.category}</Badge>
                        </div>

                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            Confianza: <span className="text-foreground font-medium font-mono tabular-nums">{person.trustLevel}/10</span>
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            Energia:
                            <Badge variant="outline" className={cn('text-[10px] font-normal', ENERGY_CLASS[person.energyImpact])}>{person.energyImpact}</Badge>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Ultimo contacto: <span className="text-foreground font-medium font-mono tabular-nums">{lastContactDisplay}</span>
                          </span>
                        </div>

                        {rel && rel.status === 'strained' && (
                          <div className="mt-2">
                            <Badge variant="outline" className="text-[10px] font-normal border-red-500/30 bg-red-500/10 text-red-400">relacion tensa</Badge>
                          </div>
                        )}

                        {person.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-2 truncate">{person.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(person)} aria-label="Editar">
                        <Edit size={14} strokeWidth={1.75} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removePerson(person.id)} className="hover:text-red-400" aria-label="Eliminar">
                        <X size={14} strokeWidth={1.75} />
                      </Button>
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
