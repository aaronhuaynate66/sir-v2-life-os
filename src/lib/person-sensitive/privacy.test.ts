// SIR V2 — Garantía de privacidad de `private_notes` (notas privadas).
//
// Las notas privadas viven en person_sensitive_data (0063), la tabla aislada
// que NINGÚN engine/IA/grafo/síntesis lee. El riesgo a blindar es que se filtren
// al ÚNICO serializador "persona → contexto para IA" que arma prompts con datos
// de la persona: buildMessageContext (daily-actions/message → Haiku).
//
// Estos tests fallan si alguien, sin querer, hace que las notas privadas lleguen
// al texto que se manda al modelo.

import { describe, it, expect } from 'vitest'

import { buildMessageContext, type MessageContextInput } from '@/lib/daily-actions/messagePrompt'
import type { PersonSensitiveData } from './types'

const SENTINEL = '__NOTA_PRIVADA_ULTRA_SECRETA_no_debe_ir_a_la_IA__'

describe('private_notes nunca llega a la IA', () => {
  // El contexto que el route de mensaje (daily-actions) arma para el modelo:
  // SOLO campos públicos de la persona. `notes` es people.notes (resumen
  // general que SÍ viaja), nunca las notas privadas.
  const publicInput: MessageContextInput = {
    personName: 'Dayana',
    relationship: 'friend',
    categoryLabel: 'círculo cercano',
    reason: 'Hace tiempo que no hablan',
    kindLabel: 'retomar contacto',
    daysSinceContact: 30,
    location: 'Lima',
    notes: 'Le gusta el café de especialidad.', // people.notes (público)
  }

  it('el payload que va a la IA no contiene las notas privadas', () => {
    const sensitive: PersonSensitiveData = {
      documentoTipo: 'DNI',
      documentoNumero: '12345678',
      privateNotes: SENTINEL,
    }
    // El route NO pasa los datos sensibles al builder; los dejamos a la vista
    // para documentar que viven en un objeto APARTE del contexto de IA.
    expect(sensitive.privateNotes).toBe(SENTINEL)

    const payload = buildMessageContext(publicInput)
    expect(payload).not.toContain(SENTINEL)
    expect(payload).not.toMatch(/nota[s]?\s+privada/i)
    // Sanity: el contexto público sí incluye las notas públicas.
    expect(payload).toContain('café de especialidad')
  })

  it('aunque se cuele la key privateNotes en el input, el serializador la ignora', () => {
    // Defensa en profundidad: si alguien spread-ea el DTO sensible dentro del
    // input (bug futuro), buildMessageContext solo lee claves conocidas y nunca
    // emite las notas privadas.
    const contaminated = { ...publicInput, privateNotes: SENTINEL } as MessageContextInput
    const payload = buildMessageContext(contaminated)
    expect(payload).not.toContain(SENTINEL)
  })
})
