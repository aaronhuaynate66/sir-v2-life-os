import { describe, it, expect } from 'vitest'
import { parseExtraction, foldNotes, metaFromHtml, buildExtractInput } from './extract'

describe('parseExtraction', () => {
  it('parsea JSON limpio', () => {
    const r = parseExtraction('{"description":"Holding familiar.","sectors":["seguridad","construcción"],"notes":"Sede Lima."}')
    expect(r).not.toBeNull()
    expect(r!.description).toBe('Holding familiar.')
    expect(r!.sectors).toEqual(['seguridad', 'construcción'])
    expect(r!.notes).toBe('Sede Lima.')
  })

  it('tolera fences ```json y texto alrededor', () => {
    const r = parseExtraction('Claro:\n```json\n{"description":"X","sectors":[],"notes":""}\n```\n')
    expect(r).not.toBeNull()
    expect(r!.description).toBe('X')
  })

  it('devuelve null si todo viene vacío', () => {
    expect(parseExtraction('{"description":"","sectors":[],"notes":""}')).toBeNull()
  })

  it('devuelve null ante basura no-JSON', () => {
    expect(parseExtraction('no hay json aquí')).toBeNull()
  })
})

describe('foldNotes', () => {
  it('antepone los sectores como línea', () => {
    expect(foldNotes('Sede Lima.', ['seguridad', 'salud'])).toBe('Sectores: seguridad, salud.\nSede Lima.')
  })
  it('sin sectores devuelve las notas tal cual', () => {
    expect(foldNotes('Sede Lima.', [])).toBe('Sede Lima.')
  })
})

describe('metaFromHtml', () => {
  it('saca og:description y og:site_name', () => {
    const html = '<html><head><meta property="og:site_name" content="Grupo HNG"><meta property="og:description" content="Holding familiar peruano."></head></html>'
    const m = metaFromHtml(html, 'https://www.grupohng.com')
    expect(m.description).toBe('Holding familiar peruano.')
    expect(m.name).toBe('Grupo HNG')
    expect(m.website).toBe('https://www.grupohng.com')
  })

  it('cae a meta name=description y <title>, decodifica entidades', () => {
    const html = '<title>Acme &amp; Co</title><meta name="description" content="Construcci&#39;on">'
    const m = metaFromHtml(html)
    expect(m.name).toBe('Acme & Co')
    expect(m.description).toBe("Construcci'on")
  })

  it('tolera content antes del name', () => {
    const html = '<meta content="Desc X" name="description">'
    expect(metaFromHtml(html).description).toBe('Desc X')
  })
})

describe('buildExtractInput', () => {
  it('incluye el label y recorta el texto', () => {
    const s = buildExtractInput({ text: 'hola', label: 'Grupo HNG' })
    expect(s).toContain('Grupo HNG')
    expect(s).toContain('hola')
  })
})
