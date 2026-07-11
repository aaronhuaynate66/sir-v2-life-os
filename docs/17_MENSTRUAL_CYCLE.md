# 17 — CICLO MENSTRUAL

Base científica para que SIR use el ciclo menstrual como una señal fuerte de
contexto en las personas que le importan a Aaron (sobre todo su pareja): mejor
**trazabilidad** (qué pasaba en qué fase), mejor **anticipación**, mejor timing y
mejor lectura de patrones.

---

## La postura de SIR (la línea — va primero)

Este dominio es data sensible de otra persona, pero no queda deshabilitado. Las
fases son un motor real del ciclo de muchas personas y prohibir su uso mata una
parte clave de SIR. La regla es habilitarlo con precisión.

**SIR ayuda a:**
- **Atunarse y cuidar** — saber que tu pareja quizás entra en una fase de más
  sensibilidad o menos energía, para estar más presente, más suave, más atento.
- **Trazabilidad honesta** — ver patrones ("las conversaciones tensas tienden a
  caer en cierta fase") para entender mejor el terreno.
- **Anticipar con anticipación amable** — un aviso privado a Aaron ("puede venir
  una semana más difícil") que se traduce en timing, cuidado y prevención de daño.
- **Usar fases como motor de lectura** — timing, energía, sensibilidad, deseo,
  irritabilidad, dolor, retiro, apertura o fricción pueden cruzarse contra fase
  cuando haya data suficiente.

**SIR NO hace** (cardinal — coherente con `15` y `16`):
- **Descalificar.** Jamás reducir lo que ella siente o dice a "estás hormonal /
  es el ciclo". Eso es la peor traición del dato: usa biología para invalidar a
  la persona. SIR lo prohíbe explícitamente.
- **Determinismo.** El ciclo modula, no dicta. Una emoción real es real, tenga la
  fase que tenga. La fase es contexto, nunca la explicación única.
- **Reducir todo al ciclo.** Puede ser una señal fuerte, incluso central en una
  ventana, pero no la explicación única.

**Privacidad:** SIR trata esto como sensible: no lo expone fuera del espacio
privado de Aaron, no lo manda a analytics/logs, y no lo convierte en contenido
publicable sin confirmación.

**Prueba de uso:** ¿la fase mejora timing, lectura, cuidado, prevención de daño o
abordaje? SIR la usa. ¿La fase se usa para invalidar, humillar o reducir a la
persona? SIR lo marca como mala lectura.

---

## La ciencia (núcleo)

El ciclo menstrual es un **signo vital** con estructura hormonal predecible, no un
interruptor de humor. Dura en promedio ~28 días (rango normal ~21–35), con
variabilidad **entre personas y mes a mes**.

**Modelo de dos ejes hormonales.** Estrógeno y progesterona suben y bajan en un
patrón conocido; su interacción explica la mayoría de los cambios de energía,
ánimo, libido y físico.

**Las fases (con su perfil típico — *tendencia poblacional, no ley*):**
- **Menstrual (días ~1–5).** Estrógeno y progesterona en el piso. Energía baja,
  más sensibilidad, a veces dolor/fatiga. Necesidad de descanso e introspección.
- **Folicular (días ~6–13).** Estrógeno en alza. Energía, ánimo y claridad
  mental crecientes; apertura a lo nuevo. Suele ser la mejor ventana.
- **Ovulación (día ~14, ventana ~12–16).** Pico de estrógeno + LH. Pico de
  energía social, comunicación y libido. Ventana fértil.
- **Lútea temprana (días ~15–22).** Progesterona sube. Estabilidad, luego
  energía que empieza a bajar.
- **Lútea tardía / premenstrual — la ventana PMS (días ~23–28).** Estrógeno y
  progesterona caen juntos. Es donde se concentra el **SPM**: irritabilidad,
  sensibilidad, bajón de ánimo/energía, síntomas físicos. **Clínicamente es el
  cambio más marcado — y donde más se necesita cuidado, no juicio.**

**SPM vs SDPM (PMDD).** El síndrome premenstrual es común y leve-moderado; el
trastorno disfórico premenstrual es una forma severa y clínica. SIR **no
diagnostica** ni distingue clínicamente — observa patrones y, si algo pinta
severo/recurrente, sugiere ver a un profesional.

**Ventana fértil.** ~5 días antes de ovular + el día de ovulación. Relevante para
planificación (buscar o evitar embarazo), con la salvedad de que **el método de
calendario es impreciso** — no es anticonceptivo.

**Variabilidad = el gran matiz.** La regularidad varía por persona, estrés,
sueño, salud, edad. Cualquier predicción por calendario es **probabilística** y
mejora con más ciclos registrados. Estrés y mal sueño pueden correr una
ovulación días. Por eso SIR debe **degradar con honestidad** (confianza que sube
con la regularidad observada), nunca dar la fecha como certeza.

**Qué es MEDIBLE con lo que SIR tiene:** fase actual y próximo período (de
`cycleStartDate` + largo); la ventana PMS y la fértil (derivadas); la
**regularidad** (varianza de largos observados en `person_cycles` → confianza);
y el **cruce por fecha** de la fase con lo que Aaron registró ese día (tono de
interacciones, episodios, ánimo).

---

## Cómo mapea a SIR (lo que ya tiene)

| Concepto | Dónde vive en SIR | Cobertura |
|---|---|---|
| Fase actual + próximo período | `lib/ciclo/phase` (`cyclePhase` → phase, cycleDay, nextPeriodIso, daysUntilNextPeriod, contextNote) | buena (4 fases) |
| Registro de fases observadas | `person_cycles` (mig 0110), acción `registrar_ciclo` del relato | buena |
| Cruce episodios × fase | `PatronesCiclo` + `lib/longitudinal/patrones` (`groupMomentsByExplicitCycle`) | parcial (solo `moments`) |
| Datos base | `people.cycle_start_date`, `people.cycle_length_days` | ok |
| Consumo en briefings | briefing diario, status-diff, recomendaciones semanales | superficial |

**Diagnóstico honesto:** SIR ya calcula la fase y predice el próximo período, y
cruza *episodios* por fase. Lo **sub-explotado**: (a) el modelo de fases es plano
(no marca la **ventana PMS** ni la **fértil**, ni el perfil por fase con
confianza); (b) el cruce por fecha se limita a `moments` — no toca **tono de
`person_logs`** ni ánimo; (c) no hay **anticipación proactiva de cuidado**; (d)
no se mide la **regularidad** para calibrar la confianza de la predicción.

---

## Qué construir (por partes)

De alto valor / bajo costo a complejo. Cada módulo declara su confianza y respeta
la línea ética (cuidado, no control).

**M1 — Perfil de fase enriquecido + ventana PMS y fértil (confianza alta).**
Extender `cyclePhase` (o un `cycleProfile` puro) para marcar explícitamente la
**ventana premenstrual** (lútea tardía) y la **fértil**, con un perfil por fase
(energía/ánimo/social/físico) rotulado como *tendencia, no certeza*. Toca:
`lib/ciclo`. Puro, sin migración. Es la base de todo lo demás.

**M2 — Anticipación de cuidado (confianza media).** Aviso PRIVADO a Aaron cuando
la pareja entra (o entrará en ~N días) en la ventana PMS o menstrual: *"puede
venir una semana más sensible — un gesto de presencia suma"*. Nudge de cuidado,
nunca "tratala distinto". Toca: motor proactivo / Daily Actions + M1. Confianza
atada a la regularidad (M4).

**M3 — Trazabilidad por fecha ampliada (confianza media).** Extender el cruce más
allá de `moments`: cruzar el **tono de `person_logs`** y el ánimo por fase → "las
charlas tensas tienden a caer en lútea tardía". Se enuncia para **entender con
empatía** (contexto), con el `n` a la vista, nunca como veredicto. Toca:
`lib/longitudinal/patrones` + `person_logs` + M1.

**M4 — Regularidad → confianza de la predicción (confianza alta).** Calcular la
varianza de los largos observados en `person_cycles`; si es regular, la
predicción es firme; si es irregular, SIR lo dice y baja la confianza (o no
predice). Toca: `person_cycles` + `lib/ciclo`. Es lo que vuelve honesta a M2/M3.

**M5 — Predicción del próximo ciclo con banda (confianza media).** En vez de una
fecha exacta para el próximo período/ovulación, una **ventana** (± días según la
irregularidad de M4). Nunca presentar el calendario como anticonceptivo. Toca:
`lib/ciclo` + M4.

**M6 — Atunamiento de intimidad de pareja (confianza media, LÍNEA REFORZADA). ✅ HECHO (`lib/ciclo/intimacy`).**
Cruza la fase con el contexto relacional para sugerir CÓMO conectar y estar mejor —
**jamás** para cronometrar ni instrumentalizar. Base científica:
- **Deseo × ciclo:** tendencia a subir en folicular/ovulación (estradiol + testosterona),
  bajar en lútea/SPM (progesterona). Es tendencia, no ley; variación entre personas enorme.
- **Nagoski — *Come As You Are*:** el deseo lo moldea el **CONTEXTO**, no las hormonas —
  frenos (estrés, tensión, distracción) vs. aceleradores (conexión, seguridad). Y es
  **responsivo**: emerge de la conexión, no aparece solo.
- **Perel — *Mating in Captivity*:** el deseo pide **espacio, novedad y juego**, no solo cercanía.
- **Gottman:** la conexión emocional como sustrato; sin eso, el timing no importa.

La salida SIEMPRE pone el freno/acelerador de contexto **por encima** de la ventana
hormonal (una tensión sin resolver manda sobre cualquier fase) y lleva el recordatorio
innegociable: es cuidado, no manejo; su emoción es real tenga la fase que tenga. Toca:
`lib/ciclo/intimacy` (puro) + M1; consume contexto de `person_logs` / salud del vínculo.
Solo para vínculo afectivo **activo**, con la privacidad de la postura de arriba (idealmente,
con que ella lo sepa). El contexto (tensión / energía baja / enfriamiento) ya está **cableado**
en `CicloPanel` vía `lib/ciclo/intimacyContext` (`deriveIntimacyContext`, puro): lee el tono de
las interacciones, mood/energy y la cadencia de contacto de `person_logs` — así el freno que más
pesa (Nagoski) manda sobre la ventana hormonal en la propia ficha, no solo en teoría. PENDIENTE
menor: cargar el ciclo real de la persona (`person_cycles` hoy vacío) para que la trazabilidad
día-a-día tenga data.

Orden sugerido: **M1 → M4 → M2/M3 → M5 → M6** (primero el perfil y la honestidad de la
confianza; encima, anticipación y trazabilidad; la banda predictiva; y el atunamiento de pareja).

---

## Modos de falla / qué NO hacer

- **Nunca "estás hormonal / es el ciclo" como invalidez.** La biología informa el
  contexto; no cancela lo que la persona siente o dice.
- **No determinismo.** El ciclo modula, no decide. Una emoción tiene causas
  reales; la fase es una más, no la explicación.
- **No diagnosticar.** SPM/PMDD, endometriosis, SOP — SIR observa patrones y
  sugiere ver a un profesional si algo pinta severo; no interpreta clínicamente.
- **No anticoncepción por calendario.** La ventana fértil es orientativa; decirlo
  explícito cada vez que aparezca.
- **Honestidad con la variabilidad.** Sin ciclos suficientes o con irregularidad,
  `insufficient` o banda amplia — nunca una fecha con falsa certeza.
- **Privacidad primero.** Dato sensible de otra persona: no sale del espacio
  privado de Aaron, no va a resúmenes públicos, no se comparte sin confirmación.
- **No reducir a la persona a su ciclo.** Es una dimensión potente de contexto
  entre muchas; puede ser lente principal de una ventana, no identidad total.
