# 0011. LLM multi-proveedor + política de datos: costo sobre exclusividad de proveedor

- **Status:** Accepted
- **Date:** 2026-07-13
- **Deciders:** Aaron
- **Supersedes:** [0009](0009-privacidad-terceros.md) (en su punto de *ruteo de proveedor*; el resto de 0009 sigue vigente — ver "Qué de 0009 se conserva").

## Context

El costo de la API de Anthropic crece rápido y SIR llama a **un solo proveedor** (`@anthropic-ai/sdk`) desde ~30 rutas, cada una instanciando su cliente directo — sin capa de abstracción ni fallback. Dependencia total de un proveedor + costo alto. Existe una semilla multi-proveedor (`lib/sir/model.ts`: Anthropic + OpenRouter) pero solo la usa el chat.

Aaron quiere (a) poder consumir de **múltiples APIs** (varias baratas/gratis, muchas chinas: DeepSeek, Qwen, GLM, Kimi…) para no depender de Anthropic, y (b) que la app tenga una arquitectura clara donde la IA no sea el cimiento (ver [[0012-algoritmo-primero]]).

**La tensión (surfaced 2x antes de decidir):** ADR 0009 prohibía mandar contenido sensible de terceros a proveedores que sumen procesadores/entrenen con el input. Muchos tiers gratis **entrenan con lo que reciben**. En un Life OS **casi todo es personal**, y lo sensible **no es data de Aaron — es de terceros** (ciclo de la pareja, salud de la familia, chats privados de amigos) que **no consintieron**. Mandar eso a un corpus de entrenamiento extranjero es **irreversible**.

## Decision

**SIR prioriza costo y no-dependencia de un proveedor, aceptando explícitamente el riesgo de privacidad de terceros.**

1. **Capa de proveedor unificada** (`lib/llm/`, ver `docs/LLM_PROVIDER_ARCHITECTURE.md`): interfaz única + adaptadores (Anthropic nativo + OpenAI-compatible que cubre la mayoría de proveedores chinos) + **router por (tarea, costo)** + **fallback chain** (primario → alterno ante rate-limit/error). Esto solo ya elimina la dependencia de un proveedor.

2. **El contenido sensible de terceros PUEDE rutearse a proveedores baratos/extranjeros, incluidos los que entrenan con el input.** Es una **reversión consciente** del guardrail de 0009. Aaron lo decidió con el encuadre completo enfrente: *sabe que data íntima de su gente (ciclo, salud, conversaciones) puede quedar en el corpus de entrenamiento de un proveedor extranjero, de forma irreversible y sin consentimiento de esas personas, y prioriza el costo igual.*

3. **La `sensitivity` sigue siendo un dato de primera clase** en cada llamada — aunque ya NO se use para *excluir* proveedores, se conserva para: (a) ordenar la fallback chain (preferir el más confiable disponible para lo sensible), (b) poder revertir esta política sin re-cablear (si mañana se quiere volver a restringir, el flag ya está), (c) telemetría.

## Qué de 0009 se conserva (NO revertido)

- **A canales no-IA, sigue prohibido:** nada de PII/contenido de terceros a analytics (GA4), session replays (Clarity), logs server-side, ni query strings/URLs. La taxonomía tipada de eventos sigue encauzando esto.
- **RLS** sobre todas las tablas.
- La reversión es SOLO sobre *qué proveedor de IA* recibe lo sensible.

## Consequences

### Positive
- Costo por token cae fuerte (proveedores baratos + fallback) y se rompe la dependencia de Anthropic.
- La capa `llm/` es buena ingeniería per se (testeable, un punto de cambio, fallback ante caídas).
- El flag de sensibilidad deja la puerta abierta a revertir la política sin refactor.

### Negative (aceptadas)
- **Data íntima de terceros puede entrar a corpus de entrenamiento extranjeros, irreversible, sin su consentimiento.** Riesgo aceptado por Aaron.
- Jurisdicción/retención fuera de control (varios proveedores con localización en su país).
- Calidad variable entre proveedores → el router + evals importan para no degradar la experiencia en tareas sensibles.

## Alternatives considered

- **Local/no-training para lo sensible** (recomendación del asesor): lo sensible solo a Anthropic, a un modelo self-hosted (cómputo gratis, data no sale), o a APIs con no-training verificable; baratos-con-training solo para tareas sin PII. Conseguía casi todo el ahorro sin exponer a terceros. **Descartada por Aaron** a favor de máximo ahorro.
- **Mantener 0009** (solo Anthropic para sensible): descartada — es el costo que se quiere bajar.

## Referencias
- [[0012-algoritmo-primero]] (la otra palanca de costo/dependencia), `docs/LLM_PROVIDER_ARCHITECTURE.md` (spec técnica), `lib/sir/model.ts` (semilla actual).
