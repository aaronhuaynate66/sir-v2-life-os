# 0001. Zustand como gestor de estado global en SIR V2

- **Status:** Accepted
- **Date:** 2026-05-20
- **Deciders:** Aaron Huaynate (founder / sole maintainer)
- **Tags:** infra, dx, state-management, frontend

## Context

SIR V2 es un Life OS construido en Next.js 15 (App Router) que necesita compartir estado entre varias rutas (`/dashboard`, `/self`, `/finance`, `/goals`, `/relationships`, `/memory`) y mantener persistencia local (sin backend en Fase 1). El estado vive en dominios separados: Self (vitales, mood), Finance (transacciones, balance), Goals (objetivos activos), Signals (alertas), Relationships (personas), Memory (entradas semánticas).

Restricciones:

1. **Fase 1 sin backend.** Todo persiste en `localStorage`. La librería debe tener middleware de persistencia confiable.
2. **Equipo de uno.** No hay ancho de banda para mantener boilerplate de Redux ni para diseñar atoms en Jotai.
3. **Selectores fine-grained.** El dashboard lee de varios stores; necesitamos evitar re-renders cuando un store irrelevante cambia.
4. **SSR compatible.** Next.js 15 con App Router renderiza en servidor; la librería no puede asumir `window`.

## Decision

**SIR V2 usa Zustand** como gestor de estado global, con el middleware `persist` para serializar a `localStorage`. Cada dominio tiene su propio store (`useSelfStore`, `useFinanceStore`, `useGoalsStore`, `useSignalsStore`, `useRelationshipsStore`, `useMemoryStore`, `useSnapshotStore`). No hay un store raíz que los combine — el agregador es `buildRichContextSnapshot()` que los compone en lectura (ver [[0002-rich-context-snapshot]]).

## Consequences

### Positive

- **Boilerplate mínimo.** Un store son ~30 líneas: state + actions + persist config.
- **Selectores nativos.** `useFinanceStore(s => s.balance)` solo re-renderiza cuando `balance` cambia.
- **Persistencia gratis.** `persist({ name: "sir-finance" })` y listo. No hay que escribir hidratación manual.
- **TypeScript first-class.** Sin tipos generados ni `Provider<T>` envolviendo todo.
- **SSR-safe.** Zustand v4+ no rompe en servidor; el middleware persist hidrata client-side.

### Negative

- **Sin DevTools tan rico como Redux.** Zustand tiene un middleware `devtools` pero el ecosistema no es comparable. Mitigación: para SIR V2 en Fase 1, el RichContextDebugPanel cumple el rol de inspector.
- **Patrón de uso depende del equipo.** Sin RTK Query u opinions fuertes, dos personas pueden escribir stores muy distintos. Mitigación: equipo de uno; las convenciones se fijan en el primer store.
- **Si en Fase 3+ aparecen mutaciones server-driven (Supabase realtime), `persist` solo no alcanza.** Habrá que agregar sync layer. Aceptado: ese problema es de Fase 3, no de hoy.

## Alternatives considered

### Alternativa A: Redux Toolkit

**Por qué no:** boilerplate desproporcionado para un Life OS sin backend. RTK Query brillaría con un API, pero en Fase 1 no hay API.

### Alternativa B: Jotai

**Por qué no:** modelo de atoms es elegante pero exige diseñar el grafo de dependencias antes de escribir features. Para iterar rápido en Fase 1, los stores opacos de Zustand son más directos.

### Alternativa C: React Context + useReducer

**Por qué no:** sin selectores fine-grained, cualquier cambio re-renderiza a todos los consumidores. En el dashboard que mira a 6 stores eso es performance death.

### Alternativa D: TanStack Query

**Por qué no:** TanStack es server-state, no client-state. En Fase 3 cuando haya backend lo evaluamos como complemento.

## References

- [Zustand docs](https://github.com/pmndrs/zustand)
- `src/store/*` — los 7 stores implementados
- [[0002-rich-context-snapshot]] — cómo se agregan los stores para lectura
