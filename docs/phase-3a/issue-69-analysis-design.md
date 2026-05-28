# Fase 3a · Issue #69 — Análisis y diseño UI exploración temporal

> **Status:** Draft for review
> **Issue:** [#69](https://github.com/aaronhuaynate66/sir-v2-life-os/issues/69)
> **Phase:** 3a — Historial Profundo
> **Gate de salida:** Documento aprobado → arranca Issue [#70](https://github.com/aaronhuaynate66/sir-v2-life-os/issues/70) (implementación)

Este documento es **diagnóstico + diseño**, no código. Cierra el primer issue
operativo de Fase 3a y deja todas las decisiones técnicas grabadas para que
la implementación en #70/#71 no requiera revisitar tradeoffs.

---

## 1. Inventario de datos longitudinales en Supabase

Schema vigente: migraciones `0001_initial_schema.sql`, `0002_text_ids.sql`,
`0003_currency_support.sql`. RLS activo en todas las tablas — todo query
filtra por `auth.uid()` automáticamente.

### 1.1 Tablas con datos longitudinales (sync'd via `attachSupabaseSync`)

| Tabla              | Columna temporal canónica       | Tipo de data                                    | Vol/mes esperado |
|--------------------|---------------------------------|-------------------------------------------------|------------------|
| `memories`         | `occurred_at` (también `last_accessed`, `created_at`) | Recuerdos del sistema (episodic/semantic/etc.) | 30–100 |
| `self_metrics`     | `measured_at`                   | energy/mood/stress/focus/motivation/confidence  | 30–60 (1–2/día) |
| `health_metrics`   | `measured_at`                   | weight/BP/heart rate/steps/calories/hydration   | 0–30 (opcional) |
| `sleep_records`    | `date`                          | Sueño diario con bedtime/quality/dreams         | ~30 (1/día) |
| `finance_movements`| `date`                          | Ingresos, gastos, inversiones, deudas           | 20–80 |
| `signals`          | `detected_at` (también `expires_at`) | Señales del entorno (manual + futuros conectores) | variable (5–50) |
| `goals`            | `created_at`, `updated_at`, `target_date` | Estado actual del objetivo (no historial de cambios) | bajo |
| `people`           | `created_at`, `updated_at`, `last_contact` | Personas en la red                              | bajo |
| `relationships`    | `created_at`, `updated_at`, `next_action_date`, + `history` jsonb | Estado de la relación + historial inline       | bajo (entity) / medio (history) |

### 1.2 Tablas auxiliares (fuera de scope para timeline)

| Tabla        | Razón de exclusión                                                                 |
|--------------|------------------------------------------------------------------------------------|
| `profiles`   | 1 fila por usuario — metadata, no evento.                                          |
| `snapshots`  | Schema existe pero `useSnapshotStore` queda **client-only** desde sesión 20c. El historial real de snapshots vive en `localStorage`; no se sincroniza a Supabase. Si la fase 3c/d necesita queries sobre snapshots, primero hay que activar su sync. |

### 1.3 Stores client-only (fuera del historial Supabase)

- `useSnapshotStore` — historial de RichContextSnapshots, `localStorage` only.
- `useRecommendationStore` — recomendaciones generadas en runtime; ephemeral.

Estos no aparecen en el timeline de Fase 3a. Si en una iteración futura
hace falta verlos longitudinalmente, hay que decidir si subir su sync a
Supabase o levantar un endpoint dedicado.

### 1.4 Naturaleza de cada fuente: "evento" vs "entidad"

Distinción crítica para el diseño del feed:

- **Eventos puros** — cada fila es algo que pasó en un momento:
  `memories`, `self_metrics`, `health_metrics`, `sleep_records`,
  `finance_movements`, `signals`.
  → Surgen al feed directamente.

- **Entidades con estado actual** — la fila representa el "ahora" de un
  ente, no un evento histórico:
  `goals`, `people`, `relationships`.
  → Surgen al feed solo en momentos clave: **creación** (`created_at`),
  **última actualización** (`updated_at`). No tenemos audit log; no podemos
  reconstruir transiciones intermedias (ej. "progreso pasó de 30% a 50%").

- **Caso especial — `relationships.history`** — es un `jsonb` array de
  `RelationshipEvent { id, description, emotionalTone, date, type }`.
  **Es un audit log inline**. Cada elemento se desempaqueta como un evento
  del feed con la fecha que trae. Es la única fuente histórica densa que
  tenemos del lado relacional.

---

## 2. Diseño UI/UX

### 2.1 Nombre de ruta

Las rutas existentes son todas en inglés (`/dashboard`, `/goals`, `/memory`,
`/finance`, `/self`, `/relationships`, `/signals`), aunque los labels de Nav
son en español. Para consistencia de routing:

**Recomendación: `/timeline`.**

Trade-off: el usuario final ve el label en español ("Historial" o
"Línea de tiempo" en el Nav), pero la URL queda alineada con el resto del
app. Cambiar todas las rutas a español es scope mayor — no entra acá.

### 2.2 Variante de vista — evaluación

| Opción | Pro | Contra | Veredicto |
|---|---|---|---|
| A. Timeline vertical infinito (Twitter-like) | Familiar, scroll natural, mobile-first | Pierde anclaje temporal preciso si no hay scrubber | Bueno como base |
| B. Calendario mensual + drill-down a día | Navegación temporal explícita | Menos eventos visibles, sensación "calendar app" | Demasiado calendar-app para un OS |
| C. Timeline horizontal con zoom (día→año) | Visualización longitudinal real, sexy | Complejo, requires custom canvas, mobile penoso | Demasiado costo |
| **D. Híbrido — vertical infinito + period selector arriba** | Balance entre familiaridad y control temporal | Más componentes, pero todos shadcn estándar | **Elegida** |

**Decisión:** Opción D — timeline vertical con scroll infinito + un
**period selector** sticky arriba que cambia el rango de query.

Justificación:
1. Mobile responsive sin gymnastics (el feed vertical es nativo en touch).
2. Scroll = exploración fluida; selector = exploración dirigida.
3. Componentes shadcn ya en el stack (Card, Select, Date picker, Tabs, Badge).
4. Es el patrón mental más cercano a "ver mi vida en orden cronológico".

### 2.3 Filtros (en el sticky header de la página)

| Filtro | Tipo de control | Default | Notas |
|---|---|---|---|
| **Rango temporal** | Tabs con presets + custom date range | `30 días` | Presets: Hoy / 7d / 30d / 90d / 1y / Todo / Custom |
| **Tipos de evento** | Multi-select con checkboxes (icono+label) | Todos activos | 8 categorías (ver §2.4) |
| **Búsqueda textual** | Input con `ilike '%query%'` server-side | vacío | Solo en campos textuales (`content`, `title`, `description`, `notes`); búsqueda semántica es Fase 3b |
| ~~Por persona~~ | (Futuro) | — | Diferido a iteración: cross-table requiere joins selectivos |
| ~~Por goal~~ | (Futuro) | — | Mismo motivo |

### 2.4 Tipos de evento — 8 categorías

| # | type | Fuente Supabase | Icon (lucide) | Color tag |
|---|---|---|---|---|
| 1 | `memory` | `memories` | `BookOpen` | violet |
| 2 | `self_metric` | `self_metrics` | `Brain` | emerald |
| 3 | `health` | `health_metrics` | `Heart` | rose |
| 4 | `sleep` | `sleep_records` | `Moon` | indigo |
| 5 | `finance` | `finance_movements` | `Wallet` | amber |
| 6 | `signal` | `signals` | `Bell` | sky |
| 7 | `goal_event` | `goals` (created_at + updated_at) | `Target` | primary (coral) |
| 8 | `relational_event` | `people.created_at` + `relationships.history` (unpacked) | `Users` | blue |

`goal_event` solo emite 2 eventos por goal: creación y última actualización.
Sin audit log, no podemos hacer mejor.

### 2.5 Diseño de cada evento en el feed (mockup textual)

Card compacta, padding `p-4`, separador `border-b`, mobile-friendly:

```
┌─────────────────────────────────────────────────────────┐
│  [icon]  [TIPO]  hace 2 días · 15 may 2026 19:23        │
│                                                          │
│  Título corto del evento                                 │
│  Detalle resumido (1-2 líneas, truncado con ellipsis)    │
│                                                          │
│  [tag1] [tag2]                              [→ detalle] │
└─────────────────────────────────────────────────────────┘
```

**Mockups por tipo:**

```
🧠  SELF METRIC   ayer · 14:30
    Energía 4/10
    Nota: "Cansado después de la reunión larga"
    [energy]                                  [→]

🌙  SLEEP         hace 2 días · 23:30 → 07:15
    7.75h · calidad 8/10
    Sueños: "Volaba sobre Lima"                [→]

💰  FINANCE       hace 3 días · gasto
    -S/120.00 · Almuerzo equipo
    [food] [business]                         [→]

🔔  SIGNAL        hace 5 días · urgencia: soon
    LinkedIn: nueva conexión con ex-compañero PUCP
    Significado: oportunidad de reconectar
    [linkedin] [opportunity]                  [→]

📖  MEMORY        16 abr 2026 · episodic
    "Primera reunión con cliente nuevo"
    Importancia 8/10 · carga emocional +3.0
    [trabajo] [hito]                          [→]

🎯  GOAL          15 abr 2026 · creado
    "Lanzar SIR V2 a producción"
    Prioridad: high · categoría: career       [→]

👥  RELATIONSHIP  10 abr 2026 · evento positivo
    María: "Café largo después del trabajo"
    Tono emocional: +7
    [milestone]                               [→]
```

El botón `[→]` es opcional: solo aparece si existe una ruta dedicada para
ese tipo (`/memory/:id`, `/finance/:id`, etc.). En esta fase la mayoría
no la tiene — el click es no-op por defecto. Decidir en #70 si vale la
pena rutear o si el detalle se expande inline.

### 2.6 Estados de la vista

| Estado | UI |
|---|---|
| Loading | `RouteSkeleton cards={4}` (patrón ya usado en /goals, /memory, etc.) |
| Vacío | Card centrada con icono `Calendar`, texto "Aún no hay eventos en este rango" + sugerencia "Probá expandiendo el rango temporal" |
| Error | Card con icono `AlertTriangle`, mensaje + botón "Reintentar" |
| Abundante | Infinite scroll: al llegar al final, intersection observer dispara la siguiente página |

### 2.7 Mobile (viewport 375px)

- Header sticky colapsado: chip de "Rango: 30d" + chip "8 tipos" + botón
  `Filter` que abre un `Sheet` (drawer) lateral con los filtros completos.
- Cards a ancho completo, `px-4 py-3`, sin sombra.
- Tipografía: título `text-sm`, body `text-xs`, mucho `text-muted-foreground`.
- Touch target mínimo 44px (los chips clickables y el botón Filter).
- No hay hover states; sí focus visibles para tab nav.
- El intersection observer carga la siguiente página cuando faltan ~3 cards
  visibles, evitando "loading spinner al final" en scroll lento.

---

## 3. Decisiones técnicas clave

### 3.1 Paginación — **cursor-based**

- **Clave del cursor:** tupla `(occurred_at, id)` ordenando DESC.
- **Tamaño de página:** 50 eventos.
- **UX:** infinite scroll con intersection observer (mobile-friendly).
- **Stable bajo inserts:** offset-based saltaría/duplicaría filas cuando un
  evento nuevo entra mid-scroll; cursor no.

### 3.2 Estrategia de query — **N queries paralelas en cliente, merge en memoria**

El timeline mezcla hasta 8 tipos de evento de 9 tablas distintas. Dos
caminos posibles:

| Opción | Pros | Contras |
|---|---|---|
| **A. N queries paralelas** (1 por tabla activa) merged client-side | Cada query usa su índice existente. PostgREST simple. Sin RPC custom. HTTP/2 multiplexa. | Cliente hace `Array.merge + sort`. Si N tablas tienen 50 rows = 400 rows en memoria. |
| B. RPC server-side con UNION ALL | Una sola request. Merge en Postgres (más rápido). | Hay que escribir y mantener el RPC. Cambio de schema = cambiar la función. Cursor con tuplas heterogéneas (date vs timestamp) es delicado. |

**Decisión: Opción A** para Fase 3a.

Justificación:
1. Cada tabla ya tiene índice `(user_id, <timestamp> desc)` para 6 de las 9
   tablas (faltan 3 — ver §3.6).
2. Volumen real esperado: con 50 eventos por tabla en la primera página, el
   merge es trivial (~400 items sorting in ~1ms).
3. Cero código backend. Toda la lógica vive en el cliente Next.js, lo que
   matchea la arquitectura existente.
4. Si el throughput se vuelve problema en Fase 3c/d, migrar a un RPC es
   refactor localizado al `useTimelineQuery` hook.

**Implementación esperada en #70/#71:**

```ts
// pseudocódigo
const queries = activeTypes.map(type => buildQueryForType(type, cursor, pageSize))
const results = await Promise.all(queries)
const merged = mergeAndSortByTimestamp(results.flat())
const page = merged.slice(0, pageSize)
const nextCursor = page[page.length - 1]?.occurredAt
```

### 3.3 Estado en cliente — **NO nuevo Zustand store**

El timeline es **read-only historical view**. No tiene sentido duplicar el
estado en `localStorage`. Approach:

- Hook custom `useTimelineQuery({ types, range, search })` que devuelve
  `{ events, isLoading, error, loadMore, hasMore }`.
- Internamente: `useState` para el array, `useEffect` para la primera
  carga, función `loadMore` que extiende el array.
- **No agregar React Query / SWR** en este momento. El caso es lo
  suficientemente simple que no justifica la dependencia. Si en Fase 3b
  o 3c aparece sharing de cache cross-route, re-evaluar.
- Los stores existentes (`useMemoryStore`, `useFinanceStore`, etc.) siguen
  siendo source of truth para el estado *reciente* (offline-first). El
  timeline lee de Supabase directamente para llegar más atrás de lo que
  caché en `localStorage`.

### 3.4 Server-side vs client-side rendering

- **Client component (`'use client'`)** + hydration gate
  (`useHasHydrated` o equivalente).
- Razón: las queries dependen de la sesión Supabase del cliente; SSR
  requeriría pasar el access token al server, complicando. Mantenemos el
  patrón ya establecido en `/memory`, `/goals`, etc.
- Trade-off: LCP marginalmente peor que SSR. Para una vista de exploración
  ese trade-off es aceptable — el usuario llega por intención, no por
  bounce.

### 3.5 Tipos TypeScript — **shape unificada con `meta`**

Discriminated union daría máxima type safety por tipo, pero forzaría a la
UI a un `switch` exhaustivo por tipo en cada componente. Para un feed que
renderiza heterogéneo, una shape común es más ergonómica:

```ts
type TimelineEventType =
  | 'memory'
  | 'self_metric'
  | 'health'
  | 'sleep'
  | 'finance'
  | 'signal'
  | 'goal_event'
  | 'relational_event'

interface TimelineEvent {
  /** ID estable: `${type}:${sourceId}` (o `:${sourceId}:${subIndex}` para
   *  relationship history items, que comparten el id de su relationship). */
  id: string
  type: TimelineEventType
  /** Timestamp canónico ISO 8601 (clave de orden DESC). */
  occurredAt: string
  /** Título corto, ya formateado en español. */
  title: string
  /** Detalle opcional (1-2 líneas máx). */
  body?: string
  /** Tags visibles como chips. */
  tags: string[]
  /** Data type-specific. Forma libre. Para la primera versión es lectura;
   *  el detalle queda para la versión 2 del componente. */
  meta: Record<string, unknown>
}
```

Conversión de cada fila Supabase a `TimelineEvent` vive en un
**`timelineAdapter`** por tipo (espejo del patrón `attachSupabaseSync`).
Los adapters quedan en `src/lib/timeline/adapters/`.

### 3.6 Índices necesarios — **algunos faltan**

Verificado contra `0001_initial_schema.sql`:

| Tabla | Índice existente | Suficiente para timeline DESC? |
|---|---|---|
| `memories` | `(user_id, occurred_at desc)` | ✅ |
| `self_metrics` | `(user_id, measured_at desc)` | ✅ |
| `health_metrics` | `(user_id, measured_at desc)` | ✅ |
| `sleep_records` | `(user_id, date desc)` | ✅ |
| `finance_movements` | `(user_id, date desc)` | ✅ |
| `signals` | `(user_id, resolved, urgency)` | ❌ **falta `(user_id, detected_at desc)`** |
| `goals` | `(user_id, status)`, `(user_id, priority)` | ❌ **falta `(user_id, updated_at desc)`** y `(user_id, created_at desc)` |
| `people` | `(user_id, last_contact)` | ❌ **falta `(user_id, created_at desc)`** |
| `relationships` | `(user_id, person_id)`, `(user_id, status)` | ❌ **falta `(user_id, updated_at desc)`** |

**Acción:** crear migration `0004_timeline_indexes.sql` en **Issue #71**
(cuando ya tengamos las queries reales y validamos costo en EXPLAIN). Es
prematuro crearla acá sin medir.

### 3.7 Búsqueda textual

- Implementación Fase 3a: `ilike '%query%'` aplicado a los campos textuales
  relevantes por tabla:
  - `memories`: `title`, `content`
  - `self_metrics`/`health_metrics`/`sleep_records`: `note` / `dreams` / `notes`
  - `finance_movements`: `description`
  - `signals`: `content`, `meaning`
  - `goals`: `title`, `description`
- **Sin índice full-text en Fase 3a.** Performance esperada: pg.ilike sobre
  pocos miles de filas con filtro de `user_id` adelante = aceptable.
- Si la latencia crece, evaluar `pg_trgm` o `tsvector` en Fase 3b (donde
  ya se va a tocar el motor de search profundamente con embeddings).

---

## 4. Queries planeadas (esqueleto)

> El código real va en #71. Acá quedan los **shapes** y el **ordering** para
> que el implementador no piense de cero.

### 4.1 Per-type query template

```ts
// signals — ejemplo con todas las dimensiones
supabase
  .from('signals')
  .select('id, content, meaning, source, type, urgency, strength, detected_at, related_persons, related_goals')
  .order('detected_at', { ascending: false })
  .lt('detected_at', cursor.timestamp) // omitir en la primera página
  .ilike('content', search ? `%${search}%` : '%')
  .limit(pageSize)
```

### 4.2 Merge cliente

```ts
const merged = [...memoryEvents, ...sleepEvents, /*...*/]
  .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  .slice(0, pageSize)
```

### 4.3 Unpack `relationships.history`

```ts
// Después de fetch de relationships, expandir cada history item a un evento
const relationalEvents = relationships.flatMap(r =>
  r.history.map((h, idx) => ({
    id: `relational_event:${r.id}:${h.id ?? idx}`,
    type: 'relational_event' as const,
    occurredAt: h.date,
    title: `${peopleById[r.personId]?.name ?? '—'}: ${h.description}`,
    tags: [h.type],
    meta: { ...h, personId: r.personId },
  }))
)
```

---

## 5. Riesgos identificados

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | El `relationships.history` `jsonb` no tiene tamaño máximo. Si crece a >1000 items por relación, el unpack se vuelve pesado. | Acotar a los últimos 50 items por relación en la fase 3a; iterar si hace falta. |
| R2 | Sin índices en `signals.detected_at`, `goals.updated_at`, `people.created_at`, `relationships.updated_at`, las queries pueden table-scan con muchos datos. | Crear migration 0004 en Issue #71 con `EXPLAIN ANALYZE` antes/después. |
| R3 | Multi-query paralela puede saturar el rate limit de Supabase con muchos filtros activos (8 queries simultáneas por scroll). | Pool de Supabase es generoso por defecto. Si aparece throttling, evaluar batch RPC. |
| R4 | Cursor `(occurred_at, id)` heterogéneo entre tablas requiere serializar/deserializar con cuidado. | El cursor del cliente guarda el `occurredAt` del último evento merged. Cada query usa `lt(<su columna>, cursor)`. Probado en #70 con fixtures. |
| R5 | Volumen de datos en producción es bajo todavía (~38 issues, días de uso). El diseño está optimizado para 6-12 meses de datos, no años. | Aceptado. Re-evaluar performance cuando se acerque 1 año de uso real. |
| R6 | Ningún store actual emite eventos cuando se *edita* o *borra* algo — el timeline mostraría solo `created_at`/`updated_at`. Las ediciones intermedias se pierden. | Aceptado para Fase 3a. Si Fase 3c necesita audit log, agregar tabla `audit_events` ahí. |

---

## 6. ADR vinculado

Las decisiones arquitectónicas principales quedan en
[`docs/decisions/0005-timeline-architecture.md`](../decisions/0005-timeline-architecture.md)
(creado en este mismo PR). El ADR cubre:

1. Multi-query paralela vs RPC UNION.
2. Estado del timeline en React local vs nuevo Zustand store.
3. Shape unificada de `TimelineEvent` vs discriminated union.

---

## 7. Próximos pasos hacia Issue #70

Issue #70 ya está mapeado. Cuando este PR mergee y arranque #70:

1. **Crear la ruta `/timeline`** — `src/app/timeline/page.tsx`, client
   component, AppShell wide, hydration gate.
2. **Crear los adapters** `src/lib/timeline/adapters/*.ts` (1 por tipo)
   transformando cada fila Supabase en `TimelineEvent`.
3. **Crear el hook** `useTimelineQuery` con la lógica de §3.2 + §3.3.
4. **Crear los componentes UI**:
   - `<TimelineFeed>` — render del array.
   - `<TimelineEventCard>` — render de 1 evento (con switch por tipo solo
     para el icono y el color del tag).
   - `<TimelineFilters>` — period selector + type multi-select + search.
5. **Con fixtures primero** — la lista mock se prueba antes de tocar
   Supabase. La conexión real es Issue #71.
6. **Type-check + lint + build** verdes obligatorios antes del PR de #70.

---

## 8. Checklist de aprobación de este documento

Antes de mergear este PR (Issue #69), confirmar:

- [ ] El usuario validó el inventario de §1 (no falta ninguna tabla).
- [ ] El usuario confirmó la variante de vista (Opción D — híbrido).
- [ ] El usuario aceptó las decisiones técnicas (§3): paginación cursor,
      multi-query paralela, sin nuevo store, shape unificada.
- [ ] El usuario aceptó los índices faltantes documentados en §3.6 (se
      crean en #71, no acá).
- [ ] El usuario revisó los riesgos de §5.

Si algo del checklist queda en rojo: comentario en el PR, ajuste, re-review.
Si todo verde: merge → arranca #70.

---

## 9. External Review Notes

This design document received external technical review. Six observations
(4 must-design behaviors + 2 implementation details) were incorporated
into [ADR 0005 § Implementation Notes](../decisions/0005-timeline-architecture.md#implementation-notes-from-external-review).
They do not change the architectural decisions D1–D3, but they pin down
behaviors the original design left implicit. Four additional risks
(R7–R10) were appended.

**Implementation of Issue #70 must honor those constraints** —
specifically: partial query failure semantics, ISO 8601 validation in
`relationships.history`, `AbortController`-based cancellation in
`useTimelineQuery`, and differentiated empty-state messaging.

---

_Documento mantenido junto a la rama `feat/3a-issue-69-analysis-design`._
_Cierra Issue #69 cuando el PR se mergea._
