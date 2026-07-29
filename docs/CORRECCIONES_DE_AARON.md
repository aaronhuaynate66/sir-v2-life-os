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
