'use client'
// SIR V2 — CreateTrackerForm: crea un tracker enganchado a un objetivo o a un
// paso/KR/tarea, con su condición/umbral. Aterrizado en data real: el select de
// enganche lista los objetivos del store y sus pasos.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useTrackerStore } from '@/stores/useTrackerStore'
import { isTask } from '@/lib/objectives/steps'
import type { Tracker, TrackerConditionKind } from '@/types'

const COND_LABEL: Record<TrackerConditionKind, string> = {
  lte: 'Valor ≤ umbral (ej. precio baja)',
  gte: 'Valor ≥ umbral (ej. ahorro sube)',
  days_until_lt: 'Faltan < N días para una fecha',
}

// Valor especial para el <Select> de enganche (Radix no admite value="").
const NONE = '__none__'

export interface CreateTrackerFormProps {
  /** Prefill: enganchar a este objetivo. */
  defaultObjectiveId?: string
  /** Prefill: enganchar a este paso/KR/tarea. */
  defaultObjectiveStepId?: string
  onCreated?: (tracker: Tracker) => void
}

export function CreateTrackerForm({ defaultObjectiveId, defaultObjectiveStepId, onCreated }: CreateTrackerFormProps) {
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const addTracker = useTrackerStore((s) => s.addTracker)

  // Enganche serializado: "obj:<id>" o "step:<id>". Default según prefill.
  const initialTarget = defaultObjectiveStepId
    ? `step:${defaultObjectiveStepId}`
    : defaultObjectiveId
      ? `obj:${defaultObjectiveId}`
      : NONE
  const [target, setTarget] = useState(initialTarget)
  const [label, setLabel] = useState('')
  const [unit, setUnit] = useState('')
  const [conditionKind, setConditionKind] = useState<TrackerConditionKind>('lte')
  const [conditionValue, setConditionValue] = useState('')
  const [conditionDate, setConditionDate] = useState('')
  const [cadence, setCadence] = useState('')

  // Opciones de enganche: cada objetivo + sus pasos (KR/tarea) indentados.
  const options = useMemo(() => {
    const out: { value: string; label: string }[] = []
    for (const g of goals) {
      out.push({ value: `obj:${g.id}`, label: `🎯 ${g.title}` })
      const gSteps = steps.filter((st) => st.objectiveId === g.id)
      for (const st of gSteps) {
        const prefix = isTask(st) ? '↳ tarea' : '↳ KR'
        out.push({ value: `step:${st.id}`, label: `   ${prefix}: ${st.title}` })
      }
    }
    return out
  }, [goals, steps])

  function submit() {
    if (!label.trim()) {
      toast.error('Falta el nombre', { description: 'Ponele un label al tracker.' })
      return
    }
    const cv = Number(conditionValue)
    if (!Number.isFinite(cv)) {
      toast.error('Umbral inválido', { description: 'El valor de la condición debe ser numérico.' })
      return
    }
    if (conditionKind === 'days_until_lt' && !conditionDate) {
      toast.error('Falta la fecha objetivo', { description: 'Para "faltan < N días" elegí la fecha.' })
      return
    }

    let objectiveId: string | undefined
    let objectiveStepId: string | undefined
    if (target.startsWith('step:')) {
      objectiveStepId = target.slice(5)
      // Denormalizamos el objetivo del paso para contexto.
      objectiveId = steps.find((st) => st.id === objectiveStepId)?.objectiveId
    } else if (target.startsWith('obj:')) {
      objectiveId = target.slice(4)
    }

    const tracker: Tracker = {
      id: `tk_${Date.now()}`,
      objectiveId,
      objectiveStepId,
      label: label.trim(),
      unit: unit.trim(),
      conditionKind,
      conditionValue: cv,
      conditionDate: conditionKind === 'days_until_lt' ? conditionDate : undefined,
      cadenceDays: cadence ? Math.max(1, Math.round(Number(cadence))) : undefined,
      createdAt: new Date().toISOString(),
    }
    addTracker(tracker)
    setLabel(''); setUnit(''); setConditionValue(''); setConditionDate(''); setCadence('')
    toast.success('Tracker creado', { description: tracker.label })
    onCreated?.(tracker)
  }

  return (
    <div className="space-y-3">
      <SectionTitle icon={Plus} label="Nuevo tracker" />

      <label className="block text-xs text-muted-foreground">
        Enganchar a (opcional)
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Sin enganche" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Sin enganche</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block text-xs text-muted-foreground sm:col-span-2">
          Nombre
          <Input placeholder="Precio vuelo Lima→Dammam" value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-xs text-muted-foreground">
          Unidad
          <Input placeholder="PEN" value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1" />
        </label>
      </div>

      <label className="block text-xs text-muted-foreground">
        Condición de alerta
        <Select value={conditionKind} onValueChange={(v) => setConditionKind(v as TrackerConditionKind)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(COND_LABEL) as TrackerConditionKind[]).map((k) => (
              <SelectItem key={k} value={k}>{COND_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block text-xs text-muted-foreground">
          {conditionKind === 'days_until_lt' ? 'N (días)' : 'Umbral'}
          <Input
            type="number"
            inputMode="decimal"
            placeholder={conditionKind === 'days_until_lt' ? '30' : '4500'}
            value={conditionValue}
            onChange={(e) => setConditionValue(e.target.value)}
            className="mt-1"
          />
        </label>
        {conditionKind === 'days_until_lt' && (
          <label className="block text-xs text-muted-foreground">
            Fecha objetivo
            <Input type="date" value={conditionDate} onChange={(e) => setConditionDate(e.target.value)} className="mt-1" />
          </label>
        )}
        <label className="block text-xs text-muted-foreground">
          Cadencia (días, opcional)
          <Input type="number" inputMode="numeric" placeholder="7" value={cadence} onChange={(e) => setCadence(e.target.value)} className="mt-1" />
        </label>
      </div>

      <Button onClick={submit} variant="outline" size="sm">+ Crear tracker</Button>
    </div>
  )
}
