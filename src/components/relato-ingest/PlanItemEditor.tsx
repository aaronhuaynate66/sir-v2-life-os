'use client'
// SIR V2 — PlanItemEditor: edit inline de un item del plan de /relato/ingest.
//
// Renderiza el form correcto según el `kind` del item, con validación mínima
// client-side. Al Guardar devuelve el item modificado; al Cancelar sale sin
// cambios. Es 100% controlado: el estado vive acá durante la edición y sólo
// se propaga al parent en onSave.
//
// Filosofía: dejar que Aaron corrija UN detalle sin tener que reescribir el
// relato para que Claude lo cambie. No es un editor de features complejas —
// es "cambia la fecha, subí el value, corregí el título".

import { useState } from 'react'
import { Save, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

// Duplicado del tipo del page.tsx para no ciclar imports. Si cambia el shape
// allá, este archivo necesita actualizarse (hay un test lint que lo cubre).
type PlanItem =
  | { kind: 'crear_moment'; personFullName: string; title: string; detail: string; occurredOn: string; status: 'abierto' | 'resuelto'; followUpOn?: string; resolution?: string }
  | { kind: 'crear_person_log'; personFullName: string; logKind: 'interaction' | 'mood' | 'energy'; value: number; note: string; loggedAt: string }
  | { kind: 'crear_nota_manual'; personFullName: string; text: string; observedAt: string }
  | { kind: 'upsert_cumpleanos'; personFullName: string; date: string }
  | { kind: 'registrar_ciclo'; personFullName: string; date: string; phase: 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'; confidence: 'high' | 'medium' | 'low'; note?: string }
  | { kind: 'crear_objetivo'; title: string; category: string; priority: string; targetDate?: string; nextStep?: string }
  | { kind: 'crear_persona'; fullName: string; relationship: string; category: string; notes?: string }
  | { kind: 'crear_recordatorio'; text: string; dueAt: string; personFullName?: string }

interface Props {
  item: PlanItem
  onSave: (updated: PlanItem) => void
  onCancel: () => void
}

const CYCLE_PHASES = ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown'] as const
const GOAL_CATEGORIES = ['financial', 'personal', 'relational', 'health', 'career', 'spiritual', 'creative'] as const
const GOAL_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
const REL_TYPES = ['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance'] as const
const PERSON_CATS = ['inner_circle', 'close', 'network', 'peripheral'] as const

function inputClass(): string {
  return 'w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/30'
}
function labelClass(): string {
  return 'block text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5'
}

export function PlanItemEditor({ item, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<PlanItem>(item)

  // Update laxo: cada variant tiene sus propios fields, pero como el editor
  // sabe qué field pertenece a qué kind (por el switch), aceptamos strings.
  function update(key: string, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value } as PlanItem))
  }

  return (
    <div className="rounded-md border border-brand/40 bg-brand/5 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-brand font-medium">
        Editar · {draft.kind}
      </div>
      <div className="space-y-2">
        {draft.kind === 'crear_moment' && (
          <>
            <FieldPair labelA="Persona" labelB="Fecha (YYYY-MM-DD)">
              <input className={inputClass()} value={draft.personFullName} onChange={(e) => update('personFullName', e.target.value)} />
              <input className={inputClass()} type="date" value={draft.occurredOn} onChange={(e) => update('occurredOn', e.target.value)} />
            </FieldPair>
            <Field label="Título"><input className={inputClass()} value={draft.title} onChange={(e) => update('title', e.target.value)} /></Field>
            <Field label="Detalle"><textarea rows={2} className={inputClass()} value={draft.detail} onChange={(e) => update('detail', e.target.value)} /></Field>
            <FieldPair labelA="Status" labelB="Follow-up (opcional)">
              <select className={inputClass()} value={draft.status} onChange={(e) => update('status', e.target.value as 'abierto' | 'resuelto')}>
                <option value="abierto">abierto</option>
                <option value="resuelto">resuelto</option>
              </select>
              <input className={inputClass()} type="date" value={draft.followUpOn ?? ''} onChange={(e) => update('followUpOn', e.target.value || undefined)} disabled={draft.status !== 'abierto'} />
            </FieldPair>
            {draft.status === 'resuelto' && (
              <Field label="Cómo se resolvió"><input className={inputClass()} value={draft.resolution ?? ''} onChange={(e) => update('resolution', e.target.value || undefined)} /></Field>
            )}
          </>
        )}

        {draft.kind === 'crear_person_log' && (
          <>
            <FieldPair labelA="Persona" labelB="Timestamp (ISO con TZ)">
              <input className={inputClass()} value={draft.personFullName} onChange={(e) => update('personFullName', e.target.value)} />
              <input className={inputClass()} value={draft.loggedAt} onChange={(e) => update('loggedAt', e.target.value)} placeholder="2026-07-02T20:00:00-05:00" />
            </FieldPair>
            <FieldPair labelA="Tipo" labelB="Valor (1-5)">
              <select className={inputClass()} value={draft.logKind} onChange={(e) => update('logKind', e.target.value as 'interaction' | 'mood' | 'energy')}>
                <option value="interaction">interaction</option>
                <option value="mood">mood</option>
                <option value="energy">energy</option>
              </select>
              <input className={inputClass()} type="number" min={1} max={5} value={draft.value} onChange={(e) => update('value', Math.max(1, Math.min(5, Number(e.target.value) || 3)))} />
            </FieldPair>
            <Field label="Nota"><input className={inputClass()} value={draft.note} onChange={(e) => update('note', e.target.value)} /></Field>
          </>
        )}

        {draft.kind === 'crear_nota_manual' && (
          <>
            <FieldPair labelA="Persona" labelB="Fecha (ISO)">
              <input className={inputClass()} value={draft.personFullName} onChange={(e) => update('personFullName', e.target.value)} />
              <input className={inputClass()} value={draft.observedAt} onChange={(e) => update('observedAt', e.target.value)} />
            </FieldPair>
            <Field label="Texto"><textarea rows={4} className={inputClass()} value={draft.text} onChange={(e) => update('text', e.target.value)} /></Field>
          </>
        )}

        {draft.kind === 'upsert_cumpleanos' && (
          <FieldPair labelA="Persona" labelB="Fecha del cumple (YYYY-MM-DD)">
            <input className={inputClass()} value={draft.personFullName} onChange={(e) => update('personFullName', e.target.value)} />
            <input className={inputClass()} type="date" value={draft.date} onChange={(e) => update('date', e.target.value)} />
          </FieldPair>
        )}

        {draft.kind === 'registrar_ciclo' && (
          <>
            <FieldPair labelA="Persona" labelB="Fecha">
              <input className={inputClass()} value={draft.personFullName} onChange={(e) => update('personFullName', e.target.value)} />
              <input className={inputClass()} type="date" value={draft.date} onChange={(e) => update('date', e.target.value)} />
            </FieldPair>
            <FieldPair labelA="Fase" labelB="Confianza">
              <select className={inputClass()} value={draft.phase} onChange={(e) => update('phase', e.target.value as PlanItem extends { kind: 'registrar_ciclo' } ? PlanItem['phase'] : never)}>
                {CYCLE_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={inputClass()} value={draft.confidence} onChange={(e) => update('confidence', e.target.value as 'high' | 'medium' | 'low')}>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </FieldPair>
            <Field label="Nota (opcional)"><input className={inputClass()} value={draft.note ?? ''} onChange={(e) => update('note', e.target.value || undefined)} /></Field>
          </>
        )}

        {draft.kind === 'crear_objetivo' && (
          <>
            <Field label="Título"><input className={inputClass()} value={draft.title} onChange={(e) => update('title', e.target.value)} /></Field>
            <FieldPair labelA="Categoría" labelB="Prioridad">
              <select className={inputClass()} value={draft.category} onChange={(e) => update('category', e.target.value)}>
                {GOAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={inputClass()} value={draft.priority} onChange={(e) => update('priority', e.target.value)}>
                {GOAL_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FieldPair>
            <FieldPair labelA="Fecha objetivo (opcional)" labelB="Próximo paso (opcional)">
              <input className={inputClass()} type="date" value={draft.targetDate ?? ''} onChange={(e) => update('targetDate', e.target.value || undefined)} />
              <input className={inputClass()} value={draft.nextStep ?? ''} onChange={(e) => update('nextStep', e.target.value || undefined)} />
            </FieldPair>
          </>
        )}

        {draft.kind === 'crear_persona' && (
          <>
            <Field label="Nombre completo"><input className={inputClass()} value={draft.fullName} onChange={(e) => update('fullName', e.target.value)} /></Field>
            <FieldPair labelA="Vínculo" labelB="Categoría">
              <select className={inputClass()} value={draft.relationship} onChange={(e) => update('relationship', e.target.value)}>
                {REL_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select className={inputClass()} value={draft.category} onChange={(e) => update('category', e.target.value)}>
                {PERSON_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FieldPair>
            <Field label="Notas (opcional)"><textarea rows={2} className={inputClass()} value={draft.notes ?? ''} onChange={(e) => update('notes', e.target.value || undefined)} /></Field>
          </>
        )}

        {draft.kind === 'crear_recordatorio' && (
          <>
            <Field label="Qué recordar"><textarea rows={2} className={inputClass()} value={draft.text} onChange={(e) => update('text', e.target.value)} /></Field>
            <FieldPair labelA="Cuándo (ISO con TZ)" labelB="Persona (opcional)">
              <input className={inputClass()} value={draft.dueAt} onChange={(e) => update('dueAt', e.target.value)} placeholder="2026-07-05T09:00:00-05:00" />
              <input className={inputClass()} value={draft.personFullName ?? ''} onChange={(e) => update('personFullName', e.target.value || undefined)} placeholder="Nombre Apellido" />
            </FieldPair>
          </>
        )}
      </div>
      <div className="flex justify-end gap-1.5 pt-2 border-t border-brand/20">
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onCancel}>
          <X size={11} className="mr-1" /> Cancelar
        </Button>
        <Button size="sm" className="h-7 text-[11px]" onClick={() => onSave(draft)}>
          <Save size={11} className="mr-1" /> Guardar
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass()}>{label}</label>
      {children}
    </div>
  )
}

function FieldPair({ labelA, labelB, children }: { labelA: string; labelB: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children, null]
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={labelClass()}>{labelA}</label>
        {arr[0]}
      </div>
      <div>
        <label className={labelClass()}>{labelB}</label>
        {arr[1]}
      </div>
    </div>
  )
}
