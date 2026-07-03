# 01 — COGNITIVE ARCHITECTURE
# SIR V2 — Cómo Piensa el Sistema

---

## Cómo Piensa SIR V2

SIR V2 no es un sistema reactivo. Es un sistema anticipatorio **que aprende de
sus propios resultados** — el pipeline no es una pasada hacia adelante, es un
bucle cerrado.

Procesa información en capas:
1. **Percepción** — recibe datos (señales, registros, eventos)
2. **Contextualización** — construye contexto situacional
3. **Memoria** — conecta con memoria episódica y emocional (incl. memoria
   **cross-session**: recuerda lo conversado en sesiones anteriores)
4. **Modelado** — actualiza el modelo dinámico del usuario
5. **Razonamiento** — aplica cognitive personas al problema
6. **Timing** — evalúa el momento correcto para actuar
7. **Recomendación** — genera recomendación accionable
8. **Paz** — evalúa impacto en el Peace Score
9. **Aprendizaje** — observa el RESULTADO de lo actuado (¿subió la paz/energía?)
   y **ajusta la confianza** de ese tipo de recomendación/lente. Acá el bucle se
   cierra: la salida vuelve a entrar como aprendizaje.

```
Percepción → … → Recomendación → (Aaron actúa) → Resultado observado
     ↑                                                      │
     └──────────────  Aprendizaje ajusta pesos  ◄───────────┘
```

---

## Cognitive Personas

SIR V2 razona a través de múltiples lentes simultáneas (hasta 5, elegidas según
el dominio del foco). Resumen abajo; **cada lente en profundidad — su marco,
cuándo se activa y su modo de falla — en `docs/10_COGNITIVE_PERSONAS.md`.**

### Psicólogo
- Lee emociones, patrones de comportamiento, motivaciones profundas
- Detecta sesgos cognitivos y ciclos emocionales
- Entiende apego, trauma y respuestas relacionales

### Antropólogo
- Observa rituales sociales, dinámicas grupales, contexto cultural
- Entiende jerarquías relacionales y roles sociales
- Lee las reglas no escritas de cada entorno

### Historiador
- Conecta decisiones presentes con patrones del pasado
- Identifica ciclos que se repiten
- Construye narrativa coherente del self en el tiempo

### Estratega
- Piensa en tableros de largo plazo
- Mapea aliados, neutrales y adversarios
- Evalúa riesgo vs. oportunidad

### Operador
- Prioriza acciones concretas sobre análisis
- Convierte insight en plan
- Gestiona energía y tiempo como recursos limitados

### Coach
- Acompaña sin juzgar
- Desafía creencias limitantes
- Refuerza identidad y dirección

### Analista Sistémico
- Ve los sistemas detrás de los síntomas
- Detecta bucles de retroalimentación
- Modeliza causa → efecto → consecuencia

### Entrenador Deportivo
- Optimiza rendimiento biológico y mental
- Gestiona carga, recuperación y pico de forma
- Mide progreso con métricas

### Maestro de Finanzas
- Entiende flows de dinero como flows de energía
- Evalúa decisiones financieras con contexto personal
- Anticipa riesgos y oportunidades económicas

### Táctico
- Opera en el corto plazo con visión del largo
- Gestiona timing de conversaciones y decisiones
- Maximiza resultados con recursos disponibles

### Biólogo Humano
- Entiende el cuerpo como sistema
- Conecta sueño, nutrición y ejercicio con rendimiento
- Lee señales biológicas como datos

### Arquitecto de Identidad
- Define quién quiero ser
- Alinea decisiones con valores y misión
- Protege la identidad de influencias externas disruptivas

---

## Razonamiento Sistémico

Cada decisión o situación se evalúa en múltiples dimensiones:

```
SITUACIÓN
    ↓
¿Qué señales hay? (Signal Engine)
    ↓
¿Qué contexto existe? (Context Engine)
    ↓
¿Qué recuerdo de esto? (Memory System)
    ↓
¿Cómo me afecta esto? (Self Model)
    ↓
¿Cuál es el timing correcto? (Timing Engine)
    ↓
¿Cuál es la recomendación? (Recommendation Engine)
    ↓
¿Cómo impacta en mi paz? (Peace Engine)
```

---

## Toma de Decisiones

SIR V2 evalúa cada decisión importante en **8 dimensiones ponderadas** por la
jerarquía de prioridades (abajo). La IA puntúa cada dimensión (-2..+2), el motor
puro (`engines/decision`) computa el ponderado y el veredicto (go/caution/hold):

1. **Paz mental** — ¿aumenta o reduce mi nivel de paz? (meta-objetivo)
2. **Alineación con valores/identidad** — ¿es coherente con quién quiero ser?
   (ancla en `identity_profile` — el Arquitecto de Identidad como juez)
3. **Costo biológico** — ¿cuánta energía consume?
4. **Impacto financiero** — ¿cómo afecta mi estabilidad económica?
5. **Alineación con objetivos** — ¿esto me acerca a mis metas?
6. **Impacto en relaciones** — ¿cómo afecta a mis relaciones clave?
7. **Timing** — ¿es el momento correcto?
8. **Reversibilidad** — ¿es reversible si me equivoco?

**Gate de reversibilidad:** una decisión irreversible con señales mixtas NO pasa
a "go" aunque el ponderado dé positivo — lo irreversible pide más cuidado
(*one-way doors*). Ver `docs/14_DECISION_SCIENCE.md`.

---

## Prioridad de Objetivos

```
NIVEL 0: Paz mental (meta-objetivo)
NIVEL 1: Salud biológica
NIVEL 2: Estabilidad financiera
NIVEL 3: Objetivos personales clave
NIVEL 4: Objetivos relacionales
NIVEL 5: Optimización continua
```

---

## Relación entre Sistemas

```
Self ←→ Relationships ←→ Goals
  ↕           ↕              ↕
Biology ←→ Finances ←→ Peace
  ↕           ↕              ↕
Memory ←→ Signals ←→ Recommendations
```

Todo está conectado. Una señal biológica puede afectar una decisión financiera.
Un evento relacional puede impactar el estado de paz.
El sistema ve estas conexiones y las usa.

---

## Estado de implementación (2026-07-03)

La infraestructura ("el cuerpo") está en prod. La **capa cognitiva ("la mente")**
que unifica todo se construyó en el sprint del 03-07 (ver `docs/BUILD_PLAN.md`):

| Capa / componente | Motor | Estado |
|---|---|---|
| Percepción (señales/capturas) | `engines/signal`, `lib/capture/*` | ✅ |
| Contextualización (snapshot) | `engines/context/builder` | ✅ |
| Memoria (+ cerebro-grafo F1-F4) | `engines/memory`, `lib/brain/*` | ✅ |
| **Razonamiento (12 lentes)** | `lib/reasoner` + `POST /api/reason` ("Pensar con SIR") | ✅ A1 |
| Timing | `engines/timing` | ✅ |
| Recomendación | `engines/recommendation` (ordena por jerarquía A3) | ✅ |
| Paz (+ trend real) | `engines/peace` (`computePeaceTrend`) | ✅ A6 |
| **Orquestador del pipeline** | `engines/orchestrator` ("Foco ahora" en /panel) | ✅ A2 |
| **Jerarquía de prioridades** | `engines/priority` (Paz>Salud>…>Optimización) | ✅ A3 |
| **Evaluador de decisión (7 dim + reversibilidad)** | `engines/decision` + `/decidir` | ✅ A4 |
| **Motor predictivo** | `engines/predictive` (proyección de series) | ✅ A5 |
| **Modelo del self dinámico** | `engines/self-model` ("Tu momento") | ✅ A7 |
| **Aprendizaje / loop cerrado (Capa 9)** | `engines/learning` (`computeEffectiveness` + `adjustByLearning`) + `useFeedbackStore` | ✅ A8 |
| **Alineación con valores (8ª dim de decisión)** | `engines/decision` (dimensión `values`, ancla `identity_profile`) | ✅ A4b |
| **Memoria cross-session** | `sir_conversations` + recall en `/api/sir/ask` | ✅ C3 |

El pipeline **ya es un bucle cerrado**: los tres faltantes que este doc marcaba en
el sprint del 03-07 (Capa 9 de aprendizaje, valores como dimensión, memoria que
recuerda entre sesiones) **están construidos**. Lo que sigue es *profundizar*, no
*completar el esqueleto*.

---

## Principios transversales

Valen para TODOS los motores. No son features, son cómo SIR se comporta:

1. **Confianza / incertidumbre honesta.** Cada salida reporta cuán seguro está.
   Cuando no hay muestra suficiente, SIR dice `insufficient` en vez de inventar
   (existe en predictivo, self-model, alignment, patrones). *Preferimos callar a
   afirmar de más.*
2. **Aditivo, nunca pisa lo manual.** Lo que SIR extrae/propone llega como
   propuesta editable que SUMA; jamás sobrescribe lo que Aaron escribió a mano
   (ver `docs/08_UX_SYSTEM.md`).
3. **Aprende de lo que funciona.** El resultado observado ajusta la confianza
   (Capa 9 + Hebbian del cerebro-grafo). Lo que te sube la paz pesa más la
   próxima vez.
4. **Aislamiento de lo sensible.** Lo íntimo (`self_diagnosis`, notas privadas)
   NO va a IA/embeddings/dossier. La privacidad es de diseño, no opcional.
5. **Observar antes de anticipar.** Primero se muestra el patrón con el `n` a la
   vista; recién con datos suficientes se proyecta.

---

## Fundamento teórico de cada motor

Cada motor se apoya en teoría con nombre (no en intuición suelta). Los dominios
profundos viven en sus propios docs (11–15):

| Motor / componente | Fundamento | Doc |
|---|---|---|
| `engines/biological`, sueño/energía | Cronobiología (modelo de dos procesos, cronotipos) | `11_CHRONOBIOLOGY` |
| `engines/alignment`, goals, hábitos | Cambio de comportamiento (Fogg B=MAP, WOOP, SDT) | `12_BEHAVIOR_CHANGE` |
| `engines/peace`, mood/stress, recovery | Regulación emocional (Gross, ventana de tolerancia, HRV) | `13_EMOTION_REGULATION` |
| `engines/decision` (8 dim + gate) | Ciencia de la decisión (Kahneman, one-way doors, premortem) | `14_DECISION_SCIENCE` |
| `engines/relationship`, reciprocidad, kinship, grafo | Inteligencia relacional (apego, Dunbar, Granovetter, Gottman) | `15_RELATIONAL_INTELLIGENCE` |
| Comunicación/posicionamiento + defensa (reasoner, grafo) | Influencia e inteligencia social (Milgram, Zimbardo, Cialdini, agenda-setting) | `16_INFLUENCE_SOCIAL_INTELLIGENCE` |
| Las 12 lentes | Panel cognitivo (cada persona con su marco) | `10_COGNITIVE_PERSONAS` |

---

## Hoja de ruta científica (lo que sigue)

El esqueleto está cerrado; ahora se agranda **por capas/módulos**, cada uno
documentado en su doc con "qué construir por partes" y su señal de confianza:

- **Profundizar las 12 lentes** — de etiquetas a marcos rigurosos (qué mide cada
  una, sus pensadores, cuándo se activa, sus modos de falla).
- **11 Cronobiología** — cronotipo real desde tu sueño, curva de energía por hora,
  jet-lag social, ventana de foco.
- **12 Cambio de comportamiento** — la señal→prompt del hábito en el momento
  correcto, fricción del próximo paso, drift temprano.
- **13 Regulación emocional** — detectar salida de la ventana de tolerancia y
  ofrecer la estrategia correcta (no consejo genérico).
- **14 Ciencia de la decisión** — detectar sesgos activos, forzar premortem,
  traer decisiones pasadas parecidas.
- **15 Inteligencia relacional** *(el norte)* — capas de Dunbar, balance de
  reciprocidad, salud del vínculo, lógica distinta para afectivo vs profesional.

Cada ítem entra a SIR como un módulo puro + su consumidor, con la misma disciplina
del resto: testeado, honesto con la incertidumbre, aditivo.
