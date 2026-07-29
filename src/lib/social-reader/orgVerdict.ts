// SIR V2 — ¿esta cuenta de IG es una organización o una persona?
//
// Junta en UN veredicto las señales que estaban sueltas y sin usar:
//
//   1. El PERFIL declarado por Instagram (looksLikeOrg): cuenta profesional con
//      rubro, o volumen de seguidores. Es lo más fuerte porque es un HECHO que
//      declara la plataforma, no una conjetura sobre el texto del handle.
//   2. El NOMBRE, cuando Aaron lo escribió (classifyEntity).
//   3. El HANDLE, con el léxico unificado (orgLexicon).
//
// POR QUÉ ASÍ (29-jul-2026): `looksLikeOrg` estaba escrita y testeada desde el
// 28-jul y NADIE la llamaba — quedó a medias dos veces. Y su tabla de entrada
// (`social_profiles`) está vacía hasta que el reader vuelva a correr, así que
// activarla sola no clasificaba nada. De ahí que el veredicto tenga que poder
// decidir con lo que HAY hoy (el handle) y mejorar solo cuando llegue el perfil.
//
// El veredicto es una PROPUESTA, nunca una escritura: lo confirma Aaron. Por eso
// se prefiere recall sobre precisión en el nivel 'media' — una propuesta de más le
// cuesta un tap, una organización creada como contacto le ensucia el grafo.
//
// PURO.

import { classifyEntity } from './entityKind'
import { looksLikeOrg, type ReaderProfile } from './igProfile'
import { pistaDebilEnHandle, pistaFuerteEnHandle } from './orgLexicon'

export type OrgKind = 'org' | 'person' | 'unknown'
export type Confianza = 'alta' | 'media'

export interface OrgVerdict {
  kind: OrgKind
  /** 'alta' se puede proponer en lote; 'media' se pregunta de a una. */
  confianza: Confianza
  /** Por qué, en palabras que Aaron pueda contradecir. */
  razon: string
}

export interface CuentaAClasificar {
  handle: string
  /** Nombre que Aaron ya escribió, si lo hay. */
  name?: string | null
  /** Nota suya sobre la cuenta, si la hay. */
  note?: string | null
  /** Perfil capturado por el reader, si ya llegó. */
  perfil?: ReaderProfile | null
}

export function clasificarCuenta(c: CuentaAClasificar): OrgVerdict {
  // ── 1. El perfil declarado manda ────────────────────────────────────────────
  // Es un hecho de la plataforma: "cuenta profesional, rubro Restaurante" no se
  // discute con una heurística de subcadenas.
  if (c.perfil) {
    const porPerfil = looksLikeOrg(c.perfil)
    if (porPerfil === true) {
      const rubro = c.perfil.category
      const segs = c.perfil.followersCount
      const razon = rubro
        ? `Instagram la declara cuenta profesional de "${rubro}"`
        : segs !== null
          ? `tiene ${segs.toLocaleString('es-PE')} seguidores`
          : 'Instagram la declara cuenta profesional'
      return { kind: 'org', confianza: 'alta', razon }
    }
    if (porPerfil === false) {
      return { kind: 'person', confianza: 'alta', razon: 'cuenta personal chica, sin rubro declarado' }
    }
  }

  // ── 2. El nombre que él escribió ────────────────────────────────────────────
  const nombre = (c.name ?? '').trim()
  if (nombre) {
    const v = classifyEntity(nombre, c.handle, c.note ?? '')
    if (v.kind === 'org') return { kind: 'org', confianza: 'alta', razon: v.reason }
    if (v.kind === 'person') return { kind: 'person', confianza: 'alta', razon: v.reason }
    // 'invalid' (cortado, "Si", demasiado corto) no dice nada del tipo de cuenta:
    // se sigue al handle en vez de devolver un veredicto basado en basura.
  }

  // ── 3. El handle, que es lo único que hay para las 103 de la bandeja ────────
  const fuerte = pistaFuerteEnHandle(c.handle)
  if (fuerte) return { kind: 'org', confianza: 'alta', razon: `el handle dice "${fuerte}"` }

  const debil = pistaDebilEnHandle(c.handle)
  if (debil) {
    return {
      kind: 'unknown', confianza: 'media',
      razon: `el handle dice "${debil}", que usan tanto empresas como cuentas oficiales de personas`,
    }
  }

  return { kind: 'unknown', confianza: 'media', razon: 'el handle no dice nada concluyente' }
}

/**
 * Reparte un lote de cuentas en los tres montones que necesita el flujo de
 * Telegram: las que se pueden proponer juntas, y las que hay que preguntar de a
 * una. Estable (respeta el orden de entrada) para que la numeración que ve Aaron
 * no cambie entre el mensaje y su respuesta.
 */
export function repartirLote<T extends CuentaAClasificar>(cuentas: T[]): {
  orgs: Array<T & { veredicto: OrgVerdict }>
  personas: Array<T & { veredicto: OrgVerdict }>
  dudosas: Array<T & { veredicto: OrgVerdict }>
} {
  const orgs = [], personas = [], dudosas = []
  for (const c of cuentas) {
    const veredicto = clasificarCuenta(c)
    const fila = { ...c, veredicto }
    if (veredicto.kind === 'org' && veredicto.confianza === 'alta') orgs.push(fila)
    else if (veredicto.kind === 'person' && veredicto.confianza === 'alta') personas.push(fila)
    else dudosas.push(fila)
  }
  return { orgs, personas, dudosas }
}
