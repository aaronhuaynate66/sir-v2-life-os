'use client'
// SIR V2 — /relationships
// Personas, relaciones, alertas relacionales
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Button, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { detectRelationshipAlerts } from '@/engines/relationship'
import type { Person, PersonCategory, EnergyImpact } from '@/types'

const CATEGORY_LABEL: Record<PersonCategory, string> = {
  inner_circle: 'Circulo interno', close: 'Cercano', network: 'Red', peripheral: 'Periferico'
}
const ENERGY_LABEL: Record<EnergyImpact, string> = {
  energizing: 'Energizante', draining: 'Drenante', neutral: 'Neutro'
}
const ENERGY_VARIANT: Record<EnergyImpact, 'ok' | 'bad' | 'default'> = {
  energizing: 'ok', draining: 'bad', neutral: 'default'
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function RelationshipsPage() {
  const { people, relationships, addPerson, updatePerson } = useRelationshipStore()
  const relAlerts = useMemo(() => detectRelationshipAlerts(people, relationships), [people, relationships])

  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [relationship, setRelationship] = useState('friend')
  const [category, setCategory] = useState<PersonCategory>('close')
  const [energy, setEnergy] = useState<EnergyImpact>('neutral')
  const [trust, setTrust] = useState('7')
  const [importance, setImportance] = useState('7')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')

  function resetForm() {
    setName(''); setAlias(''); setRelationship('friend'); setCategory('close')
    setEnergy('neutral'); setTrust('7'); setImportance('7'); setLocation(''); setNotes('')
    setAdding(false); setEditId(null)
  }

  function savePerson() {
    if (!name.trim()) return
    const now = new Date().toISOString()
    if (editId) {
      updatePerson(editId, { name, alias: alias || undefined, relationship: relationship as Person['relationship'], category, energyImpact: energy, trustLevel: parseInt(trust), importanceScore: parseInt(importance), location: location || undefined, notes: notes || undefined, updatedAt: now })
    } else {
      const newP: Person = { id: `p_${Date.now()}`, name, alias: alias || undefined, relationship: relationship as Person['relationship'], category, importanceScore: parseInt(importance), energyImpact: energy, trustLevel: parseInt(trust), lastContact: now, contactFrequency: 'monthly', location: location || undefined, tags: [], notes: notes || undefined, createdAt: now, updatedAt: now }
      addPerson(newP)
    }
    resetForm()
  }

  function startEdit(p: Person) {
    setEditId(p.id); setName(p.name); setAlias(p.alias || ''); setRelationship(p.relationship)
    setCategory(p.category); setEnergy(p.energyImpact); setTrust(String(p.trustLevel))
    setImportance(String(p.importanceScore)); setLocation(p.location || ''); setNotes(p.notes || '')
    setAdding(true)
  }

  const sorted = [...people].sort((a, b) => b.importanceScore - a.importanceScore)

  return (
    <AppShell>
      <SectionHeader
        title="Relaciones"
        subtitle="Personas que importan en tu vida"
        action={<Button onClick={() => setAdding(!adding)}>{adding ? 'Cancelar' : '+ Agregar persona'}</Button>}
      />

      {/* Alertas */}
      {relAlerts.length > 0 && (
        <Card className="mb-4 border-[#2a2a2a]">
          <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Alertas — {relAlerts.length}</div>
          <div className="space-y-2">
            {relAlerts.slice(0, 4).map((a, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.urgency === 'immediate' ? 'bg-[#ef4444]' : 'bg-[#f59e0b]'}`} />
                <div>
                  <div className="text-xs text-[#f5f5f5]">{a.personName}</div>
                  <div className="text-[11px] text-[#444]">{a.message}</div>
                  <div className="text-[10px] text-[#333] mt-0.5">{a.suggestedAction}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Formulario */}
      {adding && (
        <Card className="mb-4 border-[#2a2a2a]">
          <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">{editId ? 'Editar persona' : 'Nueva persona'}</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder="Apodo (opcional)" value={alias} onChange={e => setAlias(e.target.value)} />
            <Select value={relationship} onChange={e => setRelationship(e.target.value)}>
              {['friend','family','romantic','professional','mentor','mentee','acquaintance'].map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select value={category} onChange={e => setCategory(e.target.value as PersonCategory)}>
              {(['inner_circle','close','network','peripheral'] as PersonCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
            <Select value={energy} onChange={e => setEnergy(e.target.value as EnergyImpact)}>
              {(['energizing','neutral','draining'] as EnergyImpact[]).map(e => <option key={e} value={e}>{ENERGY_LABEL[e]}</option>)}
            </Select>
            <Input placeholder="Ubicacion" value={location} onChange={e => setLocation(e.target.value)} />
            <div className="flex gap-2">
              <Input type="number" min="1" max="10" placeholder="Confianza" value={trust} onChange={e => setTrust(e.target.value)} />
              <Input type="number" min="1" max="10" placeholder="Importancia" value={importance} onChange={e => setImportance(e.target.value)} />
            </div>
            <Input placeholder="Notas" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="ok" onClick={savePerson}>{editId ? 'Guardar cambios' : '+ Agregar'}</Button>
            <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* Lista de personas */}
      {sorted.length === 0 ? (
        <EmptyState message="Sin personas. Agrega a alguien importante." action={<Button onClick={() => setAdding(true)}>+ Agregar primera persona</Button>} />
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => {
            const rel = relationships.find(r => r.personId === p.id)
            const days = daysSince(p.lastContact)
            return (
              <Card key={p.id} className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-[#f5f5f5]">{p.name}</span>
                    {p.alias && <span className="text-[10px] text-[#333] font-mono">({p.alias})</span>}
                    <Badge label={CATEGORY_LABEL[p.category]} variant="muted" />
                    <Badge label={ENERGY_LABEL[p.energyImpact]} variant={ENERGY_VARIANT[p.energyImpact]} />
                  </div>
                  <div className="flex gap-4 text-[11px] text-[#444] flex-wrap">
                    <span>Confianza: <span className="text-[#f5f5f5] font-mono">{p.trustLevel}/10</span></span>
                    <span>Importancia: <span className="text-[#f5f5f5] font-mono">{p.importanceScore}/10</span></span>
                    <span>Ultimo contacto: <span className={`font-mono ${days > 30 ? 'text-[#ef4444]' : days > 14 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>{days}d</span></span>
                    {p.location && <span className="text-[#333]">{p.location}</span>}
                  </div>
                  {rel?.nextAction && <div className="text-[10px] text-[#333] mt-1">siguiente: {rel.nextAction}</div>}
                  {p.notes && <div className="text-[10px] text-[#2a2a2a] mt-0.5 truncate">{p.notes}</div>}
                </div>
                <Button variant="ghost" onClick={() => startEdit(p)} className="flex-shrink-0">Editar</Button>
              </Card>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
