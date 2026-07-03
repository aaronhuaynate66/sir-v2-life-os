# 13 — REGULACIÓN EMOCIONAL

Base científica de cómo SIR mide, respeta y ayuda a regular el estado emocional — implementable por partes, honesta con la incertidumbre.

## La ciencia (núcleo)

La regulación emocional es el conjunto de procesos por los que una persona influye en qué emociones tiene, cuándo las tiene y cómo las expresa. No es "no sentir": es modular la señal.

**Modelo de proceso (James Gross).** Ubica cinco puntos de intervención a lo largo de la línea de tiempo de una emoción:

1. **Selección de situación** — elegir/evitar contextos según su carga emocional esperada.
2. **Modificación de la situación** — cambiar el contexto una vez dentro.
3. **Despliegue atencional** — a dónde mando la atención (distracción, rumiación, foco).
4. **Reevaluación cognitiva** — reinterpretar el significado del evento (*reappraisal*).
5. **Modulación de respuesta** — actuar sobre la respuesta ya disparada (respiración, ejercicio, supresión).

**Reevaluación vs. supresión.** La evidencia de Gross es consistente: la **reevaluación** (upstream, antes de que la emoción escale) baja la experiencia negativa sin costo fisiológico ni social medible. La **supresión** (downstream, apretar la expresión) baja lo que se ve por fuera pero **no baja la emoción interna**, sube la activación fisiológica y deteriora memoria y vínculos. Corolario operativo: la estrategia correcta depende de *en qué punto de la línea de tiempo estás*. Consejo genérico ("relajate") ignora el timing.

**Granularidad / diferenciación emocional (Lisa Feldman Barrett).** Poder distinguir "frustrado" de "ansioso" de "decepcionado" —en vez de un "me siento mal" indiferenciado— predice mejor regulación, menos reactividad y menos recurso al alcohol/atracón. La granularidad es una habilidad entrenable: subir el vocabulario emocional mejora la regulación. Esto es directamente construible (ver módulos).

**Ventana de tolerancia (Dan Siegel).** Rango de activación autonómica dentro del cual una persona funciona: piensa, decide, se conecta. Por **encima** → hiperactivación (ansiedad, ira, pánico). Por **debajo** → hipoactivación (colapso, embotamiento, desconexión). Fuera de la ventana, la reevaluación no está disponible: primero hay que **bajar/subir activación** (regulación downstream, cuerpo) y recién después reinterpretar. Esto justifica que la estrategia ofrecida dependa del estado, no del catálogo.

**HRV y tono vagal (Porges, Thayer & Lane).** La variabilidad de la frecuencia cardíaca (HRV) es un índice de **flexibilidad autonómica**: HRV más alta ≈ mejor capacidad de regular, recuperar y adaptarse; HRV deprimida ≈ sistema tenso, menor margen. La teoría polivagal (Porges) liga el tono vagal a seguridad/conexión; el *modelo de integración neurovisceral* (Thayer) liga HRV a control prefrontal sobre la respuesta emocional. **Importante**: HRV es un proxy poblacional y muy ruidoso a nivel individual (edad, sueño, cafeína, hora, respiración lo mueven). Sirve como **tendencia**, no como veredicto puntual.

**Afecto como señal, no como problema.** Marco funcional: las emociones informan (algo importa, algo se rompió, algo se acerca). El objetivo del sistema no es minimizar el afecto negativo, sino no dejar que capture al usuario fuera de su ventana. Nada de "positividad tóxica".

**Interocepción.** La capacidad de leer las señales internas del cuerpo (pulso, tensión, respiración). Buena interocepción correlaciona con mejor regulación y granularidad. SIR no la mide directamente, pero el autoreporte + proxies fisiológicos son un andamiaje para entrenarla ("tu cuerpo marcaba activación alta antes de que lo notaras").

**Qué es MEDIBLE con la data de SIR (y con qué límite):**

| Constructo científico | Señal en SIR | Calidad |
|---|---|---|
| Valencia / experiencia afectiva | `self_metrics.mood` (1-10) | Autoreporte, sesgado, discreto |
| Activación / arousal | `self_metrics.stress`, FC reposo, HRV | Autoreporte + proxy fisiológico |
| Flexibilidad autonómica | `health_metrics.hrv_avg` (tendencia) | Proxy ruidoso, solo en trend |
| Recuperación / carga | `sleep_records`, `recoveryScore` | Proxy compuesto |
| Diferenciación emocional | vocabulario en `moments` (texto libre) | Débil hoy; construible |
| Contexto de la emoción | `moments`, `person_logs` (tono) | Cualitativo |

Lo que **no** es medible: causalidad, diagnóstico clínico, "por qué" profundo. SIR describe y correlaciona; no psicoanaliza.

## Cómo mapea a SIR (lo que ya tiene)

| Concepto científico | Dato / motor en SIR | Lectura |
|---|---|---|
| Experiencia afectiva (valencia) | `self_metrics.mood` | Autoreporte directo del eje bueno↔malo |
| Nivel de activación (arousal) | `self_metrics.stress` + FC reposo | Cruce autoreporte↔fisiología |
| Flexibilidad autonómica / tono vagal | `health_metrics.hrv_avg` → `engines/biological.recoveryScore` | HRV como insumo de recuperación |
| Carga / capacidad de regular | `sleep_records` + `recoveryScore` | Sin sueño, la ventana se angosta |
| Estado emocional agregado | `engines/peace` (componente emocional del peace score) | Síntesis multi-señal con trend |
| Salir de la ventana de tolerancia | `engines/peace.recoveryMode` + Protocolo de Recuperación | Disparo cuando la paz cae bajo umbral ≈ desregulación sostenida |
| Dirección del cambio (mejor/peor) | `engines/peace.trend`, `engines/self-model.momentum` | Reappraisal funciona mejor sobre trend, no sobre un punto |
| Contexto / disparadores | `moments` (cómo te sentiste), `person_logs` (tono) | Material cualitativo, sin inferencia clínica |
| Espacio clínico/sensible | `self_diagnosis` | AISLADO: no va a IA ni embeddings |

Traducción clave: **`recoveryMode` ≈ el sistema detecta que Aaron está (o estuvo) fuera de su ventana de tolerancia de forma sostenida**. El Protocolo de Recuperación es, en términos de Gross, una intervención *downstream* (bajar carga, priorizar sueño/descanso) — correcta para ese estado, insuficiente como única herramienta.

## Qué construir (por partes)

De simple a complejo. Cada módulo declara tabla/motor y **confianza** (qué tan sólido es el sustento de datos hoy).

**M1 — Detector de salida de la ventana (confianza: media-alta).**
Regla compuesta sobre lo que ya existe: `stress` alto **y** `hrv_avg` en caída vs. baseline personal **y** `sleep` bajo → marca "activación alta / ventana angosta". Motor: extender `engines/peace` o un `engines/emotion` nuevo que consuma `self_metrics` + `health_metrics` + `sleep_records`.
- Baseline **personal y móvil** (no umbrales absolutos): comparar contra los últimos 14-30 días de Aaron.
- Requiere ≥ N observaciones; si no, `insufficient`. Nunca inventar el estado.
- No es diagnóstico: es "tus señales de activación están altas", no "estás ansioso".

**M2 — Estrategia correcta según el momento (confianza: media).**
En vez de consejo genérico, elegir la clase de estrategia por estado (mapeo a Gross):
- **Fuera de la ventana / arousal alto** → *modulación de respuesta*: bajar activación primero (respiración, movimiento, cortar estímulo). No pedir reevaluación acá.
- **Dentro de la ventana pero afecto negativo con trend plano** → *reevaluación cognitiva*: ofrecer reencuadre / preguntas, no soluciones.
- **Rumiación / atención pegada** → *despliegue atencional*: distanciamiento, cambio de foco.
- **Disparador contextual recurrente** (visible en `moments`/`person_logs`) → *selección/modificación de situación*.
Entrega como sugerencia, no como orden. Motor: tabla de decisión pura (`lib/emotion/strategy.ts`), testeable, sin IA obligatoria. La IA solo redacta el mensaje, no decide el estado.

**M3 — Granularidad emocional (confianza: media, alto valor).**
Al registrar un `moment`, ofrecer subir el vocabulario: de "mal" → propuesta editable de etiquetas más finas (frustración, decepción, sobrecarga, soledad…). Nunca formulario vacío ni etiqueta impuesta: propuesta que el usuario acepta/corrige (principio "nunca formularios vacíos"). Con el tiempo, medir diversidad léxica emocional como señal de habilidad. Requiere pensar el almacenamiento (campo estructurado de emociones en `moments`).

**M4 — Aprender qué regulación funciona (confianza: baja al inicio, sube con n).**
Registrar qué estrategia se aplicó y qué pasó después (mood/stress/HRV en las horas/días siguientes). Atar a `engines/learning`: con suficientes repeticiones, "cuando estás así, X te suele ayudar más que Y — para vos, no en general". Empieza `insufficient` y solo afirma cuando el n personal lo sostiene. Riesgo a vigilar: confundir correlación con causa; presentarlo como patrón observado, no como ley.

**M5 — Separación tajante de lo clínico (confianza: alta, es una restricción, no un modelo).**
`self_diagnosis` queda AISLADO: no alimenta M1-M4, no va a IA ni a embeddings, no aparece en resúmenes. Si el usuario escribe algo sensible ahí, SIR lo guarda y calla. Ningún módulo emocional puede leer esa tabla. Esto se implementa como frontera de datos explícita y test que lo garantice.

**Orden sugerido:** M1 → M2 → M3 → M4, con M5 como precondición transversal desde el día uno.

## Modos de falla / qué NO hacer

- **No diagnosticar.** Nada de "tenés ansiedad/depresión". SIR describe señales ("activación alta", "recuperación baja"), no entidades clínicas. No es un profesional de salud mental y debe dejarlo claro cuando el estado es persistente y severo (sugerir buscar ayuda humana, no reemplazarla).
- **No patologizar el afecto normal.** Un día malo no es un trastorno. Tristeza tras una pérdida es información, no un bug. El objetivo no es aplanar la emoción.
- **No empujar positividad tóxica.** Nunca "mirá el lado bueno" ante dolor real. Validar antes de sugerir. La reevaluación se ofrece, no se impone, y jamás como "en realidad no es para tanto".
- **Respetar el aislamiento de lo sensible.** `self_diagnosis` no se toca desde ningún motor emocional ni desde la IA. Violarlo es un bug de seguridad, no de UX.
- **Honestidad con el n y con el sesgo del autoreporte.** `mood`/`stress` son percepción, no verdad fisiológica; la gente reporta peor cuando ya está mal (sesgo de estado). HRV es ruidoso a nivel puntual. Con pocos datos: `insufficient`, siempre. Preferir "no tengo suficiente para decirlo" antes que una afirmación linda pero infundada.
- **No confundir proxy con constructo.** FC reposo alta no *es* estrés; HRV baja no *es* mala regulación. Son indicios. Presentarlos como tales.
- **No forzar la interacción en el peor momento.** Si M1 detecta arousal alto, el sistema baja el ruido y ofrece poco, claro y opcional — no lanza cuestionarios ni pide granularidad cuando la persona está fuera de su ventana.
