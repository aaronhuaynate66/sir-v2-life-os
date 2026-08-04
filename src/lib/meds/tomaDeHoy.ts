// SIR V2 — "¿Qué tomo AHORA y por qué?" — la lógica. PURO: cero red, cero DOM.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 4-ago-2026, después de entrar a `/salud` en producción: *"ha quedado
// horroroso, cero UX UI y orden, no se entiende para nada lo que tomo ni para qué
// ni por qué"*.
//
// Y la data estaba completa. Lo auditado ese día:
//
// · La HORA de la toma (`schedule`, "22:00") existe en la tabla desde #1087 y el
//   endpoint **nunca la seleccionaba**, así que la pantalla solo podía decir "cada
//   24 h". A las 21:55 no había una sola hora de reloj en pantalla.
// · El `diagnosis` ("G43.0 — Migraña sin aura") llegaba al navegador y no se pintaba.
// · Las recetas se ordenaban solo por fecha de inicio: una suspendida podía salir
//   antes que una activa, en una lista plana.
// · Los avisos de cruce entre medicamentos vivían como prosa de 11 px dentro de UNA
//   tarjeta — y el medicamento con el que chocan está en OTRA receta.
//
// ═══ LA DECISIÓN DE FONDO: AGRUPAR POR HORA, NO POR RECETA ══════════════════
//
// Su esquema real tiene 4 medicamentos a las 22:00 que vienen de TRES recetas
// distintas (topiramato del neurólogo, orfenadrina y etoricoxib del maxilofacial,
// clonazepam nocturno). Agrupado por receta, que los cuatro coincidan a la misma
// hora **no se ve en ninguna parte** — y esa coincidencia es justamente la pregunta
// que él hace a las 21:55.

export interface ItemDeToma {
  itemId: string
  medName: string
  dose: string | null
  /** Horas objetivo 'HH:MM'. Vacío = a demanda o sin hora declarada. */
  schedule: string[]
  indication: string | null
  /** Cuántas faltan hoy. null en cursos crónicos sin duración (no acumulan deuda). */
  pendientesHoy: number | null
  tomadasHoy: number
  terminado: boolean
  /** De qué receta viene, para poder decir el POR QUÉ. */
  reason: string | null
  diagnosis: string | null
  status: string
}

/** Un aviso de cruce, ya extraído de la nota de una receta. */
export interface AvisoDeCruce {
  receta: string | null
  texto: string
}

export interface BloqueDeToma {
  hora: string
  meds: ItemDeToma[]
  pasada: boolean
  proxima: boolean
}

/** Minutos desde medianoche de 'HH:MM'. -1 si no parsea. PURA. */
export function minutosDeHora(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec((hhmm ?? '').trim())
  if (!m) return -1
  const h = Number(m[1]); const mi = Number(m[2])
  if (h > 23 || mi > 59) return -1
  return h * 60 + mi
}

/**
 * Los bloques de toma del día, ordenados por hora, con el más próximo marcado.
 * PURA — el "ahora" se inyecta.
 *
 * "Próxima" = la primera cuya hora aún no pasó. Si ya pasaron todas, NINGUNA se
 * marca como próxima: a las 23:30 decirle "la próxima: 22:00" sería mentirle sobre
 * el día.
 *
 * Solo entra lo ACTIVO y no terminado: el histórico se lee en el detalle, no en la
 * pregunta de qué tomar ahora.
 */
export function bloquesDeToma(items: readonly ItemDeToma[], ahora: string): BloqueDeToma[] {
  const ahoraMin = minutosDeHora(ahora)
  const porHora = new Map<string, ItemDeToma[]>()
  for (const it of items ?? []) {
    if (!it || it.terminado || it.status !== 'activa') continue
    for (const h of it.schedule ?? []) {
      if (minutosDeHora(h) < 0) continue
      const arr = porHora.get(h) ?? []
      arr.push(it)
      porHora.set(h, arr)
    }
  }
  const horas = [...porHora.keys()].sort((a, b) => minutosDeHora(a) - minutosDeHora(b))
  // Si `ahora` no parsea, no se marca ninguna como próxima ni como pasada: es mejor
  // no afirmar nada que afirmar la hora equivocada.
  const primeraPendiente = ahoraMin < 0 ? undefined : horas.find((h) => minutosDeHora(h) >= ahoraMin)
  return horas.map((hora) => ({
    hora,
    meds: porHora.get(hora) ?? [],
    pasada: ahoraMin >= 0 && minutosDeHora(hora) < ahoraMin,
    proxima: hora === primeraPendiente,
  }))
}

/** Los que no tienen hora: a demanda. Aparte, para no fingirles un horario. PURA. */
export function aDemanda(items: readonly ItemDeToma[]): ItemDeToma[] {
  return (items ?? []).filter(
    (i) => i && i.status === 'activa' && !i.terminado && (i.schedule ?? []).length === 0,
  )
}

/** El "por qué" más corto que sea verdad: el diagnóstico si existe, si no el motivo. PURA. */
export function porQueLoTomo(i: ItemDeToma, max = 90): string | null {
  const d = (i?.diagnosis ?? '').trim()
  if (d) return d.length > max ? `${d.slice(0, max - 3)}…` : d
  const r = (i?.reason ?? '').trim()
  if (!r) return null
  return r.length > max ? `${r.slice(0, max - 3)}…` : r
}

/** ¿Falta la toma de hoy de este ítem? PURA.
 *  `pendientesHoy === null` = curso crónico sin duración: no acumula deuda, solo se
 *  mira si hoy ya se registró. */
export function faltaHoy(i: ItemDeToma): boolean {
  return i.pendientesHoy === null ? i.tomadasHoy === 0 : i.pendientesHoy > 0
}
