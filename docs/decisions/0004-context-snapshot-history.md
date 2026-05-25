# 0004. Context Snapshot History: store separado y captura por eventos

- **Status:** Accepted
- **Date:** 2026-05-25
- **Deciders:** Aaron Huaynate
- **Tags:** architecture, persistence, context-engine, memory
- **Related:** [[0002-rich-context-snapshot]], [[0001-zustand-state-management]]

## Context

Tener el snapshot vivo es suficiente para mostrar estado actual, pero no responde preguntas longitudinales: "¿cómo estaba mi balance hace 3 semanas cuando creí el goal X?", "¿qué alertas tenía activas cuando registré ese mood?". Para eso necesitamos **historial de snapshots**.

Dos preguntas de diseño:

### Pregunta 1: ¿Mismo store que Memory o store aparte?

`useMemoryStore` ya existe y guarda entradas semánticas escritas por el usuario o derivadas por la app ("agregaste un gasto grande hoy"). Mezclar snapshots ahí parece tentador pero rompe el contrato del store:

- Memory entries son **textuales y curadas** (alta señal, baja frecuencia).
- Snapshots son **estructurados y de alta frecuencia** (objeto completo de contexto, cada vez que algo material cambia).

Mezclarlos contamina las queries: una busqueda "memorias relacionadas a finanzas" devolvería snapshots crudos que no son memorias en el sentido semántico.

### Pregunta 2: ¿Captura por cron (cada X minutos) o por eventos (cuando algo cambia)?

Cron tiene ventajas (regularidad temporal) pero produce mucho ruido: 95% de los snapshots cron serían idénticos al anterior. El storage local crece sin aportar señal.

Captura por eventos guarda solo cuando hay cambio material: nuevo goal, mutación financiera grande, alerta nueva, etc. Cada snapshot tiene **significado** porque marca un punto de inflexión.

## Decision

Crear `useSnapshotStore` **separado** de `useMemoryStore`, con:

- Estructura: array de `{ snapshot: RichContextSnapshot, capturedAt: ISO, trigger: string }`.
- Persistencia: middleware `persist` con su propia key `sir-snapshots`.
- Tamaño máximo: bounded (ej. últimos 200 snapshots, con eviction FIFO). Evita crecer indefinidamente.

**Captura por eventos**, no por cron. Los triggers en Sesión 6:

- Nueva entrada financiera grande (> threshold)
- Goal creado, completado, o cancelado
- Alerta de señal activada
- Memoria nueva agregada
- (lista extensible en sesiones futuras)

El call site es el action del store correspondiente: después de mutar, dispara `useSnapshotStore.getState().capture("goal-created")`.

## Consequences

### Positive

- **Separación limpia de contratos.** Memory sigue siendo curada y semántica; Snapshots son estructurados y temporales. Cada uno escalará distinto.
- **Sin ruido.** Cada snapshot guardado tiene una razón. Si en seis meses el array tiene 50 entradas en lugar de 50.000, las 50 son útiles.
- **Replay determinístico.** Con el array de snapshots se puede reconstruir el estado de la app en cualquier punto. Útil para Fase 5 (IA: "compara esta semana con la anterior").
- **No requiere worker ni cron.** La captura sucede en línea con la mutación; cero infraestructura adicional.

### Negative

- **Capturas perdidas si el código que muta no llama a `capture()`.** Aceptado: el patrón es explícito por diseño. Trade-off vs. cron es haber elegido señal sobre cobertura.
- **El usuario puede tener un cambio relevante que no dispara captura** porque no está en la lista de triggers. Mitigación: la lista es extensible y vive en código; agregar un trigger es PR de 3 líneas.
- **Bounded array significa que en el muy largo plazo se pierde historia.** Mitigación: para SIR V2 en Fase 1, 200 snapshots cubren meses de uso normal. Fase 3 (Memory Longitudinal) traerá el archivo a backend con retención indefinida.

## Alternatives considered

### Alternativa A: Guardar snapshots dentro de `useMemoryStore`

**Por qué no:** contamina semántica de Memory. Las queries de memoria devolverían objetos crudos. Memory es texto curado, Snapshots es estructura cruda.

### Alternativa B: Cron cada N minutos

**Por qué no:** 95% son duplicados sin valor. El storage crece sin aportar señal. Además requiere un setInterval cliente-side que no sobrevive recargas — habría que pensar en `setInterval` + `visibilitychange` + límites.

### Alternativa C: Snapshot solo on-demand (botón "guardar contexto")

**Por qué no:** depende de disciplina del usuario. La idea es que el sistema observe cambios materiales sin pedir acción.

### Alternativa D: Server-side capture (futuro Supabase)

**Por qué no aún:** sin backend en Fase 1. Cuando llegue Fase 3 (Memory Longitudinal) este store se sincronizará a servidor; hoy el contrato local es suficiente.

## References

- `src/store/useSnapshotStore.ts` — implementación
- `src/lib/context/captureTriggers.ts` — call sites desde otros stores
- PR #7 (Sesión 6) — introducción de la pieza
- [[0002-rich-context-snapshot]] — qué objeto se guarda
- [[0001-zustand-state-management]] — por qué Zustand puede tener N stores independientes
