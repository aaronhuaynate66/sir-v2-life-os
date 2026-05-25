# SIR V2 — Master Plan (Life OS)

## Estado general

**Última actualización:** Sesión 6 completada
**Mantenimiento:** Manual por ahora. Migración a Living Roadmap System planificada para Sesión 7+.

**Release activo:** Fase 2 — Context & Memory Engine
**Último PR mergeado:** Sesión 6 — Context Snapshot History

---

## Visión del producto

SIR V2 es un Life Operating System que evoluciona en capas progresivas, no por acumulación de features:

SIR Lite (0-12m) → Relational Memory (12-24m) → Behavioral Intelligence (24-36m) → Identity & Alignment (36-60m) → Life Direction (5-10y) → Human OS (10y+)

Activo central: Human Contextual Memory Graph acumulado durante años.
No es: Notion con IA, second brain genérico, productivity app, ni reemplazo de decisiones humanas.

---

## Estado de releases (Fase 1 — SIR Lite)

| Release | Foco | Estado |
|---------|------|--------|
| Fase 0 — Fundamentos | Setup repo, Zustand stores, tipos base | Completado |
| Fase 1 — Stores y dominio | Self, Finance, Goals, Signals, Relationships, Memory | Completado |
| Fase 2 — Context Engine | RichContextSnapshot, hook, panel, persistencia | En curso (~85%) |
| Fase 3 — Memory longitudinal | Persistencia histórica avanzada, búsqueda semántica | Pendiente |
| Fase 4 — UI producción | Reemplazar debug panel con UI real | Pendiente |
| Fase 5 — IA básica | Resúmenes, sugerencias, briefings | Pendiente |

---

## Progreso detallado — Fase 2 (Context Engine)

### Sesiones cerradas

| Sesión | Descripción | PR |
|--------|-------------|-----|
| R4 | Memory System base | (pre-migración) |
| R5.1A | RichContextSnapshot types | (pre-migración) |
| R5.1B | buildRichContextSnapshot builder | (pre-migración) |
| R5.1C | useRichContext hook (estabilización) | #1 |
| Housekeeping | pnpm lockfile + approve builds | #2 |
| R5.1D | RichContextDebugPanel integrado en /dashboard | #3 |
| Fix hydration balance | toLocaleString locale fijo en-US | #4 |
| Fix hydration panel | RichContextDebugPanel client-only mount | #5 |
| R5.1E | Validación runtime end-to-end | (no PR, manual + análisis) |
| R5.1F | Fix relational.activeAlerts + reloj client-only | #6 |
| Sesión 6 | Context Snapshot History (useSnapshotStore, captura por eventos) | (este PR) |

### Sesiones pendientes en Fase 2

| Sesión | Descripción |
|--------|-------------|
| Sesión 7 | Living Roadmap System (auto-sync MASTER_PLAN.md desde issues/PRs) |
| Cierre Fase 2 | Decisión: ¿Fase 3 longitudinal o Fase 4 UI primero? |

---

## Hallazgos y deuda técnica

### Observaciones documentadas (no son bugs, son diseño actual)

1. memory.totalMemories no aumenta con mutaciones desde /dashboard. Las actions del dashboard NO llaman addMemory(). Solo rutas dedicadas lo hacen. Decisión pendiente: agregar addMemory al dashboard o mantener el dashboard como vista rápida sin memoria.

2. signals.topSignalIds no ordena por importancia. buildSignals() hace active.slice(0, 3) sin ordenar previamente. Inconsistente con buildMemory(). Deuda menor.

3. Mutaciones de /self health metric, /goals saveGoal (crear), /relationships editar persona no disparan addMemory(). Diseño actual conservador.

### Deuda técnica pendiente

- Line endings LF↔CRLF entre Windows local y CI Linux. Solución: .gitattributes con * text=auto eol=lf.
- pnpm-workspace.yaml benigno aunque el proyecto no es monorepo activo. Migrable a package.json bajo "pnpm": { "onlyBuiltDependencies": [...] }.
- Cierre runtime de Tests 5-8 (Goals y Relationships desde sus rutas dedicadas). Cerrado con análisis estático en R5.1E pero falta validación humana en navegador.

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 15.1.0 (App Router) |
| State management | Zustand + persist middleware |
| Persistencia local | localStorage |
| Tipos | TypeScript strict |
| Package manager | pnpm 11 |
| Estilo | Tailwind CSS |
| Animaciones | Framer Motion |
| Deploy | Vercel (pendiente conectar) |
| CI | GitHub Actions (type-check + lint + build) |

---

## Workflow de desarrollo

### Modo autónomo establecido (YOLO)

Cada sesión sigue este flujo:
1. git pull origin main
2. pnpm install
3. git checkout -b <tipo>/<nombre>
4. Implementación
5. pnpm type-check && pnpm lint && pnpm build
6. git commit con conventional commits (multi-commit por paso conceptual)
7. git push -u origin <branch>
8. gh pr create --fill
9. gh pr merge --squash --auto
10. Reporte estructurado al usuario

### Excepciones que requieren OK explícito

- SQL destructivo (DROP, DELETE, TRUNCATE)
- Rotación de keys de pagos/identidad (Stripe, Anthropic API, Supabase service_role)
- Cambios a NEXT_PUBLIC_* env vars

---

## Decisiones arquitectónicas tomadas

| # | Decisión | Razón |
|---|----------|-------|
| 1 | Zustand sobre Redux/Jotai | Simplicidad, suficiente para Fase 1 |
| 2 | RichContextSnapshot como agregador | Una sola fuente de verdad para estado vivo |
| 3 | useRichContext con useMemo sobre stores | Reactividad sin re-renders innecesarios |
| 4 | Debug panel client-only | Evita hydration mismatches sin contaminar el hook |
| 5 | Locale en-US fijo en formatos de número | Determinismo SSR/CSR |
| 6 | Memoria solo en rutas dedicadas (no dashboard) | Diseño conservador |
| 7 | useSnapshotStore separado de useMemoryStore | No mezclar contextos puntuales con memoria semántica |
| 8 | Captura por eventos (no cron) | Evita ruido, mantiene historial significativo |

ADRs formales pendientes de crear en docs/decisions/. Tarea de housekeeping futura.

---

## Próxima sesión

Sesión 7 — Living Roadmap System

Objetivo: replicar el sistema de sica-platform en SIR V2 para que MASTER_PLAN.md se auto-genere desde issues, milestones y commits, eliminando mantenimiento manual.

Componentes:
- scripts/generate_roadmap.py o equivalente en TypeScript
- .github/workflows/sync-roadmap.yml
- Backfill: crear issues retroactivos para todas las sesiones cerradas
- Milestones para fases (Fase 0, 1, 2, 3, 4, 5)
- Estructura docs/decisions/ para ADRs

Estimación: 1-2h Claude Code autónomo.

---

Generado manualmente. Próximamente: auto-sync vía Living Roadmap System (Sesión 7).
