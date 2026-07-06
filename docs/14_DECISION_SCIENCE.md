# 14 — CIENCIA DE LA DECISIÓN

Base científica del evaluador de decisiones de SIR V2: qué dice la ciencia de la decisión / economía conductual, qué es operable hoy y qué construir por partes.

## La ciencia (núcleo)

El objetivo no es "decidir mejor" en abstracto, sino **estructurar la decisión** para que los sesgos previsibles no la secuestren. Lo que sigue es lo que tiene respaldo empírico y traducción a código.

**Dos sistemas (Kahneman & Tversky).** Sistema 1: rápido, automático, emocional, barato. Sistema 2: lento, deliberado, caro. La mayoría de las malas decisiones de vida son Sistema 1 disfrazado de razón: la persona ya decidió y después racionaliza. Operable: SIR no reemplaza al Sistema 2, lo *fuerza a activarse* cuando lo que está en juego lo justifica.

**Sesgos que aparecen en decisiones de vida** (y cómo se ven):
- **Aversión a la pérdida** (~2x): perder pesa el doble que ganar. Aparece como parálisis ante cambios ("y si pierdo lo que tengo") aunque el statu quo sea peor. Detectable en el lenguaje.
- **Costo hundido**: "ya invertí X, no puedo dejarlo ahora". El dinero/tiempo gastado es irrecuperable y NO debería pesar en la decisión futura. Fuerte en relaciones, trabajos, mudanzas.
- **Sesgo del presente / descuento hiperbólico**: el ahora vale desproporcionadamente más que el futuro. La curva de descuento es hiperbólica, no exponencial → inconsistencia temporal (elegís A hoy y te arrepentís mañana). Esto es exactamente la dimensión `timing`.
- **Sesgo de confirmación**: buscás data que confirma lo que ya querés. Aparece cuando alguien "consulta" pero solo para validarse.
- **Foco ilusorio (focusing illusion, Kahneman)**: "nada en la vida es tan importante como creés que es mientras lo estás pensando". Sobreponderás la dimensión saliente (el sueldo, la persona, la ciudad) e ignorás el resto.
- **Planning fallacy**: subestimás tiempo/costo/riesgo de tus propios planes aunque tengas historial de fallar en lo mismo. Antídoto empírico: *outside view* (base rates, no tu caso particular).

**Reversibilidad: one-way vs two-way doors (Bezos).** Decisiones reversibles ("puertas de dos vías") deben tomarse rápido y con poca deliberación; equivocarse es barato porque volvés. Decisiones irreversibles ("una vía") justifican deliberación lenta y cuidado. **El error caro no es equivocarse: es tratar las dos como si fueran iguales.** Sobre-deliberar lo reversible cuesta tanto como apurar lo irreversible. Esto es el GATE de reversibilidad de SIR y es el organizador maestro de cuánto esfuerzo merece una decisión.

**Regret minimization (Bezos).** Proyectarse a los ~80 años y preguntar "¿qué voy a lamentar no haber intentado?". Sesga hacia la acción en decisiones de identidad/vida donde el arrepentimiento por omisión suele superar al de comisión. Útil, pero solo en la clase irreversible-de-alto-sentido; no como regla universal.

**Premortem (Gary Klein).** Antes de decidir, imaginar que ya salió mal y explicar por qué. Convierte el optimismo en hipótesis falsables y destapa riesgos que el entusiasmo esconde. Es la técnica más barata y de mayor rendimiento: una sola pregunta ("asumí que fracasó en 6 meses, ¿qué pasó?") mejora la calibración.

**Decisión bajo incertidumbre y valor esperado.** Cuando hay opciones con probabilidades, el marco normativo es EV = Σ(prob × valor). Pero: (a) los valores no son solo dinero (paz, identidad, relaciones), (b) las probabilidades subjetivas están mal calibradas, (c) la varianza importa cuando la ruina es posible (una apuesta de EV positivo puede ser mala si un mal resultado es irreversible). SIR usa EV como *estructura de conversación*, no como número mágico.

**Satisficing vs maximizing (Simon; Schwartz).** *Maximizar* = buscar la mejor opción posible; *satisficer* = elegir la primera que cumple un umbral "suficientemente buena". Los maximizadores obtienen resultados objetivamente marginalmente mejores y se sienten peor (más arrepentimiento, más parálisis — "paradoja de la elección"). Regla operable: **maximizá lo irreversible y de alto sentido; satisficeá el resto.** Racionalidad acotada (Simon): no existe el óptimo con información y tiempo finitos; "suficiente" es la respuesta correcta la mayoría de las veces.

**Qué es operable hoy:** (1) clasificar reversibilidad y ajustar el esfuerzo; (2) detectar sesgos en el lenguaje de la descripción; (3) forzar un premortem; (4) decidir modo maximizar/satisficer según lo que está en juego; (5) traer casos pasados; (6) chequear coherencia con valores. Nada de esto requiere que SIR "sepa" la respuesta.

## Cómo mapea a SIR (lo que ya tiene)

El evaluador de `engines/decision` ya implementa buena parte del marco sin nombrarlo. Mapa concepto → dimensión/motor:

| Concepto científico | Dónde vive en SIR |
|---|---|
| One-way vs two-way doors (Bezos) | GATE de reversibilidad + dimensión `reversibility` — decide *cuánta* deliberación merece |
| Sesgo del presente / descuento hiperbólico | dimensión `timing` (¿es ahora o es urgencia fabricada?) |
| Coherencia con identidad / valores | dimensión `values` + `identity_profile` + `goals` |
| Foco ilusorio (una dimensión tapa el resto) | las **8 dimensiones ponderadas** obligan a mirar el cuadro completo, no solo lo saliente |
| Sistema 1 vs 2 | separación IA-puntúa (rápido, -2..+2) / motor-computa el ponderado (lento, determinista) |
| Estado corporal como dato de decisión | dimensión `biological` (biological state) |
| Valor esperado multi-atributo | el ponderado de 8 dimensiones ES un EV multi-atributo con pesos |
| Paz como criterio superior | dimensión `peace` + `engines/priority` (Paz > Salud > Finanzas > …) |
| Costo emocional/vincular | dimensiones `relational` y `peace` |
| Aprender qué funcionó | `engines/learning` + memoria cross-session |
| Veredicto honesto con incertidumbre | go / caution / hold (no un sí/no binario forzado) |

Lo que **falta** y sí es propio de la ciencia de la decisión: detección explícita de sesgos, premortem forzado, modo maximizar/satisficer, y recuperación de decisiones pasadas parecidas *con su resultado*.

## Qué construir (por partes)

De simple a complejo. Cada módulo es independiente y suma sin romper el evaluador actual.

**M1 — Detector de sesgos en el lenguaje (confianza alta). ✅ HECHO (engines/bias).**
Al describir la decisión, la IA marca sesgos activos en el texto de Aaron: costo hundido ("ya invertí…", "después de todo este tiempo…"), presente/urgencia ("tiene que ser ahora"), aversión a la pérdida ("no quiero perder lo que…"), confirmación (solo argumentos de un lado). Salida: chips no-bloqueantes ("Detecté posible costo hundido — ¿el pasado debería pesar acá?"). Toca: `engines/decision` (paso de análisis pre-scoring), sin tabla nueva. Es puro prompt + heurística de keywords como red de seguridad. **Empezar por acá.**

**M2 — Premortem forzado (confianza alta). ✅ HECHO.**
Para decisiones que cruzan el gate de reversibilidad (irreversibles) o `caution`/`hold`, SIR pide una respuesta antes del veredicto: *"Imaginá que en 6 meses esto salió mal. ¿Qué pasó?"*. La respuesta alimenta la dimensión de riesgo/timing y queda registrada. Barato, alto rendimiento. Toca: UI `/decidir` + un campo en el registro de la decisión. Sin motor nuevo.

**M3 — Calibrador de esfuerzo por reversibilidad (confianza alta). ✅ HECHO** (`calibrate.ts`).
Ya existe el gate; falta que *module la interacción*. Reversible → SIR dice explícitamente "esto es una puerta de dos vías, no la sobre-pienses, decidí y ajustá" y acorta el flujo. Irreversible → activa M2 + más dimensiones + tono cauto. Toca: `engines/decision` (branch sobre el score de `reversibility`). Convierte el gate de filtro binario en regulador de UX.

**M4 — Maximizar vs satisficer (confianza media). ✅ HECHO** (`calibrate.ts`).
Según lo que está en juego (irreversibilidad × alineación con valores/ancla), SIR sugiere el modo: alto → "vale maximizar, tomate el tiempo"; bajo/reversible → "buscá suficiente-bueno y seguí; maximizar acá te cuesta paz, no resultado". Ayuda directamente contra la parálisis. Toca: `engines/decision` + `engines/priority` (para leer si toca un dominio prioritario). Regla pura, sin IA obligatoria.

**M5 — Decisiones pasadas parecidas + su resultado (confianza media). ✅ HECHO** (`similar.ts` + tabla decisions 0125).
Al evaluar, la memoria cross-session recupera decisiones previas similares (por dominio, dimensiones dominantes, personas involucradas) y, si `engines/learning` registró cómo salieron, lo trae: *"Algo parecido en marzo: elegiste hold y funcionó / te arrepentiste"*. Es el outside view contra la planning fallacy. Toca: memoria + `engines/learning`; requiere que las decisiones guarden outcome (campo `resultado` + revisión posterior). Más complejo porque necesita el *loop de feedback* del resultado real, no solo la decisión.

**M6 — Chequeo de coherencia con valores/identidad (confianza media). ✅ HECHO** (`valuesCheck.ts`).
Refuerzo de la dimensión `values`: cruzar la decisión contra `identity_profile` (anclas) y el ancla del año, y señalar disonancia explícita ("esto contradice tu ancla 'Mudarme con mi perro'"). No veta; nombra la tensión. Toca: `engines/decision` + `identity_profile` + goals con `esAncla`. Cuidado: los valores compiten entre sí; mostrar la tensión, no fingir que hay una respuesta limpia.

Orden sugerido: **M1 → M2 → M3** (todo prompt/UX, cero deuda de datos), luego **M4/M6** (reglas puras), y **M5** al final (necesita capturar outcomes en el tiempo).

## Modos de falla / qué NO hacer

- **No decidir por él.** SIR estructura, nombra sesgos, trae evidencia. El veredicto go/caution/hold es una *lectura*, no una orden. La decisión es de Aaron; el sistema pierde su valor el día que la gente le delega el juicio.
- **No dar falsa precisión numérica.** Un score de 8 dimensiones no es "73% correcto". Los pesos son juicios, las puntuaciones de la IA son aproximaciones. Mostrar el número como *estructura de conversación*, nunca como verdad decimal. Preferir rangos y "no tengo suficiente señal" a un número inventado.
- **No ignorar la emoción — es dato.** La incomodidad, el entusiasmo, el miedo NO son ruido a filtrar: la dimensión `peace` y `biological` existen porque el cuerpo sabe cosas antes que la razón. El error simétrico también aplica: la emoción es dato, no veredicto (el miedo puede ser aversión a la pérdida, no sabiduría).
- **Honestidad con la incertidumbre.** Cuando falta data (pocas dimensiones con señal, sin casos pasados, probabilidades desconocidas) SIR lo dice y baja su confianza. `insufficient_data` es una respuesta legítima y frecuente. Nunca rellenar vacíos con confianza fingida.
- **No sobre-deliberar lo reversible.** El fallo más silencioso: aplicar el arsenal completo (premortem, 8 dimensiones, análisis) a una puerta de dos vías. Eso quema Sistema 2, genera parálisis y contradice a Bezos. Si es reversible y barato, SIR debe empujar a **decidir rápido y ajustar**, no a analizar más.
- **No convertir el detector de sesgos en acusación.** Marcar "posible costo hundido" como pregunta abierta, no como "estás equivocado". El objetivo es activar el Sistema 2, no ganar la discusión.
