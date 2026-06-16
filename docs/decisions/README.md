# Architecture Decision Records (ADRs)

Este directorio contiene los ADRs de SIR V2. Un ADR es un documento corto que registra **una decisión arquitectónica significativa**, el contexto en que se tomó, las alternativas consideradas, y las consecuencias aceptadas.

## Por qué ADRs

Sin ADRs, las decisiones se desvanecen en chats, PRs y en la cabeza de quien las tomó. Seis meses después nadie recuerda **por qué** algo se eligió, y se revierte sin entender el costo.

Un ADR responde tres preguntas que el código no responde:

1. **¿Qué se decidió?**
2. **¿Por qué se decidió eso y no otra cosa?** (las alternativas son la parte más valiosa)
3. **¿Qué se acepta como costo?**

## Cuándo escribir un ADR

Escribe un ADR si la decisión:

- **Es difícil de revertir.** Cambia la forma de la base de código o cómo se opera el sistema.
- **Tiene alternativas serias.** Si solo había un camino, no es decisión, es ejecución.
- **Afecta a futuros consumidores.** Si alguien que entra al proyecto va a preguntar "¿por qué así?", merece ADR.

No escribas ADR para: elección de variable name, decisión local de un módulo, refactor sin cambio de invariante.

## Formato

Usamos [MADR](https://adr.github.io/madr/) (Markdown Architecture Decision Records). Plantilla mínima:

```markdown
# {N}. {Título breve en imperativo}

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Deciders:** {nombres o roles}

## Context

{Por qué necesitamos decidir. Qué problema o restricción genera esta decisión ahora.}

## Decision

{Lo que decidimos hacer, en una frase, y luego el detalle.}

## Consequences

### Positive
- ...

### Negative
- ...

## Alternatives considered

### Alternativa A
{Qué era, por qué la descartamos.}

## References

{Links a discusiones, papers, repos de referencia.}
```

## Numeración

- ADRs van numerados secuencialmente desde `0001`.
- El número **nunca se reusa**, incluso si un ADR es deprecado.
- Archivo: `NNNN-titulo-en-kebab-case.md` — ejemplo: `0001-zustand-state-management.md`.

## Ciclo de vida

| Status | Significado |
|---|---|
| `Proposed` | Borrador en discusión. PR abierto. |
| `Accepted` | Decisión vigente. Mergeada. |
| `Deprecated` | Ya no aplica, pero no fue reemplazada por otra. Se documenta por qué se abandonó. |
| `Superseded by ADR-XXXX` | Una ADR posterior la reemplaza. El ADR original se mantiene como historia. |

**Nunca se borra un ADR.** Si la decisión cambió, se crea un ADR nuevo y el viejo cambia a `Superseded by ADR-XXXX`.

## Índice

El índice se mantiene como tabla rápida; el sistema Living Roadmap también lista los ADRs en `MASTER_PLAN.md`.

| # | Título | Status | Fecha |
|---|---|---|---|
| [0001](0001-zustand-state-management.md) | Zustand como gestor de estado global en SIR V2 | Accepted | 2026-05-20 |
| [0002](0002-rich-context-snapshot.md) | RichContextSnapshot: agregador centralizado para consumir estado vivo | Accepted | 2026-05-22 |
| [0003](0003-client-only-debug-panel.md) | RichContextDebugPanel renderizado client-only para evitar hydration mismatch | Accepted | 2026-05-23 |
| [0004](0004-context-snapshot-history.md) | Context Snapshot History: store separado y captura por eventos | Accepted | 2026-05-25 |
| [0005](0005-timeline-architecture.md) | Arquitectura del Timeline (Fase 3a): multi-query paralela, estado en React, shape unificada | Proposed | 2026-05-28 |
| [0006](0006-wellbeing-not-engagement.md) | SIR optimiza bienestar relacional, NO engagement | Accepted | 2026-05-30 |
| [0007](0007-scope-finanzas-salud.md) | Scope de Finanzas y Salud: salud se queda (Etapa 3); finanzas se congela como input de bienestar, no pilar | Accepted | 2026-06-08 |
| [0008](0008-analytics-ga4-clarity.md) | Analytics GA4 + Clarity (tensión de privacidad aceptada; Clarity masking estricto obligatorio) | Accepted | 2026-06-09 |
- [0009 — Privacidad de terceros: SIR usa la data sensible para asistir, con límites de exposición](./0009-privacidad-terceros.md)
