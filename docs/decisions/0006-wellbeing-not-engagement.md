# 0006. SIR optimiza bienestar relacional, NO engagement

- **Status:** Accepted
- **Date:** 2026-05-30
- **Deciders:** Aaron Huaynate (founder / sole maintainer)
- **Tags:** invariante, ética, ia, recomendaciones, producto

## Context

SIR V2 es un Life Operating System cognitivo-relacional: acumula un grafo de
memoria contextual sobre la vida del usuario (relaciones, estado biológico,
finanzas, objetivos) y, sobre ese contexto, genera **recomendaciones,
briefings, resúmenes y síntesis con LLM** (ver `/api/briefing/daily`,
`/api/person-briefing`, `/api/person-synthesis`, `/api/longitudinal/weekly`,
y los engines de `peace`/`recommendation`/`signal`).

Cualquier producto que (a) conoce profundamente a su usuario y (b) le
sugiere acciones, tiene un default gravitacional peligroso: **optimizar
engagement** — maximizar tiempo de uso, retención, "vuelve mañana". En el
dominio emocional/relacional eso degenera en dark patterns sutiles:
dependencia afectiva de la app, urgencia artificial, gamificación de los
vínculos, recomendaciones que sirven a la métrica de uso y no a la persona.

Este riesgo es **emergente y silencioso**: ninguna feature individual se
propone ser manipuladora, pero la suma de decisiones tomadas "para que use
más la app" produce un sistema que explota al usuario en vez de servirlo.

El principio "SIR optimiza bienestar, no engagement" ya existía como
**principio fundacional #1** en `docs/BACKLOG.md` y ya está **operativo en
el código**: cada system prompt LLM que se escribió lo enforza explícitamente
(prohibición de tácticas de urgencia/manipulación, sugerencias orientadas al
descanso y al cuidado del vínculo, no a "engancharse"). Falta **pinearlo como
invariante formal** antes de:

- abrir SIR a familia / beta (más usuarios = más presión por "crecer"),
- agregar más capas cognitivas (Fase 3d RAG, Fase 5 IA) que amplifican el
  poder de sugerencia,
- evaluar las ideas de brainstorm (skills evolutivas, SkillOpt) que tienen
  riesgo ético explícito.

## Decision

**SIR optimiza el bienestar del usuario (relacional, biológico, financiero,
emocional), NUNCA métricas de engagement o de uso.** Es un invariante del
sistema: toda feature, engine, recomendación, captura, prompt y experimento
futuro debe servir al wellbeing del usuario, aunque eso reduzca el tiempo de
uso o la "pegajosidad".

### Qué está PROHIBIDO (no negociable)

- **Dark patterns / manipulación**: urgencia artificial, FOMO, culpa,
  notificaciones diseñadas para reenganchar, "streaks" que castigan.
- **Dependencia afectiva**: posicionar a SIR como sustituto de vínculos
  humanos o crear necesidad emocional de la app.
- **Gamificación de los vínculos**: puntajes/competencia que conviertan las
  relaciones en métricas a "ganar".
- **Decisiones médicas o diagnóstico clínico**: SIR observa y describe, no
  diagnostica ni prescribe (ver enforcement en los prompts).
- **Recomendaciones que sirven a la métrica, no a la persona**: sugerir algo
  porque aumenta el uso de SIR en vez de porque le hace bien al usuario.

### Qué SÍ se optimiza

Paz / bienestar observable: descanso, calidad de los vínculos, progreso hacia
objetivos propios del usuario, claridad. El norte es que el usuario **viva
mejor**, idealmente necesitando *menos* a SIR con el tiempo, no más.

### Cómo se enforza hoy (precedentes en código)

- Todos los system prompts de IA incluyen la cláusula de bienestar + la
  prohibición de manipulación y de consejo médico:
  `src/lib/daily-briefing/prompt.ts`, `src/lib/person-briefing/prompt.ts`,
  `src/lib/person-synthesis/prompt.ts`, `src/lib/longitudinal/prompt.ts`.
- Las sugerencias accionables se piden explícitamente "orientadas al
  bienestar, nunca una táctica para engancharse más con la app".
- La correlación lunar/ciclo se limita a "observada, no causa" y prohíbe
  astrología prescriptiva o patologizar conducta ajena.

### Cómo se aplica a futuro

Toda PR que introduzca una feature con potencial de engagement (notificaciones,
recordatorios, streaks, scoring social, sugerencias proactivas) debe poder
responder: *"¿esto sirve al bienestar del usuario o a que use más SIR?"* Si la
respuesta honesta es la segunda, no se mergea. Este ADR es el criterio.

## Consequences

### Positive

- **Guardrail ético explícito y citable** en cada decisión futura — convierte
  un principio implícito en un test concreto para PRs y prompts.
- **Confianza del usuario** (y de la familia/beta): SIR maneja datos íntimos;
  el invariante es la base del consentimiento informado (ver principio #3,
  privacidad por defecto).
- **Coherencia con lo ya construido**: formaliza lo que los prompts LLM ya
  hacen, evitando que una futura feature lo contradiga por inercia.
- **Frena la deriva**: las ideas de mayor riesgo ético (SkillOpt con
  autoedición sobre la vida sentimental) quedan medidas contra este invariante.

### Negative

- **Renuncia consciente a palancas de growth-hacking** (streaks, FOMO,
  notificaciones reenganchadoras). Si algún día se busca "crecer" SIR como
  producto masivo, este invariante limita el toolkit. Aceptado: SIR es,
  primero, una herramienta de bienestar personal.
- **Algunas features "pegajosas" útiles quedan vetadas o requieren rediseño**
  para servir al wellbeing sin explotar atención. Costo de fricción aceptado.
- **El criterio "sirve al bienestar vs al uso" tiene zona gris**: requiere
  juicio honesto en cada caso, no es una regla mecánica. Aceptado: el ADR da
  el norte; el maintainer arbitra los casos límite.

## Alternatives considered

### A1. No formalizar (dejarlo como principio en el BACKLOG)

El principio ya estaba escrito en `BACKLOG.md`. Pero el BACKLOG es un
documento operativo cambiante y regenerado; un invariante del sistema merece
un ADR estable y citable que no se "desvanezca". **Descartado** — el riesgo
de drift silencioso es exactamente lo que un ADR previene.

### A2. Optimizar engagement (el default de la industria)

Maximizar retención/uso. **Descartado por diseño**: en un dominio emocional
con datos íntimos, optimizar engagement produce manipulación emergente y
traiciona el propósito de SIR. Es el anti-objetivo.

### A3. Principio más débil ("no manipular activamente")

Una versión laxa que solo prohíbe manipulación explícita. **Descartado**: el
problema no es solo la manipulación intencional sino la deriva por inercia
hacia métricas de uso. El invariante debe ser positivo (optimizar bienestar),
no solo negativo (no manipular).

## References

- `docs/BACKLOG.md` → Principios Fundacionales #1 (origen de este invariante)
  y la idea de brainstorm "ADR formal 'SIR optimiza bienestar, NO engagement'".
- Prompts que ya enforzan el invariante: `src/lib/daily-briefing/prompt.ts`,
  `src/lib/person-briefing/prompt.ts`, `src/lib/person-synthesis/prompt.ts`,
  `src/lib/longitudinal/prompt.ts`.
- [[0002-rich-context-snapshot]] — el agregador de contexto que alimenta las
  recomendaciones que este invariante gobierna.
