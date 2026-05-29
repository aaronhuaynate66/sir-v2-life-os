# SIR V2 — Backlog Canónico

> **Última actualización:** 28/05/2026
> **Source of truth:** este archivo, NO `MASTER_PLAN.md` (regenerado por bot).
> **Cómo usar:** entrá acá cuando quieras decidir qué priorizar en la próxima sesión.

---

## 🎯 EN CURSO

- **Fase 3b — Búsqueda Semántica**: ACTIVA, sin issues asignados.
  - Próximo paso: planning estratégico + crear 3-5 issues operativos.

---

## 🔥 PRÓXIMAS SESIONES (orden definido)

### 1. Captura Báscula (alta prioridad personal)

- Caso de uso real validado (screenshot Xiaomi Mi Scale del 18/05/2026).
- Schema simple: 13 métricas a `health_metrics`.
- Estimación: 1-2 sesiones (~4-6h).
- Costo: ~$1-3/mes (Claude Vision API).
- Stack: Supabase Storage + Claude Vision + UI con preview editable.

### 2. Captura WhatsApp Relaciones (post Báscula)

- Reusa infraestructura de Captura Báscula.
- Schema complejo: extrae mensajes + tono emocional + temas → `relationships.history`.
- Consentimientos: ✅ Diana Carolina (pareja). Otros contactos requieren consentimiento explícito antes de capturar.
- Estimación: 2-3 sesiones (~8-12h).
- Costo: ~$5-15/mes según volumen.

### 3. Issues de Fase 3b (planning estratégico)

- Decidir scope concreto de "Búsqueda Semántica".
- Posibles issues: pgvector setup, embeddings generation, search UI, re-rank, etc.
- Estimación de planning: 30-60 min.

---

## 📦 FASES PLANEADAS Memory Longitudinal (post-Captura)

Sub-fases ya estructuradas como milestones en GitHub.

| Sub-fase | Capacidad | Estado | Esfuerzo estimado |
|----------|-----------|--------|-------------------|
| 3a | Historial Profundo | ✅ CERRADA | (cerrada 28/05) |
| 3b | Búsqueda semántica (pgvector + embeddings) | 🔄 ACTIVA | 3-5 sesiones |
| 3c | Resumen automático de patrones longitudinales | ⬜ Pendiente | 3-4 sesiones |
| 3d | Memoria que aprende (RAG cross-session) | ⬜ Pendiente | 5-8 sesiones |

Timeline aspiracional: Fase 3 entera en 2-3 meses (4-8 semanas activas).

---

## ⏳ PENDIENTES MENORES (no urgentes)

Mejoras incrementales. Hacer cuando aporte valor concreto.

- **Sentry + Vercel Analytics**: observabilidad runtime mínima. Necesario antes de abrir SIR a familia/beta. Esfuerzo: 1-2h.

- **Mobile QA estructurado**: validar flujos críticos en 375px / 390px / 414px / 768px. Esfuerzo: 1h.

- **Estados vacíos pedagógicos**: copy que enseña al usuario qué registrar. Esfuerzo: 1-2h.

- **Emails Supabase template ES**: customizar emails de auth (template HTML + opcional SMTP Resend gratis hasta 3k/mes). Esfuerzo: 15-45 min.

- **Accessibility pass**: fix `aria-describedby` en Sheet (warning detectado en Issue #70). Esfuerzo: 30 min.

- **Gantt fix**: el Gantt del MASTER_PLAN omite la fase activa cuando las previas no tienen due_on. Fix: usar fecha de creación del milestone como fallback. Esfuerzo: 30 min.

- **Toggle privacidad finance en /timeline**: mostrar/ocultar movimientos financieros del feed. Útil si compartís pantalla. Esfuerzo: 30 min.

- **Cap en `relationships.history`**: cuando aparezca volumen >50 items por relación. R7 del ADR 0005. Esfuerzo: 15 min.

- **Robots.txt + noindex meta tag para rutas autenticadas**: hoy todas las páginas son crawlable. Indexar sólo la landing pública (cuando exista) y excluir `/panel`, `/yo`, `/historial`, etc. con `noindex` + `robots.txt`. Esfuerzo: 30 min.

### Mejoras de UX captura (post-merge PR #79 + fix 0006)

Detectadas durante el diagnóstico del 28/05/2026, cuando los upserts de `health_metrics` fallaban silenciosamente y la UI mostraba "8 métricas guardadas" aunque sólo estaban en `localStorage`. La causa raíz (migration 0002 incompleta) se resuelve con migration 0006. Estas dos mejoras son la **defensa-en-profundidad** para que falla silenciosa no vuelva a engañar al usuario.

- **Sync engine: surface push failures al usuario.**
  Hoy `pushWithRetry` en `src/lib/supabase/sync/engine.ts` reintenta 3 veces y, si todas fallan, logea `console.error` y se rinde silencioso. El usuario no se entera de que sus datos no llegaron al DB. Fix: registrar un callback `onSyncFailure(label, op, error)` en el engine y conectarlo a un toast destructivo en `<Sonner>` ("No pude sincronizar tu última métrica. Reintentar?"). Esfuerzo: 1-2h.

- **`persistScaleCapture` no espera ACK del push.**
  `src/lib/capture/scale/client.ts` retorna `{ insertedCount: N }` ni bien hace `setState` — el sync engine procesa el push asíncrono después. Si el push falla, la UI ya pasó al Step 4 "success" con mentira. Fix: agregar arg opcional `awaitSync: boolean` al `persistScaleCapture` que use el callback de arriba para esperar al ACK antes de resolver la promesa. Trade-off: rompe levemente el offline-first (la UI bloquea hasta que el server confirme). Para Captura específicamente, vale la pena porque las 13 métricas son irrecuperables si se pierden. Esfuerzo: 30 min después de tener el callback del punto anterior.

---

## 🔮 IDEAS BRAINSTORM (post-Fase 3, evaluar antes de implementar)

Ideas conversadas pero NO comprometidas. Cada una requiere planning serio antes de arrancar.

### Skills operativas estáticas

- Carpeta `src/skills/` con documentos markdown que el LLM consume como contexto al razonar.
- Ejemplos: `emotional_timing.md`, `relationship_context.md`, `cycle_context_analysis.md`.
- **NO autoeditables.** Versionadas en git, editadas por humanos.
- Diferencia clave vs SkillOpt: humans en el loop SIEMPRE, sin reflection loops automatizados.

### ADR formal "SIR optimiza bienestar, NO engagement"

- Crear ADR-XXXX que establezca este principio como invariante del sistema.
- Aplica a TODA decisión futura (engines, recommendations, capturas, etc.).
- Define explícitamente qué NO está permitido: dark patterns, dependencia afectiva, manipulación, decisiones médicas.

### CodeGraph como tool de productividad

- Evaluar en PoC de 30 min + 1 semana de uso real.
- Indexador AST local con MCP server.
- Ayudaría a Claude Code a entender mejor el monorepo.
- Bajo riesgo, sin lock-in.

---

## ❌ DESCARTADO (con razón documentada)

Cosas evaluadas y conscientemente NO incluidas en el plan. Documentadas para evitar re-evaluar en futuras conversaciones.

| Tecnología/Idea | Razón del descarte |
|-----------------|---------------------|
| **Neo4j** | PostgreSQL/pgvector cubre el caso. Neo4j agrega servidor extra, sync entre DBs, complejidad operacional 10x. Volumen no lo justifica. |
| **TurboVec** | En Alpha. pgvector en Supabase = misma DB, mismo backup, mismo RLS. Sin razón para stack paralelo. |
| **SkillOpt con autoedición** | Riesgo ético alto en dominio emocional. Skills evolutivas que se "optimizan" sobre tu vida sentimental pueden generar dark patterns sutiles emergentes. Usar skills estáticas con human-in-the-loop. |
| **OpenClaw multi-agent** | Premature optimization. Tu sistema con 1 user no necesita orchestration multi-agent. Evaluable en 12+ meses si el sistema crece. |
| **React Native Expo (mobile nativo)** | Web responsive ya funciona en mobile. Construir mobile nativo duplica codebase sin valor agregado actual. |
| **Filter de fixtures en migration 0003** | Decisión consciente: para uso personal NO es problema. Si se abre a otros usuarios, agregar el filtro. |
| **Mock `__fail__` trigger en /timeline** | Útil en Issue #70, eliminado en Issue #71. Partial failure real reemplaza el mock. |
| **Wizard de migración histórica USD→PEN** | Aceptado conscientemente: reinterpretación de movimientos viejos como PEN, asumiendo pérdida histórica mínima. |
| **Sleep quality-9 singleton del 27/05** | Borrado en cleanup del 28/05 (caso 🟡 incierto, asumido como test inicial). |

---

## 📐 PRINCIPIOS FUNDACIONALES

Invariantes del sistema. NO se contradicen por nuevas features.

1. **SIR optimiza bienestar relacional, NO engagement adictivo.**
   Toda recommendation, engine, captura debe servir al wellbeing del usuario, no a métricas de uso.

2. **Local-first + sync transparente.**
   El usuario debe poder usar SIR offline. El sync con Supabase es invisible.

3. **Privacidad por defecto.**
   RLS en todas las tablas. Datos de terceros requieren consentimiento explícito (Diana ya consintió; otros contactos pendientes).

4. **Production-first workflow.**
   Validación vía Vercel preview/production, NO localhost.

5. **Human-in-the-loop para decisiones sensibles.**
   Las skills/engines no pueden modificarse autónomamente. Toda evolución pasa por aprobación humana explícita.

6. **Documentar descartados con razón.**
   Toda idea evaluada y NO incluida se documenta acá. Evita re-evaluar en conversaciones futuras.

---

## 🔗 Referencias

- `MASTER_PLAN.md` → roadmap generado automáticamente por sir-bot.
- `docs/decisions/` → ADRs formales.
- `docs/phase-3a/` → docs específicos de sub-fase 3a (cerrada).
- GitHub Issues → tracking de sesiones operativas.
- GitHub Milestones → fases formales (3a/3b/3c/3d + 5).

---

_Para actualizar este backlog: editar manualmente, commit con mensaje `docs(backlog): <cambio>`. NO depender del sir-bot para mantenerlo._
