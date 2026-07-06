# 11 — CRONOBIOLOGÍA

La cronobiología estudia cómo el tiempo interno del cuerpo (relojes biológicos) organiza sueño, energía y ánimo a lo largo del día y la semana. Le importa a SIR porque casi todo lo que mide —energía, foco, estrés, recuperación— tiene una estructura temporal predecible; entenderla convierte datos sueltos en *cuándo* pasa cada cosa.

## La ciencia (núcleo)

**Modelo de dos procesos (Borbély, 1982).** El sueño y la vigilia se explican por dos fuerzas que se suman:
- **Proceso S (presión de sueño / homeostático):** se acumula mientras estás despierto y se descarga al dormir. Cuanto más rato despierto, más "ganas" de dormir. Es la deuda de sueño en su forma cruda.
- **Proceso C (reloj circadiano):** una onda de ~24 h independiente del sueño, gobernada por el núcleo supraquiasmático y sincronizada por la luz. Marca las ventanas donde el cuerpo "quiere" estar alerta o dormido, sin importar cuánto dormiste.
La interacción S×C explica por qué a veces estás cansado pero no podés dormir (C te mantiene despierto pese a S alto), o por qué rendís a cierta hora con poco sueño.

**Ritmo circadiano y luz (Czeisler).** El reloj se ajusta ("arrastra") sobre todo con la luz. Sin luz de mañana el reloj se atrasa; luz de noche (pantallas) también lo atrasa. La temperatura corporal, el cortisol y la melatonina siguen esta onda: cortisol pico al despertar, melatonina de noche.

**Cronotipos y hora biológica (Roenneberg).** Las personas difieren en *fase*: alondras (temprano) vs búhos (tarde), con un continuo en medio. La **hora biológica** de alguien puede ir corrida respecto a la hora de reloj. Roenneberg define el **jet lag social**: el desfase entre el punto medio de sueño de los días libres y el de los días de trabajo. Dormir tarde el finde y madrugar de semana es, biológicamente, cruzar husos horarios sin viajar.

**Función del sueño (Walker).** El sueño no es tiempo muerto: consolida memoria, regula emoción y limpia el cerebro. Dormir por debajo del rango sostenidamente degrada foco, ánimo y control del estrés — todo lo que SIR ya mide en `self_metrics`.

**Deuda, ventana de energía y dip post-almuerzo.** La deuda de sueño se acumula noche a noche y **no** se paga 1:1 durmiendo una sola noche larga. Dentro del día hay una **ventana de energía** matinal (tras el pico de cortisol) y un **bajón post-almuerzo** (~13–16 h) que es circadiano, no solo por comer. Estas franjas son estables por persona y por eso *observables*.

**Qué es MEDIBLE con la data de SIR.** Directo: duración, calidad, `bedtime`/`wakeTime`, y por tanto el **punto medio de sueño** (proxy de fase → cronotipo y jet lag social). Deuda de sueño (proceso S) por acumulación de déficit. Curva intradía de energía/foco/estrés si hay timestamps repartidos en el día (`self_metrics`). HRV/FC en reposo como señal de recuperación fisiológica. **NO medible directo:** proceso C puro (no tenemos melatonina/temperatura ni luz); lo aproximamos por el patrón de horarios y de energía autoreportada.

## Cómo mapea a SIR (lo que ya tiene)

| Fenómeno cronobiológico | Dato / motor de SIR |
|---|---|
| Deuda de sueño (proceso S) | `sleep_records.duration` → `engines/biological` (`sleepDebt`, umbral 7.5 h) |
| Calidad y consistencia del dormir | `duration`+`quality` → `analyzeSleepTrend` (consistency por varianza) |
| Recuperación fisiológica | `hrv_avg`, `heart_rate` (reposo) + `recoveryScore`; `engines/recovery` |
| Estado energético agregado | `self_metrics.energy/stress` → `analyzeBiologicalState.energyLevel` |
| Fase / cronotipo (punto medio de sueño) | `bedtime`/`wakeTime` — **presentes en la tabla pero HOY sin consumir** por el motor |
| Curva intradía (ventana de foco, dip) | `self_metrics` con `timestamp` — sin motor que lo agrupe por hora todavía |
| Jet lag social | `bedtime`/`wakeTime` por día de semana — sin motor todavía |
| Proyección / degradación honesta | `engines/predictive` (estado `insufficient`), `engines/self-model` (momentum) |
| Composición del bienestar | `engines/peace` (componente biológico ya integra recuperación) |

Lectura clave: el sustrato de sueño ya existe, pero el motor actual solo usa `duration/quality/date`. La **fase** (bedtime/wakeTime) y la **estructura intradía** (timestamps de métricas) son datos ya capturados y aún sin explotar. Ahí está el terreno barato.

## Qué construir (por partes)

Ordenado de mayor valor / menor costo a más complejo. Cada módulo declara su **señal de confianza** (cuándo devuelve `insufficient`).

**M1 — Deuda de sueño acumulada + recuperación realista. ✅ HECHO (lib/sleep/debt + SleepDebtCard en /salud)** *Qué hace:* extiende el `sleepDebt` actual (que es un promedio) a una deuda rodante que se **acumula** por déficit diario y se **amortiza parcialmente** (una noche larga paga una fracción, no todo). Da un "para volver a base necesitás ~N noches en rango". *Toca:* `engines/biological` / nuevo submódulo `sleepDebt`, lee `sleep_records`. *Confianza:* `insufficient` si <5 de los últimos 7 días tienen registro; nunca prometer "recuperado" con una sola noche buena.

**M2 — Detección de cronotipo desde horarios reales. ✅ HECHO (lib/chrono/chronotype)** *Qué hace:* calcula el **punto medio de sueño** = bedtime + duración/2, promediado sobre días libres (o todos si no distinguimos), y ubica a Aaron en un rango alondra↔búho relativo a sí mismo. Es descriptivo ("tu centro de sueño cae ~03:30"), no una etiqueta rígida. *Toca:* nuevo `engines/chronotype` puro; lee `bedtime`/`wakeTime`. *Confianza:* `insufficient` con <14 noches con ambos campos; reporta *rango* (percentiles), no un punto exacto; degrada si la varianza de horarios es enorme (sin patrón estable, no hay cronotipo que declarar).

**M3 — Curva de energía por hora del día. ✅ HECHO (lib/chrono/energyCurve)** *Qué hace:* agrupa `self_metrics.energy/focus` por hora local (Lima UTC-5) y arma un perfil promedio: dónde está la ventana matinal y dónde el dip. Puramente observacional. *Toca:* nuevo `engines/energy-curve`; lee `self_metrics` con `timestamp`. *Confianza:* `insufficient` por franja horaria: una hora con <3 muestras no se dibuja (queda hueco), no se interpola. Necesita cobertura de varias horas distintas; si Aaron solo registra a la noche, el motor lo dice en vez de inventar la mañana.

**M4 — Alerta de jet lag social (fin de semana). ✅ HECHO (lib/chrono/chronotype)** *Qué hace:* compara punto medio de sueño de días laborales vs. libres; si el desfase supera ~1 h, lo señala como causa candidata de bajón el lunes. *Toca:* `engines/chronotype` (reusa M2) + una regla en `engines/signal`. *Confianza:* necesita etiquetar día de semana y ≥2 findes con datos; `insufficient` si no hay contraste laboral/libre. Enunciar como correlación ("suele coincidir con"), nunca como causa probada.

**M5 — Ventana óptima para tareas de foco. ✅ HECHO (lib/chrono/focusWindow)** *Qué hace:* cruza la curva de energía (M3) con el perfil de cronotipo (M2) para sugerir en qué franjas agendar trabajo profundo y en cuáles descansar/tareas mecánicas. Alimenta al planificador de horario. *Toca:* consume M2+M3; expone una recomendación para `engines/timing` / la vista de agenda. *Confianza:* solo emite si M2 **y** M3 están por encima de su umbral; si una es `insufficient`, la ventana no se sugiere. Recomendación blanda ("probá foco 9–11"), revisable con más datos.

**M6 — Modelo de fase acoplado (S×C), experimental. ✅ HECHO (lib/chrono/twoProcess)** *Qué hace:* ajusta un dos-procesos simplificado para *predecir* energía a una hora futura combinando deuda (S) y fase (C estimada por horarios). Es el único módulo predictivo fuerte. *Toca:* `engines/predictive` + M1/M2. *Confianza:* alto riesgo de sobreajuste con n de una persona; arranca como *sombra* (calcula y guarda, no muestra) hasta validar contra energía real observada; `insufficient` mientras el error contra observado no baje de un umbral. No exponer sin backtest.

## Modos de falla / qué NO hacer

- **No confundir promedio con acumulación.** El `sleepDebt` actual es un promedio de 7 días, no una deuda que crece; no reportarlo como "arrastrás X horas" hasta tener M1. Es la trampa más fácil de caer.
- **n chico manda.** Cronotipo (M2) y curva intradía (M3) necesitan semanas de datos. Antes de eso: `insufficient`, no una etiqueta. Un cronotipo declarado con 4 noches es ruido con nombre.
- **Autoreporte es sesgado.** `energy/mood/stress` son percepción, no medición: hay sesgo de recencia (registrás cuando estás mal/bien), horario de captura (si solo registrás de noche, la "curva" es un artefacto) y efecto ancla. Tratar la curva como *lo que Aaron reporta*, no como fisiología objetiva. HRV/FC son el contrapeso más duro cuando existan.
- **Correlación ≠ causa.** Lunes flojo tras un finde desfasado *sugiere* jet lag social; también puede ser carga de trabajo, alcohol, etc. Enunciar candidatos, no veredictos.
- **No hay proceso C medido.** Sin luz, melatonina ni temperatura, la fase circadiana es *estimada* por horarios. Nunca presentarla como medida directa; M6 es hipótesis, no verdad.
- **Zona horaria fija (Lima UTC-5).** Toda agrupación por "hora del día" debe usar hora local de Lima, no UTC ni la del dispositivo. Un bug de TZ corre toda la curva y arruina M3–M6.
- **No medicalizar.** SIR describe patrones de sueño y energía; no diagnostica trastornos del sueño ni prescribe. Si el patrón es alarmante (p. ej. duración crónica <5 h), señala y sugiere ver a un profesional, no interpreta clínicamente.
- **Cuándo callar.** Si falta el dato, se dice "no tengo suficiente para esto" y no se muestra el módulo. Preferible un hueco honesto que una curva bonita inventada — es el principio del sistema: observar antes de anticipar.
