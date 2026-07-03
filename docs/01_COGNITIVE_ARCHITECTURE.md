# 01 — COGNITIVE ARCHITECTURE
# SIR V2 — Cómo Piensa el Sistema

---

## Cómo Piensa SIR V2

SIR V2 no es un sistema reactivo. Es un sistema anticipatorio.

Procesa información en capas:
1. **Percepción** — recibe datos (señales, registros, eventos)
2. **Contextualización** — construye contexto situacional
3. **Memoria** — conecta con memoria episódica y emocional
4. **Modelado** — actualiza el modelo dinámico del usuario
5. **Razonamiento** — aplica cognitive personas al problema
6. **Timing** — evalúa el momento correcto para actuar
7. **Recomendación** — genera recomendación accionable
8. **Paz** — evalúa impacto en el Peace Score

---

## Cognitive Personas

SIR V2 razona a través de múltiples lentes simultáneas:

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

SIR V2 evalúa cada decisión importante en función de:

1. **Alineación con objetivos** — ¿esto me acerca a mis metas?
2. **Impacto en relaciones** — ¿cómo afecta a mis relaciones clave?
3. **Costo biológico** — ¿cuánta energía consume?
4. **Impacto financiero** — ¿cómo afecta mi estabilidad económica?
5. **Paz mental** — ¿aumenta o reduce mi nivel de paz?
6. **Timing** — ¿es el momento correcto?
7. **Reversibilidad** — ¿es reversible si me equivoco?

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

## Lo que le falta a la base científica (identificado 03-07)

El pipeline es hoy una **pasada hacia adelante**. Faltan tres cosas para que sea
un sistema cognitivo cerrado, no solo un asesor:

### 1. Capa 9 — Aprendizaje / Retroalimentación (el mayor faltante)
El bucle no se cierra: SIR recomienda o evaluás una decisión, pero **no observa
el RESULTADO** (¿subió tu paz/energía después de actuar?) para **ajustar** sus
pesos y su confianza. Es "la parte analítica que cierra el loop":

```
… → Recomendación → (actuás) → Resultado observado → ¿mejoró la paz? →
      → ajusta la confianza de ese tipo de recomendación / de esa lente
```

El cerebro-grafo ya aprende de tus confirmaciones (Hebbian, F3); falta
**generalizarlo a recomendaciones y decisiones**: registrar outcome + aprender
qué consejos, en qué contexto, efectivamente te suben la paz. → **A8 en el plan.**

### 2. Confianza / incertidumbre como principio transversal
Los motores nuevos (reasoner, predictivo, decisión) ya reportan confianza, pero
no está como PRINCIPIO: SIR debe decir cuán seguro está y degradar con honestidad
(el patrón `insufficient` ya existe en varios). Documentado acá como norma.

### 3. Alineación con VALORES/identidad (no solo objetivos)
El evaluador de decisión mide "alineación con objetivos"; falta una dimensión de
**alineación con tus valores/identidad** (el Arquitecto de Identidad como ancla,
usando `identity_profile`). Extensión natural del evaluador (A4).
