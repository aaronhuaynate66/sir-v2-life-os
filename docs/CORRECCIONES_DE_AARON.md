# Correcciones de Aaron — el registro de "ya habíamos hablado de esto"

> **Para qué existe.** El 29-jul-2026 Aaron escribió: *"sigo sin entender por qué me
> habla de pasarle cotización de las cámaras, algo está mal y ya habíamos hablado de
> esto. En caso tú no lo recuerdes vamos a tener que crear un archivo de nuestras
> conversaciones, porque esto ya está pasando muy seguido y empieza a ser molesto e
> improductivo."*
>
> Tenía razón: había cuestionado exactamente eso **cinco días antes** y nada cambió.
> Este archivo es ese registro.

## Cómo se usa (regla dura)

**Antes de presentarle un pendiente, un dato o una conclusión, buscar acá.** Si el
tema aparece en la tabla, respetar la corrección — no re-derivarla, no "verificar"
si sigue vigente preguntándole otra vez.

Y al revés: **cuando Aaron corrige algo, se anota acá en el momento**, con la fecha
y con el arreglo. Una corrección que solo vive en el chat se pierde: el chat no se
relee, este archivo sí.

Señales de que hay que anotar algo acá:
- *"ya habíamos hablado de esto"* · *"te dije que…"* · *"eso ya lo decidí"*
- *"¿de qué me hablas?"* / *"no me acuerdo de eso"* → **casi siempre significa que
  el dato está viejo, no que él se olvidó.** Es la lección de la fila de abajo.
- *"algo está mal"*

---

## Registro

| Fecha | Qué corrigió | Causa real | Qué se hizo |
|---|---|---|---|
| **29-jul-2026** | *"¿Por qué me habla de pasarle cotización de las cámaras?"* — segunda vez que lo pregunta | `goals.next_action` = "Pasarle cotización a Miluska (landing/cámaras)", escrito el **16-jun** y nunca tocado. Es texto libre **sin ciclo de vida**: nadie lo marca hecho, nada lo vence. El brief lo empujaba como pendiente vivo hacía 42 días, y `goalContactTiming` era el único slot repetible **sin botón 🔕**, así que no podía callarlo | Campo limpiado. `buildGoalTimingNudge` ahora dice la EDAD del pendiente pasados 21 días ("lo anotaste hace 42 días, dime si ya no aplica") y a los 60 deja de proponerlo. `goalContactTiming` sumado a `MUTABLE_SLOTS` → ya tiene 🔕 |
| **24-jul-2026** | *"¿Qué cotización a Miluska me hablas? ¿De landing cámaras?"* | **La misma de arriba.** SIR le DEFENDIÓ el campo ("sí, exacto, el próximo paso que dejaste anotado es…") en vez de leer su duda como evidencia de que el dato estaba viejo | Nada. Por eso volvió el 29. **Esta fila es el ejemplo de qué NO hacer** |
| **30-jul-2026** | *(lo detecté rastreando la factura)* Le afirmé **tres veces en un día** que un dato "no existía" cuando sí existía | Pedí columnas que NO existen (`objective_steps.goal_id`, `personal_events.kind`, `people.cycle_last_period`). **PostgREST devuelve eso en `.error` sin lanzar**, así que `data` viene vacío y se lee igual que "no hay filas". Le dije que la tarea de la factura no estaba en la base, que los eventos médicos no estaban cargados y que el override de reposo médico estaba inerte. **Las tres estaban bien** | En todo script de verificación: `const { data, error }` + `if (error) throw`, sin excepción. Y antes de decir "no existe", mirar el esquema real. Es la regla de honestidad de cobertura del repo, que le exijo a los bots y me la salté yo |
| **29-jul-2026** | *"Que factura mensual?"* — el brief le avisó de emitir una factura de S/1,500 y él no sabía de qué era | El paso tenía TODO desde el 3-jun (cliente: Dayana, de "Cerrar Boticas Jhodaal") y el objetivo estaba **pausado** porque ella se fue con otra gente el 17-jul: no había nada que facturar. Pero al chat solo le llegaba UN paso por objetivo (el siguiente pendiente), así que cuando preguntó, SIR solo pudo repetirle el título | El brief descarta pasos de objetivos pausados. Y los pendientes con fecha llegan al chat con su objetivo, su estado y su detalle, con orden de decir PRIMERO si está pausado. Existe el estado `descartado` para cerrar un plan caído sin marcarlo "hecho" |
| **29-jul-2026** | *(lo detecté revisando Telegram)* Aaron avisó *"a Diana Díaz le vino la regla recién ayer"* y SIR contestó **"acabo de recalcular su ciclo desde esa fecha"**. No recalculó nada | El chat tenía la tool (`proponer_registrar_estado`), el prompt del sistema le PROHÍBE explícitamente decir que guardó sin llamarla, y la descripción de la tool trae la frase textual "le vino la regla ayer". El modelo la ignoró igual. Nueve horas después el ancla de ella seguía en 26-may, 64 días vieja. Y aparte: cuando la tool SÍ corre, solo escribía `person_cycles` y nunca adelantaba `people.cycle_start_date`, que leen otras tres superficies | Guard determinístico (`falsaEscritura`): si la respuesta afirma haber guardado y no hubo tool, se le pega un aviso que la desmiente. `registrar_estado` ahora adelanta el ancla. El dato del 28-jul, recuperado a mano |
| **29-jul-2026** | *"Esos 346 yo se los debo a Diana"* — lo había cargado al revés | Leí la dirección de la deuda invertida y la escribí en `person_money` sin que él la confirmara | Corregido (`direction: out`). **La dirección de una deuda se confirma, no se infiere del texto** |
| **29-jul-2026** | *"¿Por qué mis conversaciones con Diana no están cargadas?"* | Le dije que WhatsApp **no tenía ingesta automática**. Falso: el reader venía trayendo sus mensajes con segundos de latencia y se cortó el **22-jul**. Afirmé una ausencia de arquitectura cuando era una **caída de 7 días** | Latido por canal (`reader_heartbeats`) + aviso en el brief que distingue "no pasó nada" de "el canal está muerto" |
| **29-jul-2026** | *(lo detecté yo, verificando)* Dupliqué ~71,000 mensajes de Diana al importar | Había **dos copias** de la función que define la identidad de un mensaje: la canónica y una en el script del importador. Se separaron y nadie avisó. Y el script reportaba las filas **intentadas**, no las insertadas, así que el número inflado me hizo creer que había funcionado | Una sola función (el script importa la canónica), migración 0176 que canoniza los ids guardados, y el script ahora reporta "N nuevos, M ya estaban" |
| **28-jul-2026** | *"Te dije que eso lo haré el 31, estamos 28"* (inscripción al Mundial) | La data estaba bien (`dueDate 2026-07-31`); mi prosa derivó de "vence el 31" a "vence mañana" a "vence hoy" en mensajes sucesivos, sin volver a mirar el dato | Corregido. No repetir la fecha de memoria: leerla |
| **28-jul-2026** | *"No pierdas mi tiempo preguntándome webadas, decide tú cosas triviales"* | Cerraba los turnos con preguntas que podía resolver solo, y entregué una feature sin probarla | Guardado en memoria (`decidir-solo-no-preguntar`). Decidir lo reversible; **probar antes de decir que algo funciona** |
| **28-jul-2026** | *"Cuidado, algunos son páginas de branding o empresas — Bomberos Salamanca 127 es mi unidad"* | El importador iba a crear **organizaciones como si fueran contactos**. Dato falso, no incompleto | `entityKind.ts` clasifica persona/org/inválido; `org_profiles.parent_org` puebla la jerarquía (Salamanca 127 → CGBVP) |
| **25-jul-2026** | *"Yo peleo en más de 80"* — le había propuesto evaluar bajar a 69-80 | Le sugerí cambiar de categoría sin que él lo pidiera | **DECISIÓN CERRADA, no reabrir.** Hay tests que prohíben la frase "categoría de al lado" |
| **25-jul-2026** | *"Esa información ya está y deberías sacarla de la web"* — dije que el goal del Mundial estaba vacío | Miré solo `milestones` y `related_persons`; el goal tenía `target`, `target_date`, descripción y baseline | Verificar TODAS las columnas antes de decir "está vacío" |
| **25-jul-2026** | *"Me diste la opción 3"* — eligió el hilo CON botones y entregué el hilo sin botones | Entregué la opción elegida en cuotas | Cuando elige una opción, entregarla COMPLETA |
| **25-jul-2026** | *"Ver acá el diseño no es muy agradable, o lo haces y mandas pruebas por Telegram"* | Le mostré maquetas en ASCII en el chat | Las pruebas de UI van por Telegram con su data real, no en ASCII |
| **25-jul-2026** | *"Que me recuerdes todos los días que mi mamá está empinchada no me ayuda en nada"* | El brief repetía la misma señal cada mañana | 🔕 manual (`brief_mutes`) + auto-silencio a las 3 mañanas iguales (`autoSnooze`) |

---

## El patrón, dicho de una vez

Casi todas las filas son la **misma falla**: un campo que se lee como verdad viva
cuando en realidad es un apunte viejo, y ninguna forma de cerrarle el loop.

`goals.next_action`, `goals.progress`, `Goal.milestones` — los tres son texto o
números que alguien escribió una vez y que **nada actualiza ni vence**. Presentarlos
sin su edad los hace parecer frescos, y cuando Aaron dice *"¿de qué me hablas?"* la
respuesta correcta **no** es explicarle de dónde salió el dato: es sospechar del
dato.

**Regla:** todo lo que el brief presente como pendiente tiene que poder (a) decir de
cuándo es, (b) marcarse como hecho o descartado, y (c) callarse con 🔕. Si un dato no
cumple las tres, no se presenta como pendiente.

## El segundo patrón: la degradación silenciosa

Las filas del 29-jul son de otra familia. Nada estaba viejo — todo **se rompió sin
avisar**, y el sistema siguió reportando normalidad:

- GitHub descartaba la label de los issues sin devolver error → la bandeja se veía vacía.
- El reader de WhatsApp murió el 22-jul y siguió pareciendo sano porque Instagram seguía.
- El importador reportaba "73,251 mensajes" cuando los 73,251 ya estaban en la base.
- PostgREST corta en 1000 filas sin decirlo, así que un conteo leía 30k de 145k.

**Regla:** ninguna de esas fallas era detectable desde dentro de su propio reporte.
Un número que sale de la operación que quiero verificar no la verifica — hay que
contarlo aparte. Y toda ausencia de datos es ambigua hasta que exista una señal que
diga "estoy vivo": sin latido, "no llegó nada" y "está caído" se ven idénticos.
