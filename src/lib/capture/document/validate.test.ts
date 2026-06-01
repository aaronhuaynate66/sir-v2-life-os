import { describe, it, expect } from 'vitest'

import { isValidDocumentRaw, sanitizeDocumentExtracted } from './validate'

describe('isValidDocumentRaw', () => {
  it('acepta el shape correcto (4 keys, string|null)', () => {
    expect(isValidDocumentRaw({
      documento_tipo: 'DNI', documento_numero: '12345678',
      pasaporte_numero: null, pasaporte_vencimiento: null,
    })).toBe(true)
  })
  it('rechaza si falta una key o no es string|null', () => {
    expect(isValidDocumentRaw({ documento_tipo: 'DNI' })).toBe(false)
    expect(isValidDocumentRaw({
      documento_tipo: 123, documento_numero: '1', pasaporte_numero: null, pasaporte_vencimiento: null,
    })).toBe(false)
    expect(isValidDocumentRaw(null)).toBe(false)
    expect(isValidDocumentRaw('x')).toBe(false)
  })
})

describe('sanitizeDocumentExtracted', () => {
  it('DNI: mapea snake->camel y conserva número', () => {
    const out = sanitizeDocumentExtracted({
      documento_tipo: 'DNI', documento_numero: '  12345678 ',
      pasaporte_numero: null, pasaporte_vencimiento: null,
    })
    expect(out).toEqual({
      documentoTipo: 'DNI', documentoNumero: '12345678',
      pasaporteNumero: null, pasaporteVencimiento: null,
    })
  })

  it('pasaporte: conserva vencimiento YYYY-MM-DD válido', () => {
    const out = sanitizeDocumentExtracted({
      documento_tipo: 'Pasaporte', documento_numero: null,
      pasaporte_numero: 'P1234567', pasaporte_vencimiento: '2030-05-18',
    })
    expect(out.pasaporteNumero).toBe('P1234567')
    expect(out.pasaporteVencimiento).toBe('2030-05-18')
  })

  it('descarta fecha mal formada o fuera de rango → null', () => {
    expect(sanitizeDocumentExtracted({ pasaporte_vencimiento: '18/05/2030' }).pasaporteVencimiento).toBeNull()
    expect(sanitizeDocumentExtracted({ pasaporte_vencimiento: '2030-13-01' }).pasaporteVencimiento).toBeNull()
    expect(sanitizeDocumentExtracted({ pasaporte_vencimiento: '2030-05-40' }).pasaporteVencimiento).toBeNull()
    expect(sanitizeDocumentExtracted({ pasaporte_vencimiento: '' }).pasaporteVencimiento).toBeNull()
  })

  it('vacíos/no-string → null', () => {
    const out = sanitizeDocumentExtracted({
      documento_tipo: '   ', documento_numero: 42, pasaporte_numero: null, pasaporte_vencimiento: null,
    })
    expect(out).toEqual({
      documentoTipo: null, documentoNumero: null, pasaporteNumero: null, pasaporteVencimiento: null,
    })
  })

  it('tolera objeto vacío / no-objeto', () => {
    expect(sanitizeDocumentExtracted({})).toEqual({
      documentoTipo: null, documentoNumero: null, pasaporteNumero: null, pasaporteVencimiento: null,
    })
    expect(sanitizeDocumentExtracted(null)).toEqual({
      documentoTipo: null, documentoNumero: null, pasaporteNumero: null, pasaporteVencimiento: null,
    })
  })
})
