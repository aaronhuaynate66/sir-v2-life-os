// SIR V2 — Tests de las consultas que no pueden fallar en silencio.
//
// El caso real: `gcal-sync` respondía 200 con `nota: 'sin conexiones de Google'`
// cuando la consulta fallaba — con la cuenta conectada perfectamente. Ese mensaje
// manda a buscar el bug al lugar equivocado.
import { describe, it, expect } from 'vitest'
import { filasOFalla, unaOFalla, filasNoVaciasOFalla } from './consulta'

const ok = <T>(data: T[]) => ({ data, error: null })
const falla = (message: string) => ({ data: null, error: { message } })

describe('la distinción que justifica el módulo', () => {
  it('vacío SIN error es un vacío legítimo: se devuelve tal cual', () => {
    expect(filasOFalla(ok([]), 'recordatorios que vencen')).toEqual([])
  })

  it('vacío CON error LANZA, y el mensaje dice qué se estaba pidiendo', () => {
    expect(() => filasOFalla(falla('column x does not exist'), 'conexiones de Google'))
      .toThrow(/conexiones de Google: column x does not exist/)
  })

  it('las filas pasan intactas', () => {
    expect(filasOFalla(ok([{ id: 1 }, { id: 2 }]), 'personas')).toHaveLength(2)
  })
})

describe('el caso de gcal-sync', () => {
  it('una consulta fallida ya no se lee como "sin conexiones de Google"', () => {
    const res = falla('relation "calendar_connections" does not exist')
    // Antes: uids = [] → 200 "sin conexiones". Ahora revienta y el cron da 500.
    let uids: string[] = []
    let exploto = false
    try {
      uids = filasOFalla<{ user_id: string }>(res, 'conexiones de Google').map((c) => c.user_id)
    } catch { exploto = true }
    expect(exploto).toBe(true)
    expect(uids).toEqual([])
  })

  it('pero cero conexiones DE VERDAD sigue siendo un 200 legítimo', () => {
    expect(filasOFalla(ok([]), 'conexiones de Google')).toEqual([])
  })
})

describe('unaOFalla', () => {
  it('null sin error es un null legítimo', () => {
    expect(unaOFalla({ data: null, error: null }, 'perfil')).toBeNull()
  })

  it('error lanza', () => {
    expect(() => unaOFalla({ data: null, error: { message: 'boom' } }, 'perfil')).toThrow(/perfil: boom/)
  })

  it('devuelve el objeto, no un arreglo', () => {
    expect(unaOFalla({ data: { roles: ['Bombero'] }, error: null }, 'perfil')).toEqual({ roles: ['Bombero'] })
  })
})

describe('filasNoVaciasOFalla: invariantes de este sistema', () => {
  it('cero usuarios NO es posible acá y por eso lanza', () => {
    // SIR es mono-usuario en la práctica: cero perfiles significa consulta rota o
    // env apuntando a otra base, nunca "no había nada que hacer".
    expect(() => filasNoVaciasOFalla(ok([]), 'usuarios con perfil'))
      .toThrow(/cero filas, y acá eso no es posible/)
  })

  it('con filas se comporta igual que filasOFalla', () => {
    expect(filasNoVaciasOFalla(ok([{ user_id: 'u1' }]), 'usuarios')).toHaveLength(1)
  })

  it('el error de la consulta gana sobre el de vacío: dice la causa REAL', () => {
    expect(() => filasNoVaciasOFalla(falla('timeout'), 'usuarios')).toThrow(/usuarios: timeout/)
  })
})

describe('no revienta de la forma equivocada', () => {
  it('una respuesta nula da un error claro, no un TypeError', () => {
    expect(() => filasOFalla(null as unknown as { data: null; error: null }, 'algo'))
      .toThrow(/respuesta vacía del cliente/)
    expect(() => unaOFalla(null as unknown as { data: null; error: null }, 'algo'))
      .toThrow(/respuesta vacía del cliente/)
  })
})
