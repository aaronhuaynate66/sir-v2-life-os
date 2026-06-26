import { describe, it, expect } from 'vitest'
import { parseRouterPlan, type RouterAction } from './plan'

const byType = (as: RouterAction[], t: string) => as.filter((a) => a.type === t)

describe('parseRouterPlan', () => {
  it('descompone el relato del Mundial en varias acciones tipadas', () => {
    const json = JSON.stringify({
      actions: [
        { type: 'registrar_interaccion', persona: 'Delicia', calidad: 5, nota: 'Me apoya con el Mundial' },
        { type: 'crear_persona', nombre: 'Shian Navarro', relacion: 'professional', cargo: 'presidente de la FEDEPOL', organizacion: 'FEDEPOL' },
        { type: 'crear_organizacion', nombre: 'FEDEPOL', rubro: 'federación deportiva' },
        { type: 'agregar_paso_objetivo', objetivo: 'Ganar el Mundial de Bomberos', paso: 'FEDEPOL confirma que cubre el pasaje' },
        { type: 'agregar_bloqueo_objetivo', objetivo: 'Ganar el Mundial de Bomberos', bloqueo: 'Examen medico en el IPD', due: '2026-07-06' },
      ],
      unmapped: [],
    })
    const p = parseRouterPlan(json)
    expect(p.actions).toHaveLength(5)
    expect(byType(p.actions, 'crear_persona')[0]).toMatchObject({ cargo: 'presidente de la FEDEPOL', organizacion: 'FEDEPOL', relacion: 'professional' })
    expect(byType(p.actions, 'agregar_bloqueo_objetivo')[0]).toMatchObject({ due: '2026-07-06' })
  })
  it('relacion inválida → null; calidad fuera de rango se clampa', () => {
    const p = parseRouterPlan(JSON.stringify({ actions: [
      { type: 'crear_persona', nombre: 'X', relacion: 'jefe' },
      { type: 'registrar_interaccion', persona: 'Y', calidad: 9, nota: '' },
    ] }))
    expect(byType(p.actions, 'crear_persona')[0]).toMatchObject({ relacion: null })
    expect((byType(p.actions, 'registrar_interaccion')[0] as { calidad: number }).calidad).toBe(5)
  })
  it('due inválido → null', () => {
    const p = parseRouterPlan(JSON.stringify({ actions: [{ type: 'agregar_bloqueo_objetivo', objetivo: 'O', bloqueo: 'B', due: 'julio' }] }))
    expect((p.actions[0] as { due: string | null }).due).toBeNull()
  })
  it('descarta acciones sin campos obligatorios y tipos desconocidos', () => {
    const p = parseRouterPlan(JSON.stringify({ actions: [
      { type: 'crear_persona' },
      { type: 'agregar_paso_objetivo', objetivo: 'O' },
      { type: 'magia', nombre: 'z' },
      { type: 'crear_organizacion', nombre: 'FEDEPOL' },
    ] }))
    expect(p.actions).toHaveLength(1)
    expect(p.actions[0].type).toBe('crear_organizacion')
  })
  it('extrae JSON con texto alrededor + recoge unmapped', () => {
    const p = parseRouterPlan('Claro:\n{"actions":[],"unmapped":["la plata que te debe Diana"]}\nlisto')
    expect(p.unmapped).toEqual(['la plata que te debe Diana'])
  })
  it('texto no-JSON → plan vacío', () => {
    expect(parseRouterPlan('no hay json')).toEqual({ actions: [], unmapped: [] })
  })
})
