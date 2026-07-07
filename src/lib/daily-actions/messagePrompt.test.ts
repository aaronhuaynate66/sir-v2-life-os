import { describe, it, expect } from 'vitest'

import { buildMessageContext, parseMessageJson } from './messagePrompt'

describe('parseMessageJson', () => {
  const valid = JSON.stringify({
    action_text: 'Escribile a Ana',
    timing_reason: 'Hace 30 días que no hablan',
    message_suggestion: 'Hola Ana, ¿cómo venís? Hace banda no hablamos, te quería saludar.',
    impact_prediction: 'Mantenés el vínculo activo.',
  })

  it('parsea JSON directo', () => {
    const r = parseMessageJson(valid)
    expect(r?.message_suggestion).toContain('Hola Ana')
  })

  it('parsea JSON dentro de un bloque markdown ```json', () => {
    const r = parseMessageJson('```json\n' + valid + '\n```')
    expect(r?.action_text).toBe('Escribile a Ana')
  })

  it('parsea JSON embebido en prosa', () => {
    const r = parseMessageJson(`Claro, acá tenés: ${valid} ¡Listo!`)
    expect(r?.message_suggestion).toContain('Hola Ana')
  })

  it('devuelve null si no hay message_suggestion', () => {
    expect(parseMessageJson('{"action_text":"x"}')).toBeNull()
    expect(parseMessageJson('no es json')).toBeNull()
  })

  it('trimea los campos', () => {
    const r = parseMessageJson('{"message_suggestion":"  hola  "}')
    expect(r?.message_suggestion).toBe('hola')
  })
})

describe('buildMessageContext', () => {
  it('incluye nombre, vínculo, razón y recencia', () => {
    const ctx = buildMessageContext({
      personName: 'Ana',
      relationship: 'Amigo/a',
      categoryLabel: 'Cercano/a',
      reason: 'Sin hablar hace 30 días',
      kindLabel: 'retomar contacto',
      daysSinceContact: 30,
    })
    expect(ctx).toContain('Persona: Ana')
    expect(ctx).toContain('Sin hablar hace 30 días')
    expect(ctx).toContain('hace 30 días')
  })

  it('marca la fecha de hoy cuando daysUntil=0', () => {
    const ctx = buildMessageContext({
      personName: 'Beto',
      relationship: 'Amigo/a',
      categoryLabel: 'Red',
      reason: 'Cumple hoy',
      kindLabel: 'saludo de cumpleaños',
      daysSinceContact: null,
      daysUntil: 0,
    })
    expect(ctx).toContain('La fecha es HOY')
    expect(ctx).toContain('nunca registrado')
  })

  it('agrega notas y ubicación cuando existen', () => {
    const ctx = buildMessageContext({
      personName: 'Caro',
      relationship: 'Profesional',
      categoryLabel: 'Red',
      reason: 'x',
      kindLabel: 'contacto',
      daysSinceContact: 5,
      location: 'Lima',
      notes: 'Le gusta el café de especialidad',
    })
    expect(ctx).toContain('Ubicación: Lima')
    expect(ctx).toContain('café de especialidad')
  })

  it('suma fortalezas y metas en común como terreno para conectar', () => {
    const ctx = buildMessageContext({
      personName: 'Dina',
      relationship: 'Amigo/a',
      categoryLabel: 'Cercano/a',
      reason: 'x',
      kindLabel: 'contacto',
      daysSinceContact: 10,
      strengths: ['siempre responde rápido', 'muy leal'],
      sharedGoals: ['correr la maratón de Lima'],
    })
    expect(ctx).toContain('Fortalezas del vínculo')
    expect(ctx).toContain('muy leal')
    expect(ctx).toContain('Metas en común')
    expect(ctx).toContain('maratón de Lima')
  })

  it('pasa las tensiones como temas a CUIDAR (no como palanca)', () => {
    const ctx = buildMessageContext({
      personName: 'Eze',
      relationship: 'Amigo/a',
      categoryLabel: 'Red',
      reason: 'x',
      kindLabel: 'contacto',
      daysSinceContact: 3,
      tensions: ['se tensa si hablo de trabajo los findes'],
    })
    expect(ctx).toContain('Temas sensibles a CUIDAR')
    expect(ctx).toContain('no presionar')
    expect(ctx).toContain('trabajo los findes')
  })

  it('omite las líneas de notas relacionales cuando están vacías', () => {
    const ctx = buildMessageContext({
      personName: 'Fer',
      relationship: 'Amigo/a',
      categoryLabel: 'Red',
      reason: 'x',
      kindLabel: 'contacto',
      daysSinceContact: 1,
      strengths: [],
      sharedGoals: null,
      tensions: ['   '],
    })
    expect(ctx).not.toContain('Fortalezas del vínculo')
    expect(ctx).not.toContain('Metas en común')
    expect(ctx).not.toContain('Temas sensibles')
  })
})
