// SIR V2 — Tests del prompt/parsers de la narrativa de alineación.
//
// buildAlignmentInput (ensamblado determinístico) y parseAlignmentNarrative
// (extracción tolerante de JSON). El system prompt fija los invariantes; acá
// verificamos que las señales reales viajen al modelo y que la respuesta se
// parsee sin romperse.

import { describe, it, expect } from 'vitest'

import {
  buildAlignmentInput,
  parseAlignmentNarrative,
  ALIGNMENT_NARRATIVE_SYSTEM_PROMPT,
  type AlignmentNarrativeInput,
} from './narrativePrompt'

const input: AlignmentNarrativeInput = {
  title: 'Ser mejor pareja',
  category: 'relational',
  description: 'Construir una relación más presente',
  state: 'needs_attention',
  linkedPersonNames: ['Maria'],
  signals: [
    { label: 'Sin contacto con Maria hace 40 días', concern: 2 },
    { label: 'Relación con Maria en tensión', concern: 2 },
    { label: 'El vínculo con Maria te energiza', concern: 0 },
  ],
}

describe('buildAlignmentInput', () => {
  it('incluye objetivo, dominio, personas y todas las señales con su tag', () => {
    const out = buildAlignmentInput(input)
    expect(out).toContain('Ser mejor pareja')
    expect(out).toContain('dominio: relational')
    expect(out).toContain('Maria')
    expect(out).toContain('Sin contacto con Maria hace 40 días')
    expect(out).toContain('[se desvía]') // concern 2
    expect(out).toContain('[acompaña]') // concern 0
  })

  it('omite descripción/personas si no hay', () => {
    const out = buildAlignmentInput({ ...input, description: undefined, linkedPersonNames: [] })
    expect(out).not.toContain('Descripción:')
    expect(out).not.toContain('Personas vinculadas:')
  })
})

describe('parseAlignmentNarrative', () => {
  it('extrae insight de un JSON limpio', () => {
    expect(parseAlignmentNarrative('{"insight":"Notá que el contacto bajó."}')).toBe(
      'Notá que el contacto bajó.',
    )
  })

  it('tolera prosa/fences alrededor del JSON', () => {
    const raw = '```json\n{ "insight": "Algo para reflexionar." }\n```'
    expect(parseAlignmentNarrative(raw)).toBe('Algo para reflexionar.')
  })

  it('cae al texto crudo si no hay JSON parseable', () => {
    expect(parseAlignmentNarrative('Una reflexión en texto plano.')).toBe('Una reflexión en texto plano.')
  })

  it('vacío / no-string → null', () => {
    expect(parseAlignmentNarrative('')).toBeNull()
    expect(parseAlignmentNarrative('   ')).toBeNull()
    // @ts-expect-error probando input no-string defensivo
    expect(parseAlignmentNarrative(null)).toBeNull()
  })

  it('JSON con insight vacío → cae al crudo (que acá es el propio JSON)', () => {
    // insight vacío no es usable → fallback al texto crudo trimmeado.
    const raw = '{"insight":""}'
    expect(parseAlignmentNarrative(raw)).toBe(raw)
  })
})

describe('system prompt — invariantes presentes', () => {
  it('prohíbe culpa, causa-efecto y diagnóstico explícitamente', () => {
    expect(ALIGNMENT_NARRATIVE_SYSTEM_PROMPT).toMatch(/culpabilizador|vergüenza/i)
    expect(ALIGNMENT_NARRATIVE_SYSTEM_PROMPT).toMatch(/causa-efecto|correlación/i)
    expect(ALIGNMENT_NARRATIVE_SYSTEM_PROMPT).toMatch(/diagnóstico/i)
  })
})
