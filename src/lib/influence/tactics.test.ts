// SIR V2 — Tests del recomendador escenario→táctica (playbook de influencia #3).

import { describe, it, expect } from 'vitest'
import {
  TACTICS, SCENARIOS, TACTICS_SYSTEM_PROMPT,
  tacticsForBond, tacticById, scenarioById, isAffectiveBond,
  buildTacticsUserContent, parseTacticsJson,
} from './tactics'

describe('repertorio de tácticas', () => {
  it('todos los ids son únicos', () => {
    const ids = TACTICS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('cubre los tres frameworks del research', () => {
    const fw = new Set(TACTICS.map((t) => t.framework))
    expect(fw.has('voss')).toBe(true)
    expect(fw.has('cialdini')).toBe(true)
    expect(fw.has('harvard')).toBe(true)
  })
  it('cada táctica trae how/fits/backfires (para el recomendador y la UI)', () => {
    for (const t of TACTICS) {
      expect(t.how.length).toBeGreaterThan(0)
      expect(t.fits.length).toBeGreaterThan(0)
      expect(t.backfires.length).toBeGreaterThan(0)
    }
  })
})

describe('filtro por vínculo — el guardrail afectivo', () => {
  it('vínculo afectivo NO incluye técnicas manipulables (escasez/autoridad/prueba social)', () => {
    const afectivo = tacticsForBond('personal').map((t) => t.id)
    expect(afectivo).not.toContain('social_proof')
    expect(afectivo).not.toContain('authority')
    expect(afectivo).not.toContain('commitment')
    // pero sí las de cuidado
    expect(afectivo).toContain('labeling')
    expect(afectivo).toContain('calibrated_q')
  })
  it('profesional tiene el repertorio completo', () => {
    expect(tacticsForBond(undefined, 'professional').length).toBe(TACTICS.length)
  })
  it('detecta el vínculo afectivo por ámbito y por relación', () => {
    expect(isAffectiveBond('personal')).toBe(true)
    expect(isAffectiveBond(undefined, 'romantic')).toBe(true)
    expect(isAffectiveBond('colega', 'professional')).toBe(false)
  })
})

describe('lookups', () => {
  it('tacticById / scenarioById', () => {
    expect(tacticById('labeling')?.framework).toBe('voss')
    expect(tacticById('no-existe')).toBeUndefined()
    expect(scenarioById(SCENARIOS[0].id)).toBeTruthy()
  })
})

describe('TACTICS_SYSTEM_PROMPT', () => {
  it('prohíbe inventar citas y fabricar presión', () => {
    expect(TACTICS_SYSTEM_PROMPT).toMatch(/PROHIBIDO inventar/i)
    expect(TACTICS_SYSTEM_PROMPT).toMatch(/HONESTA/i)
  })
  it('trae el registro por vínculo', () => {
    expect(TACTICS_SYSTEM_PROMPT).toMatch(/afectiv/i)
    expect(TACTICS_SYSTEM_PROMPT).toMatch(/CUIDADO/i)
  })
})

describe('buildTacticsUserContent', () => {
  const scenario = SCENARIOS[0]
  it('afectivo → marca registro de cuidado y solo ofrece el repertorio afectivo', () => {
    const out = buildTacticsUserContent({
      personName: 'Diana', ambito: 'personal', relationship: 'romantic',
      scenario, memories: [], conversation: 'Diana: ando full esta semana',
    })
    expect(out).toContain('Diana')
    expect(out).toMatch(/CUIDADO/)
    expect(out).toContain('id: labeling')
    expect(out).not.toContain('id: social_proof') // filtrado por vínculo
  })
  it('sin conversación → pide bajar especificidad y no citar', () => {
    const out = buildTacticsUserContent({ personName: 'X', scenario, memories: [] })
    expect(out).toMatch(/no inventes su estilo ni cites frases/i)
  })
  it('incluye la nota puntual de Aaron cuando existe', () => {
    const out = buildTacticsUserContent({ personName: 'X', scenario, memories: [], note: 'me debe una respuesta hace días' })
    expect(out).toContain('me debe una respuesta')
  })
})

describe('parseTacticsJson', () => {
  const full = JSON.stringify({
    style: 'Diana contesta corto y práctica; se cierra si la apuran.',
    picks: [
      { tacticId: 'labeling', why: 'necesita sentirse vista', evidence: 'ando full esta semana', line: 'Parece que la venís pasando full…', caution: 'no si suena a técnica' },
      { tacticId: 'calibrated_q', why: 'le devuelve control', evidence: '', line: '¿Cómo hacemos que entre en tu semana?', caution: 'evita el por qué' },
    ],
    avoid: 'presionar con un sí ya',
  })
  it('parsea una recomendación completa', () => {
    const r = parseTacticsJson(full)
    expect(r?.picks).toHaveLength(2)
    expect(r?.picks[0].tacticId).toBe('labeling')
    expect(r?.picks[0].evidence).toBe('ando full esta semana')
    expect(r?.avoid).toContain('presionar')
  })
  it('descarta picks con id fuera del repertorio', () => {
    const r = parseTacticsJson('{"style":"x","picks":[{"tacticId":"inventada","why":"a","line":"b"},{"tacticId":"mirroring","why":"c","line":"d"}]}')
    expect(r?.picks).toHaveLength(1)
    expect(r?.picks[0].tacticId).toBe('mirroring')
  })
  it('tolera fences', () => {
    const r = parseTacticsJson('```json\n' + full + '\n```')
    expect(r?.style).toContain('Diana')
  })
  it('null si no queda ningún pick válido', () => {
    expect(parseTacticsJson('{"style":"x","picks":[{"tacticId":"inventada","why":"a"}]}')).toBeNull()
  })
  it('null si no parsea', () => {
    expect(parseTacticsJson('nope')).toBeNull()
  })
})
