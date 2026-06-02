// SIR V2 — Espacio personal / diagnóstico (sección privada de /yo).
//
// Data PERSONAL y SENSIBLE del dueño de la app: estado emocional, ansiedades,
// bloqueos, lo que dejó de tolerar, lo que entiende, visión de vida ideal,
// modelo del yo futuro, frases ancla. Visible SOLO para él en /yo.
//   · Privada por usuario (RLS de self_diagnosis, igual que el resto).
//   · NO se envía a embeddings/IA: vive en su tabla y nada más la lee.
//   · NO se expone fuera de /yo.
//
// Patrón de edición: vista de lectura ↔ modo edición con draft local. "Guardar"
// normaliza y hace UN solo upsert al store (que sincroniza a Supabase). Evita
// pushear en cada tecla.
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Lock, Pencil, Plus, X, Check, HeartPulse, AlertTriangle, Ban, Lightbulb, Sparkles, Compass, Anchor } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSelfStore } from '@/stores/useSelfStore'
import { emptyDiagnosis, isDiagnosisEmpty, normalizeDiagnosis, countFilledFields, DIAGNOSIS_TOTAL_FIELDS } from '@/lib/self-diagnosis'
import type { SelfDiagnosis } from '@/types'
import { cn } from '@/lib/utils'

type ListKey = 'anxieties' | 'blocks' | 'stoppedTolerating' | 'understandings' | 'anchors'
type TextKey = 'emotionalState' | 'idealLifeVision' | 'futureSelf'

interface TextFieldDef {
  kind: 'text'
  key: TextKey
  label: string
  icon: LucideIcon
  placeholder: string
  accent: string
}
interface ListFieldDef {
  kind: 'list'
  key: ListKey
  label: string
  icon: LucideIcon
  placeholder: string
  accent: string
}
type FieldDef = TextFieldDef | ListFieldDef

// Orden y wording fieles a lo que pidió Aaron.
const FIELDS: FieldDef[] = [
  { kind: 'text', key: 'emotionalState', label: 'Estado emocional actual', icon: HeartPulse, accent: 'text-text-tertiary', placeholder: '¿Cómo estás hoy, de verdad? Sin filtro.' },
  { kind: 'list', key: 'anxieties', label: 'Principales ansiedades / preocupaciones', icon: AlertTriangle, accent: 'text-text-tertiary', placeholder: 'Una preocupación y Enter…' },
  { kind: 'list', key: 'blocks', label: 'Bloqueos detectados', icon: Ban, accent: 'text-text-tertiary', placeholder: 'Algo que te traba y Enter…' },
  { kind: 'list', key: 'stoppedTolerating', label: 'Lo que dejé de tolerar', icon: Ban, accent: 'text-text-tertiary', placeholder: 'Algo que ya no aceptás y Enter…' },
  { kind: 'list', key: 'understandings', label: 'Lo que entiendo', icon: Lightbulb, accent: 'text-text-tertiary', placeholder: 'Una claridad que ganaste y Enter…' },
  { kind: 'text', key: 'idealLifeVision', label: 'Visión de vida ideal', icon: Sparkles, accent: 'text-text-tertiary', placeholder: 'Cómo se ve tu vida cuando todo está en su lugar…' },
  { kind: 'text', key: 'futureSelf', label: 'Modelo del yo futuro', icon: Compass, accent: 'text-text-tertiary', placeholder: 'Quién es el vos en el que te estás convirtiendo…' },
  { kind: 'list', key: 'anchors', label: 'Frases ancla / valores', icon: Anchor, accent: 'text-text-tertiary', placeholder: 'Una frase o valor que te sostiene y Enter…' },
]

const cardClass = 'shadow-none transition-colors duration-200'

function formatEdited(updatedAt: string): string | null {
  const t = new Date(updatedAt).getTime()
  if (!t) return null // epoch = nunca editado
  return new Date(updatedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function SelfDiagnosisPanel() {
  const diagnosis = useSelfStore((s) => s.diagnosis)
  const setDiagnosis = useSelfStore((s) => s.setDiagnosis)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SelfDiagnosis | null>(null)

  function startEdit() {
    // Reusa el id existente (upsert) o genera uno la primera vez.
    setDraft(diagnosis ? { ...diagnosis } : emptyDiagnosis('diag_' + Date.now()))
    setEditing(true)
  }
  function cancelEdit() {
    setDraft(null)
    setEditing(false)
  }
  function save() {
    if (!draft) return
    const clean = normalizeDiagnosis({ ...draft, updatedAt: new Date().toISOString() })
    setDiagnosis(clean)
    setDraft(null)
    setEditing(false)
    toast.success('Diagnóstico guardado', { description: 'Privado · solo vos lo ves.' })
  }

  const empty = isDiagnosisEmpty(diagnosis)
  const filled = countFilledFields(diagnosis)
  const editedLabel = diagnosis ? formatEdited(diagnosis.updatedAt) : null

  return (
    <Card className={cn('mb-6 border-primary/20', cardClass)}>
      <CardContent className="p-4 sm:p-6">
        {/* Header con candado de privacidad */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lock size={16} strokeWidth={1.75} className="text-primary flex-shrink-0" aria-hidden="true" />
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">Espacio personal</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Tu diagnóstico para llevar una mejor vida. Privado · solo vos lo ves · no se envía a IA.
            </p>
          </div>
          {!editing && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {!empty && (
                <Badge variant="outline" className="text-[10px] font-normal tabular-nums">
                  {filled}/{DIAGNOSIS_TOTAL_FIELDS} campos
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={startEdit} className="inline-flex items-center gap-1.5">
                <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
                {empty ? 'Empezar' : 'Editar'}
              </Button>
            </div>
          )}
        </div>

        {editing && draft ? (
          <EditView draft={draft} setDraft={setDraft} onSave={save} onCancel={cancelEdit} />
        ) : empty ? (
          <EmptyState onStart={startEdit} />
        ) : (
          <>
            <ReadView diagnosis={diagnosis!} />
            {editedLabel && (
              <p className="text-[10px] text-muted-foreground/60 mt-4 text-right">
                Última edición: {editedLabel}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-8">
      <HeartPulse size={26} strokeWidth={1.5} className="text-primary/40 mx-auto mb-3" aria-hidden="true" />
      <p className="text-sm text-foreground/80">Tu espacio para verte con honestidad.</p>
      <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto leading-snug">
        Estado emocional, ansiedades, bloqueos, lo que dejaste de tolerar, lo que entendés,
        tu visión de vida ideal y tus frases ancla. Nadie más lo ve.
      </p>
      <Button size="sm" onClick={onStart} className="mt-4 inline-flex items-center gap-1.5">
        <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        Empezar mi diagnóstico
      </Button>
    </div>
  )
}

function ReadView({ diagnosis }: { diagnosis: SelfDiagnosis }) {
  return (
    <div className="space-y-5">
      {FIELDS.map((f) => {
        const Icon = f.icon
        if (f.kind === 'text') {
          const v = diagnosis[f.key]
          if (!v.trim()) return null
          return (
            <div key={f.key}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon size={13} strokeWidth={1.75} className={f.accent} aria-hidden="true" />
                <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{f.label}</span>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{v}</p>
            </div>
          )
        }
        const items = diagnosis[f.key]
        if (items.length === 0) return null
        return (
          <div key={f.key}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon size={13} strokeWidth={1.75} className={f.accent} aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{f.label}</span>
            </div>
            <ul className="space-y-1">
              {items.map((it, i) => (
                <li key={i} className="text-sm text-foreground/90 flex gap-2 leading-relaxed">
                  <span className={cn('flex-shrink-0 mt-2 w-1 h-1 rounded-full bg-current', f.accent)} aria-hidden="true" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

interface EditViewProps {
  draft: SelfDiagnosis
  setDraft: (d: SelfDiagnosis) => void
  onSave: () => void
  onCancel: () => void
}

function EditView({ draft, setDraft, onSave, onCancel }: EditViewProps) {
  return (
    <div className="space-y-5">
      {FIELDS.map((f) => {
        const Icon = f.icon
        return (
          <div key={f.key}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon size={13} strokeWidth={1.75} className={f.accent} aria-hidden="true" />
              <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{f.label}</label>
            </div>
            {f.kind === 'text' ? (
              <Textarea
                value={draft[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                className="min-h-[72px] resize-y"
              />
            ) : (
              <ListField
                items={draft[f.key]}
                placeholder={f.placeholder}
                accent={f.accent}
                onChange={(items) => setDraft({ ...draft, [f.key]: items })}
              />
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} className="inline-flex items-center gap-1.5">
          <Check size={14} strokeWidth={2} aria-hidden="true" />
          Guardar
        </Button>
      </div>
    </div>
  )
}

interface ListFieldProps {
  items: string[]
  placeholder: string
  accent: string
  onChange: (items: string[]) => void
}

function ListField({ items, placeholder, accent, onChange }: ListFieldProps) {
  const [value, setValue] = useState('')

  function add() {
    const v = value.trim()
    if (!v) return
    if (items.includes(v)) { setValue(''); return }
    onChange([...items, v])
    setValue('')
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 pl-2 pr-1 py-1 text-xs text-foreground/90"
            >
              <span className={cn('w-1 h-1 rounded-full bg-current flex-shrink-0', accent)} aria-hidden="true" />
              {it}
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-0.5 rounded-sm p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                aria-label={`Quitar "${it}"`}
              >
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="flex-shrink-0" aria-label="Agregar ítem">
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
