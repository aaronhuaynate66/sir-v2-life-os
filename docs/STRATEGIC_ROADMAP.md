# SIR — Strategic Evolution Roadmap

> **Captura del roadmap estratégico v1.0** (antes vivía solo en un HTML externo, fuera del repo).
> Documento de **dirección de largo plazo** — el arco por capas, no la lista de features.
> Para el estado táctico sesión-a-sesión ver [`BACKLOG.md`](./BACKLOG.md). `MASTER_PLAN.md` lo regenera el bot desde issues/milestones — no es source of truth.
>
> Cada etapa lleva un bloque **Estado (2026-05-31)** con evaluación HONESTA anclada en el código real del repo, no en aspiración.

---

## Actualización 2026-06-08 (re-sync con el push de junio)

> Los bloques "Estado (2026-05-31)" de abajo siguen válidos en lo esencial; esto registra lo entregado entre el 1 y 7 de junio. Detalle táctico en [`BACKLOG.md`](./BACKLOG.md).

- **Etapa 1 (relacional):** aún más superada — cockpit `/horario` Día/Semana/Mes, síntesis narrativa de la ficha (serie GEMA), familia como vínculo real, motor de proactividad "Hoy con tu gente" ponderado por parentesco.
- **Etapa 2 (memoria semántica):** **SIN CAMBIOS — sigue DORMIDA** por falta de `OPENAI_API_KEY`. Continúa siendo el bloqueo de mayor ROI.
- **Etapa 3 (comportamiento):** más sembrada — ingesta Apple Health (archivo + Health Auto Export), capturas de sueño/FC, módulo `/seguimiento` (trackers con alertas).
- **Etapa 4 (identidad/alineación):** progresa — objetivos SMART + tareas "Jira-light" estructuradas (acercan los Human OKRs medibles), señales TAGGED cableadas al panel de Alineación, onboarding/anclas de identidad en `/yo`.
- **Tensión Principio #4 (scope):** el push de junio amplió superficies (salud, seguimiento; finanzas ya existía). Refuerza la necesidad de la decisión de scope pendiente.

---

## Visión

Evolucionar de una herramienta de **inteligencia relacional** a un **AI-Native Human Operating System**: un sistema que acompaña a la persona a lo largo de la vida, no una app de features sueltas.

El crecimiento es **por capas, no por features**. Cada etapa añade una capa cognitiva sobre la anterior (relaciones → memoria → comportamiento → identidad → dirección de vida → OS). El **wedge inicial** —la cuña por donde se entra al mercado y al hábito— es **SIR Lite**: inteligencia relacional mínima pero real.

---

## Principios (invariantes de diseño)

1. **Primero relaciones.** El vínculo humano es el núcleo; todo lo demás orbita alrededor.
2. **Memoria > chat.** El valor está en lo que el sistema recuerda y conecta en el tiempo, no en una conversación efímera.
3. **La IA asiste, no controla.** Ofrece perspectiva; el humano decide. Nada se auto-modifica ni dicta conducta.
4. **Claridad conceptual / evitar scope infinito.** Cada capa tiene un límite definido. Resistir la tentación de ser "todo para todos" antes de tiempo.
5. **Privacidad radical.** Datos del usuario y de terceros protegidos por defecto (RLS, consentimiento explícito).
6. **Aumentar la humanidad.** SIR existe para que la persona sea más ella misma, no para capturar su atención.

---

## Las 6 Etapas

### Etapa 1 — SIR Lite / Relational Intelligence MVP `(0–12 meses)`
Personas, timeline, contexto emocional, recordatorios, IA básica. El wedge.

**Estado (2026-05-31): ✅ SUPERADA.**
En producción y excedida respecto del MVP planteado: `/relaciones` (CRUD + grafo `/red/grafo`), `/timeline` cursor-based, detail page por persona **completo** (score relacional, ciclo, cumpleaños, última interacción, registro rápido, registrar interacción, vida prof/social/personal, fechas importantes, bitácora). Recordatorios accionables vía **Agenda "Próximo"** (`/agenda` + `/panel`). IA básica operativa (captura WhatsApp/Instagram/LinkedIn por Vision, briefing diario en Mission Control). La capa relacional ya está madura.

---

### Etapa 2 — Relational Memory Engine `(12–24 meses)`
Memoria semántica + embeddings, relationship graph, recuperación contextual, detección de evolución del vínculo.

**Estado (2026-05-31): 🟡 CONSTRUIDA, con la búsqueda semántica DORMIDA.**
- **Memoria:** tabla `memories` + engine (`queryMemories`/`decayMemories`/`buildMemoryContext`), derivación desde `observations` (`POST /api/memories/derive`, Anthropic + fallback determinístico), memorias asociadas por persona en el detail page. ✅ vivo.
- **Embeddings / búsqueda semántica:** **code-complete pero DORMIDA.** pgvector + columna `memories.embedding` (migración 0015), `src/lib/embeddings/client.ts`, `POST /api/memories/embed`, `POST /api/search` y la página `/buscar` existen — pero **requieren `OPENAI_API_KEY`** (OpenAI `text-embedding-3-small`, server-side) que **no está configurada**. Sin la key, el camino lanza error claro y no embeddea. **Activar = cargar la key + correr el embed sobre la data existente.**
- **Relationship graph:** `/red/grafo` en prod.
- **Recuperación contextual:** sin embeddings activos es por filtros/recencia, no semántica.
- **Detección de evolución:** parcial — correlaciones longitudinales (Fase 3c) y resumen semanal, pero no un tracking estructurado del cambio del vínculo en el tiempo.
- **Schema:** ✅ **prod 100% sincronizado con el repo** (drift de migraciones reconciliado el 31/05; `0012` restaurada vía `0022`, sin migraciones pendientes — 21/21 índices, `whatsapp_web`/`social` en sus enums, realtime y policies completos). El único bloqueo de E2 es la key, no el esquema.

**Eslabón faltante para cerrar E2:** activar 3b (key + embeddings sobre `observations`/`memories`) y la búsqueda semántica real. **No hay deuda de schema.**

---

### Etapa 3 — Behavioral Intelligence `(24–36 meses)`
Hábitos, energía, consistencia, reflection/retrospectives, emotional analytics.

**Estado (2026-05-31): 🟢 SEMBRADA (cimientos en prod, sin ser todavía una capa completa).**
- **Engines de comportamiento:** `biological` (recovery score, sleep debt, consistencia), `peace` (Peace Score compuesto — número central), `signal` (ranking de señales) — todos vivos en `/panel` y testeados.
- **Reflection / retrospectives:** **briefing diario** accionable (Fase 5, Mission Control) + **resumen longitudinal semanal** (tabla `longitudinal_summaries`, migración 0016).
- **Emotional analytics:** self-metrics + **charts de tendencias** SVG (`/yo`, `/finanzas`), correlación longitudinal **Fase 3c** (`person_logs` × fase lunar × ciclo) en el detail page.
- **Energía / consistencia:** capturadas vía `self_metrics` + `person_logs` (mood/energy/sleep/pain).

**Lo que falta para "completarla":** hábitos como primitiva de primera clase, retrospectivas estructuradas (no solo el resumen auto), y analytics emocional que cierre el loop con recomendaciones. Hoy son cimientos sólidos, no la capa terminada.

---

### Etapa 4 — Identity & Alignment `(36–60 meses)`
Human OKRs, Alignment Engine (incoherencia valores ↔ conducta), Narrative Intelligence.

**Estado (2026-05-31): 🟡 ARRANCADA (Alignment Engine MVP en prod).**
- **Alignment Engine MVP:** engine puro `src/engines/alignment/` que deriva, por objetivo activo, un estado (`aligned` / `drifting` / `needs_attention` / `insufficient_data`) desde señales observables reales (frecuencia de contacto, estado de relación, impacto energético) cuando el objetivo está vinculado a personas (`goal.relatedPersons`). Capa narrativa reflexiva opcional (`POST /api/alignment/narrative`, Anthropic; el LLM solo reformula señales reales, no inventa la brecha; invariantes anti-culpa). Panel "Alineación" en `/objetivos` + **selector de personas** en el form de objetivos (cierra el eslabón que dejaba al engine inerte).
- **Pendiente de E4:**
  - **Human OKRs estructurados** (objetivos con key-results medibles, hoy el goal es título + progreso libre).
  - **Narrative Intelligence** (narrativa longitudinal de identidad, no insights puntuales).
  - **Delta de score** (la incoherencia usa el estado actual, no la tendencia: falta historial/snapshots del relationship score).
  - **Tono de interacción** desde `person_logs` (hoy Supabase-only, no llega al engine client-side).
  - **Inferencia LLM de dominio/persona** para objetivos de texto libre sin vínculo estructurado (deliberadamente fuera del MVP para no inventar brechas).

---

### Etapa 5 — Life Direction System `(5–10 años)`
Continuidad narrativa: quién eras, quién sos, hacia dónde vas. El sistema sostiene el hilo de la vida.

**Estado (2026-05-31): ⬜ NO INICIADA.**
Requiere E4 madura (identidad + alineación estructuradas) como sustrato.

---

### Etapa 6 — AI-Native Human OS `(10+ años)`
La capa final: SIR como sistema operativo humano nativo de IA.

**Estado (2026-05-31): ⬜ NO INICIADA.** Visión norte, no roadmap accionable todavía.

---

## ⚠️ Tensión con el Principio #4 (scope) — decisión de producto ABIERTA

Hay módulos en prod que **empujan hacia un "life OS" antes de tiempo** y conviven en tensión con el principio de claridad conceptual / evitar scope infinito:

- **Finanzas** (`/finanzas`: movimientos, multi-moneda PEN/USD, `financial` engine, charts) es robusto y útil, pero **no pertenece al arco relacional→identidad** de las etapas. Es una capa "life OS" adelantada.
- En menor medida, salud/báscula (`health_metrics`, captura báscula) apunta a lo mismo.

**Lectura honesta:** esto **no es necesariamente un error** —puede ser parte del wedge de retención personal del propio Aaron— pero **debe ser una decisión de producto explícita**, no un hecho consumado por inercia. Preguntas abiertas: ¿finanzas/salud son parte del producto SIR o un anexo personal? ¿Se mantienen, se modularizan (toggle) o se acotan para no diluir el foco relacional? **Se deja como decisión de producto pendiente, no como dirección establecida.**

---

## Cómo leer este documento

- **Etapas:** dirección de largo plazo (este archivo).
- **Backlog táctico:** [`BACKLOG.md`](./BACKLOG.md) — qué se hizo, qué sigue, sesión a sesión.
- **Decisiones formales:** [`docs/decisions/`](./decisions/) (ADRs).
- **MASTER_PLAN.md:** generado por el bot desde issues/milestones — vista, no fuente.

_Actualizar el bloque "Estado (YYYY-MM-DD)" de cada etapa cuando cambie la realidad del código. Commit `docs(roadmap): <cambio>`._
