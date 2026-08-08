// SIR V2 — La última data REAL por canal del reader. UNA sola fuente de verdad.
//
// ═══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
//
// `reader_heartbeats.last_data_at` NO alcanza: la migración 0175 dice que "lo
// actualiza el endpoint de ingesta" y por un tiempo nadie lo escribía, así que
// hay filas viejas en null con datos reales al lado. La verdad de campo está en
// las tablas donde el dato ATERRIZA.
//
// Y hay una trampa específica con Instagram, que ya costó un diagnóstico falso:
// `unmatched_social_activity` es una BANDEJA y sus filas se BORRAN al resolver la
// cuenta. Apoyar la frescura de Instagram solo en ella la hacía depender de que
// quedaran cuentas SIN resolver — y el brief nocturno le pide a Aaron resolver 30
// por noche. O sea: mientras más hacía lo que SIR le pedía, más ciego quedaba el
// detector. `social_profiles` y `social_page_followers` SOBREVIVEN a la
// resolución, así que son la señal honesta.
//
// ═══ Y POR QUÉ ES UN MÓDULO Y NO CÓDIGO EN LA RUTA ══════════════════════════
//
// Esto vivía dentro de `cron/morning-push`. Al construir el panel de estado de
// `/reader` (4-ago-2026) el panel leyó solo `reader_heartbeats` y quedó diciendo
// "Instagram NUNCA trajo nada" mientras el brief decía "hace 4 días que no trae
// nada" — con la misma base de datos, el mismo día. Dos fuentes de verdad para la
// misma pregunta es exactamente el problema que el panel venía a resolver.
//
// Si mañana se agrega una fuente (Teams, LinkedIn), se agrega ACÁ y las dos
// superficies se enteran juntas.

/** Lo mínimo que se necesita de un cliente de Supabase para esto. */
export interface ClienteMinimo {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          order(col: string, o: { ascending: boolean }): { limit(n: number): Promise<{ data: unknown }> }
        }
        not(col: string, op: string, val: null): {
          order(col: string, o: { ascending: boolean }): { limit(n: number): Promise<{ data: unknown }> }
        }
        order(col: string, o: { ascending: boolean }): { limit(n: number): Promise<{ data: unknown }> }
        limit(n: number): Promise<{ data: unknown }>
      }
    }
  }
}

/** De varias fechas, la MÁS RECIENTE. Cada fuente ve un pedazo distinto de lo que
 *  trajo el canal, y quedarse con la más vieja subdiagnosticaría. PURA. */
export function masReciente(...isos: Array<string | null | undefined>): string | null {
  let mejor: string | null = null
  for (const iso of isos) {
    if (!iso) continue
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) continue
    if (mejor === null || t > Date.parse(mejor)) mejor = iso
  }
  return mejor
}

function primero(data: unknown, campo: string): string | null {
  const arr = Array.isArray(data) ? data : []
  const row = arr[0] as Record<string, unknown> | undefined
  const v = row?.[campo]
  return typeof v === 'string' ? v : null
}

/**
 * Última data real por canal, mirando dónde el dato ATERRIZA (no la tabla de
 * latidos). Fail-soft por fuente: si una consulta falla, las otras siguen
 * valiendo — es mejor un diagnóstico con 2 de 3 fuentes que ninguno.
 */
export async function ultimaDataPorCanal(
  db: ClienteMinimo,
  userId: string,
): Promise<Record<string, string | null>> {
  const safe = async (fn: () => Promise<{ data: unknown }>): Promise<unknown> => {
    try { return (await fn()).data } catch { return null }
  }

  // ═══ POR PLATAFORMA, NO "TODO LO DEL READER" ══════════════════════════════
  //
  // Acá había UNA consulta a `chat_messages` con `source='reader'` cuyo resultado
  // se devolvía como la frescura de **whatsapp**. Y `chat_messages` NO tiene columna
  // `platform`: los mensajes que el reader trae de Teams caen en la misma tabla con
  // el mismo `source`. O sea que **Teams hacía parecer vivo a WhatsApp**, y al revés,
  // el silencio de un canal quedaba tapado por el otro.
  //
  // El costo real, medido el 7-ago-2026: Teams dejó de leer el **30-jul** (Aaron
  // cerró la pestaña) y **nadie avisó en 8 días**. Él se enteró solo, y de la peor
  // manera: *"si estuvieras leyendo Teams supieras que ya estamos en la última
  // etapa"* — una negociación entera que SIR no vio.
  //
  // `observations.data->>platform` sí distingue, y es más completo que
  // `chat_messages`: `reader/persist` escribe SIEMPRE una observación, mientras que
  // en `chat_messages` solo entra lo que se pudo atribuir a una persona.
  // ═══ EL CANAL NO SE LLAMA IGUAL QUE SU PLATAFORMA ═══════════════════════════
  //
  // Esta tabla se midió contra producción el 7-ago-2026 DESPUÉS de que dos de las
  // cinco filas estuvieran mal en el primer intento. Los nombres no coinciden y no
  // hay forma de deducirlo leyendo el código del canal: hay que ir a mirar el dato.
  //
  //   canal      →  dónde aterriza
  //   whatsapp      observations  platform 'whatsapp'
  //   teams         observations  platform 'teams'
  //   outlook       observations  platform 'email'      ← NO 'outlook'
  //   instagram     unmatched_social_activity + social_profiles + social_page_followers
  //   linkedin      unmatched_social_activity  platform 'linkedin'  (0 filas de por vida)
  //
  // El de Outlook costó una afirmación falsa: buscando `platform='outlook'` daba
  // cero y le dije a Aaron que ese lector *"nunca funcionó, 0 enviados de por
  // vida"*. Había capturado seis correos esa misma tarde. Outlook no pasa por el
  // reader: va por `/api/email/ingest` → `ingestEmailMessages`, que arma el batch
  // con `platform: 'email'` porque el mismo camino sirve a Graph y al scrape de OWA.
  //
  // Es la regla de honestidad de cobertura mordiéndome a mí: **una consulta que
  // devuelve cero prueba que la consulta no encontró nada, no que no exista.**
  const PLATAFORMA_EN_OBSERVACIONES: Record<string, string> = {
    whatsapp: 'whatsapp',
    teams: 'teams',
    outlook: 'email',
  }

  // ═══ SE MIDE CUÁNDO LLEGÓ, NO CUÁNDO PASÓ ═════════════════════════════════
  //
  // Todas estas consultas leían `observed_at` / `captured_at`, o sea CUÁNDO OCURRIÓ
  // el hecho. La pregunta de este módulo es otra: *"¿hace cuánto que este canal no
  // trae nada?"* — y eso es CUÁNDO ENTRÓ, que es `created_at`.
  //
  // Confundirlas rompía en las dos direcciones, y las dos se midieron el 7-ago-2026:
  //
  //   whatsapp   n=200  el desfase created_at − observed_at es 5.00 h en las 200
  //                     (min 5.00, max 5.00). No es demora: `observed_at` de WhatsApp
  //                     es hora de LIMA etiquetada como UTC, igual que
  //                     `chat_messages.sent_at`. WhatsApp se veía 5 h más viejo
  //                     SIEMPRE, y en un borde de día eso es un día entero de más.
  //   teams      n=102  mediana 500 h, máximo 4291 h. Teams hace backfill de
  //                     conversaciones viejas: un mensaje de hace seis meses entra
  //                     HOY. Con `observed_at`, el canal más activo del día se
  //                     reportaría como caído hace medio año.
  //   email      n= 60  97% a ~0 h. Este andaba bien de casualidad.
  //
  // `created_at` no tiene ninguno de los dos problemas: lo pone la base al insertar,
  // es UTC de verdad en todas las tablas, y significa exactamente lo que se pregunta.
  //
  // OJO: esto NO arregla la convención de `observed_at` de WhatsApp, que sigue en
  // hora de Lima. Se deja como está a propósito — es la convención del corpus, no un
  // bug de una fila, y reescribirla sin revisar quién más la lee es como se corrompen
  // mil filas. Acá simplemente se dejó de preguntarle a la columna equivocada.
  const obsDe = (canal: string) => safe(() => db.from('observations').select('created_at')
    .eq('user_id', userId).eq('data->>platform', PLATAFORMA_EN_OBSERVACIONES[canal] ?? canal)
    .order('created_at', { ascending: false }).limit(1))

  const [wa, teams, outlook, linkedinAct, ig, perfil, seguidor] = await Promise.all([
    obsDe('whatsapp'),
    obsDe('teams'),
    obsDe('outlook'),
    // LinkedIn NO va a `observations`: su lector comparte el puente con Instagram y
    // sale por `/api/social/ingest`. Buscarlo en observations daba null para siempre
    // — hoy da null igual porque nunca capturó nada, y esa coincidencia es justo lo
    // que habría escondido el bug el día que empiece a funcionar.
    safe(() => db.from('unmatched_social_activity').select('created_at')
      .eq('user_id', userId).eq('platform', 'linkedin')
      .order('created_at', { ascending: false }).limit(1)),
    safe(() => db.from('unmatched_social_activity').select('created_at')
      .eq('user_id', userId).eq('platform', 'instagram')
      .order('created_at', { ascending: false }).limit(1)),
    safe(() => db.from('social_profiles').select('created_at')
      .eq('user_id', userId).eq('platform', 'instagram')
      .order('created_at', { ascending: false }).limit(1)),
    safe(() => db.from('social_page_followers').select('created_at')
      .eq('user_id', userId).eq('source', 'instagram')
      .order('created_at', { ascending: false }).limit(1)),
  ])

  // Solo se devuelven los canales que ALGUNA VEZ trajeron algo. Un canal que nunca
  // produjo no está "caído": no está en uso, y decirle que dejó de reportar algo que
  // nunca funcionó es ruido con forma de alarma (ver `diagnoseChannel`).
  const out: Record<string, string | null> = {
    whatsapp: primero(wa, 'created_at'),
    instagram: masReciente(
      primero(ig, 'created_at'),
      primero(perfil, 'created_at'),
      primero(seguidor, 'created_at'),
    ),
  }
  const teamsIso = primero(teams, 'created_at')
  if (teamsIso) out.teams = teamsIso
  const outlookIso = primero(outlook, 'created_at')
  if (outlookIso) out.outlook = outlookIso
  const linkedinIso = primero(linkedinAct, 'created_at')
  if (linkedinIso) out.linkedin = linkedinIso
  return out
}
