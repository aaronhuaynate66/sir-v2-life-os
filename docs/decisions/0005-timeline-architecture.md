# 0005. Arquitectura del Timeline (Fase 3a) — multi-query paralela, estado en React, shape unificada

- **Status:** Proposed
- **Date:** 2026-05-28
- **Deciders:** Aaron Huaynate (founder / sole maintainer)
- **Tags:** frontend, supabase, query-strategy, fase-3a

## Context

Fase 3a — Historial Profundo — introduce una ruta `/timeline` que muestra
una vista longitudinal heterogénea de hasta 8 tipos de evento provenientes
de 9 tablas de Supabase (`memories`, `self_metrics`, `health_metrics`,
`sleep_records`, `finance_movements`, `signals`, `goals`, `people`,
`relationships`). Cada tipo tiene su propio esquema, columna de timestamp
canónica e índice secundario.

El diseño completo está en
[`docs/phase-3a/issue-69-analysis-design.md`](../phase-3a/issue-69-analysis-design.md).
Este ADR registra **tres decisiones arquitectónicas** que sostienen ese
diseño y que son difíciles de revertir sin refactor amplio.

Restricciones que enmarcan las decisiones:

1. **Cliente Next.js 15 (App Router), Supabase como único backend.**
2. **Stores Zustand existentes son offline-first** (localStorage + sync a
   Supabase via [`attachSupabaseSync`](../../src/lib/supabase/sync/index.ts)).
3. **Sin presupuesto para infra adicional** en Fase 3a (sin nuevo backend,
   sin Edge Functions, sin RPCs custom).
4. **Equipo de uno + iteración rápida.**

## Decision

Tres decisiones acopladas:

### D1. Multi-query paralela en cliente con merge en memoria

El timeline ejecuta **N queries paralelas a Supabase** (una por tipo
activo), todas con cursor-based pagination sobre `(timestamp_column, id)`
DESC y `limit pageSize`. El cliente mergea los resultados y ordena en
memoria. **No se crea un RPC server-side** que haga `UNION ALL`.

### D2. Estado del timeline en React local (no Zustand store)

El feed del timeline vive en `useState` dentro de un hook custom
`useTimelineQuery({ types, range, search })`. **No se crea un nuevo
Zustand store**, ni se agrega React Query / SWR. Los stores Zustand
existentes siguen siendo source of truth para el estado *reciente*
offline-first; el timeline lee de Supabase directamente para llegar más
atrás en el tiempo.

### D3. Shape unificada `TimelineEvent` (con `meta` libre) en vez de
discriminated union

Todos los tipos de evento se proyectan a una sola interfaz:

```ts
interface TimelineEvent {
  id: string
  type: TimelineEventType
  occurredAt: string
  title: string
  body?: string
  tags: string[]
  meta: Record<string, unknown>
}
```

Los detalles type-specific viven en `meta` con tipo libre. Los renderers
UI no hacen `switch` exhaustivo por tipo (solo para icon + color); los
adapters por tipo (`src/lib/timeline/adapters/*.ts`) son los responsables
de traducir de Supabase a `TimelineEvent`.

## Consequences

### Positive

- **Sin código backend nuevo.** Toda la lógica vive donde ya existe el resto
  del app, manteniendo el stack mínimo (Next.js + Supabase, nada más).
- **Cada tabla usa su propio índice secundario** existente o por crear,
  evitando full-scan de un UNION RPC.
- **HTTP/2 multiplexa las queries.** N queries paralelas terminan en
  ~mismo tiempo que 1, con la ventaja de que cada una usa su plan óptimo.
- **Estado read-only no se duplica en localStorage.** El timeline es
  histórico, lectura pura — no necesita persistir en cliente.
- **Renderers homogéneos.** El feed no necesita un `switch` por tipo en
  cada componente; el shape unificado simplifica `<TimelineFeed>` y
  `<TimelineEventCard>`.
- **Migrar a RPC es refactor localizado al hook** si en una fase posterior
  el throughput se vuelve problema.

### Negative

- **Merge client-side desperdicia rows**: si pedimos 50 por tabla y hay 8
  tipos activos, el cliente recibe ~400 rows y se queda con las primeras
  50 globales. Trade-off: con volumen real esperado (decenas de eventos
  por mes por tabla) esto es <40KB de payload — aceptable. Re-evaluar si
  llegamos a 1000+ rows/tabla.
- **Cursor heterogéneo es delicado**: cada query usa `lt(<su_columna>, cursor)`.
  Si dos eventos comparten timestamp idéntico, el orden secundario por `id`
  no se preserva consistentemente entre tablas. Mitigación: aceptado para
  Fase 3a — colisiones son extremadamente raras con timestamps ISO con
  precisión de milisegundos.
- **Sin cache cross-route**: si en Fase 3b el usuario navega a
  `/timeline` desde `/memory` con un memory ya seleccionado, no podemos
  reusar la data. Aceptado — la URL es la cache de Supabase via su HTTP
  layer.
- **Type safety degradada en `meta`**: el campo es `Record<string, unknown>`,
  el consumidor debe castear. Aceptado por simplicidad del renderer;
  type-specific code vive en los adapters y en los componentes de detalle
  futuro (si los hay).
- **Si Fase 3c agrega audit log con cientos de eventos por entidad**, la
  estrategia multi-query empieza a escalar mal. Aceptado: re-evaluar en
  Fase 3c con números reales.

## Alternatives considered

### Alternativa A1 (D1): RPC server-side con `UNION ALL`

Una sola request, merge en Postgres. Pros: throughput óptimo bajo
volumen alto. Cons: hay que escribir y mantener una función Postgres,
manejar cursors heterogéneos en SQL (date vs timestamptz), y mantenerla
sincronizada con el schema. Para volúmenes esperados en Fase 3a
(decenas-cientos de eventos), el costo de mantenimiento supera el
beneficio. **Reconsiderar en Fase 3c/d si aparece evidencia de
problema.**

### Alternativa A2 (D2): Nuevo Zustand store `useTimelineStore` con persistencia

Tendría la ventaja de cachear cross-route el feed. Pero duplica estado
read-only, agrega complejidad de invalidación (cuándo refetch?) y crece
el bundle de `localStorage` indefinidamente. **Descartado** — el timeline
es de exploración, no de uso operativo continuo.

### Alternativa A3 (D2): React Query / SWR

Solución estándar para data fetching + cache. Pros: invalidación,
revalidación on-focus, dedup de requests. Cons: nueva dependencia,
aprender una API más, y el caso es lo suficientemente simple que
`useState` lo cubre. **Diferido**: si Fase 3b/3c justifica una capa de
cache real (cross-route, embeddings cacheables, etc.) entonces
introducir React Query como dependencia única y migrar
`useTimelineQuery` con ella.

### Alternativa A4 (D3): Discriminated union

```ts
type TimelineEvent =
  | { type: 'memory', /* memory fields */ }
  | { type: 'sleep', /* sleep fields */ }
  | // ...
```

Pros: type safety máxima, autocompletado por tipo en consumers. Cons:
cada componente del feed tendría que hacer `switch` exhaustivo sobre el
tipo. Para 8 tipos heterogéneos eso son ~200 LOC de `switch` por cada
renderer. **Descartado** — el patrón unificado se aplica una vez en el
adapter, no en cada renderer.

## References

- [Issue #69 — Análisis y diseño UI exploración temporal](https://github.com/aaronhuaynate66/sir-v2-life-os/issues/69)
- [`docs/phase-3a/issue-69-analysis-design.md`](../phase-3a/issue-69-analysis-design.md) — documento de diseño completo
- [`src/lib/supabase/sync/`](../../src/lib/supabase/sync/) — patrón de adapters existente que inspira `timeline/adapters/`
- [[0001-zustand-state-management]] — por qué Zustand para state vivo
- [[0002-rich-context-snapshot]] — patrón de agregación read-only (precedente: `buildRichContextSnapshot`)
