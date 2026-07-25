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

  it('reemplaza más presentes -és/-ás (debés y cía.)', () => {
    expect(deVoseo('debés descansar')).toBe('debes descansar')
    expect(deVoseo('necesitás enfocarte y elegís uno')).toBe('necesitas enfocarte y eliges uno')
    expect(deVoseo('¿qué pensás?')).toBe('¿qué piensas?')
    expect(deVoseo('¿a qué te referís?')).toBe('¿a qué te refieres?')
    expect(deVoseo('si me sugerís algo y lo repetís')).toBe('si me sugieres algo y lo repites')
    // NO toca el nombre propio "Tomás" (no está en la lista a propósito)
    expect(deVoseo('habla con Tomás mañana')).toBe('habla con Tomás mañana')
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

  it('barrido generativo: caza la cola larga de imperativos/presentes regulares', () => {
    // Deslices REALES de SIR (25-jul) que la lista blanca no cubría.
    expect(deVoseo('revisá tus apuntes de préstamos')).toBe('revisa tus apuntes de préstamos')
    expect(deVoseo('¿recordás cuándo fue?')).toBe('¿recuerdas cuándo fue?')
    expect(deVoseo('agendá el examen y avisá a tu mamá')).toBe('agenda el examen y avisa a tu mamá')
    expect(deVoseo('si lo revisás hoy, lo cierras')).toBe('si lo revisas hoy, lo cierras')
    expect(deVoseo('Cuidá esa relación')).toBe('Cuida esa relación')
  })

  it('barrido generativo: irregulares que diptongan NO quedan a medias', () => {
    expect(deVoseo('contás con eso')).toBe('cuentas con eso')
    expect(deVoseo('si te acordás, me dices')).toBe('si te acuerdas, me dices')
    expect(deVoseo('encontrás el mensaje ahí')).toBe('encuentras el mensaje ahí')
  })

  it('barrido generativo: NO toca futuros, deícticos ni nombres propios', () => {
    const safe = [
      'ella te pagará mañana y verás que sí',
      'el examen será el 7 y tendrás tiempo',
      'está acá, allá con mamá y papá',
      'estás en el sofá, quizás demás, jamás atrás',
      'ojalá que sí, además el compás',
      'habla con Nicolás en Bogotá y Panamá',
      'lo dejará listo y te lo mandará',
    ]
    for (const s of safe) expect(deVoseo(s)).toBe(s)
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
