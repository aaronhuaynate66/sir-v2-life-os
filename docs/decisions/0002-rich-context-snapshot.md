# 0002. RichContextSnapshot: agregador centralizado para consumir estado vivo

- **Status:** Accepted
- **Date:** 2026-05-22
- **Deciders:** Aaron Huaynate
- **Tags:** architecture, context-engine, state-management
- **Related:** [[0001-zustand-state-management]]

## Context

SIR V2 tiene 7 stores Zustand (Self, Finance, Goals, Signals, Relationships, Memory, Snapshots). Un consumidor típico — el dashboard, el debug panel, en el futuro la capa de IA — necesita una vista compuesta que cruza dominios: balance + alertas activas + goals al día + memoria semántica + timestamp temporal.

Si cada consumidor importa los 7 stores y los combina ad-hoc, ocurren tres problemas:

1. **Duplicación de lógica.** Cada componente que mira el contexto vivo reinventa la composición.
2. **Inconsistencia.** Componente A define "active alerts" como `signals.alerts.filter(a => a.active)`, componente B como `signals.alerts.filter(a => !a.dismissed)`. Divergen.
3. **No hay un punto único para que la IA (Fase 5) consuma estado.** Cuando llegue el momento de mandarle al LLM un blob de contexto, no queremos componerlo dinámicamente desde 7 imports.

## Decision

**Introducir un agregador `buildRichContextSnapshot()`** que toma snapshots de los 7 stores y devuelve un objeto `RichContextSnapshot` con una forma fija y bien tipada:

```ts
{
  self: { ... },
  finance: { balance, recentTransactions, ... },
  goals: { activeCount, atRisk, ... },
  signals: { activeAlerts: string[], topSignalIds, ... },
  relational: { peopleCount, activeAlerts: string[], ... },
  memory: { totalMemories, topMemories, ... },
  temporal: { timestamp, dayOfWeek, ... },
}
```

Los consumidores leen via el hook `useRichContext()` que internamente subscribe a los stores y memoiza el resultado. La forma del snapshot vive en `src/types/context.ts`. El builder vive en `src/lib/context/buildSnapshot.ts`.

## Consequences

### Positive

- **Un solo lugar para definir "el contexto vivo".** Cualquier debate sobre qué campos derivar y cómo se resuelve en `buildSnapshot.ts`, no en cada consumidor.
- **Tipo único para IA.** Cuando Fase 5 agregue summarización, el prompt recibe un `RichContextSnapshot` y ya está.
- **Snapshots históricos triviales.** El [[0004-context-snapshot-history]] guarda exactamente este objeto, sin transformación adicional.
- **Test surface reducida.** Probar `buildSnapshot()` cubre la lógica de agregación; los consumidores solo prueban presentación.

### Negative

- **Una capa más de indirección.** Si solo necesitás `finance.balance`, igual pasás por el snapshot completo. Mitigación: para casos puntuales podés seguir importando el store directo; el snapshot es para vistas compuestas.
- **El builder concentra acoplamiento.** Si agregás un store nuevo, hay que extender el snapshot. Aceptado: es el costo de tener una vista unificada.
- **Re-render del snapshot completo.** Aunque `useMemo` ayuda, cualquier cambio de cualquier store rebuildea el snapshot. Para consumidores que solo quieren un slice, eso es desperdicio. Mitigación: el hook expone slices via selectores.

## Alternatives considered

### Alternativa A: Cada consumidor lee los stores que necesita

**Por qué no:** divergencia inevitable + sin punto único para IA. Es el problema que motiva esta decisión.

### Alternativa B: Store raíz que combina los 7 sub-stores

**Por qué no:** mata el modelo de Zustand (stores independientes con persist por dominio). Además fuerza un cambio global cuando cualquier dominio cambia.

### Alternativa C: Context API React con el snapshot

**Por qué no:** sin selectores fine-grained, cualquier consumidor del Context re-renderiza con cualquier cambio. El hook con useMemo es más performant.

## References

- `src/types/context.ts` — definición del tipo `RichContextSnapshot`
- `src/lib/context/buildSnapshot.ts` — implementación del builder
- `src/lib/context/useRichContext.ts` — hook consumidor
- [[0003-client-only-debug-panel]] — primer consumidor del snapshot
- [[0004-context-snapshot-history]] — persistencia histórica del snapshot
