'use client'
// SIR V2 — Selector de métrica por CARITAS (1 toque). Reemplaza el input
// numérico "Valor (1-10)" en /yo: bajar la fricción del registro diario.
// 5 niveles → valor 1-10 (2/4/6/8/10). Emojis por categoría para que tengan
// sentido (ánimo triste→feliz, energía cansado→con pila, estrés calma→tenso).

import type { MetricCategory } from '@/types'
import { cn } from '@/lib/utils'

const FACES: Record<MetricCategory, string[]> = {
  mood: ['😞', '🙁', '😐', '🙂', '😄'],
  energy: ['😴', '😪', '😐', '🙂', '⚡'],
  stress: ['😌', '🙂', '😐', '😣', '😫'],
  focus: ['😵', '😶', '😐', '🎯', '🧠'],
  motivation: ['😞', '🙁', '😐', '🙂', '🔥'],
  confidence: ['😞', '🙁', '😐', '🙂', '😎'],
}

const LEVEL_VALUES = [2, 4, 6, 8, 10]
const LEVEL_LABELS = ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto']

export function MetricScale({
  category,
  value,
  onChange,
}: {
  category: MetricCategory
  value: string
  onChange: (v: string) => void
}) {
  const faces = FACES[category] ?? FACES.mood
  const current = Number(value)
  return (
    <div className="flex items-stretch gap-1.5" role="radiogroup" aria-label="Nivel">
      {faces.map((face, i) => {
        const v = LEVEL_VALUES[i]
        const selected = current === v
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${LEVEL_LABELS[i]} (${v}/10)`}
            onClick={() => onChange(String(v))}
            className={cn(
              'flex-1 rounded-md border py-2 flex flex-col items-center gap-0.5 transition-colors',
              selected ? 'border-accent bg-accent/15' : 'border-border hover:border-accent/50 hover:bg-accent/5',
            )}
          >
            <span className="text-xl leading-none" aria-hidden="true">{face}</span>
            <span className={cn('text-[10px]', selected ? 'text-accent-foreground' : 'text-muted-foreground')}>
              {LEVEL_LABELS[i]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
