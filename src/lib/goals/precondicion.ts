// SIR V2 — ¿este paso se puede hacer HOY, o hay algo antes que no pasó?
//
// ═══ EL BUG QUE CIERRA ═══════════════════════════════════════════════════════
//
// Dos veces en dos días SIR le avisó a Aaron de un cobro que no existía:
//
//   · 29-jul — "factura los S/1,500". Salía de un paso de "Cerrar Boticas Jhodaal";
//     el objetivo estaba pausado y el contrato nunca se firmó. Aaron: *"ni siquiera
//     sé de qué o por qué o a quién, y pregunto y no tengo respuesta"*.
//   · 30-jul — "facturar y cobrar el primer mes de consultoría" (vencía 31-jul). En
//     el MISMO objetivo, "Cerrar el primer contrato de consultoría" vencía el 8-jul
//     y seguía pendiente, y "Enviar propuesta a 5 leads" el 24-jun, también
//     pendiente. Los 3 deals reales estaban en 'lead'/'relevamiento'. No había nada
//     vendido que facturar. Esta vez el aviso lo di yo, a mano, leyendo la fecha sin
//     mirar la cadena — y Aaron lo cazó: *"estamos cayendo en el mismo error"*.
//
// #1019/#1020 arreglaron una parte (nombrar el objetivo, excluir los pausados,
// existir el estado 'descartado'). Faltaba esta: **un paso con fecha se anuncia como
// "vence hoy" sin mirar si lo que va antes ya pasó.**
//
// ═══ POR QUÉ NO SE INVENTAN DEPENDENCIAS ═════════════════════════════════════
//
// `objective_steps.blocked_by` existe desde el día uno y está poblada en **0 de
// 151** pasos, así que no hay grafo que consultar. El reflejo sería derivarlo de
// `sort_order` ("el anterior bloquea al siguiente"), y **medido, eso taparía
// pendientes reales**: en el key result "Visa y viaje" del Mundial el orden 1 vence
// el 30-sep y el orden 2 el 15-sep — las fechas NO son monótonas con el orden,
// porque el orden es la secuencia con la que se escribió el plan, no el calendario.
// Con esa regla, "comprar el pasaje" quedaría tapado por "tramitar la visa", que va
// después en el tiempo. Un aviso que se calla de más es peor que uno de más: el de
// más se descarta leyéndolo, el de menos no se ve nunca.
//
// LA REGLA, entonces, es más chica y más segura: un paso anterior **meramente
// pendiente** no prueba nada; un paso anterior **VENCIDO** sí prueba que el plan
// está atrasado ahí. Solo eso traba.
//
// Y no se trata de esconder: se trata de decir la verdad. Si "facturar" vence hoy
// pero "cerrar el contrato" venció hace tres semanas, lo útil no es callar
// "facturar" — es decir dónde está trabado de verdad.
//
// ═══ LO QUE ESTA REGLA NO ES ═════════════════════════════════════════════════
//
// `trabadoPor` señala **el paso abierto más viejo que va antes en la secuencia**, no
// la dependencia semántica. Verificado con la cadena real de ingresos: para
// "facturar el primer mes" nombra "Publicar perfil actualizado en LinkedIn"
// (vencía 10-jun) y no "Cerrar el primer contrato" (8-jul), porque el plan se
// escribió con LinkedIn primero. La afirmación sigue siendo VERDADERA —el plan está
// parado desde el 10-jun— y la copy lo dice así ("antes está pendiente X, el plan
// está trabado ahí"), sin afirmar causalidad. Pero conviene no leerlo como "X causa
// Y": para eso hace falta poblar `blocked_by`, que es justamente lo que esta regla
// permite postergar sin quedarse sin protección.
//
// Medido sobre la data viva de Aaron: **12 de 76 pasos de objetivos activos quedan
// trabados (16%)**. Es la proporción que se buscaba — si tapara la mayoría, la regla
// estaría mal y habría que sospechar de ella, no de los datos.
//
// PURO: cero red, cero DB, cero IA. El "hoy" se inyecta.

/** Lo mínimo que se necesita de un paso para juzgarlo. */
export interface PasoPlan {
  id: string
  /** Objetivo al que pertenece. */
  objectiveId?: string | null
  /** Key result padre, si lo tiene (117 de 151 lo tienen). */
  parentId?: string | null
  title: string
  /** 'pendiente' | 'hecho' | 'descartado' | … */
  status?: string | null
  /** 'YYYY-MM-DD'. */
  targetDate?: string | null
  /** Secuencia con la que se escribió el plan. NO es el calendario. */
  sortOrder?: number | null
  /**
   * Dependencias DECLARADAS. Gana sobre todo lo demás cuando existe — es la
   * intención explícita de quien armó el plan. Acepta id suelto o lista, porque la
   * columna es libre y hoy está vacía: cuando se empiece a llenar, cualquiera de
   * las dos formas tiene que funcionar.
   */
  blockedBy?: string | string[] | null
}

export type MotivoTrabado = 'declarado' | 'anterior_vencido'

export interface Veredicto {
  id: string
  /** false = hay algo antes sin hacer; anunciarlo como "vence hoy" sería mentir. */
  accionable: boolean
  /** Qué lo traba. Es lo que hay que MOSTRAR en vez del paso trabado. */
  trabadoPor?: { id: string; title: string; targetDate: string | null }
  motivo?: MotivoTrabado
}

/** Estados que sacan a un paso del plan: no traban ni se traban. */
const CERRADOS = new Set(['hecho', 'descartado', 'done', 'completed'])

const estaAbierto = (s: PasoPlan) => !CERRADOS.has(String(s.status ?? 'pendiente'))

function comoLista(v: PasoPlan['blockedBy']): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x !== '')
  return typeof v === 'string' && v ? [v] : []
}

/** Clave del grupo al que pertenece un paso: su key result, o el objetivo si no tiene. */
function grupoDe(s: PasoPlan): string {
  return s.parentId ? `p:${s.parentId}` : `o:${s.objectiveId ?? 'sin-objetivo'}`
}

/**
 * Juzga TODOS los pasos de una vez. PURA.
 *
 * Se evalúa el conjunto completo y no paso por paso porque para saber si algo está
 * trabado hay que ver a sus hermanos — y pedirle al llamador que agrupe sería
 * pedirle que reimplemente la regla.
 */
export function evaluarPrecondiciones(pasos: PasoPlan[], hoy: string): Map<string, Veredicto> {
  const out = new Map<string, Veredicto>()
  const lista = (pasos ?? []).filter((s) => s && typeof s.id === 'string')
  if (lista.length === 0) return out

  const porId = new Map(lista.map((s) => [s.id, s]))
  const grupos = new Map<string, PasoPlan[]>()
  for (const s of lista) {
    const k = grupoDe(s)
    const g = grupos.get(k)
    if (g) g.push(s)
    else grupos.set(k, [s])
  }

  for (const s of lista) {
    // 1. DECLARADO. Gana sobre la heurística: si alguien se tomó el trabajo de
    //    decir "esto depende de aquello", eso vale más que cualquier inferencia.
    const declarados = comoLista(s.blockedBy)
      .map((id) => porId.get(id))
      .filter((d): d is PasoPlan => !!d && estaAbierto(d))
    if (declarados.length > 0) {
      const d = declarados[0]
      out.set(s.id, {
        id: s.id, accionable: false, motivo: 'declarado',
        trabadoPor: { id: d.id, title: d.title, targetDate: d.targetDate ?? null },
      })
      continue
    }

    // 2. ANTERIOR VENCIDO. Solo dentro del mismo grupo, solo si el anterior está
    //    ABIERTO y su fecha ya pasó. Un anterior pendiente pero futuro NO traba:
    //    las fechas no son monótonas con el orden y taparía pendientes reales.
    const orden = s.sortOrder ?? Number.MAX_SAFE_INTEGER
    const hermanos = grupos.get(grupoDe(s)) ?? []
    const trabas = hermanos.filter((h) => {
      if (h.id === s.id || !estaAbierto(h)) return false
      const ho = h.sortOrder ?? Number.MAX_SAFE_INTEGER
      if (ho >= orden) return false // no va antes en la secuencia
      return !!h.targetDate && h.targetDate < hoy // y está vencido
    })
    if (trabas.length > 0) {
      // El más viejo: es donde el plan se detuvo de verdad.
      const t = trabas.sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''))[0]
      out.set(s.id, {
        id: s.id, accionable: false, motivo: 'anterior_vencido',
        trabadoPor: { id: t.id, title: t.title, targetDate: t.targetDate ?? null },
      })
      continue
    }

    out.set(s.id, { id: s.id, accionable: true })
  }
  return out
}

/**
 * La línea honesta para un paso trabado. PURA.
 *
 * NO se calla el paso: se dice dónde está trabado. Aaron ya se quejó de avisos
 * huérfanos ("no sé de qué ni a quién"), así que un pendiente que desaparece sin
 * explicación es el mismo problema con otra cara.
 */
export function lineaTrabada(titulo: string, v: Veredicto): string | null {
  if (v.accionable || !v.trabadoPor) return null
  const t = v.trabadoPor
  const cuando = t.targetDate ? ` (vencía el ${t.targetDate})` : ''
  return `"${titulo}" figura para hoy, pero antes está pendiente "${t.title}"${cuando} — el plan está trabado ahí, no acá.`
}
