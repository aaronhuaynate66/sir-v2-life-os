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

  // ─── Fase 2b ────────────────────────────────────────────────────────
  describe('fase 2b — crear_objetivo', () => {
    it('parsea objetivo nuevo con KRs y WOOP', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'crear_objetivo',
          titulo: 'Ganar el Mundial de Bomberos',
          porQue: 'Marcar mi camino profesional',
          prioridad: 'critical',
          categoria: 'career',
          targetDate: '2026-11-13',
          krs: ['Clasificar por FEDEPOL', 'Peso competitivo 80kg', 'Aprobar examen medico'],
          obstaculo: 'Que la mama insista en que no vaya',
          siEntonces: 'Si insiste, cambio de tema y sigo con el plan',
        }],
      }))
      const a = byType(p.actions, 'crear_objetivo')[0] as {
        titulo: string; prioridad: string | null; categoria: string | null;
        targetDate: string | null; krs: string[] | null; obstaculo: string | null; siEntonces: string | null;
      }
      expect(a.titulo).toBe('Ganar el Mundial de Bomberos')
      expect(a.prioridad).toBe('critical')
      expect(a.categoria).toBe('career')
      expect(a.targetDate).toBe('2026-11-13')
      expect(a.krs).toHaveLength(3)
      expect(a.obstaculo).toContain('mama')
      expect(a.siEntonces).toContain('cambio de tema')
    })

    it('prioridad inválida → null; categoria inválida → null', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'crear_objetivo', titulo: 'X', prioridad: 'urgente', categoria: 'random' }],
      }))
      const a = p.actions[0] as { prioridad: string | null; categoria: string | null }
      expect(a.prioridad).toBeNull()
      expect(a.categoria).toBeNull()
    })

    it('trunca KRs al máximo (6)', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'crear_objetivo',
          titulo: 'X',
          krs: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        }],
      }))
      const a = p.actions[0] as { krs: string[] | null }
      expect(a.krs).toHaveLength(6)
    })

    it('falta titulo → descartada', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'crear_objetivo', prioridad: 'high' }],
      }))
      expect(p.actions).toHaveLength(0)
    })

    it('captura target + baseline SMART + esAncla', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'crear_objetivo',
          titulo: 'S/15k mensuales sostenidos',
          categoria: 'financial',
          target: 'S/15k/mes ingresos',
          baseline: 'S/8k/mes',
          esAncla: true,
        }],
      }))
      const a = p.actions[0] as { target: string | null; baseline: string | null; esAncla: boolean | null }
      expect(a.target).toBe('S/15k/mes ingresos')
      expect(a.baseline).toBe('S/8k/mes')
      expect(a.esAncla).toBe(true)
    })

    it('esAncla no-boolean → null (no rompe la accion)', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'crear_objetivo', titulo: 'X', esAncla: 'si claro' }],
      }))
      const a = p.actions[0] as { esAncla: boolean | null; titulo: string }
      expect(a.titulo).toBe('X')
      expect(a.esAncla).toBeNull()
    })

    it('captura WOOP split: planSi + planEntonces separados', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'crear_objetivo',
          titulo: 'X',
          obstaculo: 'Rodillas duelen',
          planSi: 'me duelen 3 dias seguidos',
          planEntonces: 'cambio a bici y no paro',
        }],
      }))
      const a = p.actions[0] as { planSi: string | null; planEntonces: string | null; siEntonces: string | null }
      expect(a.planSi).toBe('me duelen 3 dias seguidos')
      expect(a.planEntonces).toBe('cambio a bici y no paro')
      expect(a.siEntonces).toBeNull()  // no vino, no se inventa
    })

    it('mantiene retrocompat: siEntonces solo se preserva sin split', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'crear_objetivo', titulo: 'X', siEntonces: 'Si pasa X, hago Y' }],
      }))
      const a = p.actions[0] as { planSi: string | null; planEntonces: string | null; siEntonces: string | null }
      expect(a.planSi).toBeNull()
      expect(a.planEntonces).toBeNull()
      expect(a.siEntonces).toBe('Si pasa X, hago Y')
    })

    it('si vienen ambos formatos, ambos se conservan (el ejecutor prefiere el split)', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'crear_objetivo',
          titulo: 'X',
          planSi: 'A',
          planEntonces: 'B',
          siEntonces: 'legacy completo',
        }],
      }))
      const a = p.actions[0] as { planSi: string | null; planEntonces: string | null; siEntonces: string | null }
      expect(a.planSi).toBe('A')
      expect(a.planEntonces).toBe('B')
      expect(a.siEntonces).toBe('legacy completo')
    })
  })

  describe('fase 2b — editar_objetivo · WOOP split', () => {
    it('acepta planSi + planEntonces separados en editar', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'editar_objetivo',
          objetivo: 'Mudarme con mi perro',
          planSi: 'llega 4-ago sin check-in cara a cara',
          planEntonces: 'fijo hora en el calendario dentro de 48 h',
        }],
      }))
      const a = p.actions[0] as { planSi: string | null; planEntonces: string | null }
      expect(a.planSi).toBe('llega 4-ago sin check-in cara a cara')
      expect(a.planEntonces).toBe('fijo hora en el calendario dentro de 48 h')
    })
  })

  describe('fase 2b — editar_objetivo', () => {
    it('parsea edición parcial con WOOP + esAncla + krs', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'editar_objetivo',
          objetivo: 'Mudarme con mi perro',
          prioridad: 'low',
          esAncla: false,
          obstaculo: 'Que "veamos como va" se estire seis meses',
          siEntonces: 'Si el 4-ago no hubo check-in, esa noche fijo hora',
          krs: ['Mudanza 04-jul con Logan', 'Acuerdo escrito con Marita', 'Primer pago S/1000', 'Check-in mes 1'],
        }],
      }))
      const a = byType(p.actions, 'editar_objetivo')[0] as {
        objetivo: string; prioridad: string | null; esAncla: boolean | null;
        obstaculo: string | null; siEntonces: string | null; krs: string[] | null;
      }
      expect(a.objetivo).toBe('Mudarme con mi perro')
      expect(a.prioridad).toBe('low')
      expect(a.esAncla).toBe(false)
      expect(a.krs).toHaveLength(4)
    })

    it('esAncla no-boolean → null', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'editar_objetivo', objetivo: 'X', esAncla: 'si' }],
      }))
      const a = p.actions[0] as { esAncla: boolean | null }
      expect(a.esAncla).toBeNull()
    })

    it('falta objetivo → descartada', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'editar_objetivo', prioridad: 'high' }],
      }))
      expect(p.actions).toHaveLength(0)
    })
  })

  describe('fase 2b — registrar_episodio', () => {
    it('parsea episodio con followUp valido', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{
          type: 'registrar_episodio',
          persona: 'Marita',
          titulo: 'Acuerdo de convivencia',
          detalle: 'Le mando por WhatsApp los terminos: S/1000, reglas, revision mensual',
          followUp: '2026-08-04',
        }],
      }))
      const a = byType(p.actions, 'registrar_episodio')[0] as {
        persona: string; titulo: string; detalle: string | null; followUp: string | null;
      }
      expect(a.persona).toBe('Marita')
      expect(a.titulo).toBe('Acuerdo de convivencia')
      expect(a.followUp).toBe('2026-08-04')
    })

    it('followUp invalido → null', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [{ type: 'registrar_episodio', persona: 'X', titulo: 'Y', followUp: 'la semana que viene' }],
      }))
      const a = p.actions[0] as { followUp: string | null }
      expect(a.followUp).toBeNull()
    })

    it('faltan persona o titulo → descartada', () => {
      const p = parseRouterPlan(JSON.stringify({
        actions: [
          { type: 'registrar_episodio', persona: 'X' },
          { type: 'registrar_episodio', titulo: 'Y' },
        ],
      }))
      expect(p.actions).toHaveLength(0)
    })
  })
})
