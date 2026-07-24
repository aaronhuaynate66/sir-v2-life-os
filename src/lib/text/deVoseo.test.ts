import { describe, it, expect } from 'vitest'
import { deVoseo } from './deVoseo'

describe('deVoseo', () => {
  it('reemplaza conjugaciones voseo comunes', () => {
    expect(deVoseo('si querés te lo agendo')).toBe('si quieres te lo agendo')
    expect(deVoseo('tenés que descansar')).toBe('tienes que descansar')
    expect(deVoseo('podés hacerlo')).toBe('puedes hacerlo')
    expect(deVoseo('¿sabés qué?')).toBe('¿sabes qué?')
  })

  it('reemplaza sos y vos', () => {
    expect(deVoseo('vos sos el que decide')).toBe('tú eres el que decide')
  })

  it('reemplaza imperativos rioplatenses', () => {
    expect(deVoseo('decime cuándo')).toBe('dime cuándo')
    expect(deVoseo('mirá esto y ponete las pilas')).toBe('mira esto y ponte las pilas')
    expect(deVoseo('escribile hoy')).toBe('escríbele hoy')
  })

  it('preserva mayúscula de inicio de frase', () => {
    expect(deVoseo('Querés que te ayude?')).toBe('Quieres que te ayude?')
    expect(deVoseo('Sos capaz.')).toBe('Eres capaz.')
  })

  it('NO toca palabras válidas en Perú (dale, acá, allá) ni parciales', () => {
    expect(deVoseo('dale, nos vemos allá acá cerca')).toBe('dale, nos vemos allá acá cerca')
    // "sos" solo como palabra completa, no dentro de otra
    expect(deVoseo('los sospechosos')).toBe('los sospechosos')
    // "vos" no debe romper "vosotros" ni "nosotros"
    expect(deVoseo('nosotros')).toBe('nosotros')
  })

  it('es idempotente', () => {
    const once = deVoseo('tenés que venir, sos clave')
    expect(deVoseo(once)).toBe(once)
    expect(once).toBe('tienes que venir, eres clave')
  })

  it('texto sin voseo pasa igual', () => {
    const clean = 'Tú puedes hacerlo hoy. Dime si necesitas algo.'
    expect(deVoseo(clean)).toBe(clean)
  })

  it('vacío / no-string seguro', () => {
    expect(deVoseo('')).toBe('')
  })
})
