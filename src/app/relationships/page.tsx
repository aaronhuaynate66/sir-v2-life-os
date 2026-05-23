'use client'

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import {
  Card,
  Badge,
  Button,
  Input,
  Select,
  SectionHeader,
  EmptyState,
} from '@/components/ui'
import { useRelationshipStore } from '@/stores'
import { detectRelationshipAlerts } from '@/engines/relationship'
import type { Person, RelationshipType, PersonCategory, EnergyImpact } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  name: '',
  alias: '',
  relationship: 'friend',
  category: 'network',
  importanceScore: 5,
  energyImpact: 'neutral',
  trustLevel: 5,
  lastContact: '',
  contactFrequency: '',
  location: '',
  notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function energyColor(impact: EnergyImpact): 'ok' | 'bad' | 'default' {
  if (impact === 'energizing') return 'ok'
  if (impact === 'draining') return 'bad'
  return 'default'
}

function urgencyColor(
  urgency: 'immediate' | 'soon' | 'monitor',
): 'bad' | 'warn' | 'info' {
  if (urgency === 'immediate') return 'bad'
  if (urgency === 'soon') return 'warn'
  return 'info'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RelationshipsPage() {
  const { people, relationships, addPerson, updatePerson, removePerson } =
    useRelationshipStore()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM)

  const alerts = detectRelationshipAlerts(people, relationships)

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
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
      contactFrequency: person.contactFrequency ?? '',
      location: person.location ?? '',
      notes: person.notes ?? '',
    })
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
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
        contactFrequency: form.contactFrequency.trim() || undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
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
        contactFrequency: form.contactFrequency.trim() || undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        tags: [],
        createdAt: now,
        updatedAt: now,
      }
      addPerson(newPerson)
    }
    handleCancel()
  }

  return (
    <AppShell>
      <SectionHeader
        title="Relaciones"
        subtitle={`${people.length} personas · ${alerts.length} alertas`}
        action={
          <Button variant="ok" onClick={openAdd}>
            + Agregar persona
          </Button>
        }
      />

      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#888] mb-2">
            Alertas relacionales
          </h2>
          {alerts.map((alert, idx) => (
            <Card key={idx} className="border-l-2 border-l-[#ef4444]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">{alert.personName}</p>
                  <p className="text-xs text-[#888] mt-0.5">{alert.message}</p>
                  {alert.suggestedAction && (
                    <p className="text-xs text-[#3b82f6] mt-1">
                      {`→ ${alert.suggestedAction}`}
                    </p>
                  )}
                </div>
                <Badge variant={urgencyColor(alert.urgency)} label={alert.urgency} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Card className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">
            {editingId ? 'Editar persona' : 'Nueva persona'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#888] mb-1">Nombre *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Alias</label>
              <Input
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="Apodo o alias"
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Tipo de relación</label>
              <Select
                value={form.relationship}
                onChange={(e) =>
                  setForm({ ...form, relationship: e.target.value as RelationshipType })
                }
              >
                <option value="family">Familia</option>
                <option value="friend">Amigo/a</option>
                <option value="romantic">Pareja</option>
                <option value="professional">Profesional</option>
                <option value="mentor">Mentor</option>
                <option value="mentee">Pupilo</option>
                <option value="acquaintance">Conocido/a</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Categoría</label>
              <Select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as PersonCategory })
                }
              >
                <option value="inner_circle">Círculo íntimo</option>
                <option value="close">Cercano/a</option>
                <option value="network">Red</option>
                <option value="peripheral">Periférico/a</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Impacto energético</label>
              <Select
                value={form.energyImpact}
                onChange={(e) =>
                  setForm({ ...form, energyImpact: e.target.value as EnergyImpact })
                }
              >
                <option value="energizing">Energizante</option>
                <option value="neutral">Neutral</option>
                <option value="draining">Drenante</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Último contacto</label>
              <Input
                type="date"
                value={form.lastContact}
                onChange={(e) => setForm({ ...form, lastContact: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">
                Confianza: {form.trustLevel}/10
              </label>
              <Input
                type="range"
                min={1}
                max={10}
                value={form.trustLevel}
                onChange={(e) =>
                  setForm({ ...form, trustLevel: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">
                Importancia: {form.importanceScore}/10
              </label>
              <Input
                type="range"
                min={1}
                max={10}
                value={form.importanceScore}
                onChange={(e) =>
                  setForm({ ...form, importanceScore: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Frecuencia de contacto</label>
              <Input
                value={form.contactFrequency}
                onChange={(e) => setForm({ ...form, contactFrequency: e.target.value })}
                placeholder="Ej: semanal, mensual"
              />
            </div>
            <div>
              <label className="block text-xs text-[#888] mb-1">Ubicación</label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Ciudad o país"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="ghost" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button variant="ok" onClick={handleSubmit}>
              {editingId ? 'Guardar cambios' : 'Agregar'}
            </Button>
          </div>
        </Card>
      )}

      {people.length === 0 ? (
        <EmptyState
          message="Sin personas registradas. Agrega tu primera persona para mapear tus relaciones."
          action={
            <Button variant="ok" onClick={openAdd}>
              + Agregar persona
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {people.map((person) => {
            const rel = relationships.find((r) => r.personId === person.id)
            const lastContactDisplay = person.lastContact
              ? `Hace ${daysSince(person.lastContact)} días`
              : 'Sin registro'

            return (
              <Card key={person.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{person.name}</span>
                      {person.alias && (
                        <span className="text-xs text-[#888]">({person.alias})</span>
                      )}
                      <Badge variant="default" label={person.relationship} />
                      <Badge variant="muted" label={person.category} />
                    </div>

                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <span className="text-xs text-[#888]">
                        Confianza:{' '}
                        <span className="text-white font-medium">
                          {person.trustLevel}/10
                        </span>
                      </span>
                      <span className="text-xs text-[#888] flex items-center gap-1">
                        Energía:{' '}
                        <Badge
                          variant={energyColor(person.energyImpact)}
                          label={person.energyImpact}
                        />
                      </span>
                      <span className="text-xs text-[#888]">
                        Último contacto:{' '}
                        <span className="text-white font-medium">
                          {lastContactDisplay}
                        </span>
                      </span>
                    </div>

                    {rel && rel.status === 'strained' && (
                      <div className="mt-1">
                        <Badge variant="bad" label="relación tensa" />
                      </div>
                    )}

                    {person.notes && (
                      <p className="text-xs text-[#666] mt-2 truncate">{person.notes}</p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(person)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => removePerson(person.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
